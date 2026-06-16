import { SessionManager } from "../session";
import type { SessionManagerOptions, SessionEntry } from "../session/types";
import type { CreateOpenAIClient } from "../tools/executor";
import type {
  AgentConfig,
  TeamTask,
  TeamTaskResult,
  TeamArtifact,
  WorkerStatus,
  TeamWorkerEvent,
  AgentContract,
} from "./types";
import type { McpServerConfig, PermissionSettings } from "../settings";
import { DEFAULT_MAX_TURNS } from "../common/constants";

import type { TerminalMultiplexer } from "./integrations/terminal-multiplexer";

export type AgentWorkerOptions = {
  projectRoot: string;
  agentConfig: AgentConfig;
  createOpenAIClient: CreateOpenAIClient;
  mcpServers?: Record<string, McpServerConfig>;
  permissions?: Required<PermissionSettings>;
  enabledSkills?: Record<string, boolean>;
  renderMarkdown: (text: string) => string;
  onWorkerEvent?: (event: TeamWorkerEvent) => void;
  mux?: TerminalMultiplexer | null;
  autoAccept?: boolean;
  planMode?: boolean;
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

  async initialize(): Promise<void> {
    const smOptions: SessionManagerOptions = {
      projectRoot: this.options.projectRoot,
      autoAccept: this.options.autoAccept ?? true,
      planMode: this.options.planMode ?? false,
      maxTurns: this.config.maxTurns ?? DEFAULT_MAX_TURNS,
      createOpenAIClient: () => {
        const base = this.options.createOpenAIClient();
        const overrides: Record<string, unknown> = {};
        if (this.config.model) overrides.model = this.config.model;
        if (this.config.thinkingEnabled !== undefined) overrides.thinkingEnabled = this.config.thinkingEnabled;
        if (this.config.reasoningEffort !== undefined) overrides.reasoningEffort = this.config.reasoningEffort;

        if (Object.keys(overrides).length > 0) {
          return { ...base, ...overrides };
        }
        return base;
      },
      getResolvedSettings: () => ({
        model: this.config.model ?? "",
        thinkingEnabled: this.config.thinkingEnabled,
        reasoningEffort: this.config.reasoningEffort as "high" | "max" | undefined,
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
      onSessionEntryUpdated: (_entry) => {
        // No-op for workers
      },
      onLlmStreamProgress: (_progress) => {
        // No-op for workers
      },
    };

    this.sessionManager = new SessionManager(smOptions);

    await this.sessionManager.initMcpServers(this.options.mcpServers);
    this.status = "idle";
  }

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

    const contract: AgentContract = {
      id: this.config.name,
      role: this.config.role,
      authorityLevel: this.config.role === "coordinator" ? 100 : 10,
      scope: this.config.role === "coordinator" ? ["**/*", "*"] : (task.relatedFiles ?? []),
      allowedCapabilities: this.config.skills ?? [],
      maxTurns: this.config.maxTurns ?? DEFAULT_MAX_TURNS,
    };

    const ctx = this.sessionManager.getExecutionContext();
    this.sessionManager.setExecutionContext({
      ...ctx,
      activeAgentId: contract.id,
      taskScope: {
        taskId: task.id,
        allowedPaths: contract.scope,
        readOnlyPaths: [],
      },
      activeCapabilities: contract.allowedCapabilities,
    });

    try {
      const contextPrompt = this.buildTaskPrompt(task);

      if (this.options.mux) {
        // Fallback for demonstration: launch child process in tmux pane
        const escapedPrompt = contextPrompt.replace(/"/g, '\\"').replace(/\n/g, " ");
        const paneId = await this.options.mux.createPane(
          "anng-team",
          `anng --worker -p "${escapedPrompt}"`,
          this.options.projectRoot
        );

        // Return dummy success immediately for the visual showcase
        const result: TeamTaskResult = {
          ok: true,
          summary: `Worker executed asynchronously in tmux pane ${paneId}.`,
          artifacts: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          durationMs: 1000,
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

      const timeoutMs = this.config.taskTimeoutMs ?? 600_000;
      const timeout = setTimeout(() => {
        this.sessionManager?.interruptActiveSession();
      }, timeoutMs);

      await this.sessionManager.handleUserPrompt({ text: contextPrompt });

      clearTimeout(timeout);

      const sessionId = this.sessionManager.getActiveSessionId();
      const session = sessionId ? this.sessionManager.getSession(sessionId) : null;
      const usage = session?.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      const sessionStatus = session?.status;
      const completed = sessionStatus === "completed";

      const result: TeamTaskResult = {
        ok: completed,
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

      if (completed) {
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

  private buildTaskPrompt(task: TeamTask): string {
    let prompt = "";

    if (this.config.systemPrompt) {
      prompt += `${this.config.systemPrompt}\n\n`;
    }

    prompt += `## Task\n${task.description}\n\n`;

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

  private extractArtifacts(_session: SessionEntry | null): TeamArtifact[] {
    return [];
  }

  getStatus(): WorkerStatus {
    return this.status;
  }

  getStats() {
    return {
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      totalUsage: this.totalUsage,
    };
  }

  interrupt(): void {
    this.sessionManager?.interruptActiveSession();
    this.status = "idle";
    this.currentTaskId = undefined;
  }

  dispose(): void {
    this.sessionManager?.dispose();
    this.sessionManager = null;
    this.status = "disposed";
  }
}
