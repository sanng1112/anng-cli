# Remaining Architectural Risks

> Historical verification artifact: this risk list was generated during migration and should be interpreted as design-history context rather than a guaranteed current runtime gap list.

Based on the H1-H9 audit, the system faces several severe architectural risks preventing it from being classified as a Verified architecture.

## 1. Concurrency Data Corruption (Critical Risk)
**Risk**: Multiple agents (`AgentWorker`) running in parallel (`ParallelExecutor`) can concurrently execute `write` or `edit` tools targeting the same underlying files.
**Cause**: The `FileConflictResolver` only checks for static overlap in `TeamTask` dependencies. There is zero runtime locking enforced at the `ToolExecutor` level. 
**Impact**: Silent file corruption, interleaved code blocks, broken syntax.

## 2. Invalid State Machine Transitions (High Risk)
**Risk**: Coordinator and Workers can enter impossible states (e.g., executing a task that has already been aborted or completed).
**Cause**: `TeamManager.updateTeamStatus` accepts arbitrary string updates without verifying the current state.
**Impact**: Ghost tasks, unkillable workers, and resource leaks during complex workflow interruptions.

## 3. Scope Traversal Bypass (Moderate Risk)
**Risk**: A malicious or confused agent might trick the `PolicyEngine` into approving an out-of-scope path using complex relative pathing or symlinks.
**Cause**: `taskScope` glob enforcement has not been mathematically verified against traversal fuzzing (`fast-check` property tests).
**Impact**: Privilege escalation within the workspace.

## 4. Unauditable Security Events (Moderate Risk)
**Risk**: We cannot currently prove *when* or *why* an action was denied or allowed in a multi-agent distributed run.
**Cause**: Missing structured telemetry (`SystemAuditEvent`).
**Impact**: Impossible to debug complex, emergent failures in multi-agent swarms.
