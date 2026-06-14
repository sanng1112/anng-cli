import { getEncoding } from "js-tiktoken";

const DEEPSEEK_V4_MODELS = new Set([
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-v4",
  "deepseek-chat",
  "deepseek-coder",
]);

const encoder = getEncoding("cl100k_base");

export function countTokens(text: string): number {
  if (!text) return 0;
  return encoder.encode(text).length;
}

export function countMessagesTokens(messages: Array<{ role: string; content: string | unknown }>): number {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    total += countTokens(content);
  }
  return total;
}

export function getCompactThreshold(model: string): number {
  return DEEPSEEK_V4_MODELS.has(model) ? 512 * 1024 : 128 * 1024;
}
