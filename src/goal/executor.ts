/**
 * Goal Executor
 *
 * Deterministic step executor for GoalDef definitions.
 * Executes steps in order defined by flow-control fields (nextOnSuccess / nextOnFailure)
 * without letting any LLM decide what to do next.
 */

import { execSync, type ExecSyncOptions } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as crypto from "crypto";
import type { GoalDef, GoalStep, GoalExecution, GoalStepResult, GoalExecutionCallbacks } from "./types";
import { loadGoal } from "./loader";

// ─────────────────────────────────────────────────────────────────────────────
// Execution Context
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutorContext = {
  projectRoot: string;
  callbacks?: GoalExecutionCallbacks;
  abortSignal?: AbortSignal;
  /** Variable store for condition evaluation */
  vars: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Executor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a goal definition from start to finish.
 * Returns the final execution record with all step results.
 */
export async function executeGoal(goalDef: GoalDef, context: ExecutorContext): Promise<GoalExecution> {
  const execution: GoalExecution = {
    id: crypto.randomUUID(),
    goalId: goalDef.id,
    status: "running",
    startedAt: Date.now(),
    stepResults: new Map(),
  };

  const stepMap = new Map<string, GoalStep>();
  for (const step of goalDef.steps) {
    stepMap.set(step.id, step);
  }

  let currentStepId: string | undefined = goalDef.startStepId;
  const visited = new Set<string>();

  try {
    while (currentStepId) {
      if (visited.has(currentStepId)) {
        execution.status = "failure";
        execution.completedAt = Date.now();
        context.callbacks?.onStatusChange?.(execution);
        break;
      }
      visited.add(currentStepId);

      const step = stepMap.get(currentStepId);
      if (!step) {
        execution.status = "failure";
        execution.completedAt = Date.now();
        context.callbacks?.onStatusChange?.(execution);
        break;
      }

      execution.currentStepId = step.id;
      context.callbacks?.onStatusChange?.(execution);

      const result = await executeStep(step, execution, context);
      execution.stepResults.set(step.id, result);
      execution.currentStepId = step.id;

      if (result.status === "success") {
        currentStepId = step.nextOnSuccess;
      } else {
        currentStepId = step.nextOnFailure;
      }

      if (currentStepId === undefined) {
        break;
      }
    }

    if (execution.status === "running") {
      const allResults = Array.from(execution.stepResults.values());
      const hasFailure = allResults.some((r) => r.status === "failure");
      execution.status = hasFailure ? "failure" : "success";
    }
  } catch (err) {
    execution.status = "failure";
    const error = err instanceof Error ? err.message : String(err);
    if (execution.currentStepId) {
      const existing = execution.stepResults.get(execution.currentStepId);
      if (existing) {
        existing.status = "failure";
        existing.error = error;
      }
    }
  }

  execution.completedAt = Date.now();
  context.callbacks?.onStatusChange?.(execution);
  return execution;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Execution
// ─────────────────────────────────────────────────────────────────────────────

async function executeStep(
  step: GoalStep,
  execution: GoalExecution,
  context: ExecutorContext
): Promise<GoalStepResult> {
  const result: GoalStepResult = {
    stepId: step.id,
    status: "pending",
    startedAt: Date.now(),
    retries: 0,
  };

  context.callbacks?.onStepStart?.(execution, step);

  const maxRetries = step.maxRetries ?? 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      result.retries = attempt;
    }

    if (context.abortSignal?.aborted) {
      result.status = "cancelled";
      result.error = "Execution cancelled";
      result.completedAt = Date.now();
      context.callbacks?.onStepComplete?.(execution, step, result);
      return result;
    }

    try {
      result.status = "running";
      context.callbacks?.onStatusChange?.(execution);

      switch (step.type) {
        case "bash":
          await executeBashStep(step, result, context);
          break;
        case "prompt":
          await executePromptStep(step, result, context);
          break;
        case "read":
          await executeReadStep(step, result, context);
          break;
        case "write":
          await executeWriteStep(step, result, context);
          break;
        case "parallel":
          await executeParallelStep(step, result, execution, context);
          break;
        case "condition":
          await executeConditionStep(step, result, context);
          break;
        case "subgoal":
          await executeSubgoalStep(step, result, context);
          break;
        default:
          result.status = "failure";
          result.error = `Unknown step type: ${step.type}`;
      }
    } catch (err) {
      result.status = "failure";
      result.error = err instanceof Error ? err.message : String(err);
    }

    if ((result.status as string) === "success") {
      break;
    }

    if (attempt < maxRetries) {
      result.status = "pending";
      result.error = undefined;
    }
  }

  result.completedAt = Date.now();

  if (result.status === "failure") {
    context.callbacks?.onStepError?.(execution, step, new Error(result.error));
  }
  context.callbacks?.onStepComplete?.(execution, step, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Type Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function executeBashStep(step: GoalStep, result: GoalStepResult, context: ExecutorContext): Promise<void> {
  const cmd = step.command ?? "";
  const opts: ExecSyncOptions = {
    cwd: context.projectRoot,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: step.timeoutMs ?? 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  };

  try {
    const stdout = execSync(cmd, opts) as string;
    result.output = stdout.trim();
    result.status = "success";
  } catch (err: unknown) {
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? "";
    const stdout = (err as { stdout?: Buffer })?.stdout?.toString() ?? "";
    result.output = (stdout + "\n" + stderr).trim();
    result.status = "failure";
    result.error = err instanceof Error ? err.message : String(err);
  }
}

async function executePromptStep(step: GoalStep, result: GoalStepResult, _context: ExecutorContext): Promise<void> {
  result.output = step.prompt ?? "(no prompt defined)";
  result.status = "success";
}

async function executeReadStep(step: GoalStep, result: GoalStepResult, context: ExecutorContext): Promise<void> {
  const filePath = step.filePath;
  if (!filePath) {
    result.status = "failure";
    result.error = "No filePath specified for read step";
    return;
  }

  const absPath = join(context.projectRoot, filePath);
  try {
    const content = readFileSync(absPath, "utf-8");
    result.output = content;
    result.status = "success";
  } catch (err) {
    result.status = "failure";
    result.error = `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeWriteStep(step: GoalStep, result: GoalStepResult, context: ExecutorContext): Promise<void> {
  const filePath = step.filePath;
  if (!filePath) {
    result.status = "failure";
    result.error = "No filePath specified for write step";
    return;
  }

  const absPath = join(context.projectRoot, filePath);
  try {
    writeFileSync(absPath, step.content ?? "", "utf-8");
    result.output = `Wrote ${step.content?.length ?? 0} bytes to ${filePath}`;
    result.status = "success";
  } catch (err) {
    result.status = "failure";
    result.error = `Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeParallelStep(
  step: GoalStep,
  result: GoalStepResult,
  execution: GoalExecution,
  context: ExecutorContext
): Promise<void> {
  if (!step.parallel || step.parallel.length === 0) {
    result.status = "success";
    result.output = "(no parallel steps)";
    return;
  }

  const subResults = await Promise.all(
    step.parallel.map(async (subStep) => {
      const uniqueStep = { ...subStep, id: `${step.id}/${subStep.id}` };
      return executeStep(uniqueStep, execution, context);
    })
  );

  const outputs: string[] = [];
  const failures = subResults.filter((r) => r.status === "failure");
  for (const sr of subResults) {
    if (sr.output) outputs.push(`[${sr.stepId}] ${sr.output}`);
    if (sr.error) outputs.push(`[${sr.stepId}] ERROR: ${sr.error}`);
  }
  result.output = outputs.join("\n");
  result.status = failures.length > 0 ? "failure" : "success";
}

async function executeConditionStep(step: GoalStep, result: GoalStepResult, context: ExecutorContext): Promise<void> {
  const expression = step.conditionExpression ?? "";
  let evaluated = expression;
  for (const [key, value] of Object.entries(context.vars)) {
    evaluated = evaluated.replaceAll(`\${${key}}`, value);
  }

  try {
    if (evaluated.includes("==")) {
      const [lhs, rhs] = evaluated.split("==").map((s) => s.trim());
      const match = lhs === rhs;
      result.output = `${lhs} == ${rhs} → ${match}`;
      result.status = match ? "success" : "failure";
    } else if (evaluated.startsWith("!")) {
      const val = evaluated.slice(1).trim();
      const isTruthy = val !== "" && val !== "false" && val !== "0" && val !== "undefined" && val !== "null";
      result.output = `!${val} → ${!isTruthy}`;
      result.status = !isTruthy ? "success" : "failure";
    } else {
      const isTruthy =
        evaluated !== "" &&
        evaluated !== "false" &&
        evaluated !== "0" &&
        evaluated !== "undefined" &&
        evaluated !== "null";
      result.output = `${evaluated} → ${isTruthy}`;
      result.status = isTruthy ? "success" : "failure";
    }
  } catch (err) {
    result.status = "failure";
    result.error = `Condition evaluation error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function executeSubgoalStep(step: GoalStep, result: GoalStepResult, context: ExecutorContext): Promise<void> {
  const subgoalId = step.subgoalId;
  if (!subgoalId) {
    result.status = "failure";
    result.error = "No subgoalId specified for subgoal step";
    return;
  }

  const subGoal = loadGoal(context.projectRoot, subgoalId);
  if (!subGoal) {
    result.status = "failure";
    result.error = `Subgoal "${subgoalId}" not found`;
    return;
  }

  const subExecution = await executeGoal(subGoal, context);
  const subResults = Array.from(subExecution.stepResults.values());
  const outputs = subResults
    .filter((r) => r.output)
    .map((r) => `[${r.stepId}] ${r.output}`)
    .join("\n");

  result.output = outputs;
  result.status = subExecution.status;
  if (subExecution.status === "failure") {
    const firstError = subResults.find((r) => r.error);
    result.error = firstError?.error || "Subgoal failed";
  }
}
