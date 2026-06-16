# Phase H3: Runtime Assertion Plan

To verify the Runtime-Enforced Architecture, the system must utilize explicit runtime assertions that fail loudly and prevent illegal states. Silent failures are prohibited.

## Proposed Assertions

### 1. `assertWorkerCannotWriteOutsideScope(context: ExecutionContext, filePath: string)`
- **Purpose**: Ensures a worker is not mutating files outside its designated `taskScope`.
- **Location**: `PolicyEngine.evaluate()` and `FileWriteQueue.enqueue()`.
- **Failure Mode**: `ScopeViolationError`.
- **Verification Level**: Validates `taskScope.allowedPaths`.

### 2. `assertPlanningModeCannotExecute(context: ExecutionContext)`
- **Purpose**: Guarantees that if the agent is in `planning` mode, no mutating tools (`bash`, `write`, `edit`) can be executed.
- **Location**: `ToolExecutor.executeToolCall()`.
- **Failure Mode**: `ModeViolationError`.
- **Verification Level**: Strict string equality check on `context.mode`.

### 3. `assertLockOwnershipBeforeWrite(taskId: string, filePath: string)`
- **Purpose**: Ensures that no task modifies a file unless it currently holds an exclusive lock via the concurrency manager.
- **Location**: Inside `edit`/`write` handlers or `FileWriteQueue`.
- **Failure Mode**: `ConcurrencyViolationError`.
- **Verification Level**: Interrogates a global or shared `LockManager` (to be implemented).

### 4. `assertValidStateTransition(entityType: "Team" | "Task" | "Worker", currentState: string, nextState: string)`
- **Purpose**: Ensures state machines do not perform illegal transitions (e.g., `completed` -> `running`).
- **Location**: `TeamManager.updateTeamStatus`, `TeamManager.upsertTask`, `TeamManager.updateWorker`.
- **Failure Mode**: `IllegalStateTransitionError`.

### 5. `assertContextPreservation(contextBefore: ExecutionContext, contextAfter: ExecutionContext)`
- **Purpose**: Ensures that during a handoff or a long-running async operation, the `ExecutionContext` does not accidentally drop capabilities, scopes, or modes.
- **Location**: Coordinator-to-Worker delegation handoff.
- **Failure Mode**: `ContextCorruptionError`.

## Implementation Strategy
These assertions should be implemented as pure functions in `src/common/assertions.ts` and injected into the execution flow. They must throw uncatchable custom errors that immediately halt the violating task and trigger a recovery or fail-safe path.
