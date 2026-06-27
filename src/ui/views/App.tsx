// Legacy interactive implementation retained temporarily while ANNG TUI absorbs remaining controls.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useStdout, useWindowSize } from "ink";
import chalk from "chalk";
import { createOpenAIClient, resetKeyRotators } from "../../common/openai-client";
import type { PermissionScope } from "../../settings";
import { type ModelConfigSelection } from "../../settings";
import { type PromptDraft, PromptInput, type PromptSubmission } from "./PromptInput";
import { MessageView, RawModeExitPrompt } from "../components";
import { SessionList } from "./SessionList";
import { type UndoRestoreMode, UndoSelector } from "./UndoSelector";
import { buildLoadingText } from "../core/loading-text";
import { findExpandedThinkingId } from "../core/thinking-state";
import { WelcomeScreen } from "./WelcomeScreen";
import { AskUserQuestionPrompt } from "./AskUserQuestionPrompt";
import { McpStatusList } from "./McpStatusList";
import { ProcessStdoutView } from "./ProcessStdoutView";
import {
  type AskUserQuestionAnswers,
  findPendingAskUserQuestion,
  formatAskUserQuestionAnswers,
} from "../core/ask-user-question";
import { PermissionPrompt, type PermissionPromptResult } from "./PermissionPrompt";
import { buildExitSummaryText } from "../exit-summary";
import { RawMode, useRawModeContext } from "../contexts";
import { renderMessageToStdout, buildToolSummary, getUpdatePlanPreviewLines } from "../components/MessageView/utils";
import {
  buildPromptDraftFromSessionMessage,
  buildStatusLine,
  buildSyntheticUserMessage,
  formatModelConfig,
  isCurrentSessionEmpty,
  renderRawModeMessages,
} from "../utils";
import {
  resolveCurrentSettings,
  writeModelConfigSelection,
  writeSettings,
  writeProjectSettings,
  readSettings,
  readProjectSettings,
} from "../../settings";
import { isCollapsedThinking } from "../core/thinking-state";
import { ANSI_CLEAR_SCREEN } from "../constants";
import type {
  LlmStreamProgress,
  MessageMeta,
  SessionEntry,
  SessionMessage,
  SessionStatus,
  SkillInfo,
  UndoTarget,
  UserPromptContent,
} from "../../session";
import { SessionManager } from "../../session";
import { TeamOrchestrator } from "../../team/team-orchestrator";
import type { TeamUIEvent, TeamResult, AgentConfig, TeamExecutionMode } from "../../team/types";
import { AgentsConfigView } from "./AgentsConfigView";
import { TeamCreateView, type TeamAgentRule } from "./TeamCreateView";
import { SettingsView } from "./SettingsView";
import { QueryView } from "./QueryView";
import { HelpView } from "./HelpView";
import { BackgroundProcessesView } from "./BackgroundProcessesView";
import { QueueView } from "./QueueView";
import { clearActiveGoal, completeActiveGoal, setActiveGoal } from "../../common/goal-store";
import {
  addTask as queueAddTask,
  getNextPendingQueueTask,
  listQueues as queueListQueues,
  loadQueue as queueLoadQueue,
  markTaskDoneById,
  clearQueue,
} from "../../common/task-queue";
import * as fs from "fs";
import * as path from "path";

type View =
  | "chat"
  | "session-list"
  | "undo"
  | "mcp-status"
  | "help"
  | "agents-config"
  | "settings"
  | "team-create"
  | "status"
  | "bg"
  | "queue";

const STATUS_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function isQueueAwaitingUser(status: SessionStatus | null): boolean {
  return status === "waiting_for_user" || status === "ask_permission" || status === "permission_denied";
}

type AppProps = {
  projectRoot: string;
  initialPrompt?: string;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  headless?: boolean;
  onRestart?: () => void;
  teamMode?: boolean;
  teamConfig?: { mode?: string; maxParallelWorkers?: number };
};

const StatusLine = React.memo(function StatusLine({
  busy,
  text,
}: {
  busy: boolean;
  text?: string;
}): React.ReactElement {
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  useEffect(() => {
    if (!busy) {
      setSpinnerIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setSpinnerIndex((index) => (index + 1) % STATUS_SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, [busy]);

  return (
    <Box>
      {busy ? (
        <Box marginRight={1}>
          <Text color="yellow">{STATUS_SPINNER_FRAMES[spinnerIndex]}</Text>
        </Box>
      ) : null}
      {text ? <Text dimColor>{text}</Text> : null}
    </Box>
  );
});

function App({
  projectRoot,
  initialPrompt,
  autoAccept = false,
  planMode = false,
  maxTurns = 25,
  headless: _headless = false,
  onRestart,
  teamMode = false,
  teamConfig,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout, write } = useStdout();
  const { columns, rows } = useWindowSize();
  const { mode, setMode } = useRawModeContext();
  const initialPromptSubmittedRef = useRef(false);
  const processStdoutRef = useRef<Map<number, string>>(new Map());
  const rawModeRef = useRef<RawMode>(mode);
  const writeRef = useRef(write);
  const lastRenderedColumnsRef = useRef<number | null>(null);
  const messagesRef = useRef<SessionMessage[]>([]);
  const streamRenderTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [view, setView] = useState<View>("chat");
  const [busy, setBusy] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [undoTargets, setUndoTargets] = useState<UndoTarget[]>([]);
  const [promptDraft, setPromptDraft] = useState<PromptDraft | null>(null);
  const [statusLine, setStatusLine] = useState<string>("");
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<LlmStreamProgress | null>(null);
  const [runningProcesses, setRunningProcesses] = useState<SessionEntry["processes"]>(null);
  const [activeStatus, setActiveStatus] = useState<SessionStatus | null>(null);
  const [activeAskPermissions, setActiveAskPermissions] = useState<SessionEntry["askPermissions"]>(undefined);
  const [pendingPermissionReply, setPendingPermissionReply] = useState<{
    sessionId: string;
    permissions: PermissionPromptResult["permissions"];
    alwaysAllows: PermissionScope[];
  } | null>(null);
  const [dismissedQuestionIds, setDismissedQuestionIds] = useState<Set<string>>(() => new Set());
  const [isExiting, setIsExiting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeNonce, setWelcomeNonce] = useState(0);
  const [resolvedSettings, setResolvedSettings] = useState(() => resolveCurrentSettings(projectRoot));
  const [nowTick, setNowTick] = useState(0);
  const [mcpStatuses, setMcpStatuses] = useState<ReturnType<typeof sessionManager.getMcpStatus>>([]);
  const [showProcessStdout, setShowProcessStdout] = useState(false);
  const [showTodoPanel, setShowTodoPanel] = useState(true);
  const [_statusTopic, setStatusTopic] = useState<string>("");
  const [sessionProcessCount, setSessionProcessCount] = useState(0);
  const [queueVisible, setQueueVisible] = useState(true);
  const [queueRefreshTick, setQueueRefreshTick] = useState(0);
  // Track queue task currently being processed: { queueName, taskId }
  const processingQueueTaskRef = useRef<{ queueName: string; taskId: string } | null>(null);
  const [currentAutoAccept, setCurrentAutoAccept] = useState(autoAccept);
  const [currentPlanMode, setCurrentPlanMode] = useState(planMode);
  const [teamResult, setTeamResult] = useState<TeamResult | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamModeEnabled, setTeamModeEnabled] = useState(false);
  const teamOrchestratorRef = useRef<TeamOrchestrator | null>(null);

  const initialAutoAccept = useRef(autoAccept).current;
  const initialPlanMode = useRef(planMode).current;
  const initialTeamMode = useRef(teamMode).current;

  rawModeRef.current = mode;
  messagesRef.current = messages;

  const sessionManager = useMemo(() => {
    return new SessionManager({
      projectRoot,
      autoAccept: initialAutoAccept,
      planMode: initialPlanMode,
      maxTurns,
      createOpenAIClient: () => createOpenAIClient(projectRoot),
      getResolvedSettings: () => resolveCurrentSettings(projectRoot),
      renderMarkdown: (text) => text,
      onAssistantMessage: (message: SessionMessage) => {
        setMessages((prev) => [...prev, message]);
        if (rawModeRef.current === RawMode.Raw) {
          process.stdout.write("\n");
          process.stdout.write(renderMessageToStdout(message, rawModeRef.current) + "\n\n");
        }
      },
      onSessionEntryUpdated: (entry) => {
        setStatusLine(buildStatusLine(entry));
        setRunningProcesses(entry.processes);
        setActiveStatus(entry.status);
        setActiveAskPermissions(entry.askPermissions);
      },
      onLlmStreamProgress: (() => {
        let bufferedProgress: LlmStreamProgress | null = null;
        const RENDER_INTERVAL_MS = 33; // ~30 FPS fixed frame-rate rendering loop, extremely smooth on terminals

        const startTimer = () => {
          if (!streamRenderTimerRef.current) {
            streamRenderTimerRef.current = setInterval(() => {
              if (bufferedProgress) {
                setStreamProgress(bufferedProgress);
                bufferedProgress = null; // Clear to avoid redundant renders if no new data
              }
            }, RENDER_INTERVAL_MS);
          }
        };

        const stopTimer = () => {
          if (streamRenderTimerRef.current) {
            clearInterval(streamRenderTimerRef.current);
            streamRenderTimerRef.current = null;
          }
        };

        return (progress: LlmStreamProgress) => {
          if (progress.phase === "start") {
            bufferedProgress = progress;
            setStreamProgress(progress);
            startTimer();
            return;
          }

          if (progress.phase === "end") {
            stopTimer();
            bufferedProgress = null;
            setStreamProgress(null);
            return;
          }

          // For phase === "update"
          bufferedProgress = progress;
          startTimer();
        };
      })(),
      onMcpStatusChanged: () => {
        // When MCP status changes, refresh display if currently viewing MCP status page
        setMcpStatuses(sessionManager.getMcpStatus());
      },
      onProcessStdout: (pid, chunk) => {
        const buf = processStdoutRef.current;
        const current = buf.get(pid) ?? "";
        // Cap at 1 MB per process to avoid unbounded memory growth
        // on noisy or long-running commands like `yes` or verbose builds.
        const MAX_STDOUT_BUFFER = 1_000_000;
        if (current.length >= MAX_STDOUT_BUFFER) {
          return;
        }
        const text = typeof chunk === "string" ? chunk : String(chunk);
        const available = MAX_STDOUT_BUFFER - current.length;
        buf.set(pid, current + text.slice(0, available));
      },
    });
  }, [projectRoot, initialAutoAccept, initialPlanMode, maxTurns]);

  useEffect(() => {
    sessionManager.setAutoAccept(currentAutoAccept);
    sessionManager.setPlanMode(currentPlanMode);
  }, [currentAutoAccept, currentPlanMode, sessionManager]);

  useEffect(() => {
    return () => {
      if (streamRenderTimerRef.current) {
        clearInterval(streamRenderTimerRef.current);
      }
    };
  }, []);

  const handleTogglePlanMode = useCallback(() => {
    setCurrentPlanMode((p) => {
      const next = !p;
      if (next) setCurrentAutoAccept(false);
      return next;
    });
  }, []);

  const handleToggleAutoMode = useCallback(() => {
    setCurrentAutoAccept((a) => {
      const next = !a;
      if (next) setCurrentPlanMode(false);
      return next;
    });
  }, []);

  const executionMode = currentAutoAccept ? "autoAccept" : currentPlanMode ? "plan" : "default";

  /**
   * Navigate to a sub-view.
   */
  const navigateToSubView = useCallback((targetView: View) => {
    setShowWelcome(false);
    setView(targetView);
  }, []);

  /**
   * Reset the static view to the welcome screen.
   */
  const resetStaticView = useCallback(
    (loadedMessages: SessionMessage[], options?: { clearScreen?: boolean }) => {
      if (options?.clearScreen) {
        process.stdout.write(ANSI_CLEAR_SCREEN);
      }
      setMessages([]);
      setWelcomeNonce((n) => n + 1);
      navigateToSubView("chat");
      setTimeout(() => {
        setMessages(loadedMessages);
        setShowWelcome(true);
      }, 0);
    },
    [navigateToSubView]
  );

  useEffect(() => {
    if (!busy) {
      return;
    }
    const id = setInterval(() => setNowTick((tick) => tick + 1), 500);
    return () => clearInterval(id);
  }, [busy]);

  function loadVisibleMessages(manager: SessionManager, sessionId: string): SessionMessage[] {
    return manager.listSessionMessages(sessionId).filter((m) => m.visible);
  }

  const refreshSessionsList = useCallback((): void => {
    setSessions(sessionManager.listSessions());
  }, [sessionManager]);

  const refreshSkills = useCallback(
    async (sessionId?: string): Promise<void> => {
      try {
        const list = await sessionManager.listSkills(sessionId ?? sessionManager.getActiveSessionId() ?? undefined);
        setSkills(list);
      } catch {
        // ignore
      }
    },
    [sessionManager]
  );

  /**
   * Reset the app to the welcome screen.
   */
  const resetToWelcome = useCallback(async () => {
    writeRef.current(ANSI_CLEAR_SCREEN);
    sessionManager.setActiveSessionId(null);
    setStatusLine("");
    setErrorLine(null);
    setRunningProcesses(null);
    setActiveStatus(null);
    setActiveAskPermissions(undefined);
    setPendingPermissionReply(null);
    setDismissedQuestionIds(new Set());
    resetStaticView([]);
    await refreshSkills();
  }, [sessionManager, resetStaticView, refreshSkills]);

  /**
   * Refresh the list of sessions.
   */
  useEffect(() => {
    refreshSessionsList();
    void refreshSkills();
  }, [refreshSessionsList, refreshSkills]);

  // Eagerly create the OpenAI client on mount so the TCP+TLS connection
  // warmup (fire-and-forget inside createOpenAIClient) starts before the
  // user sends their first prompt.
  useEffect(() => {
    createOpenAIClient(projectRoot);
  }, [projectRoot]);

  /**
   * Initialize MCP servers.
   */
  useLayoutEffect(() => {
    const settings = resolveCurrentSettings(projectRoot);
    void sessionManager.initMcpServers(settings.mcpServers);
  }, [projectRoot, sessionManager]);

  /**
   * Dispose the session manager on unmount.
   */
  useEffect(() => {
    return () => {
      sessionManager.dispose();
    };
  }, [sessionManager]);

  writeRef.current = write;

  const runTeamTask = useCallback(
    async (taskText: string): Promise<void> => {
      setTeamBusy(true);
      setBusy(true);
      try {
        const orchestrator = new TeamOrchestrator({
          projectRoot,
          autoAccept: currentAutoAccept,
          planMode: currentPlanMode,
          createOpenAIClient: () => createOpenAIClient(projectRoot),
          renderMarkdown: (text: string) => text,
          onUIEvent: (event: TeamUIEvent) => {
            if (event.type === "team_complete") {
              // Don't setTeamResult here — it's set after executeTask returns below.
              setMessages((prev) => [
                ...prev,
                buildSyntheticUserMessage(`Team completed: ${(event.data as TeamResult).executiveSummary}`, 0),
              ]);
            }
          },
        });
        teamOrchestratorRef.current = orchestrator;
        let workers: AgentConfig[] | undefined;
        try {
          const configPath = path.join(projectRoot, ".anng", "team-agents.json");
          if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, "utf-8");
            const data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
              workers = data.map((a: Record<string, unknown>) => ({
                name: String(a.name),
                role: "worker" as const,
                description: String(a.name),
                systemPrompt: String(a.prompt),
                model: a.model ? String(a.model) : undefined,
              }));
            }
          }
        } catch (_e) {
          // Ignore config loading errors
        }
        const result = await orchestrator.executeTask(taskText, {
          workers,
          maxParallelWorkers: teamConfig?.maxParallelWorkers,
          mode: (teamConfig?.mode ?? "internal") as TeamExecutionMode,
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
    [projectRoot, currentAutoAccept, currentPlanMode, teamConfig]
  );

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
          renderMarkdown: (text: string) => text,
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
          apiKey: a.apiKey || undefined,
          baseURL: a.baseURL || undefined,
        }));

        const result = await orchestrator.executeTask("Team task", {
          workers,
          maxParallelWorkers: agents.length,
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

  const handlePrompt = useCallback(
    async (submission: PromptSubmission) => {
      if (submission.command === "exit") {
        setIsExiting(true);
        setTimeout(() => {
          const activeSessionId = sessionManager.getActiveSessionId();
          const session = activeSessionId ? sessionManager.getSession(activeSessionId) : null;
          const summary = buildExitSummaryText({ session });
          process.stdout.write("\n");
          process.stdout.write(chalk.rgb(34, 154, 195)("> /exit "));
          process.stdout.write("\n\n");
          process.stdout.write(summary);
          process.stdout.write("\n\n");
          sessionManager.dispose();
          exit();
        }, 0);
        return;
      }
      if (submission.command === "new") {
        try {
          const qList = queueListQueues(projectRoot);
          for (const q of qList) {
            clearQueue(projectRoot, q.name);
          }
          setQueueRefreshTick((t) => t + 1);
        } catch {
          /* ignore */
        }

        resetKeyRotators();

        if (onRestart) {
          onRestart();
        } else {
          await resetToWelcome();
          refreshSessionsList();
        }
        return;
      }
      if (submission.command === "resume") {
        refreshSessionsList();
        navigateToSubView("session-list");
        return;
      }
      if (submission.command === "continue" && isCurrentSessionEmpty(sessionManager)) {
        refreshSessionsList();
        navigateToSubView("session-list");
        return;
      }
      if (submission.command === "undo") {
        const activeSessionId = sessionManager.getActiveSessionId();
        if (!activeSessionId) {
          setErrorLine("No active session to undo.");
          return;
        }
        setUndoTargets(sessionManager.listUndoTargets(activeSessionId));
        navigateToSubView("undo");
        return;
      }
      if (submission.command === "mcp") {
        setMcpStatuses(sessionManager.getMcpStatus());
        navigateToSubView("mcp-status");
        return;
      }
      if (submission.command === "help") {
        navigateToSubView("help");
        return;
      }
      if (submission.command === "team") {
        const parts = submission.text.trim().split(/\s+/);
        const subCmd = parts[1]?.toLowerCase();
        const taskText = parts.slice(2).join(" ");

        if (subCmd === "create") {
          if (taskText) {
            await runTeamTask(taskText);
          } else {
            navigateToSubView("team-create");
          }
          return;
        }

        if (subCmd === "status") {
          if (teamBusy) {
            setStatusLine("Team is currently running a task. Please wait.");
          } else if (teamResult) {
            setMessages((prev) => [
              ...prev,
              buildSyntheticUserMessage("Team result: " + teamResult.executiveSummary, 0),
            ]);
            setTeamResult(null);
          } else {
            setStatusLine("Team mode is " + (initialTeamMode || teamModeEnabled ? "active" : "inactive") + ".");
          }
          return;
        }

        if (subCmd === "kill" || subCmd === "stop") {
          // Interrupt the orchestrator first so it can clean up tmux session
          if (teamOrchestratorRef.current) {
            teamOrchestratorRef.current.interrupt();
            teamOrchestratorRef.current = null;
          }
          setTeamModeEnabled(false);
          setTeamBusy(false);
          setBusy(false);
          setStatusLine("Team mode disabled. Tmux session cleaned up.");
          setMessages((prev) => [...prev, buildSyntheticUserMessage("Team stopped. Tmux session terminated.", 0)]);
          return;
        }

        if (teamBusy) {
          setErrorLine("Team is currently running. Wait for completion or interrupt.");
          return;
        }
        if (teamResult) {
          setMessages((prev) => [...prev, buildSyntheticUserMessage("Team result: " + teamResult.executiveSummary, 0)]);
          setTeamResult(null);
          return;
        }
        if (initialTeamMode || teamModeEnabled) {
          setStatusLine("Team mode is active. Type your task directly.");
          return;
        }
        setErrorLine("No active team. Use --team flag, /team create, or /team create <task>.");
        return;
      }
      if (submission.command === "custom-agents") {
        navigateToSubView("agents-config");
        return;
      }
      if (submission.command === "settings") {
        navigateToSubView("settings");
        return;
      }
      if (submission.command === "status" || submission.command === "query") {
        const topic =
          submission.text === "/status" || submission.text === "/query"
            ? ""
            : submission.text.replace(/^\/(?:status|query)\s*/i, "");
        setStatusTopic(topic);
        navigateToSubView("status");
        return;
      }
      if (submission.command === "goal") {
        const rawGoalText = submission.text.trim();
        const goalCommand = rawGoalText.startsWith("/goal") ? rawGoalText.slice(5).trim() : rawGoalText;
        const [subCmdRaw, ...restParts] = goalCommand.split(/\s+/).filter(Boolean);
        const subCmd = subCmdRaw?.toLowerCase() ?? "";
        const remainingText = restParts.join(" ").trim();

        if (!goalCommand || subCmd === "status" || subCmd === "show" || subCmd === "list") {
          setStatusTopic("goal");
          navigateToSubView("status");
          return;
        }

        if (subCmd === "done" || subCmd === "complete") {
          const goal = completeActiveGoal(projectRoot);
          if (goal) {
            setMessages((prev) => [...prev, buildSyntheticUserMessage(`✅ Goal completed: ${goal.text}`, 0)]);
            setStatusLine(`Completed goal: "${goal.text.slice(0, 80)}"`);
          } else {
            setStatusLine("No active goal to complete.");
          }
          return;
        }

        if (subCmd === "clear" || subCmd === "cancel") {
          const goal = clearActiveGoal(projectRoot);
          if (goal) {
            setMessages((prev) => [...prev, buildSyntheticUserMessage(`🧹 Goal cleared: ${goal.text}`, 0)]);
            setStatusLine(`Cleared goal: "${goal.text.slice(0, 80)}"`);
          } else {
            setStatusLine("No active goal to clear.");
          }
          return;
        }

        const goalText = subCmd === "set" ? remainingText : goalCommand;
        if (!goalText) {
          setErrorLine("Usage: /goal <text>, /goal done, /goal clear, /goal list");
          return;
        }
        try {
          const goal = setActiveGoal(projectRoot, goalText);
          setMessages((prev) => [...prev, buildSyntheticUserMessage(`🎯 Goal set: ${goal.text}`, 0)]);
          setStatusLine(`Active goal: "${goal.text.slice(0, 80)}"`);
          submission.text = goalText;
          submission.command = undefined;
        } catch (error) {
          setErrorLine(error instanceof Error ? error.message : "Failed to update goal.");
          return;
        }
      }
      if (submission.command === "btw") {
        // Insert as a user message with BTW context note
        const btwText = submission.text || "No note provided";
        const activeSessionId = sessionManager.getActiveSessionId();
        if (activeSessionId) {
          const meta: MessageMeta = {
            userPrompt: { text: `💡 BTW Note: ${btwText}` },
          };
          sessionManager.addSessionSystemMessage(activeSessionId, `🗒️ *BTW Note:* ${btwText}`, true, meta);
          setMessages((prev) => [...prev, buildSyntheticUserMessage(`📝 /btw: ${btwText}`, 0)]);
          setStatusLine(`BTW note added: "${btwText.slice(0, 60)}${btwText.length > 60 ? "..." : ""}"`);
        } else {
          setStatusLine("No active session. Create one first with /new or type a message.");
        }
        return;
      }
      if (submission.command === "temp") {
        const val = submission.text.trim();
        const current = resolveCurrentSettings(projectRoot);
        if (!val) {
          const currentTemp = current.temperature !== undefined ? current.temperature : "default (not set)";
          setStatusLine(`Current LLM temperature: ${currentTemp}`);
          return;
        }
        const num = parseFloat(val);
        if (isNaN(num) || num < 0 || num > 2) {
          setErrorLine("Temperature must be a number between 0 and 2.");
          return;
        }

        const projectSettingsPath = path.join(projectRoot, ".anng", "settings.json");
        const shouldWriteProjectSettings = fs.existsSync(projectSettingsPath);
        const rawSettings = shouldWriteProjectSettings ? readProjectSettings(projectRoot) || {} : readSettings() || {};
        rawSettings.temperature = num;

        if (shouldWriteProjectSettings) {
          writeProjectSettings(rawSettings, projectRoot);
        } else {
          writeSettings(rawSettings);
        }

        const next = resolveCurrentSettings(projectRoot);
        setResolvedSettings(next);
        setStatusLine(`✅ Temperature set to ${num}`);

        const activeSessionId = sessionManager.getActiveSessionId();
        if (activeSessionId) {
          sessionManager.addSessionSystemMessage(activeSessionId, `⚙️ *Temperature set to:* ${num}`, true);
        }
        return;
      }
      if (submission.command === "bg") {
        const activeSessionId = sessionManager.getActiveSessionId();
        if (activeSessionId) {
          const session = sessionManager.getSession(activeSessionId);
          const processes = session?.processes ?? null;
          setRunningProcesses(processes);
          setSessionProcessCount(processes?.size ?? 0);
        } else {
          setRunningProcesses(null);
          setSessionProcessCount(0);
        }
        navigateToSubView("bg");
        return;
      }
      if ((submission.command as string) === "queue") {
        const text = submission.text.trim();
        const parts = text.startsWith("/queue") ? text.slice(6).trim().split(/\s+/) : text.split(/\s+/);
        const subCmd = parts[0]?.toLowerCase();

        const knownSubcmds = ["add", "clear", "process", "run"];
        let isAdd = subCmd === "add" || !subCmd;
        let taskText = parts.slice(1).join(" ");

        if (subCmd && !knownSubcmds.includes(subCmd)) {
          isAdd = true;
          taskText = parts.join(" ");
        }

        if (isAdd && taskText) {
          const qList = queueListQueues(projectRoot);
          const qName = qList.length > 0 ? qList[0].name : "main";
          const task = queueAddTask(projectRoot, qName, taskText);
          if (task) {
            setMessages((prev) => [...prev, buildSyntheticUserMessage(`📋 Queued: "${taskText.slice(0, 80)}"`, 0)]);
            setStatusLine(`Task queued: "${taskText.slice(0, 60)}"`);
          } else {
            setErrorLine("Failed to queue task");
          }
          return;
        }
        if (subCmd === "clear") {
          const { clearQueue: clearQ } = await import("../../common/task-queue");
          const qList = queueListQueues(projectRoot);
          if (qList.length > 0 && clearQ(projectRoot, qList[0].name)) setStatusLine("Queue cleared");
          else setErrorLine("Failed to clear queue");
          return;
        }
        if (subCmd === "process" || subCmd === "run") {
          // Directly trigger queue execution instead of just navigating to the queue view
          const nextTask = getNextPendingQueueTask(projectRoot);
          if (nextTask) {
            setView("chat");
            setPromptDraft(null);
            setStatusLine(`Processing queue task: "${nextTask.task.text.slice(0, 80)}"`);
            void handlePrompt({
              text: nextTask.task.text,
              imageUrls: [],
              queueTask: {
                queueName: nextTask.queueName,
                taskId: nextTask.task.id,
              },
            });
          } else {
            setStatusLine("No pending tasks in any queue.");
            navigateToSubView("queue");
          }
          return;
        }
        navigateToSubView("queue");
        return;
      }

      // Nếu team mode được bật và không phải command đặc biệt
      if ((initialTeamMode || teamModeEnabled) && submission.text.trim() && !submission.command) {
        await runTeamTask(submission.text);
        return;
      }

      setBusy(true);
      setErrorLine(null);
      const activeSessionId = sessionManager.getActiveSessionId();
      const currentActiveStatus = activeSessionId ? (sessionManager.getSession(activeSessionId)?.status ?? null) : null;
      const activeProcesses = activeSessionId ? (sessionManager.getSession(activeSessionId)?.processes ?? null) : null;
      setRunningProcesses(activeProcesses);
      setShowProcessStdout(false);
      if (!activeProcesses || activeProcesses.size === 0) {
        processStdoutRef.current.clear();
      }
      try {
        let currentSubmission: PromptSubmission | null = submission;

        while (currentSubmission) {
          if (
            currentSubmission &&
            !currentSubmission.queueTask &&
            currentSubmission.command !== "continue" &&
            (currentSubmission.text ?? "").trim() &&
            !isQueueAwaitingUser(currentActiveStatus)
          ) {
            try {
              const qList = queueListQueues(projectRoot);
              const qName = qList.length > 0 ? qList[0].name : "main";
              const added = queueAddTask(projectRoot, qName, currentSubmission.text);
              if (added) {
                setQueueRefreshTick((t) => t + 1);
                const nextTask = getNextPendingQueueTask(projectRoot, qName);
                if (nextTask) {
                  if (nextTask.task.id !== added.id) {
                    setMessages((prev) => [
                      ...prev,
                      buildSyntheticUserMessage(`📋 Queued: "${currentSubmission!.text}"`, 0),
                    ]);
                  }
                  currentSubmission = {
                    text: nextTask.task.text,
                    imageUrls: currentSubmission.imageUrls,
                    queueTask: {
                      queueName: nextTask.queueName,
                      taskId: nextTask.task.id,
                    },
                  };
                }
              }
            } catch {
              /* fallback */
            }
          }

          const submissionToRun = currentSubmission;
          const trimmedOriginalText = (submissionToRun.text ?? "").trim();
          let processedText = submissionToRun.text;
          if (trimmedOriginalText.startsWith("!")) {
            const cmd = trimmedOriginalText.substring(1).trim();
            if (cmd) {
              processedText = `Execute the following bash command immediately and exactly as provided, and report back the output:\n\n\`\`\`bash\n${cmd}\n\`\`\``;
            }
          }

          const resumedQueueTask =
            submissionToRun.queueTask ??
            (isQueueAwaitingUser(currentActiveStatus) ? processingQueueTaskRef.current : null);
          processingQueueTaskRef.current = resumedQueueTask;

          const prompt: UserPromptContent = {
            text: processedText,
            imageUrls: submissionToRun.imageUrls,
            skills:
              submissionToRun.selectedSkills && submissionToRun.selectedSkills.length > 0
                ? submissionToRun.selectedSkills
                : undefined,
            permissions: submissionToRun.permissions,
            alwaysAllows: submissionToRun.alwaysAllows,
          };
          const permissionReply =
            pendingPermissionReply && activeSessionId === pendingPermissionReply.sessionId
              ? pendingPermissionReply
              : null;
          if (permissionReply) {
            prompt.permissions = permissionReply.permissions;
            prompt.alwaysAllows = permissionReply.alwaysAllows;
          }

          const selectedSkillNames = submissionToRun.selectedSkills?.map((skill) => skill.name).filter(Boolean) ?? [];
          const userDisplayContent =
            trimmedOriginalText ||
            (selectedSkillNames.length > 0 ? `Use skills: ${selectedSkillNames.join(", ")}` : "") ||
            (submissionToRun.imageUrls.length > 0 ? "[Image]" : "");

          if (userDisplayContent && submissionToRun.command !== "continue") {
            setMessages((prev) => [
              ...prev,
              buildSyntheticUserMessage(userDisplayContent, submissionToRun.imageUrls.length),
            ]);
          }

          await sessionManager.handleUserPrompt(prompt);
          if (permissionReply) {
            setPendingPermissionReply(null);
          }
          await refreshSkills();
          refreshSessionsList();

          const latestActiveSessionId = sessionManager.getActiveSessionId();
          const sessionStatus = latestActiveSessionId
            ? (sessionManager.getSession(latestActiveSessionId)?.status ?? null)
            : null;
          const processingTask = processingQueueTaskRef.current;
          if (!processingTask) {
            currentSubmission = null;
            continue;
          }

          if (isQueueAwaitingUser(sessionStatus)) {
            setStatusLine("Queue paused — awaiting user input before continuing.");
            currentSubmission = null;
            continue;
          }

          if (sessionStatus !== "completed") {
            processingQueueTaskRef.current = null;
            setStatusLine(`Queue paused — task not completed (${sessionStatus ?? "unknown"}).`);
            currentSubmission = null;
            continue;
          }

          markTaskDoneById(projectRoot, processingTask.queueName, processingTask.taskId);
          processingQueueTaskRef.current = null;
          setQueueRefreshTick((t) => t + 1);

          const nextQueuedTask = getNextPendingQueueTask(projectRoot, processingTask.queueName);
          if (!nextQueuedTask) {
            setStatusLine("Queue complete — all tasks processed ✓");
            currentSubmission = null;
            continue;
          }

          setView("chat");
          setPromptDraft(null);
          setStatusLine(
            `Auto-processing next queue task (${nextQueuedTask.queueName}): "${nextQueuedTask.task.text.slice(0, 60)}"`
          );
          currentSubmission = {
            text: nextQueuedTask.task.text,
            imageUrls: [],
            queueTask: {
              queueName: nextQueuedTask.queueName,
              taskId: nextQueuedTask.task.id,
            },
          };
        }
      } catch (error) {
        processingQueueTaskRef.current = null;
        const message = error instanceof Error ? error.message : String(error);
        setErrorLine(message);
      } finally {
        setBusy(false);
        setStreamProgress(null);
        const finalActiveSessionId = sessionManager.getActiveSessionId();
        setRunningProcesses(
          finalActiveSessionId ? (sessionManager.getSession(finalActiveSessionId)?.processes ?? null) : null
        );
      }
    },
    [
      sessionManager,
      pendingPermissionReply,
      exit,
      onRestart,
      refreshSkills,
      refreshSessionsList,
      navigateToSubView,
      resetToWelcome,
      initialTeamMode,
      teamModeEnabled,
      runTeamTask,
      teamBusy,
      teamResult,
      processStdoutRef,
      projectRoot,
    ]
  );

  const handleInterrupt = useCallback(() => {
    sessionManager.interruptActiveSession();
  }, [sessionManager]);

  const handleToggleQueueVisibility = useCallback(() => {
    setQueueVisible((v) => !v);
  }, []);

  const handleQueueWhenBusy = useCallback(
    (text: string) => {
      // Add to queue when AI is busy processing — synchronous via static import
      try {
        const qList = queueListQueues(projectRoot);
        const qName = qList.length > 0 ? qList[0].name : "main";
        queueAddTask(projectRoot, qName, text);
        setQueueRefreshTick((t) => t + 1);
      } catch {
        /* silent */
      }
      setStatusLine(`Queued: "${text.slice(0, 60)}" (AI busy)`);
      navigateToSubView("queue");
    },
    [projectRoot, navigateToSubView]
  );

  const handleQueueProcessTask = useCallback(
    (taskText: string, taskId?: string, queueName?: string) => {
      let queueTask = taskId && queueName ? { queueName, taskId } : null;
      if (!queueTask) {
        try {
          const qList = queueListQueues(projectRoot);
          const qName = queueName ?? (qList.length > 0 ? qList[0].name : "main");
          const tasks = queueLoadQueue(projectRoot, qName);
          const match = tasks.find((t) => !t.done && t.text === taskText);
          if (match) {
            queueTask = { queueName: qName, taskId: match.id };
          }
        } catch {
          /* silent */
        }
      }

      setView("chat");
      setPromptDraft(null);
      setStatusLine(`Processing queue task: "${taskText.slice(0, 80)}"`);
      void handlePrompt({
        text: taskText,
        imageUrls: [],
        queueTask: queueTask ?? undefined,
      });
    },
    [handlePrompt, projectRoot]
  );

  const handleToggleProcessStdout = useCallback(() => {
    setShowProcessStdout(true);
  }, []);

  const handleDismissProcessStdout = useCallback(() => {
    setShowProcessStdout(false);
  }, []);

  const handleToggleTodoPanel = useCallback(() => {
    setShowTodoPanel((prev) => !prev);
  }, []);

  const handleAdjustBashTimeout = useCallback(
    (deltaMs: number) => sessionManager.adjustActiveBashTimeout(deltaMs),
    [sessionManager]
  );

  const handleModelConfigChange = useCallback(
    (selection: ModelConfigSelection): string => {
      const current = resolveCurrentSettings(projectRoot);
      const { changed } = writeModelConfigSelection(selection, current, projectRoot);
      const next = resolveCurrentSettings(projectRoot);
      setResolvedSettings(next);

      if (!changed) {
        return "Model settings unchanged";
      }

      const activeSessionId = sessionManager.getActiveSessionId();
      const meta: MessageMeta = {
        isModelChange: true,
      };
      const content = `/model\n└ Set model to ${selection.model} (${selection?.thinkingEnabled ? selection?.reasoningEffort : "no thinking"})`;

      if (activeSessionId) {
        sessionManager.addSessionSystemMessage(activeSessionId, content, true, meta);
      } else {
        const now = new Date().toISOString();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sessionId: "local",
            role: "system" as const,
            content,
            contentParams: null,
            messageParams: null,
            compacted: false,
            visible: true,
            createTime: now,
            updateTime: now,
            meta,
          },
        ]);
      }

      return `Model settings updated: ${formatModelConfig(current)} → ${formatModelConfig(next)}`;
    },
    [projectRoot, sessionManager]
  );

  const handleSubmit = useCallback(
    (submission: PromptSubmission) => {
      const activeSessionId = sessionManager.getActiveSessionId();
      if (!activeSessionId && !submission.command) {
        try {
          const qList = queueListQueues(projectRoot);
          for (const q of qList) {
            clearQueue(projectRoot, q.name);
          }
          setQueueRefreshTick((t) => t + 1);
        } catch {
          /* ignore */
        }
      }
      void handlePrompt(submission);
    },
    [handlePrompt, sessionManager, projectRoot]
  );

  const reloadActiveSessionView = useCallback(
    (sessionId: string): void => {
      resetStaticView(loadVisibleMessages(sessionManager, sessionId), { clearScreen: true });
    },
    [resetStaticView, sessionManager]
  );

  // When --team is used without -p, show the Team Builder so the user can
  // see/configure agents before typing a task.
  useEffect(() => {
    if (initialPrompt) return;
    if (!initialTeamMode) return;
    navigateToSubView("team-create");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialPromptSubmittedRef.current || !initialPrompt || !initialPrompt.trim()) {
      return;
    }

    initialPromptSubmittedRef.current = true;
    handleSubmit({
      text: initialPrompt,
      imageUrls: [],
      selectedSkills: undefined,
    });
  }, [handleSubmit, initialPrompt]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      sessionManager.setActiveSessionId(sessionId);
      // Clear first so <Static> resets its index to 0.
      resetStaticView(loadVisibleMessages(sessionManager, sessionId), { clearScreen: true });
      const session = sessionManager.getSession(sessionId);
      setStatusLine(session ? buildStatusLine(session) : "");
      setRunningProcesses(session?.processes ?? null);
      setActiveStatus(session?.status ?? null);
      setActiveAskPermissions(session?.askPermissions);
      if (pendingPermissionReply && pendingPermissionReply.sessionId !== sessionId) {
        setPendingPermissionReply(null);
      }
      await refreshSkills(sessionId);
    },
    [sessionManager, resetStaticView, pendingPermissionReply, refreshSkills]
  );

  const handleDeleteSession = useCallback(
    async (id: string): Promise<void> => {
      const isActiveSession = sessionManager.getActiveSessionId() === id;

      // If the deleted session is the active one, clear the active session first
      if (isActiveSession) {
        sessionManager.setActiveSessionId(null);
      }

      sessionManager.deleteSession(id);
      refreshSessionsList();

      if (isActiveSession) {
        await resetToWelcome();
      }
    },
    [sessionManager, refreshSessionsList, resetToWelcome]
  );

  const handleUndoRestore = useCallback(
    async (target: UndoTarget, restoreMode: UndoRestoreMode): Promise<void> => {
      const sessionId = sessionManager.getActiveSessionId();
      if (!sessionId) {
        setErrorLine("No active session to undo.");
        setView("chat");
        setShowWelcome(true);
        return;
      }

      const errors: string[] = [];
      if (restoreMode === "code-and-conversation") {
        try {
          sessionManager.restoreSessionCode(sessionId, target.message.id);
        } catch (error) {
          errors.push(`Code restore failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      let conversationRestored = false;
      try {
        sessionManager.restoreSessionConversation(sessionId, target.message.id);
        conversationRestored = true;
      } catch (error) {
        errors.push(`Conversation restore failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      refreshSessionsList();
      await refreshSkills(sessionId);
      setView("chat");
      setErrorLine(errors.length > 0 ? errors.join(" ") : null);
      if (conversationRestored) {
        setPromptDraft(buildPromptDraftFromSessionMessage(target.message, Date.now()));
      }
      reloadActiveSessionView(sessionId);
    },
    [reloadActiveSessionView, refreshSessionsList, refreshSkills, sessionManager]
  );

  const handleRawModeChange = useCallback(
    (nextMode: string) => {
      const activeSessionId = sessionManager.getActiveSessionId();
      setMode(nextMode as RawMode);
      // Reset chat view state synchronously so the transition frame does not
      // re-render a stale welcome screen before handleSelectSession runs.
      setShowWelcome(false);
      setMessages([]);
      // Clear screen to remove stale formatted text.
      process.stdout.write(ANSI_CLEAR_SCREEN);

      setTimeout(() => {
        if (nextMode === RawMode.Raw) {
          // Write all messages directly to stdout for raw scrollback mode.
          const allMessages = activeSessionId ? loadVisibleMessages(sessionManager, activeSessionId) : [];
          renderRawModeMessages(allMessages, nextMode);
        } else if (activeSessionId) {
          // Switch to chat view to render messages.
          handleSelectSession(activeSessionId);
        } else {
          // No active session: just show the welcome screen once.
          setWelcomeNonce((n) => n + 1);
          setShowWelcome(true);
        }
      }, 200);
    },
    [handleSelectSession, sessionManager, setMode]
  );

  useEffect(() => {
    if (!stdout?.isTTY) {
      return;
    }
    if (columns <= 0) {
      return;
    }
    if (lastRenderedColumnsRef.current === null) {
      lastRenderedColumnsRef.current = columns;
      return;
    }
    if (lastRenderedColumnsRef.current === columns) {
      return;
    }
    lastRenderedColumnsRef.current = columns;

    if (mode === RawMode.Raw) {
      // In raw mode, re-render all messages directly to stdout at the new width.
      // Use process.stdout.write instead of writeRef to avoid Ink interference.
      process.stdout.write(ANSI_CLEAR_SCREEN);
      const activeSessionId = sessionManager.getActiveSessionId();
      const allMessages = activeSessionId ? loadVisibleMessages(sessionManager, activeSessionId) : [];
      renderRawModeMessages(allMessages, mode);
      return;
    }

    // Force full redraw on terminal resize to avoid stale wrapped rows.
    writeRef.current("\u001B[2J\u001B[H");

    setMessages([]);
    setShowWelcome(false);
    setWelcomeNonce((n) => n + 1);

    const activeSessionId = sessionManager.getActiveSessionId();
    const nextMessages =
      activeSessionId && !busy ? loadVisibleMessages(sessionManager, activeSessionId) : messagesRef.current;
    setTimeout(() => {
      setMessages(nextMessages);
      setShowWelcome(true);
    }, 0);
  }, [busy, mode, sessionManager, columns, stdout]);

  const screenWidth = useMemo(() => columns ?? stdout?.columns ?? 80, [columns, stdout]);
  const screenHeight = useMemo(() => rows ?? stdout?.rows ?? 24, [rows, stdout]);
  const promptHistory = useMemo(() => {
    return messages
      .filter((message) => message.role === "user" && typeof message.content === "string")
      .map((message) => (message.content ?? "").trim())
      .filter((content) => content.length > 0);
  }, [messages]);
  const expandedThinkingId = findExpandedThinkingId(messages);
  const pendingQuestion = useMemo(() => findPendingAskUserQuestion(messages, activeStatus), [activeStatus, messages]);
  const shouldShowQuestionPrompt = Boolean(pendingQuestion && !dismissedQuestionIds.has(pendingQuestion.messageId));
  const loadingText = useMemo(
    () => (busy ? buildLoadingText({ progress: streamProgress, processes: runningProcesses, now: Date.now() }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nowTick forces periodic recalculation for spinner animation
    [busy, streamProgress, runningProcesses, nowTick]
  );

  const welcomeItem: SessionMessage = useMemo(
    () => ({
      id: `__welcome__${welcomeNonce}`,
      sessionId: "",
      role: "system",
      content: "",
      contentParams: null,
      messageParams: null,
      compacted: false,
      visible: true,
      createTime: "",
      updateTime: "",
    }),
    [welcomeNonce]
  );
  const latestPlanLines = useMemo(() => {
    if (mode === RawMode.Raw) {
      return [];
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "tool") {
        const summary = buildToolSummary(msg);
        if (summary.name === "UpdatePlan" && summary.ok) {
          const lines = getUpdatePlanPreviewLines(summary);
          if (lines && lines.length > 0) {
            return lines;
          }
        }
      }
    }
    return [];
  }, [mode, messages]);

  const hasPlan = latestPlanLines.length > 0;
  const showPanel = showTodoPanel && hasPlan;
  const todoPanelWidth = Math.min(35, Math.floor(screenWidth * 0.35));
  const mainWidth = showPanel ? screenWidth - todoPanelWidth - 2 : screenWidth;

  const staticItems = useMemo(() => {
    if (mode === RawMode.Raw) {
      return [];
    }
    if (showWelcome && view === "chat") {
      return [welcomeItem, ...messages];
    }
    return messages;
  }, [mode, showWelcome, view, messages, welcomeItem]);
  const promptCursorLayoutKey = useMemo(() => {
    const lastStaticItem = staticItems.at(-1);
    return [
      view,
      busy ? "busy" : "idle",
      statusLine,
      errorLine ?? "",
      showProcessStdout ? "stdout" : "main",
      activeStatus ?? "",
      staticItems.length,
      lastStaticItem?.id ?? "",
      lastStaticItem?.updateTime ?? "",
      shouldShowQuestionPrompt ? (pendingQuestion?.messageId ?? "") : "",
      activeAskPermissions?.length ?? 0,
      pendingPermissionReply ? "pending-permission-reply" : "no-pending-permission-reply",
    ].join("\u001E");
  }, [
    activeAskPermissions,
    activeStatus,
    busy,
    errorLine,
    pendingPermissionReply,
    pendingQuestion,
    shouldShowQuestionPrompt,
    showProcessStdout,
    staticItems,
    statusLine,
    view,
  ]);

  const handleQuestionAnswers = useCallback(
    (answers: AskUserQuestionAnswers) => {
      void handlePrompt({
        text: formatAskUserQuestionAnswers(answers),
        imageUrls: [],
      });
    },
    [handlePrompt]
  );

  const handleQuestionCancel = useCallback(() => {
    if (!pendingQuestion) {
      return;
    }
    setDismissedQuestionIds((prev) => new Set(prev).add(pendingQuestion.messageId));
  }, [pendingQuestion]);

  const handlePermissionResult = useCallback(
    (result: PermissionPromptResult) => {
      const sessionId = sessionManager.getActiveSessionId();
      if (!sessionId) {
        return;
      }
      setPromptDraft(null);
      if (result.hasDeny) {
        setPendingPermissionReply({
          sessionId,
          permissions: result.permissions,
          alwaysAllows: result.alwaysAllows,
        });
        setStatusLine("Permission denied. Add a reply, then press Enter to continue.");
        sessionManager.denySessionPermission(sessionId);
        return;
      }
      void handlePrompt({
        text: "/continue",
        imageUrls: [],
        command: "continue",
        permissions: result.permissions,
        alwaysAllows: result.alwaysAllows,
      });
    },
    [handlePrompt, sessionManager]
  );

  const handlePermissionCancel = useCallback(() => {
    sessionManager.interruptActiveSession();
    setActiveStatus("interrupted");
    setActiveAskPermissions(undefined);
    setPromptDraft(null);
    refreshSessionsList();
  }, [refreshSessionsList, sessionManager]);

  if (mode === RawMode.Raw) {
    return <RawModeExitPrompt onExit={(prev) => handleRawModeChange(prev)} />;
  }

  return (
    <Box flexDirection="row" width={screenWidth}>
      <Box flexDirection="column" width={mainWidth} minWidth={80} overflowX={"visible"}>
        <Static items={staticItems}>
          {(item) => {
            if (item.id.startsWith("__welcome__")) {
              return (
                <WelcomeScreen
                  key={item.id}
                  projectRoot={projectRoot}
                  settings={resolvedSettings}
                  skills={skills}
                  width={mainWidth}
                />
              );
            }
            return (
              <MessageView
                key={item.id}
                message={item}
                collapsed={isCollapsedThinking(item, expandedThinkingId)}
                width={mainWidth}
              />
            );
          }}
        </Static>
        {streamProgress && (streamProgress.text || streamProgress.reasoningText) ? (
          <MessageView
            key={`stream-${streamProgress.requestId}`}
            message={{
              id: `stream-${streamProgress.requestId}`,
              sessionId: streamProgress.sessionId ?? "",
              role: "assistant",
              content: streamProgress.text ?? "",
              contentParams: null,
              messageParams: streamProgress.reasoningText ? { reasoning_content: streamProgress.reasoningText } : null,
              compacted: false,
              visible: true,
              createTime: streamProgress.startedAt,
              updateTime: new Date().toISOString(),
            }}
            collapsed={false}
            width={mainWidth}
          />
        ) : null}
        {busy || statusLine ? <StatusLine busy={busy} text={statusLine} /> : null}
        {errorLine ? (
          <Box>
            <Text color="red">Error: {errorLine}</Text>
          </Box>
        ) : null}
        {showProcessStdout ? (
          <ProcessStdoutView
            processStdoutRef={processStdoutRef}
            runningProcesses={runningProcesses}
            onDismiss={handleDismissProcessStdout}
            onAdjustTimeout={handleAdjustBashTimeout}
            screenWidth={mainWidth}
            screenHeight={screenHeight}
          />
        ) : view === "session-list" ? (
          <SessionList
            sessions={sessions}
            onSelect={(id) => void handleSelectSession(id)}
            onCancel={() => setView("chat")}
            onDelete={(id) => {
              void handleDeleteSession(id);
            }}
            onRename={(id, newName) => {
              if (sessionManager.renameSession(id, newName)) {
                refreshSessionsList();
                setStatusLine(`Session renamed to "${newName}".`);
              } else {
                setErrorLine("Failed to rename session.");
              }
            }}
          />
        ) : view === "undo" ? (
          <UndoSelector
            targets={undoTargets}
            onSelect={(target, restoreMode) => void handleUndoRestore(target, restoreMode)}
            onCancel={() => {
              setPromptDraft(null);
              navigateToSubView("chat");
            }}
          />
        ) : view === "mcp-status" ? (
          <McpStatusList
            statuses={mcpStatuses}
            onCancel={() => navigateToSubView("chat")}
            onReconnect={(name) => {
              const latest = resolveCurrentSettings(projectRoot);
              void sessionManager.reconnectMcpServer(name, latest.mcpServers?.[name]);
            }}
          />
        ) : view === "help" ? (
          <HelpView onExit={() => navigateToSubView("chat")} />
        ) : view === "agents-config" ? (
          <AgentsConfigView projectRoot={projectRoot} onExit={() => navigateToSubView("chat")} />
        ) : view === "team-create" ? (
          <TeamCreateView
            projectRoot={projectRoot}
            screenWidth={mainWidth}
            onRunTask={(taskText: string) => {
              navigateToSubView("chat");
              void runTeamTask(taskText);
            }}
            onStartTeam={startTeamWithTmux}
            onExit={() => navigateToSubView("chat")}
          />
        ) : view === "settings" ? (
          <SettingsView
            projectRoot={projectRoot}
            onExit={() => {
              setResolvedSettings(resolveCurrentSettings(projectRoot));
              navigateToSubView("chat");
            }}
          />
        ) : view === "status" ? (
          <QueryView
            projectRoot={projectRoot}
            sessionInfo={{
              activeSessionId: sessionManager.getActiveSessionId(),
              activeStatus: activeStatus,
              activeTokens: sessionManager.getSession(sessionManager.getActiveSessionId() ?? "")?.activeTokens ?? 0,
              messageCount: messages.length,
              sessionCount: sessions.length,
            }}
            modelInfo={{
              model: resolvedSettings.model,
              baseURL: resolvedSettings.baseURL,
              thinkingEnabled: resolvedSettings.thinkingEnabled,
              reasoningEffort: resolvedSettings.reasoningEffort,
            }}
            runtimeInfo={{
              executionMode,
              permissionDefaultMode: resolvedSettings.permissions.defaultMode,
            }}
            topic={_statusTopic}
            onExit={() => navigateToSubView("chat")}
          />
        ) : view === "bg" ? (
          <BackgroundProcessesView
            processStdoutRef={processStdoutRef}
            runningProcesses={runningProcesses}
            sessionProcessCount={sessionProcessCount}
            onDismiss={() => navigateToSubView("chat")}
            screenWidth={mainWidth}
            screenHeight={screenHeight}
          />
        ) : view === "queue" ? (
          <QueueView
            projectRoot={projectRoot}
            onExit={() => navigateToSubView("chat")}
            onProcessTask={handleQueueProcessTask}
            screenWidth={mainWidth}
            promptHistory={promptHistory}
            queueVisible={queueVisible}
            onToggleVisibility={handleToggleQueueVisibility}
            refreshTick={queueRefreshTick}
          />
        ) : shouldShowQuestionPrompt && pendingQuestion && !busy ? (
          <AskUserQuestionPrompt
            questions={pendingQuestion.questions}
            onSubmit={handleQuestionAnswers}
            onCancel={handleQuestionCancel}
          />
        ) : activeStatus === "ask_permission" &&
          activeAskPermissions &&
          activeAskPermissions.length > 0 &&
          !pendingPermissionReply &&
          !busy ? (
          <PermissionPrompt
            requests={activeAskPermissions}
            onSubmit={handlePermissionResult}
            onCancel={handlePermissionCancel}
          />
        ) : isExiting ? null : (
          <PromptInput
            projectRoot={projectRoot}
            screenWidth={mainWidth}
            skills={skills}
            modelConfig={resolvedSettings}
            promptHistory={promptHistory}
            busy={busy}
            cursorLayoutKey={promptCursorLayoutKey}
            loadingText={loadingText}
            runningProcesses={runningProcesses}
            promptDraft={promptDraft}
            onSubmit={handleSubmit}
            onModelConfigChange={handleModelConfigChange}
            onRawModeChange={handleRawModeChange}
            onInterrupt={handleInterrupt}
            onToggleProcessStdout={handleToggleProcessStdout}
            onQueueWhenBusy={handleQueueWhenBusy}
            executionMode={executionMode}
            onTogglePlanMode={handleTogglePlanMode}
            onToggleAutoMode={handleToggleAutoMode}
            onToggleTodoPanel={handleToggleTodoPanel}
            placeholder="Type your message..."
          />
        )}
      </Box>
      {showPanel && (
        <Box
          flexDirection="column"
          width={todoPanelWidth}
          borderStyle="round"
          borderColor="cyan"
          marginLeft={1}
          paddingX={1}
        >
          <Text bold color="cyan">
            📋 Action Plan
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {latestPlanLines.map((line, idx) => {
              const isActive = line.startsWith("- [>]") || line.startsWith("- [x]") || line.includes("[>]");
              const isDone = line.startsWith("- [x]");
              let color = "white";
              if (isActive) color = "yellow";
              else if (isDone) color = "gray";

              let cleanLine = line;
              if (line.startsWith("- [ ]")) {
                cleanLine = "  ☐ " + line.slice(5).trim();
              } else if (line.startsWith("- [x]")) {
                cleanLine = "  ✔ " + line.slice(5).trim();
              } else if (line.startsWith("- [>]")) {
                cleanLine = "  ▸ " + line.slice(5).trim();
              } else if (line.startsWith("- ")) {
                cleanLine = "  • " + line.slice(2).trim();
              }

              return (
                <Text key={idx} color={color} wrap="truncate-end">
                  {cleanLine}
                </Text>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default App;
