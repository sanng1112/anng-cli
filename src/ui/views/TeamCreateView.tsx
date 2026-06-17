import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamAgentRule {
  name: string;
  prompt: string;
  model?: string;
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
  onExit: () => void;
  screenWidth: number;
}

export function TeamCreateView({ projectRoot, onRunTask, onExit, screenWidth }: TeamCreateViewProps): React.ReactNode {
  const [agents, setAgents] = useState<TeamAgentRule[]>(() => loadAgents(projectRoot));
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState<false | "name" | "prompt">(false);
  const [editBuffer, setEditBuffer] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [msg, setMsg] = useState("");
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

  const cycleModel = useCallback(() => {
    setAgents((prev) => {
      const next = [...prev];
      const cur = next[selectedIdx];
      const idx = MODEL_OPTIONS.indexOf(cur.model ?? "");
      next[selectedIdx] = {
        ...cur,
        model: MODEL_OPTIONS[(idx + 1) % MODEL_OPTIONS.length] || undefined,
      };
      return next;
    });
  }, [selectedIdx]);

  const startEditName = useCallback(() => {
    setEditing("name");
    setEditBuffer(agents[selectedIdx]?.name ?? "");
  }, [agents, selectedIdx]);

  const startEditPrompt = useCallback(() => {
    setEditing("prompt");
    setEditBuffer(agents[selectedIdx]?.prompt ?? "");
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
      next[selectedIdx] = { ...next[selectedIdx], [editing]: val };
      return next;
    });
    setEditing(false);
    setEditBuffer("");
    flash(editing === "name" ? "Name updated." : "Prompt updated.");
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

  // ---- Input ----

  useInput((input, key) => {
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

    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || (key.tab && selectedIdx < agents.length - 1)) {
      setSelectedIdx((i) => Math.min(agents.length - 1, i + 1));
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
    if (input === "m" || input === "M") {
      cycleModel();
      return;
    }
    if (key.return) {
      if (taskInput.trim()) {
        handleRun();
      } else {
        startEditPrompt();
      }
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
        <Text bold color="cyan">
          {"\u2550".repeat(columnWidth > 120 ? 80 : 50)} Team Builder {"\u2550".repeat(columnWidth > 120 ? 80 : 50)}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Configure agents for your team. Then type a task and press Enter to run.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor> Shortcuts: </Text>
        <Text color="yellow">A</Text>
        <Text dimColor> Add </Text>
        <Text color="yellow">D</Text>
        <Text dimColor> Del </Text>
        <Text color="yellow">N</Text>
        <Text dimColor> Name </Text>
        <Text color="yellow">M</Text>
        <Text dimColor> Model </Text>
        <Text color="yellow">Enter</Text>
        <Text dimColor> Edit prompt / Run </Text>
        <Text color="yellow">Esc</Text>
        <Text dimColor> Back </Text>
      </Box>

      {/* Spacer */}
      <Box marginTop={1} />

      {/* Agent list */}
      {agents.map((agent, i) => {
        const isSelected = i === selectedIdx;
        const prefix = isSelected ? "\u276F" : " ";
        const label =
          editing && isSelected
            ? `${prefix} ${i + 1}. ${editing === "name" ? "" : "["}${editBuffer}${editing === "prompt" ? "]" : ""}`
            : `${prefix} ${i + 1}. ${agent.name}`;

        return (
          <Box key={`agent-${i}`} marginLeft={1}>
            <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
              {label}
            </Text>
            <Text dimColor> — {modelLabel(agent.model ?? "")}</Text>
            {isSelected && !editing && (
              <Text dimColor>
                {"  "}
                {agent.prompt.length > 60 ? agent.prompt.slice(0, 58) + "\u2026" : agent.prompt}
              </Text>
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
            <Text color="yellow">Edit {editing}:</Text>{" "}
            <Text>{editing === "name" ? editBuffer : editBuffer.slice(0, 80)}</Text>
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
              <Box marginTop={1}>
                <Text dimColor>
                  Running with {agents.length} agent{agents.length > 1 ? "s" : ""} on:{" "}
                </Text>
                <Text color="green" bold>
                  {taskInput.length > 50 ? taskInput.slice(0, 48) + "\u2026" : taskInput}
                </Text>
              </Box>
            ) : null}
          </Box>
        )}
      </Box>

      {/* Status / Error */}
      {msg ? (
        <Box marginTop={1} marginLeft={1}>
          <Text color="yellow">{msg}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
