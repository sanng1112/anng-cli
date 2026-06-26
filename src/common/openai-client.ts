import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { OpenAI } from "openai";
import { Agent, fetch as undiciFetch } from "undici";
import { resolveCurrentSettings, type ResolvedDeepcodingSettings } from "../settings";
import { quarantineGeminiKey } from "./gemini-keys-sync";
import { KeyRotator, type KeyStat } from "./key-rotator";
import {
  acquireGeminiQuotaSlot,
  getGeminiQuotaSnapshot,
  markGeminiQuotaKeyInvalid,
  type GeminiGlobalQuotaSnapshot,
} from "./gemini-quota-coordinator";

// Custom undici Agent with a 180-second keepAlive timeout.  The default
// global fetch (undici) only keeps connections alive for 4 seconds, which
// is too short for a CLI where the user may spend 10–30 seconds reading
// output between prompts.  By passing a dedicated Agent to undiciFetch we
// keep connections reusable for three minutes after the last request.
const keepAliveAgent = new Agent({ keepAliveTimeout: 180_000 });

// Module-level cache for the OpenAI client instances (one per provider).
// Each provider has its own client and key rotator state.
type ProviderState = {
  client: OpenAI;
  baseURL: string;
  providerStateKey: string;
  rotator: KeyRotator;
  providerLabel: string;
};

type OpenAIHttpError = Error & {
  status?: number;
  code?: number | string;
  type?: string;
  responseBody?: unknown;
  retryAfterSec?: number;
};

const providerState = new Map<string, ProviderState>();

// Detect provider from model name
const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

function buildProviderStateKey(baseURL: string, apiKey: string): string {
  const normalizedBaseURL = baseURL.trim().replace(/\/+$/g, "");
  const hash = crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return `${normalizedBaseURL}|${hash}`;
}

function createOpenAIHttpError(
  status: number,
  rawBody: string,
  parsedBody: unknown,
  retryAfterSec?: number
): OpenAIHttpError {
  const errorPayload =
    parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
      ? ((parsedBody as { error?: Record<string, unknown> }).error ?? parsedBody)
      : {};
  const code =
    typeof (errorPayload as { code?: unknown }).code === "string" ||
    typeof (errorPayload as { code?: unknown }).code === "number"
      ? (errorPayload as { code: string | number }).code
      : undefined;
  const type =
    typeof (errorPayload as { type?: unknown }).type === "string" ? (errorPayload as { type: string }).type : undefined;
  const message =
    typeof (errorPayload as { message?: unknown }).message === "string"
      ? (errorPayload as { message: string }).message
      : rawBody.trim() || `HTTP ${status}`;
  const error = new Error(message) as OpenAIHttpError;
  error.name = "OpenAIHTTPError";
  error.status = status;
  error.code = code;
  error.type = type;
  error.responseBody = parsedBody || rawBody;
  error.retryAfterSec = retryAfterSec;
  return error;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber);
  }
  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
}

export function isGeminiModel(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.startsWith("gemini") || lower.startsWith("gemma");
}

export function getProviderConfig(settings: ResolvedDeepcodingSettings): {
  apiKey: string;
  baseURL: string;
} {
  if (isGeminiModel(settings.model)) {
    return {
      apiKey: settings.geminiApiKey || settings.apiKey || "",
      baseURL: settings.geminiBaseURL || GEMINI_DEFAULT_BASE_URL,
    };
  }
  return {
    apiKey: settings.apiKey || "",
    baseURL: settings.baseURL,
  };
}

export function rotateApiKey(providerKey: string): void {
  const state = resolveProviderState(providerKey);
  if (state && state.rotator.getKeyCount() > 1) {
    state.rotator.rotate();
    state.client.apiKey = state.rotator.getCurrentKey();
  }
}

/**
 * Check if an error is a rate-limit or quota-exceeded error that warrants
 * rotating to the next API key. Returns true if the key was rotated.
 */
export function maybeRotateApiKeyOnError(providerKey: string, error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // OpenAI-compatible API errors typically have a `status` or `code` property
  const err = error as Error & { status?: number; code?: number | string; type?: string };
  const status = err.status;
  const code = err.code;
  const msg = err.message?.toLowerCase() ?? "";

  const isRateLimit =
    status === 429 ||
    code === 429 ||
    code === "rate_limit_exceeded" ||
    code === "insufficient_quota" ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("billing");

  if (!isRateLimit) {
    return false;
  }

  const state = resolveProviderState(providerKey);
  if (state && state.rotator.getKeyCount() > 1) {
    const oldKey = state.rotator.getCurrentKey();
    state.rotator.rotate();
    const newKey = state.rotator.getCurrentKey();
    if (newKey !== oldKey) {
      state.client.apiKey = newKey;
      return true;
    }
  }

  return false;
}

function resolveProviderState(providerKey: string): ProviderState | undefined {
  const direct = providerState.get(providerKey);
  if (direct) {
    return direct;
  }
  for (const state of providerState.values()) {
    if (state.baseURL === providerKey) {
      return state;
    }
  }
  return undefined;
}

function pruneProviderStatesForBaseURL(baseURL: string, keepProviderStateKey: string): void {
  for (const [providerStateKey, state] of providerState.entries()) {
    if (providerStateKey === keepProviderStateKey) {
      continue;
    }
    if (state.baseURL === baseURL) {
      providerState.delete(providerStateKey);
    }
  }
}

function delay(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenAIClient(projectRoot: string = process.cwd()): {
  client: OpenAI | null;
  model: string;
  baseURL: string;
  providerStateKey?: string;
  temperature?: number;
  thinkingEnabled: boolean;
  reasoningEffort: "high" | "max";
  debugLogEnabled: boolean;
  telemetryEnabled: boolean;
  notify?: string;
  webSearchTool?: string;
  env: Record<string, string>;
  machineId?: string;
} {
  const settings = resolveCurrentSettings(projectRoot);
  const providerConfig = getProviderConfig(settings);
  const isGeminiProvider =
    isGeminiModel(settings.model) || providerConfig.baseURL.includes("generativelanguage.googleapis.com");

  if (!providerConfig.apiKey) {
    return {
      client: null,
      model: settings.model,
      baseURL: providerConfig.baseURL,
      providerStateKey: undefined,
      temperature: settings.temperature,
      thinkingEnabled: settings.thinkingEnabled,
      reasoningEffort: settings.reasoningEffort,
      debugLogEnabled: settings.debugLogEnabled,
      telemetryEnabled: settings.telemetryEnabled,
      notify: settings.notify,
      webSearchTool: settings.webSearchTool,
      env: settings.env,
      machineId: getMachineId(),
    };
  }

  const providerStateKey = buildProviderStateKey(providerConfig.baseURL, providerConfig.apiKey);
  const state = providerState.get(providerStateKey);
  pruneProviderStatesForBaseURL(providerConfig.baseURL, providerStateKey);

  // Cache hit: same provider, same API key set
  if (state) {
    return {
      client: state.client,
      model: settings.model,
      baseURL: providerConfig.baseURL,
      providerStateKey,
      temperature: settings.temperature,
      thinkingEnabled: settings.thinkingEnabled,
      reasoningEffort: settings.reasoningEffort,
      debugLogEnabled: settings.debugLogEnabled,
      telemetryEnabled: settings.telemetryEnabled,
      notify: settings.notify,
      webSearchTool: settings.webSearchTool,
      env: settings.env,
      machineId: getMachineId(),
    };
  }

  // New provider: create client with key rotation support
  const rotator = new KeyRotator(providerConfig.apiKey, {
    requestsPerMinute: isGeminiProvider ? 5 : undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchWithRotation = async (url: any, init: any): Promise<any> => {
    let lastError: unknown;
    const maxRetries = Math.max(1, rotator.getKeyCount());

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        rotator.rotate();
      }
      if (isGeminiProvider) {
        const allocation = await acquireGeminiQuotaSlot(
          rotator.getAvailabilitySnapshot().map((candidate) => ({
            index: candidate.index,
            key: candidate.key,
            maskedKey: candidate.maskedKey,
            localStatus: candidate.status,
            localWaitMs: candidate.waitMs,
          }))
        );
        rotator.setCurrentIndex(allocation.selectedIndex);
      } else {
        const waitMs = rotator.ensureAvailableKey();
        if (waitMs > 0) {
          await delay(waitMs);
          rotator.ensureAvailableKey();
        }
      }
      const currentKey = rotator.getCurrentKey();
      rotator.markRequest();

      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${currentKey}`);

      const ac = new AbortController();
      let abortedByCaller = false;

      if (init.signal) {
        init.signal.addEventListener("abort", () => {
          abortedByCaller = true;
          ac.abort(init.signal.reason);
        });
        if (init.signal.aborted) {
          throw new Error("Aborted");
        }
      }

      let headersReceived = false;
      const ttfbTimeoutId = setTimeout(() => {
        if (!abortedByCaller && !headersReceived) {
          ac.abort(new Error("TimeoutTTFB60s"));
        }
      }, 60000);

      const timeoutId = setTimeout(() => {
        if (!abortedByCaller) {
          ac.abort(new Error("TimeoutAfter300s"));
        }
      }, 300000);

      let handled = false;
      try {
        const response = await undiciFetch(url, {
          ...init,
          headers,
          signal: ac.signal,
          dispatcher: keepAliveAgent,
        });
        headersReceived = true;
        clearTimeout(ttfbTimeoutId);
        clearTimeout(timeoutId);

        if (response.status >= 400) {
          handled = true;
          const rawBody = await response.text().catch(() => "");
          let parsedBody: unknown = null;
          try {
            parsedBody = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            // ignore
          }
          const retryAfterSec = parseRetryAfterSeconds(response.headers.get("retry-after"));
          const apiError = createOpenAIHttpError(response.status, rawBody, parsedBody, retryAfterSec);
          const isRetryableAcrossKeys =
            response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500;

          if (isRetryableAcrossKeys) {
            if (response.status === 429) {
              rotator.markFailure(retryAfterSec ?? 60);
            } else if (response.status === 401 || response.status === 403) {
              if (isGeminiProvider) {
                quarantineGeminiKey(currentKey, `${response.status}: ${apiError.message}`);
                await markGeminiQuotaKeyInvalid(currentKey, `${response.status}: ${apiError.message}`);
                rotator.markInvalid();
              } else {
                rotator.markFailure(300);
              }
            } else {
              rotator.markFailure(15);
            }
          }

          if (!isRetryableAcrossKeys || attempt >= maxRetries - 1 || rotator.getKeyCount() <= 1) {
            throw apiError;
          }

          lastError = apiError;
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(ttfbTimeoutId);
        clearTimeout(timeoutId);
        lastError = err;
        if (!handled) {
          rotator.markFailure(10);
        }
        if (abortedByCaller) {
          throw err;
        }
        if (!handled && attempt >= maxRetries - 1) {
          throw err;
        }
      }
    }
    throw lastError;
  };

  const client = new OpenAI({
    apiKey: "dummy-key-overridden-in-fetch",
    baseURL: providerConfig.baseURL || undefined,
    fetch: fetchWithRotation,
  });

  providerState.set(providerStateKey, {
    client,
    baseURL: providerConfig.baseURL,
    providerStateKey,
    rotator,
    providerLabel: isGeminiProvider ? "Gemini" : "OpenAI-compatible",
  });

  // Fire-and-forget warmup: pre-establish TCP+TLS connection to the API
  void (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    try {
      await client.models.list({ signal: ac.signal }).catch(() => {});
    } finally {
      clearTimeout(timer);
    }
  })();

  return {
    client,
    model: settings.model,
    baseURL: providerConfig.baseURL,
    providerStateKey,
    temperature: settings.temperature,
    thinkingEnabled: settings.thinkingEnabled,
    reasoningEffort: settings.reasoningEffort,
    debugLogEnabled: settings.debugLogEnabled,
    telemetryEnabled: settings.telemetryEnabled,
    notify: settings.notify,
    webSearchTool: settings.webSearchTool,
    env: settings.env,
    machineId: getMachineId(),
  };
}

function getMachineId(): string | undefined {
  try {
    const idPath = path.join(os.homedir(), ".anng", "machine-id");
    if (fs.existsSync(idPath)) {
      const raw = fs.readFileSync(idPath, "utf8").trim();
      if (raw) {
        return raw;
      }
    }
    const generated = `${os.hostname()}-${crypto.randomUUID()}`;
    fs.mkdirSync(path.dirname(idPath), { recursive: true });
    fs.writeFileSync(idPath, generated, "utf8");
    return generated;
  } catch {
    return undefined;
  }
}

export type ProviderQuotaStats = {
  baseURL: string;
  providerLabel: string;
  totalKeys: number;
  usableKeys: number;
  activeKeys: number;
  cooldownKeys: number;
  rateLimitedKeys: number;
  invalidKeys: number;
  totalRequests: number;
  totalFailures: number;
  keyStats: KeyStat[];
  globalQuota?: GeminiGlobalQuotaSnapshot;
};

export function getActiveRotatorsStats(): ProviderQuotaStats[] {
  const stats: ProviderQuotaStats[] = [];
  for (const state of providerState.values()) {
    const keyStats = state.rotator.getKeyStats();
    stats.push({
      baseURL: state.baseURL || "unknown",
      providerLabel: state.providerLabel,
      totalKeys: keyStats.length,
      usableKeys: state.rotator.getUsableKeyCount(),
      activeKeys: keyStats.filter((stat) => stat.status === "active").length,
      cooldownKeys: keyStats.filter((stat) => stat.status === "cooldown").length,
      rateLimitedKeys: keyStats.filter((stat) => stat.status === "rate_limited").length,
      invalidKeys: keyStats.filter((stat) => stat.status === "invalid").length,
      totalRequests: keyStats.reduce((sum, stat) => sum + stat.requests, 0),
      totalFailures: keyStats.reduce((sum, stat) => sum + stat.failures, 0),
      keyStats,
      globalQuota:
        state.providerLabel === "Gemini"
          ? getGeminiQuotaSnapshot(state.rotator.getKeys().filter((key) => key.trim().length > 0))
          : undefined,
    });
  }
  return stats;
}

export function resetKeyRotators(): void {
  for (const state of providerState.values()) {
    state.rotator.reset();
  }
}
