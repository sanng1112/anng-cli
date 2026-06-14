import { describe, it } from "node:test";
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

describe("readTextFileWithMetadata + writeTextFile", () => {
  it("reads a UTF-8 file and returns metadata", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-tu-"));
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "line1\nline2\n", "utf8");

    const result = readTextFileWithMetadata(filePath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result.content, "line1\nline2\n");
    assert.equal(result.encoding, "utf8");
    assert.equal(result.lineEndings, "LF");
    assert.ok(typeof result.timestamp === "number");
    assert.ok(result.timestamp > 0);
  });

  it("normalizes CRLF to LF in content", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-tu-"));
    const filePath = path.join(tmpDir, "crlf.txt");
    fs.writeFileSync(filePath, "a\r\nb\r\nc", "utf8");

    const result = readTextFileWithMetadata(filePath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result.content, "a\nb\nc");
    assert.equal(result.lineEndings, "CRLF");
  });

  it("writeTextFile preserves CRLF line endings", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-tu-"));
    const filePath = path.join(tmpDir, "out.txt");
    writeTextFile(filePath, "a\nb\nc", "utf8", "CRLF");

    const raw = fs.readFileSync(filePath, "utf8");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(raw, "a\r\nb\r\nc");
  });

  it("writeTextFile preserves LF line endings", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-tu-"));
    const filePath = path.join(tmpDir, "out-lf.txt");
    writeTextFile(filePath, "a\nb\nc", "utf8", "LF");

    const raw = fs.readFileSync(filePath, "utf8");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(raw, "a\nb\nc");
  });

  it("writeTextFile returns byte length", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-tu-"));
    const filePath = path.join(tmpDir, "out-bytes.txt");
    const byteLength = writeTextFile(filePath, "abc", "utf8", "LF");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(byteLength, 3);
  });
});

describe("ensureParentDirectory", () => {
  it("creates parent directories", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-ed-"));
    const deepPath = path.join(tmpDir, "nested", "deep", "file.txt");
    ensureParentDirectory(deepPath);
    assert.equal(fs.existsSync(path.dirname(deepPath)), true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is idempotent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-ed-"));
    const deepPath = path.join(tmpDir, "nested", "file.txt");
    ensureParentDirectory(deepPath);
    assert.doesNotThrow(() => ensureParentDirectory(deepPath));
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
    assert.ok(lines.length <= 6);
  });

  it("handles empty original", () => {
    const result = buildDiffPreview("empty.ts", "", "content");
    assert.ok(result);
    assert.ok(result!.includes("+content"));
  });
});

describe("hasFileChangedSinceState", () => {
  it("returns false when file timestamp is not newer", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-hcs-"));
    const filePath = path.join(tmpDir, "old.txt");
    fs.writeFileSync(filePath, "content", "utf8");
    const stat = fs.statSync(filePath);

    const state: FileState = { filePath, content: "content", timestamp: stat.mtimeMs + 1000 };
    const result = hasFileChangedSinceState(filePath, state);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result, false);
  });

  it("returns false when full-read content matches despite newer timestamp", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-hcs-"));
    const filePath = path.join(tmpDir, "same.txt");
    fs.writeFileSync(filePath, "hello world", "utf8");

    const state: FileState = { filePath, content: "hello world", timestamp: 0 };
    const result = hasFileChangedSinceState(filePath, state);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result, false);
  });

  it("returns true when content differs from full-read state", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-hcs-"));
    const filePath = path.join(tmpDir, "diff.txt");
    fs.writeFileSync(filePath, "new content", "utf8");

    const state: FileState = { filePath, content: "old content", timestamp: 0 };
    const result = hasFileChangedSinceState(filePath, state);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result, true);
  });

  it("returns true for partial views even if content matches", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-hcs-"));
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
    const result = hasFileChangedSinceState(filePath, state);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result, true);
  });
});
