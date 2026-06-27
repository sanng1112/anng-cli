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
});
