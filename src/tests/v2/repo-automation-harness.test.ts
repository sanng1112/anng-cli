import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("repo automation fixtures", () => {
  it("ships a benchmark mini repo and scenario definitions", () => {
    expect(fs.existsSync("benchmarks/fixtures/mini-repo/package.json")).toBe(true);
    expect(fs.existsSync("benchmarks/scenarios/repo-automation.json")).toBe(true);
  });
});
