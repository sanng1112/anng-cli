import type { TeamStatus, TeamTaskStatus, WorkerStatus } from "./types";

export class IllegalStateTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Illegal state transition for ${entity}: Cannot transition from '${from}' to '${to}'`);
    this.name = "IllegalStateTransitionError";
  }
}

export const TeamStateTransitions: Record<TeamStatus, Set<TeamStatus>> = {
  initializing: new Set(["waiting_for_decomposition", "interrupted", "failed"]),
  waiting_for_decomposition: new Set(["dispatching", "failed", "interrupted"]),
  dispatching: new Set(["running", "failed", "interrupted"]),
  running: new Set(["completed", "failed", "interrupted"]),
  completed: new Set([]),
  failed: new Set([]),
  interrupted: new Set([]),
};

export const TaskStateTransitions: Record<TeamTaskStatus, Set<TeamTaskStatus>> = {
  pending: new Set(["assigned", "skipped", "failed"]),
  assigned: new Set(["running", "skipped", "failed", "pending"]), // Can revert to pending if worker unassigned
  running: new Set(["completed", "failed", "skipped", "pending"]), // Can revert to pending on retry
  completed: new Set([]),
  failed: new Set(["pending"]), // Can transition to pending on retry
  skipped: new Set([]),
};

export const WorkerStateTransitions: Record<WorkerStatus, Set<WorkerStatus>> = {
  idle: new Set(["busy", "disposed", "error"]),
  busy: new Set(["idle", "error", "disposed"]),
  error: new Set(["idle", "disposed"]),
  disposed: new Set([]),
};

export function transitionTeamState(current: TeamStatus, next: TeamStatus): TeamStatus {
  if (current === next) return next;
  if (!TeamStateTransitions[current].has(next)) {
    throw new IllegalStateTransitionError("Team", current, next);
  }
  return next;
}

export function transitionTaskState(current: TeamTaskStatus, next: TeamTaskStatus): TeamTaskStatus {
  if (current === next) return next;
  if (!TaskStateTransitions[current].has(next)) {
    throw new IllegalStateTransitionError("Task", current, next);
  }
  return next;
}

export function transitionWorkerState(current: WorkerStatus, next: WorkerStatus): WorkerStatus {
  if (current === next) return next;
  if (!WorkerStateTransitions[current].has(next)) {
    throw new IllegalStateTransitionError("Worker", current, next);
  }
  return next;
}
