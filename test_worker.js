// src/team/integrations/tmux-manager.ts
import { execSync, spawn } from "child_process";
var TmuxManager = class {
  async isAvailable() {
    try {
      execSync("tmux -V", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
  async createSession(name, cwd) {
    this.exec(`tmux new-session -d -s "${name}" -c "${cwd}"`);
  }
  async createPane(sessionName, command, cwd) {
    const paneCount = await this.getPaneCount(sessionName);
    if (paneCount === 0) {
      await this.createSession(sessionName, cwd);
    }
    const paneIndex = await this.getPaneCount(sessionName);
    const script = `clear; echo '=== Worker starting ==='; ${command}; exec $SHELL`;
    const safeScript = `'${script.replace(/'/g, `'"'"'`)}'`;
    const cmd = `tmux split-window -t "${sessionName}" -c "${cwd}" ${safeScript}`;
    this.exec(cmd);
    return `${sessionName}:0.${paneIndex}`;
  }
  async sendCommand(paneId, command) {
    const safe = `'${command.replace(/'/g, `'"'"'`)}'`;
    this.exec(`tmux send-keys -t "${paneId}" ${safe} Enter`);
  }
  async capturePane(paneId) {
    const output = execSync(`tmux capture-pane -t "${paneId}" -p`, {
      encoding: "utf8",
      timeout: 5e3
    });
    return output;
  }
  async killSession(sessionName) {
    try {
      this.exec(`tmux kill-session -t "${sessionName}"`);
    } catch {
    }
  }
  async attachSession(sessionName) {
    const child = spawn("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit"
    });
    return new Promise((resolve) => {
      child.on("exit", () => resolve());
    });
  }
  async selectLayout(sessionName, layout) {
    this.exec(`tmux select-layout -t "${sessionName}" "${layout}"`);
  }
  async splitPaneVertically(sessionName, targetPane) {
    const before = await this.listPanes(sessionName);
    const target = targetPane ? `-t "${targetPane}" ` : "";
    this.exec(`tmux split-window -h ${target}-c "${process.cwd()}"`);
    const after = await this.listPanes(sessionName);
    const newPane = after.find((p) => !before.includes(p));
    return newPane ?? after[after.length - 1];
  }
  async setPaneTitle(paneId, title) {
    this.exec(`tmux select-pane -t "${paneId}" -T "${title}"`);
  }
  async listPanes(sessionName) {
    const output = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_id}"`, {
      encoding: "utf8"
    });
    return output.trim().split("\n").filter(Boolean);
  }
  exec(command) {
    return execSync(command, { encoding: "utf8", timeout: 1e4 });
  }
  async getPaneCount(sessionName) {
    try {
      const output = execSync(`tmux list-panes -t "${sessionName}"`, { encoding: "utf8" });
      return output.trim().split("\n").length;
    } catch {
      return 0;
    }
  }
  escapeCommand(command) {
    return `'${command.replace(/'/g, `'"'"'`)}'`;
  }
};

// test_worker.ts
async function run() {
  const mux = new TmuxManager();
  console.log("Pane count before:", await mux.getPaneCount("test-session"));
  const paneId = await mux.createPane("test-session", "echo Hello", process.cwd());
  console.log("Pane created:", paneId);
  for (let i = 0; i < 5; i++) {
    const output = await mux.capturePane(paneId);
    console.log("Output at", i, ":", output);
    if (output.includes("$")) {
      console.log("Shell prompt detected!");
      break;
    }
    await new Promise((r) => setTimeout(r, 1e3));
  }
}
run().catch(console.error);
