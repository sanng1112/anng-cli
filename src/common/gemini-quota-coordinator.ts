import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type GeminiQuotaCandidate = {
  index: number;
  key: string;
  maskedKey: string;
  localStatus: "active" | "cooldown" | "rate_limited" | "invalid";
  localWaitMs: number;
};

export type GeminiGlobalKeyStat = {
  maskedKey: string;
  status: "active" | "rate_limited" | "invalid";
  recentRequests: number;
  waitSec: number;
  invalidReason?: string;
};

export type GeminiGlobalQuotaSnapshot = {
  statePath: string;
  totalTrackedKeys: number;
  usableKeys: number;
  activeKeys: number;
  rateLimitedKeys: number;
  invalidKeys: number;
  nextAvailableInSec: number;
  keyStats: GeminiGlobalKeyStat[];
};

type GeminiQuotaStateRecord = {
  maskedKey: string;
  requestTimestamps: number[];
  invalidAt?: string;
  invalidReason?: string;
  updatedAt: string;
};

type GeminiQuotaState = {
  version: 1;
  updatedAt: string;
  keys: Record<string, GeminiQuotaStateRecord>;
};

type AcquireDecision =
  | {
      reserved: true;
      selectedIndex: number;
    }
  | {
      reserved: false;
      waitMs: number;
    };

type GeminiQuotaCoordinatorOptions = {
  statePath?: string;
  requestsPerMinute?: number;
  windowMs?: number;
  lockTimeoutMs?: number;
  lockPollMs?: number;
  staleLockMs?: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_REQUESTS_PER_MINUTE = 5;
const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_LOCK_POLL_MS = 25;
const DEFAULT_STALE_LOCK_MS = 30_000;

export class GeminiQuotaCoordinator {
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly requestsPerMinute: number;
  private readonly windowMs: number;
  private readonly lockTimeoutMs: number;
  private readonly lockPollMs: number;
  private readonly staleLockMs: number;

  constructor(options: GeminiQuotaCoordinatorOptions = {}) {
    this.statePath = options.statePath ?? getGeminiQuotaStatePath();
    this.lockPath = `${this.statePath}.lock`;
    this.requestsPerMinute =
      typeof options.requestsPerMinute === "number" && options.requestsPerMinute > 0
        ? options.requestsPerMinute
        : DEFAULT_REQUESTS_PER_MINUTE;
    this.windowMs = typeof options.windowMs === "number" && options.windowMs > 0 ? options.windowMs : DEFAULT_WINDOW_MS;
    this.lockTimeoutMs =
      typeof options.lockTimeoutMs === "number" && options.lockTimeoutMs > 0
        ? options.lockTimeoutMs
        : DEFAULT_LOCK_TIMEOUT_MS;
    this.lockPollMs =
      typeof options.lockPollMs === "number" && options.lockPollMs > 0 ? options.lockPollMs : DEFAULT_LOCK_POLL_MS;
    this.staleLockMs =
      typeof options.staleLockMs === "number" && options.staleLockMs > 0 ? options.staleLockMs : DEFAULT_STALE_LOCK_MS;
  }

  async acquire(candidates: GeminiQuotaCandidate[]): Promise<{ selectedIndex: number; waitedMs: number }> {
    const filteredCandidates = candidates.filter((candidate) => candidate.key.trim().length > 0);
    if (filteredCandidates.length === 0) {
      return { selectedIndex: 0, waitedMs: 0 };
    }

    let waitedMs = 0;
    while (true) {
      const decision = await this.withLock(() => this.selectAndReserve(filteredCandidates, Date.now()));
      if (decision.reserved) {
        return { selectedIndex: decision.selectedIndex, waitedMs };
      }
      const sleepMs = Math.max(this.lockPollMs, Math.min(decision.waitMs, 5_000));
      waitedMs += sleepMs;
      await delay(sleepMs);
    }
  }

  async markInvalid(key: string, reason: string): Promise<void> {
    if (!key.trim()) {
      return;
    }
    await this.withLock(() => {
      const now = new Date().toISOString();
      const state = this.readState();
      const record = this.getOrCreateRecord(state, key);
      record.invalidAt = now;
      record.invalidReason = reason;
      record.updatedAt = now;
      state.updatedAt = now;
      this.writeState(state);
    });
  }

  getSnapshot(keys: string[] = []): GeminiGlobalQuotaSnapshot {
    const state = this.readState();
    const now = Date.now();
    const filterHashes = keys.length > 0 ? new Set(keys.map((key) => this.hashKey(key))) : null;
    const keyStats = Object.entries(state.keys)
      .filter(([keyHash]) => !filterHashes || filterHashes.has(keyHash))
      .map(([, record]) => {
        const requestTimestamps = this.pruneTimestamps(record.requestTimestamps, now);
        const invalid = Boolean(record.invalidAt);
        const waitMs = invalid ? 0 : this.getWaitMs(requestTimestamps, now);
        return {
          maskedKey: record.maskedKey,
          status: invalid ? "invalid" : waitMs > 0 ? "rate_limited" : "active",
          recentRequests: requestTimestamps.length,
          waitSec: Math.max(0, Math.ceil(waitMs / 1000)),
          invalidReason: record.invalidReason,
        } satisfies GeminiGlobalKeyStat;
      })
      .sort((left, right) => left.maskedKey.localeCompare(right.maskedKey));

    const usableKeys = keyStats.filter((stat) => stat.status !== "invalid").length;
    const nextAvailableInSec = keyStats
      .filter((stat) => stat.status === "rate_limited")
      .reduce((best, stat) => (best === 0 ? stat.waitSec : Math.min(best, stat.waitSec)), 0);

    return {
      statePath: this.statePath,
      totalTrackedKeys: keyStats.length,
      usableKeys,
      activeKeys: keyStats.filter((stat) => stat.status === "active").length,
      rateLimitedKeys: keyStats.filter((stat) => stat.status === "rate_limited").length,
      invalidKeys: keyStats.filter((stat) => stat.status === "invalid").length,
      nextAvailableInSec,
      keyStats,
    };
  }

  reset(): void {
    try {
      fs.rmSync(this.statePath, { force: true });
      fs.rmSync(this.lockPath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  private selectAndReserve(candidates: GeminiQuotaCandidate[], now: number): AcquireDecision {
    const state = this.readState();
    let shouldWrite = false;
    let bestWaitMs = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const record = this.getOrCreateRecord(state, candidate.key);
      const globalInvalid = Boolean(record.invalidAt);
      record.requestTimestamps = this.pruneTimestamps(record.requestTimestamps, now);
      const globalWaitMs = globalInvalid ? Number.POSITIVE_INFINITY : this.getWaitMs(record.requestTimestamps, now);
      const localWaitMs = candidate.localStatus === "invalid" ? Number.POSITIVE_INFINITY : candidate.localWaitMs;
      const combinedWaitMs = Math.max(localWaitMs, globalWaitMs);

      if (combinedWaitMs === 0) {
        record.requestTimestamps.push(now);
        record.updatedAt = new Date(now).toISOString();
        state.updatedAt = record.updatedAt;
        this.writeState(state);
        return { reserved: true, selectedIndex: candidate.index };
      }

      if (combinedWaitMs < bestWaitMs) {
        bestWaitMs = combinedWaitMs;
      }
      shouldWrite = shouldWrite || record.requestTimestamps.length === 0;
    }

    if (shouldWrite) {
      state.updatedAt = new Date(now).toISOString();
      this.writeState(state);
    }

    if (!Number.isFinite(bestWaitMs)) {
      throw new Error("No Gemini API keys available after filtering invalid keys.");
    }

    return {
      reserved: false,
      waitMs: bestWaitMs,
    };
  }

  private getOrCreateRecord(state: GeminiQuotaState, key: string): GeminiQuotaStateRecord {
    const keyHash = this.hashKey(key);
    const existing = state.keys[keyHash];
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const created: GeminiQuotaStateRecord = {
      maskedKey: maskKey(key),
      requestTimestamps: [],
      updatedAt: now,
    };
    state.keys[keyHash] = created;
    return created;
  }

  private getWaitMs(requestTimestamps: number[], now: number): number {
    if (requestTimestamps.length < this.requestsPerMinute) {
      return 0;
    }
    const oldestRelevant = requestTimestamps[requestTimestamps.length - this.requestsPerMinute];
    if (!oldestRelevant) {
      return 0;
    }
    return Math.max(0, oldestRelevant + this.windowMs - now);
  }

  private pruneTimestamps(requestTimestamps: number[], now: number): number[] {
    const cutoff = now - this.windowMs;
    return requestTimestamps.filter((timestamp) => timestamp >= cutoff);
  }

  private readState(): GeminiQuotaState {
    if (!fs.existsSync(this.statePath)) {
      return { version: 1, updatedAt: new Date(0).toISOString(), keys: {} };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as GeminiQuotaState;
      if (!parsed || parsed.version !== 1 || typeof parsed.keys !== "object" || parsed.keys == null) {
        return { version: 1, updatedAt: new Date(0).toISOString(), keys: {} };
      }
      return parsed;
    } catch {
      return { version: 1, updatedAt: new Date(0).toISOString(), keys: {} };
    }
  }

  private writeState(state: GeminiQuotaState): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private hashKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  }

  private async withLock<T>(fn: () => T): Promise<T> {
    await this.acquireLock();
    try {
      return fn();
    } finally {
      this.releaseLock();
    }
  }

  private async acquireLock(): Promise<void> {
    const startedAt = Date.now();
    while (true) {
      try {
        fs.mkdirSync(this.lockPath);
        return;
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }
        if (this.tryBreakStaleLock()) {
          continue;
        }
        if (Date.now() - startedAt > this.lockTimeoutMs) {
          this.forceBreakLock();
          continue;
        }
        await delay(this.lockPollMs);
      }
    }
  }

  private tryBreakStaleLock(): boolean {
    try {
      const stat = fs.statSync(this.lockPath);
      if (Date.now() - stat.mtimeMs <= this.staleLockMs) {
        return false;
      }
      this.forceBreakLock();
      return true;
    } catch {
      return true;
    }
  }

  private forceBreakLock(): void {
    fs.rmSync(this.lockPath, { recursive: true, force: true });
  }

  private releaseLock(): void {
    fs.rmSync(this.lockPath, { recursive: true, force: true });
  }
}

const defaultGeminiQuotaCoordinator = new GeminiQuotaCoordinator();

export async function acquireGeminiQuotaSlot(
  candidates: GeminiQuotaCandidate[]
): Promise<{ selectedIndex: number; waitedMs: number }> {
  return defaultGeminiQuotaCoordinator.acquire(candidates);
}

export async function markGeminiQuotaKeyInvalid(key: string, reason: string): Promise<void> {
  await defaultGeminiQuotaCoordinator.markInvalid(key, reason);
}

export function getGeminiQuotaSnapshot(keys: string[] = []): GeminiGlobalQuotaSnapshot {
  return defaultGeminiQuotaCoordinator.getSnapshot(keys);
}

export function resetGeminiQuotaCoordinator(): void {
  defaultGeminiQuotaCoordinator.reset();
}

function getGeminiQuotaStatePath(): string {
  return process.env.ANNG_GEMINI_QUOTA_STATE_PATH || path.join(os.homedir(), ".anng", "gemini_quota_state.json");
}

function maskKey(key: string): string {
  if (key.length > 6) {
    return `${key.slice(0, 6)}...`;
  }
  if (key.length > 0) {
    return `${key.slice(0, 2)}...`;
  }
  return "unknown";
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "EEXIST";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
