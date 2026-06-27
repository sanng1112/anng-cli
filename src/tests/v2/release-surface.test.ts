import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("release surface", () => {
  it("publishes a single canonical CLI entrypoint", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      bin?: Record<string, string>;
      main?: string;
    };

    expect(pkg.bin?.anng).toBe("./dist/index.js");
    expect(pkg.main).toBe("./dist/index.js");
  });

  it("documents the command groups that the runtime actually ships", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    expect(readme).toContain("anng doctor");
    expect(readme).toContain("anng sessions");
    expect(readme).toContain("anng mcp");
    expect(readme).toContain("anng daemon");
  });

  it("defines a release:check script", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["release:check"]).toBeDefined();
  });
});
