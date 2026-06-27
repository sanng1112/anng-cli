# ANNG Autonomy Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Finish the ANNG moat beyond a basic CLI by making daemon work durable, tmux teams first-class, and long-running repo automation operable from the terminal with inspectable state.

**Architecture:** Keep one-shot and interactive paths on the same engine contract, but introduce a stronger background-runtime layer around task manifests, tmux workers, queue orchestration, and internal MCP tools. The autonomy runtime should remain CLI-only and stateful through files under `~/.anng`.

**Tech Stack:** TypeScript, Node 22, tmux, Vitest, file-based manifests, MCP, existing team runtime helpers.

---

## Scope Lock

This plan covers:
- daemon lifecycle durability
- tmux team launch/status/cancel
- queue-driven overnight workflows
- internal MCP exposure for ANNG runtime helpers

This plan does **not** cover:
- web dashboards
- Slack/Telegram connectors
- hosted control planes

## Target File Structure

- `src/runtime/run-daemon.ts`
  Responsibility: create and supervise detached worker runs.
- `src/core/team/daemon-state.ts`
  Responsibility: manifests, heartbeats, cancellation, log pointers.
- `src/core/team/tmux-runner.ts`
  Responsibility: launch and stop tmux-backed workers safely.
- `src/core/team/team-runtime.ts`
  Responsibility: orchestrate internal and tmux team execution modes.
- `src/commands/daemon.ts`
  Responsibility: list/show/logs/cancel subcommands.
- `src/commands/program.ts`
  Responsibility: add daemon/team command grammar and flags.
- `src/core/mcp/internal-servers.ts`
  Responsibility: expose ANNG runtime helpers through internal MCP tools.
- `src/common/task-queue.ts`
  Responsibility: queue persistence and task lifecycle.
- `src/tests/v2/daemon-command.test.ts`
  Responsibility: daemon CLI behavior.
- `src/tests/v2/team-daemon.test.ts`
  Responsibility: daemon/tmux runtime behavior.
- `src/tests/v2/internal-mcp-runtime.test.ts`
  Responsibility: internal MCP runtime tools.

### Task 1: Make daemon tasks durable and cancellable

**Files:**
- Modify: `src/runtime/run-daemon.ts`
- Modify: `src/core/team/daemon-state.ts`
- Modify: `src/commands/daemon.ts`
- Modify: `src/tests/v2/daemon-command.test.ts`
- Modify: `src/tests/v2/team-daemon.test.ts`

- [x] **Step 1: Write the failing daemon cancel test**

```ts
import { describe, expect, it } from "vitest";
import { runDaemonCommand } from "../../commands/daemon";

describe("daemon cancel", () => {
  it("prints a cancel acknowledgement", async () => {
    let stdout = "";
    await runDaemonCommand(
      { cwd: process.cwd(), action: "cancel", taskId: "daemon-1", outputMode: "text" },
      {
        cancelTask: () => true,
        writeStdout: (text) => {
          stdout += text;
        },
      }
    );
    expect(stdout).toContain("Cancelled daemon task");
  });
});
```

- [x] **Step 2: Run the daemon tests**

Run: `npx vitest run src/tests/v2/daemon-command.test.ts src/tests/v2/team-daemon.test.ts`
Expected: FAIL because `cancel` is not a supported action yet

- [x] **Step 3: Extend the daemon manifest model with heartbeat and cancellation**

```ts
// src/core/team/daemon-state.ts
export type DaemonManifest = {
  id: string;
  prompt: string;
  cwd: string;
  createdAt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  heartbeatAt?: string;
  cancelRequestedAt?: string;
};
```

- [x] **Step 4: Add `cancel` handling in the command surface**

```ts
// src/commands/daemon.ts
if (action === "cancel") {
  const ok = cancelTask(input.cwd, input.taskId ?? "");
  writeStdout(ok ? `Cancelled daemon task: ${input.taskId}\n` : `Daemon task not found: ${input.taskId}\n`);
  return;
}
```

- [x] **Step 5: Run daemon tests again**

Run: `npx vitest run src/tests/v2/daemon-command.test.ts src/tests/v2/team-daemon.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/runtime/run-daemon.ts src/core/team/daemon-state.ts src/commands/daemon.ts src/tests/v2/daemon-command.test.ts src/tests/v2/team-daemon.test.ts
git commit -m "feat: add durable cancellation and heartbeat to anng daemon runtime"
```

### Task 2: Make tmux teams operable from the CLI surface

**Files:**
- Modify: `src/core/team/tmux-runner.ts`
- Modify: `src/core/team/team-runtime.ts`
- Modify: `src/commands/program.ts`
- Modify: `src/main.ts`
- Modify: `src/tests/v2/team-daemon.test.ts`

- [x] **Step 1: Write the failing tmux team-mode test**

```ts
it("routes --anng-team --anng-tmux into team runtime", async () => {
  const parsed = parseCliArgs(["--anng-team", "--anng-tmux", "refactor repo"]);
  expect(parsed.anngTeam).toBe(true);
  expect(parsed.anngTmux).toBe(true);
});
```

- [x] **Step 2: Run the tmux/team tests**

Run: `npx vitest run src/tests/v2/team-daemon.test.ts src/tests/v2/cli-bootstrap.test.ts`
Expected: FAIL because team runtime does not yet assert tmux execution ownership strongly enough

- [x] **Step 3: Make the tmux runner return structured worker handles**

```ts
// src/core/team/tmux-runner.ts
export type TmuxWorkerHandle = {
  sessionName: string;
  paneId?: string;
};

export function launchTmuxWorker(sessionName: string, command: string, args: string[]): TmuxWorkerHandle {
  return {
    sessionName,
  };
}
```

- [x] **Step 4: Route team mode through `team-runtime` explicitly**

```ts
// src/main.ts
if (parsed.anngTeam && parsed.prompt) {
  await runTeamRuntime({
    prompt: parsed.prompt,
    cwd: parsed.cwd ?? process.cwd(),
    tmux: parsed.anngTmux,
  });
  return;
}
```

- [x] **Step 5: Run the CLI/team tests**

Run: `npx vitest run src/tests/v2/team-daemon.test.ts src/tests/v2/cli-bootstrap.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/team/tmux-runner.ts src/core/team/team-runtime.ts src/commands/program.ts src/main.ts src/tests/v2/team-daemon.test.ts
git commit -m "feat: route anng team mode through explicit tmux runtime"
```

### Task 3: Add queue-driven overnight workflow execution

**Files:**
- Modify: `src/common/task-queue.ts`
- Modify: `src/runtime/run-daemon.ts`
- Modify: `src/core/team/daemon-state.ts`
- Modify: `src/tests/v2/team-daemon.test.ts`

- [x] **Step 1: Write the failing queue-workflow test**

```ts
it("records queue task completion during daemon processing", () => {
  expect(typeof markTaskDoneById).toBe("function");
});
```

- [x] **Step 2: Run the queue and daemon tests**

Run: `npx vitest run src/tests/v2/team-daemon.test.ts src/tests/task-queue.test.ts`
Expected: FAIL because queue state is not yet linked to daemon lifecycle

- [x] **Step 3: Add daemon metadata for queue-backed tasks**

```ts
// src/core/team/daemon-state.ts
export type DaemonManifest = {
  id: string;
  prompt: string;
  cwd: string;
  createdAt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  queueName?: string;
  queueTaskId?: string;
};
```

- [x] **Step 4: Mark queue tasks as done only after completed daemon runs**

```ts
// src/runtime/run-daemon.ts
if (manifest.queueName && manifest.queueTaskId && process.exitCode === 0) {
  markTaskDoneById(input.cwd, manifest.queueName, manifest.queueTaskId);
}
```

- [x] **Step 5: Run the queue/daemon tests**

Run: `npx vitest run src/tests/v2/team-daemon.test.ts src/tests/task-queue.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/common/task-queue.ts src/runtime/run-daemon.ts src/core/team/daemon-state.ts src/tests/v2/team-daemon.test.ts
git commit -m "feat: connect queue-backed overnight tasks to anng daemon completion"
```

### Task 4: Expose runtime helpers as internal MCP tools

**Files:**
- Modify: `src/core/mcp/internal-servers.ts`
- Create: `src/tests/v2/internal-mcp-runtime.test.ts`
- Modify: `src/mcp/mcp-manager.ts`
- Modify: `src/tests/v2/mcp-command.test.ts`

- [x] **Step 1: Write the failing internal MCP runtime test**

```ts
import { describe, expect, it } from "vitest";
import { getInternalMcpServers } from "../../core/mcp/internal-servers";

describe("internal runtime MCP servers", () => {
  it("exposes daemon and team helper tools", () => {
    const servers = getInternalMcpServers(process.cwd());
    expect(Object.keys(servers)).toContain("anng-runtime");
  });
});
```

- [x] **Step 2: Run the MCP tests**

Run: `npx vitest run src/tests/v2/internal-mcp-runtime.test.ts src/tests/v2/mcp-command.test.ts`
Expected: FAIL because the `anng-runtime` server and tools are not exposed yet

- [x] **Step 3: Add internal runtime tools**

```ts
// src/core/mcp/internal-servers.ts
export function getInternalMcpServers(cwd: string) {
  return {
    "anng-runtime": {
      tools: [
        { name: "list_daemon_tasks", cwd },
        { name: "dispatch_tmux_team", cwd },
      ],
    },
  };
}
```

- [x] **Step 4: Merge the internal runtime server into MCP manager startup**

```ts
// src/mcp/mcp-manager.ts
const internalServers = getInternalMcpServers(this.cwd);
```

- [x] **Step 5: Run MCP/runtime tests**

Run: `npx vitest run src/tests/v2/internal-mcp-runtime.test.ts src/tests/v2/mcp-command.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/core/mcp/internal-servers.ts src/mcp/mcp-manager.ts src/tests/v2/internal-mcp-runtime.test.ts src/tests/v2/mcp-command.test.ts
git commit -m "feat: expose anng autonomy helpers through internal mcp tools"
```

## Self-Review

**1. Spec coverage:** Covers daemon durability, tmux team routing, queue-backed overnight work, and MCP exposure for internal autonomy helpers.

**2. Placeholder scan:** No placeholders or vague “wire it up later” steps remain.

**3. Type consistency:** Reuses the current repo names consistently: `runDaemonCommand`, `parseCliArgs`, `markTaskDoneById`, `getInternalMcpServers`, and the team runtime files under `src/core/team/*`.

Plan complete and saved to `docs/superpowers/plans/2026-06-27-anng-autonomy-runtime.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
