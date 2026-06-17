import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { LockManager, ConcurrencyViolationError } from "../../common/lock-manager";
import { FileConflictResolver } from "../../team/file-conflict-resolver";
import {
  TeamStateTransitions,
  TaskStateTransitions,
  WorkerStateTransitions,
  transitionTeamState,
  transitionTaskState,
  transitionWorkerState,
  IllegalStateTransitionError,
} from "../../team/state-machine";
import { PolicyEngine, type PolicyRequest } from "../../team/policy-engine";
import type { ExecutionContext } from "../../common/execution-context";

// ============================================================
// CHAOS TEST: LockManager
// ============================================================
describe("Chaos: LockManager", () => {
  it("CONC-01: random concurrent lock acquisitions never deadlock", async () => {
    const lockManager = new LockManager();
    const files = Array.from({ length: 20 }, (_, i) => `/src/file-${i}.ts`);
    const owners = Array.from({ length: 10 }, (_, i) => `agent-${i}`);

    // Simulate random concurrent lock operations
    const operations: Array<() => void> = [];
    for (let i = 0; i < 500; i++) {
      const file = files[Math.floor(Math.random() * files.length)];
      const owner = owners[Math.floor(Math.random() * owners.length)];
      const op = Math.random() > 0.3 ? "acquire" : "release";
      if (op === "acquire") {
        operations.push(() => {
          lockManager.acquireLock(file, owner);
        });
      } else {
        operations.push(() => {
          lockManager.releaseLock(file, owner);
        });
      }
    }

    // Run all operations in shuffled order
    const shuffled = operations.sort(() => Math.random() - 0.5);
    for (const op of shuffled) {
      op(); // Should never throw
    }

    // After all operations, verify no lock is held by a non-existent owner
    // and that assertLockOwnershipBeforeWrite works correctly
    for (const file of files) {
      for (const owner of owners) {
        if (lockManager.hasLock(file, owner)) {
          // If lock is held, assertLockOwnershipBeforeWrite should pass
          lockManager.assertLockOwnershipBeforeWrite(file, owner);
        }
      }
    }
  });

  it("CONC-02: locks are eventually released after operation chains", () => {
    const lockManager = new LockManager();
    const filePath = "/src/test-file.ts";

    // Simulate a chain: acquire → release → acquire → release
    assert.equal(lockManager.acquireLock(filePath, "task-1"), true);
    assert.equal(lockManager.hasLock(filePath, "task-1"), true);
    lockManager.releaseLock(filePath, "task-1");
    assert.equal(lockManager.hasLock(filePath, "task-1"), false);

    // Second chain with different owner
    assert.equal(lockManager.acquireLock(filePath, "task-2"), true);
    assert.equal(lockManager.hasLock(filePath, "task-2"), true);
    lockManager.releaseLock(filePath, "task-2");
    assert.equal(lockManager.hasLock(filePath, "task-2"), false);
  });

  it("CONC-03: no lock leak after simulated failure (exception in critical section)", () => {
    const lockManager = new LockManager();
    const filePath = "/src/crash-file.ts";

    // Acquire lock (simulating start of write)
    assert.equal(lockManager.acquireLock(filePath, "task-1"), true);

    // Simulate a failure/crash during write operation
    // In a real scenario, the finally block would call releaseLock
    // Here we simulate the recovery path
    try {
      // Simulated crash - lock is held
      throw new Error("Simulated crash");
    } catch {
      // Recovery: release the lock
      lockManager.releaseLock(filePath, "task-1");
    }

    // After recovery, a different task should be able to acquire the lock
    assert.equal(lockManager.acquireLock(filePath, "task-2"), true);
    lockManager.releaseLock(filePath, "task-2");
  });

  it("CONC-04: no task can write without lock ownership", () => {
    const lockManager = new LockManager();
    const filePath = "/src/protected-file.ts";

    // Task-1 acquires lock
    lockManager.acquireLock(filePath, "task-1");

    // Task-2 should NOT have the lock
    assert.equal(lockManager.hasLock(filePath, "task-2"), false);

    // Task-2 attempting to assert ownership should throw
    assert.throws(() => lockManager.assertLockOwnershipBeforeWrite(filePath, "task-2"), ConcurrencyViolationError);

    // After task-1 releases, task-2 can acquire
    lockManager.releaseLock(filePath, "task-1");
    assert.equal(lockManager.acquireLock(filePath, "task-2"), true);
    lockManager.releaseLock(filePath, "task-2");
  });

  it("property-based: LockManager maintains mutual exclusion under random operations", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            operation: fc.constantFrom("acquire", "release", "check"),
            owner: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        (operations) => {
          const lockManager = new LockManager();
          const filePath = "/src/fuzz-file.ts";
          let currentOwner: string | null = null;

          for (const op of operations) {
            if (op.operation === "acquire") {
              const acquired = lockManager.acquireLock(filePath, op.owner);
              if (acquired) {
                currentOwner = op.owner;
              }
            } else if (op.operation === "release") {
              lockManager.releaseLock(filePath, op.owner);
              if (currentOwner === op.owner) {
                currentOwner = null;
              }
            } else {
              // check - hasLock should only return true for the current owner
              if (currentOwner !== null) {
                assert.equal(lockManager.hasLock(filePath, currentOwner), true);
              }
            }

            // Invariant: If the lock is held, only the owner can assert write permission
            for (const testOwner of [op.owner, "intruder"]) {
              if (lockManager.hasLock(filePath, testOwner)) {
                lockManager.assertLockOwnershipBeforeWrite(filePath, testOwner);
              } else if (testOwner !== currentOwner && currentOwner !== null) {
                assert.throws(
                  () => lockManager.assertLockOwnershipBeforeWrite(filePath, testOwner),
                  ConcurrencyViolationError
                );
              }
            }
          }

          // Clean up: release any remaining lock
          if (currentOwner) {
            lockManager.releaseLock(filePath, currentOwner);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it("property-based: LockManager releases are idempotent and safe", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (owner1, owner2) => {
          const lockManager = new LockManager();
          const filePath = "/src/idempotent-file.ts";

          // Acquire by owner1
          lockManager.acquireLock(filePath, owner1);

          // Multiple releases by owner1 should be idempotent
          lockManager.releaseLock(filePath, owner1);
          lockManager.releaseLock(filePath, owner1); // Second release - should no-op
          lockManager.releaseLock(filePath, owner1); // Third release - should no-op

          // After proper release, owner2 should be able to acquire
          assert.equal(lockManager.acquireLock(filePath, owner2), true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================
// CHAOS TEST: FileConflictResolver
// ============================================================
describe("Chaos: FileConflictResolver", () => {
  it("property-based: fail-on-conflict strategy never grants concurrent access", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            file: fc.string({ minLength: 1, maxLength: 20 }),
            taskId: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (operations) => {
          const resolver = new FileConflictResolver("fail-on-conflict");
          const heldBy = new Map<string, string>();

          for (const op of operations) {
            const acquired = resolver.acquireLock(op.file, op.taskId);
            if (acquired) {
              // If acquired, nobody else should have had it
              assert.equal(heldBy.has(op.file), false);
              heldBy.set(op.file, op.taskId);
            } else {
              // If not acquired, someone else holds it
              assert.equal(heldBy.has(op.file), true);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it("last-write-wins strategy never blocks", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            file: fc.string({ minLength: 1, maxLength: 15 }),
            taskId: fc.string({ minLength: 1, maxLength: 8 }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        (operations) => {
          const resolver = new FileConflictResolver("last-write-wins");

          for (const op of operations) {
            // last-write-wins should always return true
            assert.equal(resolver.acquireLock(op.file, op.taskId), true);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});

// ============================================================
// CHAOS TEST: State Machine Transitions
// ============================================================
describe("Chaos: State Machine", () => {
  it("property-based: all valid TeamState transitions are allowed", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "initializing",
          "waiting_for_decomposition",
          "dispatching",
          "running",
          "completed",
          "failed",
          "interrupted" as const
        ),
        fc.constantFrom(
          "initializing",
          "waiting_for_decomposition",
          "dispatching",
          "running",
          "completed",
          "failed",
          "interrupted" as const
        ),
        (from, to) => {
          const valid = TeamStateTransitions[from]?.has(to);
          if (from === to) {
            // Self-transition should work
            assert.equal(transitionTeamState(from, to), to);
          } else if (valid) {
            assert.equal(transitionTeamState(from, to), to);
          } else {
            assert.throws(() => transitionTeamState(from, to), IllegalStateTransitionError);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("property-based: all valid TaskState transitions are allowed", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("pending", "assigned", "running", "completed", "failed", "skipped" as const),
        fc.constantFrom("pending", "assigned", "running", "completed", "failed", "skipped" as const),
        (from, to) => {
          const valid = TaskStateTransitions[from]?.has(to);
          if (from === to) {
            assert.equal(transitionTaskState(from, to), to);
          } else if (valid) {
            assert.equal(transitionTaskState(from, to), to);
          } else {
            assert.throws(() => transitionTaskState(from, to), IllegalStateTransitionError);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("property-based: all valid WorkerState transitions are allowed", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("idle", "busy", "error", "disposed" as const),
        fc.constantFrom("idle", "busy", "error", "disposed" as const),
        (from, to) => {
          const valid = WorkerStateTransitions[from]?.has(to);
          if (from === to) {
            assert.equal(transitionWorkerState(from, to), to);
          } else if (valid) {
            assert.equal(transitionWorkerState(from, to), to);
          } else {
            assert.throws(() => transitionWorkerState(from, to), IllegalStateTransitionError);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it("terminal states reject all transitions", () => {
    const terminalTeamStates: Array<"completed" | "failed" | "interrupted"> = ["completed", "failed", "interrupted"];
    const terminalTaskStates: Array<"completed" | "skipped"> = ["completed", "skipped"];
    const terminalWorkerStates: Array<"disposed"> = ["disposed"];

    for (const state of terminalTeamStates) {
      for (const next of ["initializing", "waiting_for_decomposition", "dispatching", "running"] as const) {
        assert.throws(
          () => transitionTeamState(state, next),
          IllegalStateTransitionError,
          `Team should not transition from ${state} to ${next}`
        );
      }
    }

    for (const state of terminalTaskStates) {
      for (const next of ["pending", "assigned", "running", "failed"] as const) {
        assert.throws(
          () => transitionTaskState(state, next),
          IllegalStateTransitionError,
          `Task should not transition from ${state} to ${next}`
        );
      }
    }

    for (const state of terminalWorkerStates) {
      for (const next of ["idle", "busy", "error"] as const) {
        assert.throws(
          () => transitionWorkerState(state, next),
          IllegalStateTransitionError,
          `Worker should not transition from ${state} to ${next}`
        );
      }
    }
  });
});

// ============================================================
// CHAOS TEST: PolicyEngine
// ============================================================
describe("Chaos: PolicyEngine", () => {
  const mutatingTools = ["bash", "write", "edit"] as const;
  const readOnlyTools = ["read", "AskUserQuestion", "WebSearch", "UpdatePlan"] as const;

  function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
    return {
      sessionId: "chaos-test",
      mode: "autonomous",
      phase: "executing",
      permissions: { canWrite: true, canExecute: true, autoAcceptTools: true, requireUserApproval: [] },
      activeAgentId: "chaos-agent",
      workspaceRoot: "/project",
      taskScope: null,
      activeCapabilities: [],
      ...overrides,
    };
  }

  it("property-based: planning mode strictly denies all mutating tools", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...mutatingTools),
        fc.dictionary(fc.string(), fc.string()),
        fc.boolean(),
        (toolName, args, autoAcceptTools) => {
          const engine = new PolicyEngine();
          const context = makeContext({
            mode: "planning",
            permissions: { canWrite: true, canExecute: true, autoAcceptTools, requireUserApproval: [] },
          });

          const decision = engine.evaluate({
            toolName,
            arguments: args,
            context,
            originalToolCallId: `chaos-${toolName}`,
          });

          assert.strictEqual(decision.type, "DENY", `Planning mode failed to deny ${toolName}`);
        }
      )
    );
  });

  it("property-based: read-only tools are always allowed in planning mode", () => {
    fc.assert(
      fc.property(fc.constantFrom(...readOnlyTools), fc.dictionary(fc.string(), fc.string()), (toolName, args) => {
        const engine = new PolicyEngine();
        const context = makeContext({ mode: "planning" });

        const decision = engine.evaluate({
          toolName,
          arguments: args,
          context,
          originalToolCallId: `chaos-${toolName}`,
        });

        assert.notStrictEqual(decision.type, "DENY", `Planning mode should not deny ${toolName}`);
      })
    );
  });

  it("property-based: scope enforcement denies writes outside allowed paths", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("write", "edit"),
        fc.string({ minLength: 1 }).filter((s) => !s.includes("src/ui") && !s.includes("*")),
        (toolName, badPath) => {
          const engine = new PolicyEngine();
          const context = makeContext({
            taskScope: {
              taskId: "scope-task",
              allowedPaths: ["src/ui"],
              readOnlyPaths: [],
            },
          });

          const decision = engine.evaluate({
            toolName,
            arguments: { file_path: badPath },
            context,
            originalToolCallId: `scope-${toolName}`,
          });

          assert.strictEqual(decision.type, "DENY", `Scope jail failed to deny path: ${badPath}`);
        }
      )
    );
  });

  it("chaos: random burst of tool evaluations never throws", () => {
    const engine = new PolicyEngine();
    const context = makeContext();

    const tools = [...mutatingTools, ...readOnlyTools];

    for (let i = 0; i < 1000; i++) {
      const toolName = tools[Math.floor(Math.random() * tools.length)];
      const args: Record<string, string> = {};
      if (Math.random() > 0.5) {
        args.file_path = `/random/path/file-${Math.floor(Math.random() * 100)}.ts`;
      }
      if (Math.random() > 0.5) {
        args.content = `random content ${Math.random()}`;
      }

      // Should never throw
      const result = engine.evaluate({
        toolName,
        arguments: args,
        context,
        originalToolCallId: `burst-${i}`,
      });

      // Should always return a valid decision
      assert.ok(["ALLOW", "DENY", "ASK"].includes(result.type));
    }
  });
});
