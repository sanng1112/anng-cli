import { describe, expect, it } from "vitest";
import { GeminiSmartPool } from "../../core/gemini/smart-pool";

describe("GeminiSmartPool", () => {
  it("marks 403 keys dead for the rest of the session", () => {
    const pool = new GeminiSmartPool({ "gemini-2.5-pro": ["k1", "k2"] });

    pool.markInvalid("gemini-2.5-pro", "k1", "403");

    expect(pool.snapshot("gemini-2.5-pro")[0]?.status).toBe("dead");
  });

  it("puts rate-limited keys into cooldown before reusing them", () => {
    const pool = new GeminiSmartPool({ "gemini-2.5-pro": ["k1"] });

    pool.markRateLimited("gemini-2.5-pro", "k1", 60);

    expect(pool.snapshot("gemini-2.5-pro")[0]?.status).toBe("rate_limited");
  });

  it("checks rate-limited status via getState", () => {
    const pool = new GeminiSmartPool({ "gemini-2.5-pro": ["k1"] });
    pool.markRateLimited("gemini-2.5-pro", "k1", 60);
    expect(pool.getState("gemini-2.5-pro")[0]?.status).toBe("rate_limited");
  });
});
