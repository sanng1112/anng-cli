import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { quarantineGeminiKey, syncGeminiKeys } from "../common/gemini-keys-sync";
import { KeyRotator } from "../common/key-rotator";

describe("syncGeminiKeys", () => {
  it("runs without throwing and returns a comma-separated key string if keys exist", () => {
    // Basic sanity check to ensure it doesn't throw
    const keys = syncGeminiKeys();
    assert.equal(typeof keys, "string");
  });

  it("does not re-import quarantined download keys into the user store", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "anng-gemini-sync-home-"));
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "anng-gemini-download-"));
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const originalDownloadPath = process.env.ANNG_GEMINI_DOWNLOAD_PATH;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.ANNG_GEMINI_DOWNLOAD_PATH = path.join(downloadDir, "api-gemini");

    const validKey = "AIzaSy_valid_key_1234567890";
    const invalidKey = "AIzaSy_invalid_key_1234567890";

    try {
      fs.mkdirSync(path.join(home, ".anng"), { recursive: true });
      fs.writeFileSync(path.join(home, ".anng", "gemini_keys.txt"), `${validKey}\n`, "utf8");
      fs.writeFileSync(process.env.ANNG_GEMINI_DOWNLOAD_PATH, `${validKey}\n${invalidKey}\n`, "utf8");

      quarantineGeminiKey(invalidKey, "401 Unauthorized");
      const syncedKeys = syncGeminiKeys(process.cwd(), { importDownloads: "force" }).split(",").filter(Boolean);

      assert.deepEqual(syncedKeys, [validKey]);
      const persisted = fs.readFileSync(path.join(home, ".anng", "gemini_keys.txt"), "utf8");
      assert.equal(persisted.includes(invalidKey), false);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalDownloadPath === undefined) delete process.env.ANNG_GEMINI_DOWNLOAD_PATH;
      else process.env.ANNG_GEMINI_DOWNLOAD_PATH = originalDownloadPath;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(downloadDir, { recursive: true, force: true });
    }
  });
});

describe("KeyRotator upgraded features", () => {
  it("tracks requests, failures, and cooldowns correctly", () => {
    const keys = "key1,key2,key3";
    const rotator = new KeyRotator(keys);

    assert.equal(rotator.getKeyCount(), 3);
    assert.equal(rotator.getCurrentKey(), "key1");

    // Mark 2 requests for key1
    rotator.markRequest();
    rotator.markRequest();

    // Mark 1 request and 1 failure for key2
    rotator.rotate();
    assert.equal(rotator.getCurrentKey(), "key2");
    rotator.markRequest();
    rotator.markFailure(10); // 10s cooldown

    // Rotate to key3
    rotator.rotate();
    assert.equal(rotator.getCurrentKey(), "key3");
    rotator.markRequest();

    // Rotate again: key2 is in cooldown, so it should bypass key2 and select key1 (or key3)
    rotator.rotate();
    assert.notEqual(rotator.getCurrentKey(), "key2");

    const stats = rotator.getKeyStats();
    assert.equal(stats[0].requests, 2);
    assert.equal(stats[1].requests, 1);
    assert.equal(stats[1].failures, 1);
    assert.equal(stats[1].status, "cooldown");
    assert.equal(stats[2].requests, 1);
  });

  it("treats over-budget keys as rate-limited and selects the next available key", () => {
    const rotator = new KeyRotator("key1,key2", { requestsPerMinute: 1 });

    rotator.markRequest(); // key1 used once, hits local RPM budget
    const waitMs = rotator.ensureAvailableKey();
    assert.equal(waitMs, 0);
    assert.equal(rotator.getCurrentKey(), "key2");

    rotator.markRequest(); // key2 also hits RPM budget
    const secondWaitMs = rotator.ensureAvailableKey();
    assert.ok(secondWaitMs > 0);

    const stats = rotator.getKeyStats();
    assert.equal(stats[0].status, "rate_limited");
    assert.equal(stats[1].status, "rate_limited");
  });

  it("removes invalid keys from the usable pool", () => {
    const rotator = new KeyRotator("key1,key2,key3");
    rotator.rotate();
    rotator.markInvalid();

    assert.equal(rotator.getUsableKeyCount(), 2);
    const stats = rotator.getKeyStats();
    assert.equal(stats[1].status, "invalid");
  });
});
