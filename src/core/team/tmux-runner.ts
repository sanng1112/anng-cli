import { spawn } from "node:child_process";

export type TmuxWorkerHandle = {
  sessionName: string;
  paneId?: string;
};

export function launchTmuxWorker(sessionName: string, command: string, args: string[]): TmuxWorkerHandle {
  spawn("tmux", ["new-session", "-d", "-s", sessionName, command, ...args], {
    stdio: "ignore",
  });
  return {
    sessionName,
  };
}
