import { execSync, spawn } from "child_process";
import type { TerminalMultiplexer } from "./terminal-multiplexer";

export class TmuxManager implements TerminalMultiplexer {
  async isAvailable(): Promise<boolean> {
    try {
      execSync("tmux -V", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async createSession(name: string, cwd: string): Promise<void> {
    this.exec(`tmux new-session -d -s "${name}" -c "${cwd}"`);
  }

  async createPane(sessionName: string, command: string, cwd: string): Promise<string> {
    // Check if session exists; create it if not (workers auto-create on first use)
    const paneCount = await this.getPaneCount(sessionName);
    if (paneCount === 0) {
      await this.createSession(sessionName, cwd);
    }
    const paneIndex = await this.getPaneCount(sessionName);
    const cmd = `tmux split-window -t "${sessionName}" -c "${cwd}" "clear; echo '=== Worker starting ==='; ${command}; exec $SHELL"`;
    this.exec(cmd);
    return `${sessionName}:0.${paneIndex}`;
  }

  async sendCommand(paneId: string, command: string): Promise<void> {
    this.exec(`tmux send-keys -t "${paneId}" "${this.escapeCommand(command)}" Enter`);
  }

  async capturePane(paneId: string): Promise<string> {
    const output = execSync(`tmux capture-pane -t "${paneId}" -p`, {
      encoding: "utf8",
      timeout: 5000,
    });
    return output;
  }

  async killSession(sessionName: string): Promise<void> {
    try {
      this.exec(`tmux kill-session -t "${sessionName}"`);
    } catch {
      // Session might already be dead
    }
  }

  async attachSession(sessionName: string): Promise<void> {
    const child = spawn("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit",
    });
    return new Promise((resolve) => {
      child.on("exit", () => resolve());
    });
  }

  async selectLayout(sessionName: string, layout: string): Promise<void> {
    this.exec(`tmux select-layout -t "${sessionName}" "${layout}"`);
  }

  async listPanes(sessionName: string): Promise<string[]> {
    const output = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_id}"`, {
      encoding: "utf8",
    });
    return output.trim().split("\n").filter(Boolean);
  }

  private exec(command: string): string {
    return execSync(command, { encoding: "utf8", timeout: 10000 });
  }

  private async getPaneCount(sessionName: string): Promise<number> {
    try {
      const output = execSync(`tmux list-panes -t "${sessionName}"`, { encoding: "utf8" });
      return output.trim().split("\n").length;
    } catch {
      return 0;
    }
  }

  private escapeCommand(command: string): string {
    return command.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/;/g, "\\;");
  }
}
