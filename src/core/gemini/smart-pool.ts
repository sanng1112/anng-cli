export type GeminiKeyStatus = "active" | "rate_limited" | "dead";

type KeyState = {
  status: GeminiKeyStatus;
  untilMs?: number;
  reason?: string;
  requests: number;
  failures: number;
};

export class GeminiSmartPool {
  private readonly states = new Map<string, Map<string, KeyState>>();

  constructor(private readonly pools: Record<string, string[]>) {}

  nextKey(model: string): string | null {
    for (const entry of this.snapshot(model)) {
      if (entry.status === "active") {
        this.markRequest(model, entry.key);
        return entry.key;
      }
    }
    return null;
  }

  markRequest(model: string, key: string): void {
    const state = this.ensureKeyState(model, key);
    state.requests += 1;
  }

  markRateLimited(model: string, key: string, retryAfterSec: number): void {
    const state = this.ensureKeyState(model, key);
    state.status = "rate_limited";
    state.untilMs = Date.now() + Math.max(0, retryAfterSec) * 1000;
    state.failures += 1;
  }

  markInvalid(model: string, key: string, reason: string): void {
    const state = this.ensureKeyState(model, key);
    state.status = "dead";
    state.reason = reason;
    state.untilMs = undefined;
    state.failures += 1;
  }

  getState(model: string): ReturnType<this["snapshot"]> {
    return this.snapshot(model);
  }

  snapshot(model: string): Array<{
    key: string;
    status: GeminiKeyStatus;
    requests: number;
    failures: number;
    waitSeconds: number;
    reason?: string;
  }> {
    return (this.pools[model] ?? []).map((key) => {
      const state = this.ensureKeyState(model, key);
      this.refreshState(state);

      return {
        key,
        status: state.status,
        requests: state.requests,
        failures: state.failures,
        waitSeconds: state.untilMs ? Math.max(0, Math.ceil((state.untilMs - Date.now()) / 1000)) : 0,
        reason: state.reason,
      };
    });
  }

  private ensureKeyState(model: string, key: string): KeyState {
    let modelState = this.states.get(model);
    if (!modelState) {
      modelState = new Map<string, KeyState>();
      this.states.set(model, modelState);
    }

    let keyState = modelState.get(key);
    if (!keyState) {
      keyState = {
        status: "active",
        requests: 0,
        failures: 0,
      };
      modelState.set(key, keyState);
    }

    this.refreshState(keyState);
    return keyState;
  }

  private refreshState(state: KeyState): void {
    if (state.status !== "rate_limited" || !state.untilMs) {
      return;
    }

    if (Date.now() >= state.untilMs) {
      state.status = "active";
      state.untilMs = undefined;
    }
  }
}
