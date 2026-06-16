export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Deepseek
  "gemini-v4-pro": { inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.014 },
  "deepseek-v4-pro": { inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.014 },
  "deepseek-v4-flash": { inputPer1M: 0.05, outputPer1M: 0.1, cachedInputPer1M: 0.005 },
  // Gemini
  "gemini-3.1-pro": { inputPer1M: 1.25, outputPer1M: 5.0, cachedInputPer1M: 0.625 },
  "gemini-3.1-pro-low": { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075 },
  "gemini-3.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3, cachedInputPer1M: 0.0375 },
  "gemini-3.1-flash-lite": { inputPer1M: 0.075, outputPer1M: 0.3, cachedInputPer1M: 0.0375 },
  "gemini-2.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3, cachedInputPer1M: 0.0375 },
  "gemini-2.5-flash-lite": { inputPer1M: 0.075, outputPer1M: 0.3, cachedInputPer1M: 0.0375 },
  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0, cachedInputPer1M: 1.25 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075 },
  o1: { inputPer1M: 15.0, outputPer1M: 60.0, cachedInputPer1M: 7.5 },
  "o1-mini": { inputPer1M: 3.0, outputPer1M: 12.0, cachedInputPer1M: 1.5 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  "claude-3-5-haiku-20241022": { inputPer1M: 1.0, outputPer1M: 5.0, cachedInputPer1M: 0.1 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const normModel = Object.keys(MODEL_PRICING).find((k) => model.includes(k)) || "gpt-4o";
  const pricing = MODEL_PRICING[normModel] || MODEL_PRICING["gpt-4o"];

  const actualInput = Math.max(0, inputTokens - cachedTokens);

  const inputCost = (actualInput / 1_000_000) * pricing.inputPer1M;
  const cachedCost = (cachedTokens / 1_000_000) * (pricing.cachedInputPer1M ?? pricing.inputPer1M);
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + cachedCost + outputCost;
}
