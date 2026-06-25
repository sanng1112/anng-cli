# Phase H6: Single-Agent vs Multi-Agent Equivalence Verification

> Historical verification artifact: this report compares legacy architectural paths and should not be read as a current-state map of the Go runtime without checking code first.

The architecture dictates that Single-Agent and Multi-Agent paths must be semantically equivalent, specifically regarding:
- Execution contexts
- Policy enforcement
- Tool execution constraints

## Current State Analysis

**Design Equivalence**:
- Both paths utilize `SessionManager.setExecutionContext()`.
- Both paths pass `hooks.executionContext` to `ToolExecutor.executeToolCalls()`.
- `PolicyEngine` wraps all tool executions regardless of whether the caller is a Single-Agent `SessionManager` or a Multi-Agent `AgentWorker`.

**Test Equivalence**:
- Tests exist for Single-Agent `SessionManager` interacting with `PolicyEngine`.
- Tests for `AgentWorker` and `TeamOrchestrator` do not currently perform end-to-end integration tests asserting that a worker restricted by a `taskScope` is properly blocked by the `ToolExecutor` and `PolicyEngine` in a full integration environment.

## Findings & Divergences
- **Semantic Divergence**: None found in the code path. The data structures and invocation chains are completely identical. The single agent constructs an `ExecutionContext` with `taskScope: null`, whereas the Multi-agent `AgentWorker` generates an `ExecutionContext` mapping the worker's glob permissions to `taskScope`. Both hit the exact same `PolicyEngine.evaluate()` gate.
- **Test Gap**: There is insufficient end-to-end testing proving that a Multi-Agent session correctly propagates its restrictions down to the filesystem level identically to a Single-Agent session.

## Verification Action Items
1. Create `src/tests/integration/equivalence.test.ts`.
2. Construct identical prompts.
3. Feed Prompt A to `SessionManager` (Single Agent).
4. Feed Prompt A to `TeamOrchestrator` (Multi Agent).
5. Intercept `PolicyEngine.evaluate` calls using a spy/mock.
6. Assert that both modes result in identical policy decisions for identical actions.
