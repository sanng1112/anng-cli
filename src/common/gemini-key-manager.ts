/**
 * Centralized Gemini Key Manager
 *
 * Single source of truth for Gemini API keys.
 * Consolidates from:
 *   - ~/.anng/keys/gemini.json (structured format)
 *
 * Legacy files (gemini_keys.txt, gemini_keys_quarantine.json) are
 * considered deprecated and read-only fallbacks.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type GeminiKeyEntry = {
  id: string;
  api_key: string;
  label: string;
  status: "active" | "quarantined" | "expired";
  created_at: number;
  updated_at: number;
  last_used: number | null;
  error_count: number;
};

export type GeminiKeyStore = {
  provider: string;
  keys: GeminiKeyEntry[];
};

const GEMINI_KEYS_PATH = path.join(os.homedir(), ".anng", "keys", "gemini.json");
const GEMINI_KEYS_TXT_PATH = path.join(os.homedir(), ".anng", "gemini_keys.txt");

export function loadGeminiKeys(): GeminiKeyEntry[] {
  try {
    if (fs.existsSync(GEMINI_KEYS_PATH)) {
      const raw = fs.readFileSync(GEMINI_KEYS_PATH, "utf-8");
      const store = JSON.parse(raw) as GeminiKeyStore;
      return store.keys || [];
    }
  } catch {
    /* fall through */
  }

  // Fallback: read from legacy flat file
  try {
    if (fs.existsSync(GEMINI_KEYS_TXT_PATH)) {
      const lines = fs
        .readFileSync(GEMINI_KEYS_TXT_PATH, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.startsWith("AQ."));
      return lines.map((key, i) => ({
        id: `legacy-${i + 1}`,
        api_key: key,
        label: `legacy-import-${i + 1}`,
        status: "active" as const,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        last_used: null,
        error_count: 0,
      }));
    }
  } catch {
    /* ignore */
  }

  return [];
}

export function saveGeminiKeys(keys: GeminiKeyEntry[]): boolean {
  try {
    const dir = path.dirname(GEMINI_KEYS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const store: GeminiKeyStore = { provider: "gemini", keys };
    fs.writeFileSync(GEMINI_KEYS_PATH, JSON.stringify(store, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function addGeminiKey(key: string, label?: string): GeminiKeyEntry | null {
  const keys = loadGeminiKeys();
  // Check duplicates
  if (keys.some((k) => k.api_key === key)) return null;
  const entry: GeminiKeyEntry = {
    id: `k${keys.length + 1}`,
    api_key: key,
    label: label || `key-${keys.length + 1}`,
    status: "active",
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
    last_used: null,
    error_count: 0,
  };
  keys.push(entry);
  saveGeminiKeys(keys);
  return entry;
}

export function getActiveGeminiKeys(): GeminiKeyEntry[] {
  return loadGeminiKeys().filter((k) => k.status === "active");
}

export function quarantineGeminiKey(keyId: string, reason: string): boolean {
  const keys = loadGeminiKeys();
  const entry = keys.find((k) => k.id === keyId);
  if (!entry) return false;
  entry.status = "quarantined";
  entry.updated_at = Math.floor(Date.now() / 1000);
  saveGeminiKeys(keys);

  // Also write to quarantine log
  const quarantinePath = path.join(os.homedir(), ".anng", "gemini_keys_quarantine.json");
  try {
    let quarantine: Record<string, Record<string, string>> = {};
    if (fs.existsSync(quarantinePath)) {
      quarantine = JSON.parse(fs.readFileSync(quarantinePath, "utf-8"));
    }
    quarantine[entry.api_key] = {
      key: entry.api_key,
      reason,
      firstDetectedAt: new Date().toISOString(),
      lastDetectedAt: new Date().toISOString(),
    };
    fs.writeFileSync(quarantinePath, JSON.stringify(quarantine, null, 2), "utf-8");
  } catch {
    /* ignore */
  }

  return true;
}
