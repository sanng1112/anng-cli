import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TeamTmuxCoordinator } from "../../team/team-tmux-coordinator";
import type { TmuxLayoutResult } from "../../team/types";

/**
 * Create a fake layout that records sends instead of talking to tmux.
 */
function createFakeLayout() {
  const sentToCoordinator: string[] = [];
  const sentToAgents: Array<{ paneId: string; command: string }> = [];
  let capturedCoordinator = "";

  return {
    layout: {
      sendToCoordinator: async (cmd: string) => {
        sentToCoordinator.push(cmd);
      },
      sendToAgentPane: async (paneId: string, cmd: string) => {
        sentToAgents.push({ paneId, command: cmd });
      },
      captureCoordinatorPane: async () => capturedCoordinator,
      captureAgentPane: async (paneId: string) => `[output from ${paneId}]`,
      killTeamSession: async () => {},
      getResult: () =>
        ({
          coordinatorPaneId: "test-session:0.0",
          agentPaneIds: ["test-session:0.1", "test-session:0.2"],
        }) as TmuxLayoutResult,
    },
    sentToCoordinator,
    sentToAgents,
    setCapturedCoordinator: (text: string) => {
      capturedCoordinator = text;
    },
  };
}

describe("TeamTmuxCoordinator", () => {
  it("dispatches a directive to a specific agent pane", async () => {
    const fake = createFakeLayout();
    const coordinator = new TeamTmuxCoordinator(fake.layout as any);

    await coordinator.dispatchToAgent("test-session:0.1", "Build the login form UI");

    assert.equal(fake.sentToAgents.length, 1);
    assert.equal(fake.sentToAgents[0].paneId, "test-session:0.1");
    assert.ok(fake.sentToAgents[0].command.includes("Build the login form UI"));
  });

  it("broadcasts a directive to all agent panes", async () => {
    const fake = createFakeLayout();
    const coordinator = new TeamTmuxCoordinator(fake.layout as any);

    await coordinator.broadcastToAll("Please update your status");

    assert.equal(fake.sentToAgents.length, 2);
    assert.ok(fake.sentToAgents[0].command.includes("Please update your status"));
    assert.ok(fake.sentToAgents[1].command.includes("Please update your status"));
  });

  it("reads agent output from capture", async () => {
    const fake = createFakeLayout();
    const coordinator = new TeamTmuxCoordinator(fake.layout as any);

    const output = await coordinator.readAgentOutput("test-session:0.1");

    assert.ok(output.includes("test-session:0.1"));
  });

  it("stopCoordinator sets running flag to false", async () => {
    const fake = createFakeLayout();
    const coordinator = new TeamTmuxCoordinator(fake.layout as any);

    const runPromise = coordinator.startCoordinator(
      async (_input: string) => "Processed",
      async () => false // Never stop via shouldStop
    );

    // Give it a tick to start, then stop
    await new Promise((r) => setTimeout(r, 50));
    coordinator.stopCoordinator();

    // Should resolve quickly (the loop exits after stopCoordinator)
    await runPromise;
    assert.ok(true, "startCoordinator resolved after stopCoordinator");
  });
});
