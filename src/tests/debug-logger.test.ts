import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getDebugLogPath, logOpenAIChatCompletionDebug } from "../common/debug-logger";

test("debug logger masks sensitive values, truncates content, and rotates old entries", () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "anng-debug-log-home-"));
  process.env.HOME = home;
  if (process.platform === "win32") {
    process.env.USERPROFILE = home;
  }
  try {
    const longContent = "x".repeat(700);
    for (let index = 0; index < 250; index += 1) {
      logOpenAIChatCompletionDebug({
        timestamp: "2026-01-01T00:00:00.000Z",
        location: "test.location",
        requestId: `request-${index}`,
        model: "test-model",
        request: {
          model: "test-model",
          headers: {
            Authorization: `Bearer secret-${index}`,
          },
          messages: [{ role: "user", content: `${longContent}${index}` }],
        },
        response: {
          apiKey: `sk-secret-${index}`,
          choices: [{ message: { content: `${longContent}${index}` } }],
        },
      });
    }

    const raw = fs.readFileSync(getDebugLogPath(), "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 200);

    const first = JSON.parse(lines[0]) as Record<string, any>;
    const last = JSON.parse(lines[199]) as Record<string, any>;
    assert.equal(first.requestId, "request-50");
    assert.equal(first.request.headers.Authorization, "***MASKED***");
    assert.match(first.request.messages[0].content, /\.\.\.\(total \d+ chars\)$/);
    assert.equal(first.response.apiKey, "***MASKED***");
    assert.match(first.response.choices[0].message.content, /\.\.\.\(total \d+ chars\)$/);
    assert.equal(last.requestId, "request-249");
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
  }
});
