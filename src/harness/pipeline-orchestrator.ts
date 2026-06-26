import * as fs from "fs";
import * as path from "path";
import { applyPatch } from "./patch-handler";
import { PlannerOutputSchema, ExecutorOutputSchema } from "./pipeline-contracts";
import type { PipelineState, PipelineRun, FailureRecord, PlanStep, PipelineErrorType } from "./pipeline-types";
import { buildErrorSignature } from "./pipeline-error-utils";
import { createInitialPipelineRun } from "./pipeline-factories";

export interface OrchestratorConfig {
  plannerModel: string;
  executorModel: string;
  fixerModel: string;
  maxRepairAttempts: number;
  tracePath?: string;
}

/**
 * Allowed state transitions.
 * Only listed targets are valid for each source state.
 */
const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  planning: ["executing", "failed"],
  executing: ["verifying_step", "repairing", "failed"],
  verifying_step: ["executing", "verifying_final", "repairing", "failed"],
  repairing: ["executing", "failed"],
  verifying_final: ["done", "repairing", "failed"],
  done: [],
  failed: [],
};

/**
 * PipelineOrchestrator — Runtime controller for the Multi-Model PEVF pipeline.
 *
 * Responsibilities:
 * - Hold authoritative pipeline state
 * - Enforce legal state transitions
 * - Track failure records and repair attempt limits
 * - Detect repeated identical failures for anti-loop guardrails
 * - Coordinate E2E execution with structured IO contracts and stubs
 * - Write run traces to artifacts for developer-level debugging
 */
export class PipelineOrchestrator {
  private state: PipelineState = "planning";
  private runState: PipelineRun;
  private config: OrchestratorConfig;
  private traceEvents: Record<string, unknown>[] = [];

  constructor(userPrompt: string, config: OrchestratorConfig) {
    this.config = config;
    this.runState = createInitialPipelineRun(userPrompt);
  }

  public getState(): PipelineState {
    return this.state;
  }

  public getRunState(): PipelineRun {
    return this.runState;
  }

  /**
   * Transition to a new state.
   * Throws if the transition is not allowed by the state machine graph.
   */
  public transitionTo(newState: PipelineState): void {
    const allowed = VALID_TRANSITIONS[this.state];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${newState}`);
    }
    this.state = newState;
    this.runState.state = newState;
  }

  /**
   * Record a failure for a given step.
   * Uses a normalized signature to enable stable anti-loop detection.
   */
  public recordFailure(stepId: string, errorMsg: string, errorType?: PipelineErrorType): FailureRecord {
    const sig = buildErrorSignature(errorMsg);
    const failures = this.runState.failures.filter((f) => f.stepId === stepId);
    const failure: FailureRecord = {
      stepId,
      attempt: failures.length + 1,
      errorSignature: sig,
      errorMessage: errorMsg,
      timestamp: new Date().toISOString(),
      errorType,
    };
    this.runState.failures.push(failure);
    return failure;
  }

  /**
   * Returns true if we have not yet exhausted maxRepairAttempts for this step.
   */
  public canRetry(stepId: string): boolean {
    const attempts = this.runState.failures.filter((f) => f.stepId === stepId).length;
    return attempts < this.config.maxRepairAttempts;
  }

  /**
   * Returns true if the last failure for this step has the same semantic signature
   * as the given errorMsg — i.e. we are looping on the same error.
   */
  public hasRepeatedFailure(stepId: string, errorMsg: string): boolean {
    const sig = buildErrorSignature(errorMsg);
    const stepFailures = this.runState.failures.filter((f) => f.stepId === stepId);
    if (stepFailures.length === 0) return false;
    const last = stepFailures[stepFailures.length - 1];
    return last.errorSignature === sig;
  }

  /**
   * Returns true if we should abort the repair loop entirely for this step.
   * Triggered by: exceeded maxRepairAttempts OR repeated identical failure.
   */
  public shouldAbortRepair(stepId: string, errorMsg: string): boolean {
    return !this.canRetry(stepId) || this.hasRepeatedFailure(stepId, errorMsg);
  }

  private logTraceEvent(event: Record<string, unknown>): void {
    this.traceEvents.push({
      timestamp: new Date().toISOString(),
      state: this.state,
      ...event,
    });
  }

  private saveTraceLog(): void {
    if (this.config.tracePath) {
      try {
        const dir = path.dirname(this.config.tracePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = {
          userPrompt: this.runState.userPrompt,
          finalState: this.state,
          failures: this.runState.failures,
          modifiedFiles: this.runState.modifiedFiles,
          attemptCount: this.runState.attemptCount,
          events: this.traceEvents,
        };
        fs.writeFileSync(this.config.tracePath, JSON.stringify(data, null, 2), "utf8");
      } catch (err) {
        console.error("Failed to write E2E execution trace log:", err);
      }
    }
  }

  /**
   * Executes the E2E pipeline flow in a deterministic/stubbed environment.
   * Fully validates output contracts (Zod) and enforces state invariants.
   */
  public async executeE2E(stubs: {
    plannerStub: (prompt: string) => Promise<unknown>;
    executorStub: (step: PlanStep) => Promise<unknown>;
    verifyStub: (
      level: "step" | "milestone" | "final",
      context: { step?: PlanStep; run: PipelineRun }
    ) => Promise<{ success: boolean; errorSummary?: string }>;
    fixerStub: (step: PlanStep, lastFailure: FailureRecord) => Promise<unknown>;
  }): Promise<PipelineState> {
    let currentStep: PlanStep | undefined;

    while (this.state !== "done" && this.state !== "failed") {
      switch (this.state) {
        case "planning": {
          try {
            const rawPlan = await stubs.plannerStub(this.runState.userPrompt);
            this.logTraceEvent({ eventType: "planner_response", rawPlan });

            const parsed = PlannerOutputSchema.parse(rawPlan);

            this.runState.plan = parsed.plan.map((step) => ({
              ...step,
              status: "pending" as const,
            }));

            this.transitionTo("executing");
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logTraceEvent({ eventType: "planner_error", error: msg });

            this.transitionTo("failed");
            throw new Error(`Planner output contract violation: ${msg}`);
          }
          break;
        }

        case "executing": {
          // Find next pending step whose dependencies are all marked "done"
          const nextStep = this.runState.plan.find((step) => {
            if (step.status !== "pending") return false;
            return step.dependsOn.every((depId) => {
              const depStep = this.runState.plan.find((s) => s.id === depId);
              return depStep && depStep.status === "done";
            });
          });

          if (!nextStep) {
            // Check if there are any remaining pending steps at all (e.g. cycle detected)
            const hasPending = this.runState.plan.some((s) => s.status === "pending");
            if (hasPending) {
              this.transitionTo("failed");
              throw new Error("Deadlock or circular dependency detected in plan execution.");
            }
            // All steps completed, verify final
            if (this.runState.plan.length === 0) {
              this.transitionTo("failed");
            }
            break;
          }

          currentStep = nextStep;
          currentStep.status = "running";
          this.runState.currentStepId = currentStep.id;

          try {
            const rawOutput = await stubs.executorStub(currentStep);
            this.logTraceEvent({ eventType: "executor_response", stepId: currentStep.id, rawOutput });

            const parsedOutput = ExecutorOutputSchema.parse(rawOutput);

            // Execute the structured output action
            if (parsedOutput.action === "edit") {
              for (const patch of parsedOutput.patches) {
                const content = fs.readFileSync(patch.targetFile, "utf8");
                const updated = applyPatch(content, patch, currentStep.filesToWrite, patch.targetFile);
                fs.writeFileSync(patch.targetFile, updated, "utf8");
                if (!this.runState.modifiedFiles.includes(patch.targetFile)) {
                  this.runState.modifiedFiles.push(patch.targetFile);
                }
              }
            } else if (parsedOutput.action === "write") {
              if (!currentStep.filesToWrite.includes(parsedOutput.targetFile)) {
                throw new Error(`Write denied: ${parsedOutput.targetFile} is not in filesToWrite.`);
              }
              fs.writeFileSync(parsedOutput.targetFile, parsedOutput.content, "utf8");
              if (!this.runState.modifiedFiles.includes(parsedOutput.targetFile)) {
                this.runState.modifiedFiles.push(parsedOutput.targetFile);
              }
            } else if (parsedOutput.action === "command") {
              // Stub command - executed in verifyStub or stubs level
            }

            this.transitionTo("verifying_step");
          } catch (err: unknown) {
            currentStep.status = "failed";
            const errSummary = err instanceof Error ? err.message : String(err);

            let errorType: PipelineErrorType = "executor_schema_error";
            if (errSummary.includes("Semantic validation")) {
              errorType = "executor_semantic_error";
            } else if (errSummary.includes("patch") || errSummary.includes("Patch")) {
              errorType = "patch_apply_error";
            }

            this.logTraceEvent({ eventType: "executor_error", stepId: currentStep.id, error: errSummary, errorType });

            const isAbort = this.shouldAbortRepair(currentStep.id, errSummary);
            this.recordFailure(currentStep.id, errSummary, errorType);

            if (isAbort) {
              this.transitionTo("failed");
            } else {
              this.transitionTo("repairing");
            }
          }
          break;
        }

        case "verifying_step": {
          if (!currentStep) {
            this.transitionTo("failed");
            break;
          }

          const verification = await stubs.verifyStub("step", {
            step: currentStep,
            run: this.runState,
          });

          if (verification.success) {
            currentStep.status = "done";
            this.logTraceEvent({ eventType: "step_verify_success", stepId: currentStep.id });

            // Check milestone verification
            const milestoneVerification = await stubs.verifyStub("milestone", {
              step: currentStep,
              run: this.runState,
            });

            if (!milestoneVerification.success) {
              currentStep.status = "failed";
              const mErr = milestoneVerification.errorSummary || "Milestone verification failed";

              this.logTraceEvent({ eventType: "milestone_verify_failure", stepId: currentStep.id, error: mErr });

              const isAbort = this.shouldAbortRepair(currentStep.id, mErr);
              this.recordFailure(currentStep.id, mErr, "verify_failure");

              if (isAbort) {
                this.transitionTo("failed");
              } else {
                this.transitionTo("repairing");
              }
              break;
            }

            // Check if there are any remaining pending steps
            const hasPending = this.runState.plan.some((s) => s.status === "pending");
            if (hasPending) {
              this.transitionTo("executing");
            } else {
              this.transitionTo("verifying_final");
            }
          } else {
            currentStep.status = "failed";
            const errSummary = verification.errorSummary || "Step verification failed";

            this.logTraceEvent({ eventType: "step_verify_failure", stepId: currentStep.id, error: errSummary });

            const isAbort = this.shouldAbortRepair(currentStep.id, errSummary);
            this.recordFailure(currentStep.id, errSummary, "verify_failure");

            if (isAbort) {
              this.transitionTo("failed");
            } else {
              this.transitionTo("repairing");
            }
          }
          break;
        }

        case "repairing": {
          if (!currentStep) {
            this.transitionTo("failed");
            break;
          }

          this.runState.attemptCount++;
          const lastFailure = this.runState.failures[this.runState.failures.length - 1];

          this.logTraceEvent({
            eventType: "repair_attempt",
            stepId: currentStep.id,
            attempt: this.runState.attemptCount,
          });

          await stubs.fixerStub(currentStep, lastFailure);

          // Reset step status to retry
          currentStep.status = "pending";
          this.transitionTo("executing");
          break;
        }

        case "verifying_final": {
          const finalVerification = await stubs.verifyStub("final", {
            run: this.runState,
          });

          if (finalVerification.success) {
            this.logTraceEvent({ eventType: "final_verify_success" });
            this.transitionTo("done");
          } else {
            const fErr = finalVerification.errorSummary || "Final verification failed";
            this.logTraceEvent({ eventType: "final_verify_failure", error: fErr });

            if (currentStep) {
              const isAbort = this.shouldAbortRepair(currentStep.id, fErr);
              this.recordFailure(currentStep.id, fErr, "verify_failure");
              if (isAbort) {
                this.transitionTo("failed");
              } else {
                this.transitionTo("repairing");
              }
            } else {
              this.transitionTo("failed");
            }
          }
          break;
        }

        default:
          throw new Error(`Unexpected state in loop: ${this.state}`);
      }
    }

    this.saveTraceLog();
    return this.state;
  }
}
