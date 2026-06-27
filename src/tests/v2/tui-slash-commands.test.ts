import { describe, expect, it } from "vitest";
import { dispatchSlashCommand } from "../../tui/controllers/slash-command-controller";

describe("dispatchSlashCommand", () => {
  it("maps /new, /continue, and /raw to shell actions", () => {
    const actions: string[] = [];
    dispatchSlashCommand("/new", {
      newSession: () => actions.push("new"),
      continueSession: () => actions.push("continue"),
      toggleRaw: () => actions.push("raw"),
      openSessions: () => actions.push("sessions"),
    });
    dispatchSlashCommand("/continue", {
      newSession: () => actions.push("new"),
      continueSession: () => actions.push("continue"),
      toggleRaw: () => actions.push("raw"),
      openSessions: () => actions.push("sessions"),
    });
    dispatchSlashCommand("/raw", {
      newSession: () => actions.push("new"),
      continueSession: () => actions.push("continue"),
      toggleRaw: () => actions.push("raw"),
      openSessions: () => actions.push("sessions"),
    });
    expect(actions).toEqual(["new", "continue", "raw"]);
  });
});
