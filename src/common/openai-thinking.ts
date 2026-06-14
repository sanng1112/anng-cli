import type { ReasoningEffort } from "../settings";

type ThinkingConfig = {
  type: "enabled" | "disabled";
};

type ThinkingRequestOptions = {
  thinking?: ThinkingConfig;
  extra_body?: {
    reasoning_effort?: ReasoningEffort;
  };
};

export function buildThinkingRequestOptions(
  thinkingEnabled: boolean,
  baseURL?: string,
  reasoningEffort: ReasoningEffort = "max"
): ThinkingRequestOptions {
  // Gemini OpenAI-compatible endpoint does not support the "thinking" parameter.
  // Sending it causes 400 errors on all Gemini models.
  if (baseURL && baseURL.includes("generativelanguage.googleapis.com")) {
    return {};
  }

  const thinking: ThinkingConfig = { type: thinkingEnabled ? "enabled" : "disabled" };

  return {
    thinking,
    ...(thinkingEnabled ? { extra_body: { reasoning_effort: reasoningEffort } } : {}),
  };
}
