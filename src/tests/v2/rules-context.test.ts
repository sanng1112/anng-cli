import { describe, expect, it } from "vitest";
import { buildRuleBundle } from "../../core/engine/rules-context";

describe("rules context", () => {
  it("builds rule sets", () => {
    const rules = buildRuleBundle("/repo");
    expect(Array.isArray(rules)).toBe(true);
  });
});
