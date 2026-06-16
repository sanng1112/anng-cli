import { test } from "node:test";
import assert from "node:assert";
import { computeToolCallPermissions } from "../common/permissions";
import { FileConflictResolver } from "../team/file-conflict-resolver";

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

test("Invariant 2: FileConflictResolver prevents concurrent access to the same file", () => {
  const resolver = new FileConflictResolver();

  // Task 1 acquires lock on file A
  const acquired1 = resolver.acquireLock("A.ts", "task-1");
  assert.strictEqual(acquired1, true);

  // Task 2 tries to acquire lock on file A -> must fail
  const acquired2 = resolver.acquireLock("A.ts", "task-2");
  assert.strictEqual(acquired2, false);

  // Task 2 tries to acquire lock on file B -> succeeds
  const acquired3 = resolver.acquireLock("B.ts", "task-2");
  assert.strictEqual(acquired3, true);

  // Task 1 releases file A
  resolver.releaseLock("A.ts", "task-1");

  // Task 2 can now acquire lock on file A
  const acquired4 = resolver.acquireLock("A.ts", "task-2");
  assert.strictEqual(acquired4, true);
});
