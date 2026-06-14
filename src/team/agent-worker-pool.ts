import { AgentWorker, type AgentWorkerOptions } from "./agent-worker";
import type { AgentConfig, TeamTask, TeamTaskResult } from "./types";

export type AgentWorkerPoolOptions = {
  projectRoot: string;
  maxConcurrency: number;
  baseWorkerOptions: Omit<AgentWorkerOptions, "agentConfig">;
};

export class AgentWorkerPool {
  private workers: Map<string, AgentWorker> = new Map();
  private available: AgentWorker[] = [];
  private busy: Set<string> = new Set();
  private maxConcurrency: number;

  constructor(private options: AgentWorkerPoolOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
  }

  async addWorker(config: AgentConfig): Promise<void> {
    const worker = new AgentWorker({
      ...this.options.baseWorkerOptions,
      agentConfig: config,
    });
    await worker.initialize();
    this.workers.set(config.name, worker);
    this.available.push(worker);
  }

  async initializeAll(configs: AgentConfig[]): Promise<void> {
    await Promise.all(configs.map((c) => this.addWorker(c)));
  }

  acquireWorker(): AgentWorker | null {
    this.available = this.available.filter((w) => w.getStatus() !== "disposed");

    if (this.available.length === 0) return null;
    if (this.busy.size >= this.maxConcurrency) return null;

    const worker = this.available.shift()!;
    const name = this.getWorkerName(worker);
    this.busy.add(name);
    return worker;
  }

  releaseWorker(worker: AgentWorker): void {
    const name = this.getWorkerName(worker);
    this.busy.delete(name);
    if (worker.getStatus() !== "disposed") {
      this.available.push(worker);
    }
  }

  async executeWithWorker(
    task: TeamTask,
    worker: AgentWorker
  ): Promise<{ result: TeamTaskResult; worker: AgentWorker }> {
    const result = await worker.executeTask(task);
    return { result, worker };
  }

  hasAvailable(): boolean {
    this.available = this.available.filter((w) => w.getStatus() !== "disposed");
    return this.available.length > 0 && this.busy.size < this.maxConcurrency;
  }

  getBusyCount(): number {
    return this.busy.size;
  }

  getTotalCount(): number {
    return this.workers.size;
  }

  interruptAll(): void {
    for (const worker of this.workers.values()) {
      worker.interrupt();
    }
  }

  disposeAll(): void {
    for (const worker of this.workers.values()) {
      worker.dispose();
    }
    this.workers.clear();
    this.available = [];
    this.busy.clear();
  }

  getWorkerName(worker: AgentWorker): string {
    for (const [name, w] of this.workers) {
      if (w === worker) return name;
    }
    return "unknown";
  }
}
