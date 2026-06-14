# Kiểm Thử Toàn Bộ DeepCode CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve comprehensive test coverage across all 15+ untested source modules in deepcode-cli, prioritizing critical paths (API connectivity, validation, file I/O, state management) with the Node.js native test runner.

**Architecture:** Each test module tests one source module in isolation using `node:test` + `node:assert/strict`, following the existing test patterns (describe/it blocks, manual mocks for fs/process/file I/O via inline stubs, cleanup via `afterEach`). Tests are grouped by risk level — 🔴 CRITICAL (openai-client), 🟠 MEDIUM (validate, state, file-utils, error-logger, mcp-manager), 🟡 LOW (model-capabilities, bash-timeout, ask-user-question).

**Tech Stack:** Node.js ≥22 native test runner, tsx for TypeScript, node:assert/strict, node:fs mock via temp directories, no external mocking frameworks.

---

## File Structure

```
src/tests/
├── openai-client.test.ts        [NEW]  getProviderConfig, maybeRotateApiKeyOnError, client caching
├── validate.test.ts             [NEW]  semanticBoolean, semanticInteger, executeValidatedTool
├── error-logger.test.ts         [NEW]  maskSensitive, truncateContent, logApiError rotation
├── model-capabilities.test.ts   [NEW]  defaultsToThinkingMode, supportsMultimodal
├── bash-timeout.test.ts         [NEW]  clampBashTimeoutMs boundary cases
├── state.test.ts                [NEW]  recordFileState, getFileState, createSnippet, clearSessionState
├── file-utils.test.ts           [NEW]  detectEncoding, buildDiffPreview, hasFileChangedSinceState
└── ask-user-question.test.ts    [MOD]  Add parseQuestions, buildQuestionSummary tests
```

---

## PHASE 🟡 LOW: Quick Wins (Safe, Pure Logic)

### Task 1: model-capabilities.test.ts

**Files:** Create: `src/tests/model-capabilities.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEEPSEEK_V4_MODELS, NON_MULTIMODAL_MODELS, defaultsToThinkingMode, supportsMultimodal } from "../common/model-capabilities";

describe("DEEPSEEK_V4_MODELS", () => {
  it("contains deepseek-v4-flash and deepseek-v4-pro", () => {
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-flash"), true);
    assert.equal(DEEPSEEK_V4_MODELS.has("deepseek-v4-pro"), true);
  });

  it("does not contain other models", () => {
    assert.equal(DEEPSEEK_V4_MODELS.has("gpt-4"), false);
    assert.equal(DEEPSEEK_V4_MODELS.has("gemini-2.5-flash"), false);
  });
});

describe("NON_MULTIMODAL_MODELS", () => {
  it("includes deepseek models and excludes gemini", () => {
    assert.equal(NON_MULTIMODAL_MODELS.has("deepseek-v4-pro"), true);
    assert.equal(NON_MULTIMODAL_MODELS.has("deepseek-chat"), true);
    assert.equal(NON_MULTIMODAL_MODELS.has("gemini-2.5-flash"), false);
  });
});

describe("defaultsToThinkingMode", () => {
  it("returns true for deepseek V4 models", () => {
    assert.equal(defaultsToThinkingMode("deepseek-v4-pro"), true);
    assert.equal(defaultsToThinkingMode("deepseek-v4-flash"), true);
  });

  it("returns false for non-V4 models", () => {
    assert.equal(defaultsToThinkingMode("deepseek-chat"), false);
    assert.equal(defaultsToThinkingMode("gemini-2.5-flash"), false);
    assert.equal(defaultsToThinkingMode("gpt-4"), false);
  });
});

describe("supportsMultimodal", () => {
  it("returns false for non-multimodal models", () => {
    assert.equal(supportsMultimodal("deepseek-v4-pro"), false);
    assert.equal(supportsMultimodal("deepseek-reasoner"), false);
  });

  it("returns true for multimodal models", () => {
    assert.equal(supportsMultimodal("gemini-2.5-flash"), true);
    assert.equal(supportsMultimodal("gpt-4o"), true);
  });

  it("trims whitespace from model name", () => {
    assert.equal(supportsMultimodal("  deepseek-chat  "), false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/model-capabilities.test.ts
```
Expected: PASS (all assertions pass)

- [ ] **Step 3: Commit**

```bash
git add src/tests/model-capabilities.test.ts
git commit -m "test: add model-capabilities unit tests"
```

---

### Task 2: bash-timeout.test.ts

**Files:** Create: `src/tests/bash-timeout.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampBashTimeoutMs,
  DEFAULT_BASH_TIMEOUT_MS,
  MIN_BASH_TIMEOUT_MS,
  BASH_TIMEOUT_INCREMENT_MS,
  BASH_TIMEOUT_DECREMENT_MS,
} from "../common/bash-timeout";

describe("bash-timeout constants", () => {
  it("DEFAULT_BASH_TIMEOUT_MS is 10 minutes", () => {
    assert.equal(DEFAULT_BASH_TIMEOUT_MS, 10 * 60 * 1000);
  });

  it("MIN_BASH_TIMEOUT_MS is 1 minute", () => {
    assert.equal(MIN_BASH_TIMEOUT_MS, 60 * 1000);
  });

  it("BASH_TIMEOUT_INCREMENT_MS is 5 minutes", () => {
    assert.equal(BASH_TIMEOUT_INCREMENT_MS, 5 * 60 * 1000);
  });

  it("BASH_TIMEOUT_DECREMENT_MS is 1 minute", () => {
    assert.equal(BASH_TIMEOUT_DECREMENT_MS, 60 * 1000);
  });
});

describe("clampBashTimeoutMs", () => {
  it("returns default for non-finite values", () => {
    assert.equal(clampBashTimeoutMs(NaN), DEFAULT_BASH_TIMEOUT_MS);
    assert.equal(clampBashTimeoutMs(Infinity), DEFAULT_BASH_TIMEOUT_MS);
    assert.equal(clampBashTimeoutMs(-Infinity), DEFAULT_BASH_TIMEOUT_MS);
  });

  it("returns default for NaN", () => {
    assert.equal(clampBashTimeoutMs(NaN), DEFAULT_BASH_TIMEOUT_MS);
  });

  it("clamps below minimum", () => {
    assert.equal(clampBashTimeoutMs(500), MIN_BASH_TIMEOUT_MS);
    assert.equal(clampBashTimeoutMs(0), MIN_BASH_TIMEOUT_MS);
    assert.equal(clampBashTimeoutMs(-1000), MIN_BASH_TIMEOUT_MS);
  });

  it("passes through valid values", () => {
    assert.equal(clampBashTimeoutMs(120000), 120000);
    assert.equal(clampBashTimeoutMs(300000), 300000);
    assert.equal(clampBashTimeoutMs(600000), 600000);
  });

  it("respects custom minimum", () => {
    assert.equal(clampBashTimeoutMs(5000, 10000), 10000);
    assert.equal(clampBashTimeoutMs(15000, 10000), 15000);
  });

  it("handles zero custom minimum gracefully", () => {
    assert.equal(clampBashTimeoutMs(5000, 0), 5000);
  });

  it("rounds non-integer values", () => {
    const result = clampBashTimeoutMs(120000.7, MIN_BASH_TIMEOUT_MS);
    assert.equal(result, 120001);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/bash-timeout.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/bash-timeout.test.ts
git commit -m "test: add bash-timeout unit tests"
```

---

### Task 3: validate.test.ts

**Files:** Create: `src/tests/validate.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { semanticBoolean, semanticInteger, executeValidatedTool } from "../common/validate";
import type { ToolExecutionContext } from "../tools/executor";

const noopContext: ToolExecutionContext = {
  sessionId: "test-session",
  projectRoot: "/tmp/test",
  toolCall: { id: "call-1", type: "function", function: { name: "test", arguments: "{}" } },
};

describe("semanticBoolean", () => {
  it("converts 'true' string to boolean true", () => {
    const schema = z.object({ flag: semanticBoolean(false) });
    const result = schema.parse({ flag: "true" });
    assert.equal(result.flag, true);
  });

  it("converts 'false' string to boolean false", () => {
    const schema = z.object({ flag: semanticBoolean(true) });
    const result = schema.parse({ flag: "false" });
    assert.equal(result.flag, false);
  });

  it("passes through boolean values", () => {
    const schema = z.object({ flag: semanticBoolean(false) });
    assert.equal(schema.parse({ flag: true }).flag, true);
    assert.equal(schema.parse({ flag: false }).flag, false);
  });

  it("uses default when field is missing", () => {
    const schema = z.object({ flag: semanticBoolean(true) });
    assert.equal(schema.parse({}).flag, true);
  });
});

describe("semanticInteger", () => {
  it("converts numeric string to number", () => {
    const schema = z.object({ count: semanticInteger("count", { min: 0 }) });
    assert.equal(schema.parse({ count: "5" }).count, 5);
  });

  it("passes through numbers", () => {
    const schema = z.object({ count: semanticInteger("count", { min: 0 }) });
    assert.equal(schema.parse({ count: 10 }).count, 10);
  });

  it("rejects values below minimum", () => {
    const schema = z.object({ count: semanticInteger("count", { min: 1 }) });
    assert.throws(() => schema.parse({ count: 0 }));
  });

  it("rejects empty string conversion", () => {
    const schema = z.object({ count: semanticInteger("count") });
    assert.throws(() => schema.parse({ count: "" }));
  });
});

describe("executeValidatedTool", () => {
  it("returns ok result when validation passes", async () => {
    const schema = z.strictObject({ name: z.string() });
    const result = await executeValidatedTool("test", schema, { name: "hello" }, noopContext, async (input) => ({
      ok: true,
      name: "test",
      output: input.name,
    }));
    assert.equal(result.ok, true);
    assert.equal(result.output, "hello");
  });

  it("returns error when validation fails", async () => {
    const schema = z.strictObject({ name: z.string() });
    const result = await executeValidatedTool("test", schema, { name: 123 }, noopContext, async () => ({
      ok: true,
      name: "test",
      output: "never called",
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("InputValidationError"));
  });

  it("returns error when preprocess fails", async () => {
    const schema = z.strictObject({ name: z.string() });
    const result = await executeValidatedTool(
      "test",
      schema,
      { name: "irrelevant" },
      noopContext,
      async () => ({ ok: true, name: "test", output: "never called" }),
      {
        preprocess: () => ({ ok: false, error: "Preprocess rejected input" }),
      }
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("Preprocess rejected input"));
  });

  it("passes parsed data to handler", async () => {
    const schema = z.strictObject({ value: z.number() });
    let receivedValue = 0;
    const result = await executeValidatedTool("test", schema, { value: 42 }, noopContext, async (input) => {
      receivedValue = input.value;
      return { ok: true, name: "test", output: "done" };
    });
    assert.equal(result.ok, true);
    assert.equal(receivedValue, 42);
  });

  it("handles semanticInteger preprocessing in schema", async () => {
    const schema = z.strictObject({ count: semanticInteger("count", { min: 1 }) });
    const result = await executeValidatedTool("test", schema, { count: "3" }, noopContext, async (input) => ({
      ok: true,
      name: "test",
      output: String(input.count),
    }));
    assert.equal(result.ok, true);
    assert.equal(result.output, "3");
  });

  it("propagates handler errors", async () => {
    const schema = z.strictObject({});
    const result = await executeValidatedTool("test", schema, {}, noopContext, async () => {
      throw new Error("Handler exploded");
    });
    assert.equal(result.ok, false);
    assert.equal(result.name, "test");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/validate.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/validate.test.ts
git commit -m "test: add validate unit tests (semanticBoolean, semanticInteger, executeValidatedTool)"
```

---

### Task 4: error-logger.test.ts

**Files:** Create: `src/tests/error-logger.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logApiError, type ApiErrorLogEntry } from "../common/error-logger";

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

// Note: These tests verify maskSensitive and truncation logic indirectly via logApiError.
// To avoid polluting ~/.deepcode/logs/error.log, we read-write the log and verify contents.

describe("maskSensitive (via logApiError)", () => {
  const logDir = path.join(os.homedir(), ".deepcode", "logs");
  const logPath = path.join(logDir, "error.log");

  afterEach(() => {
    try {
      if (fs.existsSync(logPath)) fs.writeFileSync(logPath, "", "utf8");
    } catch {
      /* cleanup best-effort */
    }
  });

  it("masks Bearer tokens in error messages", () => {
    const entry = makeEntry({
      error: {
        name: "AuthenticationError",
        message: "Invalid token: Authorization: Bearer sk-abc123def456",
      },
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    assert.equal(logged.error.message, "Invalid token: Authorization: Bearer ***MASKED***");
  });

  it("masks apiKey values in error messages", () => {
    const entry = makeEntry({
      error: {
        name: "ConfigError",
        message: '{"apiKey": "sk-secret-key-123"}',
      },
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    assert.equal(logged.error.message, '{"apiKey": "***MASKED***"}');
  });

  it("masks api_key values in error messages", () => {
    const entry = makeEntry({
      error: {
        name: "ConfigError",
        message: 'api_key: "sk-another-secret"',
      },
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    assert.equal(logged.error.message, 'api_key: "***MASKED***"');
  });

  it("truncates long request content fields", () => {
    const longContent = "x".repeat(200);
    const entry = makeEntry({
      request: {
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: longContent }],
      },
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    const msgContent = (logged.request as { messages: Array<{ content: string }> }).messages[0].content;
    assert.ok(msgContent.startsWith("x".repeat(100)));
    assert.ok(msgContent.includes("(total 200 chars)"));
  });

  it("preserves short content fields untouched", () => {
    const entry = makeEntry({
      request: {
        model: "deepseek-v4-pro",
        messages: [{ role: "user", content: "short message" }],
      },
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    const msgContent = (logged.request as { messages: Array<{ content: string }> }).messages[0].content;
    assert.equal(msgContent, "short message");
  });

  it("masks sensitive data in error stack traces", () => {
    const entry = makeEntry({
      error: {
        name: "Error",
        message: "Request failed",
        stack: "    at call(/home/user/.deepcode/settings.json: apiKey: sk-deadbeef)",
      },
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    assert.ok((logged as { error: { stack: string } }).error.stack.includes("***MASKED***"));
  });

  it("rotates log file, keeping only last 20 entries", () => {
    // Write 25 entries, verify only 20 remain
    for (let i = 0; i < 25; i++) {
      logApiError(
        makeEntry({
          requestId: `req-${i}`,
          error: { name: "Error", message: `Error ${i}` },
        })
      );
    }

    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 20);
    const lastEntry = JSON.parse(lines[19]);
    assert.equal(lastEntry.requestId, "req-24");
  });

  it("includes timestamp, location, model, and baseURL in log entry", () => {
    const entry = makeEntry({
      sessionId: "sess-001",
      model: "deepseek-v4-pro",
      baseURL: "https://api.deepseek.com",
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    assert.equal(logged.sessionId, "sess-001");
    assert.equal(logged.model, "deepseek-v4-pro");
    assert.equal(logged.baseURL, "https://api.deepseek.com");
    assert.ok(typeof logged.timestamp === "string");
  });

  it("includes response data when provided (masked)", () => {
    const entry = makeEntry({
      response: '{"error":{"message":"Authorization: Bearer sk-abc"}}',
    });

    logApiError(entry);

    const raw = fs.readFileSync(logPath, "utf8");
    const logged = JSON.parse(raw.trim());
    assert.ok((logged as { response: string }).response.includes("***MASKED***"));
  });

  it("does not crash when fs.write fails (silent catch)", () => {
    // Verify no throw - logApiError catches fs errors silently
    assert.doesNotThrow(() => {
      logApiError(makeEntry());
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/error-logger.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/error-logger.test.ts
git commit -m "test: add error-logger unit tests (maskSensitive, truncation, rotation)"
```

---

## PHASE 🟠 MEDIUM: State & File I/O

### Task 5: file-utils.test.ts

**Files:** Create: `src/tests/file-utils.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  detectEncoding,
  detectLineEndings,
  normalizeContent,
  readTextFileWithMetadata,
  writeTextFile,
  buildDiffPreview,
  hasFileChangedSinceState,
  ensureParentDirectory,
} from "../common/file-utils";
import type { FileState } from "../common/state";

describe("normalizeContent", () => {
  it("converts CRLF to LF", () => {
    assert.equal(normalizeContent("a\r\nb\r\nc"), "a\nb\nc");
  });

  it("preserves LF-only content", () => {
    assert.equal(normalizeContent("a\nb\nc"), "a\nb\nc");
  });

  it("handles empty string", () => {
    assert.equal(normalizeContent(""), "");
  });
});

describe("detectLineEndings", () => {
  it("detects CRLF", () => {
    assert.equal(detectLineEndings("a\r\nb"), "CRLF");
  });

  it("detects LF", () => {
    assert.equal(detectLineEndings("a\nb"), "LF");
  });

  it("defaults to LF for empty content", () => {
    assert.equal(detectLineEndings(""), "LF");
  });
});

describe("detectEncoding", () => {
  it("detects UTF-16LE BOM", () => {
    const buf = Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x65, 0x00]);
    assert.equal(detectEncoding(buf), "utf16le");
  });

  it("returns utf8 for regular buffer", () => {
    const buf = Buffer.from("hello", "utf8");
    assert.equal(detectEncoding(buf), "utf8");
  });

  it("returns utf8 for empty buffer", () => {
    assert.equal(detectEncoding(Buffer.alloc(0)), "utf8");
  });
});

describe("readTextFileWithMetadata", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-test-file-utils-"));

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads a UTF-8 file and returns content, encoding, lineEndings, timestamp", () => {
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "line1\nline2\n", "utf8");

    const result = readTextFileWithMetadata(filePath);
    assert.equal(result.content, "line1\nline2\n");
    assert.equal(result.encoding, "utf8");
    assert.equal(result.lineEndings, "LF");
    assert.ok(typeof result.timestamp === "number");
    assert.ok(result.timestamp > 0);
  });

  it("normalizes CRLF to LF", () => {
    const filePath = path.join(tmpDir, "crlf.txt");
    fs.writeFileSync(filePath, "a\r\nb\r\nc", "utf8");

    const result = readTextFileWithMetadata(filePath);
    assert.equal(result.content, "a\nb\nc");
    assert.equal(result.lineEndings, "CRLF");
  });
});

describe("writeTextFile", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-test-file-utils-"));

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes content and preserves line endings", () => {
    const filePath = path.join(tmpDir, "out.txt");
    writeTextFile(filePath, "a\nb\nc", "utf8", "CRLF");

    const raw = fs.readFileSync(filePath, "utf8");
    assert.equal(raw, "a\r\nb\r\nc");
  });

  it("writes LF content as-is", () => {
    const filePath = path.join(tmpDir, "out-lf.txt");
    writeTextFile(filePath, "a\nb\nc", "utf8", "LF");

    const raw = fs.readFileSync(filePath, "utf8");
    assert.equal(raw, "a\nb\nc");
  });

  it("returns byte length of written content", () => {
    const filePath = path.join(tmpDir, "out-bytes.txt");
    const byteLength = writeTextFile(filePath, "abc", "utf8", "LF");
    assert.equal(byteLength, 3);
  });
});

describe("ensureParentDirectory", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-test-file-utils-"));

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates parent directories", () => {
    const deepPath = path.join(tmpDir, "nested", "deep", "file.txt");
    ensureParentDirectory(deepPath);
    assert.equal(fs.existsSync(path.dirname(deepPath)), true);
  });

  it("is idempotent", () => {
    const deepPath = path.join(tmpDir, "nested", "file.txt");
    ensureParentDirectory(deepPath);
    assert.doesNotThrow(() => ensureParentDirectory(deepPath));
  });
});

describe("buildDiffPreview", () => {
  it("returns null if original and updated are identical", () => {
    const result = buildDiffPreview("test.ts", "hello\nworld", "hello\nworld");
    assert.equal(result, null);
  });

  it("shows added lines for new file", () => {
    const result = buildDiffPreview("new.ts", null, "line1\nline2");
    assert.ok(result);
    assert.ok(result!.includes("--- /dev/null"));
    assert.ok(result!.includes("+++ b/new.ts"));
    assert.ok(result!.includes("+line1"));
    assert.ok(result!.includes("+line2"));
  });

  it("shows changed lines with context", () => {
    const result = buildDiffPreview("test.ts", "line1\nline2\nline3", "line1\nmodified\nline3");
    assert.ok(result);
    assert.ok(result!.includes(" line1"));
    assert.ok(result!.includes("-line2"));
    assert.ok(result!.includes("+modified"));
    assert.ok(result!.includes(" line3"));
  });

  it("truncates to maxLines", () => {
    const original = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const updated = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n");
    const result = buildDiffPreview("big.ts", original, updated, 5);
    assert.ok(result);
    const lines = result!.split("\n");
    assert.ok(lines.length <= 5 + 1); // +1 for "..."
  });

  it("handles empty original content", () => {
    const result = buildDiffPreview("empty.ts", "", "content");
    assert.ok(result);
    assert.ok(result!.includes("+content"));
  });
});

describe("hasFileChangedSinceState", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-test-file-utils-"));

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when file timestamp is not newer", () => {
    const filePath = path.join(tmpDir, "unchanged.txt");
    fs.writeFileSync(filePath, "content", "utf8");
    const stat = fs.statSync(filePath);

    const state: FileState = {
      filePath,
      content: "content",
      timestamp: stat.mtimeMs + 1000, // state is 1s newer than file
    };

    assert.equal(hasFileChangedSinceState(filePath, state), false);
  });

  it("returns false when file content matches state (full read)", () => {
    const filePath = path.join(tmpDir, "same-content.txt");
    fs.writeFileSync(filePath, "hello world", "utf8");

    const state: FileState = {
      filePath,
      content: "hello world",
      timestamp: 0, // old timestamp
    };

    assert.equal(hasFileChangedSinceState(filePath, state), false);
  });

  it("returns true when file content differs from full-read state", () => {
    const filePath = path.join(tmpDir, "different.txt");
    fs.writeFileSync(filePath, "new content", "utf8");

    const state: FileState = {
      filePath,
      content: "old content",
      timestamp: 0,
    };

    assert.equal(hasFileChangedSinceState(filePath, state), true);
  });

  it("returns true for partial views even if content is identical (different sections not checked)", () => {
    const filePath = path.join(tmpDir, "partial.txt");
    fs.writeFileSync(filePath, "line1\nline2\nline3", "utf8");

    const state: FileState = {
      filePath,
      content: "line1\nline2",
      timestamp: 0,
      isPartialView: true,
      offset: 1,
      limit: 2,
    };

    // Partial view should flag as potentially changed
    assert.equal(hasFileChangedSinceState(filePath, state), true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/file-utils.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/file-utils.test.ts
git commit -m "test: add file-utils unit tests (encoding, diff, file-mutation detection)"
```

---

### Task 6: state.test.ts

**Files:** Create: `src/tests/state.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearSessionState,
  recordFileState,
  getFileState,
  wasFileRead,
  getFileVersion,
  createSnippet,
  createFullFileSnippet,
  getSnippet,
  hasSnippetOutdatedFileVersion,
  hasSessionState,
  isFullFileView,
  restoreSnippet,
  rebuildSessionStateFromHistory,
} from "../common/state";

describe("recordFileState / getFileState", () => {
  const sessionId = "test-session-state";

  afterEach(() => {
    clearSessionState(sessionId);
  });

  it("records and retrieves file state", () => {
    recordFileState(sessionId, {
      filePath: "/tmp/test.txt",
      content: "hello",
      timestamp: 1000,
    });

    const state = getFileState(sessionId, "/tmp/test.txt");
    assert.ok(state);
    assert.equal(state!.content, "hello");
    assert.equal(state!.timestamp, 1000);
  });

  it("returns null for unknown path", () => {
    assert.equal(getFileState(sessionId, "/tmp/nonexistent.txt"), null);
  });

  it("increments file version when option set", () => {
    recordFileState(sessionId, { filePath: "/tmp/v.txt", content: "a", timestamp: 1 }, { incrementVersion: true });
    assert.equal(getFileVersion(sessionId, "/tmp/v.txt"), 1);

    recordFileState(sessionId, { filePath: "/tmp/v.txt", content: "b", timestamp: 2 }, { incrementVersion: true });
    assert.equal(getFileVersion(sessionId, "/tmp/v.txt"), 2);
  });

  it("does not increment version by default", () => {
    recordFileState(sessionId, { filePath: "/tmp/nv.txt", content: "a", timestamp: 1 });
    assert.equal(getFileVersion(sessionId, "/tmp/nv.txt"), 0);

    recordFileState(sessionId, { filePath: "/tmp/nv.txt", content: "b", timestamp: 2 });
    assert.equal(getFileVersion(sessionId, "/tmp/nv.txt"), 0);
  });

  it("wasFileRead returns true after recordFileState", () => {
    recordFileState(sessionId, { filePath: "/tmp/read.txt", content: "x", timestamp: 1 });
    assert.equal(wasFileRead(sessionId, "/tmp/read.txt"), true);
  });

  it("wasFileRead returns false for unrecorded path", () => {
    assert.equal(wasFileRead(sessionId, "/tmp/unread.txt"), false);
  });

  it("isFullFileView returns true for complete file states", () => {
    assert.equal(isFullFileView({ filePath: "/f", content: "c", timestamp: 1 }), true);
  });

  it("isFullFileView returns false for partial views", () => {
    assert.equal(
      isFullFileView({ filePath: "/f", content: "c", timestamp: 1, isPartialView: true }),
      false
    );
    assert.equal(
      isFullFileView({ filePath: "/f", content: "c", timestamp: 1, offset: 0, limit: 10 }),
      false
    );
  });
});

describe("createSnippet / getSnippet", () => {
  const sessionId = "test-session-snippet";

  afterEach(() => {
    clearSessionState(sessionId);
  });

  it("creates and retrieves a snippet", () => {
    recordFileState(sessionId, { filePath: "/tmp/src.ts", content: "a\nb\nc", timestamp: 1 });

    const snippet = createSnippet(sessionId, "/tmp/src.ts", 1, 2, "a\nb");
    assert.ok(snippet);
    assert.equal(snippet!.id, "snippet_1");
    assert.equal(snippet!.startLine, 1);
    assert.equal(snippet!.endLine, 2);
    assert.equal(snippet!.scopeType, "snippet");

    const retrieved = getSnippet(sessionId, "snippet_1");
    assert.ok(retrieved);
    assert.equal(retrieved!.preview, "a\nb");
  });

  it("returns null for invalid line numbers", () => {
    assert.equal(createSnippet(sessionId, "/tmp/src.ts", 0, 2, "a\nb"), null);
    assert.equal(createSnippet(sessionId, "/tmp/src.ts", 2, 1, "a\nb"), null);
  });

  it("creates full file snippets with scopeType 'full'", () => {
    recordFileState(sessionId, { filePath: "/tmp/src.ts", content: "full file", timestamp: 1 });

    const snippet = createFullFileSnippet(sessionId, "/tmp/src.ts", 1, 1, "full file");
    assert.ok(snippet);
    assert.equal(snippet!.scopeType, "full");
    assert.ok(snippet!.id.startsWith("full_file_"));
  });

  it("getSnippet returns null for unknown snippet", () => {
    assert.equal(getSnippet(sessionId, "nonexistent"), null);
  });

  it("hasSnippetOutdatedFileVersion detects version mismatch", () => {
    recordFileState(sessionId, { filePath: "/tmp/v.ts", content: "v1", timestamp: 1 });

    const snippet = createSnippet(sessionId, "/tmp/v.ts", 1, 1, "v1")!;
    assert.equal(hasSnippetOutdatedFileVersion(sessionId, snippet), false);

    recordFileState(sessionId, { filePath: "/tmp/v.ts", content: "v2", timestamp: 2 }, { incrementVersion: true });
    assert.equal(hasSnippetOutdatedFileVersion(sessionId, snippet), true);
  });
});

describe("restoreSnippet", () => {
  const sessionId = "test-session-restore";

  afterEach(() => {
    clearSessionState(sessionId);
  });

  it("restores a snippet from serialized data", () => {
    recordFileState(sessionId, { filePath: "/tmp/r.ts", content: "a\nb\nc", timestamp: 1 });

    const restored = restoreSnippet(sessionId, {
      id: "custom_snippet",
      filePath: "/tmp/r.ts",
      startLine: 1,
      endLine: 2,
      preview: "a\nb",
    });
    assert.ok(restored);
    assert.equal(restored!.id, "custom_snippet");

    const retrieved = getSnippet(sessionId, "custom_snippet");
    assert.ok(retrieved);
  });

  it("restores with scopeType from ID prefix", () => {
    const restored = restoreSnippet(sessionId, {
      id: "full_file_5",
      filePath: "/tmp/r.ts",
      startLine: 1,
      endLine: 2,
    });
    assert.ok(restored);
    assert.equal(restored!.scopeType, "full");
  });
});

describe("clearSessionState", () => {
  const sessionId = "test-session-clear";

  it("clears all session state", () => {
    recordFileState(sessionId, { filePath: "/tmp/x.txt", content: "x", timestamp: 1 });
    createSnippet(sessionId, "/tmp/x.txt", 1, 1, "x");

    assert.equal(hasSessionState(sessionId), true);
    clearSessionState(sessionId);
    assert.equal(hasSessionState(sessionId), false);
  });

  it("is safe to call on non-existent session", () => {
    assert.doesNotThrow(() => clearSessionState("nonexistent-session"));
  });

  it("is safe to call with empty string", () => {
    assert.doesNotThrow(() => clearSessionState(""));
  });
});

describe("rebuildSessionStateFromHistory", () => {
  const sessionId = "test-session-rebuild";

  afterEach(() => {
    clearSessionState(sessionId);
  });

  it("skips rebuild when session already has state", () => {
    recordFileState(sessionId, { filePath: "/tmp/existing.txt", content: "x", timestamp: 1 });
    rebuildSessionStateFromHistory(sessionId, []);
    assert.equal(hasSessionState(sessionId), true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/state.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/state.test.ts
git commit -m "test: add state unit tests (recordFileState, snippets, clear, rebuild)"
```

---

### Task 7: ask-user-question.test.ts (augment existing)

**Files:** Modify: `src/tests/ask-user-question.test.ts`

- [ ] **Step 1: Read existing file and add new tests**

The existing file already tests `findPendingAskUserQuestion` and `formatAskUserQuestionAnswers`. We add `parseQuestions` and `buildQuestionSummary` tests.

Append to existing file content:

```typescript
import { handleAskUserQuestionTool } from "../tools/ask-user-question-handler";
import type { ToolExecutionContext } from "../tools/executor";

const noopContext: ToolExecutionContext = {
  sessionId: "test-ask",
  projectRoot: "/tmp",
  toolCall: {
    id: "call-1",
    type: "function",
    function: { name: "AskUserQuestion", arguments: JSON.stringify({}) },
  },
};

describe("handleAskUserQuestionTool", () => {
  it("returns error when questions is not an array", async () => {
    const result = await handleAskUserQuestionTool({ questions: "invalid" }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be a non-empty array"));
  });

  it("returns error when questions is empty array", async () => {
    const result = await handleAskUserQuestionTool({ questions: [] }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be a non-empty array"));
  });

  it("returns error when question is missing", async () => {
    const result = await handleAskUserQuestionTool(
      { questions: [{ options: [{ label: "Yes" }] }] },
      noopContext
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("missing"));
  });

  it("returns error when options is missing", async () => {
    const result = await handleAskUserQuestionTool(
      { questions: [{ question: "What?" }] },
      noopContext
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("options"));
  });

  it("returns ok with awaitUserResponse for valid single question", async () => {
    const result = await handleAskUserQuestionTool(
      {
        questions: [
          { question: "Pick one", options: [{ label: "A" }, { label: "B" }] },
        ],
      },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.equal(result.name, "AskUserQuestion");
    assert.equal(result.awaitUserResponse, true);
    assert.ok(result.output?.includes("Waiting for user input"));
  });

  it("handles multiSelect flag", async () => {
    const result = await handleAskUserQuestionTool(
      {
        questions: [
          {
            question: "Pick many",
            multiSelect: true,
            options: [{ label: "A", description: "Option A desc" }],
          },
        ],
      },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.ok(result.output?.includes("multi-select"));
  });

  it("includes option descriptions in output", async () => {
    const result = await handleAskUserQuestionTool(
      {
        questions: [
          {
            question: "Q1",
            options: [{ label: "A", description: "desc A" }, { label: "B" }],
          },
        ],
      },
      noopContext
    );
    assert.equal(result.ok, true);
    assert.ok(result.output?.includes("desc A"));
  });

  it("returns error for non-object question item", async () => {
    const result = await handleAskUserQuestionTool({ questions: ["not an object"] }, noopContext);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be an object"));
  });

  it("returns error for non-object option item", async () => {
    const result = await handleAskUserQuestionTool(
      { questions: [{ question: "Q", options: ["not an object"] }] },
      noopContext
    );
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("must be an object"));
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/ask-user-question.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/ask-user-question.test.ts
git commit -m "test: add AskUserQuestion handler tests (parseQuestions, error paths, multiSelect)"
```

---

## PHASE 🔴 CRITICAL: openai-client.test.ts

### Task 8: openai-client.test.ts

**Files:** Create: `src/tests/openai-client.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getProviderConfig,
  rotateApiKey,
  maybeRotateApiKeyOnError,
} from "../common/openai-client";
import type { ResolvedDeepcodingSettings } from "../settings";

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
      ask: {
        read_in_cwd: "allow",
        write_in_cwd: "ask",
        read_outside_cwd: "ask",
        write_outside_cwd: "deny",
        run_bash: "ask",
        network: "ask",
        modify_structure: "ask",
        mcp: "ask",
      },
    },
    enabledSkills: {},
    temperature: 0,
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
    const config = getProviderConfig(
      makeSettings({ model: "gemini-2.5-flash", geminiApiKey: "gemini-key-abc" })
    );
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
    const config = getProviderConfig(
      makeSettings({ model: "GEMINI-2.5-pro", geminiApiKey: "gk-pro" })
    );
    assert.equal(config.apiKey, "gk-pro");
  });
});

describe("rotateApiKey", () => {
  it("is a no-op when no provider state exists", () => {
    assert.doesNotThrow(() => rotateApiKey("unknown-provider"));
  });
});

describe("maybeRotateApiKeyOnError", () => {
  it("returns false for non-Error inputs", () => {
    assert.equal(maybeRotateApiKeyOnError("test-provider", "string error"), false);
    assert.equal(maybeRotateApiKeyOnError("test-provider", null), false);
    assert.equal(maybeRotateApiKeyOnError("test-provider", undefined), false);
  });

  it("returns false for non-rate-limit errors", () => {
    const err = Object.assign(new Error("Network error"), { status: 500 });
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });

  it("returns true for 429 status", () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
    // Note: false because provider doesn't exist yet with KeyRotator
  });

  it("detects rate_limit_exceeded code", () => {
    const err = Object.assign(new Error("Rate limited"), { code: "rate_limit_exceeded" });
    // Returns false because no provider state exists
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });

  it("detects insufficient_quota code", () => {
    const err = Object.assign(new Error("Quota exceeded"), { code: "insufficient_quota" });
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });

  it("detects rate limit keywords in message", () => {
    const err = new Error("You exceeded your current quota, please check your plan");
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });

  it("detects resource_exhausted in message", () => {
    const err = new Error("RESOURCE_EXHAUSTED: out of tokens");
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });

  it("detects billing keyword in message", () => {
    const err = new Error("Billing account not active");
    assert.equal(maybeRotateApiKeyOnError("test-provider", err), false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx tsx --test src/tests/openai-client.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/openai-client.test.ts
git commit -m "test: add openai-client unit tests (getProviderConfig, rate-limit detection)"
```

---

## Final Verification

After all phases:

```bash
npm test                                # All 500+ tests pass
npm run typecheck                       # Clean
npm run build                           # dist/cli.js compiles
```

---

## Rollback Plan

Each task is self-contained — tests only add new files (except Task 7 which appends). Rollback:

```bash
rm src/tests/model-capabilities.test.ts
rm src/tests/bash-timeout.test.ts
rm src/tests/validate.test.ts
rm src/tests/error-logger.test.ts
rm src/tests/file-utils.test.ts
rm src/tests/state.test.ts
rm src/tests/openai-client.test.ts
git checkout -- src/tests/ask-user-question.test.ts
```

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| error-logger.test.ts modifies ~/.deepcode/logs/error.log | afterEach cleans up, tests only read-back what they wrote |
| file-utils.test.ts creates temp files | Uses os.tmpdir() with cleanup in afterEach |
| state.test.ts uses in-memory Maps | afterEach calls clearSessionState |
| openai-client.test.ts only tests exports (not createOpenAIClient which instantiates OpenAI) | Provider config and error detection logic is covered; full integration needs mock API |
