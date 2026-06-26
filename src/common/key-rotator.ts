export type KeyStat = {
  maskedKey: string;
  requests: number;
  failures: number;
  status: "active" | "cooldown" | "rate_limited" | "invalid";
  cooldownRemainingSec: number;
  rateLimitRemainingSec: number;
};

export type KeyAvailability = {
  index: number;
  key: string;
  maskedKey: string;
  status: KeyStat["status"];
  waitMs: number;
};

type KeyRotatorOptions = {
  requestsPerMinute?: number;
};

export class KeyRotator {
  private keys: string[];
  private currentIndex = 0;
  private requestCounts: number[];
  private failureCounts: number[];
  private cooldowns: number[]; // timestamps in ms when cooldown expires
  private invalidKeys: boolean[];
  private requestTimestamps: number[][];
  private readonly requestsPerMinute: number | null;

  constructor(envString: string, options: KeyRotatorOptions = {}) {
    if (!envString || !envString.trim()) {
      this.keys = [""];
    } else {
      this.keys = Array.from(
        new Set(
          envString
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
        )
      );
      if (this.keys.length === 0) this.keys = [""];
    }

    this.requestCounts = new Array(this.keys.length).fill(0);
    this.failureCounts = new Array(this.keys.length).fill(0);
    this.cooldowns = new Array(this.keys.length).fill(0);
    this.invalidKeys = new Array(this.keys.length).fill(false);
    this.requestTimestamps = new Array(this.keys.length).fill(null).map(() => []);
    this.requestsPerMinute =
      typeof options.requestsPerMinute === "number" && options.requestsPerMinute > 0 ? options.requestsPerMinute : null;
  }

  getCurrentKey(): string {
    return this.keys[this.currentIndex];
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  setCurrentIndex(index: number): void {
    if (index >= 0 && index < this.keys.length) {
      this.currentIndex = index;
    }
  }

  rotate(): void {
    if (this.keys.length <= 1) {
      return;
    }

    const nextIndex = this.findAvailableIndex(false);
    if (nextIndex !== null) {
      this.currentIndex = nextIndex;
      return;
    }

    const fallbackIndex = this.findSoonestRecoveringIndex();
    if (fallbackIndex !== null) {
      this.currentIndex = fallbackIndex;
    }
  }

  getKeyCount(): number {
    return this.keys.length;
  }

  getKeys(): string[] {
    return [...this.keys];
  }

  reset(): void {
    this.currentIndex = 0;
    this.requestCounts.fill(0);
    this.failureCounts.fill(0);
    this.cooldowns.fill(0);
    this.invalidKeys.fill(false);
    this.requestTimestamps.forEach((timestamps) => timestamps.splice(0, timestamps.length));
  }

  markRequest(): void {
    if (this.currentIndex < this.requestCounts.length) {
      this.requestCounts[this.currentIndex]++;
      if (this.requestsPerMinute) {
        const timestamps = this.requestTimestamps[this.currentIndex];
        timestamps.push(Date.now());
        this.pruneRequestWindow(timestamps, Date.now());
      }
    }
  }

  markFailure(retryAfterSec = 60): void {
    if (this.currentIndex < this.failureCounts.length) {
      this.failureCounts[this.currentIndex]++;
      this.cooldowns[this.currentIndex] = Date.now() + retryAfterSec * 1000;
    }
  }

  markInvalid(): void {
    if (this.currentIndex < this.invalidKeys.length) {
      this.invalidKeys[this.currentIndex] = true;
      this.cooldowns[this.currentIndex] = 0;
    }
  }

  ensureAvailableKey(): number {
    const currentWaitMs = this.getKeyWaitMs(this.currentIndex, Date.now());
    if (currentWaitMs === 0) {
      return 0;
    }

    const nextIndex = this.findAvailableIndex(true);
    if (nextIndex !== null) {
      this.currentIndex = nextIndex;
      return 0;
    }

    const fallbackIndex = this.findSoonestRecoveringIndex();
    if (fallbackIndex !== null) {
      this.currentIndex = fallbackIndex;
      return this.getKeyWaitMs(fallbackIndex, Date.now());
    }

    return 0;
  }

  getUsableKeyCount(): number {
    return this.keys.filter((_, index) => !this.invalidKeys[index]).length;
  }

  getAvailabilitySnapshot(): KeyAvailability[] {
    const now = Date.now();
    const result: KeyAvailability[] = [];
    for (let step = 0; step < this.keys.length; step += 1) {
      const index = (this.currentIndex + step) % this.keys.length;
      const key = this.keys[index];
      const waitMs = this.getKeyWaitMs(index, now);
      result.push({
        index,
        key,
        maskedKey: maskKey(key),
        status: this.getStatusForIndex(index, now),
        waitMs,
      });
    }
    return result;
  }

  getKeyStats(): KeyStat[] {
    const now = Date.now();
    return this.keys.map((key, idx) => {
      const cooldownRemainingSec = Math.max(0, Math.ceil((this.cooldowns[idx] - now) / 1000));
      const rateLimitRemainingSec = Math.ceil(this.getRateLimitWaitMs(idx, now) / 1000);
      return {
        maskedKey: maskKey(key),
        requests: this.requestCounts[idx],
        failures: this.failureCounts[idx],
        status: this.getStatusForIndex(idx, now),
        cooldownRemainingSec,
        rateLimitRemainingSec: Math.max(0, rateLimitRemainingSec),
      };
    });
  }

  private pruneRequestWindow(timestamps: number[], now: number): void {
    const cutoff = now - 60_000;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
  }

  private getRateLimitWaitMs(index: number, now: number): number {
    if (!this.requestsPerMinute) {
      return 0;
    }
    const timestamps = this.requestTimestamps[index];
    this.pruneRequestWindow(timestamps, now);
    if (timestamps.length < this.requestsPerMinute) {
      return 0;
    }
    const oldestRelevant = timestamps[timestamps.length - this.requestsPerMinute];
    if (!oldestRelevant) {
      return 0;
    }
    return Math.max(0, oldestRelevant + 60_000 - now);
  }

  private getKeyWaitMs(index: number, now: number): number {
    if (this.invalidKeys[index]) {
      return Number.POSITIVE_INFINITY;
    }
    const cooldownWaitMs = Math.max(0, this.cooldowns[index] - now);
    const rateWaitMs = this.getRateLimitWaitMs(index, now);
    return Math.max(cooldownWaitMs, rateWaitMs);
  }

  private getStatusForIndex(index: number, now: number): KeyStat["status"] {
    if (this.invalidKeys[index]) {
      return "invalid";
    }
    if (this.cooldowns[index] > now) {
      return "cooldown";
    }
    if (this.getRateLimitWaitMs(index, now) > 0) {
      return "rate_limited";
    }
    return "active";
  }

  private findAvailableIndex(includeCurrent: boolean): number | null {
    const now = Date.now();
    const maxSteps = this.keys.length;
    for (let step = includeCurrent ? 0 : 1; step < maxSteps + (includeCurrent ? 0 : 1); step += 1) {
      const candidateIndex = (this.currentIndex + step) % this.keys.length;
      if (this.getKeyWaitMs(candidateIndex, now) === 0) {
        return candidateIndex;
      }
    }
    return null;
  }

  private findSoonestRecoveringIndex(): number | null {
    const now = Date.now();
    let bestIndex: number | null = null;
    let bestWaitMs = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.keys.length; index += 1) {
      const waitMs = this.getKeyWaitMs(index, now);
      if (!Number.isFinite(waitMs)) {
        continue;
      }
      if (waitMs < bestWaitMs) {
        bestWaitMs = waitMs;
        bestIndex = index;
      }
    }
    return bestIndex;
  }
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
