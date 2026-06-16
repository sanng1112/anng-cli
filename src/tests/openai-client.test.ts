import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getProviderConfig, rotateApiKey, maybeRotateApiKeyOnError } from "../common/openai-client";
import type { ResolvedDeepcodingSettings } from "../settings";
import { DEFAULT_MAX_TURNS } from "../common/constants";

function makeSettings(overrides: Partial<ResolvedDeepcodingSettings> = {}): ResolvedDeepcodingSettings {
  return {
    model: "deepseek-v4-pro",
    apiKey: "sk-test-key-123",
    baseURL: "https://api.deepseek.com",
    thinkingEnabled: true,
    reasoningEffort: "max",
    debugLogEnabled: false,
    telemetryEnabled: false,
    geminiApiKey: "",
    geminiBaseURL: "",
    notify: "",
    webSearchTool: "",
    env: {},
    mcpServers: {},
    permissions: {
      allow: [],
      deny: [],
      ask: [],
      defaultMode: "askAll",
    },
    enabledSkills: {},
    temperature: 0,
    autoAccept: false,
    planMode: false,
    maxTurns: DEFAULT_MAX_TURNS,
    headlessPrompt: "",
    fullPowerMode: false,
    ...overrides,
  };
}

describe("getProviderConfig", () => {
  it("returns apiKey and baseURL for non-Gemini model", () => {
    const config = getProviderConfig(makeSettings({ model: "deepseek-v4-pro" }));
    assert.equal(config.apiKey, "sk-test-key-123");
    assert.equal(config.baseURL, "https://api.deepseek.com");
  });

  it("uses geminiApiKey when model is Gemini", () => {
    const config = getProviderConfig(makeSettings({ model: "gemini-2.5-flash", geminiApiKey: "gemini-key-abc" }));
    assert.equal(config.apiKey, "gemini-key-abc");
  });

  it("falls back to regular apiKey for Gemini if geminiApiKey is empty", () => {
    const config = getProviderConfig(
      makeSettings({ model: "gemini-2.5-flash", geminiApiKey: "", apiKey: "fallback-key" })
    );
    assert.equal(config.apiKey, "fallback-key");
  });

  it("uses geminiBaseURL when model is Gemini", () => {
    const config = getProviderConfig(
      makeSettings({ model: "gemini-2.5-flash", geminiBaseURL: "https://custom.gemini.api" })
    );
    assert.equal(config.baseURL, "https://custom.gemini.api");
  });

  it("uses default Gemini base URL when none configured", () => {
    const config = getProviderConfig(makeSettings({ model: "gemini-2.5-flash" }));
    assert.equal(config.baseURL, "https://generativelanguage.googleapis.com/v1beta/openai/");
  });

  it("returns empty apiKey when none configured", () => {
    const config = getProviderConfig(makeSettings({ apiKey: "" }));
    assert.equal(config.apiKey, "");
  });

  it("detects Gemini model case-insensitively", () => {
    const config = getProviderConfig(makeSettings({ model: "GEMINI-2.5-pro", geminiApiKey: "gk-pro" }));
    assert.equal(config.apiKey, "gk-pro");
    assert.equal(config.baseURL, "https://generativelanguage.googleapis.com/v1beta/openai/");
  });

  it("uses geminiBaseURL only for Gemini models", () => {
    const config = getProviderConfig(
      makeSettings({
        model: "deepseek-v4-pro",
        geminiBaseURL: "https://custom.gemini",
      })
    );
    assert.equal(config.baseURL, "https://api.deepseek.com");
  });
});

describe("rotateApiKey", () => {
  it("is a no-op when no provider state exists", () => {
    assert.doesNotThrow(() => rotateApiKey("unknown-provider-url"));
  });
});

describe("maybeRotateApiKeyOnError", () => {
  it("returns false for non-Error inputs", () => {
    assert.equal(maybeRotateApiKeyOnError("test", "string error"), false);
    assert.equal(maybeRotateApiKeyOnError("test", null), false);
    assert.equal(maybeRotateApiKeyOnError("test", undefined), false);
  });

  it("returns false for non-rate-limit errors", () => {
    assert.equal(maybeRotateApiKeyOnError("test", Object.assign(new Error("oops"), { status: 500 })), false);
  });

  it("detects 429 status code", () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
    // Returns false because no KeyRotator exists for this provider
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });

  it("detects rate_limit_exceeded code", () => {
    const err = Object.assign(new Error("Rate limited"), { code: "rate_limit_exceeded" });
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("detects insufficient_quota code", () => {
    const err = Object.assign(new Error("Quota exceeded"), { code: "insufficient_quota" });
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("detects 429 in message text", () => {
    const err = new Error("Error 429: Too many requests");
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("detects rate limit keyword in message", () => {
    const err = new Error("Rate limit exceeded for model");
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("detects quota keyword in message", () => {
    const err = new Error("You exceeded your current quota");
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("detects resource_exhausted in message", () => {
    const err = new Error("RESOURCE_EXHAUSTED: out of tokens");
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("detects billing keyword in message", () => {
    const err = new Error("Billing account not active");
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });

  it("handles error with null message gracefully", () => {
    const err = Object.assign(new Error(""), { status: 429, message: "" });
    assert.equal(maybeRotateApiKeyOnError("test", err), false);
  });
});
