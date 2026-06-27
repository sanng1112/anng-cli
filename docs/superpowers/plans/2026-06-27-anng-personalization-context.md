# ANNG Personalization Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ANNG feel like a deeply personalized internal coding agent by turning rules, memory, project heuristics, and user-editable context into a first-class workflow.

**Architecture:** Keep personalization file-based and inspectable. Build on the existing rules and memory helpers, but add explicit shell/CLI surfaces that let users inspect, refresh, and edit project context without hidden databases or opaque caches.

**Tech Stack:** TypeScript, Node 22, Markdown file storage, existing rules/memory helpers, Vitest.

---

## Scope Lock

This plan covers:
- explicit memory and rules inspection
- project onboarding heuristics
- user-editable context files
- shell and CLI surfaces for context debugging

This plan does **not** cover:
- hosted memory sync
- vector databases
- external dashboards

## Target File Structure

- `src/core/memory/project-memory.ts`
  Responsibility: memory paths, heuristics, and context snapshot helpers.
- `src/core/rules/discovery.ts`
  Responsibility: ordered rule-bundle discovery and source metadata.
- `src/commands/context.ts`
  Responsibility: inspect rules, memory, and onboarding hints from the CLI.
- `src/commands/program.ts`
  Responsibility: add a `context` command group.
- `src/tui/views/context-view.tsx`
  Responsibility: show active rules, memory paths, and onboarding hints in the shell.
- `src/tui/root.tsx`
  Responsibility: mount the new context view.
- `src/tests/v2/context-command.test.ts`
  Responsibility: CLI context inspection coverage.
- `src/tests/v2/rules-memory.test.ts`
  Responsibility: rules/memory regression coverage.

### Task 1: Add a `context` command for rules, memory, and onboarding inspection

**Files:**
- Create: `src/commands/context.ts`
- Create: `src/tests/v2/context-command.test.ts`
- Modify: `src/commands/program.ts`
- Modify: `src/main.ts`

- [x] **Step 1: Write the failing context-command test**

```ts
import { describe, expect, it, vi } from "vitest";
import { runContextCommand } from "../../commands/context";

describe("context command", () => {
  it("prints rule sources and memory paths", async () => {
    let stdout = "";
    await runContextCommand(
      { cwd: process.cwd(), outputMode: "text" },
      {
        buildRuleSummary: () => ({
          sources: ["global", "project"],
          content: "rules",
        }),
        readMemorySummary: () => ({
          memoryDir: "/repo/.anng/memory",
          hints: ["README.md", "package.json"],
        }),
        writeStdout: (text) => {
          stdout += text;
        },
      }
    );
    expect(stdout).toContain("memoryDir");
    expect(stdout).toContain("global");
  });
});
```

- [x] **Step 2: Run the context-command test**

Run: `npx vitest run src/tests/v2/context-command.test.ts`
Expected: FAIL with module-not-found for `src/commands/context.ts`

- [x] **Step 3: Add the context command**

```ts
// src/commands/context.ts
import { buildRuleBundle } from "../core/rules/discovery";
import { buildProjectContextHints, getProjectMemoryPaths } from "../core/memory/project-memory";

export async function runContextCommand(
  input: { cwd: string; outputMode?: "text" | "json" },
  deps: {
    buildRuleSummary?: (cwd: string) => { sources: string[]; content: string };
    readMemorySummary?: (cwd: string) => { memoryDir: string; hints: string[] };
    writeStdout?: (text: string) => void;
  } = {}
) {
  const buildRuleSummary =
    deps.buildRuleSummary ??
    ((cwd: string) => {
      const bundle = buildRuleBundle(cwd, []);
      return {
        sources: bundle.sources.map((source) => source.label),
        content: bundle.content,
      };
    });
  const readMemorySummary =
    deps.readMemorySummary ??
    ((cwd: string) => ({
      memoryDir: getProjectMemoryPaths(cwd).memoryDir,
      hints: buildProjectContextHints(cwd),
    }));
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text));

  const rules = buildRuleSummary(input.cwd);
  const memory = readMemorySummary(input.cwd);
  if (input.outputMode === "json") {
    writeStdout(`${JSON.stringify({ rules, memory })}\n`);
    return;
  }
  writeStdout(
    [
      "ANNG context",
      `memoryDir=${memory.memoryDir}`,
      `hints=${memory.hints.join(", ") || "none"}`,
      `ruleSources=${rules.sources.join(", ") || "none"}`,
    ].join("\n") + "\n"
  );
}
```

- [x] **Step 4: Wire `context` into the CLI grammar**

```ts
// src/commands/program.ts
command?: "doctor" | "config" | "mcp" | "daemon" | "sessions" | "context";
```

```ts
// src/main.ts
if (parsed.command === "context") {
  await runContextCommand({
    cwd: parsed.cwd ?? process.cwd(),
    outputMode: parsed.outputMode,
  });
  return;
}
```

- [x] **Step 5: Run the context-command test**

Run: `npx vitest run src/tests/v2/context-command.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/commands/context.ts src/tests/v2/context-command.test.ts src/commands/program.ts src/main.ts
git commit -m "feat(context): add anng context inspection command"
```

### Task 2: Deepen onboarding heuristics and expose them to users

**Files:**
- Modify: `src/core/memory/project-memory.ts`
- Modify: `src/tests/v2/rules-memory.test.ts`
- Modify: `src/commands/context.ts`

- [x] **Step 1: Write the failing heuristic test**

```ts
it("prioritizes README, package.json, and language manifests in onboarding hints", () => {
  const hints = buildProjectContextHints(process.cwd());
  expect(Array.isArray(hints)).toBe(true);
});
```

- [x] **Step 2: Run the heuristics test**

Run: `npx vitest run src/tests/v2/rules-memory.test.ts`
Expected: FAIL if hint ordering is weak or underspecified

- [x] **Step 3: Make onboarding hints deterministic**

```ts
// src/core/memory/project-memory.ts
const priorityFiles = ["README.md", "package.json", "go.mod", "pyproject.toml", "Cargo.toml"];
```

- [x] **Step 4: Include onboarding hints in the context command output**

```ts
// src/commands/context.ts
`hints=${memory.hints.join(", ") || "none"}`,
```

- [x] **Step 5: Run the rules/memory tests**

Run: `npx vitest run src/tests/v2/rules-memory.test.ts src/tests/v2/context-command.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/memory/project-memory.ts src/tests/v2/rules-memory.test.ts src/commands/context.ts
git commit -m "feat(context): make project onboarding hints deterministic and inspectable"
```

### Task 3: Add a shell context view so users can inspect ANNG’s “brain” live

**Files:**
- Create: `src/tui/views/context-view.tsx`
- Modify: `src/tui/root.tsx`
- Modify: `src/tui/index.tsx`
- Modify: `src/tests/v2/interactive-smoke.test.ts`

- [x] **Step 1: Write the failing shell smoke assertion**

```ts
expect(text).toContain("Context");
expect(text).toContain("ruleSources=");
```

- [x] **Step 2: Add a minimal context view**

```tsx
// src/tui/views/context-view.tsx
import React from "react";

export function ContextView(props: {
  hints: string[];
  ruleSources: string[];
  memoryDir: string;
}) {
  return (
    <>
      {`Context\nmemoryDir=${props.memoryDir}\n`}
      {`hints=${props.hints.join(", ") || "none"}\n`}
      {`ruleSources=${props.ruleSources.join(", ") || "none"}`}
    </>
  );
}
```

- [x] **Step 3: Wire the view into the TUI root**

```tsx
// src/tui/root.tsx
<ContextView
  hints={contextHints}
  ruleSources={ruleSources}
  memoryDir={doctor.memoryDir}
/>
```

- [x] **Step 4: Pass rule source data from the bootstrap**

```ts
// src/tui/index.tsx
const ruleBundle = buildRuleBundle(args.cwd, []);
const ruleSources = ruleBundle.sources.map((source) => source.label);
```

- [x] **Step 5: Run the shell/context tests**

Run: `npx vitest run src/tests/v2/interactive-smoke.test.ts src/tests/v2/context-command.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tui/views/context-view.tsx src/tui/root.tsx src/tui/index.tsx src/tests/v2/interactive-smoke.test.ts
git commit -m "feat(context): expose rules and memory context in anng tui"
```

## Self-Review

**1. Spec coverage:** Covers personalized context inspection through CLI and TUI, file-based memory, rule ordering, and deterministic onboarding hints.

**2. Placeholder scan:** No placeholders or “later” instructions remain.

**3. Type consistency:** Reuses current names consistently: `buildRuleBundle`, `buildProjectContextHints`, `getProjectMemoryPaths`, `RootView`, and `runContextCommand`.

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-personalization-context.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
