/**
 * Goal System – Public API
 *
 * Export all types, built-in goals, loader, and executor.
 */

export type {
  GoalStepType,
  GoalStep,
  GoalDef,
  GoalExecutionStatus,
  GoalStepResult,
  GoalExecution,
  GoalExecutionCallbacks,
} from "./types";

export type { ExecutorContext } from "./executor";

export { BUILTIN_GOALS, BUILTIN_GOAL_IDS } from "./builtin-goals";

export { loadGoal, loadGoalAsync, listGoals } from "./loader";

export { executeGoal } from "./executor";
