import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import * as fs from "fs";
import * as path from "path";
import { MODEL_COMMAND_MODELS, MODEL_COMMAND_THINKING_OPTIONS } from "../components/ModelsDropdown";

type AgentRule = {
  name: string;
  prompt: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: string;
  apiKey?: string;
  baseURL?: string;
};

export function AgentsConfigView({ projectRoot, onExit }: { projectRoot: string; onExit: () => void }) {
  const [agents, setAgents] = useState<AgentRule[]>([
    { name: "Frontend Worker", prompt: "", model: "" },
    { name: "Backend Worker", prompt: "", model: "" },
    { name: "Database Expert", prompt: "", model: "" },
    { name: "QA/Reviewer", prompt: "", model: "" },
  ]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingField, setEditingField] = useState<"prompt" | "name" | "apiKey" | "baseURL" | null>(null);
  const [inputBuffer, setInputBuffer] = useState("");

  const configPath = path.join(projectRoot, ".anng", "team-agents.json");

  useEffect(() => {
    try {
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (Array.isArray(data)) {
          setAgents(data);
        }
      }
    } catch (_e) {
      // Ignore
    }
  }, [configPath]);

  const saveConfig = (newAgents: AgentRule[]) => {
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(newAgents, null, 2));
    } catch (_e) {
      // Ignore
    }
  };

  useInput((input, key) => {
    // Escape handling: Ink's useInput reports escape as input === "\u001b"
    if (input === "\u001b" || input === "\x1b") {
      if (editingField) {
        setEditingField(null);
      } else {
        onExit();
      }
      return;
    }
    if (editingField) {
      if (key.return) {
        const next = [...agents];
        if (editingField === "prompt") {
          next[selectedIndex].prompt = inputBuffer;
        } else if (editingField === "name") {
          next[selectedIndex].name = inputBuffer || "New Agent";
        } else if (editingField === "apiKey") {
          next[selectedIndex].apiKey = inputBuffer || undefined;
        } else if (editingField === "baseURL") {
          next[selectedIndex].baseURL = inputBuffer || undefined;
        }
        setAgents(next);
        saveConfig(next);
        setEditingField(null);
        return;
      }
      if (key.backspace) {
        setInputBuffer((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        setInputBuffer((s) => s + input.replace(/\r/g, ""));
      }
    } else {
      if (key.upArrow) {
        setSelectedIndex((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSelectedIndex((s) => Math.min(agents.length - 1, s + 1));
      } else if (input === "a" || input === "A") {
        const newAgent = { name: "New Agent", prompt: "", model: "" };
        const next = [...agents, newAgent];
        setAgents(next);
        saveConfig(next);
        setSelectedIndex(next.length - 1);
        setEditingField("name");
        setInputBuffer("");
      } else if (agents.length > 0) {
        if (input === "m" || input === "M") {
          const next = [...agents];
          const currModel = next[selectedIndex].model;
          const currIdx = MODEL_COMMAND_MODELS.findIndex((m) => m === currModel);
          const nextIdx = (currIdx + 1) % (MODEL_COMMAND_MODELS.length + 1);
          next[selectedIndex].model = nextIdx === MODEL_COMMAND_MODELS.length ? "" : MODEL_COMMAND_MODELS[nextIdx];
          setAgents(next);
          saveConfig(next);
        } else if (input === "r" || input === "R") {
          const next = [...agents];
          const agent = next[selectedIndex];
          const currIdx = MODEL_COMMAND_THINKING_OPTIONS.findIndex(
            (o) => o.thinkingEnabled === agent.thinkingEnabled && o.reasoningEffort === agent.reasoningEffort
          );
          const nextIdx = (Math.max(0, currIdx) + 1) % MODEL_COMMAND_THINKING_OPTIONS.length;
          const opt = MODEL_COMMAND_THINKING_OPTIONS[nextIdx];
          agent.thinkingEnabled = opt?.thinkingEnabled;
          agent.reasoningEffort = opt?.reasoningEffort;
          setAgents(next);
          saveConfig(next);
        } else if (input === "n" || input === "N") {
          setInputBuffer(agents[selectedIndex].name);
          setEditingField("name");
        } else if (input === "k" || input === "K") {
          setInputBuffer(agents[selectedIndex].apiKey || "");
          setEditingField("apiKey");
        } else if (input === "u" || input === "U") {
          setInputBuffer(agents[selectedIndex].baseURL || "");
          setEditingField("baseURL");
        } else if (input === "d" || input === "D" || key.delete) {
          const next = agents.filter((_, i) => i !== selectedIndex);
          setAgents(next);
          saveConfig(next);
          setSelectedIndex(Math.max(0, Math.min(selectedIndex, next.length - 1)));
        } else if (key.return) {
          setInputBuffer(agents[selectedIndex].prompt || "");
          setEditingField("prompt");
        }
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">
        Team Custom Agents Configuration
      </Text>
      <Text dimColor>Saved to .anng/team-agents.json</Text>
      <Text dimColor>
        ↑/↓: Select | Enter: Edit Rules | N: Edit Name | A: Add | D: Delete | M: Model | R: Reasoning | K: API Key | U:
        Base URL
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {agents.map((agent, i) => {
          let reasoningStr = "";
          if (agent.thinkingEnabled !== undefined) {
            reasoningStr = agent.thinkingEnabled
              ? `(Thinking: ${agent.reasoningEffort ?? "default"})`
              : "(No thinking)";
          }
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text>
                {i === selectedIndex && !editingField ? <Text color="green">{"> "}</Text> : "  "}
                <Text bold={i === selectedIndex}>{agent.name}</Text>
              </Text>
              <Text dimColor>
                {" "}
                Model: {agent.model || "Default"} {reasoningStr}
              </Text>
              <Text dimColor> Rules: {agent.prompt || "(No rules defined)"}</Text>
              {agent.apiKey ? <Text dimColor> API: ***{agent.apiKey.slice(-4)}</Text> : null}
              {agent.baseURL ? (
                <Text dimColor>
                  {" "}
                  URL: {agent.baseURL.length > 50 ? agent.baseURL.slice(0, 48) + "…" : agent.baseURL}
                </Text>
              ) : null}
            </Box>
          );
        })}
        {agents.length === 0 && <Text dimColor> No agents defined.</Text>}
      </Box>
      {editingField && (
        <Box marginTop={1}>
          <Text color="yellow">
            Edit {agents[selectedIndex]?.name} {editingField}:{" "}
          </Text>
          <Text>{inputBuffer}█</Text>
        </Box>
      )}
    </Box>
  );
}
