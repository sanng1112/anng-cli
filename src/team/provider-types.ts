import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Provider: an API endpoint with a key
// ---------------------------------------------------------------------------
export type Provider = {
  id: string;
  name: string;
  apiKey: string;
  baseURL: string;
};

// ---------------------------------------------------------------------------
// ModelEntry: a model name bound to a provider
// ---------------------------------------------------------------------------
export type ModelEntry = {
  name: string;
  providerId: string;
  tested: boolean;
};

// ---------------------------------------------------------------------------
// Full config container
// ---------------------------------------------------------------------------
export type ProviderConfig = {
  providers: Provider[];
  models: ModelEntry[];
};

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function providersPath(projectRoot: string): string {
  return path.join(projectRoot, ".anng", "providers.json");
}

function modelsPath(projectRoot: string): string {
  return path.join(projectRoot, ".anng", "models.json");
}

// ---------------------------------------------------------------------------
// Load / Save providers
// ---------------------------------------------------------------------------

export function loadProviders(projectRoot: string): Provider[] {
  try {
    const p = providersPath(projectRoot);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x: unknown): x is Provider => typeof x === "object" && x !== null && typeof (x as Provider).id === "string"
    );
  } catch {
    return [];
  }
}

export function saveProviders(projectRoot: string, providers: Provider[]): void {
  // Deduplicate by id before saving
  const seen = new Set<string>();
  const deduped: Provider[] = [];
  for (const p of providers) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      deduped.push(p);
    }
  }
  const filePath = providersPath(projectRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(deduped, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Load / Save models
// ---------------------------------------------------------------------------

export function loadModels(projectRoot: string): ModelEntry[] {
  try {
    const p = modelsPath(projectRoot);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const valid = data.filter(
      (x: unknown): x is ModelEntry => typeof x === "object" && x !== null && typeof (x as ModelEntry).name === "string"
    );
    // Deduplicate by name (keep first occurrence)
    const seen = new Set<string>();
    const deduped: ModelEntry[] = [];
    for (const m of valid) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        deduped.push(m);
      }
    }
    if (deduped.length !== valid.length) {
      saveModels(projectRoot, deduped); // auto-fix duplicates on disk
    }
    return deduped;
  } catch {
    return [];
  }
}

export function saveModels(projectRoot: string, models: ModelEntry[]): void {
  // Deduplicate before saving
  const seen = new Set<string>();
  const deduped: ModelEntry[] = [];
  for (const m of models) {
    if (!seen.has(m.name)) {
      seen.add(m.name);
      deduped.push(m);
    }
  }
  const p = modelsPath(projectRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(deduped, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Migration: old settings.json proxyApiKey → providers + models
// ---------------------------------------------------------------------------

const MODEL_COMMAND_MODELS = [
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export function migrateFromSettings(
  projectRoot: string,
  proxyApiKeys: string | undefined,
  proxyBaseURL: string | undefined
): void {
  const provPath = providersPath(projectRoot);
  const modPath = modelsPath(projectRoot);

  // Already migrated
  if (fs.existsSync(provPath) && fs.existsSync(modPath)) return;
  // Nothing to migrate
  if (!proxyApiKeys) return;

  const keys = proxyApiKeys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return;

  const baseURL = proxyBaseURL || "https://opencode.ai/zen/v1";

  // Create providers
  const providers: Provider[] = keys.map((key, i) => ({
    id: `ds${i + 1}`,
    name: `DeepSeek Key ${i + 1}`,
    apiKey: key,
    baseURL,
  }));
  saveProviders(projectRoot, providers);

  // Create models if models.json doesn't exist yet
  if (!fs.existsSync(modPath) && providers.length > 0) {
    const models: ModelEntry[] = MODEL_COMMAND_MODELS.map((m) => ({
      name: m,
      providerId: providers[0].id,
      tested: false,
    }));
    saveModels(projectRoot, models);
  }
}

// ---------------------------------------------------------------------------
// Resolve: given a model name, find its provider
// ---------------------------------------------------------------------------

export function resolveModelProvider(
  projectRoot: string,
  modelName: string
): { provider: Provider | null; model: ModelEntry | null } {
  const models = loadModels(projectRoot);
  const model = models.find((m) => m.name === modelName) ?? null;
  if (!model) return { provider: null, model: null };

  const providers = loadProviders(projectRoot);
  const provider = providers.find((p) => p.id === model.providerId) ?? null;
  return { provider, model };
}
