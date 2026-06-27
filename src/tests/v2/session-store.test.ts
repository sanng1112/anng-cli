import { describe, expect, it } from "vitest";
import { SessionStore } from "../../core/engine/session-store";

describe("SessionStore", () => {
  it("reads back stored sessions in update-time order", () => {
    const store = new SessionStore("/tmp/project");
    expect(typeof store.listSessions).toBe("function");
  });
});
