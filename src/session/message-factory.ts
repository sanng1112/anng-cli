import * as crypto from "crypto";
import type { SessionMessage, MessageMeta, UserPromptContent, SkillInfo } from "./types";

export function buildSystemMessage(
  sessionId: string,
  content: string,
  contentParams: unknown | null = null,
  visible = false,
  meta?: MessageMeta
): SessionMessage {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "system",
    content,
    contentParams,
    messageParams: null,
    compacted: false,
    visible,
    createTime: now,
    updateTime: now,
    meta,
  };
}

export function buildAssistantMessage(
  sessionId: string,
  content: string | null,
  toolCalls: unknown[] | null,
  reasoningContent?: string | null
): SessionMessage {
  const now = new Date().toISOString();
  const hasReasoningContent = reasoningContent != null;
  const messageParams: { tool_calls?: unknown[]; reasoning_content?: string } | null =
    toolCalls || hasReasoningContent ? {} : null;
  if (toolCalls) {
    messageParams!.tool_calls = toolCalls;
  }
  if (hasReasoningContent) {
    messageParams!.reasoning_content = reasoningContent;
  }
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "assistant",
    content,
    contentParams: null,
    messageParams,
    compacted: false,
    visible: (content || reasoningContent || "").trim() ? true : false,
    createTime: now,
    updateTime: now,
    meta: toolCalls ? { asThinking: true } : undefined,
  };
}

export function buildSkillMessage(sessionId: string, content: string, skill: SkillInfo): SessionMessage {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "system",
    content,
    contentParams: null,
    messageParams: null,
    compacted: false,
    visible: true,
    createTime: now,
    updateTime: now,
    meta: { skill: { ...skill, isLoaded: true } },
  };
}

export function cloneUserPromptForMeta(prompt: UserPromptContent): UserPromptContent {
  return {
    text: prompt.text,
    imageUrls: prompt.imageUrls ? [...prompt.imageUrls] : undefined,
    skills: prompt.skills ? prompt.skills.map((skill) => ({ ...skill })) : undefined,
    permissions: prompt.permissions ? prompt.permissions.map((permission) => ({ ...permission })) : undefined,
    alwaysAllows: prompt.alwaysAllows ? [...prompt.alwaysAllows] : undefined,
  };
}

export function formatToolParamsSnippet(
  toolName: string | null,
  args: Record<string, unknown>,
  projectRoot?: string
): string {
  if (toolName === "bash") {
    const command = typeof args.command === "string" ? args.command.trim() : "";
    const description = typeof args.description === "string" ? args.description.trim() : "";
    if (command && description) {
      return `${command}  # ${description}`;
    }
    if (command) {
      return command;
    }
    if (description) {
      return description;
    }
  } else if (toolName === "UpdatePlan") {
    return typeof args.explanation === "string" ? args.explanation.trim() : "";
  } else if (toolName === "write") {
    return typeof args.file_path === "string" ? args.file_path.trim() : "";
  } else if (toolName === "edit") {
    const filePath = typeof args.file_path === "string" ? args.file_path.trim() : "";
    if (filePath) {
      return filePath;
    }
    return typeof args.snippet_id === "string" ? args.snippet_id.trim() : "";
  }

  const firstKey = Object.keys(args)[0];
  if (!firstKey) {
    return "";
  }

  const value = args[firstKey];
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (toolName === "read" && projectRoot && text.startsWith(projectRoot)) {
    return text.slice(projectRoot.length).replace(/^[\\/]/, "");
  }
  return text;
}

export function formatToolResultSnippet(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}... (total ${value.length} chars)`;
}

export function isInvisibleExecution(content: string): boolean {
  if (!content.trim()) {
    return false;
  }
  try {
    const parsed = JSON.parse(content) as { name?: unknown; ok?: unknown };
    return parsed.name === "bash" && parsed.ok !== true;
  } catch {
    return false;
  }
}

export function buildToolParamsSnippet(toolFunction: unknown | null, projectRoot?: string): string {
  if (!toolFunction || typeof toolFunction !== "object") {
    return "";
  }
  const args = (toolFunction as { arguments?: unknown }).arguments;
  const toolName = (toolFunction as { name?: unknown }).name;
  if (typeof args !== "string") {
    return "";
  }
  const trimmed = args.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return formatToolParamsSnippet(
        typeof toolName === "string" ? toolName : null,
        parsed as Record<string, unknown>,
        projectRoot
      );
    }
  } catch {
    // fall back to raw string
  }
  return trimmed;
}

export function buildToolResultSnippet(content: string, maxLength = 2000): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(content) as { output?: unknown };
    if (parsed.output !== undefined) {
      if (typeof parsed.output === "string") {
        return formatToolResultSnippet(parsed.output, maxLength);
      }
      return formatToolResultSnippet(JSON.stringify(parsed.output), maxLength);
    }
  } catch {
    // fall back to raw content
  }

  return formatToolResultSnippet(content, maxLength);
}
