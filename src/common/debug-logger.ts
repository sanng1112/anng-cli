import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const DEBUG_LOG_FILE = "debug.log";
const MAX_DEBUG_LOG_ENTRIES = 200;
const CONTENT_TRUNCATE_PREVIEW = 500;
const MASKED_VALUE = "***MASKED***";

export type OpenAIChatCompletionDebugEntry = {
  timestamp: string;
  location: string;
  requestId?: string;
  sessionId?: string;
  model?: string;
  baseURL?: string;
  durationMs?: number;
  params?: Record<string, unknown>;
  request: Record<string, unknown>;
  response?: unknown;
  responseChunks?: unknown[];
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

export function logOpenAIChatCompletionDebug(entry: OpenAIChatCompletionDebugEntry): void {
  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(toSerializable(entry))}\n`, "utf8");
    rotateDebugLog(logPath);
  } catch {
    // Debug logging must never affect CLI behavior.
  }
}

export function getDebugLogPath(): string {
  return path.join(os.homedir(), ".anng", "logs", DEBUG_LOG_FILE);
}

export function normalizeDebugError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

function toSerializable(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function walk(current: unknown, key?: string): unknown {
    if (typeof current === "bigint") {
      return current.toString();
    }
    if (current instanceof Error) {
      return normalizeDebugError(current);
    }
    if (typeof current === "string") {
      const masked = maskSensitiveString(current);
      return shouldTruncateValue(key) ? truncateContent(masked) : masked;
    }
    if (!current || typeof current !== "object") {
      return current;
    }
    if (seen.has(current)) {
      return "[Circular]";
    }
    seen.add(current);
    if (Array.isArray(current)) {
      return current.map((item) => walk(item, key));
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(current)) {
      result[key] = isSensitiveKey(key) && typeof val === "string" ? MASKED_VALUE : walk(val, key);
    }
    return result;
  }

  return walk(value);
}

function rotateDebugLog(logPath: string): void {
  const raw = fs.readFileSync(logPath, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length <= MAX_DEBUG_LOG_ENTRIES) {
    return;
  }
  fs.writeFileSync(logPath, `${lines.slice(-MAX_DEBUG_LOG_ENTRIES).join("\n")}\n`, "utf8");
}

function shouldTruncateValue(key?: string): boolean {
  return key === "content" || key === "body";
}

function truncateContent(value: string): string {
  if (value.length <= CONTENT_TRUNCATE_PREVIEW) {
    return value;
  }
  return `${value.slice(0, CONTENT_TRUNCATE_PREVIEW)}...(total ${value.length} chars)`;
}

function isSensitiveKey(key: string): boolean {
  return /authorization|api[_-]?key|secret|token/i.test(key);
}

function maskSensitiveString(text: string): string {
  return text
    .replace(/(Authorization:\s*Bearer\s+)[^\s\r\n]+/gi, `$1${MASKED_VALUE}`)
    .replace(/((?:api[Kk]ey|api_key|secret)\s*[:=]\s*"?)[^",}\s]+/gi, `$1${MASKED_VALUE}`)
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, MASKED_VALUE);
}
