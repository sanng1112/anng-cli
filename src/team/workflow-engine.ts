import type { TeamTask, TeamTaskResult, TeamTaskStatus } from "./types";

export class WorkflowEngine {
  private tasks: Map<string, TeamTask> = new Map();
  private dependents: Map<string, Set<string>> = new Map();

  addTask(task: TeamTask): void {
    this.tasks.set(task.id, { ...task });

    for (const depId of task.dependencies) {
      if (!this.dependents.has(depId)) {
        this.dependents.set(depId, new Set());
      }
      this.dependents.get(depId)!.add(task.id);
    }
  }

  addTasks(tasks: TeamTask[]): void {
    for (const task of tasks) {
      this.addTask(task);
    }
  }

  getRunnableTasks(maxTasks?: number): TeamTask[] {
    const runnable: TeamTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.status !== "pending") continue;

      const depsCompleted = task.dependencies.every((depId) => {
        const depTask = this.tasks.get(depId);
        return depTask?.status === "completed" || depTask?.status === "skipped";
      });

      if (depsCompleted) {
        runnable.push(task);
      }
    }

    runnable.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });

    return maxTasks ? runnable.slice(0, maxTasks) : runnable;
  }

  onTaskComplete(taskId: string, result: TeamTaskResult): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = result.ok ? "completed" : "failed";
    task.result = result;
    task.completedAt = new Date().toISOString();

    if (!result.ok) {
      this.skipDependents(taskId);
    }
  }

  onTaskStart(taskId: string, workerName: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "running";
    task.assignedTo = workerName;
    task.startedAt = new Date().toISOString();
  }

  isComplete(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === "pending" || task.status === "assigned" || task.status === "running") {
        return false;
      }
    }
    return true;
  }

  countByStatus(): Record<TeamTaskStatus, number> {
    const counts: Record<TeamTaskStatus, number> = {
      pending: 0,
      assigned: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
    for (const task of this.tasks.values()) {
      counts[task.status]++;
    }
    return counts;
  }

  getAllTasks(): TeamTask[] {
    return Array.from(this.tasks.values());
  }

  visualize(): string {
    const lines: string[] = ["Workflow DAG:"];
    for (const [, task] of this.tasks) {
      const deps = task.dependencies
        .map((d) => {
          const depTask = this.tasks.get(d);
          return depTask ? `"${depTask.description.slice(0, 30)}"` : d;
        })
        .join(", ");
      lines.push(`  [${task.status}] ${task.description.slice(0, 50)}`);
      if (deps) lines.push(`    depends on: ${deps}`);
    }
    return lines.join("\n");
  }

  private skipDependents(failedTaskId: string): void {
    const deps = this.dependents.get(failedTaskId);
    if (!deps) return;

    for (const depId of deps) {
      const task = this.tasks.get(depId);
      if (task && task.status === "pending") {
        task.status = "skipped";
        this.skipDependents(depId);
      }
    }
  }
}
