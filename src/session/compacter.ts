import { countMessagesTokens, getCompactThreshold as resolveThreshold } from "../common/tokenizer";

export type CompactionDecision = {
  shouldCompact: boolean;
  estimatedTokens: number;
  compactUpToIndex?: number;
  keepFromIndex?: number;
};

export function shouldCompactContext(options: {
  messages: Array<{ role: string; content: string | unknown; compacted?: boolean }>;
  model: string;
  threshold?: number;
}): CompactionDecision {
  const threshold = options.threshold ?? resolveThreshold(options.model);
  const activeMessages = options.messages.filter((m) => !m.compacted);
  const estimatedTokens = countMessagesTokens(activeMessages);

  if (estimatedTokens < threshold) {
    return { shouldCompact: false, estimatedTokens };
  }

  // Phase boundary heuristic: look for recent successful tool results or system prompts
  // Instead of an arbitrary 30%, we accumulate tokens from the end to ensure we drop below the threshold
  // We want the kept messages to be roughly 60-70% of the threshold at most.
  const targetKeepTokens = Math.floor(threshold * 0.6);
  let keptTokens = 0;
  let boundaryIndex = 0;

  for (let i = activeMessages.length - 1; i >= 0; i--) {
    const msg = activeMessages[i];
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    // Approximate token count to avoid expensive full tokenization in a tight loop
    // 1 char ~ 0.25 tokens for English/Code, 0.55 for CJK.
    const isMultibyte = /[^\x00-\x7F]/.test(content);
    const msgTokens = Math.ceil(content.length * (isMultibyte ? 0.55 : 0.32));

    if (keptTokens + msgTokens > targetKeepTokens) {
      boundaryIndex = i + 1;
      break;
    }
    keptTokens += msgTokens;
  }

  // Fallback to ensure we compact AT LEAST 1 message if we are above threshold,
  // but also try not to compact the very last message if possible.
  boundaryIndex = Math.min(Math.max(1, boundaryIndex), activeMessages.length - 1);

  // Try to find a clean break (user or system message) near the boundary
  for (let i = boundaryIndex; i < activeMessages.length - 1; i++) {
    const msg = activeMessages[i];
    if (msg.role === "user" || msg.role === "system") {
      boundaryIndex = i;
      break;
    }
  }

  const compactUpToIndex = boundaryIndex;

  const originalIndices: number[] = [];
  for (let i = 0; i < options.messages.length; i++) {
    if (!options.messages[i].compacted) {
      originalIndices.push(i);
    }
  }

  const keepFromIndex = originalIndices[compactUpToIndex] ?? options.messages.length;

  return {
    shouldCompact: true,
    estimatedTokens,
    compactUpToIndex:
      originalIndices[compactUpToIndex - 1] ?? options.messages.length - (activeMessages.length - boundaryIndex),
    keepFromIndex,
  };
}
