import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SessionStore } from "../session/store";

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("SessionStore", () => {
  let tempHome: string;

  before(() => {
    tempHome = createTempDir("deepcode-store-test-");
  });

  after(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("creates and loads a session", () => {
    const store = new SessionStore({ homeDir: tempHome, projectCode: "test-project" });
    const session = store.createSession();
    assert.ok(session.id, "Session should have an ID");
    assert.strictEqual(session.entries.length, 0);
    assert.ok(session.createdAt instanceof Date);

    const loaded = store.getSession(session.id);
    assert.ok(loaded);
    assert.strictEqual(loaded.id, session.id);
  });

  it("lists sessions", () => {
    const store = new SessionStore({ homeDir: tempHome, projectCode: "test-project-2" });
    const s1 = store.createSession();
    const s2 = store.createSession();
    const list = store.listSessions();
    assert.strictEqual(list.length, 2);
    assert.ok(list.some((s) => s.id === s1.id));
    assert.ok(list.some((s) => s.id === s2.id));
  });

  it("handles max session limit (LRU eviction)", () => {
    const store = new SessionStore({ homeDir: tempHome, projectCode: "test-project-3", maxEntries: 3 });
    store.createSession();
    store.createSession();
    store.createSession();
    const fourth = store.createSession();
    const list = store.listSessions();
    assert.strictEqual(list.length, 3, "Should enforce max entries");
    assert.ok(
      list.some((s) => s.id === fourth.id),
      "Newest session should be kept"
    );
  });

  it("deletes a session", () => {
    const store = new SessionStore({ homeDir: tempHome, projectCode: "test-project-4" });
    const session = store.createSession();
    store.deleteSession(session.id);
    assert.strictEqual(store.getSession(session.id), null);
    assert.strictEqual(store.listSessions().length, 0);
  });

  it("updates session name", () => {
    const store = new SessionStore({ homeDir: tempHome, projectCode: "test-project-5" });
    const session = store.createSession("original");
    store.updateSession(session.id, "renamed");
    const list = store.listSessions();
    const found = list.find((s) => s.id === session.id);
    assert.strictEqual(found?.name, "renamed");
  });
});
