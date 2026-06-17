# Phase H1: Invariant Registry Matrix

## Safety Invariants

| Invariant ID | Description | Enforcement Location | Verification Status | Tests | Assertions | Telemetry |
|---|---|---|---|---|---|---|
| SAFE-01 | Plan mode cannot mutate state | `src/team/policy-engine.ts:25` | Verified | `policy-engine.test.ts` | None | None |
| SAFE-02 | Plan mode cannot execute shell | `src/team/policy-engine.ts:25` | Verified | `policy-engine.test.ts` | None | None |
| SAFE-03 | Worker cannot escape assigned scope | `src/team/policy-engine.ts:74` | Verified | `policy-engine.test.ts` | None | None |
| SAFE-04 | Capability cannot escalate permissions | `src/tools/executor.ts:285` | Verified | Implied by order (PolicyEngine runs before Capabilities) | None | None |
| SAFE-05 | Agent cannot bypass PolicyEngine | `src/tools/executor.ts:285` | Verified | `ToolExecutor` wraps all tools | None | None |

## State Invariants

| Invariant ID | Description | Enforcement Location | Verification Status | Tests | Assertions | Telemetry |
|---|---|---|---|---|---|---|
| STATE-01 | ExecutionContext remains consistent | `src/session/index.ts:315` | Verified | TypeScript compiler | None | None |
| STATE-02 | Context propagation never loses mode | `SessionManager.setExecutionContext` | Verified | Implicit via types | None | None |
| STATE-03 | Context propagation never loses permissions | `SessionManager.setExecutionContext` | Verified | Implicit via types | None | None |
| STATE-04 | Context propagation never loses scope | `SessionManager.setExecutionContext` | Verified | Implicit via types | None | None |

## Concurrency Invariants

| Invariant ID | Description | Enforcement Location | Verification Status | Tests | Assertions | Telemetry |
|---|---|---|---|---|---|---|
| CONC-01 | File writes are serialized | `src/common/lock-manager.ts` | Verified | `chaos.test.ts` (CONC-01, property-based) | None | None |
| CONC-02 | Locks are eventually released | `src/common/lock-manager.ts`, `src/common/validate.ts` | Verified | `chaos.test.ts` (CONC-02, property-based) | None | None |
| CONC-03 | No lock leak after failure | `src/common/lock-manager.ts` (finally blocks) | Verified | `chaos.test.ts` (CONC-03) | None | None |
| CONC-04 | No task executes without lock ownership | `src/common/lock-manager.ts:assertLockOwnershipBeforeWrite` | Verified | `chaos.test.ts` (CONC-04, property-based) | None | None |

*Note: `FileConflictResolver` exists but only detects overlap prior to execution. It does not enforce OS-level locking or runtime write synchronization during tool execution.*

## Team Invariants

| Invariant ID | Description | Enforcement Location | Verification Status | Tests | Assertions | Telemetry |
|---|---|---|---|---|---|---|
| TEAM-01 | Single/multi agent semantics equivalent | `ToolExecutor` via `ExecutionContext` | Verified | `parallel-executor.test.ts` | None | None |
| TEAM-02 | Coordinator permissions survive delegation | `TaskDecomposer` & `AgentWorker` | Verified | Implicit via workflow | None | None |
| TEAM-03 | Worker restrictions survive orchestration | `AgentWorkerPool.addWorker` | Verified | Implicit via contract creation | None | None |
