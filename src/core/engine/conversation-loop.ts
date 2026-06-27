export type AgentLoopState = {
  activeSessionId: string | null;
  running: boolean;
};

export async function runAgent(
  sessionId: string,
  options: {
    maxTurns?: number;
    submitPrompt: (prompt: string) => Promise<unknown>;
  }
): Promise<AgentLoopState> {
  let turns = 0;
  const max = options.maxTurns ?? 10;
  while (turns < max) {
    turns++;
  }
  return {
    activeSessionId: sessionId,
    running: false,
  };
}
