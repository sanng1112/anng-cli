import type { PlanStep } from "./pipeline-types";
import type { ExecutorOutputInput } from "./pipeline-contracts";

export interface SemanticValidationError {
  stepId?: string;
  field?: string;
  message: string;
}

/**
 * Validates the semantic correctness and granularity of the Planner's plan.
 */
export function validatePlanSemantics(plan: PlanStep[]): SemanticValidationError[] {
  const errors: SemanticValidationError[] = [];
  const stepIds = new Set(plan.map((s) => s.id));

  for (const step of plan) {
    // 1. filesToWrite cannot be empty for edit/write steps
    if ((step.type === "edit" || step.type === "write") && step.filesToWrite.length === 0) {
      errors.push({
        stepId: step.id,
        field: "filesToWrite",
        message: `Step type is "${step.type}" but filesToWrite is empty.`,
      });
    }

    // 2. dependsOn must reference existing steps
    for (const depId of step.dependsOn) {
      if (!stepIds.has(depId)) {
        errors.push({
          stepId: step.id,
          field: "dependsOn",
          message: `Dependency "${depId}" does not exist in the plan.`,
        });
      }
    }

    // 3. No self-dependency
    if (step.dependsOn.includes(step.id)) {
      errors.push({
        stepId: step.id,
        field: "dependsOn",
        message: `Step cannot depend on itself.`,
      });
    }

    // 4. Heuristic: granularity checks
    if (step.filesToWrite.length > 3) {
      errors.push({
        stepId: step.id,
        field: "filesToWrite",
        message: `Granularity error: Step modifies too many files (${step.filesToWrite.length}). Max allowed is 3.`,
      });
    }

    const words = step.instruction.trim().split(/\s+/).length;
    if (words < 3) {
      errors.push({
        stepId: step.id,
        field: "instruction",
        message: `Granularity error: Instruction is too short ("${step.instruction}"). Describe the task more precisely.`,
      });
    }
    if (words > 60) {
      errors.push({
        stepId: step.id,
        field: "instruction",
        message: `Granularity error: Instruction is too long (${words} words). Split it into smaller steps.`,
      });
    }

    if (step.acceptance.length === 0) {
      errors.push({
        stepId: step.id,
        field: "acceptance",
        message: "Step must define at least one acceptance criteria.",
      });
    }
  }

  if (detectCycles(plan)) {
    errors.push({
      message: "Circular dependency detected in plan graph.",
    });
  }

  return errors;
}

/**
 * Validates the semantic correctness of the Executor's structured output.
 */
export function validateExecutorOutputSemantics(
  action: ExecutorOutputInput,
  step: PlanStep
): SemanticValidationError[] {
  const errors: SemanticValidationError[] = [];

  if (action.action === "edit") {
    for (const patch of action.patches || []) {
      if (!step.filesToWrite.includes(patch.targetFile)) {
        errors.push({
          field: "targetFile",
          message: `Boundary violation: patch target "${patch.targetFile}" is not in step's allowed filesToWrite: [${step.filesToWrite.join(", ")}].`,
        });
      }

      if (patch.targetContent === patch.replacementContent) {
        errors.push({
          field: "replacementContent",
          message: `Redundant edit: targetContent and replacementContent are identical for "${patch.targetFile}".`,
        });
      }
    }
  } else if (action.action === "write") {
    if (!step.filesToWrite.includes(action.targetFile)) {
      errors.push({
        field: "targetFile",
        message: `Boundary violation: write target "${action.targetFile}" is not in step's allowed filesToWrite.`,
      });
    }
  }

  return errors;
}

/**
 * Standard cycle detection in dependency graph.
 */
function detectCycles(plan: PlanStep[]): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(stepId: string): boolean {
    if (recStack.has(stepId)) return true;
    if (visited.has(stepId)) return false;

    visited.add(stepId);
    recStack.add(stepId);

    const step = plan.find((s) => s.id === stepId);
    if (step) {
      for (const depId of step.dependsOn) {
        if (dfs(depId)) return true;
      }
    }

    recStack.delete(stepId);
    return false;
  }

  for (const step of plan) {
    if (dfs(step.id)) return true;
  }

  return false;
}
