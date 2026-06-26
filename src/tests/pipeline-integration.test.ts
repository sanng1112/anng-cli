import { describe, it, expect } from "vitest";
import { resolveCurrentSettings, DEFAULT_PIPELINE_SETTINGS } from "../settings";

describe("Pipeline CLI Configuration Integration", () => {
  it("should include pipeline settings in resolved settings", () => {
    const settings = resolveCurrentSettings(process.cwd());
    expect(settings.pipeline).toBeDefined();
    expect(settings.pipeline.plannerModel).toBeDefined();
    expect(settings.pipeline.executorModel).toBeDefined();
    expect(settings.pipeline.fixerModel).toBeDefined();
    expect(settings.pipeline.maxRepairAttempts).toBeGreaterThan(0);
  });

  it("should fallback to DEFAULT_PIPELINE_SETTINGS values", () => {
    const settings = resolveCurrentSettings(process.cwd());
    expect(settings.pipeline.plannerModel).toBe(DEFAULT_PIPELINE_SETTINGS.plannerModel);
    expect(settings.pipeline.maxRepairAttempts).toBe(DEFAULT_PIPELINE_SETTINGS.maxRepairAttempts);
  });

  it("DEFAULT_PIPELINE_SETTINGS should have safe defaults", () => {
    expect(DEFAULT_PIPELINE_SETTINGS.maxRepairAttempts).toBeGreaterThan(0);
    expect(DEFAULT_PIPELINE_SETTINGS.plannerModel).toBeTruthy();
    expect(DEFAULT_PIPELINE_SETTINGS.executorModel).toBeTruthy();
    expect(DEFAULT_PIPELINE_SETTINGS.fixerModel).toBeTruthy();
  });
});
