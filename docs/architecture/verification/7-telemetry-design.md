# Phase H7: Telemetry & Audit Trail Design

> Historical verification artifact: this design note was written during migration and may mention telemetry hooks or runtime boundaries that are not fully implemented in the current Go code.

To verify the Runtime-Enforced Architecture in production, observability must be ubiquitous. We must capture high-resolution events at every critical junction of the execution path.

## Event Schema (`SystemAuditEvent`)

```typescript
type AuditEventType = 
  | "STATE_TRANSITION"
  | "POLICY_DECISION"
  | "CAPABILITY_ACTIVATION"
  | "TOOL_EXECUTION"
  | "LOCK_ACQUISITION"
  | "LOCK_RELEASE"
  | "WORKER_ASSIGNMENT"
  | "TASK_RETRY"
  | "TASK_FAILURE";

interface SystemAuditEvent {
  eventId: string;                 // UUID v4
  correlationId: string;           // Maps to sessionId or teamId
  timestamp: string;               // ISO 8601
  eventType: AuditEventType;
  actorId: string;                 // Agent ID or User
  resource: string;                // File path, Task ID, or Capability ID
  action: string;                  // Tool name, State transition name
  decision?: "ALLOW" | "DENY";     // For Policy decisions
  reason?: string;                 // Failure reason, denial reason
  contextSnapshot: ExecutionContext; // State at the moment of the event
}
```

## Instrumentation Points

1. **State Transitions**:
   - `TeamManager.updateTeamStatus`
   - `TeamManager.updateWorker`
   - `TeamManager.upsertTask`
   *Emits `STATE_TRANSITION` detailing `fromState` and `toState`.*

2. **Policy Decisions**:
   - `PolicyEngine.evaluate`
   *Emits `POLICY_DECISION`. Must log the `decision` ("ALLOW" or "DENY") and `reason`.*

3. **Capability Activation**:
   - `CapabilityRegistry.getActiveCapabilities`
   - `cap.beforeToolExecution` / `cap.afterToolExecution`
   *Emits `CAPABILITY_ACTIVATION` indicating which capabilities affected execution.*

4. **Tool Execution**:
   - `ToolExecutor.executeToolCall`
   *Emits `TOOL_EXECUTION` containing tool arguments and result.*

5. **Lock Lifecycle**:
   - `FileConflictResolver.acquireLock` / `FileConflictResolver.releaseLock`
   - Future OS-level concurrency managers.
   *Emits `LOCK_ACQUISITION` and `LOCK_RELEASE`.*

6. **Failures and Retries**:
   - `AgentWorkerPool.executeWithWorker` (catch blocks)
   - `WorkflowEngine.failTask`
   *Emits `TASK_FAILURE` and `TASK_RETRY`.*

## Retention Strategy
- **File System Persistence**: Append to `~/.anng/audit/<date>.log` as NDJSON.
- **Log Rotation**: Keep 30 days of audit logs locally.
- **Sensitive Data Masking**: Strip raw code contents from tool arguments before logging. Keep file paths and action names.

## Correlation IDs
Every `SystemAuditEvent` must include a `correlationId`.
- **Single-Agent**: The `sessionId`.
- **Multi-Agent**: The `teamId`.
This allows full chronological tracing of an operation from task creation to execution to file locks.
