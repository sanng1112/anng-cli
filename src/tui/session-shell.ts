import { createPromptController } from "./controllers/prompt-controller";
import { dispatchSlashCommand } from "./controllers/slash-command-controller";

export type SessionShellState = {
  activeSessionId: string | null;
  busy: boolean;
  answer: string;
  status: string | null;
  failReason: string | null;
  errorLine: string | null;
};

export function createSessionShell(deps: {
  submitPrompt: (prompt: string) => Promise<{
    sessionId: string | null;
    text: string;
    status: string;
    failReason: string | null;
  }>;
}) {
  let activeSessionId: string | null = null;

  const promptController = createPromptController({
    submitPrompt: async (prompt) => {
      const result = await deps.submitPrompt(prompt);
      activeSessionId = result.sessionId ?? activeSessionId;
      return result;
    },
  });

  return {
    getState: (): SessionShellState => ({
      activeSessionId,
      ...promptController.getState(),
    }),
    submit: async (
      prompt: string,
      actions?: {
        newSession: () => void;
        continueSession: () => void;
        toggleRaw: () => void;
        openSessions: () => void;
      }
    ) => {
      if (actions && dispatchSlashCommand(prompt, actions)) {
        return;
      }
      await promptController.submit(prompt);
    },
  };
}
