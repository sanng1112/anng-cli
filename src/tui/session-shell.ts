// src/tui/session-shell.ts
export type SessionShellState = {
  activeSessionId: string | null;
  answer: string;
  status: string | null;
  failReason: string | null;
};

export function createSessionShell(deps: {
  submitPrompt: (prompt: string) => Promise<{
    sessionId: string | null;
    text: string;
    status: string;
    failReason: string | null;
  }>;
}) {
  let state: SessionShellState = {
    activeSessionId: null,
    answer: "",
    status: null,
    failReason: null,
  };

  return {
    getState: () => state,
    submit: async (prompt: string) => {
      const result = await deps.submitPrompt(prompt);
      state = {
        activeSessionId: result.sessionId ?? state.activeSessionId,
        answer: result.text,
        status: result.status,
        failReason: result.failReason,
      };
    },
  };
}
