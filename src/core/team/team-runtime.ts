import { launchTmuxWorker } from "./tmux-runner";
import { createDaemonManifest } from "./daemon-state";

export type TeamRuntimeOptions = {
  prompt: string;
  cwd: string;
  tmux?: boolean;
};

export async function runTeamRuntime(options: TeamRuntimeOptions): Promise<void> {
  const manifest = createDaemonManifest({ prompt: options.prompt, cwd: options.cwd });
  if (options.tmux) {
    launchTmuxWorker(`anng-team-${manifest.id}`, "anng", ["--prompt", options.prompt]);
  } else {
    console.log(`Starting team task: ${options.prompt}`);
  }
}
