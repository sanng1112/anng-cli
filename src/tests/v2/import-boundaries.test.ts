import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function collectFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("core import boundaries", () => {
  it("blocks src/core from importing src/tui", () => {
    const files = collectFiles(path.join(process.cwd(), "src", "core"));
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source.includes("../tui")).toBe(false);
      expect(source.includes("/tui")).toBe(false);
    }
  });
});
