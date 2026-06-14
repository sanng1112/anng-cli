# Kế Hoạch: Multi-Agent Team Orchestration & Dynamic Workflow

> **Goal:** Tích hợp khả năng multi-agent team orchestration, dynamic workflow, và tmux/dmux-based parallel execution vào anng-cli. Biến kiến trúc single-agent hiện tại thành nền tảng Agent lập trình đa tác tử có khả năng song song hóa, mà không phá vỡ bất kỳ chức năng hiện có nào.

**Architecture Principle:** Xây dựng `TeamEngine` như một module mở rộng nằm bên cạnh `SessionManager`, tương tác qua Observer pattern sẵn có. SessionManager hiện tại được wrap bởi `AgentWorker` — mỗi worker có SessionManager, ToolExecutor, API client, và context compaction độc lập. Không refactor SessionManager, không thay đổi public API của CLI.

**Tech Stack:** TypeScript (strict), Node.js ≥22, React/Ink 7, esbuild bundler, Zod validation, Node.js native test runner.

**Non-Goals (rõ ràng):**
- Không thay đổi `SessionManager`, `ToolExecutor`, `McpManager` — chỉ thêm hooks
- Không yêu cầu external database/message queue — dùng file system + in-memory state
- Không thay đổi CLI public API (`--help`, `--version`, `-p`, `--yolo`)
- Không thay đổi format của `settings.json` hiện tại — chỉ thêm optional block `team`
- Không hỗ trợ distributed agents (network-separated) — chỉ local process

---

# Repository Intelligence (Live Evidence)

## Build & Test
- **Test runner:** `node --import tsx --test --test-concurrency=4` (src/tests/run-tests.mjs)
- **43 test files** trong `src/tests/`, naming convention: `*.test.ts`
- **Quality gates:** typecheck → lint → format:check → bundle → test
- **Bundle target:** esbuild single-file `dist/cli.js`, Node 18 target, ESM format

## Key Patterns Đã Có (cần tuân thủ)
1. **Strategy Pattern:** `ToolExecutor.toolHandlers: Map<string, ToolHandler>` — registry-based dispatch
2. **Observer Pattern:** `SessionManager` nhận callbacks qua `SessionManagerOptions`: `onAssistantMessage`, `onSessionEntryUpdated`, `onLlmStreamProgress`, `onMcpStatusChanged`, `onProcessStdout`
3. **Factory Pattern:** `createOpenAIClient: () => { client, model, baseURL, ... }` — mỗi call tạo client instance riêng
4. **AbortController pattern:** Mọi async operation nhận `AbortController` và gọi `this.throwIfAborted(signal)`
5. **Error classification:** `isAbortLikeError()` — phân biệt AbortError với lỗi thật
6. **Session persistence:** JSONL file per session (`~/.anng/projects/<projectCode>/<sessionId>.jsonl`)
7. **Permission system:** 10 scopes, 3 modes, `computeToolCallPermissions()` trả về `{ permissions, askPermissions }`

## Integration Points Chính Xác (đọc từ code)

### SessionManager constructor (src/session/index.ts line 132-152)
```typescript
constructor(options: SessionManagerOptions) {
  this.projectRoot = options.projectRoot;
  this.createOpenAIClient = options.createOpenAIClient;
  this.getResolvedSettings = options.getResolvedSettings;
  this.onAssistantMessage = options.onAssistantMessage;
  this.onSessionEntryUpdated = options.onSessionEntryUpdated;
  this.onLlmStreamProgress = options.onLlmStreamProgress;
  this.onMcpStatusChanged = options.onMcpStatusChanged;
  this.onProcessStdout = options.onProcessStdout;
  this.autoAccept = options.autoAccept ?? false;
  this.planMode = options.planMode ?? false;
  this.maxTurns = options.maxTurns ?? 25;
  this.toolExecutor = new ToolExecutor(this.projectRoot, this.createOpenAIClient, this.mcpManager);
  // ...
}
```

### SessionManagerOptions type (src/session/types.ts line 246-264)
```typescript
export type SessionManagerOptions = {
  projectRoot: string;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  createOpenAIClient: CreateOpenAIClient;
  getResolvedSettings: () => { ... };
  renderMarkdown: (text: string) => string;
  onAssistantMessage: (message: SessionMessage, shouldConnect: boolean) => void;
  onSessionEntryUpdated?: (entry: SessionEntry) => void;
  onLlmStreamProgress?: (progress: LlmStreamProgress) => void;
  onMcpStatusChanged?: () => void;
  onProcessStdout?: (pid: number, chunk: string) => void;
};
```

### activateSession loop (src/session/index.ts line ~1050-1300)
```
for (let iteration = 0; iteration < 80000; iteration++) {
  1. Check interrupted
  2. Handle pending tool calls from previous turn
  3. Check context compaction
  4. Build messages → stream LLM → parse response
  5. Compute permissions
  6. If ask_permission → pause, return
  7. Execute tool calls → append results
  8. If no tool calls → session completed, return
}
```

### Permission system (src/common/permissions.ts)
- `computeToolCallPermissions(opts)` → `PermissionPlan { permissions, askPermissions }`
- `PermissionScope`: `read-in-cwd | read-out-cwd | write-in-cwd | write-out-cwd | delete-in-cwd | delete-out-cwd | query-git-log | mutate-git-log | network | mcp`

### CLI flags (src/cli.tsx)
```typescript
const autoAcceptEnabled = args.includes("--yolo") || args.includes("-y");
const planModeEnabled = args.includes("--plan");
const maxTurnsArgIndex = args.indexOf("--max-turns");
const maxTurns = maxTurnsArgIndex !== -1 ? Math.max(1, parseInt(args[maxTurnsArgIndex + 1], 10) || 25) : 25;
```

---

# Kiến Trúc Tổng Thể

## Module Layout (New — 20 files)

```
src/
└── team/                                    # NEW: Team orchestration module
    │
    ├── types.ts                              # Tất cả type definitions
    ├── team-manager.ts                       # TeamManager: lifecycle, CRUD
    ├── agent-worker.ts                       # AgentWorker: wrap SessionManager
    ├── agent-worker-pool.ts                  # AgentWorkerPool: quản lý pool workers
    ├── team-orchestrator.ts                  # TeamOrchestrator: coordinator logic
    ├── task-decomposer.ts                    # TaskDecomposer: LLM-powered decomposition
    ├── workflow-engine.ts                    # WorkflowEngine: DAG-based execution
    ├── parallel-executor.ts                  # ParallelExecutor: concurrent execution
    ├── result-aggregator.ts                  # ResultAggregator: merge outputs
    ├── file-conflict-resolver.ts             # FileConflictResolver: merge strategy
    ├── team-coordinator-prompt.ts            # System prompt templates
    │
    ├── integrations/                         # External integration
    │   ├── tmux-manager.ts                   # TmuxManager: tmux pane mgmt
    │   ├── dmux-adapter.ts                   # DmuxAdapter: dmux compat
    │   └── terminal-multiplexer.ts           # Abstract interface cho multiplexers
    │
    └── skills/                               # Built-in team skills (SKILL.md format)
        ├── team-orchestration.md             # Skill: team-orchestration
        └── subagent-driven-development.md    # Skill: subagent-driven-dev

src/tests/team/                               # NEW: Test files
    ├── types.test.ts
    ├── team-manager.test.ts
    ├── agent-worker.test.ts
    ├── agent-worker-pool.test.ts
    ├── team-orchestrator.test.ts
    ├── task-decomposer.test.ts
    ├── workflow-engine.test.ts
    ├── parallel-executor.test.ts
    ├── result-aggregator.test.ts
    ├── file-conflict-resolver.test.ts
    ├── tmux-manager.test.ts
    └── dmux-adapter.test.ts
```

## Files Cần Modify (6 files, minimal changes)

| File | Change | Lines |
|------|--------|-------|
| `src/cli.tsx` | Thêm `--team`, `--team-mode`, `--team-workers` flags | +25 |
| `src/settings.ts` | Thêm `TeamSettings` type vào `DeepcodingSettings` | +30 |
| `src/session/types.ts` | Thêm `onTeamWorkerEvent` vào `SessionManagerOptions` | +10 |
| `src/common/permissions.ts` | Thêm scope `team` vào `PermissionScope` union | +1 |
| `src/tools/executor.ts` | Export `executeToolCallsParallel()` method | +35 |
| `src/ui/views/PromptInput.tsx` | Thêm `/team` slash command handler | +30 |

**Total modified: ~131 lines** — tối thiểu, không phá vỡ gì.

---

# Phase 1: Core Types & Team Manager

## 1.1 Types System (`src/team/types.ts`)

### Đặc tả đầy đủ — khớp với patterns hiện có

```typescript
// ============================================================
// Team Configuration Types
// ============================================================

/** Execution mode cho team */
export type TeamExecutionMode = "internal" | "tmux" | "dmux" | "headless";

/** Chiến lược phân phối task cho workers */
export type TeamDispatchStrategy = "round-robin" | "skill-match" | "llm-route" | "dependency-order";

/** Trạng thái của một worker */
export type WorkerStatus = "idle" | "busy" | "error" | "disposed";

/** Trạng thái của toàn bộ team */
export type TeamStatus =
  | "initializing"
  | "waiting_for_decomposition"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "interrupted";

// ============================================================
// Agent Configuration
// ============================================================

/** Cấu hình cho một agent trong team */
export interface AgentConfig {
  /** Tên định danh duy nhất trong team */
  name: string;
  /** Vai trò: coordinator (điều phối) hoặc worker (thực thi) */
  role: "coordinator" | "worker";
  /** Mô tả năng lực — dùng cho skill-match dispatch */
  description?: string;
  /** Override model (mặc định dùng model từ settings) */
  model?: string;
  /** Skills được enable cho agent này */
  skills?: string[];
  /** Custom system prompt bổ sung */
  systemPrompt?: string;
  /** Giới hạn số lượt (default: 25) */
  maxTurns?: number;
  /** Timeout cho mỗi task (ms, default: 600000 = 10 phút) */
  taskTimeoutMs?: number;
}

// ============================================================
// Team Definition
// ============================================================

/** Định nghĩa một team */
export interface TeamDefinition {
  /** ID team (tự sinh nếu không cung cấp) */
  id?: string;
  /** Tên hiển thị */
  name: string;
  /** Agent điều phối — phân tích task, dispatch cho workers */
  coordinator: AgentConfig;
  /** Danh sách worker agents */
  workers: AgentConfig[];
  /** Số worker chạy song song tối đa (default: os.cpus().length - 1, min 1) */
  maxParallelWorkers?: number;
  /** Chiến lược dispatch (default: "llm-route") */
  strategy?: TeamDispatchStrategy;
  /** Execution mode (default: "internal") */
  mode?: TeamExecutionMode;
  /** Cho phép workers modify file system (default: true) */
  allowFileSystemAccess?: boolean;
  /** Tự động retry worker khi fail (default: 0 = không retry) */
  maxRetriesPerTask?: number;
}

// ============================================================
// Task Types
// ============================================================

/** Trạng thái của một task trong workflow */
export type TeamTaskStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

/** Một task trong team workflow */
export interface TeamTask {
  /** ID duy nhất */
  id: string;
  /** ID của task cha (nếu là sub-task) */
  parentId?: string;
  /** Mô tả công việc cần làm */
  description: string;
  /** Worker được gán (điền sau khi dispatch) */
  assignedTo?: string;
  /** Trạng thái hiện tại */
  status: TeamTaskStatus;
  /** Danh sách task ID phải hoàn thành trước khi task này được chạy */
  dependencies: string[];
  /** Danh sách task ID phụ thuộc vào task này (reverse edges) — computed */
  dependents?: string[];
  /** Độ ưu tiên (cao hơn = chạy trước, default: 0) */
  priority?: number;
  /** File paths liên quan (để conflict detection) */
  relatedFiles?: string[];
  /** Kết quả sau khi hoàn thành */
  result?: TeamTaskResult;
  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Số lần đã retry */
  retryCount?: number;
}

/** Artifact từ một task */
export interface TeamArtifact {
  /** Loại artifact */
  type: "file" | "diff" | "message" | "error";
  /** Đường dẫn file (nếu type=file hoặc diff) */
  path?: string;
  /** Nội dung */
  content?: string;
  /** Metadata bổ sung */
  metadata?: Record<string, unknown>;
}

/** Kết quả thực thi một task */
export interface TeamTaskResult {
  /** Thành công hay thất bại */
  ok: boolean;
  /** Tóm tắt kết quả (1-2 câu) */
  summary: string;
  /** Danh sách artifacts */
  artifacts: TeamArtifact[];
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Thời gian thực thi (ms) */
  durationMs: number;
  /** Session ID của worker đã thực thi */
  workerSessionId: string;
  /** Lỗi nếu có */
  error?: string;
}

/** Kết quả tổng hợp của toàn bộ team */
export interface TeamResult {
  /** Team ID */
  teamId: string;
  /** Trạng thái cuối cùng */
  status: "completed" | "failed" | "partial";
  /** Tổng số task */
  totalTasks: number;
  /** Số task thành công */
  completedTasks: number;
  /** Số task thất bại */
  failedTasks: number;
  /** Kết quả từng task (key = taskId) */
  taskResults: Record<string, TeamTaskResult>;
  /** Tổng thời gian (ms) */
  totalDurationMs: number;
  /** Tổng token usage */
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Tóm tắt tổng hợp (cho UI) */
  executiveSummary: string;
}

// ============================================================
// Team Session Types
// ============================================================

/** Trạng thái runtime của một team */
export interface TeamSession {
  /** Team ID */
  teamId: string;
  /** Team definition gốc */
  definition: TeamDefinition;
  /** Trạng thái */
  status: TeamStatus;
  /** Task graph (DAG) */
  tasks: Map<string, TeamTask>;
  /** Worker pool */
  workers: Map<string, WorkerState>;
  /** Coordinator session ID (để track usage) */
  coordinatorSessionId?: string;
  /** Timestamp */
  createdAt: string;
  updatedAt: string;
  /** Callback cho UI updates */
  onStatusChange?: (status: TeamStatus, detail?: string) => void;
  onTaskUpdate?: (taskId: string, task: TeamTask) => void;
  onWorkerUpdate?: (workerName: string, state: WorkerState) => void;
  /** AbortController cho toàn bộ team */
  abortController: AbortController;
}

/** Trạng thái runtime của một worker */
export interface WorkerState {
  /** Worker name */
  name: string;
  /** Worker config */
  config: AgentConfig;
  /** Trạng thái */
  status: WorkerStatus;
  /** Task hiện tại (nếu đang busy) */
  currentTaskId?: string;
  /** Session ID hiện tại */
  sessionId?: string;
  /** Số task đã hoàn thành */
  tasksCompleted: number;
  /** Số task đã fail */
  tasksFailed: number;
  /** Token usage tích lũy */
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

// ============================================================
// Settings Extension
// ============================================================

/** Cấu hình team trong settings.json */
export interface TeamSettings {
  /** Default execution mode */
  defaultMode?: TeamExecutionMode;
  /** Tmux-specific settings */
  tmux?: {
    sessionName?: string;
    layout?: "tiled" | "even-horizontal" | "even-vertical" | "main-vertical";
    autoAttach?: boolean;
  };
  /** Default max parallel workers */
  maxParallelWorkers?: number;
  /** Default worker config */
  workerDefaults?: {
    model?: string;
    maxTurns?: number;
    taskTimeoutMs?: number;
    maxRetriesPerTask?: number;
  };
  /** Default dispatch strategy */
  defaultStrategy?: TeamDispatchStrategy;
}

// ============================================================
// Event Types (cho Observer pattern)
// ============================================================

/** Event từ worker gửi lên orchestrator */
export interface TeamWorkerEvent {
  type: "task_started" | "task_completed" | "task_failed" | "worker_error" | "worker_idle";
  workerName: string;
  taskId?: string;
  result?: TeamTaskResult;
  error?: string;
  timestamp: string;
}

/** Event từ orchestrator gửi lên UI */
export interface TeamUIEvent {
  type: "team_status_change" | "task_update" | "worker_update" | "team_complete";
  teamId: string;
  data: unknown;
  timestamp: string;
}
```

### Validation Schemas (dùng Zod — khớp pattern `src/common/validate.ts`)

```typescript
import { z } from "zod";

export const AgentConfigSchema = z.object({
  name: z.string().min(1).max(64),
  role: z.enum(["coordinator", "worker"]),
  description: z.string().optional(),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  taskTimeoutMs: z.number().int().positive().optional(),
});

export const TeamDefinitionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(128),
  coordinator: AgentConfigSchema,
  workers: z.array(AgentConfigSchema).min(1).max(16),
  maxParallelWorkers: z.number().int().min(1).max(16).optional(),
  strategy: z.enum(["round-robin", "skill-match", "llm-route", "dependency-order"]).optional(),
  mode: z.enum(["internal", "tmux", "dmux", "headless"]).optional(),
  allowFileSystemAccess: z.boolean().optional(),
  maxRetriesPerTask: z.number().int().min(0).max(5).optional(),
});
```

## 1.2 Team Manager (`src/team/team-manager.ts`)

Quản lý vòng đời CRUD của team sessions. Pattern: giống `SessionManager` về persistence (dùng JSONL file), nhưng đơn giản hơn vì không cần LLM loop.

```typescript
import type { TeamDefinition, TeamSession, WorkerState, TeamStatus } from "./types";
import { TeamDefinitionSchema } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

/** Đường dẫn lưu team state */
function getTeamStorageDir(): string {
  return path.join(os.homedir(), ".anng", "teams");
}

export class TeamManager {
  private activeTeams: Map<string, TeamSession> = new Map();

  /**
   * Tạo team mới từ definition.
   * Validation: dùng TeamDefinitionSchema.parse()
   * Tự động sinh teamId nếu chưa có.
   * Khởi tạo workers Map rỗng (sẽ được populate khi orchestrator start).
   */
  createTeam(definition: TeamDefinition): TeamSession {
    const validated = TeamDefinitionSchema.parse(definition);
    const teamId = validated.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const workers = new Map<string, WorkerState>();
    for (const workerConfig of validated.workers) {
      workers.set(workerConfig.name, {
        name: workerConfig.name,
        config: workerConfig,
        status: "idle",
        tasksCompleted: 0,
        tasksFailed: 0,
        totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    }

    const session: TeamSession = {
      teamId,
      definition: { ...validated, id: teamId },
      status: "initializing",
      tasks: new Map(),
      workers,
      createdAt: now,
      updatedAt: now,
      abortController: new AbortController(),
    };

    this.activeTeams.set(teamId, session);
    this.persistTeam(session);
    return session;
  }

  /** Lấy team session đang active */
  getTeam(teamId: string): TeamSession | undefined {
    return this.activeTeams.get(teamId);
  }

  /** Liệt kê tất cả active teams */
  listActiveTeams(): TeamSession[] {
    return Array.from(this.activeTeams.values());
  }

  /** Cập nhật trạng thái team */
  updateTeamStatus(teamId: string, status: TeamStatus, detail?: string): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.status = status;
    team.updatedAt = new Date().toISOString();
    team.onStatusChange?.(status, detail);
    this.persistTeam(team);
  }

  /** Cập nhật trạng thái worker */
  updateWorker(teamId: string, workerName: string, update: Partial<WorkerState>): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    const worker = team.workers.get(workerName);
    if (!worker) return;
    Object.assign(worker, update);
    team.updatedAt = new Date().toISOString();
    team.onWorkerUpdate?.(workerName, worker);
  }

  /** Add/update task */
  upsertTask(teamId: string, task: TeamTask): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.tasks.set(task.id, task);
    team.updatedAt = new Date().toISOString();
    team.onTaskUpdate?.(task.id, task);
  }

  /** Dispose team — kill all workers, cleanup */
  disposeTeam(teamId: string): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.abortController.abort();
    this.activeTeams.delete(teamId);
    // Cleanup persisted file
    const filePath = this.getTeamFilePath(teamId);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  /** Interrupt team (user Ctrl+C) */
  interruptTeam(teamId: string): void {
    const team = this.activeTeams.get(teamId);
    if (!team) return;
    team.abortController.abort();
    team.status = "interrupted";
    team.updatedAt = new Date().toISOString();
    this.persistTeam(team);
  }

  // Private helpers

  private getTeamFilePath(teamId: string): string {
    const dir = getTeamStorageDir();
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${teamId}.json`);
  }

  private persistTeam(team: TeamSession): void {
    try {
      const dir = getTeamStorageDir();
      fs.mkdirSync(dir, { recursive: true });
      const filePath = this.getTeamFilePath(team.teamId);
      // Serialize Map → object
      const serialized = {
        ...team,
        tasks: Object.fromEntries(team.tasks),
        workers: Object.fromEntries(team.workers),
        abortController: undefined, // không serialize
        onStatusChange: undefined,
        onTaskUpdate: undefined,
        onWorkerUpdate: undefined,
      };
      fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2), "utf8");
    } catch {
      // Non-critical — persistence is best-effort
    }
  }
}
```

### Test Plan (Phase 1)

**File: `src/tests/team/team-manager.test.ts`**

```typescript
// Sử dụng Node.js native test runner + assert (khớp pattern hiện có)
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TeamManager } from "../../team/team-manager";

describe("TeamManager", () => {
  let manager: TeamManager;

  beforeEach(() => {
    manager = new TeamManager();
  });

  afterEach(() => {
    for (const team of manager.listActiveTeams()) {
      manager.disposeTeam(team.teamId);
    }
  });

  it("tạo team với config hợp lệ", () => {
    const team = manager.createTeam({
      name: "test-team",
      coordinator: { name: "coord", role: "coordinator" },
      workers: [{ name: "w1", role: "worker" }],
    });
    assert.equal(team.definition.name, "test-team");
    assert.equal(team.workers.size, 1);
    assert.ok(team.workers.has("w1"));
    assert.equal(team.status, "initializing");
  });

  it("tự sinh teamId nếu không cung cấp", () => {
    const team = manager.createTeam({
      name: "test",
      coordinator: { name: "c", role: "coordinator" },
      workers: [],
    });
    assert.ok(team.teamId.length > 0);
    assert.ok(team.definition.id === team.teamId);
  });

  it("từ chối config không hợp lệ (thiếu workers)", () => {
    assert.throws(() => {
      manager.createTeam({
        name: "bad",
        coordinator: { name: "c", role: "coordinator" },
        workers: [] as any, // Zod sẽ reject array rỗng vì min(1)
      });
    });
  });

  it("cập nhật trạng thái team", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.updateTeamStatus(team.teamId, "running");
    const updated = manager.getTeam(team.teamId);
    assert.equal(updated?.status, "running");
  });

  it("cập nhật worker state", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.updateWorker(team.teamId, "w", {
      status: "busy",
      currentTaskId: "task-1",
    });
    const worker = manager.getTeam(team.teamId)?.workers.get("w");
    assert.equal(worker?.status, "busy");
    assert.equal(worker?.currentTaskId, "task-1");
  });

  it("dispose xóa team khỏi memory", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.disposeTeam(team.teamId);
    assert.equal(manager.getTeam(team.teamId), undefined);
  });

  it("listActiveTeams trả về tất cả teams", () => {
    manager.createTeam({
      name: "t1",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.createTeam({
      name: "t2",
      coordinator: { name: "c2", role: "coordinator" },
      workers: [{ name: "w2", role: "worker" }],
    });
    assert.equal(manager.listActiveTeams().length, 2);
  });

  it("interrupt đặt trạng thái interrupted và abort", () => {
    const team = manager.createTeam({
      name: "t",
      coordinator: { name: "c", role: "coordinator" },
      workers: [{ name: "w", role: "worker" }],
    });
    manager.interruptTeam(team.teamId);
    assert.equal(team.status, "interrupted");
    assert.equal(team.abortController.signal.aborted, true);
  });
});
```

---

# Phase 2: Agent Worker & Worker Pool

## 2.1 Agent Worker (`src/team/agent-worker.ts`)

Mỗi `AgentWorker` wrap một `SessionManager` instance độc lập. Pattern: giống như cách `App.tsx` tạo và quản lý SessionManager.

```typescript
import { SessionManager } from "../session";
import type { SessionManagerOptions, SessionMessage, SessionEntry, LlmStreamProgress } from "../session";
import type { CreateOpenAIClient } from "../tools/executor";
import type { AgentConfig, TeamTask, TeamTaskResult, TeamArtifact } from "./types";
import type { McpServerConfig, PermissionSettings } from "../settings";

export type AgentWorkerOptions = {
  projectRoot: string;
  agentConfig: AgentConfig;
  createOpenAIClient: CreateOpenAIClient;
  mcpServers?: Record<string, McpServerConfig>;
  permissions?: Required<PermissionSettings>;
  enabledSkills?: Record<string, boolean>;
  renderMarkdown: (text: string) => string;
  onWorkerEvent?: (event: TeamWorkerEvent) => void;
};

export class AgentWorker {
  private sessionManager: SessionManager | null = null;
  private config: AgentConfig;
  private status: WorkerStatus = "idle";
  private currentTaskId: string | undefined;
  private totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private tasksCompleted = 0;
  private tasksFailed = 0;

  constructor(private options: AgentWorkerOptions) {
    this.config = options.agentConfig;
  }

  /** Khởi tạo SessionManager bên trong worker */
  async initialize(): Promise<void> {
    const smOptions: SessionManagerOptions = {
      projectRoot: this.options.projectRoot,
      autoAccept: true, // Worker luôn auto-accept (đã được coordinator approve)
      planMode: false,
      maxTurns: this.config.maxTurns ?? 25,
      createOpenAIClient: () => {
        const base = this.options.createOpenAIClient();
        // Override model nếu worker có config riêng
        if (this.config.model) {
          return { ...base, model: this.config.model };
        }
        return base;
      },
      getResolvedSettings: () => ({
        model: this.config.model ?? "",
        mcpServers: this.options.mcpServers,
        permissions: this.options.permissions ?? {
          allow: [],
          deny: [],
          ask: [],
          defaultMode: "allowAll",
        },
        enabledSkills: this.options.enabledSkills,
      }),
      renderMarkdown: this.options.renderMarkdown,
      onAssistantMessage: (_message, _shouldConnect) => {
        // Worker messages không hiển thị lên UI chính
      },
      onSessionEntryUpdated: (_entry) => {},
      onLlmStreamProgress: (_progress) => {},
    };

    this.sessionManager = new SessionManager(smOptions);
    await this.sessionManager.initMcpServers(this.options.mcpServers);
    this.status = "idle";
  }

  /**
   * Gửi một prompt tới worker và đợi kết quả.
   * Worker chạy handleUserPrompt() — toàn bộ agent loop tự động.
   * Timeout: nếu taskTimeoutMs được set và vượt quá, abort.
   */
  async executeTask(task: TeamTask): Promise<TeamTaskResult> {
    if (!this.sessionManager) {
      throw new Error("Worker not initialized");
    }

    this.status = "busy";
    this.currentTaskId = task.id;
    const startedAt = Date.now();

    this.options.onWorkerEvent?.({
      type: "task_started",
      workerName: this.config.name,
      taskId: task.id,
      timestamp: new Date().toISOString(),
    });

    try {
      // Tạo session mới cho mỗi task (isolation)
      // Build context prompt: system prompt của worker + task description + context từ dependencies
      const contextPrompt = this.buildTaskPrompt(task);

      // Timeout control
      const timeoutMs = this.config.taskTimeoutMs ?? 600_000;
      const timeout = setTimeout(() => {
        this.sessionManager?.interruptActiveSession();
      }, timeoutMs);

      await this.sessionManager.handleUserPrompt({ text: contextPrompt });

      clearTimeout(timeout);

      // Đọc kết quả từ session
      const sessionId = this.sessionManager.getActiveSessionId();
      const session = sessionId ? this.sessionManager.getSession(sessionId) : null;
      const usage = session?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      const result: TeamTaskResult = {
        ok: session?.status === "completed",
        summary: session?.assistantReply ?? "(no output)",
        artifacts: this.extractArtifacts(session),
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        durationMs: Date.now() - startedAt,
        workerSessionId: sessionId ?? "",
      };

      if (session?.status === "completed") {
        this.tasksCompleted++;
        this.options.onWorkerEvent?.({
          type: "task_completed",
          workerName: this.config.name,
          taskId: task.id,
          result,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.tasksFailed++;
        result.ok = false;
        result.error = session?.failReason ?? "Unknown failure";
        this.options.onWorkerEvent?.({
          type: "task_failed",
          workerName: this.config.name,
          taskId: task.id,
          result,
          error: result.error,
          timestamp: new Date().toISOString(),
        });
      }

      this.totalUsage.inputTokens += usage.prompt_tokens;
      this.totalUsage.outputTokens += usage.completion_tokens;
      this.totalUsage.totalTokens += usage.total_tokens;

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.tasksFailed++;
      this.options.onWorkerEvent?.({
        type: "task_failed",
        workerName: this.config.name,
        taskId: task.id,
        error: errMsg,
        timestamp: new Date().toISOString(),
      });
      return {
        ok: false,
        summary: `Task failed: ${errMsg}`,
        artifacts: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: Date.now() - startedAt,
        workerSessionId: "",
        error: errMsg,
      };
    } finally {
      this.status = "idle";
      this.currentTaskId = undefined;
    }
  }

  /** Build prompt cho worker dựa trên task */
  private buildTaskPrompt(task: TeamTask): string {
    let prompt = "";

    // Custom system prompt của worker
    if (this.config.systemPrompt) {
      prompt += `${this.config.systemPrompt}\n\n`;
    }

    // Task description
    prompt += `## Task\n${task.description}\n\n`;

    // Context từ dependencies (nếu có)
    // Note: dependency results được inject bởi orchestrator trước khi dispatch

    // Kết quả từ dependency tasks
    if (task.dependencies.length > 0) {
      prompt += `## Context from completed tasks\n`;
      prompt += `The following tasks have been completed. Use their outputs as context.\n\n`;
    }

    prompt += `## Instructions\n`;
    prompt += `1. Complete the task described above.\n`;
    prompt += `2. If you need to create or modify files, do so.\n`;
    prompt += `3. When done, provide a summary of what you did.\n`;

    return prompt;
  }

  /** Extract artifacts từ session */
  private extractArtifacts(session: SessionEntry | null): TeamArtifact[] {
    // TODO: Parse tool results từ session messages để trích xuất
    // file paths đã được tạo/sửa
    return [];
  }

  /** Lấy trạng thái worker */
  getStatus(): WorkerStatus {
    return this.status;
  }

  /** Lấy stats */
  getStats() {
    return {
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      totalUsage: this.totalUsage,
    };
  }

  /** Ngắt worker đang chạy */
  interrupt(): void {
    this.sessionManager?.interruptActiveSession();
    this.status = "idle";
    this.currentTaskId = undefined;
  }

  /** Dọn dẹp */
  dispose(): void {
    this.sessionManager?.dispose();
    this.sessionManager = null;
    this.status = "disposed";
  }
}
```

## 2.2 Agent Worker Pool (`src/team/agent-worker-pool.ts`)

```typescript
import { AgentWorker, type AgentWorkerOptions } from "./agent-worker";
import type { AgentConfig, TeamTask, TeamTaskResult } from "./types";

export type AgentWorkerPoolOptions = {
  projectRoot: string;
  maxConcurrency: number;
  baseWorkerOptions: Omit<AgentWorkerOptions, "agentConfig">;
};

export class AgentWorkerPool {
  private workers: Map<string, AgentWorker> = new Map();
  private available: AgentWorker[] = [];
  private busy: Set<string> = new Set();
  private maxConcurrency: number;

  constructor(private options: AgentWorkerPoolOptions) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
  }

  /** Thêm worker vào pool */
  async addWorker(config: AgentConfig): Promise<void> {
    const worker = new AgentWorker({
      ...this.options.baseWorkerOptions,
      agentConfig: config,
    });
    await worker.initialize();
    this.workers.set(config.name, worker);
    this.available.push(worker);
  }

  /** Khởi tạo tất cả workers */
  async initializeAll(configs: AgentConfig[]): Promise<void> {
    await Promise.all(configs.map((c) => this.addWorker(c)));
  }

  /** Lấy worker available (idle) */
  acquireWorker(): AgentWorker | null {
    // Lọc bỏ workers đã disposed
    this.available = this.available.filter((w) => w.getStatus() !== "disposed");

    if (this.available.length === 0) return null;
    if (this.busy.size >= this.maxConcurrency) return null;

    const worker = this.available.shift()!;
    this.busy.add(worker.getStatus() === "idle" ? this.getWorkerName(worker) : "");
    return worker;
  }

  /** Trả worker về pool */
  releaseWorker(worker: AgentWorker): void {
    const name = this.getWorkerName(worker);
    this.busy.delete(name);
    if (worker.getStatus() !== "disposed") {
      this.available.push(worker);
    }
  }

  /** Thực thi một task với worker được acquire */
  async executeWithWorker(
    task: TeamTask,
    worker: AgentWorker
  ): Promise<{ result: TeamTaskResult; worker: AgentWorker }> {
    const result = await worker.executeTask(task);
    return { result, worker };
  }

  /** Check xem có worker nào available không */
  hasAvailable(): boolean {
    this.available = this.available.filter((w) => w.getStatus() !== "disposed");
    return this.available.length > 0 && this.busy.size < this.maxConcurrency;
  }

  /** Số worker đang busy */
  getBusyCount(): number {
    return this.busy.size;
  }

  /** Tổng số worker */
  getTotalCount(): number {
    return this.workers.size;
  }

  /** Interrupt tất cả workers */
  interruptAll(): void {
    for (const worker of this.workers.values()) {
      worker.interrupt();
    }
  }

  /** Dispose tất cả workers */
  disposeAll(): void {
    for (const worker of this.workers.values()) {
      worker.dispose();
    }
    this.workers.clear();
    this.available = [];
    this.busy.clear();
  }

  private getWorkerName(worker: AgentWorker): string {
    for (const [name, w] of this.workers) {
      if (w === worker) return name;
    }
    return "unknown";
  }
}
```

### Test Plan (Phase 2)

**File: `src/tests/team/agent-worker.test.ts`** — Test AgentWorker initialization, executeTask với mock SessionManager
**File: `src/tests/team/agent-worker-pool.test.ts`** — Test acquire/release, concurrency limits, dispose

---

## 2.3 Team Coordinator Prompt (`src/team/team-coordinator-prompt.ts`)

System prompt template cho coordinator agent. Pattern: giống `src/prompt.ts` — export function trả về string.

```typescript
/**
 * System prompt cho Coordinator agent.
 * Coordinator có nhiệm vụ: phân tích task → decompose → giám sát workers → tổng hợp.
 * Khác với worker prompt — coordinator không thực thi code, chỉ điều phối.
 */

export function getCoordinatorSystemPrompt(): string {
  return `You are a Team Coordinator AI agent. Your role is to orchestrate a team of AI coding agents to complete complex software engineering tasks.

## Your Responsibilities

1. **Task Analysis**: Understand the user's request and determine if it can benefit from parallel execution.
2. **Task Decomposition**: Break large tasks into smaller, independent sub-tasks that can run concurrently.
3. **Worker Dispatch**: Assign sub-tasks to the most appropriate worker agents.
4. **Progress Monitoring**: Track worker progress and handle failures.
5. **Result Aggregation**: Collect and synthesize results from all workers.

## Decomposition Rules

- Each sub-task must be completable by a single agent in < 10 tool calls.
- Minimize dependencies between sub-tasks — maximize parallelism.
- Only create a dependency when one task truly needs another's output.
- Assign each sub-task a priority (1-5, 5=highest).
- Estimate which files each sub-task will touch.

## Dispatch Rules

- Never assign two workers to the same file simultaneously.
- If a worker fails, mark its dependent tasks as skipped.
- Workers run independently — they do not communicate with each other.
- Each worker has its own session, context, and API key.

## Output Format

When decomposing a task, respond with a JSON array of sub-tasks:

\`\`\`json
{
  "subTasks": [
    {
      "title": "short descriptive title",
      "description": "detailed instructions for the worker agent",
      "dependsOn": [],
      "priority": 5,
      "estimatedFiles": ["src/auth/login.ts", "src/auth/types.ts"]
    }
  ]
}
\`\`\`

## Reporting

After all workers complete, provide an executive summary including:
- Total tasks completed vs failed
- Any file conflicts detected
- Key changes made
- Remaining work (if any)
- Total token usage`;
}

/**
 * System prompt cho Worker agent.
 * Worker được giao một sub-task cụ thể và phải hoàn thành nó.
 */
export function getWorkerSystemPrompt(workerName: string, workerDescription?: string): string {
  return `You are ${workerName}, a specialized AI coding agent${workerDescription ? ` (${workerDescription})` : ""}.

## Your Role

You are part of a team of AI agents working on a large task. You have been assigned a specific sub-task. Focus ONLY on your assigned sub-task — do not work on other parts of the project.

## Rules

1. Complete your assigned sub-task using the tools available (read, write, edit, bash).
2. Do not modify files outside your assigned scope.
3. When done, provide a clear summary of what you changed and why.
4. If you encounter a blocker, report it clearly — do not attempt to solve unrelated problems.
5. Your work will be reviewed after all team members complete their tasks.

## Communication

- You work independently. Do not wait for other workers.
- Your output will be collected and integrated by the coordinator.
- Report your results clearly and concisely.`;
}

/**
 * Prompt template cho task decomposition request.
 * Gửi kèm task description của user để LLM phân rã.
 */
export function buildDecompositionPrompt(userTask: string): string {
  return `Analyze the following software engineering task and decompose it into parallel sub-tasks.

# Task
${userTask}

# Instructions
1. Identify independent work units that can run in parallel.
2. For each sub-task, specify what files it will likely touch.
3. Define clear dependencies (only when truly necessary).
4. Assign priorities (5 = most critical/blocking).

Respond in JSON format with a "subTasks" array.`;
}
```

---

# Phase 3: Task Decomposer & Workflow Engine

## 3.1 Task Decomposer (`src/team/task-decomposer.ts`)

Sử dụng LLM (có thể là coordinator agent) để phân rã task phức tạp thành DAG các sub-tasks. Pattern: giống `identifyMatchingSkillNames()` trong SessionManager.

```typescript
import type { CreateOpenAIClient } from "../tools/executor";
import type { TeamTask } from "./types";
import * as crypto from "crypto";

export type DecompositionOptions = {
  createOpenAIClient: CreateOpenAIClient;
  maxSubTasks?: number; // default: 8
  signal?: AbortSignal;
};

const DECOMPOSITION_PROMPT = `You are a task decomposition specialist. Given a complex software engineering task, break it down into smaller, independent sub-tasks that can be executed in parallel by AI coding agents.

Rules:
1. Each sub-task should be completable by a single agent in < 10 tool calls.
2. Order sub-tasks by dependency. A sub-task that depends on another's output must list it in "dependsOn".
3. Maximize parallelization — only create dependencies when truly necessary.
4. Assign each sub-task a priority (1-5, 5=highest).
5. Estimate which files each sub-task will touch (to detect conflicts).

Respond in JSON format:
{
  "subTasks": [
    {
      "title": "short title",
      "description": "detailed instructions for the agent",
      "dependsOn": ["task-id-1"],  // task IDs that must complete first
      "priority": 3,
      "estimatedFiles": ["src/file1.ts", "src/file2.ts"]
    }
  ]
}`;

export class TaskDecomposer {
  /**
   * Phân rã một task description thành DAG các sub-tasks.
   * Gọi LLM để thực hiện decomposition.
   */
  async decompose(
    taskDescription: string,
    options: DecompositionOptions
  ): Promise<TeamTask[]> {
    const { client, model, baseURL, debugLogEnabled } = options.createOpenAIClient();
    if (!client) {
      // Fallback: single task, không decomposition
      return [this.createSingleTask(taskDescription)];
    }

    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: DECOMPOSITION_PROMPT },
          { role: "user", content: `Decompose this task:\n${taskDescription}` },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === "string" ? rawContent : "";
      if (!content) {
        return [this.createSingleTask(taskDescription)];
      }

      const parsed = JSON.parse(content);
      if (!parsed.subTasks || !Array.isArray(parsed.subTasks) || parsed.subTasks.length === 0) {
        return [this.createSingleTask(taskDescription)];
      }

      const maxSubTasks = options.maxSubTasks ?? 8;
      const subTasks = parsed.subTasks.slice(0, maxSubTasks);

      const tasks: TeamTask[] = [];
      const taskIdMap = new Map<number, string>();

      for (let i = 0; i < subTasks.length; i++) {
        const sub = subTasks[i];
        const taskId = crypto.randomUUID();
        taskIdMap.set(i, taskId);

        tasks.push({
          id: taskId,
          description: sub.description || sub.title || `Sub-task ${i + 1}`,
          status: "pending",
          dependencies: [], // sẽ map sau
          priority: typeof sub.priority === "number" ? sub.priority : 0,
          relatedFiles: Array.isArray(sub.estimatedFiles) ? sub.estimatedFiles : [],
          createdAt: new Date().toISOString(),
        });
      }

      // Map dependencies (sử dụng index → taskId)
      for (let i = 0; i < subTasks.length; i++) {
        const sub = subTasks[i];
        if (Array.isArray(sub.dependsOn)) {
          for (const depIndex of sub.dependsOn) {
            const depId = taskIdMap.get(depIndex);
            if (depId) {
              tasks[i].dependencies.push(depId);
            }
          }
        }
      }

      return tasks;
    } catch (error) {
      // Fallback: nếu LLM call fail, trả về single task
      return [this.createSingleTask(taskDescription)];
    }
  }

  private createSingleTask(description: string): TeamTask {
    return {
      id: crypto.randomUUID(),
      description,
      status: "pending",
      dependencies: [],
      priority: 1,
      createdAt: new Date().toISOString(),
    };
  }
}
```

## 3.2 Workflow Engine (`src/team/workflow-engine.ts`)

DAG-based task execution engine. Quản lý dependency graph, xác định task nào sẵn sàng chạy.

```typescript
import type { TeamTask, TeamTaskResult, TeamTaskStatus } from "./types";

export class WorkflowEngine {
  private tasks: Map<string, TeamTask> = new Map();
  // Adjacency list: taskId → [dependentTaskIds] (forward edges)
  private dependents: Map<string, Set<string>> = new Map();

  /** Thêm task vào DAG */
  addTask(task: TeamTask): void {
    this.tasks.set(task.id, { ...task });

    // Build reverse dependency map
    for (const depId of task.dependencies) {
      if (!this.dependents.has(depId)) {
        this.dependents.set(depId, new Set());
      }
      this.dependents.get(depId)!.add(task.id);
    }
  }

  /** Thêm nhiều tasks */
  addTasks(tasks: TeamTask[]): void {
    for (const task of tasks) {
      this.addTask(task);
    }
  }

  /**
   * Lấy danh sách task có thể chạy ngay (tất cả dependencies đã completed).
   * Sắp xếp theo priority (cao → thấp).
   * Giới hạn bởi maxTasks.
   */
  getRunnableTasks(maxTasks?: number): TeamTask[] {
    const runnable: TeamTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.status !== "pending") continue;

      const depsCompleted = task.dependencies.every((depId) => {
        const depTask = this.tasks.get(depId);
        return depTask?.status === "completed" || depTask?.status === "skipped";
      });

      if (depsCompleted) {
        runnable.push(task);
      }
    }

    // Sort: priority desc, then createdAt asc
    runnable.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });

    return maxTasks ? runnable.slice(0, maxTasks) : runnable;
  }

  /** Đánh dấu task hoàn thành */
  onTaskComplete(taskId: string, result: TeamTaskResult): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = result.ok ? "completed" : "failed";
    task.result = result;
    task.completedAt = new Date().toISOString();

    // Nếu task fail, đánh dấu tất cả dependents là skipped
    if (!result.ok) {
      this.skipDependents(taskId);
    }
  }

  /** Đánh dấu task đang chạy */
  onTaskStart(taskId: string, workerName: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "running";
    task.assignedTo = workerName;
    task.startedAt = new Date().toISOString();
  }

  /** Kiểm tra tất cả tasks đã hoàn thành (completed/failed/skipped) */
  isComplete(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === "pending" || task.status === "assigned" || task.status === "running") {
        return false;
      }
    }
    return true;
  }

  /** Đếm task theo status */
  countByStatus(): Record<TeamTaskStatus, number> {
    const counts: Record<TeamTaskStatus, number> = {
      pending: 0, assigned: 0, running: 0, completed: 0, failed: 0, skipped: 0,
    };
    for (const task of this.tasks.values()) {
      counts[task.status]++;
    }
    return counts;
  }

  /** Lấy tất cả tasks (cho serialization) */
  getAllTasks(): TeamTask[] {
    return Array.from(this.tasks.values());
  }

  /** ASCII visualization của DAG (cho debug) */
  visualize(): string {
    const lines: string[] = ["Workflow DAG:"];
    for (const [taskId, task] of this.tasks) {
      const deps = task.dependencies.map((d) => {
        const depTask = this.tasks.get(d);
        return depTask ? `"${depTask.description.slice(0, 30)}"` : d;
      }).join(", ");
      lines.push(`  [${task.status}] ${task.description.slice(0, 50)}`);
      if (deps) lines.push(`    depends on: ${deps}`);
    }
    return lines.join("\n");
  }

  /** Skip tất cả dependents của một task bị fail */
  private skipDependents(failedTaskId: string): void {
    const deps = this.dependents.get(failedTaskId);
    if (!deps) return;

    for (const depId of deps) {
      const task = this.tasks.get(depId);
      if (task && task.status === "pending") {
        task.status = "skipped";
        // Đệ quy skip dependents của dependent
        this.skipDependents(depId);
      }
    }
  }
}
```

### Test Plan (Phase 3)

**File: `src/tests/team/task-decomposer.test.ts`**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskDecomposer } from "../../team/task-decomposer";
import type { CreateOpenAIClient } from "../../tools/executor";

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
    assert.ok(tasks[0].description.includes("login"));
  });

  it("trả về single task khi LLM trả về JSON rỗng", async () => {
    const emptyJsonClient: CreateOpenAIClient = () => ({
      client: {
        chat: {
          completions: {
            create: async () => ({
              choices: [{ message: { content: '{"subTasks": []}' } }],
            }),
          },
        },
      } as any,
      model: "test-model",
      baseURL: "",
      temperature: undefined,
      thinkingEnabled: false,
      reasoningEffort: undefined,
      debugLogEnabled: false,
      telemetryEnabled: false,
      env: {},
      machineId: "",
    });
    const tasks = await decomposer.decompose("do something", {
      createOpenAIClient: emptyJsonClient,
    });
    assert.equal(tasks.length, 1);
  });

  it("phân rã thành nhiều sub-tasks từ JSON response", async () => {
    const multiTaskClient: CreateOpenAIClient = () => ({
      client: {
        chat: {
          completions: {
            create: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify({
                    subTasks: [
                      { title: "Setup DB", description: "Create database schema", dependsOn: [], priority: 5, estimatedFiles: ["db/schema.sql"] },
                      { title: "Build API", description: "Build REST endpoints", dependsOn: [0], priority: 4, estimatedFiles: ["src/api.ts"] },
                      { title: "Build UI", description: "Build React frontend", dependsOn: [], priority: 3, estimatedFiles: ["src/App.tsx"] },
                    ],
                  }),
                },
              }],
            }),
          },
        },
      } as any,
      model: "test",
      baseURL: "",
      temperature: undefined,
      thinkingEnabled: false,
      reasoningEffort: undefined,
      debugLogEnabled: false,
      telemetryEnabled: false,
      env: {},
      machineId: "",
    });
    const tasks = await decomposer.decompose("build full-stack app", {
      createOpenAIClient: multiTaskClient,
    });
    assert.equal(tasks.length, 3);
    // Task "Build API" (index 1) nên có dependency vào task "Setup DB" (index 0)
    const apiTask = tasks[1];
    assert.ok(apiTask.dependencies.length > 0);
  });

  it("giới hạn số sub-tasks theo maxSubTasks", async () => {
    const manyTaskClient: CreateOpenAIClient = () => ({
      client: {
        chat: {
          completions: {
            create: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify({
                    subTasks: Array.from({ length: 20 }, (_, i) => ({
                      title: `Task ${i}`,
                      description: `Do task ${i}`,
                      dependsOn: [],
                      priority: 1,
                      estimatedFiles: [],
                    })),
                  }),
                },
              }],
            }),
          },
        },
      } as any,
      model: "test",
      baseURL: "",
      temperature: undefined,
      thinkingEnabled: false,
      reasoningEffort: undefined,
      debugLogEnabled: false,
      telemetryEnabled: false,
      env: {},
      machineId: "",
    });
    const tasks = await decomposer.decompose("big task", {
      createOpenAIClient: manyTaskClient,
      maxSubTasks: 5,
    });
    assert.equal(tasks.length, 5);
  });

  it("fallback khi LLM throw error", async () => {
    const failingClient: CreateOpenAIClient = () => ({
      client: {
        chat: {
          completions: {
            create: async () => { throw new Error("API error"); },
          },
        },
      } as any,
      model: "test",
      baseURL: "",
      temperature: undefined,
      thinkingEnabled: false,
      reasoningEffort: undefined,
      debugLogEnabled: false,
      telemetryEnabled: false,
      env: {},
      machineId: "",
    });
    const tasks = await decomposer.decompose("some task", {
      createOpenAIClient: failingClient,
    });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "pending");
  });
});
```

**File: `src/tests/team/workflow-engine.test.ts`**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkflowEngine } from "../../team/workflow-engine";
import type { TeamTask, TeamTaskResult } from "../../team/types";

function makeTask(id: string, desc: string, deps: string[] = [], priority = 0): TeamTask {
  return {
    id, description: desc, status: "pending", dependencies: deps,
    priority, createdAt: new Date().toISOString(),
  };
}

function makeSuccessResult(): TeamTaskResult {
  return {
    ok: true, summary: "done", artifacts: [],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    durationMs: 1000, workerSessionId: "session-1",
  };
}

function makeFailResult(): TeamTaskResult {
  return {
    ok: false, summary: "failed", artifacts: [],
    usage: { inputTokens: 100, outputTokens: 0, totalTokens: 100 },
    durationMs: 500, workerSessionId: "session-1",
    error: "something went wrong",
  };
}

describe("WorkflowEngine", () => {
  it("linear dependency chain", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A", []));
    engine.addTask(makeTask("b", "Task B", ["a"]));
    engine.addTask(makeTask("c", "Task C", ["b"]));

    // Initially chỉ A runnable
    let runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "a");

    // Complete A → B runnable
    engine.onTaskComplete("a", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "b");

    // Complete B → C runnable
    engine.onTaskComplete("b", makeSuccessResult());
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "c");

    assert.equal(engine.isComplete(), false);
    engine.onTaskComplete("c", makeSuccessResult());
    assert.equal(engine.isComplete(), true);
  });

  it("parallel tasks (không dependency)", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A", []));
    engine.addTask(makeTask("b", "Task B", []));
    engine.addTask(makeTask("c", "Task C", []));

    const runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 3);
    // Tất cả đều runnable vì không có dependency
    const ids = runnable.map(t => t.id).sort();
    assert.deepEqual(ids, ["a", "b", "c"]);
  });

  it("diamond dependency (A → B, A → C; B → D, C → D)", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A", []));
    engine.addTask(makeTask("b", "Task B", ["a"]));
    engine.addTask(makeTask("c", "Task C", ["a"]));
    engine.addTask(makeTask("d", "Task D", ["b", "c"]));

    // Only A runnable
    let runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "a");

    engine.onTaskComplete("a", makeSuccessResult());

    // B and C both runnable
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 2);
    const ids = runnable.map(t => t.id).sort();
    assert.deepEqual(ids, ["b", "c"]);

    engine.onTaskComplete("b", makeSuccessResult());
    // C still running, D not yet (needs both B and C)
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "c");

    engine.onTaskComplete("c", makeSuccessResult());
    // Now D runnable
    runnable = engine.getRunnableTasks();
    assert.equal(runnable.length, 1);
    assert.equal(runnable[0].id, "d");

    engine.onTaskComplete("d", makeSuccessResult());
    assert.equal(engine.isComplete(), true);
  });

  it("skip dependents khi task fail", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A", []));
    engine.addTask(makeTask("b", "Task B", ["a"]));
    engine.addTask(makeTask("c", "Task C", ["a"]));
    engine.addTask(makeTask("d", "Task D", ["b"]));

    engine.onTaskComplete("a", makeFailResult());
    // A failed → B and C skipped
    assert.equal(engine.isComplete(), true); // tất cả resolved (completed/failed/skipped)

    const counts = engine.countByStatus();
    assert.equal(counts.failed, 1);
    assert.ok(counts.skipped >= 2); // b, c bị skip
  });

  it("sort theo priority", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("low", "Low priority", [], 1));
    engine.addTask(makeTask("high", "High priority", [], 5));
    engine.addTask(makeTask("mid", "Mid priority", [], 3));

    const runnable = engine.getRunnableTasks();
    assert.equal(runnable[0].id, "high");
    assert.equal(runnable[1].id, "mid");
    assert.equal(runnable[2].id, "low");
  });

  it("getRunnableTasks giới hạn bởi maxTasks", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A", []));
    engine.addTask(makeTask("b", "Task B", []));
    engine.addTask(makeTask("c", "Task C", []));

    const runnable = engine.getRunnableTasks(2);
    assert.equal(runnable.length, 2);
  });

  it("countByStatus chính xác", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Task A", []));
    engine.addTask(makeTask("b", "Task B", []));

    engine.onTaskStart("a", "worker-1");
    engine.onTaskComplete("a", makeSuccessResult());

    const counts = engine.countByStatus();
    assert.equal(counts.pending, 1);  // b still pending
    assert.equal(counts.completed, 1); // a completed
    assert.equal(counts.running, 0);
  });

  it("visualize trả về string không rỗng", () => {
    const engine = new WorkflowEngine();
    engine.addTask(makeTask("a", "Build auth module", []));
    engine.addTask(makeTask("b", "Build API module", ["a"]));

    const viz = engine.visualize();
    assert.ok(viz.includes("Workflow DAG"));
    assert.ok(viz.includes("Build auth module"));
    assert.ok(viz.includes("depends on"));
  });
});
```

---

# Phase 4: Parallel Executor & Result Aggregator

## 4.1 Parallel Executor (`src/team/parallel-executor.ts`)

```typescript
import { AgentWorkerPool } from "./agent-worker-pool";
import { WorkflowEngine } from "./workflow-engine";
import { TeamManager } from "./team-manager";
import type { TeamTask, TeamTaskResult, TeamResult } from "./types";

export type ParallelExecutorOptions = {
  teamId: string;
  teamManager: TeamManager;
  workerPool: AgentWorkerPool;
  workflowEngine: WorkflowEngine;
  /** Callback khi một task hoàn thành */
  onTaskComplete?: (taskId: string, result: TeamTaskResult) => void;
  /** Callback khi toàn bộ workflow hoàn thành */
  onComplete?: (result: TeamResult) => void;
  /** Signal để abort */
  signal: AbortSignal;
};

export class ParallelExecutor {
  private running = new Set<string>(); // task IDs đang chạy
  private completed = new Map<string, TeamTaskResult>();
  private startedAt = Date.now();

  constructor(private options: ParallelExecutorOptions) {}

  /**
   * Chạy toàn bộ workflow đến khi hoàn thành.
   * Main loop:
   *   1. Lấy runnable tasks từ workflowEngine
   *   2. Với mỗi task: acquire worker → execute → release worker → update workflow
   *   3. Lặp lại cho đến khi tất cả tasks hoàn thành hoặc bị abort
   */
  async executeAll(): Promise<TeamResult> {
    const { teamManager, workerPool, workflowEngine, signal } = this.options;

    while (!workflowEngine.isComplete()) {
      if (signal.aborted) {
        break;
      }

      const runnable = workflowEngine.getRunnableTasks(
        workerPool.getTotalCount() - workerPool.getBusyCount()
      );

      if (runnable.length === 0) {
        // Không có task nào sẵn sàng — đợi workers đang chạy
        if (this.running.size === 0) {
          // Deadlock detection: có pending tasks nhưng không runnable và không có worker đang chạy
          break;
        }
        // Polling delay
        await this.delay(500);
        continue;
      }

      // Dispatch tasks concurrently
      const promises = runnable.map((task) => this.executeSingleTask(task));
      await Promise.all(promises);
    }

    return this.buildResult();
  }

  private async executeSingleTask(task: TeamTask): Promise<void> {
    const { teamManager, workerPool, workflowEngine, signal } = this.options;

    // Đợi worker available
    let worker = workerPool.acquireWorker();
    while (!worker && !signal.aborted) {
      await this.delay(200);
      worker = workerPool.acquireWorker();
    }
    if (!worker || signal.aborted) return;

    // Mark task as running
    const workerName = this.getWorkerName(worker, workerPool);
    workflowEngine.onTaskStart(task.id, workerName);
    teamManager.updateWorker(this.options.teamId, workerName, {
      status: "busy",
      currentTaskId: task.id,
    });
    teamManager.upsertTask(this.options.teamId, task);
    this.running.add(task.id);

    try {
      const { result } = await workerPool.executeWithWorker(task, worker);
      workflowEngine.onTaskComplete(task.id, result);
      this.completed.set(task.id, result);
      this.options.onTaskComplete?.(task.id, result);

      teamManager.updateWorker(this.options.teamId, workerName, {
        status: "idle",
        currentTaskId: undefined,
        tasksCompleted: result.ok
          ? (teamManager.getTeam(this.options.teamId)?.workers.get(workerName)?.tasksCompleted ?? 0) + 1
          : undefined,
        tasksFailed: !result.ok
          ? (teamManager.getTeam(this.options.teamId)?.workers.get(workerName)?.tasksFailed ?? 0) + 1
          : undefined,
      });
    } catch (error) {
      workflowEngine.onTaskComplete(task.id, {
        ok: false,
        summary: "",
        artifacts: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        durationMs: 0,
        workerSessionId: "",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      workerPool.releaseWorker(worker);
      this.running.delete(task.id);
      teamManager.upsertTask(this.options.teamId, task);
    }
  }

  private buildResult(): TeamResult {
    const { workflowEngine } = this.options;
    const counts = workflowEngine.countByStatus();
    const tasks = workflowEngine.getAllTasks();

    const taskResults: Record<string, TeamTaskResult> = {};
    let totalInput = 0, totalOutput = 0, totalTokens = 0;

    for (const task of tasks) {
      if (task.result) {
        taskResults[task.id] = task.result;
        totalInput += task.result.usage.inputTokens;
        totalOutput += task.result.usage.outputTokens;
        totalTokens += task.result.usage.totalTokens;
      }
    }

    return {
      teamId: this.options.teamId,
      status: counts.failed > 0 ? (counts.completed > 0 ? "partial" : "failed") : "completed",
      totalTasks: tasks.length,
      completedTasks: counts.completed,
      failedTasks: counts.failed,
      taskResults,
      totalDurationMs: Date.now() - this.startedAt,
      totalUsage: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalTokens,
      },
      executiveSummary: [
        `Team completed ${counts.completed}/${tasks.length} tasks`,
        counts.failed > 0 ? `(${counts.failed} failed)` : "",
        `in ${Math.round((Date.now() - this.startedAt) / 1000)}s`,
        `using ${totalTokens} tokens`,
      ].join(" "),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getWorkerName(worker: any, pool: AgentWorkerPool): string {
    // TODO: implement proper name lookup
    return "unknown";
  }
}
```

## 4.2 Result Aggregator (`src/team/result-aggregator.ts`)

```typescript
import type { TeamTaskResult, TeamResult, TeamArtifact } from "./types";

export class ResultAggregator {
  /**
   * Merge kết quả từ nhiều tasks thành một báo cáo tổng hợp.
   * Xử lý conflict: nếu 2 task cùng sửa 1 file, ưu tiên task hoàn thành sau.
   */
  aggregate(taskResults: Record<string, TeamTaskResult>): {
    summary: string;
    allArtifacts: TeamArtifact[];
    conflicts: string[];
  } {
    const allArtifacts: TeamArtifact[] = [];
    const conflicts: string[] = [];
    const fileLastModifiedBy = new Map<string, string>();

    const summaries: string[] = [];
    let index = 1;

    for (const [taskId, result] of Object.entries(taskResults)) {
      if (!result.ok) continue;

      summaries.push(`${index}. ${result.summary}`);
      index++;

      for (const artifact of result.artifacts) {
        if (artifact.type === "file" && artifact.path) {
          const existing = fileLastModifiedBy.get(artifact.path);
          if (existing && existing !== taskId) {
            conflicts.push(`File conflict: "${artifact.path}" modified by both ${existing} and ${taskId}`);
          }
          fileLastModifiedBy.set(artifact.path, taskId);
        }
        allArtifacts.push(artifact);
      }
    }

    return {
      summary: summaries.join("\n") || "(no tasks completed successfully)",
      allArtifacts,
      conflicts,
    };
  }
}
```

## 4.3 File Conflict Resolver (`src/team/file-conflict-resolver.ts`)

```typescript
import * as fs from "fs";
import type { TeamTask } from "./types";

export type ConflictResolutionStrategy = "last-write-wins" | "fail-on-conflict" | "merge-attempt";

export class FileConflictResolver {
  private strategy: ConflictResolutionStrategy;
  private fileLocks: Map<string, string> = new Map(); // filePath → taskId

  constructor(strategy: ConflictResolutionStrategy = "last-write-wins") {
    this.strategy = strategy;
  }

  /**
   * Kiểm tra xem file có đang bị lock bởi task khác không.
   * Trả về true nếu có thể lock, false nếu conflict.
   */
  acquireLock(filePath: string, taskId: string): boolean {
    const existing = this.fileLocks.get(filePath);
    if (existing && existing !== taskId) {
      if (this.strategy === "fail-on-conflict") {
        return false;
      }
      // last-write-wins: override lock
    }
    this.fileLocks.set(filePath, taskId);
    return true;
  }

  /** Release lock */
  releaseLock(filePath: string, taskId: string): void {
    if (this.fileLocks.get(filePath) === taskId) {
      this.fileLocks.delete(filePath);
    }
  }

  /** Kiểm tra conflict giữa các tasks trước khi dispatch */
  detectConflicts(tasks: TeamTask[]): string[] {
    const conflicts: string[] = [];
    const fileToTasks = new Map<string, string[]>();

    for (const task of tasks) {
      for (const file of task.relatedFiles ?? []) {
        if (!fileToTasks.has(file)) {
          fileToTasks.set(file, []);
        }
        fileToTasks.get(file)!.push(task.id);
      }
    }

    for (const [file, taskIds] of fileToTasks) {
      if (taskIds.length > 1) {
        conflicts.push(`"${file}" is targeted by tasks: ${taskIds.join(", ")}`);
      }
    }

    return conflicts;
  }
}
```

### Test Plan (Phase 4)

**File: `src/tests/team/parallel-executor.test.ts`**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkflowEngine } from "../../team/workflow-engine";
import { ParallelExecutor } from "../../team/parallel-executor";
import { TeamManager } from "../../team/team-manager";
import type { TeamTask, TeamTaskResult } from "../../team/types";

function makeFakePool(behavior: "success" | "fail" | "mixed") {
  return {
    acquireWorker: () => ({ name: "fake-worker" }),
    releaseWorker: () => {},
    executeWithWorker: async (_task: TeamTask, _worker: any) => {
      if (behavior === "fail") {
        return { result: makeFailResult(), worker: _worker };
      }
      if (behavior === "mixed" && _task.id === "task-b") {
        return { result: makeFailResult(), worker: _worker };
      }
      return { result: makeSuccessResult(), worker: _worker };
    },
    getTotalCount: () => 2,
    getBusyCount: () => 0,
    hasAvailable: () => true,
    interruptAll: () => {},
    disposeAll: () => {},
  };
}

function makeSuccessResult(): TeamTaskResult {
  return {
    ok: true, summary: "done", artifacts: [],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    durationMs: 1000, workerSessionId: "s1",
  };
}

function makeFailResult(): TeamTaskResult {
  return {
    ok: false, summary: "failed", artifacts: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    durationMs: 500, workerSessionId: "s1", error: "test error",
  };
}

function makeTask(id: string, desc: string, deps: string[] = []): TeamTask {
  return { id, description: desc, status: "pending", dependencies: deps, priority: 0, createdAt: new Date().toISOString() };
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
      workerPool: makeFakePool("success") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.equal(result.status, "completed");
    assert.equal(result.totalTasks, 3);
    assert.equal(result.completedTasks, 3);
  });

  it("xử lý partial failure", async () => {
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
      workerPool: makeFakePool("mixed") as any,
      workflowEngine: workflow,
      signal: new AbortController().signal,
    });

    const result = await executor.executeAll();
    assert.equal(result.status, "partial"); // some completed, some failed
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
      ...makeFakePool("success"),
      executeWithWorker: async () => {
        await new Promise(r => setTimeout(r, 2000));
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

    setTimeout(() => controller.abort(), 100);
    const result = await executor.executeAll();
    // Should exit early, not all tasks completed
    assert.ok(result.totalTasks >= 1);
  });
});
```

**File: `src/tests/team/result-aggregator.test.ts`**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ResultAggregator } from "../../team/result-aggregator";
import type { TeamTaskResult } from "../../team/types";

describe("ResultAggregator", () => {
  const aggregator = new ResultAggregator();

  it("gộp kết quả từ nhiều tasks", () => {
    const results: Record<string, TeamTaskResult> = {
      "t1": { ok: true, summary: "Built API", artifacts: [
        { type: "file", path: "src/api.ts", content: "" },
      ], usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, durationMs: 1000, workerSessionId: "s1" },
      "t2": { ok: true, summary: "Built UI", artifacts: [
        { type: "file", path: "src/App.tsx", content: "" },
      ], usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 }, durationMs: 2000, workerSessionId: "s2" },
    };

    const result = aggregator.aggregate(results);
    assert.ok(result.summary.includes("Built API"));
    assert.ok(result.summary.includes("Built UI"));
    assert.equal(result.allArtifacts.length, 2);
    assert.equal(result.conflicts.length, 0);
  });

  it("phát hiện file conflict", () => {
    const results: Record<string, TeamTaskResult> = {
      "t1": { ok: true, summary: "Edit auth", artifacts: [
        { type: "file", path: "src/auth.ts", content: "" },
      ], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 0, workerSessionId: "s1" },
      "t2": { ok: true, summary: "Edit auth too", artifacts: [
        { type: "file", path: "src/auth.ts", content: "" },
      ], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 0, workerSessionId: "s2" },
    };

    const result = aggregator.aggregate(results);
    assert.equal(result.conflicts.length, 1);
    assert.ok(result.conflicts[0].includes("src/auth.ts"));
  });

  it("bỏ qua failed tasks", () => {
    const results: Record<string, TeamTaskResult> = {
      "t1": { ok: false, summary: "Failed", artifacts: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, durationMs: 0, workerSessionId: "s1", error: "err" },
    };

    const result = aggregator.aggregate(results);
    assert.equal(result.allArtifacts.length, 0);
    assert.ok(result.summary.includes("no tasks completed"));
  });
});
```

**File: `src/tests/team/file-conflict-resolver.test.ts`**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FileConflictResolver } from "../../team/file-conflict-resolver";
import type { TeamTask } from "../../team/types";

describe("FileConflictResolver", () => {
  it("last-write-wins: cho phép override lock", () => {
    const resolver = new FileConflictResolver("last-write-wins");
    assert.equal(resolver.acquireLock("src/file.ts", "task-1"), true);
    // task-2 override lock của task-1
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
      { id: "t1", description: "", status: "pending", dependencies: [], relatedFiles: ["src/a.ts", "src/b.ts"], createdAt: "" },
      { id: "t2", description: "", status: "pending", dependencies: [], relatedFiles: ["src/b.ts", "src/c.ts"], createdAt: "" },
    ];
    const conflicts = resolver.detectConflicts(tasks);
    assert.equal(conflicts.length, 1); // src/b.ts bị conflict
    assert.ok(conflicts[0].includes("src/b.ts"));
    assert.ok(conflicts[0].includes("t1"));
    assert.ok(conflicts[0].includes("t2"));
  });

  it("detectConflicts không có conflict khi files khác nhau", () => {
    const resolver = new FileConflictResolver();
    const tasks: TeamTask[] = [
      { id: "t1", description: "", status: "pending", dependencies: [], relatedFiles: ["src/a.ts"], createdAt: "" },
      { id: "t2", description: "", status: "pending", dependencies: [], relatedFiles: ["src/b.ts"], createdAt: "" },
    ];
    assert.equal(resolver.detectConflicts(tasks).length, 0);
  });
});
```

---

# Phase 5: Tmux / Dmux Integration

## 5.1 Abstract Terminal Multiplexer (`src/team/integrations/terminal-multiplexer.ts`)

```typescript
export interface TerminalMultiplexer {
  /** Tạo session mới */
  createSession(name: string, cwd: string): Promise<void>;
  /** Tạo pane mới và chạy command */
  createPane(sessionName: string, command: string, cwd: string): Promise<string>;
  /** Gửi command tới pane đang chạy */
  sendCommand(paneId: string, command: string): Promise<void>;
  /** Đọc output từ pane */
  capturePane(paneId: string): Promise<string>;
  /** Kill session */
  killSession(sessionName: string): Promise<void>;
  /** Attach vào session (blocking) */
  attachSession?(sessionName: string): Promise<void>;
  /** Kiểm tra multiplexer có available không */
  isAvailable(): Promise<boolean>;
}
```

## 5.2 Tmux Manager (`src/team/integrations/tmux-manager.ts`)

```typescript
import { execSync, spawn } from "child_process";
import type { TerminalMultiplexer } from "./terminal-multiplexer";

export class TmuxManager implements TerminalMultiplexer {
  async isAvailable(): Promise<boolean> {
    try {
      execSync("tmux -V", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async createSession(name: string, cwd: string): Promise<void> {
    await this.exec(`tmux new-session -d -s "${name}" -c "${cwd}"`);
  }

  async createPane(sessionName: string, command: string, cwd: string): Promise<string> {
    const paneIndex = await this.getPaneCount(sessionName);
    // Split window và gửi command
    const cmd = `tmux split-window -t "${sessionName}" -c "${cwd}" "clear; echo '=== Worker starting ==='; ${command}; exec $SHELL"`;
    await this.exec(cmd);
    // Pane ID được xác định bởi index
    return `${sessionName}:0.${paneIndex}`;
  }

  async sendCommand(paneId: string, command: string): Promise<void> {
    await this.exec(`tmux send-keys -t "${paneId}" "${this.escapeCommand(command)}" Enter`);
  }

  async capturePane(paneId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execSync(`tmux capture-pane -t "${paneId}" -p`, {
        encoding: "utf8",
        timeout: 5000,
      });
    });
  }

  async killSession(sessionName: string): Promise<void> {
    try {
      await this.exec(`tmux kill-session -t "${sessionName}"`);
    } catch {
      // Session might already be dead
    }
  }

  async attachSession(sessionName: string): Promise<void> {
    // Spawn interactive attach (blocking)
    const child = spawn("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit",
    });
    return new Promise((resolve) => {
      child.on("exit", () => resolve());
    });
  }

  async selectLayout(sessionName: string, layout: string): Promise<void> {
    await this.exec(`tmux select-layout -t "${sessionName}" "${layout}"`);
  }

  async listPanes(sessionName: string): Promise<string[]> {
    const output = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_id}"`, {
      encoding: "utf8",
    });
    return output.trim().split("\n").filter(Boolean);
  }

  private async exec(command: string): Promise<string> {
    return execSync(command, { encoding: "utf8", timeout: 10000 });
  }

  private async getPaneCount(sessionName: string): Promise<number> {
    try {
      const output = execSync(`tmux list-panes -t "${sessionName}"`, { encoding: "utf8" });
      return output.trim().split("\n").length;
    } catch {
      return 0; // Session might have no panes yet
    }
  }

  private escapeCommand(command: string): string {
    // Escape special characters for tmux send-keys
    return command.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/;/g, "\\;");
  }
}
```

## 5.3 Dmux Adapter (`src/team/integrations/dmux-adapter.ts`)

```typescript
import { TmuxManager } from "./tmux-manager";
import type { TerminalMultiplexer } from "./terminal-multiplexer";

/**
 * DmuxAdapter wraps TmuxManager để tương thích với dmux naming conventions.
 * Dmux là tmux pane manager for AI agents — sử dụng naming convention riêng.
 */
export class DmuxAdapter implements TerminalMultiplexer {
  constructor(private tmux: TmuxManager) {}

  async isAvailable(): Promise<boolean> {
    return this.tmux.isAvailable();
  }

  async createSession(name: string, cwd: string): Promise<void> {
    // Dmux convention: session name prefix
    return this.tmux.createSession(`dmux-${name}`, cwd);
  }

  async createPane(sessionName: string, command: string, cwd: string): Promise<string> {
    return this.tmux.createPane(`dmux-${sessionName}`, command, cwd);
  }

  async sendCommand(paneId: string, command: string): Promise<void> {
    return this.tmux.sendCommand(paneId, command);
  }

  async capturePane(paneId: string): Promise<string> {
    return this.tmux.capturePane(paneId);
  }

  async killSession(sessionName: string): Promise<void> {
    return this.tmux.killSession(`dmux-${sessionName}`);
  }

  async writeState(sessionName: string, state: Record<string, unknown>): Promise<void> {
    // Dmux state file format: JSON file in /tmp/dmux-{session}.json
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const statePath = path.join(os.tmpdir(), `dmux-${sessionName}.json`);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  async readState(sessionName: string): Promise<Record<string, unknown> | null> {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");
      const statePath = path.join(os.tmpdir(), `dmux-${sessionName}.json`);
      if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, "utf8"));
      }
    } catch {}
    return null;
  }
}
```

### Test Plan (Phase 5)

**File: `src/tests/team/tmux-manager.test.ts`** — Test với mock child_process (không cần tmux thật)
**File: `src/tests/team/dmux-adapter.test.ts`** — Test state file read/write

---

# Phase 6: Team Orchestrator & Coordinator

## 6.1 Team Orchestrator (`src/team/team-orchestrator.ts`)

Đây là entry point chính — kết nối tất cả các thành phần.

```typescript
import { TeamManager } from "./team-manager";
import { AgentWorkerPool } from "./agent-worker-pool";
import { TaskDecomposer } from "./task-decomposer";
import { WorkflowEngine } from "./workflow-engine";
import { ParallelExecutor } from "./parallel-executor";
import { ResultAggregator } from "./result-aggregator";
import { FileConflictResolver } from "./file-conflict-resolver";
import { TmuxManager } from "./integrations/tmux-manager";
import { DmuxAdapter } from "./integrations/dmux-adapter";
import type { TerminalMultiplexer } from "./integrations/terminal-multiplexer";
import type {
  TeamDefinition, TeamSession, TeamTask, TeamResult,
  TeamExecutionMode, TeamWorkerEvent, TeamUIEvent,
} from "./types";
import type { CreateOpenAIClient } from "../tools/executor";
import type { McpServerConfig, PermissionSettings } from "../settings";
import * as os from "os";

export type TeamOrchestratorOptions = {
  projectRoot: string;
  createOpenAIClient: CreateOpenAIClient;
  mcpServers?: Record<string, McpServerConfig>;
  permissions?: Required<PermissionSettings>;
  enabledSkills?: Record<string, boolean>;
  renderMarkdown: (text: string) => string;
  onUIEvent?: (event: TeamUIEvent) => void;
};

export class TeamOrchestrator {
  private teamManager = new TeamManager();
  private taskDecomposer = new TaskDecomposer();
  private resultAggregator = new ResultAggregator();
  private fileConflictResolver = new FileConflictResolver();
  private activeSession: TeamSession | null = null;
  private workerPool: AgentWorkerPool | null = null;
  private mux: TerminalMultiplexer | null = null;

  constructor(private options: TeamOrchestratorOptions) {}

  /**
   * Execute một task với team.
   * Flow:
   *   1. Nhận task description từ user
   *   2. Tạo team definition (coordinator + N workers)
   *   3. Gọi coordinator LLM để phân tích task
   *   4. Decompose task thành sub-tasks
   *   5. Build DAG workflow
   *   6. Dispatch workers theo DAG
   *   7. Aggregate results
   *   8. Trả về TeamResult
   */
  async executeTask(
    description: string,
    teamDef?: Partial<TeamDefinition>
  ): Promise<TeamResult> {
    const definition: TeamDefinition = {
      name: teamDef?.name ?? `team-${Date.now()}`,
      coordinator: teamDef?.coordinator ?? {
        name: "coordinator",
        role: "coordinator",
        description: "Task coordinator and decomposer",
      },
      workers: teamDef?.workers ?? this.defaultWorkers(),
      maxParallelWorkers: teamDef?.maxParallelWorkers ?? Math.max(1, os.cpus().length - 1),
      strategy: teamDef?.strategy ?? "dependency-order",
      mode: teamDef?.mode ?? "internal",
      maxRetriesPerTask: teamDef?.maxRetriesPerTask ?? 0,
    };

    // 1. Tạo team session
    const session = this.teamManager.createTeam(definition);
    this.activeSession = session;

    // 2. Setup multiplexer nếu cần
    if (definition.mode === "tmux" || definition.mode === "dmux") {
      await this.setupMultiplexer(definition.mode, session);
    }

    // 3. Decompose task
    this.teamManager.updateTeamStatus(session.teamId, "waiting_for_decomposition");
    const tasks = await this.taskDecomposer.decompose(description, {
      createOpenAIClient: this.options.createOpenAIClient,
    });

    // 4. Build workflow
    const workflow = new WorkflowEngine();
    workflow.addTasks(tasks);
    for (const task of tasks) {
      this.teamManager.upsertTask(session.teamId, task);
    }

    // 5. Detect file conflicts
    const conflicts = this.fileConflictResolver.detectConflicts(tasks);
    if (conflicts.length > 0 && this.options.onUIEvent) {
      this.options.onUIEvent({
        type: "team_status_change",
        teamId: session.teamId,
        data: { conflicts },
        timestamp: new Date().toISOString(),
      });
    }

    // 6. Khởi tạo worker pool
    const maxConcurrency = definition.maxParallelWorkers ?? 4;
    this.workerPool = new AgentWorkerPool({
      projectRoot: this.options.projectRoot,
      maxConcurrency,
      baseWorkerOptions: {
        projectRoot: this.options.projectRoot,
        createOpenAIClient: this.options.createOpenAIClient,
        mcpServers: this.options.mcpServers,
        permissions: this.options.permissions,
        enabledSkills: this.options.enabledSkills,
        renderMarkdown: this.options.renderMarkdown,
        onWorkerEvent: (event) => this.handleWorkerEvent(event),
      },
    });
    await this.workerPool.initializeAll(definition.workers);

    // 7. Chạy parallel executor
    this.teamManager.updateTeamStatus(session.teamId, "running");
    const executor = new ParallelExecutor({
      teamId: session.teamId,
      teamManager: this.teamManager,
      workerPool: this.workerPool,
      workflowEngine: workflow,
      signal: session.abortController.signal,
      onTaskComplete: (taskId, result) => {
        this.options.onUIEvent?.({
          type: "task_update",
          teamId: session.teamId,
          data: { taskId, result },
          timestamp: new Date().toISOString(),
        });
      },
    });

    const result = await executor.executeAll();

    // 8. Finalize
    this.teamManager.updateTeamStatus(
      session.teamId,
      result.status === "completed" ? "completed" : "failed"
    );

    // 9. Cleanup
    this.workerPool.disposeAll();
    if (this.mux) {
      await this.mux.killSession(`anng-${session.teamId}`);
    }

    this.options.onUIEvent?.({
      type: "team_complete",
      teamId: session.teamId,
      data: result,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /** Interrupt team đang chạy */
  interrupt(): void {
    if (this.activeSession) {
      this.teamManager.interruptTeam(this.activeSession.teamId);
      this.workerPool?.interruptAll();
    }
  }

  /** Lấy trạng thái team hiện tại */
  getStatus(): TeamSession | null {
    return this.activeSession;
  }

  private handleWorkerEvent(event: TeamWorkerEvent): void {
    // Forward lên UI
    this.options.onUIEvent?.({
      type: "worker_update",
      teamId: this.activeSession?.teamId ?? "",
      data: event,
      timestamp: event.timestamp,
    });
  }

  private defaultWorkers() {
    return [
      { name: "worker-1", role: "worker" as const, description: "General purpose worker" },
      { name: "worker-2", role: "worker" as const, description: "General purpose worker" },
    ];
  }

  private async setupMultiplexer(mode: TeamExecutionMode, _session: TeamSession): Promise<void> {
    if (mode === "tmux") {
      const tmux = new TmuxManager();
      if (await tmux.isAvailable()) {
        this.mux = tmux;
      }
    } else if (mode === "dmux") {
      const tmux = new TmuxManager();
      if (await tmux.isAvailable()) {
        this.mux = new DmuxAdapter(tmux);
      }
    }
  }
}
```

### Test Plan (Phase 6)

**File: `src/tests/team/team-orchestrator.test.ts`** — Integration test: mock LLM, mock workers, verify flow

---

# Phase 7: CLI Integration & Skills

## 7.1 CLI Flags (`src/cli.tsx` additions)

Thêm vào phần parse args:

```typescript
// Team orchestration flags
const teamMode = args.includes("--team");
const teamModeValue = extractArgValue(args, "--team-mode") as TeamExecutionMode | undefined;
const teamWorkers = parseInt(extractArgValue(args, "--team-workers") ?? "4", 10);
const teamTmux = args.includes("--tmux");

// Pass vào App:
<AppContainer
  // ... existing props
  teamMode={teamMode}
  teamConfig={{
    mode: teamTmux ? "tmux" : (teamModeValue ?? "internal"),
    maxParallelWorkers: teamWorkers,
  }}
/>
```

Thêm vào `--help`:
```
  anng --team -p <prompt>               Team mode: dispatch task to multiple agents
  anng --team --tmux -p <prompt>        Team mode with tmux visual panels
  anng --team --team-workers 8 -p <...>  Team mode with 8 parallel workers
```

## 7.2 Settings Integration (`src/settings.ts` additions)

Thêm vào `DeepcodingSettings`:
```typescript
export type DeepcodingSettings = {
  // ... existing fields
  team?: TeamSettings;  // NEW
};
```

## 7.3 Permission Scope (`src/common/permissions.ts`)

Thêm scope mới vào `PermissionScope`:
```typescript
export type PermissionScope =
  | "read-in-cwd"
  | "read-out-cwd"
  // ... existing
  | "team";  // NEW: Cho phép team orchestration operations
```

## 7.4 Slash Commands (`src/ui/views/PromptInput.tsx`)

Thêm `/team` command handler:
```typescript
case "/team":
  if (parts[1] === "create") {
    // Mở prompt để user nhập team config
    return { type: "team_create" };
  } else if (parts[1] === "status") {
    // Hiển thị trạng thái team hiện tại
    return { type: "team_status" };
  } else if (parts[1] === "kill") {
    // Kill team hiện tại
    return { type: "team_kill" };
  }
  // Default: mở team menu
  return { type: "team_menu" };
```

## 7.5 Built-in Skills (SKILL.md format — khớp pattern templates/skills/)

### Skill: `team-orchestration` (`src/team/skills/team-orchestration.md`)

```markdown
---
name: team-orchestration
description: Orchestrate multi-agent teams for complex software engineering tasks. Decompose large tasks into parallel sub-tasks, dispatch to specialized worker agents, aggregate results. Use when the user asks to build, refactor, or implement something large enough to benefit from parallel execution, mentions "team mode", "parallel agents", "multi-agent", or when a task spans multiple independent modules.
---

# Team Orchestration

Use this skill to orchestrate multi-agent teams for complex tasks.

## When to use

- Use when the task can be decomposed into independent sub-tasks
- Use when speed matters and parallel execution helps
- Use when the task spans multiple files/modules that don't depend on each other
- Do not use for simple single-file changes or tightly-coupled refactors
- Do not use when the user explicitly wants sequential execution

## Workflow

1. **Analyze** the user's request. If the task is large and parallelizable, propose team mode.
2. **Decompose** the task using `TaskDecomposer` — break into sub-tasks with dependencies.
3. **Configure** the team — choose number of workers, models, and dispatch strategy.
4. **Execute** via `TeamOrchestrator.executeTask()`.
5. **Monitor** progress via team status updates.
6. **Report** results with executive summary, completion stats, and any conflicts.

## Team Configuration

### Worker Count
- Default: `os.cpus().length - 1` (minimum 2)
- More workers = faster completion but higher API cost
- Fewer workers = lower cost, simpler coordination

### Model Selection
- Coordinator: `deepseek-v4-pro` (strong reasoning for decomposition)
- Workers: `deepseek-v4-flash` (fast, cheap for focused tasks)

### Dispatch Strategy
- `dependency-order` (default): Respect DAG, maximize parallelism
- `round-robin`: Distribute evenly regardless of skill
- `skill-match`: Match task to worker based on description
- `llm-route`: Coordinator decides best worker per task

## Rules

- Always run file conflict detection before dispatching
- Never assign two workers to the same file simultaneously
- If a worker fails, mark dependent tasks as skipped
- Always aggregate results and report conflicts
- If team mode is unavailable, fall back to sequential execution
```

### Skill: `subagent-driven-development` (`src/team/skills/subagent-driven-development.md`)

```markdown
---
name: subagent-driven-development
description: Break complex development tasks into parallel sub-tasks executed by multiple AI agents simultaneously. Use for multi-file refactors, feature implementation across services, or any task with independent work units that can run concurrently.
metadata:
  allow-implicit-invocation: false
---

# Subagent-Driven Development

Execute development tasks by decomposing them into parallel sub-tasks that multiple AI agents can work on simultaneously.

## When to use

- Use when the task spans 3+ independent files or modules
- Use when you need to implement a feature across backend + frontend simultaneously
- Use when running a large refactor with predictable changes
- Do not use for tightly-coupled changes where order matters
- Do not use for tasks smaller than ~5 tool calls total

## Workflow

1. **Identify** independent work units in the task
2. **Define** sub-tasks with clear boundaries and expected outputs
3. **Detect** file conflicts — if two sub-tasks touch the same file, sequence them
4. **Dispatch** sub-tasks to worker agents
5. **Collect** results and verify each sub-task completed successfully
6. **Integrate** — if any sub-task failed, report and suggest manual intervention

## Sub-Task Definition

Each sub-task must have:
- Clear description of what to build/change
- Expected output (files, tests, documentation)
- Dependencies (which sub-tasks must complete first)
- Estimated file paths (for conflict detection)

## Integration Check

After all sub-tasks complete:
1. Verify all modified files are consistent
2. Run the full test suite
3. Check for merge conflicts between sub-task outputs
4. Report any integration issues

## Rules

- One sub-task = one bounded piece of work
- Maximum 8 sub-tasks per decomposition
- Maximum 4 workers by default
- Always run full test suite after integration
- Report partial success if some sub-tasks fail
```

---

# Execution Order & Dependencies

```
Phase 1: Types + TeamManager ─────────────────────────────┐
  (không phụ thuộc gì)                                     │
                                                           │
Phase 2: AgentWorker + WorkerPool ─────────────────────────┤
  (phụ thuộc Phase 1 types, SessionManager)                │
                                                           │
Phase 3: TaskDecomposer + WorkflowEngine ──────────────────┤
  (phụ thuộc Phase 1 types, CreateOpenAIClient)            │
                                                           │
Phase 4: ParallelExecutor + ResultAggregator + Conflict ───┤
  (phụ thuộc Phase 1+2+3)                                  │
                                                           │
Phase 5: Tmux + Dmux ──────────────────────────────────────┤
  (độc lập, có thể làm song song với Phase 2-3-4)         │
                                                           │
Phase 6: TeamOrchestrator ─────────────────────────────────┤
  (phụ thuộc tất cả Phase 1-5)                             │
                                                           │
Phase 7: CLI + Settings + Skills ──────────────────────────┘
  (phụ thuộc Phase 6, có thể bắt đầu sớm)
```

---

# Test Strategy

## Test Infrastructure
- **Runner:** `node --import tsx --test --test-concurrency=4` (giống hiện tại)
- **Test files:** 12 files trong `src/tests/team/`
- **Update run-tests.mjs:** glob pattern thêm `src/tests/team/*.test.ts`

## Test Categories

| Category | Files | Approach |
|----------|-------|----------|
| **Unit - Types** | `types.test.ts` | Zod validation, type guards |
| **Unit - TeamManager** | `team-manager.test.ts` | CRUD operations, state transitions |
| **Unit - WorkflowEngine** | `workflow-engine.test.ts` | DAG topology, dependency resolution |
| **Unit - ConflictResolver** | `file-conflict-resolver.test.ts` | Lock strategies, conflict detection |
| **Unit - ResultAggregator** | `result-aggregator.test.ts` | Merge logic, conflict reporting |
| **Integration - AgentWorker** | `agent-worker.test.ts` | Mock SessionManager, verify executeTask flow |
| **Integration - WorkerPool** | `agent-worker-pool.test.ts` | Acquire/release, concurrency limits |
| **Integration - TaskDecomposer** | `task-decomposer.test.ts` | Mock OpenAI client, verify decomposition output |
| **Integration - ParallelExecutor** | `parallel-executor.test.ts` | Mock workers, verify parallel dispatch |
| **Integration - TeamOrchestrator** | `team-orchestrator.test.ts` | End-to-end with mocks |
| **Integration - Tmux** | `tmux-manager.test.ts` | Mock child_process, command generation |
| **Integration - Dmux** | `dmux-adapter.test.ts` | State file read/write, naming convention |

---

# Risk Assessment & Mitigation

| Risk | Severity | Mitigation | Code Pattern |
|------|----------|------------|--------------|
| **API rate limiting** — N workers × stream requests | **Critical** | Key rotation per worker (đã có `KeyRotator`); configurable `maxParallelWorkers`; exponential backoff trong worker pool | `createOpenAIClient` per worker instance |
| **File conflict** — 2 workers edit cùng file | **Critical** | `FileConflictResolver` với 3 strategy; `GitFileHistory` checkpoint trước mỗi mutation (đã có) | `recordCheckpoint()` trước write |
| **Token cost explosion** — Mỗi worker có system prompt + context riêng | **High** | `task-decomposer` tối ưu decomposition thành ít sub-tasks nhất; cost estimation trước khi execute | Budget tracking per `TeamSession` |
| **Context window** — Mỗi worker compaction độc lập | **Medium** | `shouldCompactContext()` đã có — mỗi worker tự compact; context ngắn hơn vì task nhỏ hơn | `compacter.ts` per SessionManager |
| **Worker hang** — Một worker stuck infinite loop | **Medium** | `taskTimeoutMs` config; `maxTurns` per worker (default 25); `AbortController` pattern | Timeout trong `executeTask()` |
| **Race condition** — Concurrent file read/write | **Medium** | `FileConflictResolver.acquireLock()` trước mutation; optimistic locking với version check (đã có `hasFileChangedSinceState()`) | Lock + version check |
| **Tmux unavailable** — Windows/missing tmux | **Low** | `TmuxManager.isAvailable()` check; graceful fallback to `internal` mode | `setupMultiplexer()` try/catch |
| **Deadlock** — Tất cả workers busy, task pending có deps chưa complete | **Low** | `WorkflowEngine` detection: nếu `runnable.length === 0` và `running.size === 0` và `!isComplete()` → report deadlock | Deadlock detection trong `ParallelExecutor` |
| **Memory leak** — Workers không được dispose | **Low** | `WeakRef` + `FinalizationRegistry`; `dispose()` trong `finally` block; cleanup trong `TeamManager.disposeTeam()` | RAII pattern với try/finally |

---

# Execution Modes

## Mode 1: Internal (Default)
```bash
anng --team -p "refactor entire codebase to TypeScript strict mode"
```
- Workers chạy trong cùng process
- Output hiển thị qua `onUIEvent` callback → Ink components
- Không cần dependency ngoài

## Mode 2: Tmux Visual
```bash
anng --team --tmux -p "build auth + api + frontend simultaneously"
```
- Mỗi worker trong 1 tmux pane
- Coordinator ở pane trên cùng
- User có thể attach: `tmux attach -t anng-team-{uuid}`
- Layout:
```
┌──────────────────────────────────────┐
│         Coordinator (pane 0)         │
├──────────────────┬───────────────────┤
│   Worker 1       │    Worker 2       │
├──────────────────┼───────────────────┤
│   Worker 3       │    Worker 4       │
└──────────────────┴───────────────────┘
```

## Mode 3: Dmux Compatible
```bash
anng --team --dmux -p "run full CI pipeline"
```
- Sử dụng dmux naming convention
- State file JSON trong `/tmp/dmux-{session}.json`

## Mode 4: Headless (CI/CD)
```bash
anng --team --yolo --output team-result.json -p "process task queue"
```
- Không interactive
- Output JSON ra file
- Tự động accept tất cả permissions

---

# Config Schema (settings.json)

```json
{
  "team": {
    "defaultMode": "internal",
    "maxParallelWorkers": 4,
    "defaultStrategy": "dependency-order",
    "tmux": {
      "sessionName": "anng-team",
      "layout": "tiled",
      "autoAttach": false
    },
    "workerDefaults": {
      "model": "deepseek-v4-flash",
      "maxTurns": 30,
      "taskTimeoutMs": 600000,
      "maxRetriesPerTask": 1
    }
  }
}
```

---

# Success Metrics (Đo lường)

| Metric | Target | Cách đo |
|--------|--------|---------|
| **Completion rate** | ≥90% tasks completed | `TeamResult.completedTasks / totalTasks` |
| **Speedup vs sequential** | 2-4× cho parallelizable tasks | Compare `totalDurationMs` với sequential |
| **Cost accuracy** | Estimate ≤ ±20% thực tế | Compare `estimatedCost` vs `totalUsage` |
| **Reliability** | Team tiếp tục khi 1 worker fail | `TeamResult.status === "partial"` thay vì `"failed"` |
| **Test coverage** | ≥80% | `--experimental-test-coverage` |
| **No regression** | Tất cả 43 test files hiện có vẫn pass | `npm test` |

---

# Milestones & Deliverables

| Milestone | Deliverables | Validation |
|-----------|-------------|------------|
| **M1: Core Types + TeamManager** | `types.ts`, `team-manager.ts`, `types.test.ts`, `team-manager.test.ts` | 8/8 unit tests pass |
| **M2: AgentWorker + WorkerPool** | `agent-worker.ts`, `agent-worker-pool.ts`, 2 test files | Worker hoàn thành task với mock SessionManager |
| **M3: Workflow + Decomposer** | `task-decomposer.ts`, `workflow-engine.ts`, 2 test files | DAG 5 tasks, 3 parallel, dependency resolution đúng |
| **M4: Parallel Executor** | `parallel-executor.ts`, `result-aggregator.ts`, `file-conflict-resolver.ts`, 3 test files | 4 workers hoàn thành 8 tasks song song |
| **M5: Tmux + Dmux** | `terminal-multiplexer.ts`, `tmux-manager.ts`, `dmux-adapter.ts`, 2 test files | Tmux session tạo/xóa thành công (mock) |
| **M6: TeamOrchestrator** | `team-orchestrator.ts`, `team-orchestrator.test.ts` | End-to-end: 1 task → decompose → 3 workers → aggregate |
| **M7: CLI + Skills** | Modify `cli.tsx`, `settings.ts`, `permissions.ts`, `PromptInput.tsx`; 2 skill files | `anng --team -p "..."` hoạt động |
| **M8: Release** | Update README, CHANGELOG, bump version | `npm run check && npm test && npm run build` |

---

# Rollback Plan

Nếu có vấn đề nghiêm trọng:
1. Team module nằm trong `src/team/` — hoàn toàn tách biệt, có thể xóa mà không ảnh hưởng code hiện có
2. Các file modify (6 files) đều là optional additions — có thể revert từng file
3. `team` scope trong `PermissionScope` là addition, không phá vỡ existing union
4. CLI flags `--team` là addition, không conflict với flags hiện có

---

# Estimated Effort

| Phase | New Files | Modified Files | Lines (est.) | Test Files |
|-------|-----------|----------------|--------------|------------|
| 1: Core | 2 | 0 | 350 | 1 |
| 2: Workers | 2 | 0 | 400 | 2 |
| 3: Workflow | 2 | 0 | 350 | 2 |
| 4: Executor | 3 | 0 | 450 | 3 |
| 5: Tmux | 3 | 0 | 350 | 2 |
| 6: Orchestrator | 1 | 0 | 300 | 1 |
| 7: CLI | 2 (skills) | 6 | 250 | 0 |
| **Total** | **15** | **6** | **~2,450** | **11** |
