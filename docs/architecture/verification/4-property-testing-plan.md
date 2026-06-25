# Phase H4: Property-Based Verification Plan

> Historical verification artifact: this plan predates the current Go runtime surface and still includes legacy TypeScript paths and tooling references.

To prove that the architecture is safe and the `PolicyEngine` is watertight, we must implement property-based testing (fuzzing) using a library like `fast-check`.

## Verification Objective
Prove that the `PolicyEngine` never allows forbidden actions regardless of the combination of tool calls, agent assignments, task scopes, state transitions, and active capabilities.

## Test Generation Dimensions

We will generate 10,000+ randomized scenarios varying the following axes:

### 1. Context Generation (`ExecutionContext`)
- **Mode**: `planning`, `autonomous`, `interactive`.
- **Permissions**: Random boolean combinations of `canWrite`, `canExecute`, `autoAcceptTools`.
- **Scope**: Random glob patterns (`["src/**/*.ts"]`, `[]`, `["*"]`).
- **Capabilities**: Random subsets of active Capability IDs.

### 2. Tool Request Generation (`PolicyRequest`)
- **Tool Names**: `bash`, `read`, `write`, `edit`, `invalid_tool`.
- **Arguments**:
  - `file_path`: Paths matching and completely failing the `taskScope` glob patterns.
  - Path traversal attempts: `../../etc/passwd`, `/etc/shadow`.
  - Nested paths: `src/backend/../ui/app.ts`.

## Core Properties to Verify

### Property 1: The Planning Jail
**Invariant**: If `context.mode === "planning"`, ANY mutating tool request (`bash`, `write`, `edit`) MUST yield `DENY`.
```typescript
fc.assert(
  fc.property(genPlanningContext(), genMutatingToolRequest(), (ctx, req) => {
    const engine = new PolicyEngine();
    return engine.evaluate({ ...req, context: ctx }).type === "DENY";
  })
);
```

### Property 2: The Scope Jail
**Invariant**: If `context.taskScope` is defined, ANY `write` or `edit` request to a `file_path` that does NOT match the globs in `taskScope.allowedPaths` MUST yield `DENY`.
```typescript
fc.assert(
  fc.property(genRestrictedContext(), genOutOfScopeToolRequest(), (ctx, req) => {
    const engine = new PolicyEngine();
    return engine.evaluate({ ...req, context: ctx }).type === "DENY";
  })
);
```

### Property 3: Safe Fallback
**Invariant**: Any unknown tool or malformed argument structure MUST safely fall back to `ALLOW` (so the underlying handler can throw a validation error) OR `DENY` if it resembles a dangerous payload. Currently, `PolicyEngine` defaults to `ALLOW` for unknown tools, shifting validation to handlers. This property verifies no undefined behavior occurs.

## Execution Requirements
- Implement the fuzzer in `src/tests/property/policy.test.ts`.
- Run as a required CI step.
- Target: 10,000 iterations without a single invariant violation.
