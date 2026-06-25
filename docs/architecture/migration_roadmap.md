# Architecture Migration Roadmap

> Historical migration plan: this document was written during the TypeScript-to-Go transition. It may reference legacy files such as `src/...` or intermediate stages that no longer match the current Go runtime exactly.

## Overview
This roadmap details the systematic transition from the legacy "Prompt-Centric" architecture to the target "Runtime-Enforced" architecture. The migration is designed to be phased, with verifiable checkpoints, eliminating the risk of a "big-bang" rewrite.

---

## Phase A: Stop the Bleed (COMPLETED)
**Objective:** Immediately halt destructive behaviors caused by boundary leaks.

| Step | Action | Status |
| :--- | :--- | :--- |
| A.1 | **Mode Propagation:** Pass `planMode` and `autoAccept` from `AppContainer` through `TeamOrchestrator` down to `AgentWorkerOptions`. | ✅ Done |
| A.2 | **Concurrency Patch:** Update `ParallelExecutor` to actively call `FileConflictResolver.acquireLock` before launching tasks. | ✅ Done |
| A.3 | **Default Lock Strategy:** Change `FileConflictResolver` default strategy from `last-write-wins` to `fail-on-conflict`. | ✅ Done |
| A.4 | **Invariant Tests:** Implement Vitest suite `invariants.test.ts` to assert A.1 to A.3. | ✅ Done |

---

## Phase B: Establish the Boundary (COMPLETED)
**Objective:** Decouple Rules from the LLM Prompt.

| Step | Action | Status |
| :--- | :--- | :--- |
| B.1 | **Prompt Monolith Cleanup:** Strip out Mode rules, workflow constraints, and execution guidelines from `src/prompt.ts`. | ✅ Done |
| B.2 | **Runtime Guard:** Intercept tool evaluations in `computeToolCallPermissions` to return `"deny"` for mutating actions when in `planMode`. | ✅ Done |
| B.3 | **Error Feedback:** Ensure `deny` results pass the error string explicitly back to the LLM. | ✅ Done |

---

## Phase C: Execution Context & Policy Engine Refactoring (Target)
**Objective:** Formalize the State Machine and Runtime Middleware.

| Step | Action | Risk | Rollback |
| :--- | :--- | :--- | :--- |
| C.1 | Implement `ExecutionContext` interface and replace discrete variables across `SessionManager` and `TeamOrchestrator`. | High (Refactoring massive object shapes) | Git Revert |
| C.2 | Build `PolicyEngine` middleware interceptor class. | Medium | Bypass interceptor flag |
| C.3 | Relocate logic from `permissions.ts` into `PolicyEngine`. | Low | Keep legacy `permissions.ts` as fallback |

---

## Phase D: Agent Contracts & Scope Jails (Target)
**Objective:** Establish secure sub-agent boundaries.

| Step | Action | Risk | Rollback |
| :--- | :--- | :--- | :--- |
| D.1 | Implement `AgentContract` typing. | Low | N/A |
| D.2 | Update `AgentWorker` constructor to accept `AgentContract`. | Low | N/A |
| D.3 | Add Scope Evaluator to `PolicyEngine` (assert `tool.file_path` is within `contract.scope`). | High (Might block valid scaffolding) | Set scope to `**/*` globally |

---

## Phase E: Capability System (Target)
**Objective:** Replace string-based Skills with executable Modules.

| Step | Action | Risk | Rollback |
| :--- | :--- | :--- | :--- |
| E.1 | Define `Capability` Interface. | Low | N/A |
| E.2 | Implement `CoreSoftwareEngineeringCapability` bridging legacy `unified-guidelines.md`. | Low | N/A |
| E.3 | Delete Markdown loader and inject Capability outputs into the Prompt. | Medium | Restore `.md` loader |
| E.4 | Connect `Capability.afterToolExecution` hooks to `ToolExecutor`. | High | Disable hooks |
