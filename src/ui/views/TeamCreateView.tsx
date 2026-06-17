import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import path from "path";
import fs from "fs";
import DropdownMenu from "../components/DropdownMenu";
import { MODEL_COMMAND_MODELS, MODEL_COMMAND_THINKING_OPTIONS } from "../components/ModelsDropdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamAgentRule {
  name: string;
  prompt: string;
  model?: string;
  /** Custom API key for this agent. Falls back to global key if omitted. */
  apiKey?: string;
  /** Custom base URL for this agent. Supports different providers (OpenAI, Anthropic, Gemini, Ollama). */
  baseURL?: string;
  /** Enable thinking mode for this agent. */
  thinkingEnabled?: boolean;
  /** Reasoning effort level when thinking is enabled. */
  reasoningEffort?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_OPTIONS = ["", "gpt-4", "deepseek-v4", "claude-3-opus", "claude-3-sonnet"];

function modelLabel(m: string): string {
  const labels: Record<string, string> = {
    "": "Inherit",
    "gpt-4": "GPT-4",
    "deepseek-v4": "DeepSeek V4",
    "claude-3-opus": "Claude 3 Opus",
    "claude-3-sonnet": "Claude 3 Sonnet",
  };
  return labels[m] ?? m;
}

const DEFAULT_AGENTS: TeamAgentRule[] = [
  {
    name: "Frontend Worker",
    prompt:
      "You are a frontend development expert. Focus on UI/UX, React components, styles, and frontend architecture.",
  },
  {
    name: "Backend Worker",
    prompt:
      "You are a backend development expert. Focus on API design, data models, business logic, and backend architecture.",
  },
  {
    name: "Reviewer",
    prompt:
      "You are a quality assurance expert. Review all code for bugs, edge cases, performance issues, and test coverage.",
  },
];

const CONFIG_FILE = ".anng/team-agents.json";

// Brand accent color — burnt copper, matching the design system
const BRAND = "#D4704B";
const BRAND_DIM = "#D4704Be6";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadAgents(projectRoot: string): TeamAgentRule[] {
  try {
    const configPath = path.join(projectRoot, CONFIG_FILE);
    if (!fs.existsSync(configPath)) return DEFAULT_AGENTS.map((a) => ({ ...a }));
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return DEFAULT_AGENTS.map((a) => ({ ...a }));
    return data.map((a: Record<string, unknown>) => ({
      name: String(a.name ?? "Unnamed"),
      prompt: String(a.prompt ?? ""),
      model: a.model ? String(a.model) : undefined,
      apiKey: a.apiKey ? String(a.apiKey) : undefined,
      baseURL: a.baseURL ? String(a.baseURL) : undefined,
      thinkingEnabled: typeof a.thinkingEnabled === "boolean" ? a.thinkingEnabled : undefined,
      reasoningEffort: a.reasoningEffort ? String(a.reasoningEffort) : undefined,
    }));
  } catch {
    return DEFAULT_AGENTS.map((a) => ({ ...a }));
  }
}

function saveAgents(projectRoot: string, agents: TeamAgentRule[]): void {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(agents, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TeamCreateViewProps {
  projectRoot: string;
  onRunTask: (taskText: string) => void;
  onStartTeam: (taskText: string, agents: TeamAgentRule[]) => void;
  onExit: () => void;
  screenWidth: number;
}

export function TeamCreateView({
  projectRoot,
  onRunTask,
  onStartTeam,
  onExit,
  screenWidth,
}: TeamCreateViewProps): React.ReactNode {
  const [agents, setAgents] = useState<TeamAgentRule[]>(() => loadAgents(projectRoot));
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState<false | "name" | "prompt" | "apiKey" | "baseURL" | "model">(false);
  const [editBuffer, setEditBuffer] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [focus, setFocus] = useState<"agents" | "task">("agents");
  const [msg, setMsg] = useState("");
  const [configStep, setConfigStep] = useState<false | "model" | "thinking">(false);
  const [configModelIdx, setConfigModelIdx] = useState(0);
  const [configPendingModel, setConfigPendingModel] = useState<string | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    return () => {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    };
  }, []);

  const flash = useCallback((text: string) => {
    setMsg(text);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setMsg(""), 2000);
  }, []);

  // ---- Handlers ----

  const addAgent = useCallback(() => {
    const n = agents.length + 1;
    setAgents((prev) => [
      ...prev,
      {
        name: `Worker ${n}`,
        prompt: `You are a general purpose worker on this team (worker-${n}).`,
      },
    ]);
    flash("Agent added.");
  }, [agents.length, flash]);

  const deleteAgent = useCallback(() => {
    if (agents.length <= 1) {
      flash("Need at least 1 agent.");
      return;
    }
    setAgents((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx((i) => Math.min(i, agents.length - 2));
    flash("Agent deleted.");
  }, [agents.length, selectedIdx, flash]);

  const openModelConfig = useCallback(() => {
    const currentModel = agents[selectedIdx]?.model ?? "";
    const allModels = ["", ...MODEL_COMMAND_MODELS];
    const idx = allModels.indexOf(currentModel);
    setConfigModelIdx(Math.max(0, idx));
    setConfigPendingModel(null);
    setConfigStep("model");
  }, [agents, selectedIdx]);

  const applyModelConfig = useCallback(
    (model: string, thinkingEnabled?: boolean, reasoningEffort?: string) => {
      setAgents((prev) => {
        const next = [...prev];
        next[selectedIdx] = {
          ...next[selectedIdx],
          model: model || undefined,
          thinkingEnabled: thinkingEnabled ?? next[selectedIdx].thinkingEnabled,
          reasoningEffort: reasoningEffort ?? next[selectedIdx].reasoningEffort,
        };
        return next;
      });
      setConfigStep(false);
      setConfigPendingModel(null);
      flash("Model updated.");
    },
    [selectedIdx, flash]
  );

  const startEditName = useCallback(() => {
    setEditing("name");
    setEditBuffer(agents[selectedIdx]?.name ?? "");
  }, [agents, selectedIdx]);

  const startEditPrompt = useCallback(() => {
    setEditing("prompt");
    setEditBuffer(agents[selectedIdx]?.prompt ?? "");
  }, [agents, selectedIdx]);

  const startEditApiKey = useCallback(() => {
    setEditing("apiKey");
    setEditBuffer(agents[selectedIdx]?.apiKey ?? "");
  }, [agents, selectedIdx]);

  const startEditBaseUrl = useCallback(() => {
    setEditing("baseURL");
    setEditBuffer(agents[selectedIdx]?.baseURL ?? "");
  }, [agents, selectedIdx]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const val = editBuffer.trim();
    if (!val && editing === "name") {
      flash("Name cannot be empty.");
      return;
    }
    setAgents((prev) => {
      const next = [...prev];
      if (editing === "apiKey" || editing === "baseURL") {
        next[selectedIdx] = { ...next[selectedIdx], [editing]: val || undefined };
      } else if (editing === "model") {
        next[selectedIdx] = { ...next[selectedIdx], model: val || undefined };
      } else {
        next[selectedIdx] = { ...next[selectedIdx], [editing]: val };
      }
      return next;
    });
    setEditing(false);
    setEditBuffer("");
    const labels: Record<string, string> = {
      name: "Name",
      prompt: "Prompt",
      apiKey: "API Key",
      baseURL: "Base URL",
      model: "Model",
    };
    flash(`${labels[editing] ?? editing} updated.`);
  }, [editing, editBuffer, selectedIdx, flash]);

  const handleRun = useCallback(() => {
    const trimmed = taskInput.trim();
    if (!trimmed) {
      flash("Type a task description first.");
      return;
    }
    saveAgents(projectRoot, agentsRef.current);
    onRunTask(trimmed);
  }, [taskInput, projectRoot, onRunTask, flash]);

  const handleStartTeam = useCallback(() => {
    const trimmed = taskInput.trim();
    if (!trimmed) {
      flash("Type a task description first.");
      return;
    }
    saveAgents(projectRoot, agentsRef.current);
    onStartTeam(trimmed, agentsRef.current);
  }, [taskInput, projectRoot, onStartTeam, flash]);

  // ---- Input ----

  useInput((input, key) => {
    // ---------- Model/Thinking config mode ----------
    if (configStep === "model" || configStep === "thinking") {
      const options = configStep === "model" ? [...MODEL_COMMAND_MODELS, "__custom__"] : MODEL_COMMAND_THINKING_OPTIONS;
      const optionCount = options.length;
      if (key.upArrow) {
        setConfigModelIdx((i) => (i - 1 + optionCount) % optionCount);
        return;
      }
      if (key.downArrow) {
        setConfigModelIdx((i) => (i + 1) % optionCount);
        return;
      }
      if (key.escape || key.tab) {
        setConfigStep(false);
        setConfigPendingModel(null);
        return;
      }
      if (input === " " || key.return) {
        if (configStep === "model") {
          const selectedModel = MODEL_COMMAND_MODELS[configModelIdx] ?? "";
          if (configModelIdx >= MODEL_COMMAND_MODELS.length) {
            // "Custom model..." option — switch to inline editing for model name
            setEditing("model");
            setEditBuffer(agents[selectedIdx]?.model ?? "");
            setConfigStep(false);
            return;
          }
          setConfigPendingModel(selectedModel || null);
          // Move to thinking config step
          setConfigStep("thinking");
          setConfigModelIdx(0);
        } else {
          // configStep === "thinking"
          const opt = MODEL_COMMAND_THINKING_OPTIONS[configModelIdx];
          if (opt) {
            applyModelConfig(
              configPendingModel ?? agents[selectedIdx]?.model ?? "",
              opt.thinkingEnabled,
              opt.reasoningEffort
            );
          }
        }
        return;
      }
      return; // block all other keys during config
    }

    // ---------- Edit mode ----------
    if (editing) {
      if (key.escape) {
        setEditing(false);
        setEditBuffer("");
        return;
      }
      if (key.return) {
        commitEdit();
        return;
      }
      if (key.backspace || key.delete) {
        setEditBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setEditBuffer((prev) => prev + input);
      }
      return;
    }

    // ---------- List mode ----------

    if (focus === "agents") {
      if (key.upArrow) {
        setSelectedIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || (key.tab && selectedIdx < agents.length)) {
        if (selectedIdx >= agents.length - 1) {
          setFocus("task");
        } else {
          setSelectedIdx((i) => Math.min(agents.length - 1, i + 1));
        }
        return;
      }
      if (input === "a" || input === "A") {
        addAgent();
        return;
      }
      if (input === "d" || input === "D") {
        deleteAgent();
        return;
      }
      if (input === "n" || input === "N") {
        startEditName();
        return;
      }
      if (input === "p" || input === "P") {
        startEditPrompt();
        return;
      }
      if (input === "m" || input === "M" || key.rightArrow) {
        openModelConfig();
        return;
      }
      if (input === "k" || input === "K") {
        startEditApiKey();
        return;
      }
      if (input === "u" || input === "U") {
        startEditBaseUrl();
        return;
      }
    }

    // ---------- Task mode / global keys ----------

    if (key.upArrow && focus === "task") {
      setFocus("agents");
      setSelectedIdx(0);
      return;
    }

    // When focus is on agents, only agent operation keys should be active.
    // Block global actions like Enter (run task), Escape (exit view),
    // Backspace/Delete (modify task input) when navigating agents.
    if (focus === "agents") {
      return;
    }

    // Only S when in task mode (or task has content)
    if ((input === "s" || input === "S") && (key.ctrl || key.meta) && taskInput.trim()) {
      handleStartTeam();
      return;
    }
    if (key.return && taskInput.trim()) {
      handleRun();
      return;
    }
    if (key.escape) {
      onExit();
      return;
    }
    if (key.backspace || key.delete) {
      setTaskInput((prev) => prev.slice(0, -1));
      return;
    }

    // Type characters → task input
    if (input && !key.ctrl && !key.meta) {
      setTaskInput((prev) => prev + input);
    }
  });

  // ---- Render ----

  const columnWidth = Math.max(80, screenWidth);

  return (
    <Box flexDirection="column" width={columnWidth} minWidth={80}>
      {/* Header */}
      <Box>
        <Text bold color={BRAND}>
          {"\u2550".repeat(columnWidth > 120 ? 80 : 50)} Team Builder {"\u2550".repeat(columnWidth > 120 ? 80 : 50)}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Configure agents and type a task below. Press </Text>
        <Text color="green">Enter</Text>
        <Text dimColor> to run internally or </Text>
        <Text color={BRAND}>Ctrl+S</Text>
        <Text dimColor> to start in tmux.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor> Keys: </Text>
        <Text color={BRAND}>↑↓</Text>
        <Text dimColor> Select </Text>
        <Text color={BRAND}>A</Text>
        <Text dimColor> Add </Text>
        <Text color={BRAND}>D</Text>
        <Text dimColor> Del </Text>
        <Text color={BRAND}>N</Text>
        <Text dimColor> Name </Text>
        <Text color={BRAND}>P</Text>
        <Text dimColor> Prompt </Text>
        <Text color={BRAND}>M/→</Text>
        <Text dimColor> Model </Text>
        <Text color={BRAND}>K</Text>
        <Text dimColor> API </Text>
        <Text color={BRAND}>U</Text>
        <Text dimColor> URL </Text>
        <Text color={BRAND}>Esc</Text>
        <Text dimColor> Back </Text>
      </Box>

      {/* Focus indicator */}
      <Box marginTop={1} marginLeft={1}>
        <Text dimColor>
          {focus === "agents" ? (
            <Text color={BRAND} bold>
              ▸ Agents
            </Text>
          ) : (
            <Text> Agents</Text>
          )}
          <Text> · </Text>
          {focus === "task" ? (
            <Text color={BRAND} bold>
              ▸ Task
            </Text>
          ) : (
            <Text> Task</Text>
          )}
        </Text>
      </Box>

      {/* Agent list */}
      {agents.map((agent, i) => {
        const isSelected = i === selectedIdx;
        const prefix = isSelected ? "\u276F" : " ";
        const label =
          editing && isSelected
            ? `${prefix} ${i + 1}. ${editing === "name" ? "" : "["}${editBuffer}${editing === "prompt" ? "]" : ""}`
            : `${prefix} ${i + 1}. ${agent.name}`;

        // Determine provider display
        const modelDisplay = modelLabel(agent.model ?? "");
        const providerMap: Record<string, string> = {
          "gpt-4": "OpenAI",
          "gpt-4o": "OpenAI",
          "gpt-4o-mini": "OpenAI",
          "deepseek-v4": "DeepSeek",
          "deepseek-chat": "DeepSeek",
          "claude-3-opus": "Anthropic",
          "claude-3-sonnet": "Anthropic",
          "claude-3-haiku": "Anthropic",
          "claude-4": "Anthropic",
          "gemini-pro": "Google",
          "gemini-2.0-flash": "Google",
        };
        const provider = agent.model ? (providerMap[agent.model] ?? (agent.baseURL ? "Custom" : "Inherit")) : "Inherit";
        const hasCustomApi = agent.apiKey || agent.baseURL;
        const providerTag = hasCustomApi ? `${provider} \u2605` : provider;

        return (
          <Box key={`agent-${i}`} marginLeft={1} flexDirection="column">
            <Box>
              <Text color={isSelected ? BRAND : undefined} bold={isSelected}>
                {label}
              </Text>
              <Text dimColor> — </Text>
              <Text color={agent.model ? "green" : "gray"}>{modelDisplay}</Text>
              <Text dimColor> · </Text>
              <Text color={hasCustomApi ? BRAND : "gray"}>{providerTag}</Text>
            </Box>
            {isSelected && !editing && (
              <Box marginLeft={2}>
                <Text dimColor>{agent.prompt.length > 70 ? agent.prompt.slice(0, 68) + "\u2026" : agent.prompt}</Text>
              </Box>
            )}
            {isSelected && !editing && hasCustomApi && (
              <Box marginLeft={2}>
                <Text color={BRAND_DIM}>
                  API: {agent.apiKey ? "***" + agent.apiKey.slice(-4) : "Inherit"}
                  {agent.baseURL
                    ? ` @ ${agent.baseURL.length > 40 ? agent.baseURL.slice(0, 38) + "…" : agent.baseURL}`
                    : ""}
                </Text>
              </Box>
            )}
            {isSelected && !editing && agent.thinkingEnabled !== undefined && (
              <Box marginLeft={2}>
                <Text color={BRAND_DIM}>
                  Thinking: {agent.thinkingEnabled ? (agent.reasoningEffort ?? "enabled") : "disabled"}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Divider */}
      <Box marginTop={1}>
        <Text dimColor>{"\u2500".repeat(Math.min(columnWidth - 2, 78))}</Text>
      </Box>

      {/* Task input */}
      <Box marginTop={1} marginLeft={1}>
        {editing ? (
          <Text>
            <Text color={BRAND}>Edit {editing}:</Text>{" "}
            <Text>
              {editing === "name" || editing === "apiKey" || editing === "baseURL" || editing === "model"
                ? editBuffer
                : editBuffer.slice(0, 80)}
            </Text>
            <Text>_</Text>
          </Text>
        ) : (
          <Box flexDirection="column">
            <Box>
              <Text bold>Task: </Text>
              <Text>{taskInput || <Text dimColor>Type your task here, then press Enter\u2026</Text>}</Text>
              {taskInput.length > 0 && <Text>_</Text>}
            </Box>
            {taskInput.trim() ? (
              <Box marginTop={1} flexDirection="column">
                <Box>
                  <Text dimColor>
                    Configured {agents.length} agent{agents.length > 1 ? "s" : ""} for:{" "}
                  </Text>
                  <Text color="green" bold>
                    {taskInput.length > 50 ? taskInput.slice(0, 48) + "\u2026" : taskInput}
                  </Text>
                </Box>
                <Box marginTop={1}>
                  <Text color={BRAND}>[Enter] Run internally</Text>
                  <Text> </Text>
                  <Text color={BRAND}>[Ctrl+S] Start Team (tmux panels)</Text>
                </Box>
              </Box>
            ) : null}
          </Box>
        )}
      </Box>

      {/* Model / Thinking Config UI */}
      {configStep === "model" ? (
        <Box marginTop={1}>
          <DropdownMenu
            width={columnWidth}
            title="Select Model"
            helpText="↑↓ navigate · Enter select · Space select · Esc/Tab cancel · 'Custom model...' to type any name"
            items={[
              { key: "inherit", label: "Inherit (Default)", selected: !agents[selectedIdx]?.model },
              ...MODEL_COMMAND_MODELS.map((m) => ({
                key: m,
                label: m,
                selected: agents[selectedIdx]?.model === m,
              })),
              { key: "__custom__", label: "Custom model...", selected: false },
            ]}
            activeIndex={configModelIdx}
            activeColor={BRAND}
            maxVisible={10}
          />
        </Box>
      ) : configStep === "thinking" ? (
        <Box marginTop={1}>
          <DropdownMenu
            width={columnWidth}
            title="Select Thinking Mode"
            helpText="↑↓ navigate · Enter/Space apply · Esc/Tab cancel"
            items={MODEL_COMMAND_THINKING_OPTIONS.map((opt, i) => ({
              key: opt.label,
              label: opt.label,
              description: opt.thinkingEnabled ? `reasoningEffort: ${opt.reasoningEffort}` : "thinking disabled",
              selected: i === configModelIdx,
            }))}
            activeIndex={configModelIdx}
            activeColor={BRAND}
            maxVisible={6}
          />
        </Box>
      ) : null}

      {/* Status / Error */}
      {msg ? (
        <Box marginTop={1} marginLeft={1}>
          <Text color={BRAND}>{msg}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
