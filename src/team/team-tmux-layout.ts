import type { TerminalMultiplexer } from "./integrations/terminal-multiplexer";
import type { TmuxLayoutConfig, TmuxLayoutResult } from "./types";

/**
 * TeamTmuxLayout manages a tmux session with:
 * - Left pane: coordinator chat (50% width)
 * - Right region: split vertically into N agent panes
 *
 * Layout topology (tmux):
 *   ┌───────────────┬──────────────┐
 *   │               │  Agent 1     │
 *   │  Coordinator  ├──────────────┤
 *   │               │  Agent 2     │
 *   │               ├──────────────┤
 *   │               │  Agent 3     │
 *   └───────────────┴──────────────┘
 *   main-vertical: left=50% right=50% then right split evenly
 */
export class TeamTmuxLayout {
  private mux: TerminalMultiplexer;
  private config: TmuxLayoutConfig;
  private result: TmuxLayoutResult | null = null;

  constructor(mux: TerminalMultiplexer, config: TmuxLayoutConfig) {
    this.mux = mux;
    this.config = config;
  }

  async createTeamSession(): Promise<TmuxLayoutResult> {
    const { sessionName, cwd, coordinatorLabel, agents } = this.config;

    // 1. Create the detached session (initial window = coordinator pane)
    await this.mux.createSession(sessionName, cwd);
    const initialPanes = await this.mux.listPanes(sessionName);
    const coordinatorPaneId = initialPanes[0] ?? `${sessionName}:0.0`;

    // 2. Set coordinator pane title
    await this.mux.setPaneTitle(coordinatorPaneId, coordinatorLabel);

    // 3. If there are agents, split vertically to create the right region
    if (agents.length > 0) {
      await this.mux.splitPaneVertically(sessionName);
      const panesAfterSplit = await this.mux.listPanes(sessionName);
      // Right pane is the one that appeared after the split
      // (index 1 in a two-pane window)
      const rightPaneId = panesAfterSplit[1] ?? panesAfterSplit[panesAfterSplit.length - 1];

      // 4. For each agent, assign a pane
      const agentPaneIds: string[] = [];
      for (let i = 0; i < agents.length; i++) {
        let agentPaneId: string;
        if (i === 0) {
          // First agent uses the right pane directly
          agentPaneId = rightPaneId;
        } else {
          // Subsequent agents: split the rightmost agent pane horizontally
          const lastAgentPane = agentPaneIds[agentPaneIds.length - 1] ?? rightPaneId;
          await this.mux.splitPaneVertically(sessionName, lastAgentPane);
          const panesAfter = await this.mux.listPanes(sessionName);
          // New pane is the last in the list
          agentPaneId = panesAfter[panesAfter.length - 1];
        }

        // Set pane title
        await this.mux.setPaneTitle(agentPaneId, agents[i].name);
        // Send the start command to the agent pane
        await this.mux.sendCommand(agentPaneId, agents[i].command);
        agentPaneIds.push(agentPaneId);
      }

      // 5. Apply main-vertical layout
      await this.mux.selectLayout(sessionName, "main-vertical");

      this.result = { coordinatorPaneId, agentPaneIds };
    } else {
      this.result = { coordinatorPaneId, agentPaneIds: [] };
    }

    return this.result;
  }

  async sendToCoordinator(command: string): Promise<void> {
    if (!this.result) throw new Error("Team session not created yet");
    await this.mux.sendCommand(this.result.coordinatorPaneId, command);
  }

  async sendToAgentPane(agentPaneId: string, command: string): Promise<void> {
    await this.mux.sendCommand(agentPaneId, command);
  }

  async captureCoordinatorPane(): Promise<string> {
    if (!this.result) throw new Error("Team session not created yet");
    return this.mux.capturePane(this.result.coordinatorPaneId);
  }

  async captureAgentPane(agentPaneId: string): Promise<string> {
    return this.mux.capturePane(agentPaneId);
  }

  async attachSession(): Promise<void> {
    if (!this.result) throw new Error("Team session not created yet");
    if (this.mux.attachSession) {
      await this.mux.attachSession(this.config.sessionName);
    }
  }

  async killTeamSession(): Promise<void> {
    await this.mux.killSession(this.config.sessionName);
    this.result = null;
  }

  getResult(): TmuxLayoutResult | null {
    return this.result;
  }
}
