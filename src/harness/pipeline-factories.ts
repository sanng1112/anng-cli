import type { PipelineRun, PlanStep, FailurePacket } from "./pipeline-types";

export function createInitialPipelineRun(userPrompt: string): PipelineRun {
  return {
    userPrompt,
    plan: [],
    modifiedFiles: [],
    failures: [],
    attemptCount: 0,
    state: "planning",
  };
}

export function createPlanStep(
  id: string,
  type: PlanStep["type"],
  instruction: string,
  filesToRead: string[],
  filesToWrite: string[],
  acceptance: string[],
  dependsOn: string[] = []
): PlanStep {
  return {
    id,
    type,
    instruction,
    filesToRead,
    filesToWrite,
    dependsOn,
    acceptance,
    status: "pending",
  };
}

export function createFailurePacket(
  failedStepId: string,
  changedFiles: string[],
  errorSummary: string,
  options: {
    verifyCommand?: string;
    exitCode?: number;
    stderrExcerpt?: string;
    suspectedScope?: string[];
    originalAcceptance?: string[];
  } = {}
): FailurePacket {
  return {
    failedStepId,
    changedFiles,
    errorSummary,
    verifyCommand: options.verifyCommand,
    exitCode: options.exitCode,
    stderrExcerpt: options.stderrExcerpt,
    suspectedScope: options.suspectedScope ?? changedFiles,
    originalAcceptance: options.originalAcceptance ?? [],
  };
}
