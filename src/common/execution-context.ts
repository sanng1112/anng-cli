export type OperatingMode = "planning" | "autonomous" | "interactive";
export type ExecutionPhase = "initialized" | "planning" | "waiting_approval" | "executing" | "completed" | "failed";

export interface PermissionSettings {
  readonly canWrite: boolean;
  readonly canExecute: boolean;
  readonly autoAcceptTools: boolean;
  readonly requireUserApproval: string[];
}

export interface TaskScope {
  readonly taskId: string;
  readonly allowedPaths: string[]; // Absolute paths or glob patterns
  readonly readOnlyPaths: string[];
}

export interface ExecutionContext {
  readonly sessionId: string;
  readonly mode: OperatingMode;
  readonly phase: ExecutionPhase;
  readonly permissions: PermissionSettings;
  readonly activeAgentId: string;
  readonly workspaceRoot: string;
  readonly taskScope: TaskScope | null;
  readonly activeCapabilities: string[];
}
