import { createOpenAIClient } from "../common/openai-client";
import { SessionManager } from "../core/engine";
import { resolveCurrentSettings } from "../settings";

type SessionSnapshot = {
  id: string;
  assistantReply: string | null;
  status: string;
  failReason: string | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
};

export type SessionManagerLike = {
  handleUserPrompt: (userPrompt: { text: string }) => Promise<void>;
  interruptActiveSession: () => void;
  dispose: () => void;
  getActiveSessionId: () => string | null;
  getSession: (sessionId: string) => SessionSnapshot | null;
};

export type AgentAdapter = {
  submitPrompt: (prompt: string) => Promise<{
    sessionId: string | null;
    text: string;
    status: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
    failReason: string | null;
  }>;
  abort: () => void;
  dispose: () => void;
};

export async function createAgentAdapter(input: {
  cwd: string;
  provider?: string;
  model?: string;
  key?: string;
  baseUrl?: string;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  createSessionManager?: () => SessionManagerLike;
}): Promise<AgentAdapter> {
  if (process.env.ANNG_MOCK_LLM === "true") {
    return {
      submitPrompt: async (prompt: string) => {
        return {
          sessionId: "mock-session-123",
          text: `Mock response for: ${prompt}`,
          status: "completed",
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
          failReason: null,
        };
      },
      abort: () => {},
      dispose: () => {},
    };
  }

  const manager =
    input.createSessionManager?.() ??
    createDefaultSessionManager({
      cwd: input.cwd,
      provider: input.provider,
      model: input.model,
      key: input.key,
      baseUrl: input.baseUrl,
      autoAccept: input.autoAccept ?? false,
      planMode: input.planMode ?? false,
      maxTurns: input.maxTurns ?? 25,
    });

  return {
    submitPrompt: async (prompt: string) => {
      await manager.handleUserPrompt({ text: prompt });

      const sessionId = manager.getActiveSessionId();
      const session = sessionId ? manager.getSession(sessionId) : null;

      return {
        sessionId,
        text: session?.assistantReply ?? "",
        status: session?.status ?? "unknown",
        usage: {
          inputTokens: session?.usage?.prompt_tokens ?? 0,
          outputTokens: session?.usage?.completion_tokens ?? 0,
          totalTokens: session?.usage?.total_tokens ?? 0,
        },
        failReason: session?.failReason ?? null,
      };
    },
    abort: () => {
      manager.interruptActiveSession();
    },
    dispose: () => {
      manager.dispose();
    },
  };
}

function createDefaultSessionManager(input: {
  cwd: string;
  provider?: string;
  model?: string;
  key?: string;
  baseUrl?: string;
  autoAccept: boolean;
  planMode: boolean;
  maxTurns: number;
}): SessionManager {
  const runtimeEnv = {
    ...process.env,
    ...(input.provider ? { ANNG_PROVIDER: input.provider } : {}),
    ...(input.model ? { ANNG_MODEL: input.model } : {}),
    ...(input.key ? { ANNG_API_KEY: input.key } : {}),
    ...(input.baseUrl ? { ANNG_BASE_URL: input.baseUrl } : {}),
  };
  const settings = resolveCurrentSettings(input.cwd, runtimeEnv);

  return new SessionManager({
    projectRoot: input.cwd,
    autoAccept: input.autoAccept,
    planMode: input.planMode,
    maxTurns: input.maxTurns,
    createOpenAIClient: () => createOpenAIClient(input.cwd, runtimeEnv),
    getResolvedSettings: () => settings,
    renderMarkdown: (text) => text,
    onAssistantMessage: () => {},
    onSessionEntryUpdated: () => {},
    onLlmStreamProgress: () => {},
  });
}
