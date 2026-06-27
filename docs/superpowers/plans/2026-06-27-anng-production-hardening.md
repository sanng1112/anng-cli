# ANNG Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current ANNG CLI into a production-ready release candidate by removing legacy entrypoint ambiguity, aligning docs/package metadata with the shipped runtime, and adding a deterministic release gate.

**Architecture:** Keep the runtime architecture intact, but collapse duplicate entry surfaces and stale docs so the package tells one coherent story. Treat release hardening as contract work: one CLI surface, one config story, one packaging story, one verification command set.

**Tech Stack:** TypeScript, Node 22, npm packaging, Vitest, current CLI/runtime files, Markdown docs.

---

## Scope Lock

This plan covers:
- release metadata and packaging cleanup
- legacy entrypoint removal or containment
- docs parity with shipped behavior
- final verification gate for publishable builds

This plan does **not** cover:
- new UX features
- engine decomposition
- autonomy feature expansion

## Target File Structure

- `package.json`
  Responsibility: package metadata, scripts, published files, bin mapping.
- `src/index.ts`
  Responsibility: canonical CLI entrypoint.
- `src/cli.tsx`
  Responsibility: compatibility shim or removal target.
- `README.md`
  Responsibility: accurate public product contract.
- `README-en.md`
  Responsibility: English parity for release docs.
- `README-zh_CN.md`
  Responsibility: Chinese parity for release docs.
- `scripts/release-check.mjs`
  Responsibility: one command to validate the package before publish.
- `src/tests/v2/release-surface.test.ts`
  Responsibility: release-surface contract checks.
- `.github/workflows/release-check.yml`
  Responsibility: CI gate for release verification.

### Task 1: Collapse the CLI entry surface to one canonical runtime path

**Files:**
- Create: `src/tests/v2/release-surface.test.ts`
- Modify: `package.json`
- Modify: `src/index.ts`
- Modify: `src/cli.tsx`

- [x] **Step 1: Write the failing release-surface test**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("release surface", () => {
  it("publishes a single canonical CLI entrypoint", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      bin?: Record<string, string>;
      main?: string;
    };

    expect(pkg.bin?.anng).toBe("./dist/index.js");
    expect(pkg.main).toBe("./dist/index.js");
  });
});
```

- [x] **Step 2: Run the release-surface test**

Run: `npx vitest run src/tests/v2/release-surface.test.ts`
Expected: FAIL if stale package metadata or duplicate runtime entry assumptions remain

- [x] **Step 3: Make `src/index.ts` the only public CLI bootstrap**

```ts
// src/index.ts
import { runCli } from "./main";

void runCli().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

```ts
// src/cli.tsx
// Legacy compatibility bootstrap retained temporarily for older local scripts.
import "./index";
```

- [x] **Step 4: Remove ambiguity from package metadata**

```json
{
  "bin": {
    "anng": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "files": [
    "dist/index.js",
    "dist/bundled/**",
    "templates/tools/**",
    "templates/prompts/**",
    "templates/skills/**",
    "README.md",
    "README-en.md",
    "README-zh_CN.md",
    "LICENSE"
  ]
}
```

- [x] **Step 5: Run the release-surface test**

Run: `npx vitest run src/tests/v2/release-surface.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tests/v2/release-surface.test.ts package.json src/index.ts src/cli.tsx
git commit -m "chore(release): collapse anng cli entry surface to one canonical path"
```

### Task 2: Rewrite the public docs to match the actual shipped product

**Files:**
- Modify: `README.md`
- Modify: `README-en.md`
- Modify: `README-zh_CN.md`
- Modify: `src/commands/help.ts`
- Modify: `src/tests/v2/release-surface.test.ts`

- [x] **Step 1: Add a failing test that README and help both mention the shipped command groups**

```ts
it("documents the command groups that the runtime actually ships", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  expect(readme).toContain("anng doctor");
  expect(readme).toContain("anng sessions");
  expect(readme).toContain("anng mcp");
  expect(readme).toContain("anng daemon");
});
```

- [x] **Step 2: Run the docs parity test**

Run: `npx vitest run src/tests/v2/release-surface.test.ts`
Expected: FAIL if README still promises stale or missing surface area

- [x] **Step 3: Rewrite the command section around the new shell and command groups**

```md
## Commands

- `anng`
  Start the interactive ANNG terminal shell.
- `anng "prompt"`
  Run one-shot mode and print the result to stdout.
- `anng doctor`
  Check runtime health, settings, tmux availability, MCP visibility, and key-rotation diagnostics.
- `anng sessions`
  Inspect persisted session history.
- `anng mcp`
  Inspect configured and internal MCP tools.
- `anng daemon`
  Inspect, cancel, and review long-running daemon tasks.
```

- [x] **Step 4: Align the help output with the docs**

```ts
// src/commands/help.ts
"Commands:",
"  config                  Print the merged ANNG settings summary",
"  doctor                  Check runtime health and local dependencies",
"  mcp                     Inspect configured MCP servers and tools",
"  daemon                  Inspect background daemon tasks",
"  sessions                Inspect stored session history",
```

- [x] **Step 5: Run the docs parity test again**

Run: `npx vitest run src/tests/v2/release-surface.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add README.md README-en.md README-zh_CN.md src/commands/help.ts src/tests/v2/release-surface.test.ts
git commit -m "docs(release): align public docs with shipped anng runtime surface"
```

### Task 3: Add a deterministic release-check script and CI gate

**Files:**
- Create: `scripts/release-check.mjs`
- Create: `.github/workflows/release-check.yml`
- Modify: `package.json`
- Modify: `src/tests/v2/release-surface.test.ts`

- [x] **Step 1: Write a failing test for the release-check script presence**

```ts
it("defines a release:check script", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  expect(pkg.scripts?.["release:check"]).toBeDefined();
});
```

- [x] **Step 2: Run the release-surface test**

Run: `npx vitest run src/tests/v2/release-surface.test.ts`
Expected: FAIL because the release-check script does not exist yet

- [x] **Step 3: Add the release-check script**

```js
// scripts/release-check.mjs
import { execSync } from "node:child_process";

const commands = [
  "npm run typecheck",
  "npm run bundle",
  "npx vitest run src/tests/v2",
];

for (const command of commands) {
  execSync(command, { stdio: "inherit" });
}
```

- [x] **Step 4: Add the script and CI workflow**

```json
{
  "scripts": {
    "release:check": "node scripts/release-check.mjs"
  }
}
```

```yaml
# .github/workflows/release-check.yml
name: release-check

on:
  push:
    branches: ["main"]
  pull_request:

jobs:
  release-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run release:check
```

- [x] **Step 5: Run the release check locally**

Run: `npm run release:check`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add scripts/release-check.mjs .github/workflows/release-check.yml package.json src/tests/v2/release-surface.test.ts
git commit -m "chore(release): add deterministic release verification gate"
```

## Self-Review

**1. Spec coverage:** Covers the remaining production-facing gaps: one CLI entry, one docs story, one release gate.

**2. Placeholder scan:** No `TODO`, `TBD`, or vague “finish later” instructions remain.

**3. Type consistency:** Reuses the current repo names consistently: `runCli`, `src/index.ts`, command groups in `src/commands/*`, and the `dist/index.js` publish target.

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-production-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
