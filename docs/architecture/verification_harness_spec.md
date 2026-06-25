# Verification Harness Specification

> Historical verification plan: this document predates the Go runtime becoming the primary implementation. Examples may reference legacy TypeScript files, classes, or test harnesses that no longer exist.

## 1. Overview
The Verification Harness is the cornerstone of the Runtime-Enforced Architecture. It proves that architectural invariants hold true at runtime. Any invariant discovered during an audit MUST be mapped to an automated test.

## 2. Invariant Registry

| Invariant ID | Description | Enforcement Point | Verification Test |
| :--- | :--- | :--- | :--- |
| `INV-MODE-01` | Planning Mode strictly denies Mutating Tools | `PolicyEngine` / `permissions.ts` | `test("Invariant 1: Planning mode strictly denies mutating tools")` |
| `INV-MODE-02` | Worker inherits Coordinator's Mode | `TeamOrchestrator` -> `AgentWorker` | `test("Worker inherits planMode from options")` |
| `INV-LOCK-01` | File Lock prevents concurrent overlapping edits | `FileConflictResolver.acquireLock` | `test("Invariant 2: FileConflictResolver prevents concurrent access")` |
| `INV-SCOPE-01` | Worker cannot write to out-of-scope files | `PolicyEngine` (Future) | `test("Worker scope jail blocks writes outside relatedFiles")` |

## 3. Test Layers

### 3.1 Policy Guard Tests (Unit)
Feed synthetic `ToolCall` JSON blobs into `PolicyEngine.evaluate(request, context)`.
- Assert `ALLOW` for safe commands.
- Assert `DENY` for dangerous commands when `context.mode = planning`.

### 3.2 Concurrency Tests (Integration)
Use `ParallelExecutor` to dispatch 10 synthetic Workers that mock an async `write` to the same file (`A.ts`).
- **Assertion:** The final state of `A.ts` is logically sound, and `LockManager` forced serialization (time taken > 10 * Worker execution time).

### 3.3 State Propagation Tests (Integration)
Initialize a `TeamOrchestrator` with `planMode = true`.
Spawn a Mock `AgentWorker`.
- **Assertion:** Extract the `SessionManager` state inside the Mock worker and assert `options.planMode === true`.

## 4. Runtime Assertions (Instrumentation)
In production, the architecture uses aggressive fail-fast assertions to prevent invalid states.

```typescript
// Inside TeamOrchestrator
assert(this.options.planMode === worker.options.planMode, "CRITICAL: State divergence at Agent boundary!");

// Inside PolicyEngine
if (context.mode === "planning" && request.isMutating) {
    throw new PolicyViolationError(`Fatal: Attempted mutation in planning mode by agent ${context.activeAgentId}`);
}
```
