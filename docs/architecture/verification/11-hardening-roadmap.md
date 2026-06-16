# Architecture Hardening Roadmap

To resolve the remaining risks and achieve full Verification, the following roadmap must be executed:

## Step 1: Formalize State Transitions
1. Create `src/team/state-machine.ts`.
2. Implement strict reducer functions for `TeamStatus`, `TeamTaskStatus`, and `WorkerStatus`.
3. Update `TeamManager` to use reducers. Throw `IllegalStateTransitionError` on violations.
4. Add state transition assertions.

## Step 2: Runtime File Locking (Concurrency Control)
1. Implement `LockManager` with read/write mutexes.
2. Update `ToolExecutor` (or specific `write`/`edit`/`bash` handlers) to `acquireLock()` prior to execution.
3. Use `finally` blocks to guarantee `releaseLock()`.
4. Validate lock lifecycle with chaos testing (injecting process crashes).

## Step 3: Implement Telemetry & Auditing
1. Build `AuditEventLogger` based on the design in Phase H7.
2. Inject telemetry calls into `PolicyEngine`, `ToolExecutor`, `CapabilityRegistry`, and `TeamManager`.
3. Correlate all logs via `sessionId` and `teamId`.

## Step 4: Verification Harness & Property Fuzzing
1. Setup `fast-check` in the test suite.
2. Implement the Property Tests designed in Phase H4.
3. Write the Single vs Multi Agent Equivalence tests (Phase H6).
4. Run Chaos testing (Phase H5) locally using Jest monkey-patching.

## Step 5: Final ADR Validation
Once Steps 1-4 are complete, re-evaluate the Reliability Scorecard (Phase H9). The architecture will officially graduate when the score exceeds 95/100.
