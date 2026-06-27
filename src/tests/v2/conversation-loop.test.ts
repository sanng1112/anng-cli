import { describe, expect, it } from "vitest";
import { runAgent } from "../../core/engine/conversation-loop";

describe("conversation loop", () => {
  it("exposes the runAgent runner", () => {
    expect(typeof runAgent).toBe("function");
  });
});
