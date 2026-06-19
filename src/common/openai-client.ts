import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { OpenAI } from "openai";
import { Agent, fetch as undiciFetch } from "undici";
import { resolveCurrentSettings, type ResolvedDeepcodingSettings } from "../settings";
import { KeyRotator } from "./key-rotator";

// Custom undici Agent with a 180-second keepAlive timeout.  The default
// global fetch (undici) only keeps connections alive for 4 seconds, which
// is too short for a CLI where the user may spend 10–30 seconds reading
// output between prompts.  By passing a dedicated Agent to undiciFetch we
// keep connections reusable for three minutes after the last request.
const keepAliveAgent = new Agent({ keepAliveTimeout: 180_000 });

// Module-level cache for the OpenAI client instances (one per provider).
// Each provider has its own client, key rotator, and cache key.
const providerState = new Map<string, { client: OpenAI; cacheKey: string; rotator: KeyRotator }>();

// Detect provider from model name
const GEMINI_MODEL_PREFIX = "gemini";
const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

function isGeminiModel(model: string): boolean {
  return model.toLowerCase().startsWith(GEMINI_MODEL_PREFIX);
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
  const state = providerState.get(providerKey);
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

  const state = providerState.get(providerKey);
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

export function createOpenAIClient(projectRoot: string = process.cwd()): {
  client: OpenAI | null;
  model: string;
  baseURL: string;
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

  if (!providerConfig.apiKey) {
    return {
      client: null,
      model: settings.model,
      baseURL: providerConfig.baseURL,
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

  const providerKey = `${providerConfig.baseURL}|${providerConfig.apiKey}`;
  const state = providerState.get(providerKey);

  // Cache hit: same provider, same API key set
  if (state) {
    return {
      client: state.client,
      model: settings.model,
      baseURL: providerConfig.baseURL,
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
  const rotator = new KeyRotator(providerConfig.apiKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchWithRotation = async (url: any, init: any): Promise<any> => {
    let lastError: unknown;
    const maxRetries = Math.max(2, rotator.getKeyCount());

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        rotator.rotate();
      }
      const currentKey = rotator.getCurrentKey();

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

        if (response.status === 429 || response.status === 401 || response.status >= 500) {
          await response.text().catch(() => {});
          throw new Error(`ApiError${response.status}`);
        }

        return response;
      } catch (err) {
        clearTimeout(ttfbTimeoutId);
        clearTimeout(timeoutId);
        lastError = err;
        if (abortedByCaller) {
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

  providerState.set(providerKey, { client, cacheKey: providerConfig.apiKey, rotator });

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
