import * as os from "os";
import { TeamManager } from "./team-manager";
import { AgentWorkerPool } from "./agent-worker-pool";
import { TaskDecomposer } from "./task-decomposer";
import { WorkflowEngine } from "./workflow-engine";
import { ParallelExecutor } from "./parallel-executor";
import { ResultAggregator } from "./result-aggregator";
import { FileConflictResolver } from "./file-conflict-resolver";
import { TmuxManager } from "./integrations/tmux-manager";
import { DmuxAdapter } from "./integrations/dmux-adapter";
import { TeamTmuxLayout } from "./team-tmux-layout";
import type { TerminalMultiplexer } from "./integrations/terminal-multiplexer";
import type {
  TeamDefinition,
  TeamSession,
  TeamResult,
  TeamExecutionMode,
  TeamWorkerEvent,
  TeamUIEvent,
  TmuxLayoutConfig,
  TmuxLayoutResult,
  AgentConfig,
} from "./types";
import type { CreateOpenAIClient } from "../tools/executor";
import type { McpServerConfig, PermissionSettings } from "../settings";

export type TeamOrchestratorOptions = {
  projectRoot: string;
  createOpenAIClient: CreateOpenAIClient;
  mcpServers?: Record<string, McpServerConfig>;
  permissions?: Required<PermissionSettings>;
  enabledSkills?: Record<string, boolean>;
  renderMarkdown: (text: string) => string;
  onUIEvent?: (event: TeamUIEvent) => void;
  autoAccept?: boolean;
  planMode?: boolean;
};

export class TeamOrchestrator {
  private teamManager = new TeamManager();
  private taskDecomposer = new TaskDecomposer();
  private resultAggregator = new ResultAggregator();
  private fileConflictResolver = new FileConflictResolver();
  private activeSession: TeamSession | null = null;
  private workerPool: AgentWorkerPool | null = null;
  private mux: TerminalMultiplexer | null = null;
  private tmuxLayout: TeamTmuxLayout | null = null;

  constructor(private options: TeamOrchestratorOptions) {}

  async executeTask(description: string, teamDef?: Partial<TeamDefinition>): Promise<TeamResult> {
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

    const session = this.teamManager.createTeam(definition);
    this.activeSession = session;

    if (definition.mode === "tmux" || definition.mode === "dmux") {
      await this.setupMultiplexer(definition.mode);
    }

    this.teamManager.updateTeamStatus(session.teamId, "waiting_for_decomposition");
    const tasks = await this.taskDecomposer.decompose(description, {
      createOpenAIClient: this.options.createOpenAIClient,
    });

    const workflow = new WorkflowEngine();
    workflow.addTasks(tasks);
    for (const task of tasks) {
      this.teamManager.upsertTask(session.teamId, task);
    }

    const conflicts = this.fileConflictResolver.detectConflicts(tasks);
    if (conflicts.length > 0 && this.options.onUIEvent) {
      this.options.onUIEvent({
        type: "team_status_change",
        teamId: session.teamId,
        data: { conflicts },
        timestamp: new Date().toISOString(),
      });
    }

    // Transition: waiting_for_decomposition -> dispatching
    this.teamManager.updateTeamStatus(session.teamId, "dispatching");

    const maxConcurrency = definition.maxParallelWorkers ?? 4;
    this.workerPool = new AgentWorkerPool({
      projectRoot: this.options.projectRoot,
      maxConcurrency,
      mux: this.mux,
      baseWorkerOptions: {
        projectRoot: this.options.projectRoot,
        autoAccept: this.options.autoAccept,
        planMode: this.options.planMode,
        createOpenAIClient: this.options.createOpenAIClient,
        mcpServers: this.options.mcpServers,
        permissions: this.options.permissions,
        enabledSkills: this.options.enabledSkills,
        renderMarkdown: this.options.renderMarkdown,
        onWorkerEvent: (event) => this.handleWorkerEvent(event),
      },
    });
    await this.workerPool.initializeAll(definition.workers);

    // If tmux mode, create the multi-pane team layout
    if (definition.mode === "tmux" && this.mux) {
      await this.createTmuxTeamLayout(session, definition.workers);
    }

    // Transition: dispatching -> running
    this.teamManager.updateTeamStatus(session.teamId, "running");
    const executor = new ParallelExecutor({
      teamId: session.teamId,
      teamManager: this.teamManager,
      workerPool: this.workerPool,
      workflowEngine: workflow,
      fileConflictResolver: this.fileConflictResolver,
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

    this.teamManager.updateTeamStatus(session.teamId, result.status === "completed" ? "completed" : "failed");

    this.workerPool.disposeAll();
    if (this.tmuxLayout) {
      await this.tmuxLayout.killTeamSession();
      this.tmuxLayout = null;
    } else if (this.mux) {
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

  interrupt(): void {
    if (this.activeSession) {
      this.teamManager.interruptTeam(this.activeSession.teamId);
      this.workerPool?.interruptAll();
    }
  }

  getStatus(): TeamSession | null {
    return this.activeSession;
  }

  private handleWorkerEvent(event: TeamWorkerEvent): void {
    this.options.onUIEvent?.({
      type: "worker_update",
      teamId: this.activeSession?.teamId ?? "",
      data: event,
      timestamp: event.timestamp,
    });
  }

  private defaultWorkers(): { name: string; role: "worker"; description: string }[] {
    return [
      { name: "worker-1", role: "worker", description: "General purpose worker" },
      { name: "worker-2", role: "worker", description: "General purpose worker" },
    ];
  }

  async createTmuxTeamLayout(
    _session: TeamSession,
    workers: AgentConfig[]
  ): Promise<{ layout: TeamTmuxLayout; result: TmuxLayoutResult } | null> {
    if (!this.mux) return null;

    const config: TmuxLayoutConfig = {
      sessionName: `anng-${_session.teamId}`,
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

  private async setupMultiplexer(mode: TeamExecutionMode): Promise<void> {
    try {
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
    } catch {
      // Fallback to internal mode silently
    }
  }
}
