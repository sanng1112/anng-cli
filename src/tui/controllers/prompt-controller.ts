export type PromptControllerState = {
  busy: boolean;
  answer: string;
  status: string | null;
  failReason: string | null;
  errorLine: string | null;
};

export function createPromptController(deps: {
  submitPrompt: (prompt: string) => Promise<{
    sessionId: string | null;
    text: string;
    status: string;
    failReason: string | null;
  }>;
}) {
  let state: PromptControllerState = {
    busy: false,
    answer: "",
    status: null,
    failReason: null,
    errorLine: null,
  };

  return {
    getState: () => state,
    submit: async (prompt: string) => {
      state = { ...state, busy: true, errorLine: null };
      try {
        const result = await deps.submitPrompt(prompt);
        state = {
          busy: false,
          answer: result.text,
          status: result.status,
          failReason: result.failReason,
          errorLine: null,
        };
      } catch (error) {
        state = {
          ...state,
          busy: false,
          errorLine: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
