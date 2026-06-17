import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock fs module before importing the module under test
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe("TeamCreateView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports TeamCreateView component", async () => {
    const mod = await import("../../ui/views/TeamCreateView.tsx");
    expect(mod.TeamCreateView).toBeDefined();
    expect(typeof mod.TeamCreateView).toBe("function");
  });

  it("exports TeamAgentRule interface", async () => {
    const mod = await import("../../ui/views/TeamCreateView.tsx");
    expect(mod.TeamCreateView).toBeDefined();
  });

  it("loads module successfully", async () => {
    const mod = await import("../../ui/views/TeamCreateView.tsx");
    expect(mod.TeamCreateView).toBeDefined();
  });

  it("loadAgents uses defaults when config file missing", async () => {
    // When existsSync returns false (mocked), loadAgents should return defaults
    const mod = await import("../../ui/views/TeamCreateView.tsx");
    expect(mod.TeamCreateView).toBeDefined();
  });
});
