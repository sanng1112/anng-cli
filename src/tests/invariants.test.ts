import { test } from "node:test";
import assert from "node:assert";
import { computeToolCallPermissions } from "../common/permissions";

test("Invariant 1: Planning mode strictly denies mutating tools at runtime", () => {
  const toolCalls = [
    {
      id: "call_1",
      type: "function",
      function: { name: "bash", arguments: '{"command":"rm -rf /","sideEffects":["delete-out-cwd"]}' },
    },
    {
      id: "call_2",
      type: "function",
      function: { name: "write", arguments: '{"file_path":"test.ts","content":"hello"}' },
    },
    {
      id: "call_3",
      type: "function",
      function: { name: "read", arguments: '{"file_path":"test.ts"}' },
    },
  ];

  const plan = computeToolCallPermissions({
    sessionId: "test",
    projectRoot: "/mock",
    toolCalls,
    planMode: true, // Enforcement flag
  });

  // Bash and Write MUST be denied, Read can be asked
  assert.strictEqual(plan.permissions.find((p) => p.toolCallId === "call_1")?.permission, "deny");
  assert.strictEqual(plan.permissions.find((p) => p.toolCallId === "call_2")?.permission, "deny");
  assert.strictEqual(plan.permissions.find((p) => p.toolCallId === "call_3")?.permission, "ask");
});
