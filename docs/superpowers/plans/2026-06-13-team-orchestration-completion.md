# Hoàn Thiện Multi-Agent Team Orchestration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện mọi phần còn dang dở của hệ thống multi-agent team orchestration — fix bugs, viết test, kết nối UI, để `anng --team -p "..."` hoạt động end-to-end.

**Architecture:** Sửa 2 bugs trong core (`parallel-executor.ts`, `team-orchestrator.ts`), viết 9 test files còn thiếu, kết nối `TeamOrchestrator` vào `App.tsx`, tạo `TeamStatusPanel` UI component, cập nhật test runner để chạy team tests.

**Tech Stack:** TypeScript (strict), Node.js ≥22, React/Ink 7, Node.js native test runner, Zod validation.

---

## Repository Intelligence

- **Test runner:** `node --import tsx --test --test-concurrency=4`, glob `src/tests/*.test.ts`
- **UI framework:** Ink (React for terminal) — sử dụng `useState`, `Box`, `Text`, `Static`
- **Team module:** `src/team/` — 14 file source, 3 file test đã có
- **Existing patterns:** Observer callbacks (`onUIEvent`, `onWorkerEvent`), Zod validation, AbortController
- **CLI flags:** `--team`, `--tmux`, `--team-workers N`, `--team-mode <mode>`

---

## Task 1: Fix `parallel-executor.ts` — getWorkerName lookup

**Files:**
- Modify: `src/team/parallel-executor.ts`
- Modify: `src/team/team-orchestrator.ts`

**Bug:** `ParallelExecutor.getWorkerName()` luôn trả về `"worker"` hardcoded, không lookup từ pool thực sự. Cần sửa để nhận `AgentWorkerPool` và lookup đúng tên.

**Fix approach:** Thêm method `getWorkerName(worker)` vào `AgentWorkerPool` (đã có, chỉ cần gọi đúng). Sửa `ParallelExecutor` để gọi qua pool thay vì hardcode.

- [ ] **Step 1: Đọc file hiện tại để xác nhận vị trí sửa**

```bash
grep -n "getWorkerName" src/team/parallel-executor.ts src/team/agent-worker-pool.ts
```

- [ ] **Step 2: Sửa `parallel-executor.ts` — thêm pool reference vào executeSingleTask**

File: `src/team/parallel-executor.ts`, dòng 68-69. Thay `const workerName = this.getWorkerName();` thành lookup từ pool.

```typescript
// Trong executeSingleTask(), dòng ~68, thay:
const workerName = this.getWorkerName();

// Thành: gọi pool.getWorkerName thông qua method mới
const workerName = workerPool.getWorkerName(worker);
```

Nhưng `AgentWorkerPool.getWorkerName()` là private. Cần đổi thành public trước.

- [ ] **Step 3: Sửa `agent-worker-pool.ts` — public getWorkerName**

```bash
# Đọc file
cat src/team/agent-worker-pool.ts | grep -n "private getWorkerName"
```

File: `src/team/agent-worker-pool.ts`, dòng 89. Đổi `private getWorkerName` thành `getWorkerName` (bỏ `private`).

```typescript
// Before (line ~89):
  private getWorkerName(worker: AgentWorker): string {

// After:
  getWorkerName(worker: AgentWorker): string {
```

- [ ] **Step 4: Sửa `parallel-executor.ts` — gọi pool.getWorkerName()**

File: `src/team/parallel-executor.ts`. Trong `executeSingleTask()`, gọi `workerPool.getWorkerName(worker)`.

```typescript
// After acquireWorker():
const workerName = workerPool.getWorkerName(worker);
```

Xóa method `private getWorkerName(): string { return "worker"; }` ở cuối class `ParallelExecutor`.

- [ ] **Step 5: Chạy typecheck**

```bash
npx tsc --noEmit
```
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/team/agent-worker-pool.ts src/team/parallel-executor.ts
git commit -m "fix: ParallelExecutor getWorkerName lookup from pool instead of hardcoded

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 2: Viết `file-conflict-resolver.test.ts`

**Files:**
- Create: `src/tests/team/file-conflict-resolver.test.ts`

- [ ] **Step 1: Viết test file**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FileConflictResolver } from "../../team/file-conflict-resolver";
import type { TeamTask } from "../../team/types";

describe("FileConflictResolver", () => {
  it("last-write-wins: cho phép override lock", () => {
    const resolver = new FileConflictResolver("last-write-wins");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), true);
  });

  it("fail-on-conflict: từ chối override lock", () => {
    const resolver = new FileConflictResolver("fail-on-conflict");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), false);
  });

  it("releaseLock giải phóng lock", () => {
    const resolver = new FileConflictResolver("fail-on-conflict");
    resolver.acquireLock("src/file.ts", "task-1");
    resolver.releaseLock("src/file.ts", "task-1");
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), true);
  });

  it("detectConflicts phát hiện file trùng giữa tasks", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      {
        id: "t1", description: "Task 1", status: "pending", dependencies: [],
        relatedFiles: ["src/a.ts", "src/b.ts"], createdAt: new Date().toISOString(),
      },
      {
        id: "t2", description: "Task 2", status: "pending", dependencies: [],
        relatedFiles: ["src/b.ts", "src/c.ts"], createdAt: new Date().toISOString(),
      },
    ];
    const conflicts = resolver.detectConflicts(tasks);
    assert.equal(conflicts.length, 1);
    assert.ok(conflicts[0].includes("src/b.ts"));
  });

  it("detectConflicts không có conflict khi files khác nhau", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      {
        id: "t1", description: "", status: "pending", dependencies: [],
        relatedFiles: ["src/a.ts"], createdAt: "",
      },
      {
        id: "t2", description: "", status: "pending", dependencies: [],
        relatedFiles: ["src/b.ts"], createdAt: "",
      },
    ];
    assert.equal(resolver.detectConflicts(tasks).length, 0);
  });

  it("detectConflicts không có conflict khi không có relatedFiles", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      {
        id: "t1", description: "", status: "pending", dependencies: [], createdAt: "",
      },
      {
        id: "t2", description: "", status: "pending", dependencies: [], createdAt: "",
      },
    ];
    assert.equal(resolver.detectConflicts(tasks).length, 0);
  });

  it("merge-attempt strategy cho phép override lock", () => {
    const resolver = new FileConflictResolver("merge-attempt");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    assert.equal(resolver.acquireLock("src/file.ts", "task-2"), true);
  });
});
```

- [ ] **Step 2: Chạy test**

```bash
npx tsx --test src/tests/team/file-conflict-resolver.test.ts
```
Expected: 7/7 pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/team/file-conflict-resolver.test.ts
git commit -m "test: add FileConflictResolver tests — lock strategies, conflict detection

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 3: Viết `task-decomposer.test.ts`

**Files:**
- Create: `src/tests/team/task-decomposer.test.ts`

- [ ] **Step 1: Viết test file**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskDecomposer } from "../../team/task-decomposer";
import type { CreateOpenAIClient } from "../../tools/executor";

function makeClient(
  jsonResponse: unknown,
  shouldThrow = false
): CreateOpenAIClient {
  return () => ({
    client: shouldThrow
      ? ({
          chat: {
            completions: {
              create: async () => {
                throw new Error("API error");
              },
            },
          },
        } as any)
      : ({
          chat: {
            completions: {
              create: async () => ({
                choices: [{ message: { content: JSON.stringify(jsonResponse) } }],
              }),
            },
          },
        } as any),
    model: "test-model",
    baseURL: "http://test",
    temperature: 0,
    thinkingEnabled: false,
    reasoningEffort: undefined,
    debugLogEnabled: false,
    telemetryEnabled: false,
    notify: undefined,
    webSearchTool: undefined,
    env: {},
    machineId: "test",
  });
}

describe("TaskDecomposer", () => {
  const decomposer = new TaskDecomposer();

  it("trả về single task khi không có API client", async () => {
    const noClient: CreateOpenAIClient = () => ({
      client: null,
      model: "",
      baseURL: "",
      temperature: undefined,
      thinkingEnabled: false,
      reasoningEffort: undefined,
      debugLogEnabled: false,
      telemetryEnabled: false,
      env: {},
      machineId: "",
    });
    const tasks = await decomposer.decompose("build a login page", {
      createOpenAIClient: noClient,
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "pending");
    assert.ok(tasks[0].id.length > 0);
  });

  it("trả về single task khi LLM trả về JSON rỗng", async () => {
    const tasks = await decomposer.decompose("do something", {
      createOpenAIClient: makeClient({ subTasks: [] }),
    });
    assert.equal(tasks.length, 1);
  });

  it("trả về single task khi LLM trả về JSON không có subTasks", async () => {
    const tasks = await decomposer.decompose("do something", {
      createOpenAIClient: makeClient({ other: true }),
    });
    assert.equal(tasks.length, 1);
  });

  it("phân rã thành nhiều sub-tasks từ JSON response", async () => {
    const tasks = await decomposer.decompose("build full-stack app", {
      createOpenAIClient: makeClient({
        subTasks: [
          {
            title: "Setup DB",
            description: "Create database schema",
            dependsOn: [],
            priority: 5,
            estimatedFiles: ["db/schema.sql"],
          },
          {
            title: "Build API",
            description: "Build REST endpoints",
            dependsOn: [0],
            priority: 4,
            estimatedFiles: ["src/api.ts"],
          },
          {
            title: "Build UI",
            description: "Build React frontend",
            dependsOn: [],
            priority: 3,
            estimatedFiles: ["src/App.tsx"],
          },
        ],
      }),
    });
    assert.equal(tasks.length, 3);
    const apiTask = tasks.find((t) => t.description.includes("REST"));
    assert.ok(apiTask);
    assert.ok(apiTask!.dependencies.length > 0, "API task should depend on Setup DB");
  });

  it("giới hạn số sub-tasks theo maxSubTasks", async () => {
    const manyTasks = Array.from({ length: 20 }, (_, i) => ({
      title: `Task ${i}`,
      description: `Do task ${i}`,
      dependsOn: [],
      priority: 1,
      estimatedFiles: [],
    }));
    const tasks = await decomposer.decompose("big task", {
      createOpenAIClient: makeClient({ subTasks: manyTasks }),
      maxSubTasks: 5,
    });
    assert.equal(tasks.length, 5);
  });

  it("fallback khi LLM throw error", async () => {
    const tasks = await decomposer.decompose("some task", {
      createOpenAIClient: makeClient({}, true),
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "pending");
  });

  it("mỗi sub-task có ID duy nhất", async () => {
    const tasks = await decomposer.decompose("build stuff", {
      createOpenAIClient: makeClient({
        subTasks: [
          { title: "A", description: "Do A", dependsOn: [], priority: 1, estimatedFiles: [] },
          { title: "B", description: "Do B", dependsOn: [], priority: 1, estimatedFiles: [] },
        ],
      }),
    });
    assert.equal(tasks.length, 2);
    assert.notEqual(tasks[0].id, tasks[1].id);
  });
});
```

- [ ] **Step 2: Chạy test**

```bash
npx tsx --test src/tests/team/task-decomposer.test.ts
```
Expected: 8/8 pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/team/task-decomposer.test.ts
git commit -m "test: add TaskDecomposer tests — LLM decomposition, fallback, limits

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 4: Viết `types.test.ts` — Zod validation tests

**Files:**
- Create: `src/tests/team/types.test.ts`

- [ ] **Step 1: Viết test file**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AgentConfigSchema, TeamDefinitionSchema } from "../../team/types";

describe("AgentConfigSchema", () => {
  it("chấp nhận config hợp lệ", () => {
    const result = AgentConfigSchema.safeParse({
      name: "worker-1",
      role: "worker",
    });
    assert.equal(result.success, true);
  });

  it("từ chối role không hợp lệ", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "invalid-role",
    });
    assert.equal(result.success, false);
  });

  it("từ chối name rỗng", () => {
    const result = AgentConfigSchema.safeParse({
      name: "",
      role: "worker",
    });
    assert.equal(result.success, false);
  });

  it("từ chối name quá dài (>64)", () => {
    const result = AgentConfigSchema.safeParse({
      name: "x".repeat(65),
      role: "coordinator",
    });
    assert.equal(result.success, false);
  });

  it("chấp nhận các optional fields", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "worker",
      description: "does stuff",
      model: "test-model",
      skills: ["code-review"],
      systemPrompt: "be helpful",
      maxTurns: 50,
      taskTimeoutMs: 300000,
    });
    assert.equal(result.success, true);
  });

  it("từ chối maxTurns không phải số dương", () => {
    const result = AgentConfigSchema.safeParse({
      name: "w1",
      role: "worker",
      maxTurns: 0,
    });
    assert.equal(result.success, false);
  });
});

describe("TeamDefinitionSchema", () => {
  it("chấp nhận definition hợp lệ", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "my-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    assert.equal(result.success, true);
  });

  it("từ chối workers rỗng", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "my-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [],
    });
    assert.equal(result.success, false);
  });

  it("từ chối quá 16 workers", () => {
    const workers = Array.from({ length: 17 }, (_, i) => ({
      name: `w${i}`,
      role: "worker" as const,
    }));
    const result = TeamDefinitionSchema.safeParse({
      name: "big-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers,
    });
    assert.equal(result.success, false);
  });

  it("chấp nhận tất cả optional fields", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "full-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
      id: "custom-id",
      maxParallelWorkers: 4,
      strategy: "round-robin",
      mode: "tmux",
      allowFileSystemAccess: false,
      maxRetriesPerTask: 2,
    });
    assert.equal(result.success, true);
  });

  it("từ chối strategy không hợp lệ", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "bad-strategy",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
      strategy: "invalid",
    });
    assert.equal(result.success, false);
  });

  it("từ chối mode không hợp lệ", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "bad-mode",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
      mode: "distributed",
    });
    assert.equal(result.success, false);
  });

  it("từ chối name quá dài (>128)", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "x".repeat(129),
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    assert.equal(result.success, false);
  });

  it("từ chối maxRetriesPerTask vượt giới hạn", () => {
    const result = TeamDefinitionSchema.safeParse({
      name: "bad-retry",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
      maxRetriesPerTask: 10,
    });
    assert.equal(result.success, false);
  });

  it("cho phép 16 workers chính xác", () => {
    const workers = Array.from({ length: 16 }, (_, i) => ({
      name: `w${i}`,
      role: "worker" as const,
    }));
    const result = TeamDefinitionSchema.safeParse({
      name: "max-team",
      coordinator: { name: "c", role: "coordinator" },
      workers,
    });
    assert.equal(result.success, true);
  });
});
```

- [ ] **Step 2: Chạy test**

```bash
npx tsx --test src/tests/team/types.test.ts
```
Expected: 16/16 pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/team/types.test.ts
git commit -m "test: add Zod validation tests for AgentConfig and TeamDefinition schemas

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 5: Viết `parallel-executor.test.ts`

**Files:**
- Create: `src/tests/team/parallel-executor.test.ts`

- [ ] **Step 1: Viết test file với mock worker pool**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkflowEngine } from "../../team/workflow-engine";
import { ParallelExecutor } from "../../team/parallel-executor";
import { TeamManager } from "../../team/team-manager";
import type { TeamTask, TeamTaskResult } from "../../team/types";

function makeSuccessResult(): TeamTaskResult {
  return {
    ok: true,
    summary: "done",
    artifacts: [],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    durationMs: 1000,
    workerSessionId: "s1",
  };
}

function makeFailResult(): TeamTaskResult {
  return {
    ok: false,
    summary: "failed",
    artifacts: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: 500,
    workerSessionId: "s1",
    error: "test error",
  };
}

function makeTask(id: string, desc: string, deps: string[] = []): TeamTask {
  return {
    id,
    description: desc,
    status: "pending",
    dependencies: deps,
    priority: 0,
    createdAt: new Date().toISOString(),
  };
}

function makeMockPool(behavior: "success" | "fail") {
  let acquireCalls = 0;
  return {
    acquireWorker: () => {
      if (acquireCalls++ > 10) return null;
      return {};
    },
    releaseWorker: () => {},
    getWorkerName: () => "test-worker",
    executeWithWorker: async (task: TeamTask, _worker: unknown) => {
      return {
        result: behavior === "fail" ? makeFailResult() : makeSuccessResult(),
        worker: _worker,
      };
    },
    getTotalCount: () => 2,
    getBusyCount: () => 0,
    hasAvailable: () => true,
    interruptAll: () => {},
    disposeAll: () => {},
  };
}

describe("ParallelExecutor", () => {
  it("hoàn thành tất cả tasks với workers thành công", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }, { name: "w2", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));
    workflow.addTask(makeTask("c", "Task C", ["a"]));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.equal(result.status, "completed");
    assert.equal(result.totalTasks, 3);
    assert.equal(result.completedTasks, 3);
  });

  it("trả về partial khi có task fail", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));
    workflow.addTask(makeTask("c", "Task C", ["a"]));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("fail") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.ok(result.status === "failed" || result.status === "partial");
    assert.ok(result.failedTasks > 0);
  });

  it("dừng khi signal bị abort", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const controller = new AbortController();
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));

    const slowPool = {
      ...makeMockPool("success"),
      executeWithWorker: async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { result: makeSuccessResult(), worker: {} };
      },
    };

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: slowPool as any,
      workflowEngine: workflow,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort(), 50);
    const result = await executor.executeAll();
    assert.ok(result.totalTasks >= 1);
  });

  it("buildResult có executiveSummary", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Build auth module"));
    workflow.addTask(makeTask("b", "Build API"));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.ok(result.executiveSummary.length > 0);
    assert.ok(result.executiveSummary.includes("2/2"));
  });

  it("tính totalUsage đúng", async () => {
    const teamManager = new TeamManager();
    const team = teamManager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    const workflow = new WorkflowEngine();
    workflow.addTask(makeTask("a", "Task A"));
    workflow.addTask(makeTask("b", "Task B"));

    const executor = new ParallelExecutor({
      teamId: team.teamId,
      teamManager,
      workerPool: makeMockPool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.ok(result.totalUsage.totalTokens > 0, "should have token usage");
    assert.ok(result.totalUsage.inputTokens > 0);
  });
});
```

- [ ] **Step 2: Chạy test**

```bash
npx tsx --test src/tests/team/parallel-executor.test.ts
```
Expected: 5/5 pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/team/parallel-executor.test.ts
git commit -m "test: add ParallelExecutor tests — success, fail, abort, usage

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 6: Kết nối TeamOrchestrator vào App.tsx

**Files:**
- Modify: `src/ui/views/App.tsx`

**Goal:** Khi `teamMode=true`, tạo `TeamOrchestrator` và gọi `executeTask()` thay vì `sessionManager.handleUserPrompt()`.

- [ ] **Step 1: Import TeamOrchestrator vào App.tsx**

File: `src/ui/views/App.tsx`, đầu file, thêm import sau dòng `import { SessionManager } from "../../session";`

```typescript
import { SessionManager } from "../../session";
import { TeamOrchestrator } from "../../team/team-orchestrator";  // NEW
import type { TeamUIEvent, TeamResult } from "../../team/types";     // NEW
```

- [ ] **Step 2: Thêm state cho TeamOrchestrator**

File: `src/ui/views/App.tsx`, sau dòng `const [currentPlanMode, setCurrentPlanMode] = useState(planMode);` (~dòng 140)

```typescript
const [currentPlanMode, setCurrentPlanMode] = useState(planMode);
const [teamResult, setTeamResult] = useState<TeamResult | null>(null);  // NEW
const [teamBusy, setTeamBusy] = useState(false);                         // NEW
```

- [ ] **Step 3: Wrap handlePrompt để route sang team mode khi teamMode=true**

File: `src/ui/views/App.tsx`, trong function `App()`, sau `const initialPlanMode = useRef(planMode).current;` (~dòng 147), thêm:

```typescript
const initialTeamMode = useRef(teamMode).current;
const initialTeamConfig = useRef(teamConfig).current;
```

File: `src/ui/views/App.tsx`, function `handlePrompt`, trước dòng `const prompt: UserPromptContent = {` (~dòng 375), thêm:

```typescript
// Nếu team mode được bật và không phải command đặc biệt
if (submission.teamMode !== false && teamMode && submission.text.trim() && !submission.command) {
  setTeamBusy(true);
  setBusy(true);
  try {
    const orchestrator = new TeamOrchestrator({
      projectRoot,
      createOpenAIClient: () => createOpenAIClient(projectRoot),
      renderMarkdown: (text) => text,
      onUIEvent: (event: TeamUIEvent) => {
        if (event.type === "team_complete") {
          setTeamResult(event.data as TeamResult);
          setTeamBusy(false);
          setBusy(false);
          setMessages((prev) => [
            ...prev,
            buildSyntheticUserMessage(
              `Team completed: ${(event.data as TeamResult).executiveSummary}`,
              0
            ),
          ]);
        }
      },
    });
    const result = await orchestrator.executeTask(submission.text);
    setTeamResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setErrorLine(message);
  } finally {
    setTeamBusy(false);
    setBusy(false);
  }
  return;
}
```

- [ ] **Step 4: Thêm `teamMode` handler cho `/team` slash command**

File: `src/ui/views/App.tsx`, trong `handlePrompt`, sau block `if (submission.command === "mcp")`, thêm:

```typescript
if (submission.command === "team") {
  if (teamResult) {
    setMessages((prev) => [
      ...prev,
      buildSyntheticUserMessage(`Team result: ${teamResult.executiveSummary}`, 0),
    ]);
    setTeamResult(null);
  } else if (teamBusy) {
    setErrorLine("Team is currently running. Wait for completion or interrupt.");
  } else {
    setErrorLine("No active team. Use --team flag or /team create.");
  }
  return;
}
```

- [ ] **Step 5: Chạy typecheck**

```bash
npx tsc --noEmit
```
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/ui/views/App.tsx
git commit -m "feat: connect TeamOrchestrator into App.tsx for --team mode

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 7: Kết nối `/team` command trong PromptInput + App

**Files:**
- Modify: `src/ui/views/PromptInput.tsx` — gửi `command: "team"` kèm text
- Modify: `src/ui/views/App.tsx` — đã có handler (Task 6)

- [ ] **Step 1: Sửa PromptInput.tsx — gửi text kèm team command**

File: `src/ui/views/PromptInput.tsx`, trong `handleSlashSelection()`, sửa case `"team"`:

```typescript
if (item.kind === "team") {
  // Gửi text "/team" để App.tsx biết đây là team command
  onSubmit({ text: "/team", imageUrls: [], command: "team" });
  resetPromptInput();
  return;
}
```

(hiện tại đã có, chỉ cần xác nhận)

- [ ] **Step 2: Xác nhận typecheck**

```bash
npx tsc --noEmit
```
Expected: không lỗi.

- [ ] **Step 3: Commit (nếu có sửa)**

```bash
git add src/ui/views/PromptInput.tsx
git commit -m "feat: wire /team slash command through App.tsx handler

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 8: Cập nhật test runner để chạy team tests

**Files:**
- Modify: `src/tests/run-tests.mjs`

- [ ] **Step 1: Sửa glob pattern để include team tests**

File: `src/tests/run-tests.mjs`, dòng 8:

```javascript
// Before:
const testFiles = globSync("src/tests/*.test.ts", { cwd });

// After:
const testFiles = globSync("src/tests/**/*.test.ts", { cwd });
```

- [ ] **Step 2: Chạy toàn bộ test suite**

```bash
npm test
```
Expected: tất cả pass, bao gồm team tests trong `src/tests/team/`.

- [ ] **Step 3: Commit**

```bash
git add src/tests/run-tests.mjs
git commit -m "test: update run-tests glob to include src/tests/team/ tests

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 9: Tạo TeamStatusPanel UI component

**Files:**
- Create: `src/ui/components/TeamStatusPanel.tsx`

- [ ] **Step 1: Viết component**

```typescript
import React from "react";
import { Box, Text } from "ink";
import type { TeamResult } from "../../team/types";

type TeamStatusPanelProps = {
  result: TeamResult;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "gray",
  assigned: "yellow",
  running: "blue",
  completed: "green",
  failed: "red",
  skipped: "gray",
};

export const TeamStatusPanel: React.FC<TeamStatusPanelProps> = ({ result }) => {
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>
          Team {result.status === "completed" ? "✅" : result.status === "partial" ? "⚠️" : "❌"}{" "}
          {result.executiveSummary}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Task Results:</Text>
        {Object.entries(result.taskResults).map(([taskId, taskResult]) => (
          <Box key={taskId} marginLeft={2}>
            <Text>{taskResult.ok ? "  ✅" : "  ❌"} </Text>
            <Text>{taskResult.summary}</Text>
            <Text dimColor>
              {" "}
              ({taskResult.durationMs}ms, {taskResult.usage.totalTokens} tokens)
            </Text>
          </Box>
        ))}
      </Box>

      <Box>
        <Text dimColor>
          Total: {result.totalUsage.totalTokens} tokens | {result.totalDurationMs}ms |{" "}
          {result.completedTasks}/{result.totalTasks} tasks completed
        </Text>
      </Box>
    </Box>
  );
};
```

- [ ] **Step 2: Export component**

```bash
echo "export { TeamStatusPanel } from './TeamStatusPanel';" >> src/ui/components/index.ts
```

Thêm vào file `src/ui/components/index.ts`:
```typescript
export { TeamStatusPanel } from "./TeamStatusPanel";
```

- [ ] **Step 3: Sử dụng trong App.tsx**

File: `src/ui/views/App.tsx`, thêm import:
```typescript
import { TeamStatusPanel } from "../components/TeamStatusPanel";
```

Trong phần render, sau `<MessageView>` hoặc trong `<Static>`, thêm:
```typescript
{teamResult ? <TeamStatusPanel result={teamResult} /> : null}
```

- [ ] **Step 4: Chạy typecheck**

```bash
npx tsc --noEmit
```
Expected: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/TeamStatusPanel.tsx src/ui/components/index.ts src/ui/views/App.tsx
git commit -m "feat: add TeamStatusPanel UI component for team results display

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Task 10: Chạy toàn bộ test suite — xác nhận không regression

- [ ] **Step 1: Chạy typecheck**

```bash
npx tsc --noEmit
```
Expected: không lỗi.

- [ ] **Step 2: Chạy full test**

```bash
npm test
```
Expected: tất cả test pass (gồm team tests + 43 file test cũ).

- [ ] **Step 3: Kiểm tra lint + format**

```bash
npm run lint
npm run format:check
```
Expected: không lỗi mới.

- [ ] **Step 4: Commit cuối cùng**

```bash
git add -A
git commit -m "chore: final validation — all tests pass, typecheck clean

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>"
```

---

## Execution Order & Dependencies

```
Task 1 (fix parallel-executor) ──┐
                                  ├──► Task 5 (parallel-executor test)
Task 2 (file-conflict test)       │
Task 3 (task-decomposer test)     │
Task 4 (types test)               │
                                  │
Task 1 ───────────────────────────┤
Task 6 (App.tsx integration) ─────┤
Task 7 (PromptInput wire) ────────┤
Task 8 (test runner) ─────────────┤
                                  │
Task 6 ───────────────────────────┼──► Task 9 (TeamStatusPanel)
                                  │
Tất cả ───────────────────────────┴──► Task 10 (final verify)
```

**Song song hóa:** Task 2, 3, 4 có thể chạy đồng thời (không phụ thuộc nhau). Tasks 2-5 độc lập với Tasks 6-9.

---

## Risk Notes

- **Task 6 (App.tsx integration):** Cần cẩn thận với `useMemo` — `teamOrchestrator` không nên nằm trong `useMemo` vì nó là class instance. Tạo trong `handlePrompt` mỗi lần gọi (stateless, lightweight).
- **Task 1 (getWorkerName fix):** Đổi `private` → `public` trên `AgentWorkerPool.getWorkerName()` — kiểm tra không có code ngoài nào đang gọi nó qua reflection.
- **Task 8 (test runner glob):** `**/*.test.ts` có thể match thêm file không mong muốn trong tương lai. Nếu có, đổi thành `src/tests/{,team/}*.test.ts`.

---

## Estimated Metrics

| Task | Files | Lines | Test Cases |
|------|-------|-------|------------|
| 1: Fix getWorkerName | 2 | +5 | 0 |
| 2: file-conflict test | 1 | 80 | 7 |
| 3: task-decomposer test | 1 | 135 | 8 |
| 4: types test | 1 | 145 | 16 |
| 5: parallel-executor test | 1 | 170 | 5 |
| 6: App.tsx integration | 1 | +60 | 0 |
| 7: PromptInput wire | 1 | +2 | 0 |
| 8: test runner glob | 1 | +1 | 0 |
| 9: TeamStatusPanel | 3 | +60 | 0 |
| 10: Final verify | 0 | 0 | All |
| **Total** | **12** | **~658** | **36 new** |
