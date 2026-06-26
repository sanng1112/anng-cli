import { defaultsToThinkingMode } from "./common/model-capabilities";
import { DEFAULT_MAX_TURNS } from "./common/constants";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { syncGeminiKeys } from "./common/gemini-keys-sync";

// ==========================================================================
// Types
// ==========================================================================

// -- Environment helpers ---------------------------------------------------

export type SettingsProcessEnv = Record<string, string | undefined>;

export type DeepcodingEnv = Record<string, string | undefined> & {
  MODEL?: string;
  BASE_URL?: string;
  API_KEY?: string;
  TEMPERATURE?: string;
  THINKING_ENABLED?: string;
  REASONING_EFFORT?: string;
  DEBUG_LOG_ENABLED?: string;
  TELEMETRY_ENABLED?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  FULL_POWER_MODE?: string;
};

// -- Reasoning -------------------------------------------------------------

export type ReasoningEffort = "high" | "max";

// -- MCP -------------------------------------------------------------------

export type McpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// -- Permissions -----------------------------------------------------------

export type PermissionScope =
  | "read-in-cwd"
  | "read-out-cwd"
  | "write-in-cwd"
  | "write-out-cwd"
  | "delete-in-cwd"
  | "delete-out-cwd"
  | "query-git-log"
  | "mutate-git-log"
  | "network"
  | "mcp";

export type PermissionDefaultMode = "allowAll" | "askAll";

export type PermissionSettings = {
  allow?: PermissionScope[];
  deny?: PermissionScope[];
  ask?: PermissionScope[];
  defaultMode?: PermissionDefaultMode;
};

// -- Skills ----------------------------------------------------------------

export type EnabledSkillsSettings = Record<string, boolean>;

// -- User-facing model selection -------------------------------------------

export type ModelConfigSelection = {
  model: string;
  thinkingEnabled: boolean;
  reasoningEffort: ReasoningEffort;
};

// -- Raw settings (what user writes in JSON) -------------------------------

export type DeepcodingSettings = {
  env?: DeepcodingEnv;
  model?: string;
  temperature?: number;
  thinkingEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  debugLogEnabled?: boolean;
  telemetryEnabled?: boolean;
  notify?: string;
  webSearchTool?: string;
  mcpServers?: Record<string, McpServerConfig>;
  permissions?: PermissionSettings;
  enabledSkills?: EnabledSkillsSettings;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  geminiApiKey?: string;
  geminiBaseURL?: string;
  autoLinter?: string;
  fullPowerMode?: boolean;
  provider?: string;
};

// -- Resolved settings (after merging sources) -----------------------------

export type ResolvedDeepcodingSettings = {
  env: Record<string, string>;
  apiKey?: string;
  baseURL: string;
  model: string;
  temperature?: number;
  thinkingEnabled: boolean;
  reasoningEffort: ReasoningEffort;
  debugLogEnabled: boolean;
  telemetryEnabled: boolean;
  notify?: string;
  webSearchTool?: string;
  mcpServers?: Record<string, McpServerConfig>;
  permissions: Required<PermissionSettings>;
  enabledSkills: EnabledSkillsSettings;
  autoAccept: boolean;
  planMode: boolean;
  maxTurns: number;
  headlessPrompt?: string;
  fullPowerMode: boolean;
  geminiApiKey?: string;
  geminiBaseURL?: string;
  autoLinter?: string;
  provider?: string;
};

// ==========================================================================
// Default constants
// ==========================================================================

export const DEFAULT_MODEL = "deepseek-v4-pro";
export const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";

// ==========================================================================
// Resolution context (input sources for merging)
// ==========================================================================

type ResolutionSources = {
  systemEnv: Record<string, string>;
  projectSettings?: DeepcodingSettings | null;
  projectEnv: Record<string, string>;
  userSettings?: DeepcodingSettings | null;
  userEnv: Record<string, string>;
};

// ==========================================================================
// Generic fallback helpers
// ==========================================================================

function firstString(sources: ResolutionSources, key: string, settingsKey: string, fallback = ""): string {
  return (
    trimString(sources.systemEnv[key]) ||
    trimString(sources.projectSettings?.[settingsKey as keyof DeepcodingSettings]) ||
    trimString(sources.projectEnv[key]) ||
    trimString(sources.userSettings?.[settingsKey as keyof DeepcodingSettings]) ||
    trimString(sources.userEnv[key]) ||
    fallback
  );
}

function firstBoolean(sources: ResolutionSources, key: string, settingsKey: string, fallback: boolean): boolean;
function firstBoolean(
  sources: ResolutionSources,
  key: string,
  settingsKey: string,
  fallback?: boolean
): boolean | undefined;
function firstBoolean(
  sources: ResolutionSources,
  key: string,
  settingsKey: string,
  fallback?: boolean
): boolean | undefined {
  return (
    parseBoolean(sources.systemEnv[key]) ??
    parseBoolean(sources.projectSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    parseBoolean(sources.projectEnv[key]) ??
    parseBoolean(sources.userSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    parseBoolean(sources.userEnv[key]) ??
    fallback
  );
}

function firstReasoning(
  sources: ResolutionSources,
  key: string,
  settingsKey: string,
  fallback: ReasoningEffort
): ReasoningEffort;
function firstReasoning(
  sources: ResolutionSources,
  key: string,
  settingsKey: string,
  fallback?: ReasoningEffort
): ReasoningEffort | undefined;
function firstReasoning(
  sources: ResolutionSources,
  key: string,
  settingsKey: string,
  fallback?: ReasoningEffort
): ReasoningEffort | undefined {
  return (
    resolveReasoningEffort(sources.systemEnv[key]) ??
    resolveReasoningEffort(sources.projectSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    resolveReasoningEffort(sources.projectEnv[key]) ??
    resolveReasoningEffort(sources.userSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    resolveReasoningEffort(sources.userEnv[key]) ??
    fallback
  );
}

function firstTemperature(sources: ResolutionSources, key: string, settingsKey: string): number | undefined {
  return (
    parseTemperature(sources.systemEnv[key]) ??
    parseTemperature(sources.projectSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    parseTemperature(sources.projectEnv[key]) ??
    parseTemperature(sources.userSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    parseTemperature(sources.userEnv[key])
  );
}

function firstInteger(sources: ResolutionSources, key: string, settingsKey: string, fallback: number): number {
  const val =
    parseInteger(sources.systemEnv[key]) ??
    parseInteger(sources.projectSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    parseInteger(sources.projectEnv[key]) ??
    parseInteger(sources.userSettings?.[settingsKey as keyof DeepcodingSettings]) ??
    parseInteger(sources.userEnv[key]);
  return val !== undefined ? val : fallback;
}

// ==========================================================================
// Permissions normalization
// ==========================================================================

function resolveReasoningEffort(value: unknown): ReasoningEffort | undefined {
  return value === "high" || value === "max" ? value : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const n = value.trim().toLowerCase();
  if (["1", "true", "enabled", "yes", "on"].includes(n)) return true;
  if (["0", "false", "disabled", "no", "off"].includes(n)) return false;
  return undefined;
}

function parseTemperature(value: unknown): number | undefined {
  const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : undefined;
}

function parseInteger(value: unknown): number | undefined {
  const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? parseInt(value, 10) : NaN;
  return Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const VALID_PERMISSION_SCOPES = new Set<PermissionScope>([
  "read-in-cwd",
  "read-out-cwd",
  "write-in-cwd",
  "write-out-cwd",
  "delete-in-cwd",
  "delete-out-cwd",
  "query-git-log",
  "mutate-git-log",
  "network",
  "mcp",
]);

function normalizePermissionList(value: unknown): PermissionScope[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: PermissionScope[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !VALID_PERMISSION_SCOPES.has(item as PermissionScope)) {
      continue;
    }
    const scope = item as PermissionScope;
    if (!result.includes(scope)) {
      result.push(scope);
    }
  }
  return result;
}

function mergePermissionLists(...lists: Array<PermissionScope[] | undefined>): PermissionScope[] {
  const result: PermissionScope[] = [];
  for (const list of lists) {
    for (const scope of list ?? []) {
      if (!result.includes(scope)) {
        result.push(scope);
      }
    }
  }
  return result;
}

function normalizePermissionDefaultMode(value: unknown): PermissionDefaultMode | undefined {
  return value === "allowAll" || value === "askAll" ? value : undefined;
}

function normalizePermissions(settings: PermissionSettings | null | undefined): Required<PermissionSettings> {
  return {
    allow: normalizePermissionList(settings?.allow),
    deny: normalizePermissionList(settings?.deny),
    ask: normalizePermissionList(settings?.ask),
    defaultMode: normalizePermissionDefaultMode(settings?.defaultMode) ?? "askAll",
  };
}

function mergePermissions(
  userSettings: DeepcodingSettings | null | undefined,
  projectSettings: DeepcodingSettings | null | undefined
): Required<PermissionSettings> {
  const userPermissions = normalizePermissions(userSettings?.permissions);
  const projectPermissions = normalizePermissions(projectSettings?.permissions);
  return {
    allow: mergePermissionLists(userPermissions.allow, projectPermissions.allow),
    deny: mergePermissionLists(userPermissions.deny, projectPermissions.deny),
    ask: mergePermissionLists(userPermissions.ask, projectPermissions.ask),
    defaultMode: projectSettings?.permissions
      ? projectPermissions.defaultMode
      : userSettings?.permissions
        ? userPermissions.defaultMode
        : "askAll",
  };
}

function normalizeEnabledSkills(value: unknown): EnabledSkillsSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: EnabledSkillsSettings = {};
  for (const [name, enabled] of Object.entries(value)) {
    if (!name || typeof enabled !== "boolean") {
      continue;
    }
    result[name] = enabled;
  }
  return result;
}

function mergeEnabledSkills(
  userSettings: DeepcodingSettings | null | undefined,
  projectSettings: DeepcodingSettings | null | undefined
): EnabledSkillsSettings {
  return {
    ...normalizeEnabledSkills(userSettings?.enabledSkills),
    ...normalizeEnabledSkills(projectSettings?.enabledSkills),
  };
}

function normalizeEnv(env: DeepcodingSettings["env"]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!env) {
    return result;
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

export function collectAnngEnv(processEnv: SettingsProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(processEnv)) {
    if (!key.startsWith("ANNG_") || typeof value !== "string") {
      continue;
    }
    const strippedKey = key.slice("ANNG_".length);
    if (strippedKey) {
      result[strippedKey] = value;
    }
  }
  return result;
}

function extractMcpEnv(env: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("MCP_")) {
      continue;
    }
    const strippedKey = key.slice("MCP_".length);
    if (strippedKey) {
      result[strippedKey] = value;
    }
  }
  return result;
}

function mergeMcpServers(
  userSettings: DeepcodingSettings | null | undefined,
  projectSettings: DeepcodingSettings | null | undefined,
  userEnv: Record<string, string>,
  projectEnv: Record<string, string>,
  systemEnv: Record<string, string>
): Record<string, McpServerConfig> | undefined {
  const userServers = userSettings?.mcpServers ?? {};
  const projectServers = projectSettings?.mcpServers ?? {};
  const serverNames = new Set([...Object.keys(userServers), ...Object.keys(projectServers)]);
  if (serverNames.size === 0) {
    return undefined;
  }

  const userMcpEnv = extractMcpEnv(userEnv);
  const projectMcpEnv = extractMcpEnv(projectEnv);
  const systemMcpEnv = extractMcpEnv(systemEnv);
  const merged: Record<string, McpServerConfig> = {};

  for (const name of serverNames) {
    const userConfig = userServers[name];
    const projectConfig = projectServers[name];
    const command = projectConfig?.command ?? userConfig?.command;
    if (!command) {
      continue;
    }

    const env = {
      ...userEnv,
      ...(userConfig?.env ?? {}),
      ...userMcpEnv,
      ...projectEnv,
      ...(projectConfig?.env ?? {}),
      ...projectMcpEnv,
      ...systemEnv,
      ...systemMcpEnv,
    };
    const config: McpServerConfig = {
      command,
      args: projectConfig?.args ?? userConfig?.args,
    };
    if (Object.keys(env).length > 0) {
      config.env = env;
    }
    merged[name] = config;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function resolveSettingsSources(
  userSettings: DeepcodingSettings | null | undefined,
  projectSettings: DeepcodingSettings | null | undefined,
  defaults: { model: string; baseURL: string },
  processEnv: SettingsProcessEnv = process.env
): ResolvedDeepcodingSettings {
  const userEnv = normalizeEnv(userSettings?.env);
  const projectEnv = normalizeEnv(projectSettings?.env);
  const systemEnv = collectAnngEnv(processEnv);
  const src: ResolutionSources = { systemEnv, projectSettings, projectEnv, userSettings, userEnv };

  const env = { ...userEnv, ...projectEnv, ...systemEnv };
  const model = firstString(src, "MODEL", "model", defaults.model);
  const geminiApiKey =
    firstString(src, "GEMINI_API_KEY", "geminiApiKey") ||
    syncGeminiKeys(process.cwd(), { importDownloads: "bootstrap" }) ||
    undefined;
  const geminiBaseURL = firstString(src, "GEMINI_BASE_URL", "geminiBaseURL") || undefined;
  const rawApiKey = trimString(env.API_KEY) || undefined;
  const rawBaseURL = trimString(env.BASE_URL) || defaults.baseURL;

  const isGemini = model.toLowerCase().startsWith("gemini") || model.toLowerCase().startsWith("gemma");
  const isCustomBaseURL = rawBaseURL !== defaults.baseURL;
  const provider = firstString(src, "PROVIDER", "provider") || (isGemini ? "gemini" : "deepseek");

  return {
    env,
    apiKey: isGemini ? geminiApiKey || rawApiKey : rawApiKey,
    baseURL: isGemini
      ? geminiBaseURL ||
        (isCustomBaseURL ? rawBaseURL : undefined) ||
        "https://generativelanguage.googleapis.com/v1beta/openai/"
      : rawBaseURL,
    model,
    temperature: firstTemperature(src, "TEMPERATURE", "temperature"),
    thinkingEnabled: firstBoolean(src, "THINKING_ENABLED", "thinkingEnabled", defaultsToThinkingMode(model)),
    reasoningEffort: firstReasoning(src, "REASONING_EFFORT", "reasoningEffort", "max"),
    debugLogEnabled: firstBoolean(src, "DEBUG_LOG_ENABLED", "debugLogEnabled", false),
    telemetryEnabled: firstBoolean(src, "TELEMETRY_ENABLED", "telemetryEnabled", false),
    notify: firstString(src, "NOTIFY", "notify") || undefined,
    webSearchTool: firstString(src, "WEB_SEARCH_TOOL", "webSearchTool") || undefined,
    autoLinter: firstString(src, "AUTO_LINTER", "autoLinter") || undefined,
    mcpServers: mergeMcpServers(userSettings, projectSettings, userEnv, projectEnv, systemEnv),
    permissions: mergePermissions(userSettings, projectSettings),
    enabledSkills: mergeEnabledSkills(userSettings, projectSettings),
    autoAccept: firstBoolean(src, "AUTO_ACCEPT", "autoAccept", false),
    planMode: firstBoolean(src, "PLAN_MODE", "planMode", false),
    maxTurns: firstInteger(src, "MAX_TURNS", "maxTurns", DEFAULT_MAX_TURNS),
    headlessPrompt: undefined,
    fullPowerMode: firstBoolean(src, "FULL_POWER_MODE", "fullPowerMode", false),
    geminiApiKey,
    geminiBaseURL,
    provider,
  };
}

export function resolveSettings(
  settings: DeepcodingSettings | null | undefined,
  defaults: { model: string; baseURL: string },
  processEnv: SettingsProcessEnv = process.env
): ResolvedDeepcodingSettings {
  return resolveSettingsSources(settings, null, defaults, processEnv);
}

export function modelConfigKey(config: Pick<ModelConfigSelection, "thinkingEnabled" | "reasoningEffort">): string {
  return config.thinkingEnabled ? `thinking:${config.reasoningEffort}` : "thinking:none";
}

export function applyModelConfigSelection(
  settings: DeepcodingSettings | null | undefined,
  current: ModelConfigSelection,
  selected: ModelConfigSelection
): { settings: DeepcodingSettings; changed: boolean } {
  const changed = selected.model !== current.model || modelConfigKey(selected) !== modelConfigKey(current);
  const next: DeepcodingSettings = { ...(settings ?? {}) };

  if (!changed) {
    return { settings: next, changed: false };
  }

  if (selected.model !== current.model) {
    next.model = selected.model;
  }

  next.thinkingEnabled = selected.thinkingEnabled;
  if (selected.thinkingEnabled) {
    next.reasoningEffort = selected.reasoningEffort;
  }

  return { settings: next, changed: true };
}

// ---------------------------------------------------------------------------
// Settings file I/O
// ---------------------------------------------------------------------------

export function getUserSettingsPath(): string {
  return path.join(os.homedir(), ".anng", "settings.json");
}

export function getProjectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, ".anng", "settings.json");
}

export function readSettingsFile(settingsPath: string): DeepcodingSettings | null {
  try {
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const raw = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(raw) as DeepcodingSettings;
  } catch {
    return null;
  }
}

export function readSettings(): DeepcodingSettings | null {
  return readSettingsFile(getUserSettingsPath());
}

export function readProjectSettings(projectRoot: string = process.cwd()): DeepcodingSettings | null {
  return readSettingsFile(getProjectSettingsPath(projectRoot));
}

function writeSettingsFile(settingsPath: string, settings: DeepcodingSettings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export function writeSettings(settings: DeepcodingSettings): void {
  const settingsPath = getUserSettingsPath();
  writeSettingsFile(settingsPath, settings);
}

export function writeProjectSettings(settings: DeepcodingSettings, projectRoot: string = process.cwd()): void {
  const settingsPath = getProjectSettingsPath(projectRoot);
  writeSettingsFile(settingsPath, settings);
}

export function writeModelConfigSelection(
  selection: ModelConfigSelection,
  current: ModelConfigSelection = resolveCurrentSettings(),
  projectRoot: string = process.cwd()
): { changed: boolean; settings: DeepcodingSettings } {
  const projectSettingsPath = getProjectSettingsPath(projectRoot);
  const shouldWriteProjectSettings = fs.existsSync(projectSettingsPath);
  const rawSettings = shouldWriteProjectSettings ? readProjectSettings(projectRoot) : readSettings();
  const result = applyModelConfigSelection(rawSettings, current, selection);
  if (result.changed) {
    if (shouldWriteProjectSettings) {
      writeProjectSettings(result.settings, projectRoot);
    } else {
      writeSettings(result.settings);
    }
  }
  return result;
}

export function resolveCurrentSettings(projectRoot: string = process.cwd()): ResolvedDeepcodingSettings {
  return resolveSettingsSources(
    readSettings(),
    readProjectSettings(projectRoot),
    {
      model: DEFAULT_MODEL,
      baseURL: DEFAULT_BASE_URL,
    },
    process.env
  );
}
