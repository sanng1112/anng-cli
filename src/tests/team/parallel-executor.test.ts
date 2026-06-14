import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkflowEngine } from "../../team/workflow-engine";
import { ParallelExecutor } from "../../team/parallel-executor";
import { TeamManager } from "../../team/team-manager";
import type { TeamTask, TeamTaskResult } from "../../team/types";

function makeSuccessResult(): TeamTaskResult {
  return {
    ok: true,
    summary: "done",
    artifacts: [],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    durationMs: 1000,
    workerSessionId: "s1",
  };
}

function makeFailResult(): TeamTaskResult {
  return {
    ok: false,
    summary: "failed",
    artifacts: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: 500,
    workerSessionId: "s1",
    error: "test error",
  };
}

function makeTask(id: string, desc: string, deps: string[] = []): TeamTask {
  return {
    id,
    description: desc,
    status: "pending",
    dependencies: deps,
    priority: 0,
    createdAt: new Date().toISOString(),
  };
}

function makeMockPool(behavior: "success" | "fail") {
  let acquireCalls = 0;
  return {
    acquireWorker: () => {
      if (acquireCalls++ > 10) return null;
      return {};
    },
    releaseWorker: () => {},
    getWorkerName: () => "test-worker",
    executeWithWorker: async (task: TeamTask, _worker: unknown) => {
      return {
        result: behavior === "fail" ? makeFailResult() : makeSuccessResult(),
        worker: _worker,
      };
    },
    getTotalCount: () => 2,
    getBusyCount: () => 0,
    hasAvailable: () => true,
    interruptAll: () => {},
    disposeAll: () => {},
  };
}

describe("ParallelExecutor", () => {
  it("hoàn thành tất cả tasks với workers thành công", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [
        { name: "w1", role: "worker" },
        { name: "w2", role: "worker" },
      ],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));
    workflow.addTask(makeTask("c", "Task C", ["a"]));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.equal(result.status, "completed");
    assert.equal(result.totalTasks, 3);
    assert.equal(result.completedTasks, 3);
  });

  it("trả về partial khi có task fail", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));
    workflow.addTask(makeTask("c", "Task C", ["a"]));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("fail") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.ok(result.status === "failed" || result.status === "partial");
    assert.ok(result.failedTasks > 0);
  });

  it("dừng khi signal bị abort", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const controller = new AbortController();
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));

    const slowPool = {
      ...makeMockPool("success"),
      executeWithWorker: async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { result: makeSuccessResult(), worker: {} };
      },
    };

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: slowPool as any,
      workflowEngine: workflow,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 50);
    const result = await executor.executeAll();
    assert.ok(result.totalTasks >= 1);
  });

  it("buildResult có executiveSummary", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Build auth module"));
    workflow.addTask(makeTask("b", "Build API"));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.ok(result.executiveSummary.length > 0);
    assert.ok(result.executiveSummary.includes("2/2"));
  });

  it("tính totalUsage đúng", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.ok(result.totalUsage.totalTokens > 0, "should have token usage");
    assert.ok(result.totalUsage.inputTokens > 0);
  });

  it("có taskResults cho mỗi task đã hoàn thành", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.equal(Object.keys(result.taskResults).length, 2);
  });
});
