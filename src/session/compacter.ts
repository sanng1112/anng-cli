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
  // Instead of an arbitrary 30%, we find the last 5 user messages or significant phase breaks.
  let boundaryIndex = Math.min(activeMessages.length, Math.max(3, Math.floor(activeMessages.length * 0.3)));
  for (let i = Math.floor(activeMessages.length * 0.5); i < activeMessages.length - 2; i++) {
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
