import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

describe("headless contract", () => {
  it("emits run_started and run_result in json mode", () => {
    const output = execFileSync("node", ["dist/index.js", "--json", "hello"], {
      encoding: "utf8",
      env: { ...process.env, ANNG_MOCK_LLM: "true" },
    });
    expect(output).toContain('"type":"run_started"');
    expect(output).toContain('"type":"run_result"');
  });
});
