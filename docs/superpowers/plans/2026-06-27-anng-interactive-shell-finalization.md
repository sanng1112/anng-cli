# ANNG Interactive Shell Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Finish the ANNG interactive shell so `src/tui/*` owns chat, prompt input, session switching, slash commands, raw reasoning, and image-paste behavior without routing core interaction through the legacy `src/ui/views/App.tsx`.

**Architecture:** Keep `SessionManager` as the execution engine, but move all interactive state orchestration into a small TUI shell layer. Reuse stable logic from `src/ui/core/*` and `src/ui/hooks/*` via focused adapters instead of dragging the old monolithic UI back into the hot path.

**Tech Stack:** TypeScript, React, Ink, existing `SessionManager`, current `src/ui/core/*` helpers, Vitest.

---

## Scope Lock

This plan covers only the interactive shell finish line:
- prompt input
- chat timeline
- slash-command handling
- session list/resume/new/continue
- raw reasoning toggle
- image paste handoff

This plan does **not** cover:
- tmux teams
- daemon autonomy upgrades
- SessionManager decomposition

## Target File Structure

- `src/tui/index.tsx`
  Responsibility: wire the shell to runtime adapters and startup snapshots.
- `src/tui/root.tsx`
  Responsibility: top-level layout, view mode, shell composition.
- `src/tui/session-shell.ts`
  Responsibility: stateful shell controller around prompt submission and session selection.
- `src/tui/controllers/prompt-controller.ts`
  Responsibility: prompt submission state, busy/error/status lifecycle.
- `src/tui/controllers/slash-command-controller.ts`
  Responsibility: slash command parsing and dispatch.
- `src/tui/views/chat-view.tsx`
  Responsibility: render active transcript, reasoning, status, and errors.
- `src/tui/views/prompt-view.tsx`
  Responsibility: prompt input and inline command UX.
- `src/tui/views/session-list-view.tsx`
  Responsibility: resume/select recent sessions from the new shell.
- `src/common/project-storage.ts`
  Responsibility: read transcript/session snapshots for shell hydration.
- `src/runtime/agent-adapter.ts`
  Responsibility: runtime bridge from shell to `SessionManager`.
- `src/tests/v2/tui-prompt-shell.test.ts`
  Responsibility: prompt and follow-up turn coverage.
- `src/tests/v2/tui-slash-commands.test.ts`
  Responsibility: slash command behavior coverage.
- `src/tests/v2/interactive-smoke.test.ts`
  Responsibility: shell branding and startup composition smoke coverage.

### Task 1: Build a dedicated prompt controller for the new shell

**Files:**
- Create: `src/tui/controllers/prompt-controller.ts`
- Create: `src/tests/v2/tui-prompt-shell.test.ts`
- Modify: `src/tui/session-shell.ts`
- Modify: `src/tui/views/chat-view.tsx`

- [x] **Step 1: Write the failing prompt-controller test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createPromptController } from "../../tui/controllers/prompt-controller";

describe("createPromptController", () => {
  it("tracks busy, status, and answer across one prompt", async () => {
    const submitPrompt = vi.fn(async () => ({
      sessionId: "session-1",
      text: "done",
      status: "completed",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      failReason: null,
    }));

    const controller = createPromptController({ submitPrompt });

    const run = controller.submit("fix tests");
    expect(controller.getState().busy).toBe(true);
    await run;
    expect(controller.getState().busy).toBe(false);
    expect(controller.getState().answer).toBe("done");
    expect(controller.getState().status).toBe("completed");
  });
});
```

- [x] **Step 2: Run the test to confirm the controller does not exist yet**

Run: `npx vitest run src/tests/v2/tui-prompt-shell.test.ts`
Expected: FAIL with module-not-found for `src/tui/controllers/prompt-controller.ts`

- [x] **Step 3: Add the minimal prompt controller**

```ts
// src/tui/controllers/prompt-controller.ts
export type PromptControllerState = {
  busy: boolean;
  answer: string;
  status: string | null;
  failReason: string | null;
  errorLine: string | null;
};

export function createPromptController(deps: {
  submitPrompt: (prompt: string) => Promise<{
    sessionId: string | null;
    text: string;
    status: string;
    failReason: string | null;
  }>;
}) {
  let state: PromptControllerState = {
    busy: false,
    answer: "",
    status: null,
    failReason: null,
    errorLine: null,
  };

  return {
    getState: () => state,
    submit: async (prompt: string) => {
      state = { ...state, busy: true, errorLine: null };
      try {
        const result = await deps.submitPrompt(prompt);
        state = {
          busy: false,
          answer: result.text,
          status: result.status,
          failReason: result.failReason,
          errorLine: null,
        };
      } catch (error) {
        state = {
          ...state,
          busy: false,
          errorLine: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
```

- [x] **Step 4: Feed the controller state into the shell and chat view**

```ts
// src/tui/session-shell.ts
const prompt = createPromptController({
  submitPrompt: deps.submitPrompt,
});
```

```tsx
// src/tui/views/chat-view.tsx
export function ChatView(props: {
  showReasoning: boolean;
  reasoning?: string;
  answer: string;
  status?: string | null;
  failReason?: string | null;
  errorLine?: string | null;
}) {
  return (
    <>
      {props.showReasoning && props.reasoning ? `${props.reasoning}\n` : null}
      {props.answer}
      {props.status ? `\nstatus=${props.status}` : null}
      {props.failReason ? `\nfail=${props.failReason}` : null}
      {props.errorLine ? `\nerror=${props.errorLine}` : null}
    </>
  );
}
```

- [x] **Step 5: Run the prompt controller test**

Run: `npx vitest run src/tests/v2/tui-prompt-shell.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tui/controllers/prompt-controller.ts src/tui/session-shell.ts src/tui/views/chat-view.tsx src/tests/v2/tui-prompt-shell.test.ts
git commit -m "feat: add dedicated prompt controller for anng interactive shell"
```

### Task 2: Port slash commands into the new shell

**Files:**
- Create: `src/tui/controllers/slash-command-controller.ts`
- Create: `src/tests/v2/tui-slash-commands.test.ts`
- Modify: `src/tui/session-shell.ts`
- Modify: `src/tui/root.tsx`
- Modify: `src/tui/views/prompt-view.tsx`

- [x] **Step 1: Write the failing slash-command test**

```ts
import { describe, expect, it } from "vitest";
import { dispatchSlashCommand } from "../../tui/controllers/slash-command-controller";

describe("dispatchSlashCommand", () => {
  it("maps /new, /continue, and /raw to shell actions", () => {
    const actions: string[] = [];
    dispatchSlashCommand("/new", {
      newSession: () => actions.push("new"),
      continueSession: () => actions.push("continue"),
      toggleRaw: () => actions.push("raw"),
      openSessions: () => actions.push("sessions"),
    });
    dispatchSlashCommand("/continue", {
      newSession: () => actions.push("new"),
      continueSession: () => actions.push("continue"),
      toggleRaw: () => actions.push("raw"),
      openSessions: () => actions.push("sessions"),
    });
    dispatchSlashCommand("/raw", {
      newSession: () => actions.push("new"),
      continueSession: () => actions.push("continue"),
      toggleRaw: () => actions.push("raw"),
      openSessions: () => actions.push("sessions"),
    });
    expect(actions).toEqual(["new", "continue", "raw"]);
  });
});
```

- [x] **Step 2: Run the slash-command test**

Run: `npx vitest run src/tests/v2/tui-slash-commands.test.ts`
Expected: FAIL with module-not-found for `src/tui/controllers/slash-command-controller.ts`

- [x] **Step 3: Add a focused slash dispatcher**

```ts
// src/tui/controllers/slash-command-controller.ts
export function dispatchSlashCommand(
  input: string,
  actions: {
    newSession: () => void;
    continueSession: () => void;
    toggleRaw: () => void;
    openSessions: () => void;
  }
): boolean {
  const command = input.trim().split(/\s+/)[0];
  if (command === "/new") {
    actions.newSession();
    return true;
  }
  if (command === "/continue") {
    actions.continueSession();
    return true;
  }
  if (command === "/raw") {
    actions.toggleRaw();
    return true;
  }
  if (command === "/resume") {
    actions.openSessions();
    return true;
  }
  return false;
}
```

- [x] **Step 4: Wire slash dispatch before prompt submission**

```ts
// src/tui/session-shell.ts
if (dispatchSlashCommand(prompt, actions)) {
  return;
}
await promptController.submit(prompt);
```

```tsx
// src/tui/views/prompt-view.tsx
export function PromptView(props: {
  value: string;
  placeholder?: string;
}) {
  return `${props.value || props.placeholder || ""}`;
}
```

- [x] **Step 5: Run the slash-command and smoke tests**

Run: `npx vitest run src/tests/v2/tui-slash-commands.test.ts src/tests/v2/interactive-smoke.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tui/controllers/slash-command-controller.ts src/tui/session-shell.ts src/tui/root.tsx src/tui/views/prompt-view.tsx src/tests/v2/tui-slash-commands.test.ts src/tests/v2/interactive-smoke.test.ts
git commit -m "feat: port essential slash commands into anng tui shell"
```

### Task 3: Move session selection and resume into the new shell

**Files:**
- Create: `src/tui/views/session-list-view.tsx`
- Modify: `src/common/project-storage.ts`
- Modify: `src/tui/index.tsx`
- Modify: `src/tui/root.tsx`
- Modify: `src/tests/v2/interactive-smoke.test.ts`

- [x] **Step 1: Write the failing smoke assertion for session list rendering**

```ts
expect(text).toContain("Recent Sessions");
expect(text).toContain("session-12345678");
```

- [x] **Step 2: Add a helper that exposes the latest persisted transcript for shell hydration**

```ts
// src/common/project-storage.ts
export function readRecentSessionTranscript(projectRoot: string, limit = 8) {
  const recent = readRecentSessions(projectRoot, 1)[0];
  if (!recent) {
    return [];
  }
  return readStoredSessionMessages(projectRoot, recent.id, limit);
}
```

- [x] **Step 3: Add a minimal session list view**

```tsx
// src/tui/views/session-list-view.tsx
import React from "react";

export function SessionListView(props: {
  sessions: Array<{ id: string; summary: string | null; status: string }>;
}) {
  return (
    <>
      {"Recent Sessions\n"}
      {props.sessions.map((session) => `${session.id} ${session.status} ${session.summary ?? "<no summary>"}`).join("\n")}
    </>
  );
}
```

- [x] **Step 4: Render the session list from the shell root**

```tsx
// src/tui/root.tsx
<SessionListView
  sessions={recentSessions.map((session) => ({
    id: session.id,
    summary: session.summary,
    status: session.status,
  }))}
/>
```

- [x] **Step 5: Run shell/session tests**

Run: `npx vitest run src/tests/v2/interactive-smoke.test.ts src/tests/v2/sessions-command.test.ts src/tests/v2/project-storage-shell.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tui/views/session-list-view.tsx src/common/project-storage.ts src/tui/index.tsx src/tui/root.tsx src/tests/v2/interactive-smoke.test.ts
git commit -m "feat: render session selection and resume data from anng tui"
```

### Task 4: Remove the legacy app from the interactive hot path

**Files:**
- Modify: `src/tui/index.tsx`
- Modify: `src/runtime/run-interactive.ts`
- Modify: `src/ui/views/App.tsx`
- Modify: `src/ui/views/AppContainer.tsx`
- Modify: `README.md`

- [x] **Step 1: Write the failing smoke expectation that the shell renders without `AppContainer` content**

```ts
expect(text).toContain("ANNG // Terminal First Autonomy");
expect(text).not.toContain("WelcomeScreen");
```

- [x] **Step 2: Stop mounting `AppContainer` from the TUI bootstrap**

```ts
// src/tui/index.tsx
const ink = render(
  React.createElement(RootView, {
    initialPrompt: args.prompt,
    cwd: args.cwd,
    provider: args.provider ?? settings.provider ?? "auto",
    model: args.model ?? settings.model,
    mode: args.autoAccept ? "yolo" : args.planMode ? "plan" : "interactive",
    teamMode: args.teamMode,
    teamTmux: args.teamTmux,
    contextHints,
    settings,
    doctor,
    storage,
    recentSessions,
    latestTranscript,
  })
);
```

- [x] **Step 3: Mark the old app as compatibility-only**

```ts
// src/ui/views/App.tsx
// Legacy interactive implementation retained only for compatibility tests while ANNG TUI owns the runtime shell.
```

- [x] **Step 4: Update README to describe the TUI cutover accurately**

```md
The default `anng` interactive experience now runs through the ANNG TUI shell in `src/tui/*`.
Legacy `src/ui/*` code remains temporarily for compatibility and migration.
```

- [x] **Step 5: Run final shell checks**

Run: `npm run typecheck`
Expected: PASS

Run: `npx vitest run src/tests/v2/interactive-smoke.test.ts src/tests/v2/tui-prompt-shell.test.ts src/tests/v2/tui-slash-commands.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/tui/index.tsx src/runtime/run-interactive.ts src/ui/views/App.tsx src/ui/views/AppContainer.tsx README.md
git commit -m "refactor: remove legacy app from anng interactive hot path"
```

## Self-Review

**1. Spec coverage:** Covers prompt input, slash commands, session resume, reasoning toggle surface, and the final cutover away from the legacy app in interactive mode.

**2. Placeholder scan:** No `TODO`, `TBD`, or vague “implement later” placeholders remain.

**3. Type consistency:** Uses the existing repo names consistently: `SessionManager`, `RootView`, `readRecentSessions`, `readStoredSessionMessages`, and `createAgentAdapter`.

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-interactive-shell-finalization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
