# Agent Contract Specification

## 1. Overview
The current Multi-Agent implementation is essentially "cloning" the single-agent and telling it to act like a worker or coordinator via Prompt strings.
The Target Architecture replaces this with explicit `AgentContracts`. Every agent is defined by a strict contract that dictates exactly what it can see, what it can do, and how it handles edge cases.

## 2. The Contract Interface

```typescript
export type AgentRole = "coordinator" | "worker" | "reviewer";

export interface AgentContract {
  readonly id: string;
  readonly role: AgentRole;
  readonly authorityLevel: number; // 0 = lowest, 100 = highest
  readonly scope: string[]; // Glob paths this agent is allowed to touch
  
  readonly allowedCapabilities: string[]; // Which Capability IDs are active
  readonly maxTurns: number; // Prevent infinite loops
}
```

## 3. Predefined Roles

### 3.1 Coordinator
- **Role:** Orchestrates the high-level plan. Breaks down tasks.
- **Authority:** High (100).
- **Scope:** Complete Workspace `["**/*"]`.
- **Allowed Tools:** `AssignTask`, `AskUserQuestion`, `UpdatePlan`, `read`.
- **Denied Tools:** `write`, `edit`, `bash`. (Coordinator plans, workers do).

### 3.2 Worker
- **Role:** Executes a specific coding task.
- **Authority:** Low (10).
- **Scope:** Restricted strictly to `Task.relatedFiles` assigned by Coordinator.
- **Allowed Tools:** `read`, `write`, `edit`, `bash` (if executing tests).
- **Escalation Path:** If a Worker realizes it needs to modify a file outside its scope, it MUST abort the current tool and use the `EscalateTask` (or return an error) indicating the missing scope, yielding control back to Coordinator.

### 3.3 Reviewer (Future)
- **Role:** Audits diffs or test results.
- **Authority:** Medium (50).
- **Scope:** Complete Workspace `["**/*"]` (Read Only).
- **Allowed Tools:** `read`, `bash` (test runners).
- **Denied Tools:** `write`, `edit`.

## 4. Trust Boundaries
1. **Coordinator to Worker:** Coordinator DOES NOT trust the Worker to respect scope. `PolicyEngine` intercepts Worker writes and asserts against the Worker's `AgentContract.scope`.
2. **Worker to Executor:** Worker DOES NOT execute directly. It submits a request. `Executor` fulfills the request ONLY if the Contract allows it.
