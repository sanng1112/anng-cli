import type { TeamTmuxLayout } from "./team-tmux-layout";

/**
 * TeamTmuxCoordinator manages the coordinator chat loop and agent dispatch.
 *
 * The coordinator:
 * 1. Receives task descriptions from the user (via the coordinator pane)
 * 2. Dispatches directives to individual agent panes via sendCommand
 * 3. Broadcasts to all agent panes
 * 4. Reads agent outputs via pane capture
 */
export class TeamTmuxCoordinator {
  private layout: TeamTmuxLayout;
  private running = false;

  constructor(layout: TeamTmuxLayout) {
    this.layout = layout;
  }

  /**
   * Start the coordinator chat loop.
   * Polls the coordinator pane for new user input, processes it,
   * and sends responses back.
   *
   * @param processInput - Async callback: takes raw input, returns response text
   * @param shouldStop  - Async predicate: return true to exit loop
   */
  async startCoordinator(
    processInput: (input: string) => Promise<string>,
    shouldStop: () => Promise<boolean>
  ): Promise<void> {
    this.running = true;

    await this.layout.sendToCoordinator(
      "echo '=== Coordinator Ready ==='\n" + "echo 'Type your task and the coordinator will dispatch it.'"
    );

    let lastCapture = "";

    while (this.running) {
      if (await shouldStop()) break;

      const currentCapture = await this.layout.captureCoordinatorPane();

      if (currentCapture !== lastCapture && currentCapture.length > 0) {
        const newInput = currentCapture.slice(lastCapture.length).trim();
        if (newInput) {
          const response = await processInput(newInput);
          if (response) {
            await this.layout.sendToCoordinator(`echo 'Coordinator: ${this.escapeForShell(response)}'`);
          }
        }
        lastCapture = currentCapture;
      }

      // Poll every 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  stopCoordinator(): void {
    this.running = false;
  }

  async dispatchToAgent(agentPaneId: string, directive: string): Promise<void> {
    const escaped = this.escapeForShell(directive);
    await this.layout.sendToAgentPane(
      agentPaneId,
      `clear; echo '=== DIRECTIVE ==='; echo '${escaped}'; echo '=== END DIRECTIVE ==='`
    );
  }

  async broadcastToAll(directive: string): Promise<void> {
    const result = this.layout.getResult();
    if (!result) throw new Error("Team session not created yet");

    for (const paneId of result.agentPaneIds) {
      await this.dispatchToAgent(paneId, directive);
    }
  }

  async readAgentOutput(agentPaneId: string): Promise<string> {
    return this.layout.captureAgentPane(agentPaneId);
  }

  isRunning(): boolean {
    return this.running;
  }

  private escapeForShell(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/'/g, "'\\''").replace(/\n/g, "\\n").replace(/"/g, '\\"');
  }
}
