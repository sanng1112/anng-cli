import type { PipelineState, PipelineRun, FailureRecord } from "./pipeline-types";
import { buildErrorSignature } from "./pipeline-error-utils";
import { createInitialPipelineRun } from "./pipeline-factories";

export interface OrchestratorConfig {
  plannerModel: string;
  executorModel: string;
  fixerModel: string;
  maxRepairAttempts: number;
}

/**
 * Allowed state transitions.
 * Only listed targets are valid for each source state.
 */
const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  planning: ["executing", "failed"],
  executing: ["verifying_step", "failed"],
  verifying_step: ["executing", "verifying_final", "repairing", "failed"],
  repairing: ["executing", "failed"],
  verifying_final: ["done", "repairing", "failed"],
  done: [],
  failed: [],
};

/**
 * PipelineOrchestrator — Runtime skeleton for the Multi-Model PEVF pipeline.
 *
 * Responsibilities:
 * - Hold authoritative pipeline state
 * - Enforce legal state transitions
 * - Track failure records and repair attempt limits
 * - Detect repeated identical failures for anti-loop guardrails
 */
export class PipelineOrchestrator {
  private state: PipelineState = "planning";
  private runState: PipelineRun;
  private config: OrchestratorConfig;

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
  public recordFailure(stepId: string, errorMsg: string): FailureRecord {
    const sig = buildErrorSignature(errorMsg);
    const failures = this.runState.failures.filter((f) => f.stepId === stepId);
    const failure: FailureRecord = {
      stepId,
      attempt: failures.length + 1,
      errorSignature: sig,
      errorMessage: errorMsg,
      timestamp: new Date().toISOString(),
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
}
