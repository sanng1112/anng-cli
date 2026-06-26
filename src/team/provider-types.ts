import * as fs from "fs";
import * as path from "path";
import { MODEL_COMMAND_MODELS } from "../ui/components/ModelsDropdown";

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
  tested: boolean;
  providerId: string;
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

function getProviderIdForModel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith("gemini") || lower.startsWith("gemma")) {
    return "gemini";
  }
  return "deepseek";
}

/** Create default models from the built-in list */
function createDefaultModels(projectRoot: string): ModelEntry[] {
  const models: ModelEntry[] = MODEL_COMMAND_MODELS.map((m) => ({
    name: m,
    tested: false,
    providerId: getProviderIdForModel(m),
  }));
  saveModels(projectRoot, models);
  return models;
}

export function loadModels(projectRoot: string): ModelEntry[] {
  try {
    const p = modelsPath(projectRoot);
    if (!fs.existsSync(p)) return createDefaultModels(projectRoot);
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return createDefaultModels(projectRoot);
    const valid = data.filter(
      (x: unknown): x is Omit<ModelEntry, "providerId"> & { providerId?: string } =>
        typeof x === "object" && x !== null && typeof (x as { name?: unknown }).name === "string"
    );
    if (valid.length === 0) {
      return createDefaultModels(projectRoot);
    }
    const seen = new Set<string>();
    const deduped: ModelEntry[] = [];
    for (const m of valid) {
      if (!seen.has(m.name)) {
        seen.add(m.name);
        deduped.push({
          name: m.name,
          tested: m.tested ?? false,
          providerId: m.providerId || getProviderIdForModel(m.name),
        });
      }
    }
    if (deduped.length !== valid.length) {
      saveModels(projectRoot, deduped);
    }
    return deduped;
  } catch {
    return [];
  }
}

export function saveModels(projectRoot: string, models: ModelEntry[]): void {
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
