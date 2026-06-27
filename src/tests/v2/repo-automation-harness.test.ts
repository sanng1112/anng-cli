import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("repo automation fixtures", () => {
  it("ships a benchmark mini repo and scenario definitions", () => {
    expect(fs.existsSync("benchmarks/fixtures/mini-repo/package.json")).toBe(true);
    expect(fs.existsSync("benchmarks/scenarios/repo-automation.json")).toBe(true);
  });

  it("defines a bench:run script", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["bench:run"]).toBeDefined();
  });
});
