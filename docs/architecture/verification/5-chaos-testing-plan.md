# Phase H5: Chaos Engineering & Fault Injection Matrix

> Historical verification artifact: this document captures migration-era chaos-testing goals and may refer to abstractions from the removed TypeScript codebase.

To guarantee that the Verified Runtime-Enforced Architecture is reliable, the system must survive random, catastrophic failures at various runtime execution layers. This requires a Chaos Test Matrix that validates recovery mechanisms.

## Chaos Test Matrix

| Component | Fault Injected | Expected Recovery Behavior | Verification Criteria |
|---|---|---|---|
| **Worker** | Crash before lock release | Concurrency manager detects dead worker via heartbeat or timeout, releases lock, and re-queues task. | Lock is released within `<timeout>`, task transitions to `failed` or `pending`. |
| **Worker** | Crash during write | `FileWriteQueue` or filesystem transaction rollback ensures no corrupt, half-written files. | Original file is unmodified, or fully modified. File state is valid. |
| **Worker** | Crash during capability hook | Capability execution is sandboxed/caught. System terminates the tool call gracefully and reports error. | Tool returns `ok: false` with capability crash details. System doesn't hang. |
| **Coordinator** | Crash during delegation | State machine transitions team to `interrupted`. Partial decomposition is saved. | On reboot, session loads and resumes decomposition or gracefully halts. |
| **Coordinator** | Crash during aggregation | `ResultAggregator` state is persisted. On resume, re-aggregates based on `completed` tasks. | Result state matches successful task outputs. No data loss. |
| **PolicyEngine**| Throw internal exceptions | `PolicyEngine` fails closed. If it cannot evaluate, it MUST return `DENY`. | Tool execution halts immediately. Action is not permitted. |
| **PolicyEngine**| Return malformed results | Type validation in `ToolExecutor` catches bad responses, defaults to `DENY`. | Tool execution halts immediately. Action is not permitted. |
| **Capabilities**| Capability timeout | Capability hooks (`beforeToolExecution`, etc.) are wrapped in timeouts. Slow capabilities are aborted. | Tool executes after timeout, or capability error is thrown. No infinite hangs. |
| **Capabilities**| Capability exception | Exceptions inside user-defined capabilities are caught and do not crash the `ToolExecutor`. | Tool returns `ok: false` containing the capability error stack trace. |

## Verification Tools
- Use a fault injection framework or monkey-patching in Jest (e.g., overriding `fs.writeFileSync` to randomly throw `ENOSPC`).
- Validate the post-chaos state by reading the session log (`SessionManager.getTeam()`) and checking `TeamStatus` against the formal state machine.
