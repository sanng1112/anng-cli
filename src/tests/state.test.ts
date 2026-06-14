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
    assert.equal(isFullFileView({ filePath: "/f", content: "c", timestamp: 1, isPartialView: true }), false);
    assert.equal(isFullFileView({ filePath: "/f", content: "c", timestamp: 1, offset: 0, limit: 10 }), false);
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

  it("getSnippet returns null for unknown id", () => {
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
  const sessionId = "test-restoreSnippet";

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

  it("infers scopeType 'full' from full_file_ prefix", () => {
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
  it("clears all session state", () => {
    const sessionId = "test-clear";
    recordFileState(sessionId, { filePath: "/tmp/x.txt", content: "x", timestamp: 1 });
    createSnippet(sessionId, "/tmp/x.txt", 1, 1, "x");

    assert.equal(hasSessionState(sessionId), true);
    clearSessionState(sessionId);
    assert.equal(hasSessionState(sessionId), false);
  });

  it("is safe to call on non-existent session", () => {
    assert.doesNotThrow(() => clearSessionState("nonexistent"));
  });

  it("is safe to call with empty string", () => {
    assert.doesNotThrow(() => clearSessionState(""));
  });
});

describe("rebuildSessionStateFromHistory", () => {
  it("skips rebuild when session already has state", () => {
    const sessionId = "test-rebuild-skip";
    recordFileState(sessionId, { filePath: "/tmp/existing.txt", content: "x", timestamp: 1 });
    rebuildSessionStateFromHistory(sessionId, []);
    assert.equal(hasSessionState(sessionId), true);
    clearSessionState(sessionId);
  });
});
