# Policy Engine Specification

## 1. Overview
The `PolicyEngine` is the strict runtime guard of the application. It sits completely independently from the LLM prompt. Even if the LLM ignores instructions or hallucinations occur, the Policy Engine prevents unauthorized actions before they reach the `ToolExecutor`.

## 2. Core Responsibilities
1. Intercept all outgoing tool execution requests from the Agent.
2. Read the `ExecutionContext` to determine current permissions and scope.
3. Allow, Deny, or Request Approval for the tool call.

## 3. Data Structures

```typescript
export type PolicyDecisionType = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface PolicyDecision {
  type: PolicyDecisionType;
  reason?: string; // Forwarded to the LLM if DENY so it can learn and self-correct
}

export interface PolicyRequest {
  toolName: string;
  arguments: Record<string, any>;
  context: ExecutionContext;
}
```

## 4. Rule Categories & Enforcement Points

### 4.1 Mode Enforcement
If `context.mode === "planning"`:
- **DENY:** `bash`, `write`, `edit` (Any mutating state).
- **ALLOW:** `read`, `search`, `view_file`.
- **REQUIRE_APPROVAL:** N/A (Hard deny mutations to prevent partial state corruption).

### 4.2 Scope Enforcement (Jail)
If `context.taskScope` is defined:
- **DENY:** Any file access (read/write/edit) where the `arguments.file_path` is not a child of `context.workspaceRoot`.
- **DENY:** Any file `write` or `edit` where `arguments.file_path` is NOT present in `taskScope.allowedPaths`.

### 4.3 Agent Enforcement
- Only `Coordinator` role can call `UpdatePlan` or `AssignTask` tools.
- `Worker` attempting to call `AssignTask` -> **DENY**.

## 5. Audit & Telemetry
Every time the `PolicyEngine` evaluates a rule and returns a `DENY`, it MUST emit a telemetry event:

```typescript
EventEmitter.emit("POLICY_VIOLATION", {
  timestamp: Date.now(),
  agentId: context.activeAgentId,
  toolAttempted: request.toolName,
  reason: decision.reason
});
```

## 6. Failure Behavior
If the Policy Engine denies an action, the system DOES NOT crash.
Instead, it catches the internal `PermissionDeniedError` and feeds it back to the LLM as a Tool Execution Result:
`{ "error": "POLICY_DENY: You cannot use 'write' in planning mode. Use 'UpdatePlan' instead." }`
