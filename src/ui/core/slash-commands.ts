/**
 * Slash Commands
 *
 * Defines the slash command registry for ANNG CLI's TUI.
 * Commands are classified by source: "tui" (built-in), "runtime" (skills/workflows),
 * or "plugin" (external extensions).
 *
 * When a command is sent to the LLM, the prompt is wrapped in:
 *   <user_command slash="name">instructions</user_command>
 *
 * Inspired by Cline's slash-command-registry.ts.
 */

import type { SkillInfo } from "../../session";

// =============================================================================
// Types
// =============================================================================

export type SlashCommandKind =
  | "settings"
  | "model"
  | "new"
  | "init"
  | "resume"
  | "continue"
  | "undo"
  | "mcp"
  | "raw"
  | "exit"
  | "team"
  | "custom-agents"
  | "skills"
  | "skill"
  | "workflow";

export type SlashCommandSource = "tui" | "runtime" | "plugin";

export type SlashCommandItem = {
  kind: SlashCommandKind;
  name: string;
  label: string;
  description: string;
  source: SlashCommandSource;
  instructions?: string;
  preserveInput?: boolean;
  args?: string[];
  visible: boolean;
  group?: string;
  isGroupStart?: boolean;
  skill?: SkillInfo;
};

// =============================================================================
// Built-in TUI Commands
// =============================================================================

export const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    kind: "settings",
    name: "settings",
    label: "/settings",
    description: "Manage API Key, Base URL, Models, and other configurations",
    source: "tui",
    visible: true,
    group: "Built-in Commands",
  },
  {
    kind: "skills",
    name: "skills",
    label: "/skills",
    description: "List available skills",
    source: "tui",
    visible: true,
  },
  {
    kind: "model",
    name: "model",
    label: "/model",
    description: "Select model, thinking mode and effort control",
    source: "tui",
    visible: true,
  },
  {
    kind: "new",
    name: "new",
    label: "/new",
    description: "Start a fresh conversation",
    source: "tui",
    visible: true,
  },
  {
    kind: "init",
    name: "init",
    label: "/init",
    description: "Initialize an AGENTS.md file with instructions for LLM",
    source: "tui",
    visible: true,
  },
  {
    kind: "resume",
    name: "resume",
    label: "/resume",
    description: "Pick a previous conversation to continue",
    source: "tui",
    visible: true,
  },
  {
    kind: "continue",
    name: "continue",
    label: "/continue",
    description: "Continue the active conversation or pick one to resume",
    source: "tui",
    visible: true,
  },
  {
    kind: "undo",
    name: "undo",
    label: "/undo",
    description: "Restore code and/or conversation to a previous point",
    source: "tui",
    visible: true,
  },
  {
    kind: "mcp",
    name: "mcp",
    label: "/mcp",
    description: "Show MCP server status and available tools",
    source: "tui",
    visible: true,
  },
  {
    kind: "raw",
    name: "raw",
    label: "/raw",
    description: "Toggle display mode for viewing or collapsing reasoning content",
    source: "tui",
    visible: true,
    preserveInput: true,
    args: ["lite", "normal", "raw-scrollback"],
  },
  {
    kind: "exit",
    name: "exit",
    label: "/exit",
    description: "Quit ANNG CLI",
    source: "tui",
    visible: true,
  },
  {
    kind: "team",
    name: "team",
    label: "/team",
    description: "Team orchestration: create, status, kill",
    source: "tui",
    visible: true,
  },
  {
    kind: "custom-agents",
    name: "custom-agents",
    label: "/custom-agents",
    description: "Customize agents team route, numbers, model and reasoning effort",
    source: "tui",
    visible: true,
  },
];

// =============================================================================
// Command expansion (inspired by Cline's expandUserCommandPrompt)
// =============================================================================

export function formatUserCommandBlock(input: string, slash: string): string {
  return `<user_command slash="${slash}">${input}</user_command>`;
}

export function expandUserCommandPrompt(input: string, commands: SlashCommandItem[]): string {
  if (!input.startsWith("/")) return input;
  const match = input.match(/^\/(\S+)\s*(.*)/);
  if (!match) return input;
  const [, name, rest] = match;
  const cmd = commands.find((c) => c.name === name);
  if (!cmd || cmd.source === "tui") return input;
  if (cmd.instructions) {
    return formatUserCommandBlock(cmd.instructions, cmd.name) + (rest ? ` ${rest}` : "");
  }
  return input;
}

// =============================================================================
// Registry builder
// =============================================================================

export function buildSlashCommands(skills: SkillInfo[]): SlashCommandItem[] {
  const builtIns = BUILTIN_SLASH_COMMANDS.map((c, i) => ({
    ...c,
    isGroupStart: c.group ? i === 0 || BUILTIN_SLASH_COMMANDS[i - 1]?.group !== c.group : false,
  }));
  const skillItems: SlashCommandItem[] = skills.map((skill, i) => ({
    kind: "skill" as const,
    name: skill.name,
    label: `/${skill.name}`,
    description: skill.description || "(no description)",
    source: "runtime" as const,
    visible: true,
    preserveInput: true,
    skill,
    group: "Custom & Loaded Skills",
    isGroupStart: i === 0,
  }));
  return [...builtIns, ...skillItems];
}

// =============================================================================
// Filtering & matching
// =============================================================================

export function filterSlashCommands(items: SlashCommandItem[], token: string): SlashCommandItem[] {
  if (!token.startsWith("/")) return [];
  const query = token.slice(1).toLowerCase();
  let filtered = items;
  if (query) filtered = items.filter((item) => item.name.toLowerCase().includes(query));
  let currentGroup: string | undefined = undefined;
  return filtered.map((item) => {
    const isGroupStart = item.group !== currentGroup && item.group !== undefined;
    if (item.group !== undefined) currentGroup = item.group;
    return { ...item, isGroupStart };
  });
}

export function findExactSlashCommand(items: SlashCommandItem[], token: string): SlashCommandItem | null {
  if (!token.startsWith("/")) return null;
  let query = token.slice(1);
  if (query === "models") query = "model";
  const matches = items.filter((item) => item.name === query);
  return matches.find((item) => item.kind !== "skill") ?? matches[0] ?? null;
}

// =============================================================================
// Formatting helpers
// =============================================================================

export function formatSlashCommandDescription(description: string): string {
  return (description || "(no description)").trim().replace(/\s+/g, " ");
}

export function formatSlashCommandLabel(item: SlashCommandItem): string {
  return item.kind === "skill" && item.skill?.isLoaded ? `${item.label} ✓` : item.label;
}
