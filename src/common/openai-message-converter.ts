import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { supportsMultimodal } from "./model-capabilities";
import type { SessionMessage } from "../session";

export type OpenAIMessageConverterOptions = {
  /** Optional callback to render the /init command prompt template. */
  renderInitPrompt?: () => string;
};

/**
 * Converts internal SessionMessage arrays into OpenAI ChatCompletionMessageParam arrays.
 *
 * Handles:
 * - Tool-call / tool-result pairing with interrupt backfill
 * - Thinking-mode reasoning_content injection
 * - Multimodal content (images) filtering by model capability
 * - Compaction filtering
 * - Orphaned tool-call stripping: assistant messages that called an unknown tool
 *   (e.g. a skill name mistaken for a function) are sanitised so the messages
 *   sent to the API never reference a tool not present in the `tools` array.
 *   This prevents Gemini / strict OpenAI-compatible APIs from returning 400.
 */
export class OpenAIMessageConverter {
  constructor(private readonly options: OpenAIMessageConverterOptions = {}) {}

  /**
   * Build the OpenAI messages array from session messages, applying compaction
   * filtering, tool pairing, and format conversion.
   */
  buildMessages(
    messages: SessionMessage[],
    thinkingEnabled: boolean,
    model: string,
    knownToolNames?: Set<string>
  ): ChatCompletionMessageParam[] {
    const activeMessages = messages.filter((message) => !message.compacted);
    const toolPairings = this.pairToolMessages(activeMessages);
    const openAIMessages: ChatCompletionMessageParam[] = [];

    for (let index = 0; index < activeMessages.length; index += 1) {
      const message = activeMessages[index];
      if (message.role === "tool") {
        continue;
      }

      // Collect all tool calls for this assistant message
      const toolCalls = this.getAssistantToolCalls(message);

      if (message.role === "assistant" && toolCalls.length > 0 && knownToolNames) {
        // Filter out tool_calls that reference unknown tools (e.g. skill names
        // mistakenly called as functions). If all calls are unknown, replace the
        // assistant message with a plain text version to avoid orphaned pairs.
        const validToolCalls = toolCalls.filter((tc) => {
          const name = this.getToolCallName(tc);
          return name == null || knownToolNames.has(name);
        });

        if (validToolCalls.length === 0 && toolCalls.length > 0) {
          // All tool_calls are unknown — try to emit the assistant message as
          // a plain text message (no tool_calls).  If there is no text content
          // either, skip the message entirely: APIs reject assistant messages
          // that have neither text nor tool calls ("model output must contain
          // either output text or tool calls, these cannot both be empty").
          const textContent = this.renderContent(message).trim();
          if (textContent) {
            const strippedMsg = this.convertMessage(message, thinkingEnabled, model);
            const strippedAny = strippedMsg as unknown as Record<string, unknown>;
            delete strippedAny["tool_calls"];
            openAIMessages.push(strippedMsg);
          }
          // Skip appending paired tool results since we stripped the calls.
          continue;
        }

        if (validToolCalls.length < toolCalls.length) {
          // Some calls are unknown — emit assistant message with only valid calls.
          const converted = this.convertMessage(message, thinkingEnabled, model);
          (converted as unknown as Record<string, unknown>)["tool_calls"] = validToolCalls;
          if (!this.isStructurallyEmptyMessage(converted)) {
            openAIMessages.push(converted);
          }

          // Append paired tool results only for the valid tool calls.
          for (let toolCallIndex = 0; toolCallIndex < toolCalls.length; toolCallIndex += 1) {
            const toolCall = toolCalls[toolCallIndex];
            const toolCallId = this.getToolCallId(toolCall);
            if (!toolCallId) continue;
            const name = this.getToolCallName(toolCall);
            if (name != null && !knownToolNames.has(name)) continue; // skip unknown

            const pairedToolIndex = toolPairings.get(this.buildToolPairingKey(index, toolCallIndex));
            if (pairedToolIndex != null) {
              openAIMessages.push(this.convertMessage(activeMessages[pairedToolIndex], thinkingEnabled, model));
            } else {
              openAIMessages.push(this.buildInterruptedOpenAIToolMessage(toolCalls, toolCallId, model));
            }
          }
          continue;
        }
      }

      const converted = this.convertMessage(message, thinkingEnabled, model);
      if (this.isStructurallyEmptyMessage(converted)) {
        continue;
      }
      openAIMessages.push(converted);

      if (toolCalls.length === 0) {
        continue;
      }

      for (let toolCallIndex = 0; toolCallIndex < toolCalls.length; toolCallIndex += 1) {
        const toolCallId = this.getToolCallId(toolCalls[toolCallIndex]);
        if (!toolCallId) {
          continue;
        }

        const pairedToolIndex = toolPairings.get(this.buildToolPairingKey(index, toolCallIndex));
        if (pairedToolIndex != null) {
          openAIMessages.push(this.convertMessage(activeMessages[pairedToolIndex], thinkingEnabled, model));
          continue;
        }

        openAIMessages.push(this.buildInterruptedOpenAIToolMessage(toolCalls, toolCallId, model));
      }
    }

    // --- Active Context Pinning (Anthropic/OpenRouter cache_control) ---
    // This allows active caching of the static system prompt and the latest dynamic context boundary.
    const isAnthropic = model.includes("claude") || model.includes("anthropic");
    if (isAnthropic && openAIMessages.length > 0) {
      // 1. Pin the static system prompt
      for (let i = openAIMessages.length - 1; i >= 0; i--) {
        if (openAIMessages[i].role === "system") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sysMsg = openAIMessages[i] as any;
          if (typeof sysMsg.content === "string") {
            sysMsg.content = [{ type: "text", text: sysMsg.content, cache_control: { type: "ephemeral" } }];
          } else if (Array.isArray(sysMsg.content) && sysMsg.content.length > 0) {
            sysMsg.content[sysMsg.content.length - 1].cache_control = { type: "ephemeral" };
          }
          break;
        }
      }
      // 2. Pin the dynamic conversation boundary (last user or tool message)
      let pinnedDynamic = false;
      for (let i = openAIMessages.length - 1; i >= 0; i--) {
        if (openAIMessages[i].role === "user" || openAIMessages[i].role === "tool") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const boundaryMsg = openAIMessages[i] as any;
          if (typeof boundaryMsg.content === "string") {
            boundaryMsg.content = [{ type: "text", text: boundaryMsg.content, cache_control: { type: "ephemeral" } }];
            pinnedDynamic = true;
          } else if (Array.isArray(boundaryMsg.content) && boundaryMsg.content.length > 0) {
            boundaryMsg.content[boundaryMsg.content.length - 1].cache_control = { type: "ephemeral" };
            pinnedDynamic = true;
          }
          if (pinnedDynamic) break;
        }
      }
    }

    return openAIMessages;
  }

  /**
   * Returns the trailing assistant message with pending (unexecuted) tool calls,
   * if one exists at the end of the conversation.
   */
  getTrailingPendingToolCallMessage(
    messages: SessionMessage[]
  ): { message: SessionMessage; toolCalls: unknown[] } | { message: null; toolCalls: [] } {
    const activeMessages = messages.filter((message) => !message.compacted);
    const latestMessage = activeMessages[activeMessages.length - 1];
    if (!latestMessage || latestMessage.role !== "assistant") {
      return { message: null, toolCalls: [] };
    }

    const toolCalls = this.getAssistantToolCalls(latestMessage);
    if (toolCalls.length === 0) {
      return { message: null, toolCalls: [] };
    }
    return {
      message: latestMessage,
      toolCalls: toolCalls.filter((toolCall) => Boolean(this.getToolCallId(toolCall))),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private convertMessage(message: SessionMessage, thinkingEnabled: boolean, model: string): ChatCompletionMessageParam {
    const content = this.renderContent(message);
    // Gemini OpenAI-compatible endpoint does not support role "tool".
    // Convert tool messages to user role for Gemini models.
    const role = model.startsWith("gemini") && message.role === "tool" ? "user" : message.role;
    const base: ChatCompletionMessageParam = {
      role,
      content,
    } as ChatCompletionMessageParam;

    const messageParams = message.messageParams as
      | { tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }
      | null
      | undefined;
    if (messageParams?.tool_calls) {
      (base as { tool_calls?: unknown[] }).tool_calls = messageParams.tool_calls;
    }
    if (messageParams?.tool_call_id) {
      (base as { tool_call_id?: string }).tool_call_id = messageParams.tool_call_id;
    }
    if (typeof messageParams?.reasoning_content === "string") {
      (base as { reasoning_content?: string }).reasoning_content = messageParams.reasoning_content;
    } else if (thinkingEnabled && message.role === "assistant") {
      // Thinking-mode providers require every replayed assistant message
      // to include the reasoning_content field, even when it is empty.
      (base as { reasoning_content?: string }).reasoning_content = "";
    }

    if ((message.role === "user" || message.role === "system") && message.contentParams) {
      const contentParts: ChatCompletionContentPart[] = [];
      if (content) {
        contentParts.push({ type: "text", text: content });
      }
      const params = Array.isArray(message.contentParams) ? message.contentParams : [message.contentParams];
      for (const param of params) {
        const part = param as ChatCompletionContentPart;
        if (part && (part.type !== "image_url" || supportsMultimodal(model))) {
          contentParts.push(part);
        }
      }
      const contentValue: string | ChatCompletionContentPart[] = contentParts.length > 0 ? contentParts : content;
      (base as { content: string | ChatCompletionContentPart[] }).content = contentValue;
    }

    return base;
  }

  private renderContent(message: SessionMessage): string {
    if (message.role === "user" && message.content === "/init") {
      return this.options.renderInitPrompt?.() ?? "";
    }
    return message.content ?? "";
  }

  private pairToolMessages(messages: SessionMessage[]): Map<string, number> {
    const pairings = new Map<string, number>();
    const usedToolMessageIndexes = new Set<number>();

    for (let assistantIndex = 0; assistantIndex < messages.length; assistantIndex += 1) {
      const toolCalls = this.getAssistantToolCalls(messages[assistantIndex]);
      for (let toolCallIndex = 0; toolCallIndex < toolCalls.length; toolCallIndex += 1) {
        const toolCallId = this.getToolCallId(toolCalls[toolCallIndex]);
        if (!toolCallId) {
          continue;
        }

        const toolIndex = this.findPairableToolMessageIndex(
          messages,
          assistantIndex,
          toolCallId,
          usedToolMessageIndexes
        );
        if (toolIndex == null) {
          continue;
        }

        usedToolMessageIndexes.add(toolIndex);
        pairings.set(this.buildToolPairingKey(assistantIndex, toolCallIndex), toolIndex);
      }
    }

    return pairings;
  }

  private findPairableToolMessageIndex(
    messages: SessionMessage[],
    assistantIndex: number,
    toolCallId: string,
    usedToolMessageIndexes: Set<number>
  ): number | null {
    let firstMatchingIndex: number | null = null;
    for (let index = assistantIndex + 1; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== "tool" || usedToolMessageIndexes.has(index)) {
        continue;
      }

      const candidateToolCallId = this.getToolMessageCallId(message);
      if (candidateToolCallId !== toolCallId) {
        continue;
      }

      if (firstMatchingIndex == null) {
        firstMatchingIndex = index;
      }
      if (!this.isInterruptedToolMessage(message)) {
        return index;
      }
    }
    return firstMatchingIndex;
  }

  private getAssistantToolCalls(message: SessionMessage): unknown[] {
    if (message.role !== "assistant") {
      return [];
    }
    const messageParams = message.messageParams as { tool_calls?: unknown[] } | null;
    return Array.isArray(messageParams?.tool_calls) ? messageParams.tool_calls : [];
  }

  private getToolCallId(toolCall: unknown): string | null {
    if (!toolCall || typeof toolCall !== "object") {
      return null;
    }
    const id = (toolCall as { id?: unknown }).id;
    return typeof id === "string" && id ? id : null;
  }

  private getToolCallName(toolCall: unknown): string | null {
    if (!toolCall || typeof toolCall !== "object") {
      return null;
    }
    const fn = (toolCall as { function?: { name?: unknown } }).function;
    if (!fn || typeof fn !== "object") return null;
    const name = (fn as { name?: unknown }).name;
    return typeof name === "string" && name ? name : null;
  }

  private getToolMessageCallId(message: SessionMessage): string | null {
    const messageParams = message.messageParams as { tool_call_id?: unknown } | null;
    const toolCallId = messageParams?.tool_call_id;
    return typeof toolCallId === "string" && toolCallId ? toolCallId : null;
  }

  private buildToolPairingKey(assistantIndex: number, toolCallIndex: number): string {
    return `${assistantIndex}:${toolCallIndex}`;
  }

  private isInterruptedToolMessage(message: SessionMessage): boolean {
    if (typeof message.content !== "string" || !message.content.trim()) {
      return false;
    }
    try {
      const parsed = JSON.parse(message.content) as { metadata?: { interrupted?: unknown } };
      return parsed.metadata?.interrupted === true;
    } catch {
      return false;
    }
  }

  private buildInterruptedOpenAIToolMessage(
    toolCalls: unknown[],
    toolCallId: string,
    model: string
  ): ChatCompletionMessageParam {
    const toolFunction = this.findToolFunction(toolCalls, toolCallId);
    const role = model.startsWith("gemini") ? ("user" as const) : ("tool" as const);
    return {
      role,
      content: this.buildInterruptedToolResult(toolFunction, "Previous tool call did not complete."),
      tool_call_id: toolCallId,
    } as ChatCompletionMessageParam;
  }

  /** Exposed for use by appendToolMessages in SessionManager. */
  findToolFunction(toolCalls: unknown[], toolCallId: string): unknown | null {
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== "object") {
        continue;
      }
      const record = toolCall as { id?: unknown; function?: unknown };
      if (record.id === toolCallId) {
        return record.function ?? null;
      }
    }
    return null;
  }

  private buildInterruptedToolResult(toolFunction: unknown | null, reason: string): string {
    const toolName =
      toolFunction && typeof toolFunction === "object" && typeof (toolFunction as { name?: unknown }).name === "string"
        ? (toolFunction as { name: string }).name
        : "tool";
    return JSON.stringify(
      {
        ok: false,
        name: toolName,
        error: reason,
        metadata: {
          interrupted: true,
        },
      },
      null,
      2
    );
  }

  private isStructurallyEmptyMessage(message: ChatCompletionMessageParam): boolean {
    const content = (message as { content?: unknown }).content;
    const hasTextContent =
      typeof content === "string" ? content.trim().length > 0 : Array.isArray(content) ? content.length > 0 : false;
    const toolCalls = (message as { tool_calls?: unknown[] }).tool_calls;
    return !hasTextContent && (!Array.isArray(toolCalls) || toolCalls.length === 0);
  }
}
