# Execution Context Specification

## 1. Overview
The `ExecutionContext` is the canonical, immutable data structure representing the global state of an agent's run at any given moment. It replaces isolated state variables, CLI flags, and prompt-embedded policies to guarantee that rules (Modes, Permissions) propagate perfectly across boundaries (Single-agent vs Multi-agent).

## 2. Core Principles
1. **Single Source of Truth:** Any decision regarding what an agent can or cannot do must query `ExecutionContext`.
2. **Immutability:** `ExecutionContext` must never be mutated directly. Any state transition must produce a cloned copy with updated fields via a pure function `Transition(ctx, event)`.
3. **Propagation:** When a Coordinator spawns a Worker, the Worker MUST inherit the Coordinator's `ExecutionContext` (optionally narrowing `taskScope`, but never expanding it).

## 3. Data Schema

```typescript
export type OperatingMode = "planning" | "autonomous" | "interactive" | "team";
export type ExecutionPhase = "initialized" | "planning" | "waiting_approval" | "executing" | "completed" | "failed";

export interface PermissionSettings {
  readonly canWrite: boolean;
  readonly canExecute: boolean;
  readonly autoAcceptTools: boolean;
  readonly requireUserApproval: string[]; // List of tool names requiring explicit UI approval
}

export interface TaskScope {
  readonly taskId: string;
  readonly allowedPaths: string[]; // Absolute paths or glob patterns. Empty means no limits.
  readonly readOnlyPaths: string[]; 
}

export interface ExecutionContext {
  readonly sessionId: string;
  readonly mode: OperatingMode;
  readonly phase: ExecutionPhase;
  readonly permissions: PermissionSettings;
  readonly activeAgentId: string;
  readonly workspaceRoot: string;
  readonly taskScope: TaskScope | null;
  // capabilities map is omitted from serialization to prevent prompt inflation
  readonly activeCapabilities: string[]; // IDs of injected capability modules
}
```

## 4. State Transitions & Ownership

| Field | Creator | Readers | Writers |
| :--- | :--- | :--- | :--- |
| `sessionId` | `SessionManager` / `AppContainer` | Telemetry, UI | None (Immutable) |
| `mode` | `CLI Parser` -> `AppContainer` | `PolicyEngine`, UI | None (Immutable for the session) |
| `phase` | `TeamOrchestrator` / `SessionManager` | UI, State Machine | State Machine Transition Functions |
| `permissions` | Computed from `mode` upon Init | `PolicyEngine` | None (Derived from Mode) |
| `taskScope` | `TeamOrchestrator` | `PolicyEngine` (Scope Guard) | `TeamOrchestrator` (when assigning worker) |

## 5. Serialization Rules
- `ExecutionContext` must be serializable to JSON so it can be passed to worker processes if the executor scales to multi-processing.
- **Rule:** Functions, classes, and capability instances are strictly forbidden inside `ExecutionContext`. Store their `string` IDs instead.
