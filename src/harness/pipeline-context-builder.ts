import type { PlanStep, FailurePacket } from "./pipeline-types";

const FORBIDDEN_SECTION = `
=== FORBIDDEN BEHAVIOR (STRICT) ===
- Do NOT modify files outside the allowed write list.
- Do NOT propose unrelated refactors, style changes, or cosmetic edits.
- Do NOT create new files unless explicitly listed in the allowed write list.
- Keep changes minimal — only what is required to satisfy the acceptance criteria.
- Return changes ONLY as a targeted patch (targetContent + replacementContent). Never return a full file rewrite unless the step type is "write".
- Do NOT add imports, exports, or side effects that are not mentioned in the instruction.
`.trim();

/**
 * Builds a constrained prompt for the Executor (cheap bounded worker).
 * Includes: goal, file boundaries, acceptance criteria, forbidden constraints,
 * and optionally a failure packet for repair context.
 */
export function buildExecutorPrompt(step: PlanStep, failurePacket?: FailurePacket): string {
  const lines: string[] = [];

  lines.push(`=== EXECUTOR STEP: ${step.id} (type: ${step.type}) ===`);
  lines.push(`Goal: ${step.instruction}`);
  lines.push("");
  lines.push("BOUNDARIES:");
  lines.push(`  Allowed to READ:  ${step.filesToRead.length > 0 ? step.filesToRead.join(", ") : "None"}`);
  lines.push(`  Allowed to WRITE: ${step.filesToWrite.length > 0 ? step.filesToWrite.join(", ") : "None"}`);
  lines.push("");
  lines.push("Acceptance criteria:");
  step.acceptance.forEach((a) => lines.push(`  - ${a}`));
  lines.push("");
  lines.push(FORBIDDEN_SECTION);

  if (failurePacket) {
    lines.push("");
    lines.push("=== PREVIOUS FAILURE CONTEXT ===");
    lines.push(`Failed step: ${failurePacket.failedStepId}`);
    lines.push(`Error summary: ${failurePacket.errorSummary}`);
    lines.push(`Suspected scope: ${failurePacket.suspectedScope.join(", ")}`);
    if (failurePacket.stderrExcerpt) {
      lines.push("Stderr excerpt:");
      lines.push(failurePacket.stderrExcerpt);
    }
  }

  return lines.join("\n");
}
