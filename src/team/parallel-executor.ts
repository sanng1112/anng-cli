import type { AgentWorkerPool } from "./agent-worker-pool";
import type { WorkflowEngine } from "./workflow-engine";
import type { TeamManager } from "./team-manager";
import type { TeamTask, TeamTaskResult, TeamResult } from "./types";

import type { FileConflictResolver } from "./file-conflict-resolver";

export type ParallelExecutorOptions = {
  teamId: string;
  teamManager: TeamManager;
  workerPool: AgentWorkerPool;
  workflowEngine: WorkflowEngine;
  fileConflictResolver: FileConflictResolver;
  onTaskComplete?: (taskId: string, result: TeamTaskResult) => void;
  signal: AbortSignal;
};

export class ParallelExecutor {
  private running = new Set<string>();
  private completed = new Map<string, TeamTaskResult>();
  private startedAt = Date.now();

  constructor(private options: ParallelExecutorOptions) {}

  async executeAll(): Promise<TeamResult> {
    const { workerPool, workflowEngine, signal } = this.options;

    while (!workflowEngine.isComplete()) {
      if (signal.aborted) {
        break;
      }

      const runnable = workflowEngine.getRunnableTasks(workerPool.getTotalCount() - workerPool.getBusyCount());

      if (runnable.length === 0) {
        if (this.running.size === 0) {
          break;
        }
        await this.delay(500);
        continue;
      }

      const promises = runnable.map((task) => this.executeSingleTask(task));
      await Promise.all(promises);
    }

    return this.buildResult();
  }

  private async executeSingleTask(task: TeamTask): Promise<void> {
    const { teamManager, workerPool, workflowEngine, signal, fileConflictResolver } = this.options;

    // Try to acquire file locks first
    const lockedFiles: string[] = [];
    if (task.relatedFiles) {
      for (const file of task.relatedFiles) {
        if (!fileConflictResolver.acquireLock(file, task.id)) {
          // Rollback acquired locks if we fail to get all of them
          for (const lockedFile of lockedFiles) {
            fileConflictResolver.releaseLock(lockedFile, task.id);
          }
          // Simple backoff wait, we skip execution for now
          await this.delay(500 + Math.random() * 500);
          return this.executeSingleTask(task); // Retry
        }
        lockedFiles.push(file);
      }
    }

    let worker = workerPool.acquireWorker();
    while (!worker && !signal.aborted) {
      await this.delay(200);
      worker = workerPool.acquireWorker();
    }
    if (!worker || signal.aborted) {
      for (const lockedFile of lockedFiles) {
        fileConflictResolver.releaseLock(lockedFile, task.id);
      }
      return;
    }

    const workerName = workerPool.getWorkerName(worker);
    workflowEngine.onTaskStart(task.id, workerName);
    teamManager.updateWorker(this.options.teamId, workerName, {
      status: "busy",
      currentTaskId: task.id,
    });
    teamManager.upsertTask(this.options.teamId, task);
    this.running.add(task.id);

    try {
      const { result } = await workerPool.executeWithWorker(task, worker);
      workflowEngine.onTaskComplete(task.id, result);
      this.completed.set(task.id, result);
      this.options.onTaskComplete?.(task.id, result);

      teamManager.updateWorker(this.options.teamId, workerName, {
        status: "idle",
        currentTaskId: undefined,
        tasksCompleted: result.ok
          ? (teamManager.getTeam(this.options.teamId)?.workers.get(workerName)?.tasksCompleted ?? 0) + 1
          : undefined,
        tasksFailed: !result.ok
          ? (teamManager.getTeam(this.options.teamId)?.workers.get(workerName)?.tasksFailed ?? 0) + 1
          : undefined,
      });
    } catch {
      workflowEngine.onTaskComplete(task.id, {
        ok: false,
        summary: "",
        artifacts: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
        workerSessionId: "",
        error: "Worker execution failed",
      });
    } finally {
      for (const lockedFile of lockedFiles) {
        fileConflictResolver.releaseLock(lockedFile, task.id);
      }
      workerPool.releaseWorker(worker);
      this.running.delete(task.id);
      teamManager.upsertTask(this.options.teamId, task);
    }
  }

  private buildResult(): TeamResult {
    const { workflowEngine } = this.options;
    const counts = workflowEngine.countByStatus();
    const tasks = workflowEngine.getAllTasks();

    const taskResults: Record<string, TeamTaskResult> = {};
    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;

    for (const task of tasks) {
      if (task.result) {
        taskResults[task.id] = task.result;
        totalInput += task.result.usage.inputTokens;
        totalOutput += task.result.usage.outputTokens;
        totalTokens += task.result.usage.totalTokens;
      }
    }

    const completedCount = counts.completed;
    const failedCount = counts.failed;
    const totalCount = tasks.length;

    return {
      teamId: this.options.teamId,
      status: failedCount > 0 ? (completedCount > 0 ? "partial" : "failed") : "completed",
      totalTasks: totalCount,
      completedTasks: completedCount,
      failedTasks: failedCount,
      taskResults,
      totalDurationMs: Date.now() - this.startedAt,
      totalUsage: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalTokens,
      },
      executiveSummary: [
        `Team completed ${completedCount}/${totalCount} tasks`,
        failedCount > 0 ? `(${failedCount} failed)` : "",
        `in ${Math.round((Date.now() - this.startedAt) / 1000)}s`,
        `using ${totalTokens} tokens`,
      ].join(" "),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
