import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { TerminalMultiplexer } from "../../team/integrations/terminal-multiplexer";
import { TeamTmuxLayout } from "../../team/team-tmux-layout";
import type { TmuxLayoutConfig } from "../../team/types";

/**
 * Build a mock multiplexer that records every call for later assertion.
 */
function createMockMux() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const mock: TerminalMultiplexer = {
    createSession: async (name: string, cwd: string) => {
      calls.push({ method: "createSession", args: [name, cwd] });
    },
    createPane: async (sessionName: string, command: string, cwd: string) => {
      calls.push({ method: "createPane", args: [sessionName, command, cwd] });
      return `${sessionName}:pane-${calls.length}`;
    },
    sendCommand: async (paneId: string, command: string) => {
      calls.push({ method: "sendCommand", args: [paneId, command] });
    },
    capturePane: async (paneId: string) => {
      calls.push({ method: "capturePane", args: [paneId] });
      return `[captured from ${paneId}]`;
    },
    killSession: async (name: string) => {
      calls.push({ method: "killSession", args: [name] });
    },
    isAvailable: async () => true,
    selectLayout: async (sessionName: string, layout: string) => {
      calls.push({ method: "selectLayout", args: [sessionName, layout] });
    },
    splitPaneVertically: async (sessionName: string, targetPane?: string) => {
      calls.push({ method: "splitPaneVertically", args: [sessionName, targetPane] });
      return `${sessionName}:new-pane`;
    },
    setPaneTitle: async (paneId: string, title: string) => {
      calls.push({ method: "setPaneTitle", args: [paneId, title] });
    },
    listPanes: async (sessionName: string) => {
      calls.push({ method: "listPanes", args: [sessionName] });
      return [`${sessionName}:0.0`, `${sessionName}:0.1`];
    },
  };
  return { mock, calls };
}

describe("TeamTmuxLayout", () => {
  let mockMux: ReturnType<typeof createMockMux>;

  beforeEach(() => {
    mockMux = createMockMux();
  });

  it("creates a tmux session with coordinator pane and agent panes", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test-team",
      cwd: "/tmp/test-project",
      coordinatorLabel: "Coordinator",
      agents: [
        { name: "Frontend Worker", command: "anng --worker -p task1" },
        { name: "Backend Worker", command: "anng --worker -p task2" },
      ],
    };

    const layout = new TeamTmuxLayout(mockMux.mock, config);
    const result = await layout.createTeamSession();

    // Should have created the session
    const createCall = mockMux.calls.find((c) => c.method === "createSession");
    assert.ok(createCall, "createSession should have been called");
    assert.equal(createCall!.args[0], "test-team");
    assert.equal(createCall!.args[1], "/tmp/test-project");

    // Should have split vertically for coordinator vs agents
    const splitCalls = mockMux.calls.filter((c) => c.method === "splitPaneVertically");
    assert.equal(splitCalls.length, 1, "one split for coordinator vs agents");

    // Should have set pane titles
    const titleCalls = mockMux.calls.filter((c) => c.method === "setPaneTitle");
    assert.ok(titleCalls.length >= 3, "should set titles for coordinator and agents");
    assert.equal(titleCalls[0].args[1], "Coordinator");

    // Should return coordinator pane ID and agent pane IDs
    assert.ok(result.coordinatorPaneId, "should have coordinator pane ID");
    assert.equal(result.agentPaneIds.length, 2, "should have 2 agent pane IDs");

    // Should have selected main-vertical layout
    const layoutCall = mockMux.calls.find((c) => c.method === "selectLayout");
    assert.ok(layoutCall, "selectLayout should have been called");
    assert.equal(layoutCall!.args[1], "main-vertical");
  });

  it("sendToAgentPane sends command to specific agent pane", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test-team",
      cwd: "/tmp/test-project",
      coordinatorLabel: "Coordinator",
      agents: [{ name: "Agent1", command: "anng --worker" }],
    };

    const layout = new TeamTmuxLayout(mockMux.mock, config);
    const result = await layout.createTeamSession();

    await layout.sendToAgentPane(result.agentPaneIds[0], "Hello agent");

    const sendCall = mockMux.calls.find((c) => c.method === "sendCommand" && c.args[0] === result.agentPaneIds[0]);
    assert.ok(sendCall, "sendCommand should have been called on the agent pane");
    assert.ok((sendCall!.args[1] as string).includes("Hello agent"));
  });

  it("killTeamSession kills the tmux session", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test-team",
      cwd: "/tmp",
      coordinatorLabel: "Coordinator",
      agents: [],
    };

    const layout = new TeamTmuxLayout(mockMux.mock, config);
    await layout.createTeamSession();
    await layout.killTeamSession();

    const killCall = mockMux.calls.find((c) => c.method === "killSession");
    assert.ok(killCall, "killSession should have been called");
  });

  it("sendToCoordinator sends command to coordinator pane", async () => {
    const config: TmuxLayoutConfig = {
      sessionName: "test",
      cwd: "/tmp",
      coordinatorLabel: "Coordinator",
      agents: [],
    };

    const layout = new TeamTmuxLayout(mockMux.mock, config);
    await layout.createTeamSession();

    await layout.sendToCoordinator("echo 'hello'");

    const sendCall = mockMux.calls.find((c) => c.method === "sendCommand");
    assert.ok(sendCall, "sendCommand should have been called");
    assert.ok((sendCall!.args[1] as string).includes("hello"));
  });
});
