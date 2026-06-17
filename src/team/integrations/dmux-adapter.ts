import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { TmuxManager } from "./tmux-manager";
import type { TerminalMultiplexer } from "./terminal-multiplexer";

export class DmuxAdapter implements TerminalMultiplexer {
  constructor(private tmux: TmuxManager) {}

  async isAvailable(): Promise<boolean> {
    return this.tmux.isAvailable();
  }

  async createSession(name: string, cwd: string): Promise<void> {
    return this.tmux.createSession(`dmux-${name}`, cwd);
  }

  async createPane(sessionName: string, command: string, cwd: string): Promise<string> {
    return this.tmux.createPane(`dmux-${sessionName}`, command, cwd);
  }

  async sendCommand(paneId: string, command: string): Promise<void> {
    return this.tmux.sendCommand(paneId, command);
  }

  async capturePane(paneId: string): Promise<string> {
    return this.tmux.capturePane(paneId);
  }

  async killSession(sessionName: string): Promise<void> {
    return this.tmux.killSession(`dmux-${sessionName}`);
  }

  async selectLayout(sessionName: string, layout: string): Promise<void> {
    return this.tmux.selectLayout(`dmux-${sessionName}`, layout);
  }

  async splitPaneVertically(sessionName: string, targetPane?: string): Promise<string> {
    return this.tmux.splitPaneVertically(`dmux-${sessionName}`, targetPane);
  }

  async setPaneTitle(paneId: string, title: string): Promise<void> {
    return this.tmux.setPaneTitle(paneId, title);
  }

  async listPanes(sessionName: string): Promise<string[]> {
    return this.tmux.listPanes(`dmux-${sessionName}`);
  }

  async writeState(sessionName: string, state: Record<string, unknown>): Promise<void> {
    const statePath = path.join(os.tmpdir(), `dmux-${sessionName}.json`);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  async readState(sessionName: string): Promise<Record<string, unknown> | null> {
    try {
      const statePath = path.join(os.tmpdir(), `dmux-${sessionName}.json`);
      if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, "utf8"));
      }
    } catch {
      // ignore
    }
    return null;
  }
}
