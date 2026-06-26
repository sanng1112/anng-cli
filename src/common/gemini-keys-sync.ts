import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type GeminiKeyQuarantineEntry = {
  key: string;
  reason: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

type GeminiKeyQuarantineStore = {
  version: 1;
  entries: Record<string, GeminiKeyQuarantineEntry>;
};

type SyncMode = "bootstrap" | "force" | "never";

export function syncGeminiKeys(
  projectRoot: string = process.cwd(),
  options: { importDownloads?: SyncMode } = {}
): string {
  const userGeminiKeysPath = getUserGeminiKeysPath();
  const projectGeminiKeysPath = path.join(projectRoot, ".anng", "gemini_keys.txt");
  const quarantineStore = readGeminiKeyQuarantineStore();
  const quarantinedKeys = new Set(Object.keys(quarantineStore.entries));

  let keys: string[] = [];

  // 1. Clean up project-level key file if it exists to prevent git leak
  if (fs.existsSync(projectGeminiKeysPath)) {
    try {
      const content = fs.readFileSync(projectGeminiKeysPath, "utf8");
      const projectKeys = content
        .split(/[\r\n,]+/)
        .map((k) => k.trim())
        .filter((k) => isLikelyGeminiKey(k) && !quarantinedKeys.has(k));
      keys = [...projectKeys];
      fs.unlinkSync(projectGeminiKeysPath); // Remove file immediately to protect keys from git commit
    } catch {
      // ignore
    }
  }

  // 2. Read existing keys from user-level
  if (fs.existsSync(userGeminiKeysPath)) {
    try {
      const content = fs.readFileSync(userGeminiKeysPath, "utf8");
      const userKeys = content
        .split(/[\r\n,]+/)
        .map((k) => k.trim())
        .filter((k) => isLikelyGeminiKey(k) && !quarantinedKeys.has(k));
      keys = Array.from(new Set([...keys, ...userKeys]));
    } catch {
      // ignore
    }
  }

  const importMode = options.importDownloads ?? "bootstrap";
  const downloadPath = getGeminiDownloadPath();
  const shouldImportDownloads =
    importMode === "force" || (importMode === "bootstrap" && keys.length === 0 && fs.existsSync(downloadPath));

  // 3. Import from Downloads only for bootstrap or explicit force.
  if (shouldImportDownloads && fs.existsSync(downloadPath)) {
    try {
      const downloadContent = fs.readFileSync(downloadPath, "utf8");
      const downloadedKeys = downloadContent
        .split(/[\r\n,]+/)
        .map((k) => k.trim())
        .filter((k) => isLikelyGeminiKey(k) && !quarantinedKeys.has(k));

      if (downloadedKeys.length > 0) {
        keys = Array.from(new Set([...keys, ...downloadedKeys]));
      }
    } catch {
      // ignore
    }
  }

  // 4. Always save strictly to user-level (global config)
  if (keys.length > 0) {
    try {
      fs.mkdirSync(path.dirname(userGeminiKeysPath), { recursive: true });
      fs.writeFileSync(userGeminiKeysPath, keys.join("\n"), "utf8");
    } catch {
      // ignore
    }
  }

  return keys.join(",");
}

export function quarantineGeminiKey(key: string, reason: string): void {
  if (!isLikelyGeminiKey(key)) {
    return;
  }

  const now = new Date().toISOString();
  const store = readGeminiKeyQuarantineStore();
  const existing = store.entries[key];
  store.entries[key] = {
    key,
    reason,
    firstDetectedAt: existing?.firstDetectedAt ?? now,
    lastDetectedAt: now,
  };
  writeGeminiKeyQuarantineStore(store);
  pruneGeminiKeyFromUserStore(key);
}

export function getGeminiKeyInventory(projectRoot: string = process.cwd()): {
  userKeys: string[];
  downloadedKeys: string[];
  quarantinedKeys: GeminiKeyQuarantineEntry[];
} {
  const quarantineStore = readGeminiKeyQuarantineStore();
  const quarantinedKeys = new Set(Object.keys(quarantineStore.entries));
  return {
    userKeys: readGeminiKeyFile(getUserGeminiKeysPath()).filter((key) => !quarantinedKeys.has(key)),
    downloadedKeys: readGeminiKeyFile(getGeminiDownloadPath()).filter((key) => !quarantinedKeys.has(key)),
    quarantinedKeys: Object.values(quarantineStore.entries).sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function getGeminiDownloadPath(): string {
  return process.env.ANNG_GEMINI_DOWNLOAD_PATH || "/home/sanng/Downloads/api-gemini";
}

function getUserGeminiKeysPath(): string {
  return path.join(os.homedir(), ".anng", "gemini_keys.txt");
}

function getGeminiKeyQuarantinePath(): string {
  return path.join(os.homedir(), ".anng", "gemini_keys_quarantine.json");
}

function readGeminiKeyFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/[\r\n,]+/)
      .map((k) => k.trim())
      .filter((k) => isLikelyGeminiKey(k));
  } catch {
    return [];
  }
}

function pruneGeminiKeyFromUserStore(key: string): void {
  const userGeminiKeysPath = getUserGeminiKeysPath();
  const keys = readGeminiKeyFile(userGeminiKeysPath).filter((existingKey) => existingKey !== key);
  try {
    fs.mkdirSync(path.dirname(userGeminiKeysPath), { recursive: true });
    fs.writeFileSync(userGeminiKeysPath, keys.join("\n"), "utf8");
  } catch {
    // ignore
  }
}

function readGeminiKeyQuarantineStore(): GeminiKeyQuarantineStore {
  const quarantinePath = getGeminiKeyQuarantinePath();
  if (!fs.existsSync(quarantinePath)) {
    return { version: 1, entries: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(quarantinePath, "utf8")) as GeminiKeyQuarantineStore;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object" || parsed.entries == null) {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeGeminiKeyQuarantineStore(store: GeminiKeyQuarantineStore): void {
  try {
    const quarantinePath = getGeminiKeyQuarantinePath();
    fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
    fs.writeFileSync(quarantinePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  } catch {
    // ignore
  }
}

function isLikelyGeminiKey(key: string): boolean {
  return key.length > 10 && (key.startsWith("AIzaSy") || key.startsWith("AQ."));
}
