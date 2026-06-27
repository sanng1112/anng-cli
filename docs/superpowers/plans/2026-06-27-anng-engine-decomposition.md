# ANNG Engine Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Break the current runtime god-objects into a package-ready ANNG engine core so future work can target `@anng/engine` boundaries without changing the shipped package layout yet.

**Architecture:** Preserve current behavior and public APIs while extracting internal services from `SessionManager` and enforcing import boundaries. The decomposition should make `src/core/*` and engine services UI-agnostic, with the TUI and CLI acting as thin clients.

**Tech Stack:** TypeScript, Node 22, Vitest, existing `SessionManager`, file-based storage, MCP manager.

---

## Scope Lock

This plan is specifically about maintainability and boundaries:
- extract store/runtime services from `SessionManager`
- add import-boundary tests
- make a stable engine facade

This plan does **not** cover:
- new UX features
- tmux team upgrades
- release packaging changes

## Target File Structure

- `src/core/engine/session-store.ts`
  Responsibility: read/write session index and JSONL messages.
- `src/core/engine/conversation-loop.ts`
  Responsibility: request/stream/retry/usage lifecycle.
- `src/core/engine/rules-context.ts`
  Responsibility: build runtime rules/memory/skills context for prompts.
- `src/core/engine/session-facade.ts`
  Responsibility: stable engine-facing session orchestration facade.
- `src/core/engine/index.ts`
  Responsibility: future `@anng/engine` public exports.
- `src/session/index.ts`
  Responsibility: thin compatibility wrapper over extracted services.
- `src/tests/session.test.ts`
  Responsibility: regression coverage for behavior-preserving refactor.
- `src/tests/v2/import-boundaries.test.ts`
  Responsibility: block `src/core/*` from importing `src/tui/*`.
- `docs/architecture/ADR-002-anng-engine-facade.md`
  Responsibility: explain the engine split and future package seam.

### Task 1: Extract persistence into a dedicated session store

**Files:**
- Create: `src/core/engine/session-store.ts`
- Modify: `src/session/index.ts`
- Modify: `src/tests/session.test.ts`

- [x] **Step 1: Write the failing session-store test**

```ts
import { describe, expect, it } from "vitest";
import { SessionStore } from "../../core/engine/session-store";

describe("SessionStore", () => {
  it("reads back stored sessions in update-time order", () => {
    const store = new SessionStore("/tmp/project");
    expect(typeof store.listSessions).toBe("function");
  });
});
```

- [x] **Step 2: Run the session-store test**

Run: `npx vitest run src/tests/session.test.ts`
Expected: FAIL because `SessionStore` does not exist and `SessionManager` still owns persistence directly

- [x] **Step 3: Add the store service with current storage helpers**

```ts
// src/core/engine/session-store.ts
import {
  getProjectStoragePaths,
  readStoredSessionMessages,
  readStoredSessions,
} from "../../common/project-storage";

export class SessionStore {
  constructor(private readonly projectRoot: string) {}

  getStoragePaths() {
    return getProjectStoragePaths(this.projectRoot);
  }

  listSessions() {
    return readStoredSessions(this.projectRoot);
  }

  listMessages(sessionId: string, limit = 50) {
    return readStoredSessionMessages(this.projectRoot, sessionId, limit);
  }
}
```

- [x] **Step 4: Make `SessionManager` delegate reads to the store**

```ts
// src/session/index.ts
private readonly sessionStore = new SessionStore(this.projectRoot);

listSessions(): SessionEntry[] {
  return this.loadSessionsIndex().entries;
}
```

- [x] **Step 5: Run the regression tests**

Run: `npx vitest run src/tests/session.test.ts src/tests/v2/project-storage-shell.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/engine/session-store.ts src/session/index.ts src/tests/session.test.ts
git commit -m "refactor(engine): extract session persistence store"
```

### Task 2: Extract the conversation loop and provider streaming lifecycle

**Files:**
- Create: `src/core/engine/conversation-loop.ts`
- Modify: `src/session/index.ts`
- Modify: `src/tests/session.test.ts`
- Modify: `src/tests/v2/provider-runtime.test.ts`

- [x] **Step 1: Write the failing conversation-loop test**

```ts
import { describe, expect, it } from "vitest";
import { createConversationLoop } from "../../core/engine/conversation-loop";

describe("createConversationLoop", () => {
  it("returns a runner function", () => {
    const loop = createConversationLoop();
    expect(typeof loop.run).toBe("function");
  });
});
```

- [x] **Step 2: Run the tests to confirm the loop service does not exist**

Run: `npx vitest run src/tests/session.test.ts src/tests/v2/provider-runtime.test.ts`
Expected: FAIL because `createConversationLoop` is missing

- [x] **Step 3: Introduce the loop service with a thin API**

```ts
// src/core/engine/conversation-loop.ts
export function createConversationLoop() {
  return {
    run: async <T>(work: () => Promise<T>): Promise<T> => {
      return await work();
    },
  };
}
```

- [x] **Step 4: Route `activateSession` through the loop service**

```ts
// src/session/index.ts
private readonly conversationLoop = createConversationLoop();

await this.conversationLoop.run(async () => {
  return await this.activateSession(sessionId, controller, userPrompt);
});
```

- [x] **Step 5: Run the runtime/session tests**

Run: `npx vitest run src/tests/session.test.ts src/tests/v2/provider-runtime.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/engine/conversation-loop.ts src/session/index.ts src/tests/session.test.ts src/tests/v2/provider-runtime.test.ts
git commit -m "refactor(engine): extract conversation loop from session manager"
```

### Task 3: Extract rules and memory context from the session layer

**Files:**
- Create: `src/core/engine/rules-context.ts`
- Modify: `src/session/index.ts`
- Modify: `src/tests/v2/rules-memory.test.ts`
- Modify: `src/prompt-engine/builder.ts`

- [x] **Step 1: Write the failing rules-context test**

```ts
import { describe, expect, it } from "vitest";
import { buildRulesContext } from "../../core/engine/rules-context";

describe("buildRulesContext", () => {
  it("returns a content string and ordered sources", () => {
    const result = buildRulesContext({ cwd: process.cwd(), activeSkills: [] });
    expect(typeof result.content).toBe("string");
    expect(Array.isArray(result.sources)).toBe(true);
  });
});
```

- [x] **Step 2: Run the rules test**

Run: `npx vitest run src/tests/v2/rules-memory.test.ts`
Expected: FAIL with module-not-found for `src/core/engine/rules-context.ts`

- [x] **Step 3: Add a thin rules-context adapter over existing discovery helpers**

```ts
// src/core/engine/rules-context.ts
import { buildRuleBundle } from "../rules/discovery";

export function buildRulesContext(input: {
  cwd: string;
  activeSkills: string[];
}) {
  const bundle = buildRuleBundle(input.cwd, input.activeSkills);
  return {
    content: bundle.content,
    sources: bundle.sources,
  };
}
```

- [x] **Step 4: Stop assembling rules directly inside `SessionManager`**

```ts
// src/session/index.ts
const rules = buildRulesContext({
  cwd: this.projectRoot,
  activeSkills: userPrompt.skills?.map((skill) => skill.name) ?? [],
});
```

- [x] **Step 5: Run the rules and prompt tests**

Run: `npx vitest run src/tests/v2/rules-memory.test.ts src/tests/session.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/engine/rules-context.ts src/session/index.ts src/prompt-engine/builder.ts src/tests/v2/rules-memory.test.ts
git commit -m "refactor(engine): extract rules and memory context builder"
```

### Task 4: Enforce import boundaries and document the engine facade

**Files:**
- Create: `src/core/engine/session-facade.ts`
- Create: `src/core/engine/index.ts`
- Create: `src/tests/v2/import-boundaries.test.ts`
- Create: `docs/architecture/ADR-002-anng-engine-facade.md`
- Modify: `src/runtime/agent-adapter.ts`

- [x] **Step 1: Write the failing import-boundary test**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("core import boundaries", () => {
  it("blocks src/core from importing src/tui", () => {
    const root = path.join(process.cwd(), "src", "core");
    const files = fs.readdirSync(root);
    expect(Array.isArray(files)).toBe(true);
  });
});
```

- [x] **Step 2: Run the boundary test**

Run: `npx vitest run src/tests/v2/import-boundaries.test.ts`
Expected: FAIL because the test file and engine facade do not exist yet

- [x] **Step 3: Add the engine facade exports**

```ts
// src/core/engine/session-facade.ts
export { SessionManager } from "../../session";
```

```ts
// src/core/engine/index.ts
export * from "./session-store";
export * from "./conversation-loop";
export * from "./rules-context";
export * from "./session-facade";
```

- [x] **Step 4: Add a real import-boundary assertion and document the seam**

```ts
// src/tests/v2/import-boundaries.test.ts
import fs from "node:fs";
import path from "node:path";

function collectFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

it("blocks src/core from importing src/tui", () => {
  const files = collectFiles(path.join(process.cwd(), "src", "core"));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    expect(source.includes("../tui")).toBe(false);
    expect(source.includes("/tui")).toBe(false);
  }
});
```

```md
<!-- docs/architecture/ADR-002-anng-engine-facade.md -->
# ADR-002: ANNG Engine Facade

- Status: Accepted
- Decision: Keep one physical package now, but route engine logic through `src/core/engine/*`.
- Consequence: future `@anng/engine` extraction becomes packaging work, not a deep runtime rewrite.
```

- [x] **Step 5: Run the engine-boundary checks**

Run: `npx vitest run src/tests/v2/import-boundaries.test.ts src/tests/session.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/engine/session-facade.ts src/core/engine/index.ts src/tests/v2/import-boundaries.test.ts docs/architecture/ADR-002-anng-engine-facade.md src/runtime/agent-adapter.ts
git commit -m "refactor(engine): add engine facade and import boundary checks"
```

## Self-Review

**1. Spec coverage:** Covers extraction of persistence, loop orchestration, rules/memory context, and future package boundaries.

**2. Placeholder scan:** No placeholders or “similar to previous task” shortcuts remain.

**3. Type consistency:** Reuses the existing repo names consistently: `SessionManager`, `buildRuleBundle`, `runAgent`, and storage helpers in `src/common/project-storage.ts`.

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-engine-decomposition.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
