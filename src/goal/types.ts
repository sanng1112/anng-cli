/**
 * Goal System Types
 *
 * Type definitions for the deterministic goal execution engine.
 * Goals are hard-coded definitions with explicit step-by-step instructions
 * that do NOT rely on LLM model outputs to decide the next step.
 */

export type GoalStepType = "bash" | "prompt" | "read" | "write" | "parallel" | "condition" | "subgoal";

export type GoalStep = {
  /** Unique step ID within the goal */
  id: string;
  /** Step type determines the execution behaviour */
  type: GoalStepType;
  /** Human-readable description shown in the UI */
  description?: string;
  /** For prompt type – the prompt string to send to the LLM */
  prompt?: string;
  /** For bash type – shell command to execute */
  command?: string;
  /** For read/write type – absolute or project-relative file path */
  filePath?: string;
  /** For write type – content to write into filePath */
  content?: string;
  /** For parallel type – child steps to run concurrently */
  parallel?: GoalStep[];
  /** For condition type – a simple expression evaluated against step results */
  conditionExpression?: string;
  /** For subgoal type – references another goal's ID */
  subgoalId?: string;

  // ── Flow control ──────────────────────────────────────────────
  /** Step ID to jump to on success (default: next in array) */
  nextOnSuccess?: string;
  /** Step ID to jump to on failure (default: fail the goal) */
  nextOnFailure?: string;

  // ── Execution tuning ──────────────────────────────────────────
  maxRetries?: number;
  timeoutMs?: number;
};

export type GoalDef = {
  /** Unique identifier for this goal */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what this goal does */
  description: string;
  /** Semantic version string */
  version: string;
  /** Ordered list of all steps in this goal */
  steps: GoalStep[];
  /** ID of the step to start execution from */
  startStepId: string;
  /** Optional tags for filtering / discovery */
  tags?: string[];
};

export type GoalExecutionStatus = "pending" | "running" | "success" | "failure" | "skipped" | "cancelled";

export type GoalStepResult = {
  stepId: string;
  status: GoalExecutionStatus;
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  retries?: number;
};

export type GoalExecution = {
  id: string;
  goalId: string;
  status: GoalExecutionStatus;
  startedAt: number;
  completedAt?: number;
  currentStepId?: string;
  stepResults: Map<string, GoalStepResult>;
};

/**
 * Callbacks invoked by the executor to allow the UI to track progress.
 */
export type GoalExecutionCallbacks = {
  onStepStart?: (execution: GoalExecution, step: GoalStep) => void;
  onStepComplete?: (execution: GoalExecution, step: GoalStep, result: GoalStepResult) => void;
  onStepError?: (execution: GoalExecution, step: GoalStep, error: Error) => void;
  onStatusChange?: (execution: GoalExecution) => void;
};
