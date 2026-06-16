import { test } from "node:test";
import assert from "node:assert";
import { PolicyEngine, type PolicyRequest } from "../../team/policy-engine";
import type { ExecutionContext } from "../../common/execution-context";

test("PolicyEngine: planning mode strictly denies mutating tools", () => {
  const engine = new PolicyEngine();
  const context: ExecutionContext = {
    sessionId: "test",
    mode: "planning",
    phase: "executing",
    permissions: { canWrite: true, canExecute: true, autoAcceptTools: true, requireUserApproval: [] },
    activeAgentId: "agent-1",
    workspaceRoot: "/project",
    taskScope: null,
    activeCapabilities: [],
  };

  const reqWrite: PolicyRequest = {
    toolName: "write",
    arguments: {},
    context,
    originalToolCallId: "1",
  };

  assert.strictEqual(engine.evaluate(reqWrite).type, "DENY");

  const reqRead: PolicyRequest = {
    toolName: "read",
    arguments: {},
    context,
    originalToolCallId: "2",
  };

  // Even though it's autoAccept, read should just pass fallback to ALLOW
  assert.strictEqual(engine.evaluate(reqRead).type, "ALLOW");
});

test("PolicyEngine: Scope enforcement (jail)", () => {
  const engine = new PolicyEngine();
  const context: ExecutionContext = {
    sessionId: "test",
    mode: "autonomous",
    phase: "executing",
    permissions: { canWrite: true, canExecute: true, autoAcceptTools: true, requireUserApproval: [] },
    activeAgentId: "agent-1",
    workspaceRoot: "/project",
    taskScope: {
      taskId: "task-1",
      allowedPaths: ["src/ui"],
      readOnlyPaths: [],
    },
    activeCapabilities: [],
  };

  // Write to allowed path
  const reqWriteAllowed: PolicyRequest = {
    toolName: "write",
    arguments: { file_path: "src/ui/Button.tsx" },
    context,
    originalToolCallId: "1",
  };
  assert.strictEqual(engine.evaluate(reqWriteAllowed).type, "ALLOW");

  // Write to denied path
  const reqWriteDenied: PolicyRequest = {
    toolName: "write",
    arguments: { file_path: "src/backend/server.ts" },
    context,
    originalToolCallId: "2",
  };
  assert.strictEqual(engine.evaluate(reqWriteDenied).type, "DENY");
});
