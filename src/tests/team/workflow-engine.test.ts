import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkflowEngine } from "../../team/workflow-engine";
import type { TeamTask, TeamTaskResult } from "../../team/types";

function makeTask(id: string, desc: string, deps: string[] = [], priority = 0): TeamTask {
  return {
    id,
    description: desc,
    status: "pending",
    dependencies: deps,
    priority,
    createdAt: new Date().toISOString(),
  };
}

function makeSuccessResult(): TeamTaskResult {
  return {
    ok: true,
    summary: "done",
    artifacts: [],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    durationMs: 1000,
    workerSessionId: "session-1",
  };
}

function makeFailResult(): TeamTaskResult {
  return {
    ok: false,
    summary: "failed",
    artifacts: [],
    usage: { inputTokens: 100, outputTokens: 0, totalTokens: 100 },
    durationMs: 500,
    workerSessionId: "session-1",
    error: "something went wrong",
  };
}

describe("WorkflowEngine", () => {
  it("linear dependency chain", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A"));
    engine.addTask(makeTask("b", "Task B", ["a"]));
    engine.addTask(makeTask("c", "Task C", ["b"]));

    let runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "a");

    engine.onTaskComplete("a", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "b");

    engine.onTaskComplete("b", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "c");

    assert.equal(engine.isComplete(), false);
    engine.onTaskComplete("c", makeSuccessResult());
    assert.equal(engine.isComplete(), true);
  });

  it("parallel tasks không dependency", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A"));
    engine.addTask(makeTask("b", "Task B"));
    engine.addTask(makeTask("c", "Task C"));

    const runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 3);
    const ids = runnable.map((t) => t.id).sort();
    assert.deepEqual(ids, ["a", "b", "c"]);
  });

  it("diamond dependency", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A"));
    engine.addTask(makeTask("b", "Task B", ["a"]));
    engine.addTask(makeTask("c", "Task C", ["a"]));
    engine.addTask(makeTask("d", "Task D", ["b", "c"]));

    let runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "a");

    engine.onTaskComplete("a", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 2);
    const ids = runnable.map((t) => t.id).sort();
    assert.deepEqual(ids, ["b", "c"]);

    engine.onTaskComplete("b", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "c");

    engine.onTaskComplete("c", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "d");

    engine.onTaskComplete("d", makeSuccessResult());
    assert.equal(engine.isComplete(), true);
  });

  it("skip dependents khi task fail", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A"));
    engine.addTask(makeTask("b", "Task B", ["a"]));
    engine.addTask(makeTask("c", "Task C", ["a"]));
    engine.addTask(makeTask("d", "Task D", ["b"]));

    engine.onTaskComplete("a", makeFailResult());
    assert.equal(engine.isComplete(), true);
    const counts = engine.countByStatus();
    assert.equal(counts.failed, 1);
    assert.ok(counts.skipped >= 2);
  });

  it("sort theo priority", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("low", "Low priority", [], 1));
    engine.addTask(makeTask("high", "High priority", [], 5));
    engine.addTask(makeTask("mid", "Mid priority", [], 3));

    const runnable = engine.getRunnableTasks();
    assert.equal(runnable[0].id, "high");
    assert.equal(runnable[1].id, "mid");
    assert.equal(runnable[2].id, "low");
  });

  it("getRunnableTasks giới hạn bởi maxTasks", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A"));
    engine.addTask(makeTask("b", "Task B"));
    engine.addTask(makeTask("c", "Task C"));

    const runnable = engine.getRunnableTasks(2);
    assert.equal(runnable.length, 2);
  });

  it("countByStatus chính xác", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A"));
    engine.addTask(makeTask("b", "Task B"));

    engine.onTaskStart("a", "worker-1");
    engine.onTaskComplete("a", makeSuccessResult());

    const counts = engine.countByStatus();
    assert.equal(counts.pending, 1);
    assert.equal(counts.completed, 1);
    assert.equal(counts.running, 0);
  });

  it("visualize trả về string không rỗng", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Build auth module"));
    engine.addTask(makeTask("b", "Build API module", ["a"]));

    const viz = engine.visualize();
    assert.ok(viz.includes("Workflow DAG"));
    assert.ok(viz.includes("Build auth module"));
  });
});
