import * as crypto from "crypto";

/**
 * Strips timestamps, absolute paths, and line/column numbers from an error message
 * so the same logical error always produces the same signature regardless of noise.
 */
export function normalizeErrorMessage(errorMsg: string): string {
  let clean = errorMsg;

  // Strip ISO timestamps (e.g., 2026-06-26T20:28:59Z or 2026-06-26T20:28:59.123)
  clean = clean.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/gi, "");

  // Strip absolute project paths (e.g., /run/media/.../Anng_cli/ or /home/user/project/)
  clean = clean.replace(/(?:\/[\w.()s-]+){3,}\/Anng_cli\//g, "PROJECT_ROOT/");
  clean = clean.replace(/\/home\/[\w-]+\//g, "USER_HOME/");

  // Strip line/column references (e.g., :12:34 or line 12 or at line 12, col 34)
  clean = clean.replace(/:\d+:\d+/g, "");
  clean = clean.replace(/\bat line \d+(?:,\s*col(?:umn)?\s*\d+)?\b/gi, "");

  // Strip trailing/leading whitespace and collapse internal whitespace
  return clean.replace(/\s+/g, " ").trim();
}

/**
 * Produces a stable MD5 hash from a normalized error message.
 * Two errors with the same semantic content but different timestamps/paths
 * will produce the same signature.
 */
export function buildErrorSignature(errorMsg: string): string {
  const normalized = normalizeErrorMessage(errorMsg);
  return crypto.createHash("md5").update(normalized).digest("hex");
}
