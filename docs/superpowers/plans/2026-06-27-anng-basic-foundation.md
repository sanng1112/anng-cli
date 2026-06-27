# ANNG Basic Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship a clean, reliable ANNG basic release where `anng` supports interactive chat, persisted sessions, one-shot/headless runs, config/doctor/sessions commands, and Gemini smart key rotation on top of the new CLI shell.

**Architecture:** Keep the repo as a single package. Treat `src/main.ts` and `src/commands/*` as the public CLI surface, `src/core/*` as non-UI runtime logic, and `src/tui/*` as the new branded shell. Do not rewrite the full agent runtime in one pass: first make `src/tui` own the visible chat/session shell while still delegating prompt execution to `SessionManager`, then progressively reduce dependence on `src/ui/views/App.tsx`.

**Tech Stack:** TypeScript, Node 22, Ink/React, Vitest, existing `SessionManager`, MCP manager, file-based storage under `~/.anng`, Gemini smart pool.

---

## Scope Lock

This plan intentionally targets **ANNG basic** only. It does **not** include:
- First-class tmux team workflows
- Full daemon autonomy beyond the current manifest/log surface
- Slack/Telegram/web dashboards
- A full Cline-equivalent TUI rewrite in one pass

This plan is complete when these product statements are true:
- `anng` opens an interactive shell that can actually chat, not just render a wrapper.
- Chat messages and session history survive restarts and can be inspected from both TUI and CLI.
- `anng "prompt"` and `anng --json "prompt"` work as stable Unix/headless paths.
- `~/.anng/settings.json`, `anng config`, `anng doctor`, and Gemini key rotation behave predictably.
- The new shell is the default path; the old `src/ui/views/App.tsx` is no longer the architectural center.

## Target File Structure

- `src/main.ts`
  Responsibility: top-level routing and bootstrap invariants.
- `src/commands/program.ts`
  Responsibility: CLI grammar, legacy translation, help/version, command groups.
- `src/runtime/agent-adapter.ts`
  Responsibility: thin bridge from CLI/TUI shell to `SessionManager`.
- `src/runtime/run-agent.ts`
  Responsibility: one-shot/headless runtime contract.
- `src/runtime/run-interactive.ts`
  Responsibility: enter the interactive ANNG shell only.
- `src/tui/index.tsx`
  Responsibility: boot the shell and wire read-only startup data plus live session hooks.
- `src/tui/root.tsx`
  Responsibility: top-level ANNG layout and view switching.
- `src/tui/views/chat-view.tsx`
  Responsibility: visible conversation timeline for the active session.
- `src/tui/views/home-view.tsx`
  Responsibility: recent sessions, transcript preview, startup context.
- `src/tui/views/config-view.tsx`
  Responsibility: provider/settings status and doctor summary.
- `src/tui/session-shell.ts`
  Responsibility: own interactive session state for the new shell.
- `src/common/project-storage.ts`
  Responsibility: persisted sessions index and message-log readers.
- `src/session/index.ts`
  Responsibility: canonical session lifecycle and persistence.
- `src/commands/sessions.ts`
  Responsibility: CLI session inspection and management.
- `src/commands/doctor.ts`
  Responsibility: environment and key-rotation diagnostics.
- `src/common/openai-client.ts`
  Responsibility: provider client creation and Gemini smart-pool integration.
- `src/tests/v2/interactive-smoke.test.ts`
  Responsibility: shell-level smoke coverage.
- `src/tests/v2/sessions-command.test.ts`
  Responsibility: CLI session inspection coverage.
- `src/tests/v2/provider-runtime.test.ts`
  Responsibility: one-shot/headless runtime coverage.
- `src/tests/v2/doctor.test.ts`
  Responsibility: key/doctor coverage.
- `src/tests/v2/chat-shell.test.ts`
  Responsibility: active-chat shell behavior coverage.

## Phase Map

1. Make the new shell actually own visible chat and active session state.
2. Make session persistence/resume/manage flows complete enough for daily use.
3. Harden config/provider/doctor/key-rotation behavior.
4. Stabilize one-shot/headless/daemon basic paths.
5. Clean up architecture and docs so the repo can keep evolving.

### Task 1: Make `src/tui` own the active chat shell

**Files:**
- Create: `src/tui/session-shell.ts`
- Create: `src/tests/v2/chat-shell.test.ts`
- Modify: `src/tui/index.tsx`
- Modify: `src/tui/root.tsx`
- Modify: `src/tui/views/chat-view.tsx`
- Modify: `src/runtime/agent-adapter.ts`

- [x] **Step 1: Write the failing shell-state test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createSessionShell } from "../../tui/session-shell";

describe("createSessionShell", () => {
  it("submits a prompt and exposes active session output", async () => {
    const shell = createSessionShell({
      submitPrompt: vi.fn(async () => ({
        sessionId: "session-1",
        text: "done",
        status: "completed",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        failReason: null,
      })),
    });

    await shell.submit("fix tests");

    expect(shell.getState().activeSessionId).toBe("session-1");
    expect(shell.getState().answer).toBe("done");
    expect(shell.getState().status).toBe("completed");
  });
});
```

- [x] **Step 2: Run the test to confirm the shell controller does not exist yet**

Run: `npx vitest run src/tests/v2/chat-shell.test.ts`
Expected: FAIL with module-not-found for `src/tui/session-shell.ts`

- [x] **Step 3: Add a focused shell controller that wraps the runtime adapter**

```ts
// src/tui/session-shell.ts
export type SessionShellState = {
  activeSessionId: string | null;
  answer: string;
  status: string | null;
  failReason: string | null;
};

export function createSessionShell(deps: {
  submitPrompt: (prompt: string) => Promise<{
    sessionId: string | null;
    text: string;
    status: string;
    failReason: string | null;
  }>;
}) {
  let state: SessionShellState = {
    activeSessionId: null,
    answer: "",
    status: null,
    failReason: null,
  };

  return {
    getState: () => state,
    submit: async (prompt: string) => {
      const result = await deps.submitPrompt(prompt);
      state = {
        activeSessionId: result.sessionId,
        answer: result.text,
        status: result.status,
        failReason: result.failReason,
      };
    },
  };
}
```

- [x] **Step 4: Wire the controller into the TUI root instead of treating `AppContainer` as the primary chat owner**

```ts
// src/tui/index.tsx
const adapter = await createAgentAdapter({
  cwd: args.cwd,
  provider: args.provider,
  model: args.model,
  key: args.key,
  baseUrl: args.baseUrl,
  autoAccept: args.autoAccept,
  planMode: args.planMode,
  maxTurns: args.maxTurns,
});

const shell = createSessionShell({
  submitPrompt: adapter.submitPrompt,
});
```

```tsx
// src/tui/root.tsx
<ChatView
  showReasoning={settings.thinkingEnabled}
  answer={chat.answer}
  status={chat.status}
  failReason={chat.failReason}
/>
```

- [x] **Step 5: Verify the shell test and smoke test pass**

Run: `npx vitest run src/tests/v2/chat-shell.test.ts src/tests/v2/interactive-smoke.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tui/session-shell.ts src/tui/index.tsx src/tui/root.tsx src/tui/views/chat-view.tsx src/runtime/agent-adapter.ts src/tests/v2/chat-shell.test.ts src/tests/v2/interactive-smoke.test.ts
git commit -m "feat: move active chat shell ownership into anng tui"
```

### Task 2: Complete the session UX for list/show/resume in both TUI and CLI

**Files:**
- Modify: `src/common/project-storage.ts`
- Modify: `src/commands/sessions.ts`
- Modify: `src/tui/views/home-view.tsx`
- Modify: `src/tui/root.tsx`
- Modify: `src/tests/v2/sessions-command.test.ts`
- Modify: `src/tests/v2/interactive-smoke.test.ts`

- [x] **Step 1: Add a failing test for session detail output including recent messages**

```ts
it("prints session detail with recent messages", async () => {
  const writeStdout = vi.fn<(text: string) => void>();

  await runSessionsCommand(
    { cwd: process.cwd(), action: "show", sessionId: "session-1", outputMode: "text" },
    {
      readSessionDetail: () => ({
        id: "session-1",
        summary: "Fix parser",
        status: "completed",
        updateTime: "2026-01-01T00:00:00.000Z",
        assistantReply: "done",
        failReason: null,
      }),
      readSessionMessages: () => [
        { role: "user", content: "fix parser" },
        { role: "assistant", content: "done" },
      ],
      writeStdout,
    }
  );

  expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("[assistant] done"));
});
```

- [x] **Step 2: Add a failing smoke assertion for transcript preview in the shell**

```ts
expect(text).toContain("Latest Transcript");
expect(text).toContain("[user] fix parser");
```

- [x] **Step 3: Extend storage helpers so the shell can reliably fetch recent session detail**

```ts
// src/common/project-storage.ts
export function readRecentSessionTranscript(projectRoot: string, limit = 4) {
  const recent = readRecentSessions(projectRoot, 1)[0];
  if (!recent) {
    return [];
  }
  return readStoredSessionMessages(projectRoot, recent.id, limit);
}
```

- [x] **Step 4: Surface session resume metadata in the shell and improve `anng sessions show` formatting**

```ts
// src/commands/sessions.ts
const lines = [
  "ANNG session",
  `${session.id}\t${session.status}\t${session.summary ?? "<no summary>"}`,
  ...messages.map((message) => `[${message.role ?? "unknown"}] ${message.content ?? ""}`),
];
```

```tsx
// src/tui/views/home-view.tsx
<Text color={anngPalette.accent}>Recent Sessions</Text>
{props.recentSessions.map((session) => (
  <Text key={session.id} dimColor>
    {session.id.slice(0, 8)} {session.status} {session.summary ?? "<no summary>"}
  </Text>
))}
```

- [x] **Step 5: Run the session-facing tests**

Run: `npx vitest run src/tests/v2/sessions-command.test.ts src/tests/v2/interactive-smoke.test.ts src/tests/v2/project-storage-shell.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/common/project-storage.ts src/commands/sessions.ts src/tui/views/home-view.tsx src/tui/root.tsx src/tests/v2/sessions-command.test.ts src/tests/v2/interactive-smoke.test.ts
git commit -m "feat: complete basic anng session inspection and resume surface"
```

### Task 3: Harden the interactive prompt flow around persisted session state

**Files:**
- Modify: `src/runtime/agent-adapter.ts`
- Modify: `src/session/index.ts`
- Modify: `src/tui/session-shell.ts`
- Modify: `src/tests/v2/chat-shell.test.ts`
- Modify: `src/tests/session.test.ts`

- [x] **Step 1: Write a failing test for replying into the active session**

```ts
it("reuses the active session for follow-up prompts", async () => {
  const calls: string[] = [];
  const shell = createSessionShell({
    submitPrompt: async (prompt) => {
      calls.push(prompt);
      return {
        sessionId: "session-1",
        text: prompt === "first" ? "one" : "two",
        status: "completed",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        failReason: null,
      };
    },
  });

  await shell.submit("first");
  await shell.submit("second");

  expect(calls).toEqual(["first", "second"]);
  expect(shell.getState().activeSessionId).toBe("session-1");
});
```

- [x] **Step 2: Write a failing session-manager test for create-vs-reply behavior**

```ts
assert.equal(manager.getActiveSessionId(), sessionId);
assert.equal(manager.getSession(sessionId)?.assistantReply, "first answer");
```

- [x] **Step 3: Keep the adapter thin and let `SessionManager` remain the canonical state owner**

```ts
// src/runtime/agent-adapter.ts
return {
  submitPrompt: async (prompt: string) => {
    await manager.handleUserPrompt({ text: prompt });
    const sessionId = manager.getActiveSessionId();
    const session = sessionId ? manager.getSession(sessionId) : null;
    return {
      sessionId,
      text: session?.assistantReply ?? "",
      status: session?.status ?? "unknown",
      usage: {
        inputTokens: session?.usage?.prompt_tokens ?? 0,
        outputTokens: session?.usage?.completion_tokens ?? 0,
        totalTokens: session?.usage?.total_tokens ?? 0,
      },
      failReason: session?.failReason ?? null,
    };
  },
};
```

- [x] **Step 4: Update the shell state model so follow-up prompts do not reset session identity**

```ts
state = {
  activeSessionId: result.sessionId ?? state.activeSessionId,
  answer: result.text,
  status: result.status,
  failReason: result.failReason,
};
```

- [x] **Step 5: Run the prompt/session tests**

Run: `npx vitest run src/tests/v2/chat-shell.test.ts src/tests/session.test.ts src/tests/v2/provider-runtime.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/runtime/agent-adapter.ts src/session/index.ts src/tui/session-shell.ts src/tests/v2/chat-shell.test.ts src/tests/session.test.ts
git commit -m "fix: preserve active session state across anng chat turns"
```

### Task 4: Finish the config and provider surface for a trustworthy basic release

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/core/config/settings-loader.ts`
- Modify: `src/commands/config.ts`
- Modify: `src/tests/v2/settings-runtime.test.ts`
- Modify: `src/tests/v2/cli-bootstrap.test.ts`

- [x] **Step 1: Write a failing test for config summary redaction and merge order**

```ts
it("redacts keys and preserves merged provider config", () => {
  const summary = readConfigSummary(process.cwd());
  expect(summary).toContain("__REDACTED__");
});
```

- [x] **Step 2: Write a failing runtime-settings test for CLI override precedence**

```ts
expect(settings.provider).toBe("deepseek");
expect(settings.model).toBe("deepseek-v4-pro");
```

- [x] **Step 3: Keep `resolveCurrentSettings` and `resolveMergedAnngSettings` aligned on precedence**

```ts
// precedence
// CLI/env override > project settings > user settings > defaults
```

- [x] **Step 4: Ensure the public config command reflects exactly what runtime will use**

```ts
// src/commands/config.ts
const settings = resolveMergedAnngSettings(cwd);
return JSON.stringify(redactSecrets(settings), null, 2);
```

- [x] **Step 5: Run config/runtime tests**

Run: `npx vitest run src/tests/v2/settings-runtime.test.ts src/tests/v2/cli-bootstrap.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/settings.ts src/core/config/settings-loader.ts src/commands/config.ts src/tests/v2/settings-runtime.test.ts src/tests/v2/cli-bootstrap.test.ts
git commit -m "fix: align anng runtime settings with config inspection surface"
```

### Task 5: Finish Gemini smart-pool diagnostics and `doctor` as a support tool

**Files:**
- Modify: `src/common/openai-client.ts`
- Modify: `src/core/gemini/key-log.ts`
- Modify: `src/commands/doctor.ts`
- Modify: `src/tests/v2/gemini-smart-pool.test.ts`
- Modify: `src/tests/v2/doctor.test.ts`

- [x] **Step 1: Write a failing doctor test for key-rotation rows**

```ts
it("prints key rotation statistics when --keys is used", async () => {
  const writeStdout = vi.fn<(text: string) => void>();
  await runDoctorCommand(
    { cwd: process.cwd(), keys: true, outputMode: "text" },
    { writeStdout }
  );
  expect(writeStdout).toHaveBeenCalledWith(expect.stringContaining("Requests"));
});
```

- [x] **Step 2: Write a failing pool test for rate-limited key state**

```ts
const pool = new GeminiSmartPool({ "gemini-2.5-pro": ["k1"] });
pool.markRateLimited("gemini-2.5-pro", "k1", 60);
expect(pool.getState("gemini-2.5-pro")[0]?.status).toBe("rate_limited");
```

- [x] **Step 3: Keep the smart pool authoritative for Gemini key state and append stable JSONL snapshots**

```ts
appendKeyRotationSnapshot({
  maskedKey,
  requests,
  failures,
  status,
  waitSeconds,
}, cwd);
```

- [x] **Step 4: Make `anng doctor --keys` the supported human-readable debug path**

```ts
lines.push("");
lines.push(formatDoctorKeyTable(status.keyRows));
```

- [x] **Step 5: Run doctor/pool tests**

Run: `npx vitest run src/tests/v2/gemini-smart-pool.test.ts src/tests/v2/doctor.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/common/openai-client.ts src/core/gemini/key-log.ts src/commands/doctor.ts src/tests/v2/gemini-smart-pool.test.ts src/tests/v2/doctor.test.ts
git commit -m "feat: harden gemini pool diagnostics for anng doctor"
```

### Task 6: Stabilize one-shot, NDJSON, and daemon-basic flows

**Files:**
- Modify: `src/runtime/run-agent.ts`
- Modify: `src/runtime/run-daemon.ts`
- Modify: `src/commands/daemon.ts`
- Modify: `src/tests/v2/provider-runtime.test.ts`
- Modify: `src/tests/v2/daemon-command.test.ts`
- Modify: `src/tests/v2/team-daemon.test.ts`

- [x] **Step 1: Write a failing NDJSON test that asserts start and finish events**

```ts
expect(stdout[0]).toContain("\"type\":\"run_started\"");
expect(stdout[1]).toContain("\"type\":\"run_result\"");
```

- [x] **Step 2: Write a failing daemon test for manifest status transitions**

```ts
expect(manifest.status).toBe("completed");
expect(manifest.workerStartedAt).toBeDefined();
```

- [x] **Step 3: Keep one-shot and daemon flows on the same runtime adapter contract**

```ts
// src/runtime/run-agent.ts
writeJsonEvent({ type: "run_started", prompt: args.prompt, cwd: args.cwd });
writeJsonEvent({ type: "run_result", sessionId: result.sessionId, text: result.text, status: result.status });
```

- [x] **Step 4: Ensure daemon manifests are finalized on both success and non-zero exit**

```ts
current.status = status;
current.finishedAt = new Date().toISOString();
```

- [x] **Step 5: Run runtime/daemon tests**

Run: `npx vitest run src/tests/v2/provider-runtime.test.ts src/tests/v2/daemon-command.test.ts src/tests/v2/team-daemon.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/runtime/run-agent.ts src/runtime/run-daemon.ts src/commands/daemon.ts src/tests/v2/provider-runtime.test.ts src/tests/v2/daemon-command.test.ts src/tests/v2/team-daemon.test.ts
git commit -m "fix: stabilize anng one-shot and daemon basic runtimes"
```

### Task 7: Remove the old UI from the critical path and document the new center of gravity

**Files:**
- Modify: `src/runtime/run-interactive.ts`
- Modify: `src/tui/index.tsx`
- Modify: `src/ui/views/App.tsx`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-27-anng-v2-cli-merger.md`
- Test: `src/tests/v2/interactive-smoke.test.ts`

- [x] **Step 1: Write a failing smoke assertion that the interactive path boots through `renderInteractiveTui` only**

```ts
expect(renderedShell).toContain("ANNG // Terminal First Autonomy");
```

- [x] **Step 2: Document the deprecated role of `src/ui/views/App.tsx` before reducing its responsibility**

```ts
// Legacy interactive implementation retained temporarily while ANNG TUI absorbs remaining controls.
```

- [x] **Step 3: Move remaining startup ownership into the new shell and make the old UI a compatibility leaf**

```ts
// src/runtime/run-interactive.ts
await renderInteractiveTui(args);
```

- [x] **Step 4: Update README to describe the real shipped product**

```md
ANNG basic ships as a terminal-first coding agent focused on:
- interactive chat with persisted sessions
- one-shot/headless execution
- local BYOK provider configuration
- Gemini smart key rotation
```

- [x] **Step 5: Run smoke/build checks**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run bundle`
Expected: PASS

Run: `npx vitest run src/tests/v2`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/runtime/run-interactive.ts src/tui/index.tsx src/ui/views/App.tsx README.md docs/superpowers/plans/2026-06-27-anng-v2-cli-merger.md src/tests/v2/interactive-smoke.test.ts
git commit -m "docs: declare anng basic shell as the primary interactive architecture"
```

## Exit Criteria

The plan is done only when all of these are true:
- `anng` interactive mode can start, accept a prompt, show an answer, and continue follow-up turns.
- Session history is visible in `anng sessions` and reflected in the shell.
- `anng config`, `anng doctor`, and `anng doctor --keys` match runtime behavior and hide secrets.
- `anng "prompt"` and `anng --json "prompt"` remain stable and tested.
- `src/tests/v2` passes, `npm run typecheck` passes, and `npm run bundle` passes.

## Self-Review

**1. Spec coverage:** This narrowed plan covers the basic ANNG product only: chat, session persistence, CLI groups, config, doctor, headless, and Gemini rotation. It deliberately excludes advanced tmux/team autonomy and full Cline-parity TUI replacement.

**2. Placeholder scan:** No `TODO`, `TBD`, or “implement later” placeholders remain. Each task names exact files, concrete tests, and run commands.

**3. Type consistency:** The plan uses the current repo names consistently: `runCli`, `renderInteractiveTui`, `createAgentAdapter`, `SessionManager`, `runSessionsCommand`, and `GeminiSmartPool`.

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-basic-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
