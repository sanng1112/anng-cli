# Phase H2: Formal State Machine Audit

> Historical verification artifact: this audit reflects migration-period architecture and may reference legacy TypeScript files or abstractions not present in the current Go runtime.

## Current Assessment
The system defines state types (`TeamStatus`, `TeamTaskStatus`, `WorkerStatus`) in `src/team/types.ts`. However, transitions are currently managed via direct property mutation in `src/team/team-manager.ts` (`updateTeamStatus`) without verifying the previous state.

- **Current States**: Defined via TypeScript unions.
- **Transition Graph**: Implicit in orchestrator logic, not formally modeled.
- **Terminal States**: `completed`, `failed`, `interrupted` (implicitly terminal).
- **Illegal Transitions Possible**: Yes. A task can go from `completed` back to `running`. A team can go from `failed` to `dispatching`.
- **Enforcement**: By convention only. Code does not throw errors for illegal state transitions.

## Proposed Formal State Machine Specification (`state-machine.ts` logic)

To move to a Verified Runtime-Enforced Architecture, the system must enforce strict transitions.

### Team Transitions
| Current State | Event/Action | Next State |
|---|---|---|
| `initializing` | Decomposition Starts | `waiting_for_decomposition` |
| `waiting_for_decomposition` | Decomposition Success | `dispatching` |
| `waiting_for_decomposition` | Decomposition Failed | `failed` |
| `dispatching` | Workers Assigned | `running` |
| `dispatching` | Critical Failure | `failed` |
| `running` | All Tasks Success | `completed` |
| `running` | Critical Failure | `failed` |
| *Any non-terminal* | Abort Triggered | `cancelled` / `interrupted` |

### Task Transitions
| Current State | Event/Action | Next State |
|---|---|---|
| `pending` | Dependencies Met | `assigned` |
| `assigned` | Worker Starts | `executing` |
| `executing` | Success | `completed` |
| `executing` | Failure (will retry) | `retrying` |
| `retrying` | Worker Starts | `executing` |
| `executing` | Max Retries Hit | `failed` |
| *Any* | Upstream Failed | `skipped` |

### Required Enforcement Mechanism
Transitions must be performed via a pure reducer function:
```typescript
function transitionTeamState(currentState: TeamStatus, event: TeamEvent): TeamStatus {
  // Enforces valid transitions, throws StateTransitionError otherwise.
}
```
