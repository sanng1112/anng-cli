export type PipelineState =
  | "planning"
  | "executing"
  | "verifying_step"
  | "repairing"
  | "verifying_final"
  | "done"
  | "failed";

/**
 * Represents a single atomic step in the execution plan.
 *
 * type semantics:
 *   - "read"    : read-only operation, no file mutations
 *   - "edit"    : apply a targeted patch to an existing file (must match exactly once)
 *   - "write"   : create a new file or fully overwrite an existing one
 *   - "command" : run a local shell command; should NOT mutate files outside filesToWrite
 */
export interface PlanStep {
  id: string;
  type: "read" | "edit" | "write" | "command";
  instruction: string;
  filesToRead: string[];
  filesToWrite: string[];
  dependsOn: string[];
  acceptance: string[];
  status: "pending" | "running" | "done" | "failed";
}

export interface FailureRecord {
  stepId: string;
  attempt: number;
  errorSignature: string;
  errorMessage: string;
  timestamp: string;
}

export interface PipelineRun {
  userPrompt: string;
  plan: PlanStep[];
  currentStepId?: string;
  modifiedFiles: string[];
  failures: FailureRecord[];
  attemptCount: number;
  state: PipelineState;
}

export interface FailurePacket {
  failedStepId: string;
  changedFiles: string[];
  verifyCommand?: string;
  exitCode?: number;
  errorSummary: string;
  stderrExcerpt?: string;
  suspectedScope: string[];
  originalAcceptance: string[];
}
