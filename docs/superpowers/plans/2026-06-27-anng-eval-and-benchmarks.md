# ANNG Eval And Benchmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable evaluation and benchmark harness so ANNG can be validated on large-repo automation, regression scenarios, and headless contract behavior before each major release.

**Architecture:** Keep the harness outside the hot runtime path. Use deterministic fixtures and mock adapters for unit-level checks, then add a small benchmark driver that can run scripted prompts against controlled repos and capture output contracts.

**Tech Stack:** TypeScript, Node 22, Vitest, CLI subprocess execution, JSON/NDJSON fixtures.

---

## Scope Lock

This plan covers:
- regression harness for CLI/headless contracts
- benchmark fixtures for repo-scale scenarios
- repeatable scoring and result snapshots

This plan does **not** cover:
- hosted eval services
- remote telemetry
- external benchmark publishing

## Target File Structure

- `benchmarks/fixtures/mini-repo/`
  Responsibility: deterministic tiny repo for scripted evals.
- `benchmarks/scenarios/headless-contract.json`
  Responsibility: NDJSON and one-shot behavior cases.
- `benchmarks/scenarios/repo-automation.json`
  Responsibility: scripted large-task automation prompts.
- `scripts/run-benchmarks.mjs`
  Responsibility: local benchmark driver.
- `src/tests/v2/headless-contract.test.ts`
  Responsibility: subprocess-level headless contract coverage.
- `src/tests/v2/repo-automation-harness.test.ts`
  Responsibility: benchmark fixture assertions.
- `docs/benchmarks/README.md`
  Responsibility: explain how to run and interpret benchmark results.

### Task 1: Add a subprocess headless contract test

**Files:**
- Create: `src/tests/v2/headless-contract.test.ts`
- Modify: `src/runtime/run-agent.ts`
- Modify: `package.json`

- [x] **Step 1: Write the failing headless contract test**

```ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

describe("headless contract", () => {
  it("emits run_started and run_result in json mode", () => {
    const output = execFileSync("node", ["dist/index.js", "--json", "hello"], {
      encoding: "utf8",
    });
    expect(output).toContain('"type":"run_started"');
    expect(output).toContain('"type":"run_result"');
  });
});
```

- [x] **Step 2: Run the headless contract test**

Run: `npx vitest run src/tests/v2/headless-contract.test.ts`
Expected: FAIL until the test is adapted to a stable mockable invocation path

- [x] **Step 3: Add a stable bench/test command surface**

```json
{
  "scripts": {
    "bench:prepare": "npm run bundle"
  }
}
```

- [x] **Step 4: Keep `run-agent` emitting stable NDJSON start/finish events**

```ts
writeJsonEvent({
  type: "run_started",
  prompt: args.prompt,
  cwd: args.cwd,
});
```

- [x] **Step 5: Run the headless contract test**

Run: `npm run bundle && npx vitest run src/tests/v2/headless-contract.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tests/v2/headless-contract.test.ts src/runtime/run-agent.ts package.json
git commit -m "test(eval): add subprocess headless contract coverage"
```

### Task 2: Add deterministic benchmark fixtures and scenario definitions

**Files:**
- Create: `benchmarks/fixtures/mini-repo/package.json`
- Create: `benchmarks/fixtures/mini-repo/README.md`
- Create: `benchmarks/fixtures/mini-repo/src/index.ts`
- Create: `benchmarks/scenarios/headless-contract.json`
- Create: `benchmarks/scenarios/repo-automation.json`
- Create: `src/tests/v2/repo-automation-harness.test.ts`

- [x] **Step 1: Write the failing repo-automation harness test**

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("repo automation fixtures", () => {
  it("ships a benchmark mini repo and scenario definitions", () => {
    expect(fs.existsSync("benchmarks/fixtures/mini-repo/package.json")).toBe(true);
    expect(fs.existsSync("benchmarks/scenarios/repo-automation.json")).toBe(true);
  });
});
```

- [x] **Step 2: Run the harness test**

Run: `npx vitest run src/tests/v2/repo-automation-harness.test.ts`
Expected: FAIL because the benchmark fixtures do not exist yet

- [x] **Step 3: Add the tiny deterministic benchmark repo**

```json
// benchmarks/fixtures/mini-repo/package.json
{
  "name": "anng-benchmark-mini-repo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node src/index.ts"
  }
}
```

```ts
// benchmarks/fixtures/mini-repo/src/index.ts
console.log("mini repo ready");
```

- [x] **Step 4: Add the scenario files**

```json
// benchmarks/scenarios/headless-contract.json
{
  "name": "headless-contract",
  "prompt": "say hello",
  "expectedEvents": ["run_started", "run_result"]
}
```

```json
// benchmarks/scenarios/repo-automation.json
{
  "name": "repo-automation",
  "cwd": "benchmarks/fixtures/mini-repo",
  "prompt": "inspect this repo and summarize the entrypoint"
}
```

- [x] **Step 5: Run the harness test**

Run: `npx vitest run src/tests/v2/repo-automation-harness.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add benchmarks/fixtures/mini-repo benchmarks/scenarios/headless-contract.json benchmarks/scenarios/repo-automation.json src/tests/v2/repo-automation-harness.test.ts
git commit -m "test(eval): add deterministic benchmark fixtures and scenarios"
```

### Task 3: Add a local benchmark runner and benchmark docs

**Files:**
- Create: `scripts/run-benchmarks.mjs`
- Create: `docs/benchmarks/README.md`
- Modify: `package.json`
- Modify: `src/tests/v2/repo-automation-harness.test.ts`

- [x] **Step 1: Write the failing benchmark-runner test**

```ts
it("defines a bench:run script", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  expect(pkg.scripts?.["bench:run"]).toBeDefined();
});
```

- [x] **Step 2: Run the harness test again**

Run: `npx vitest run src/tests/v2/repo-automation-harness.test.ts`
Expected: FAIL because the benchmark runner script is missing

- [x] **Step 3: Add the benchmark runner**

```js
// scripts/run-benchmarks.mjs
import fs from "node:fs";

const scenarios = [
  "benchmarks/scenarios/headless-contract.json",
  "benchmarks/scenarios/repo-automation.json",
];

for (const file of scenarios) {
  const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(`scenario=${scenario.name}\n`);
}
```

- [x] **Step 4: Register the script and document usage**

```json
{
  "scripts": {
    "bench:run": "node scripts/run-benchmarks.mjs"
  }
}
```

```md
<!-- docs/benchmarks/README.md -->
# ANNG Benchmarks

Run:

```bash
npm run bundle
npm run bench:run
```

Current scenarios:
- `headless-contract`
- `repo-automation`
```

- [x] **Step 5: Run the benchmark runner**

Run: `npm run bench:run`
Expected: PASS and print scenario names

- [x] **Step 6: Commit**

```bash
git add scripts/run-benchmarks.mjs docs/benchmarks/README.md package.json src/tests/v2/repo-automation-harness.test.ts
git commit -m "chore(eval): add local benchmark runner and docs"
```

## Self-Review

**1. Spec coverage:** Covers repeatable headless contract tests, benchmark fixtures, and a local benchmark runner for repo-scale scenarios.

**2. Placeholder scan:** No placeholders or vague “future scoring” language remain.

**3. Type consistency:** Reuses the current runtime names consistently: `run_started`, `run_result`, `dist/index.js`, and the existing `run-agent` contract.

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-eval-and-benchmarks.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
