import * as crypto from "crypto";
import type { SessionMessage, UserPromptContent } from "./types";
import {
  cloneUserPromptForMeta,
  buildToolParamsSnippet as buildToolParams,
  buildToolResultSnippet as buildToolResult,
  isInvisibleExecution as isInvisibleExec,
  formatToolParamsSnippet as fmtToolParams,
} from "./message-factory";

/**
 * Build a user message from a prompt.
 */
export function buildUserMessage(
  sessionId: string,
  prompt: UserPromptContent,
  getCurrentCheckpointHash: (sessionId: string) => string | undefined
): SessionMessage {
  const now = new Date().toISOString();
  const imageParams =
    prompt.imageUrls
      ?.filter((url) => Boolean(url))
      .map((url) => ({
        type: "image_url",
        image_url: { url },
      })) ?? [];

  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "user",
    content: prompt.text ?? "",
    contentParams: imageParams.length > 0 ? imageParams : null,
    messageParams: null,
    compacted: false,
    visible: true,
    createTime: now,
    updateTime: now,
    meta: { userPrompt: cloneUserPromptForMeta(prompt) },
    checkpointHash: getCurrentCheckpointHash(sessionId),
  };
}

/**
 * Build a tool message for a tool execution result.
 */
export function buildToolMessage(
  sessionId: string,
  toolCallId: string,
  content: string,
  toolFunction: unknown | null,
  projectRoot: string
): SessionMessage {
  const now = new Date().toISOString();
  const paramsMd = buildToolParams(toolFunction, projectRoot);
  const resultMd = buildToolResult(content);
  const invisible = isInvisibleExec(content);
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: "tool",
    content,
    contentParams: null,
    messageParams: { tool_call_id: toolCallId },
    compacted: false,
    visible: !invisible,
    createTime: now,
    updateTime: now,
    meta: {
      function: toolFunction ?? undefined,
      paramsMd,
      resultMd,
    },
  };
}

/**
 * Normalize a session message, enriching tool messages with metadata.
 */
export function normalizeSessionMessage(message: SessionMessage, projectRoot: string): SessionMessage {
  if (message.role !== "tool") {
    return message;
  }

  const nextMeta = message.meta ? { ...message.meta } : undefined;
  const normalizedParamsMd = buildToolParams(nextMeta?.function ?? null, projectRoot);
  if (nextMeta && normalizedParamsMd) {
    nextMeta.paramsMd = normalizedParamsMd;
  }

  const normalizedResultMd = typeof message.content === "string" ? buildToolResult(message.content) : "";
  if (nextMeta && normalizedResultMd) {
    nextMeta.resultMd = normalizedResultMd;
  }

  return {
    ...message,
    visible: typeof message.content === "string" ? !isInvisibleExec(message.content) : message.visible,
    meta: nextMeta,
  };
}

/**
 * Generate a unique tool call ID.
 */
export function generateToolCallId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Normalize LLM tool calls, ensuring each has an ID.
 */
export function normalizeLlmToolCalls(
  rawToolCalls: unknown[] | null | undefined,
  generateId: () => string = generateToolCallId
): unknown[] | null {
  if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) {
    return null;
  }

  return rawToolCalls.map((toolCall) => {
    if (!toolCall || typeof toolCall !== "object" || Array.isArray(toolCall)) {
      return toolCall;
    }

    const record = toolCall as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (id) {
      return toolCall;
    }

    return {
      ...record,
      id: generateId(),
    };
  });
}

/**
 * Build a tool params snippet from a tool function object.
 * This is a thin wrapper that resolves projectRoot before delegating to message-factory.
 */
export function buildToolParamsSnippet(toolFunction: unknown | null, projectRoot: string): string {
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
      return fmtToolParams(
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
