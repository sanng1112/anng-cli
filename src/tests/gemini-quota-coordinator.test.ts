import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GeminiQuotaCoordinator } from "../common/gemini-quota-coordinator";

describe("GeminiQuotaCoordinator", () => {
  it("shares quota state across independent coordinator instances", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anng-gemini-quota-"));
    const statePath = path.join(tempDir, "quota.json");
    const coordinatorA = new GeminiQuotaCoordinator({
      statePath,
      requestsPerMinute: 1,
      windowMs: 60_000,
      lockPollMs: 5,
    });
    const coordinatorB = new GeminiQuotaCoordinator({
      statePath,
      requestsPerMinute: 1,
      windowMs: 60_000,
      lockPollMs: 5,
    });

    try {
      const first = await coordinatorA.acquire([
        { index: 0, key: "key1", maskedKey: "key1...", localStatus: "active", localWaitMs: 0 },
        { index: 1, key: "key2", maskedKey: "key2...", localStatus: "active", localWaitMs: 0 },
      ]);
      assert.equal(first.selectedIndex, 0);

      const second = await coordinatorB.acquire([
        { index: 0, key: "key1", maskedKey: "key1...", localStatus: "active", localWaitMs: 0 },
        { index: 1, key: "key2", maskedKey: "key2...", localStatus: "active", localWaitMs: 0 },
      ]);
      assert.equal(second.selectedIndex, 1);

      const snapshot = coordinatorA.getSnapshot(["key1", "key2"]);
      assert.equal(snapshot.totalTrackedKeys, 2);
      assert.equal(snapshot.rateLimitedKeys, 2);
      assert.equal(snapshot.activeKeys, 0);
    } finally {
      coordinatorA.reset();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("excludes globally invalidated keys from future allocations", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anng-gemini-invalid-"));
    const statePath = path.join(tempDir, "quota.json");
    const coordinator = new GeminiQuotaCoordinator({
      statePath,
      requestsPerMinute: 5,
      windowMs: 60_000,
      lockPollMs: 5,
    });

    try {
      await coordinator.markInvalid("key1", "401 Unauthorized");

      const allocation = await coordinator.acquire([
        { index: 0, key: "key1", maskedKey: "key1...", localStatus: "active", localWaitMs: 0 },
        { index: 1, key: "key2", maskedKey: "key2...", localStatus: "active", localWaitMs: 0 },
      ]);

      assert.equal(allocation.selectedIndex, 1);

      const snapshot = coordinator.getSnapshot(["key1", "key2"]);
      assert.equal(snapshot.invalidKeys, 1);
      assert.equal(snapshot.usableKeys, 1);
    } finally {
      coordinator.reset();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
