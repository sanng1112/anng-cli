import type { SkillInfo } from "../../session";

export type SlashCommandKind =
  | "skill"
  | "skills"
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
  | "settings"
  | "query"
  | "btw"
  | "bg"
  | "queue";

export type SlashCommandItem = {
  kind: SlashCommandKind;
  name: string;
  label: string;
  description: string;
  skill?: SkillInfo;
  args?: string[];
  group?: string;
  isGroupStart?: boolean;
};

export const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    kind: "skills",
    name: "skills",
    label: "/skills",
    description: "List available skills",
  },
  {
    kind: "model",
    name: "model",
    label: "/model",
    description: "Select model, thinking mode and effort control",
  },
  {
    kind: "new",
    name: "new",
    label: "/new",
    description: "Start a fresh conversation",
  },
  {
    kind: "init",
    name: "init",
    label: "/init",
    description: "Initialize an AGENTS.md file with instructions for LLM",
  },
  {
    kind: "resume",
    name: "resume",
    label: "/resume",
    description: "Pick a previous conversation to continue",
  },
  {
    kind: "continue",
    name: "continue",
    label: "/continue",
    description: "Continue the active conversation or pick one to resume",
  },
  {
    kind: "undo",
    name: "undo",
    label: "/undo",
    description: "Restore code and/or conversation to a previous point",
  },
  {
    kind: "mcp",
    name: "mcp",
    label: "/mcp",
    description: "Show MCP server status and available tools",
  },
  {
    kind: "raw",
    name: "raw",
    label: "/raw",
    args: ["lite", "normal", "raw-scrollback"],
    description: "Toggle display mode for viewing or collapsing reasoning content",
  },
  {
    kind: "exit",
    name: "exit",
    label: "/exit",
    description: "Quit ANNG CLI CLI",
  },
  {
    kind: "team",
    name: "team",
    label: "/team",
    description: "Team orchestration: create, status, kill",
  },
  {
    kind: "custom-agents",
    name: "custom-agents",
    label: "/custom-agents",
    description: "Customize agents team route, numbers, model and reasoning effort",
  },
  {
    kind: "settings",
    name: "settings",
    label: "/settings",
    description: "Manage API Key, Base URL, Models, and other configurations",
  },
  {
    kind: "query",
    name: "query",
    label: "/query",
    description: "Show session summary, model info, project stats and system status",
  },
  {
    kind: "btw",
    name: "btw",
    label: "/btw <message>",
    description: "Send a casual note/reminder to the AI without starting a new task",
  },
  {
    kind: "bg",
    name: "bg",
    label: "/bg",
    description: "View all background processes and running tasks",
  },
  {
    kind: "queue",
    name: "queue",
    label: "/queue",
    args: ["add", "list", "remove", "clear", "process"],
    description: "Manage task queue: add/list/remove/clear/process tasks",
  },
];

export function buildSlashCommands(skills: SkillInfo[]): SlashCommandItem[] {
  const builtIns: SlashCommandItem[] = BUILTIN_SLASH_COMMANDS.map((c, i) => ({
    ...c,
    group: "Built-in Commands",
    isGroupStart: i === 0,
  }));

  const skillItems: SlashCommandItem[] = skills.map((skill, i) => ({
    kind: "skill",
    name: skill.name,
    label: `/${skill.name}`,
    description: skill.description || "(no description)",
    skill,
    group: "Custom & Loaded Skills",
    isGroupStart: i === 0,
  }));

  return [...builtIns, ...skillItems];
}

export function filterSlashCommands(items: SlashCommandItem[], token: string): SlashCommandItem[] {
  if (!token.startsWith("/")) {
    return [];
  }
  const query = token.slice(1).toLowerCase();

  let filtered = items;
  if (query) {
    filtered = items.filter((item) => item.name.toLowerCase().includes(query));
  }

  // Re-assign isGroupStart based on filtered results
  let currentGroup = "";
  return filtered.map((item) => {
    const isGroupStart = item.group !== currentGroup;
    if (isGroupStart) {
      currentGroup = item.group || "";
    }
    return { ...item, isGroupStart };
  });
}

export function findExactSlashCommand(items: SlashCommandItem[], token: string): SlashCommandItem | null {
  if (!token.startsWith("/")) {
    return null;
  }
  let query = token.slice(1);
  // Alias: /models -> /model
  if (query === "models") query = "model";
  const matches = items.filter((item) => item.name === query);
  return matches.find((item) => item.kind !== "skill") ?? matches[0] ?? null;
}

export function formatSlashCommandDescription(description: string): string {
  return (description || "(no description)").trim().replace(/\s+/g, " ");
}

export function formatSlashCommandLabel(item: SlashCommandItem): string {
  return item.kind === "skill" && item.skill?.isLoaded ? `${item.label} ✓` : item.label;
}
