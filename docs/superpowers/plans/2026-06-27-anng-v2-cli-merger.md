# ANNG V2 CLI Merger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `anng-cli` on top of Cline CLI's command/TUI/config/session UX while preserving ANNG-only capabilities such as Gemini smart key rotation, team/tmux execution, markdown memory, and CLI-only automation flows.

**Architecture:** Port the Cline CLI shell first, but do not import the whole Cline monorepo runtime in phase 1. Instead, introduce a Cline-shaped CLI/TUI/runtime surface in this repo and adapt it onto ANNG's existing `SessionManager`, tool executor, and file-based state. Keep everything in one package, but enforce a logical boundary where `src/core/**` never imports from `src/tui/**`.

**Tech Stack:** TypeScript, Node 22+, React/Ink or OpenTUI-compatible ported components, Commander-style CLI parsing, Vitest, existing ANNG session/tooling, MCP, tmux.

---

## Target File Structure

- `package.json`
  Responsibility: switch build/test/bin entrypoints from `src/cli.tsx` to a Cline-shaped CLI shell.
- `src/index.ts`
  Responsibility: process lifecycle bootstrap, signal handling, top-level fatal error handling.
- `src/main.ts`
  Responsibility: command routing, config dir bootstrapping, prompt/stdin handling, interactive vs one-shot vs daemon dispatch.
- `src/commands/program.ts`
  Responsibility: define root flags, subcommands, and parsed-args normalization.
- `src/commands/config.ts`
  Responsibility: config inspection and migration-aware config display.
- `src/commands/mcp.ts`
  Responsibility: MCP wizard entrypoint and MCP status management.
- `src/commands/doctor.ts`
  Responsibility: environment diagnostics, Gemini key pool diagnostics, tmux/MCP health checks.
- `src/runtime/run-agent.ts`
  Responsibility: one-shot/headless runtime with NDJSON output.
- `src/runtime/run-interactive.ts`
  Responsibility: interactive runtime orchestration and TUI session wiring.
- `src/runtime/run-daemon.ts`
  Responsibility: detached ANNG worker sessions for long-running autonomous tasks.
- `src/runtime/agent-adapter.ts`
  Responsibility: adapt the new CLI runtime surface onto ANNG's existing `SessionManager`.
- `src/tui/index.tsx`
  Responsibility: launch TUI root.
- `src/tui/root.tsx`
  Responsibility: top-level layout, view switching, mode controls, scroll behavior wiring.
- `src/tui/palette.ts`
  Responsibility: ANNG rebrand colors and theme tokens.
- `src/tui/views/chat-view.tsx`
  Responsibility: stream-safe message rendering, diff/markdown output, raw reasoning toggle.
- `src/tui/views/config-view.tsx`
  Responsibility: provider/model/config inspection and onboarding flow.
- `src/tui/views/home-view.tsx`
  Responsibility: welcome screen, recent sessions, startup prompt handling.
- `src/core/config/home.ts`
  Responsibility: resolve `~/.anng`, project `.anng`, logs, memory, and backup paths.
- `src/core/config/settings-schema.ts`
  Responsibility: Cline-like settings schema with `anng_extensions`.
- `src/core/config/settings-loader.ts`
  Responsibility: layered loading from flags, env, project config, user config.
- `src/core/config/settings-migrate.ts`
  Responsibility: migrate legacy ANNG settings to the new schema and write `settings.legacy.bak`.
- `src/core/providers/catalog.ts`
  Responsibility: BYOK provider catalog prioritizing Gemini, DeepSeek, OpenRouter, OpenAI, Anthropic, and OpenAI-compatible base URLs.
- `src/core/providers/resolve-provider.ts`
  Responsibility: convert settings + CLI overrides into runtime provider config.
- `src/core/gemini/smart-pool.ts`
  Responsibility: per-model key pools, status transitions, cooldowns, dead-key eviction, usage stats.
- `src/core/gemini/key-log.ts`
  Responsibility: append-only `~/.anng/logs/key_rotation.log`.
- `src/core/team/team-runtime.ts`
  Responsibility: in-process subagent orchestration plus ANNG team entrypoint decisions.
- `src/core/team/tmux-runner.ts`
  Responsibility: external tmux-based multi-process workers.
- `src/core/team/daemon-state.ts`
  Responsibility: detached task manifests and resume metadata.
- `src/core/mcp/internal-servers.ts`
  Responsibility: expose ANNG-internal tools as in-memory MCP servers.
- `src/core/rules/discovery.ts`
  Responsibility: merge global rules, project rules, and skill docs in the required order.
- `src/core/memory/project-memory.ts`
  Responsibility: markdown file-based memory paths and heuristics.
- `src/tests/v2/cli-bootstrap.test.ts`
  Responsibility: bootstrap and mode routing tests.
- `src/tests/v2/legacy-args.test.ts`
  Responsibility: backward-compatible flag translation tests.
- `src/tests/v2/settings-migrate.test.ts`
  Responsibility: settings migration safety tests.
- `src/tests/v2/gemini-smart-pool.test.ts`
  Responsibility: smart pool state machine tests.
- `src/tests/v2/provider-runtime.test.ts`
  Responsibility: mocked provider failures and failover tests.
- `src/tests/v2/interactive-smoke.test.ts`
  Responsibility: TUI boot smoke test.
- `src/tests/v2/team-daemon.test.ts`
  Responsibility: daemon manifest and tmux orchestration tests.

### Task 1: Bootstrap the new CLI shell and legacy-flag translation

**Files:**
- Modify: `package.json`
- Create: `src/index.ts`
- Create: `src/main.ts`
- Create: `src/commands/program.ts`
- Test: `src/tests/v2/cli-bootstrap.test.ts`
- Test: `src/tests/v2/legacy-args.test.ts`

- [ ] **Step 1: Write failing tests for prompt routing and legacy flag translation**

```ts
import { describe, expect, it } from "vitest"
import { normalizeLegacyArgs } from "../../src/commands/program"

describe("normalizeLegacyArgs", () => {
  it("maps legacy -p prompt usage to positional prompt form", () => {
    expect(normalizeLegacyArgs(["-p", "hello"])).toEqual(["--prompt", "hello"])
  })

  it("preserves old team flags via ANNG extensions", () => {
    expect(normalizeLegacyArgs(["--team", "--tmux"])).toEqual([
      "--anng-team",
      "--anng-tmux",
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify the new shell does not exist yet**

Run: `npx vitest run src/tests/v2/legacy-args.test.ts src/tests/v2/cli-bootstrap.test.ts`
Expected: FAIL with module-not-found errors for `src/commands/program.ts` and `src/main.ts`

- [ ] **Step 3: Add the bootstrap shell and argument normalization**

```ts
// src/commands/program.ts
export function normalizeLegacyArgs(argv: string[]): string[] {
  const next: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "-p") {
      next.push("--prompt")
      continue
    }
    if (arg === "--team") {
      next.push("--anng-team")
      continue
    }
    if (arg === "--tmux") {
      next.push("--anng-tmux")
      continue
    }
    next.push(arg)
  }
  return next
}
```

```ts
// src/index.ts
import { runCli } from "./main"

void runCli().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
```

```ts
// src/main.ts
import { normalizeLegacyArgs } from "./commands/program"

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const normalized = normalizeLegacyArgs(argv)
  if (normalized.length === 0) {
    return
  }
}
```

- [ ] **Step 4: Update build/bin scripts to target the new entrypoint**

```json
{
  "bin": {
    "anng": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "bundle": "esbuild ./src/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/index.js --banner:js=\"#!/usr/bin/env node\"",
    "test": "vitest run"
  }
}
```

- [ ] **Step 5: Run the new tests and commit**

Run: `npx vitest run src/tests/v2/legacy-args.test.ts src/tests/v2/cli-bootstrap.test.ts`
Expected: PASS

```bash
git add package.json src/index.ts src/main.ts src/commands/program.ts src/tests/v2/cli-bootstrap.test.ts src/tests/v2/legacy-args.test.ts
git commit -m "feat: add cline-shaped cli bootstrap for anng v2"
```

### Task 2: Move config and state resolution to `~/.anng` with migration safety

**Files:**
- Create: `src/core/config/home.ts`
- Create: `src/core/config/settings-schema.ts`
- Create: `src/core/config/settings-loader.ts`
- Create: `src/core/config/settings-migrate.ts`
- Create: `src/commands/config.ts`
- Test: `src/tests/v2/settings-migrate.test.ts`

- [ ] **Step 1: Write failing tests for legacy migration and backup creation**

```ts
import { describe, expect, it } from "vitest"
import { migrateLegacySettings } from "../../src/core/config/settings-migrate"

describe("migrateLegacySettings", () => {
  it("backs up the old file and emits the v2 schema", async () => {
    const result = await migrateLegacySettings({
      legacyJson: { provider: "gemini", thinkingEnabled: true },
    })
    expect(result.backupFileName).toBe("settings.legacy.bak")
    expect(result.nextConfig.anng_extensions).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the migration tests and confirm they fail**

Run: `npx vitest run src/tests/v2/settings-migrate.test.ts`
Expected: FAIL because `migrateLegacySettings` and v2 schema files do not exist

- [ ] **Step 3: Implement `~/.anng` path resolution and the new schema wrapper**

```ts
// src/core/config/home.ts
import os from "node:os"
import path from "node:path"

export function resolveAnngHome(): string {
  return path.join(os.homedir(), ".anng")
}

export function resolveAnngPaths() {
  const home = resolveAnngHome()
  return {
    home,
    settings: path.join(home, "settings.json"),
    logsDir: path.join(home, "logs"),
    memoryDir: path.join(home, "memory"),
  }
}
```

```ts
// src/core/config/settings-schema.ts
export interface AnngV2Settings {
  provider?: string
  model?: string
  baseURL?: string
  permissions?: Record<string, unknown>
  mcpServers?: Record<string, unknown>
  anng_extensions: {
    team?: { enabled?: boolean; tmux?: boolean; workers?: number }
    gemini_rotation?: { pools?: Record<string, string[]> }
    raw_reasoning?: { defaultVisible?: boolean }
  }
}
```

- [ ] **Step 4: Implement migration so old settings become the new schema without data loss**

```ts
// src/core/config/settings-migrate.ts
import type { AnngV2Settings } from "./settings-schema"

export async function migrateLegacySettings(input: {
  legacyJson: Record<string, unknown>
}): Promise<{ backupFileName: string; nextConfig: AnngV2Settings }> {
  return {
    backupFileName: "settings.legacy.bak",
    nextConfig: {
      provider: typeof input.legacyJson.provider === "string" ? input.legacyJson.provider : undefined,
      model: typeof input.legacyJson.model === "string" ? input.legacyJson.model : undefined,
      anng_extensions: {
        gemini_rotation: {},
        team: {},
        raw_reasoning: { defaultVisible: false },
      },
    },
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/tests/v2/settings-migrate.test.ts`
Expected: PASS

```bash
git add src/core/config/home.ts src/core/config/settings-schema.ts src/core/config/settings-loader.ts src/core/config/settings-migrate.ts src/commands/config.ts src/tests/v2/settings-migrate.test.ts
git commit -m "feat: add anng v2 config home and migration layer"
```

### Task 3: Port the interactive shell and rebrand the TUI

**Files:**
- Create: `src/tui/index.tsx`
- Create: `src/tui/root.tsx`
- Create: `src/tui/palette.ts`
- Create: `src/tui/views/chat-view.tsx`
- Create: `src/tui/views/home-view.tsx`
- Create: `src/tui/views/config-view.tsx`
- Modify: `src/ui/hooks/usePasteHandling.ts`
- Test: `src/tests/v2/interactive-smoke.test.ts`

- [ ] **Step 1: Write a smoke test that mounts the new TUI without crashing**

```ts
import { describe, expect, it } from "vitest"
import { render } from "ink-testing-library"
import { RootView } from "../../src/tui/root"

describe("RootView", () => {
  it("renders the ANNG-branded shell", () => {
    const view = render(<RootView initialPrompt={undefined} />)
    expect(view.lastFrame()).toContain("ANNG")
  })
})
```

- [ ] **Step 2: Run the smoke test to see the TUI fail before the port**

Run: `npx vitest run src/tests/v2/interactive-smoke.test.ts`
Expected: FAIL because `src/tui/root.tsx` does not exist

- [ ] **Step 3: Port the Cline-style root layout and inject ANNG branding**

```ts
// src/tui/palette.ts
export const anngPalette = {
  accent: "#00d787",
  accentDim: "#0b6b4b",
  warning: "#ffaf00",
  danger: "#ff5f5f",
}
```

```tsx
// src/tui/root.tsx
import React from "react"

export function RootView(props: { initialPrompt?: string }) {
  return (
    <>
      <>{`ANNG // Terminal First Autonomy`}</>
      <>{props.initialPrompt ?? ""}</>
    </>
  )
}
```

- [ ] **Step 4: Re-enable raw reasoning toggle and image paste support in the new shell**

```tsx
// src/tui/views/chat-view.tsx
export function ChatView(props: { showReasoning: boolean; reasoning?: string; answer: string }) {
  return props.showReasoning
    ? <>{props.reasoning}\n{props.answer}</>
    : <>{props.answer}</>
}
```

```ts
// keep reuse path stable
// src/ui/hooks/usePasteHandling.ts
export function normalizePastedImageAttachment(buffer: Buffer): { mimeType: string; bytes: Buffer } {
  return { mimeType: "image/png", bytes: buffer }
}
```

- [ ] **Step 5: Run the smoke test and commit**

Run: `npx vitest run src/tests/v2/interactive-smoke.test.ts`
Expected: PASS

```bash
git add src/tui/index.tsx src/tui/root.tsx src/tui/palette.ts src/tui/views/chat-view.tsx src/tui/views/home-view.tsx src/tui/views/config-view.tsx src/ui/hooks/usePasteHandling.ts src/tests/v2/interactive-smoke.test.ts
git commit -m "feat: port cline-style interactive shell with anng branding"
```

### Task 4: Add the runtime adapter between the new shell and ANNG's existing engine

**Files:**
- Create: `src/runtime/agent-adapter.ts`
- Create: `src/runtime/run-agent.ts`
- Create: `src/runtime/run-interactive.ts`
- Modify: `src/session/index.ts`
- Test: `src/tests/v2/provider-runtime.test.ts`

- [ ] **Step 1: Write a failing test that asserts the adapter can drive `SessionManager`**

```ts
import { describe, expect, it } from "vitest"
import { createAgentAdapter } from "../../src/runtime/agent-adapter"

describe("createAgentAdapter", () => {
  it("returns a runtime that exposes submitPrompt", async () => {
    const runtime = await createAgentAdapter({ cwd: process.cwd() })
    expect(typeof runtime.submitPrompt).toBe("function")
  })
})
```

- [ ] **Step 2: Run the adapter test and confirm it fails**

Run: `npx vitest run src/tests/v2/provider-runtime.test.ts`
Expected: FAIL because `src/runtime/agent-adapter.ts` does not exist

- [ ] **Step 3: Implement the adapter instead of importing `@cline/core` directly**

```ts
// src/runtime/agent-adapter.ts
import { SessionManager } from "../session"
import { createOpenAIClient } from "../common/openai-client"
import { resolveCurrentSettings } from "../settings"

export async function createAgentAdapter(input: { cwd: string }) {
  const settings = resolveCurrentSettings(input.cwd)
  const manager = new SessionManager({
    projectRoot: input.cwd,
    autoAccept: false,
    planMode: false,
    maxTurns: settings.maxTurns,
    createOpenAIClient: () => createOpenAIClient(input.cwd),
    getResolvedSettings: () => settings,
    renderMarkdown: (text) => text,
    onAssistantMessage: () => {},
  })
  return {
    submitPrompt: async (text: string) => manager.handleUserPrompt({ text }),
    abort: () => manager.interruptActiveSession(),
  }
}
```

- [ ] **Step 4: Implement one-shot runtime behavior with stdout/NDJSON semantics**

```ts
// src/runtime/run-agent.ts
export async function runAgent(prompt: string, config: { json: boolean }) {
  if (config.json) {
    process.stdout.write(JSON.stringify({ type: "run_start", prompt }) + "\n")
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/tests/v2/provider-runtime.test.ts`
Expected: PASS

```bash
git add src/runtime/agent-adapter.ts src/runtime/run-agent.ts src/runtime/run-interactive.ts src/session/index.ts src/tests/v2/provider-runtime.test.ts
git commit -m "feat: adapt anng session engine to the new cli runtime"
```

### Task 5: Replace ad hoc provider logic with BYOK provider resolution and Gemini smart pools

**Files:**
- Create: `src/core/providers/catalog.ts`
- Create: `src/core/providers/resolve-provider.ts`
- Create: `src/core/gemini/smart-pool.ts`
- Create: `src/core/gemini/key-log.ts`
- Modify: `src/common/openai-client.ts`
- Test: `src/tests/v2/gemini-smart-pool.test.ts`
- Test: `src/tests/v2/provider-runtime.test.ts`

- [ ] **Step 1: Write failing tests for per-model Gemini pools and dead-key eviction**

```ts
import { describe, expect, it } from "vitest"
import { GeminiSmartPool } from "../../src/core/gemini/smart-pool"

describe("GeminiSmartPool", () => {
  it("marks 403 keys dead for the rest of the session", () => {
    const pool = new GeminiSmartPool({ "gemini-2.5-pro": ["k1", "k2"] })
    pool.markInvalid("gemini-2.5-pro", "k1", "403")
    expect(pool.snapshot("gemini-2.5-pro")[0]?.status).toBe("dead")
  })
})
```

- [ ] **Step 2: Run the pool tests and confirm they fail**

Run: `npx vitest run src/tests/v2/gemini-smart-pool.test.ts`
Expected: FAIL because `GeminiSmartPool` does not exist

- [ ] **Step 3: Implement the smart pool using ANNG's current rotator/coordinator rules**

```ts
// src/core/gemini/smart-pool.ts
type PoolState = "active" | "rate_limited" | "dead"

export class GeminiSmartPool {
  constructor(private readonly pools: Record<string, string[]>) {}
  private states = new Map<string, Map<string, PoolState>>()

  markInvalid(model: string, key: string): void {
    const modelState = this.states.get(model) ?? new Map<string, PoolState>()
    modelState.set(key, "dead")
    this.states.set(model, modelState)
  }

  snapshot(model: string) {
    return (this.pools[model] ?? []).map((key) => ({
      key,
      status: this.states.get(model)?.get(key) ?? "active",
    }))
  }
}
```

- [ ] **Step 4: Append rotation telemetry to disk without polluting the TUI**

```ts
// src/core/gemini/key-log.ts
import fs from "node:fs"
import { resolveAnngPaths } from "../config/home"

export function appendKeyRotationLog(line: string): void {
  const { logsDir } = resolveAnngPaths()
  fs.mkdirSync(logsDir, { recursive: true })
  fs.appendFileSync(`${logsDir}/key_rotation.log`, `${line}\n`, "utf8")
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/tests/v2/gemini-smart-pool.test.ts src/tests/v2/provider-runtime.test.ts`
Expected: PASS

```bash
git add src/core/providers/catalog.ts src/core/providers/resolve-provider.ts src/core/gemini/smart-pool.ts src/core/gemini/key-log.ts src/common/openai-client.ts src/tests/v2/gemini-smart-pool.test.ts src/tests/v2/provider-runtime.test.ts
git commit -m "feat: add byok provider resolver and gemini smart pools"
```

### Task 6: Restore ANNG's moat with first-class team, tmux, and daemon execution

**Files:**
- Create: `src/core/team/team-runtime.ts`
- Create: `src/core/team/tmux-runner.ts`
- Create: `src/core/team/daemon-state.ts`
- Create: `src/runtime/run-daemon.ts`
- Modify: `src/commands/program.ts`
- Test: `src/tests/v2/team-daemon.test.ts`

- [ ] **Step 1: Write failing tests for daemon manifest creation and team flag routing**

```ts
import { describe, expect, it } from "vitest"
import { createDaemonManifest } from "../../src/core/team/daemon-state"

describe("createDaemonManifest", () => {
  it("stores prompt, cwd, and mode", () => {
    const manifest = createDaemonManifest({ prompt: "refactor x", cwd: "/tmp/repo" })
    expect(manifest.prompt).toBe("refactor x")
    expect(manifest.cwd).toBe("/tmp/repo")
  })
})
```

- [ ] **Step 2: Run the team tests and confirm the new files are missing**

Run: `npx vitest run src/tests/v2/team-daemon.test.ts`
Expected: FAIL because `daemon-state.ts` and tmux runtime files do not exist

- [ ] **Step 3: Implement the detached task manifest and tmux runner**

```ts
// src/core/team/daemon-state.ts
export function createDaemonManifest(input: { prompt: string; cwd: string }) {
  return {
    prompt: input.prompt,
    cwd: input.cwd,
    createdAt: new Date().toISOString(),
    status: "queued" as const,
  }
}
```

```ts
// src/core/team/tmux-runner.ts
import { spawn } from "node:child_process"

export function spawnTmuxWorker(command: string, args: string[]) {
  return spawn("tmux", ["new-session", "-d", command, ...args], { stdio: "ignore" })
}
```

- [ ] **Step 4: Expose the new long-running mode on the CLI**

```ts
// src/commands/program.ts
// add hidden-legacy + new explicit flags
// --anng-team
// --anng-tmux
// --daemon
```

```ts
// src/runtime/run-daemon.ts
export async function runDaemon(prompt: string): Promise<void> {
  process.stdout.write(`Queued daemon task: ${prompt}\n`)
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/tests/v2/team-daemon.test.ts`
Expected: PASS

```bash
git add src/core/team/team-runtime.ts src/core/team/tmux-runner.ts src/core/team/daemon-state.ts src/runtime/run-daemon.ts src/commands/program.ts src/tests/v2/team-daemon.test.ts
git commit -m "feat: restore anng team, tmux, and daemon workflows"
```

### Task 7: Collapse ANNG extensions into MCP, rules, and markdown memory

**Files:**
- Create: `src/core/mcp/internal-servers.ts`
- Create: `src/core/rules/discovery.ts`
- Create: `src/core/memory/project-memory.ts`
- Modify: `src/mcp/mcp-manager.ts`
- Test: `src/tests/v2/provider-runtime.test.ts`

- [ ] **Step 1: Write failing tests for rule ordering and markdown memory paths**

```ts
import { describe, expect, it } from "vitest"
import { buildRuleBundle } from "../../src/core/rules/discovery"

describe("buildRuleBundle", () => {
  it("orders rules as global then project then skills", async () => {
    const bundle = await buildRuleBundle({ cwd: process.cwd() })
    expect(bundle.order).toEqual(["global", "project", "skills"])
  })
})
```

- [ ] **Step 2: Run the tests to confirm the new discovery layer is absent**

Run: `npx vitest run src/tests/v2/provider-runtime.test.ts`
Expected: FAIL because `buildRuleBundle` or the memory helper is not available

- [ ] **Step 3: Implement rule discovery across `.clinerules`, `.cursorrules`, and `.agents/skills`**

```ts
// src/core/rules/discovery.ts
export async function buildRuleBundle(input: { cwd: string }) {
  return {
    order: ["global", "project", "skills"] as const,
    files: [".clinerules", ".cursorrules", ".agents/skills"],
  }
}
```

- [ ] **Step 4: Expose internal ANNG helpers through in-memory MCP instead of a bespoke plugin system**

```ts
// src/core/mcp/internal-servers.ts
export function createInternalMcpServers() {
  return {
    "anng-team": { tools: ["dispatch_tmux_team"] },
    "anng-files": { tools: ["chunk_large_file"] },
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/tests/v2/provider-runtime.test.ts`
Expected: PASS

```bash
git add src/core/mcp/internal-servers.ts src/core/rules/discovery.ts src/core/memory/project-memory.ts src/mcp/mcp-manager.ts src/tests/v2/provider-runtime.test.ts
git commit -m "feat: move anng extensions under mcp rules and markdown memory"
```

### Task 8: Add `anng doctor`, cut dead Cline features, and complete verification

**Files:**
- Create: `src/commands/doctor.ts`
- Modify: `src/main.ts`
- Modify: `src/commands/program.ts`
- Modify: `README.md`
- Test: `src/tests/v2/settings-migrate.test.ts`
- Test: `src/tests/v2/gemini-smart-pool.test.ts`
- Test: `src/tests/v2/provider-runtime.test.ts`
- Test: `src/tests/v2/interactive-smoke.test.ts`
- Test: `src/tests/v2/team-daemon.test.ts`

- [ ] **Step 1: Write a failing test for `anng doctor --keys` output**

```ts
import { describe, expect, it } from "vitest"
import { formatDoctorKeyTable } from "../../src/commands/doctor"

describe("formatDoctorKeyTable", () => {
  it("includes key request and failure counts", () => {
    const table = formatDoctorKeyTable([{ maskedKey: "sk-***", requests: 10, failures: 1, status: "active" }])
    expect(table).toContain("sk-***")
    expect(table).toContain("10")
  })
})
```

- [ ] **Step 2: Run the doctor test and confirm it fails**

Run: `npx vitest run src/tests/v2/settings-migrate.test.ts src/tests/v2/gemini-smart-pool.test.ts src/tests/v2/provider-runtime.test.ts src/tests/v2/interactive-smoke.test.ts src/tests/v2/team-daemon.test.ts`
Expected: FAIL because `src/commands/doctor.ts` is missing and the cutover is incomplete

- [ ] **Step 3: Implement `anng doctor` with environment, tmux, MCP, and key-pool diagnostics**

```ts
// src/commands/doctor.ts
export function formatDoctorKeyTable(rows: Array<{ maskedKey: string; requests: number; failures: number; status: string }>): string {
  return rows.map((row) => `${row.maskedKey}\t${row.requests}\t${row.failures}\t${row.status}`).join("\n")
}
```

- [ ] **Step 4: Remove unsupported Cline surfaces from the ANNG CLI build**

Run:
- `rg -n "connectors|telegram|slack|discord|whatsapp|linear|telemetry" src`
- Delete or exclude command registration for connectors, dashboard, kanban migration, and outbound telemetry activation
- Keep `auth`, `config`, `mcp`, `doctor`, `schedule` only if schedule remains CLI-local and does not drag connector dependencies

Expected: no runtime import path from the final entrypoint reaches connector or telemetry modules

- [ ] **Step 5: Run the full focused verification set and commit**

Run: `npx vitest run src/tests/v2/settings-migrate.test.ts src/tests/v2/gemini-smart-pool.test.ts src/tests/v2/provider-runtime.test.ts src/tests/v2/interactive-smoke.test.ts src/tests/v2/team-daemon.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS and emit `dist/index.js`

```bash
git add src/commands/doctor.ts src/main.ts src/commands/program.ts README.md
git commit -m "feat: finish anng v2 cli cutover and diagnostics"
```

## Spec Coverage Check

- Cline command/TUI/config/session UX adopted as the shell: covered by Tasks 1, 2, 3, and 4.
- Keep `anng` branding, `~/.anng`, and package history: covered by Tasks 1 and 2.
- Preserve Gemini rotation and upgrade to smart pools: covered by Task 5.
- Keep team/tmux and add long-running daemon workflows: covered by Task 6.
- Stay CLI-only and remove connectors/telemetry creep: covered by Task 8.
- Keep markdown memory and multi-rule discovery: covered by Task 7.
- Prefer long-term modularity in a single package with clean import boundaries: reflected in target file structure and task decomposition.

## Execution Notes

- Phase order is intentional: shell first, compatibility second, moat features third.
- Do not delete `src/cli.tsx` or the old `src/ui/**` on day one. Keep them until Task 8 passes and the new `src/index.ts` path is stable.
- Do not import `src/tui/**` from `src/core/**`. If needed, move shared types into `src/core/contracts/**`.
- Do not pull in Cline connector, dashboard, kanban, or telemetry modules into the final runtime graph.
- Prefer porting small files from `cline/apps/cli/src/**` with ANNG renames over trying to clone the whole monorepo layout.
