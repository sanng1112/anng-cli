import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logApiError, type ApiErrorLogEntry } from "../common/error-logger";

const LOG_DIR = path.join(os.homedir(), ".anng", "logs");
const LOG_PATH = path.join(LOG_DIR, "error.log");

function makeEntry(overrides: Partial<ApiErrorLogEntry> = {}): ApiErrorLogEntry {
  return {
    timestamp: new Date().toISOString(),
    location: "test-location",
    requestId: "req-001",
    error: {
      name: "Error",
      message: "Something went wrong",
      stack: "Error: Something went wrong\n    at test.ts:1:1",
    },
    request: {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
    },
    ...overrides,
  };
}

function readLastLogEntry(): Record<string, unknown> | null {
  if (!fs.existsSync(LOG_PATH)) return null;
  const raw = fs.readFileSync(LOG_PATH, "utf8").trim();
  if (!raw) return null;
  const lines = raw.split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
}

function errorMessage(logged: Record<string, unknown> | null): string {
  const error = logged?.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    return String((error as Record<string, unknown>).message ?? "");
  }
  return "";
}

describe("maskSensitive", () => {
  afterEach(() => {
    try {
      if (fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "", "utf8");
    } catch {
      /* cleanup */
    }
  });

  it("masks Bearer tokens in error messages", () => {
    logApiError(
      makeEntry({
        error: {
          name: "AuthenticationError",
          message: "Invalid token: Authorization: Bearer sk-abc123def456",
        },
      })
    );

    const logged = readLastLogEntry();
    assert.equal(errorMessage(logged), "Invalid token: Authorization: Bearer ***MASKED***");
  });

  it("masks apiKey values in colon format", () => {
    logApiError(
      makeEntry({
        error: { name: "ConfigError", message: "apiKey: sk-secret-key-123" },
      })
    );

    const logged = readLastLogEntry();
    assert.equal(errorMessage(logged), "apiKey: ***MASKED***");
  });

  it("masks api_key values in error messages", () => {
    logApiError(
      makeEntry({
        error: { name: "ConfigError", message: 'api_key: "sk-another-secret"' },
      })
    );

    const logged = readLastLogEntry();
    assert.equal(errorMessage(logged), 'api_key: "***MASKED***"');
  });

  it("masks sensitive data in error stack traces", () => {
    logApiError(
      makeEntry({
        error: {
          name: "Error",
          message: "Request failed",
          stack: "    at call(/home/user/.anng/settings.json: apiKey: sk-deadbeef)",
        },
      })
    );

    const logged = readLastLogEntry();
    const errorStack =
      logged?.error && typeof logged.error === "object" && !Array.isArray(logged.error)
        ? String((logged.error as Record<string, unknown>).stack ?? "")
        : "";
    assert.ok(errorStack.includes("***MASKED***"));
  });

  it("truncates long request content fields", () => {
    const longContent = "x".repeat(200);
    logApiError(
      makeEntry({
        request: { model: "deepseek-v4-pro", messages: [{ role: "user", content: longContent }] },
      })
    );

    const logged = readLastLogEntry();
    const messages = (logged?.request as { messages?: Array<{ content: string }> })?.messages;
    assert.ok(messages?.[0]?.content.startsWith("x".repeat(100)));
    assert.ok(messages?.[0]?.content.includes("(total 200 chars)"));
  });

  it("preserves short content fields untouched", () => {
    logApiError(
      makeEntry({
        request: { model: "test", messages: [{ role: "user", content: "hi" }] },
      })
    );

    const logged = readLastLogEntry();
    const messages = (logged?.request as { messages?: Array<{ content: string }> })?.messages;
    assert.equal(messages?.[0]?.content, "hi");
  });
});

describe("log rotation", () => {
  afterEach(() => {
    try {
      if (fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "", "utf8");
    } catch {
      /* cleanup */
    }
  });

  it("keeps only last 20 entries", () => {
    for (let i = 0; i < 25; i++) {
      logApiError(
        makeEntry({
          requestId: `req-${String(i).padStart(2, "0")}`,
          error: { name: "Error", message: `Error ${i}` },
        })
      );
    }

    const raw = fs.readFileSync(LOG_PATH, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 20);
    const lastEntry = JSON.parse(lines[19]);
    assert.equal(lastEntry.requestId, "req-24");
  });
});

describe("log entry fields", () => {
  afterEach(() => {
    try {
      if (fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "", "utf8");
    } catch {
      /* cleanup */
    }
  });

  it("includes timestamp, sessionId, model, baseURL", () => {
    logApiError(
      makeEntry({
        sessionId: "sess-001",
        model: "deepseek-v4-pro",
        baseURL: "https://api.deepseek.com",
      })
    );

    const logged = readLastLogEntry();
    assert.equal(logged?.sessionId, "sess-001");
    assert.equal(logged?.model, "deepseek-v4-pro");
    assert.equal(logged?.baseURL, "https://api.deepseek.com");
    assert.ok(typeof logged?.timestamp === "string");
  });

  it("masks response data when provided", () => {
    logApiError(
      makeEntry({
        response: '{"error":{"message":"Authorization: Bearer sk-abc"}}',
      })
    );

    const logged = readLastLogEntry();
    assert.ok((logged?.response as string)?.includes("***MASKED***"));
  });

  it("does not crash when fs writes fail silently", () => {
    assert.doesNotThrow(() => {
      logApiError(makeEntry());
    });
  });
});
