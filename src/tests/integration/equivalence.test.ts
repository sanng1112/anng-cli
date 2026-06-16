import { test } from "node:test";
import assert from "node:assert";
import { PolicyEngine } from "../../team/policy-engine";
import type { ExecutionContext } from "../../common/execution-context";

test("Equivalence: Single-Agent vs Multi-Agent (Worker) evaluate identically", () => {
  const engine = new PolicyEngine();

  const singleAgentContext: ExecutionContext = {
    sessionId: "single-1",
    mode: "autonomous",
    phase: "executing",
    permissions: { canWrite: true, canExecute: true, autoAcceptTools: true, requireUserApproval: [] },
    activeAgentId: "main",
    workspaceRoot: "/project",
    taskScope: null,
    activeCapabilities: [],
  };

  const multiAgentWorkerContext: ExecutionContext = {
    sessionId: "worker-1",
    mode: "autonomous",
    phase: "executing",
    permissions: { canWrite: true, canExecute: true, autoAcceptTools: true, requireUserApproval: [] },
    activeAgentId: "worker",
    workspaceRoot: "/project",
    taskScope: {
      taskId: "task-1",
      allowedPaths: ["src/**/*", "*"],
      readOnlyPaths: [],
    },
    activeCapabilities: [],
  };

  const toolName = "write";
  const args = { file_path: "src/utils/index.ts" };

  const singleDecision = engine.evaluate({
    toolName,
    arguments: args,
    context: singleAgentContext,
    originalToolCallId: "1",
  });

  const workerDecision = engine.evaluate({
    toolName,
    arguments: args,
    context: multiAgentWorkerContext,
    originalToolCallId: "1",
  });

  assert.strictEqual(singleDecision.type, "ALLOW");
  assert.strictEqual(workerDecision.type, "ALLOW");
});
