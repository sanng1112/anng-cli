# Team Tmux Multi-Pane Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/team` into a full interactive experience: agent configuration UI → tmux multi-pane layout with coordinator chat (left) and independent agent panes (right), each running `anng --worker` in real-time.

**Architecture:** Extend the existing `TmuxManager` and `TerminalMultiplexer` interface with layout capabilities. Introduce `TeamTmuxLayout` to manage the left-right split pane topology. Add `TeamTmuxCoordinator` as a lightweight agent that runs a chat loop in the coordinator pane, decomposing user tasks and dispatching directives to worker panes via `tmux send-keys`. The existing `AgentWorker` handles `--worker` invocations inside agent panes.

**Tech Stack:** TypeScript, Node.js `child_process` (execSync), tmux CLI, Ink (React ink) for TUI, Zod for validation, `node:test` for testing.

---

## Scope Check

This plan covers **three subsystems** that can be built and tested independently, then integrated:

| Subsystem | Description | Independent? |
|-----------|-------------|-------------|
| **Tmux Layout Engine** | TmuxManager fixes + TeamTmuxLayout | ✅ Yes (can test with mock execSync) |
| **Coordinator Chat Loop** | TeamTmuxCoordinator | ✅ Yes (can test without tmux) |
| **TeamCreateView + Integration** | UI changes + App.tsx wiring | ⚠️ Depends on above |

Each phase produces working, testable software on its own. The plan is structured as sequential phases.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/team/team-tmux-layout.ts` | Creates/manages tmux session with coordinator pane (left) and N agent panes (right). Exposes `createTeamSession()`, `sendToAgentPane()`, `captureAgentPane()`, `killTeamSession()`. |
| `src/team/team-tmux-coordinator.ts` | Runs a coordinator chat loop: read user input → call LLM → send directives to agents via TeamTmuxLayout. Exposes `startCoordinator()`, `stopCoordinator()`. |
| `src/tests/team/team-tmux-layout.test.ts` | Tests TeamTmuxLayout with mocked child_process. |
| `src/tests/team/team-tmux-coordinator.test.ts` | Tests TeamTmuxCoordinator with mocked layout. |

### Modified Files

| File | Change |
|------|--------|
| `src/team/integrations/terminal-multiplexer.ts` | Add `selectLayout()`, `splitPaneVertically()`, `setPaneTitle()` method signatures. |
| `src/team/integrations/tmux-manager.ts` | Fix `exec` to use sync `execSync` properly; add `selectLayout()`, `splitPaneVertically()`, `setPaneTitle()` implementations. |
| `src/team/types.ts` | Add `TmuxLayoutConfig` interface; export `TeamAgentRule` type. |
| `src/ui/views/TeamCreateView.tsx` | Add `onStartTeam` callback; restructure to show config first, then a "Start Team" button that triggers tmux launch. |
| `src/ui/views/App.tsx` | Wire `TeamCreateView` → `onStartTeam` → launches `TeamOrchestrator` with tmux mode; handle `/team kill` cleanup. |
| `src/team/team-orchestrator.ts` | Add new `createTmuxTeamLayout()` method that creates layout, starts coordinator, waits for completion. |
| `src/team/agent-worker.ts` | Fix tmux pane execution to poll for real completion instead of returning dummy success. |

---

## Phase 1: Fix TerminalMultiplexer Interface & TmuxManager


---

## Phase 1: Fix TerminalMultiplexer Interface & TmuxManager

### Task 1: Add layout methods to TerminalMultiplexer

**Files:**
- Modify: `src/team/integrations/terminal-multiplexer.ts`

- [ ] **Step 1: Add new method signatures**

```typescript
// src/team/integrations/terminal-multiplexer.ts

export interface TerminalMultiplexer {
  createSession(name: string, cwd: string): Promise<void>;
  createPane(sessionName: string, command: string, cwd: string): Promise<string>;
  sendCommand(paneId: string, command: string): Promise<void>;
  capturePane(paneId: string): Promise<string>;
  killSession(sessionName: string): Promise<void>;
  attachSession?(sessionName: string): Promise<void>;
  isAvailable(): Promise<boolean>;

  // NEW — Layout & pane management
  selectLayout(sessionName: string, layout: string): Promise<void>;
  splitPaneVertically(sessionName: string, targetPane?: string): Promise<string>;
  setPaneTitle(paneId: string, title: string): Promise<void>;
  listPanes(sessionName: string): Promise<string[]>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -5
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/integrations/terminal-multiplexer.ts && git commit -m "feat: add layout methods to TerminalMultiplexer interface"
```



### Task 2: Fix TmuxManager exec pattern and implement layout methods

**Files:**
- Modify: `src/team/integrations/tmux-manager.ts`

**Problem:** Current `TmuxManager` declares methods as `async` but `this.exec()` is synchronous (`execSync`). Methods like `createSession()` and `createPane()` call `this.exec()` without `await`, so the `async` keyword is misleading.

**Fix:** Make all methods return `Promise` (for interface conformance) but use synchronous `execSync` internally.

- [ ] **Step 1: Rewrite TmuxManager**

```typescript
// src/team/integrations/tmux-manager.ts — full file replacement
import { execSync } from "child_process";
import type { TerminalMultiplexer } from "./terminal-multiplexer";

export class TmuxManager implements TerminalMultiplexer {
  isAvailable(): Promise<boolean> {
    try {
      execSync("tmux -V", { stdio: "ignore" });
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  createSession(name: string, cwd: string): Promise<void> {
    this.exec(`tmux new-session -d -s "${name}" -c "${cwd}"`);
    return Promise.resolve();
  }

  async createPane(sessionName: string, command: string, cwd: string): Promise<string> {
    const paneCount = await this.getPaneCount(sessionName);
    if (paneCount === 0) await this.createSession(sessionName, cwd);
    const paneIndex = await this.getPaneCount(sessionName);
    const cmd = `tmux split-window -t "${sessionName}" -c "${cwd}" "clear; echo '=== Agent starting ==='; ${command}; exec \\$SHELL"`;
    this.exec(cmd);
    return `${sessionName}:0.${paneIndex}`;
  }

  sendCommand(paneId: string, command: string): Promise<void> {
    this.exec(`tmux send-keys -t "${paneId}" "${this.escapeCommand(command)}" Enter`);
    return Promise.resolve();
  }

  capturePane(paneId: string): Promise<string> {
    const output = execSync(`tmux capture-pane -t "${paneId}" -p`, { encoding: "utf8", timeout: 5000 });
    return Promise.resolve(output);
  }

  killSession(sessionName: string): Promise<void> {
    try { this.exec(`tmux kill-session -t "${sessionName}"`); } catch { /* ok */ }
    return Promise.resolve();
  }

  attachSession(sessionName: string): Promise<void> {
    const { spawn } = require("child_process");
    const child = spawn("tmux", ["attach-session", "-t", sessionName], { stdio: "inherit" });
    return new Promise((resolve) => { child.on("exit", () => resolve()); });
  }

  selectLayout(sessionName: string, layout: string): Promise<void> {
    this.exec(`tmux select-layout -t "${sessionName}" "${layout}"`);
    return Promise.resolve();
  }

  async splitPaneVertically(sessionName: string, targetPane?: string): Promise<string> {
    const before = await this.listPanes(sessionName);
    const target = targetPane ? `-t "${targetPane}" ` : "";
    this.exec(`tmux split-window -h ${target}-c "${process.cwd()}"`);
    const after = await this.listPanes(sessionName);
    const newPane = after.find((p) => !before.includes(p));
    return newPane ?? after[after.length - 1];
  }

  setPaneTitle(paneId: string, title: string): Promise<void> {
    this.exec(`tmux select-pane -t "${paneId}" -T "${title}"`);
    return Promise.resolve();
  }

  listPanes(sessionName: string): Promise<string[]> {
    const out = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_id}"`, { encoding: "utf8" });
    return Promise.resolve(out.trim().split("\n").filter(Boolean));
  }

  private exec(command: string): string {

## Phase 2: TeamTmuxLayout — Session & Pane Topology

### Task 3: Add TmuxLayoutConfig type and write tests

**Files:**
- Modify: `src/team/types.ts`
- Create: `src/tests/team/team-tmux-layout.test.ts`

- [ ] **Step 1: Add TmuxLayoutConfig and TmuxLayoutResult to types.ts**

```typescript
// src/team/types.ts — add after TeamSettings (around line 183)

export interface TmuxLayoutConfig {
  sessionName: string;
  cwd: string;
  coordinatorLabel: string;
  agents: Array<{
    name: string;
    command: string;
  }>;
}

export interface TmuxLayoutResult {
  coordinatorPaneId: string;
  agentPaneIds: string[];
}
```

- [ ] **Step 2: Write test file with mocked multiplexer**

```typescript
// src/tests/team/team-tmux-layout.test.ts

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { TerminalMultiplexer } from "../../team/integrations/terminal-multiplexer";
import { TeamTmuxLayout } from "../../team/team-tmux-layout";
import type { TmuxLayoutConfig } from "../../team/types";

function createMockMux() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const mock: TerminalMultiplexer = {
    createSession: async (name, cwd) => { calls.push({ method: "createSession", args: [name, cwd] }); },
    createPane: async (sn, cmd, cwd) => { calls.push({ method: "createPane", args: [sn, cmd, cwd] }); return `${sn}:pane-${calls.length}`; },
    sendCommand: async (pid, cmd) => { calls.push({ method: "sendCommand", args: [pid, cmd] }); },
    capturePane: async (pid) => { calls.push({ method: "capturePane", args: [pid] }); return `[${pid}]`; },
    killSession: async (n) => { calls.push({ method: "killSession", args: [n] }); },
    isAvailable: async () => true,
    selectLayout: async (sn, layout) => { calls.push({ method: "selectLayout", args: [sn, layout] }); },
- [ ] **Step 3: Add test cases after the mock helper**

```typescript
describe("TeamTmuxLayout", () => {
  let mockMux: ReturnType<typeof createMockMux>;

  beforeEach(() => { mockMux = createMockMux(); });

  it("creates session with coordinator pane and agent panes", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test-team", cwd: "/tmp/project",
      coordinatorLabel: "Coordinator",
      agents: [
        { name: "Agent1", command: "anng --worker -p task1" },
        { name: "Agent2", command: "anng --worker -p task2" },
      ],
    };
    const layout = new TeamTmuxLayout(mockMux.mock, config);
    const result = await layout.createTeamSession();

    const createCall = mockMux.calls.find(c => c.method === "createSession");
    assert.ok(createCall, "createSession called");
    assert.equal(createCall!.args[0], "test-team");

    const splitCalls = mockMux.calls.filter(c => c.method === "splitPaneVertically");
    assert.ok(splitCalls.length >= 1, "split occurred");

    const titleCalls = mockMux.calls.filter(c => c.method === "setPaneTitle");
    assert.ok(titleCalls.length >= 2, "titles set for coordinator+agents");

    const paneCalls = mockMux.calls.filter(c => c.method === "createPane");
    assert.equal(paneCalls.length, 2, "one pane per agent");

    assert.ok(result.coordinatorPaneId);
    assert.equal(result.agentPaneIds.length, 2);
  });

  it("sendToAgentPane sends command to specific pane", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test", cwd: "/tmp",
      coordinatorLabel: "C", agents: [{ name: "A1", command: "worker" }],
    };
    const layout = new TeamTmuxLayout(mockMux.mock, config);
    const result = await layout.createTeamSession();
    await layout.sendToAgentPane(result.agentPaneIds[0], "Hello");
    const sendCall = mockMux.calls.find(c => c.method === "sendCommand" && c.args[0] === result.agentPaneIds[0]);
    assert.ok(sendCall, "sendCommand to agent pane");
  });

  it("killTeamSession kills the session", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test", cwd: "/tmp",
      coordinatorLabel: "C", agents: [],
    };
    const layout = new TeamTmuxLayout(mockMux.mock, config);
    await layout.createTeamSession();
    await layout.killTeamSession();
    assert.ok(mockMux.calls.find(c => c.method === "killSession"), "killSession called");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test src/tests/team/team-tmux-layout.test.ts 2>&1 | head -10
```

### Task 4: Implement TeamTmuxLayout

**Files:**
- Create: `src/team/team-tmux-layout.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/team/team-tmux-layout.ts

import type { TerminalMultiplexer } from "./integrations/terminal-multiplexer";
import type { TmuxLayoutConfig, TmuxLayoutResult } from "./types";

/**
 * TeamTmuxLayout manages a tmux session with:
 * - Left pane: coordinator chat (50% width)
 * - Right region: split vertically into N agent panes
 */
export class TeamTmuxLayout {
  private mux: TerminalMultiplexer;
  private config: TmuxLayoutConfig;
  private result: TmuxLayoutResult | null = null;

  constructor(mux: TerminalMultiplexer, config: TmuxLayoutConfig) {
    this.mux = mux;
    this.config = config;
  }

  async createTeamSession(): Promise<TmuxLayoutResult> {
    const { sessionName, cwd, coordinatorLabel, agents } = this.config;

    // 1. Create the detached session (initial pane = coordinator)
    await this.mux.createSession(sessionName, cwd);
    const initialPanes = await this.mux.listPanes(sessionName);
    const coordinatorPaneId = initialPanes[0] ?? `${sessionName}:0.0`;

    // 2. Set coordinator pane title
    await this.mux.setPaneTitle(coordinatorPaneId, coordinatorLabel);

    // 3. If agents exist, split vertically (coordinator left, agents right)
    if (agents.length > 0) {
      await this.mux.splitPaneVertically(sessionName);
      const panesAfterSplit = await this.mux.listPanes(sessionName);
      const rightPaneId = panesAfterSplit[1] ?? panesAfterSplit[panesAfterSplit.length - 1];

      // 4. For each agent: start in its pane
      const agentPaneIds: string[] = [];
      for (let i = 0; i < agents.length; i++) {
        let agentPaneId: string;
        if (i === 0) {
          agentPaneId = rightPaneId;
        } else {
          const firstAgentPane = agentPaneIds[0] ?? rightPaneId;
          await this.mux.splitPaneVertically(sessionName, firstAgentPane);
          const panesAfter = await this.mux.listPanes(sessionName);
          agentPaneId = panesAfter[panesAfter.length - 1];
        }

        await this.mux.setPaneTitle(agentPaneId, agents[i].name);
        await this.mux.sendCommand(agentPaneId, agents[i].command);
        agentPaneIds.push(agentPaneId);
      }

      // 5. Apply main-vertical layout
      await this.mux.selectLayout(sessionName, "main-vertical");
      this.result = { coordinatorPaneId, agentPaneIds };
    } else {
      this.result = { coordinatorPaneId, agentPaneIds: [] };
    }

    return this.result;
  }

  async sendToCoordinator(command: string): Promise<void> {
    if (!this.result) throw new Error("Team session not created");
    await this.mux.sendCommand(this.result.coordinatorPaneId, command);
  }

  async sendToAgentPane(paneId: string, command: string): Promise<void> {
    await this.mux.sendCommand(paneId, command);
  }

  async captureCoordinatorPane(): Promise<string> {
    if (!this.result) throw new Error("Team session not created");

## Phase 3: TeamTmuxCoordinator — Chat Loop

### Task 5: Write TeamTmuxCoordinator tests

**Files:**
- Create: `src/tests/team/team-tmux-coordinator.test.ts`

- [ ] **Step 1: Write test file**

```typescript
// src/tests/team/team-tmux-coordinator.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TeamTmuxCoordinator } from "../../team/team-tmux-coordinator";
import type { TmuxLayoutResult } from "../../team/types";

function createFakeLayout() {
  const sentToCoordinator: string[] = [];
  const sentToAgents: Array<{ paneId: string; command: string }> = [];
  let capturedCoordinator = "";

  return {
    layout: {
      sendToCoordinator: async (cmd: string) => { sentToCoordinator.push(cmd); },
      sendToAgentPane: async (paneId: string, cmd: string) => { sentToAgents.push({ paneId, command: cmd }); },
      captureCoordinatorPane: async () => capturedCoordinator,
      captureAgentPane: async (paneId: string) => `[output from ${paneId}]`,
      killTeamSession: async () => {},
      getResult: () => ({ coordinatorPaneId: "s:0.0", agentPaneIds: ["s:0.1", "s:0.2"] } as TmuxLayoutResult),
    },
    sentToCoordinator,
    sentToAgents,
    setCapturedCoordinator: (text: string) => { capturedCoordinator = text; },
  };
}

describe("TeamTmuxCoordinator", () => {
  it("dispatches a directive to a specific agent pane", async () => {
    const fake = createFakeLayout();
    const coord = new TeamTmuxCoordinator(fake.layout as any);
    await coord.dispatchToAgent("s:0.1", "Build the login form");
    assert.equal(fake.sentToAgents.length, 1);
    assert.equal(fake.sentToAgents[0].paneId, "s:0.1");
    assert.ok(fake.sentToAgents[0].command.includes("Build the login form"));
  });

  it("broadcasts to all agent panes", async () => {
    const fake = createFakeLayout();
    const coord = new TeamTmuxCoordinator(fake.layout as any);
    await coord.broadcastToAll("Please update your status");
    assert.equal(fake.sentToAgents.length, 2);
  });

  it("reads agent output", async () => {
    const fake = createFakeLayout();
    const coord = new TeamTmuxCoordinator(fake.layout as any);
    const output = await coord.readAgentOutput("s:0.1");
    assert.ok(output.includes("s:0.1"));
  });

  it("stopCoordinator sets running flag to false", async () => {
    const fake = createFakeLayout();
    const coord = new TeamTmuxCoordinator(fake.layout as any);

### Task 6: Implement TeamTmuxCoordinator

**Files:**
- Create: `src/team/team-tmux-coordinator.ts`

- [ ] **Step 1: Write implementation**

```typescript
// src/team/team-tmux-coordinator.ts

import type { TeamTmuxLayout } from "./team-tmux-layout";

/**
 * TeamTmuxCoordinator manages the coordinator chat loop and agent dispatch.
 *
 * For MVP:
 * - dispatchToAgent sends directives to individual agent panes
 * - broadcastToAll sends to all agent panes
 * - startCoordinator runs a polling loop that reads coordinator pane output
 */
export class TeamTmuxCoordinator {
  private layout: TeamTmuxLayout;
  private running = false;

  constructor(layout: TeamTmuxLayout) {
    this.layout = layout;
  }

  async startCoordinator(
    processInput: (input: string) => Promise<string>,
    shouldStop: () => Promise<boolean>
  ): Promise<void> {
    this.running = true;

    await this.layout.sendToCoordinator(
      "echo '=== Coordinator Ready ==='\n" +
      "echo 'Type your task and the coordinator will dispatch it.'"
    );

    let lastCapture = "";

    while (this.running) {
      if (await shouldStop()) break;

      const currentCapture = await this.layout.captureCoordinatorPane();
      if (currentCapture !== lastCapture && currentCapture.length > 0) {
        const newInput = currentCapture.slice(lastCapture.length).trim();
        if (newInput) {
          const response = await processInput(newInput);
          if (response) {
            await this.layout.sendToCoordinator(`echo 'Coordinator: ${this.escapeForShell(response)}'`);
          }
        }
        lastCapture = currentCapture;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  stopCoordinator(): void {
    this.running = false;
  }


## Phase 4: TeamCreateView Enhancement

### Task 7: Add Start Team button to TeamCreateView

**Files:**
- Modify: `src/ui/views/TeamCreateView.tsx`

**Changes:**
1. Add `onStartTeam: (agents: TeamAgentRule[]) => void` prop
2. Add "Start Team" button via 'S' key
3. Show both "Enter to run internally" and "S to start tmux panels"

- [ ] **Step 1: Update props interface**

```typescript
// src/ui/views/TeamCreateView.tsx — replace existing interface
interface TeamCreateViewProps {
  projectRoot: string;
  onRunTask: (taskText: string) => void;
  onStartTeam: (agents: TeamAgentRule[]) => void;
  onExit: () => void;
  screenWidth: number;
}
```

- [ ] **Step 2: Add handleStartTeam callback after handleRun**

```typescript
// After handleRun, add:
const handleStartTeam = useCallback(() => {
  const trimmed = taskInput.trim();
  if (!trimmed) { flash("Type a task description first."); return; }
  saveAgents(projectRoot, agentsRef.current);
  onStartTeam(agentsRef.current);
}, [taskInput, projectRoot, onStartTeam, flash]);
```

- [ ] **Step 3: Add 'S' key handler in useInput**

```typescript
// In useInput, after 'M' / 'm' handler and before 'return' key:
if ((input === "s" || input === "S") && taskInput.trim()) {
  handleStartTeam();
  return;
}
```

- [ ] **Step 4: Update task render section to show both options**

```typescript
// Replace the task output block (around line 344):
{taskInput.trim() ? (

## Phase 5: App.tsx Integration

### Task 8: Wire TeamCreateView → tmux team launch

**Files:**
- Modify: `src/ui/views/App.tsx`

- [ ] **Step 1: Import TeamAgentRule from TeamCreateView**

```typescript
// At top of App.tsx, update import
import { TeamCreateView, type TeamAgentRule } from "./TeamCreateView";
```

- [ ] **Step 2: Add startTeamWithTmux callback**

```typescript
// After runTeamTask, add:
const startTeamWithTmux = useCallback(
  async (agents: TeamAgentRule[]) => {
    setTeamBusy(true);
    setBusy(true);
    try {
      const orchestrator = new TeamOrchestrator({
        projectRoot,
        autoAccept: currentAutoAccept,
        planMode: currentPlanMode,
        createOpenAIClient: () => createOpenAIClient(projectRoot),
        renderMarkdown: (text) => text,
        onUIEvent: (event: TeamUIEvent) => {
          if (event.type === "team_complete") {
            setMessages((prev) => [
              ...prev,
              buildSyntheticUserMessage(`Team completed: ${(event.data as TeamResult).executiveSummary}`, 0),
            ]);
          }
        },
      });
      teamOrchestratorRef.current = orchestrator;

      const workers: AgentConfig[] = agents.map((a) => ({
        name: a.name,
        role: "worker" as const,
        description: a.name,
        systemPrompt: a.prompt,
        model: a.model || undefined,
      }));

      const result = await orchestrator.executeTask("Team task", {
        workers,
        maxParallelWorkers: agents.length,

## Phase 6: TeamOrchestrator Tmux Integration

### Task 9: Add createTmuxTeamLayout method

**Files:**
- Modify: `src/team/team-orchestrator.ts`

- [ ] **Step 1: Add imports and property**

```typescript
// At top of team-orchestrator.ts, add:
import { TeamTmuxLayout } from "./team-tmux-layout";
import type { TmuxLayoutConfig, TmuxLayoutResult } from "./types";

// Add to class properties:
private tmuxLayout: TeamTmuxLayout | null = null;
```

- [ ] **Step 2: Add createTmuxTeamLayout method**

```typescript
// In TeamOrchestrator class, add:
async createTmuxTeamLayout(
  session: TeamSession,
  workers: AgentConfig[]
): Promise<{ layout: TeamTmuxLayout; result: TmuxLayoutResult } | null> {
  if (!this.mux) return null;

  const config: TmuxLayoutConfig = {
    sessionName: `anng-${session.teamId}`,
    cwd: this.options.projectRoot,
    coordinatorLabel: "Coordinator",
    agents: workers.map((w) => ({
      name: w.name,
      command: this.buildWorkerCommand(w),
    })),
  };

  const layout = new TeamTmuxLayout(this.mux, config);
  const result = await layout.createTeamSession();
  this.tmuxLayout = layout;
  return { layout, result };
}

private buildWorkerCommand(worker: AgentConfig): string {
  const parts = [`anng`, `--worker`, `-p`, `"${worker.systemPrompt ?? worker.name}"`];
  if (worker.model) parts.push(`--model`, worker.model);
  return parts.join(" ");
}
```

- [ ] **Step 3: Wire into executeTask**

```typescript

## Phase 7: AgentWorker Tmux Pane Execution

### Task 10: Fix AgentWorker tmux polling

**Files:**
- Modify: `src/team/agent-worker.ts`

**Problem:** Current `executeTask()` lines 144-172 create a tmux pane and immediately return dummy success. Real workers should launch `anng --worker` in the pane and poll until completion.

- [ ] **Step 1: Replace the tmux block in executeTask**

```typescript
// In executeTask(), replace lines 144-172 (the `if (this.options.mux)` block):

if (this.options.mux) {
  const escapedPrompt = contextPrompt.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const paneId = await this.options.mux.createPane(
    `anng-${this.config.name}`,
    `anng --worker -p "${escapedPrompt}"`,
    this.options.projectRoot
  );

  // Poll for completion (check for shell prompt reappearance)
  const pollIntervalMs = 2000;
  const maxWaitMs = this.config.taskTimeoutMs ?? 600_000;
  let waitedMs = 0;
  let lastOutput = "";

  while (waitedMs < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    waitedMs += pollIntervalMs;
    const currentOutput = await this.options.mux.capturePane(paneId);
    if (currentOutput !== lastOutput) {
      lastOutput = currentOutput;
      continue;
    }
    // Shell prompt reappeared — process finished
    if (currentOutput.includes("$") || currentOutput.includes("#")) break;
  }

## Phase 8: /team kill Cleanup

### Task 11: Ensure tmux session cleanup on kill

**Files:**
- Modify: `src/ui/views/App.tsx`

- [ ] **Step 1: Verify kill handler properly cleans up**

The current `/team kill` handler (around line 490-498) sets `teamOrchestratorRef.current = null`. Since `TeamOrchestrator` is garbage-collected, its `disposeAll()` and `killSession()` in the `finally` block of `executeTask()` won't run. We need to interrupt the orchestrator first.

Update the handler:

```typescript
// In the /team kill handler:
if (subCmd === "kill" || subCmd === "stop") {
  if (teamOrchestratorRef.current) {
    teamOrchestratorRef.current.interrupt();
    teamOrchestratorRef.current = null;

## Phase 9: Final Build & Verification

### Task 12: Full build and test verification

- [ ] **Step 1: Run full typecheck**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npm run typecheck 2>&1 | head -20
```
Expected: No TypeScript errors (ignore pre-existing test file errors if any).

- [ ] **Step 2: Run lint**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npm run lint 2>&1 | head -20
```
Expected: No lint errors.

- [ ] **Step 3: Run all team tests**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test --test-concurrency=4 src/tests/team/*.test.ts 2>&1 | tail -15
```
Expected: All tests pass (66 existing + new layout + coordinator tests).

- [ ] **Step 4: Build the bundle**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npm run bundle 2>&1 | tail -5
```
Expected: `dist/cli.js` built successfully at ~680kb.

- [ ] **Step 5: Final commit of all changes**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add -A && git commit -m "feat: complete team tmux multi-pane mode"
```

---

## Summary of All Changes

| File | Action | Description |
|------|--------|-------------|
| `src/team/integrations/terminal-multiplexer.ts` | Modify | Add `selectLayout`, `splitPaneVertically`, `setPaneTitle`, `listPanes` |
| `src/team/integrations/tmux-manager.ts` | Modify | Fix exec pattern (sync → Promise wrapper), implement new methods |
| `src/team/types.ts` | Modify | Add `TmuxLayoutConfig`, `TmuxLayoutResult` |
| `src/team/team-tmux-layout.ts` | **Create** | Manage tmux session: coordinator left, agent panes right |
| `src/team/team-tmux-coordinator.ts` | **Create** | Coordinator chat loop: dispatch directives, read agent output |
| `src/team/team-orchestrator.ts` | Modify | Add `createTmuxTeamLayout()`, `buildWorkerCommand()`, tmux cleanup |
| `src/team/agent-worker.ts` | Modify | Replace dummy tmux success with real polling loop |
| `src/ui/views/TeamCreateView.tsx` | Modify | Add `onStartTeam` prop, "Start Team" button, export `TeamAgentRule` |
| `src/ui/views/App.tsx` | Modify | Add `startTeamWithTmux` callback, wire TeamCreateView, fix kill cleanup |
| `src/tests/team/team-tmux-layout.test.ts` | **Create** | 3 tests with mock multiplexer |
| `src/tests/team/team-tmux-coordinator.test.ts` | **Create** | 4 tests with fake layout |

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| `/team` shows agent configuration UI | Existing TeamCreateView (Task 7 enhances it) |
| User can add/edit/delete agents | Existing in TeamCreateView |
| "Start Team" button launches tmux | Task 7 (view) + Task 8 (App wiring) |
| Tmux session with left coordinator pane | Task 4 (TeamTmuxLayout) |
| Tmux session with right agent panes | Task 4 (TeamTmuxLayout) — `main-vertical` layout |
| Each agent runs in own pane | Task 4 + Task 10 (AgentWorker tmux mode) |
| Coordinator dispatches directives | Task 6 (TeamTmuxCoordinator.dispatchToAgent) |
| Agent output visible in real-time | Task 10 (pane capture polling) + inherent tmux visibility |
| `/team kill` cleans up tmux | Task 11 (interrupt + cleanup) |
| Auto-show TeamCreateView on `--team` | Already fixed in previous session (`useEffect` in App.tsx) |
| `anng --worker` headless mode | Already exists in cli.tsx (line 132-152) |

### Placeholder Check

- No "TBD", "TODO", "implement later" found
- All test files contain complete, runnable test code
- All implementation files contain complete TypeScript code
- No "similar to Task N" references
- Every step has exact file paths, code, and commands

### Type Consistency

- `TmuxLayoutConfig.sessionName` (string) → used in `TeamTmuxLayout` Task 4, created in Task 3
- `TmuxLayoutResult.coordinatorPaneId` / `agentPaneIds` → used in `TeamTmuxCoordinator` Task 6
- `TeamAgentRule` (exported from TeamCreateView) → used in `App.tsx` `startTeamWithTmux` Task 8
- `AgentConfig` (from types.ts) → used in `TeamOrchestrator.createTmuxTeamLayout()` Task 9
- `TerminalMultiplexer.listPanes()` → used in `TeamTmuxLayout` Task 4
- `TerminalMultiplexer.splitPaneVertically()` → used in `TeamTmuxLayout` Task 4

  }
  setTeamModeEnabled(false);
  setTeamBusy(false);
  setBusy(false);
  setStatusLine("Team mode disabled. Tmux session cleaned up.");
  setMessages((prev) => [...prev, buildSyntheticUserMessage("Team stopped. Session terminated.", 0)]);
  return;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -5
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/ui/views/App.tsx && git commit -m "fix: interrupt orchestrator before /team kill cleanup"
```


  const result: TeamTaskResult = {
    ok: true,
    summary: lastOutput.slice(-500) || `Executed in tmux pane ${paneId}`,
    artifacts: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: waitedMs,
    workerSessionId: paneId,
  };

  this.tasksCompleted++;
  this.options.onWorkerEvent?.({
    type: "task_completed",
    workerName: this.config.name,
    taskId: task.id,
    result,
    timestamp: new Date().toISOString(),
  });
  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -10
```
Expected: No errors.

- [ ] **Step 3: Run team tests**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test --test-concurrency=4 src/tests/team/*.test.ts 2>&1 | tail -10
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/agent-worker.ts && git commit -m "feat: add tmux pane polling in AgentWorker for real execution"
```

// In executeTask(), after workerPool.initializeAll():
if (definition.mode === "tmux" && this.mux) {
  await this.createTmuxTeamLayout(session, definition.workers);
}
```

- [ ] **Step 4: Update cleanup to use tmuxLayout**

```typescript
// Replace the cleanup section at end of executeTask():
if (this.tmuxLayout) {
  await this.tmuxLayout.killTeamSession();
  this.tmuxLayout = null;
} else if (this.mux) {
  await this.mux.killSession(`anng-${session.teamId}`);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -10
```
Expected: No errors.

- [ ] **Step 6: Run all team tests**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test --test-concurrency=4 src/tests/team/*.test.ts 2>&1 | tail -10
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/team-orchestrator.ts && git commit -m "feat: integrate TeamTmuxLayout into TeamOrchestrator"
```

        mode: "tmux",
      });
      setTeamResult(result);
    } catch (error) {
      setErrorLine(error instanceof Error ? error.message : String(error));
    } finally {
      setTeamBusy(false);
      setBusy(false);
      teamOrchestratorRef.current = null;
    }
  },
  [projectRoot, currentAutoAccept, currentPlanMode]
);
```

- [ ] **Step 3: Pass onStartTeam to TeamCreateView render**

```typescript
// Find TeamCreateView render and add:
<TeamCreateView
  projectRoot={projectRoot}
  onRunTask={runTeamTask}
  onStartTeam={startTeamWithTmux}
  onExit={() => navigateToSubView("chat")}
  screenWidth={columns}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -10
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/ui/views/App.tsx && git commit -m "feat: wire TeamCreateView to tmux team launch"
```

  <Box marginTop={1} flexDirection="column">
    <Box>
      <Text dimColor>
        Configured {agents.length} agent{agents.length > 1 ? "s" : ""} for:{" "}
      </Text>
      <Text color="green" bold>
        {taskInput.length > 50 ? taskInput.slice(0, 48) + "…" : taskInput}
      </Text>
    </Box>
    <Box marginTop={1}>
      <Text color="cyan">[Enter] Run internally</Text>
      <Text>  </Text>
      <Text color="yellow">[S] Start Team (tmux panels)</Text>
    </Box>
  </Box>
) : null}
```

- [ ] **Step 5: Export TeamAgentRule type**

```typescript
// At the top, ensure TeamAgentRule is exported:
export interface TeamAgentRule {
  name: string;
  prompt: string;
  model?: string;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -5
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/ui/views/TeamCreateView.tsx && git commit -m "feat: add Start Team button to TeamCreateView"
```

  async dispatchToAgent(agentPaneId: string, directive: string): Promise<void> {
    const escaped = this.escapeForShell(directive);
    await this.layout.sendToAgentPane(
      agentPaneId,
      `clear; echo '=== DIRECTIVE ==='; echo '${escaped}'; echo '=== END DIRECTIVE ==='`
    );
  }

  async broadcastToAll(directive: string): Promise<void> {
    const result = this.layout.getResult();
    if (!result) throw new Error("Team session not created yet");
    for (const paneId of result.agentPaneIds) {
      await this.dispatchToAgent(paneId, directive);
    }
  }

  async readAgentOutput(agentPaneId: string): Promise<string> {
    return this.layout.captureAgentPane(agentPaneId);
  }

  isRunning(): boolean {
    return this.running;
  }

  private escapeForShell(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/\n/g, "\\n").replace(/"/g, '\\"');
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -10
```
Expected: No errors.

- [ ] **Step 3: Run coordinator tests**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test src/tests/team/team-tmux-coordinator.test.ts 2>&1 | tail -10
```
Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/team-tmux-coordinator.ts && git commit -m "feat: implement TeamTmuxCoordinator with agent dispatch"
```

    const runPromise = coord.startCoordinator(
      async (_input: string) => "Processed",
      async () => false
    );
    await new Promise((r) => setTimeout(r, 50));
    coord.stopCoordinator();
    await runPromise;
    assert.ok(true, "startCoordinator resolved after stop");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test src/tests/team/team-tmux-coordinator.test.ts 2>&1 | head -5
```
Expected: FAIL with "TeamTmuxCoordinator is not defined".

- [ ] **Step 3: Commit test**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/tests/team/team-tmux-coordinator.test.ts && git commit -m "test: add TeamTmuxCoordinator tests"
```

    return this.mux.capturePane(this.result.coordinatorPaneId);
  }

  async captureAgentPane(paneId: string): Promise<string> {
    return this.mux.capturePane(paneId);
  }

  async attachSession(): Promise<void> {
    if (!this.result) throw new Error("Team session not created");
    if (this.mux.attachSession) await this.mux.attachSession(this.config.sessionName);
  }

  async killTeamSession(): Promise<void> {
    await this.mux.killSession(this.config.sessionName);
    this.result = null;
  }

  getResult(): TmuxLayoutResult | null {
    return this.result;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -10
```
Expected: No errors.

- [ ] **Step 3: Run the layout tests**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test src/tests/team/team-tmux-layout.test.ts 2>&1 | tail -10
```
Expected: All 3 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/team-tmux-layout.ts && git commit -m "feat: implement TeamTmuxLayout for multi-pane tmux sessions"
```

Expected: FAIL with "TeamTmuxLayout is not defined".

- [ ] **Step 5: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/types.ts src/tests/team/team-tmux-layout.test.ts && git commit -m "test: add TmuxLayoutConfig types and TeamTmuxLayout tests"
```

    splitPaneVertically: async (sn, tp) => { calls.push({ method: "splitPaneVertically", args: [sn, tp] }); return `${sn}:new-pane`; },
    setPaneTitle: async (pid, title) => { calls.push({ method: "setPaneTitle", args: [pid, title] }); },
    listPanes: async (sn) => { calls.push({ method: "listPanes", args: [sn] }); return []; },
  };
  return { mock, calls };
}

    return execSync(command, { encoding: "utf8", timeout: 10000 }).toString().trim();
  }

  private async getPaneCount(sessionName: string): Promise<number> {
    try { return (await this.listPanes(sessionName)).length; } catch { return 0; }
  }

  private escapeCommand(command: string): string {
    return command.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/;/g, "\\;").replace(/\n/g, "\\n");
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && npx tsc --noEmit 2>&1 | head -5
```
Expected: No errors.

- [ ] **Step 3: Run existing team tests**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && timeout 10 node --import tsx --test --test-concurrency=4 src/tests/team/parallel-executor.test.ts src/tests/team/team-manager.test.ts 2>&1 | grep -E "pass|fail"
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /run/media/sanng/New Volume/Seminar/Anng_cli && git add src/team/integrations/tmux-manager.ts && git commit -m "fix: synchronize TmuxManager exec pattern, add layout methods"
```
