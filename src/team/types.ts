import { z } from "zod";

// ============================================================
// Team Configuration Types
// ============================================================

export type TeamExecutionMode = "internal" | "tmux" | "dmux" | "headless";

export type TeamDispatchStrategy = "round-robin" | "skill-match" | "llm-route" | "dependency-order";

export type WorkerStatus = "idle" | "busy" | "error" | "disposed";

export type TeamStatus =
  | "initializing"
  | "waiting_for_decomposition"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "interrupted";

// ============================================================
// Agent Contract
// ============================================================

export type AgentRole = "coordinator" | "worker" | "reviewer";

export interface AgentContract {
  readonly id: string;
  readonly role: AgentRole;
  readonly authorityLevel: number; // 0 = lowest, 100 = highest
  readonly scope: string[]; // Glob paths this agent is allowed to touch
  readonly allowedCapabilities: string[]; // Which Capability IDs are active
  readonly maxTurns: number; // Prevent infinite loops
}

// ============================================================
// Agent Configuration
// ============================================================

export interface AgentConfig {
  name: string;
  role: AgentRole;
  description?: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  skills?: string[];
  systemPrompt?: string;
  maxTurns?: number;
  taskTimeoutMs?: number;
}

// ============================================================
// Team Definition
// ============================================================

export interface TeamDefinition {
  id?: string;
  name: string;
  coordinator: AgentConfig;
  workers: AgentConfig[];
  maxParallelWorkers?: number;
  strategy?: TeamDispatchStrategy;
  mode?: TeamExecutionMode;
  allowFileSystemAccess?: boolean;
  maxRetriesPerTask?: number;
}

// ============================================================
// Task Types
// ============================================================

export type TeamTaskStatus = "pending" | "assigned" | "running" | "completed" | "failed" | "skipped";

export interface TeamTask {
  id: string;
  parentId?: string;
  description: string;
  assignedTo?: string;
  status: TeamTaskStatus;
  dependencies: string[];
  dependents?: string[];
  priority?: number;
  relatedFiles?: string[];
  result?: TeamTaskResult;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount?: number;
}

export interface TeamArtifact {
  type: "file" | "diff" | "message" | "error";
  path?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface TeamTaskResult {
  ok: boolean;
  summary: string;
  artifacts: TeamArtifact[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  durationMs: number;
  workerSessionId: string;
  error?: string;
}

export interface TeamResult {
  teamId: string;
  status: "completed" | "failed" | "partial";
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  taskResults: Record<string, TeamTaskResult>;
  totalDurationMs: number;
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  executiveSummary: string;
}

// ============================================================
// Team Session Types
// ============================================================

export interface TeamSession {
  teamId: string;
  definition: TeamDefinition;
  status: TeamStatus;
  tasks: Map<string, TeamTask>;
  workers: Map<string, WorkerState>;
  coordinatorSessionId?: string;
  createdAt: string;
  updatedAt: string;
  onStatusChange?: (status: TeamStatus, detail?: string) => void;
  onTaskUpdate?: (taskId: string, task: TeamTask) => void;
  onWorkerUpdate?: (workerName: string, state: WorkerState) => void;
  abortController: AbortController;
}

export interface WorkerState {
  name: string;
  config: AgentConfig;
  status: WorkerStatus;
  currentTaskId?: string;
  sessionId?: string;
  tasksCompleted: number;
  tasksFailed: number;
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

// ============================================================
// Settings Extension
// ============================================================

export interface TeamSettings {
  defaultMode?: TeamExecutionMode;
  tmux?: {
    sessionName?: string;
    layout?: "tiled" | "even-horizontal" | "even-vertical" | "main-vertical";
    autoAttach?: boolean;
  };
  maxParallelWorkers?: number;
  workerDefaults?: {
    model?: string;
    maxTurns?: number;
    taskTimeoutMs?: number;
    maxRetriesPerTask?: number;
  };
  defaultStrategy?: TeamDispatchStrategy;
}

// ============================================================
// Event Types
// ============================================================

export interface TeamWorkerEvent {
  type: "task_started" | "task_completed" | "task_failed" | "worker_error" | "worker_idle";
  workerName: string;
  taskId?: string;
  result?: TeamTaskResult;
  error?: string;
  timestamp: string;
}

export interface TeamUIEvent {
  type: "team_status_change" | "task_update" | "worker_update" | "team_complete";
  teamId: string;
  data: unknown;
  timestamp: string;
}

// ============================================================
// Zod Validation Schemas
// ============================================================

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
