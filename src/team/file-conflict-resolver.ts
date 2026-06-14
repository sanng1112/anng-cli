import type { TeamTask } from "./types";

export type ConflictResolutionStrategy = "last-write-wins" | "fail-on-conflict" | "merge-attempt";

export class FileConflictResolver {
  private strategy: ConflictResolutionStrategy;
  private fileLocks: Map<string, string> = new Map();

  constructor(strategy: ConflictResolutionStrategy = "last-write-wins") {
    this.strategy = strategy;
  }

  acquireLock(filePath: string, taskId: string): boolean {
    const existing = this.fileLocks.get(filePath);
    if (existing && existing !== taskId) {
      if (this.strategy === "fail-on-conflict") {
        return false;
      }
    }
    this.fileLocks.set(filePath, taskId);
    return true;
  }

  releaseLock(filePath: string, taskId: string): void {
    if (this.fileLocks.get(filePath) === taskId) {
      this.fileLocks.delete(filePath);
    }
  }

  detectConflicts(tasks: TeamTask[]): string[] {
    const conflicts: string[] = [];
    const fileToTasks = new Map<string, string[]>();

    for (const task of tasks) {
      for (const file of task.relatedFiles ?? []) {
        if (!fileToTasks.has(file)) {
          fileToTasks.set(file, []);
        }
        fileToTasks.get(file)!.push(task.id);
      }
    }

    for (const [file, taskIds] of fileToTasks) {
      if (taskIds.length > 1) {
        conflicts.push(`"${file}" is targeted by tasks: ${taskIds.join(", ")}`);
      }
    }

    return conflicts;
  }
}
