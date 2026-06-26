import React, { useState, useMemo } from "react";
import { Box, Text, useWindowSize } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";
import DropdownMenu, { type DropdownMenuItem } from "../components/DropdownMenu";
import { MODEL_COMMAND_MODELS } from "../components/ModelsDropdown";
import {
  resolveCurrentSettings,
  writeSettings,
  writeProjectSettings,
  readSettings,
  readProjectSettings,
  type DeepcodingSettings,
  type ResolvedDeepcodingSettings,
} from "../../settings";
import {
  loadProviders,
  saveProviders,
  loadModels,
  saveModels,
  type Provider,
  type ModelEntry,
} from "../../team/provider-types";
// Re-export from the combined file
export type { Provider, ModelEntry } from "../../team/provider-types";
import { getProviderConfig, isGeminiModel } from "../../common/openai-client";
import { syncGeminiKeys } from "../../common/gemini-keys-sync";

type SettingsScope = "project" | "user";
type Screen =
  | "main"
  | "models"
  | "baseUrls"
  | "envVars"
  | "providers"
  | "modelRegistry"
  | "providerSelect"
  | "geminiKeys";
type InputPrompt =
  | null
  | "customModel"
  | "customBaseUrl"
  | "customEnvVar"
  | "editEnvVar"
  | "customProvider"
  | "customProviderName"
  | "customProviderApiKey"
  | "customProviderBaseUrl"
  | "customModelName";

const COMMON_BASE_URLS = [
  { label: "DeepSeek", url: "https://api.deepseek.com" },
  { label: "OpenAI", url: "https://api.openai.com/v1" },
  { label: "Groq", url: "https://api.groq.com/openai/v1" },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/" },
];

function buildDivider(width: number): string {
  return "─".repeat(Math.max(12, width));
}

function truncateValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const head = Math.max(8, Math.floor((maxLength - 1) / 2));
  const tail = Math.max(6, maxLength - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function SettingsView({ projectRoot, onExit }: { projectRoot: string; onExit: () => void }) {
  const { columns, rows } = useWindowSize();
  const [resolved, setResolved] = useState<ResolvedDeepcodingSettings>(() => resolveCurrentSettings(projectRoot));
  const [projectSettings, setProjectSettings] = useState<DeepcodingSettings>(
    () => readProjectSettings(projectRoot) || {}
  );
  const [userSettings, setUserSettings] = useState<DeepcodingSettings>(() => readSettings() || {});

  const [scope, setScope] = useState<SettingsScope>("project");
  const [screen, setScreen] = useState<Screen>("main");
  const [inputPrompt, setInputPrompt] = useState<InputPrompt>(null);
  const [inputBuffer, setInputBuffer] = useState("");
  const [editingEnvKey, setEditingEnvKey] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>(() => {
    return loadProviders(projectRoot);
  });
  const [models, setModels] = useState<ModelEntry[]>(() => loadModels(projectRoot));
  const [testResult, setTestResult] = useState<string | null>(null);
  const [pickProviderForModel, setPickProviderForModel] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<Partial<Provider> | null>(null);

  // Separate active indices for different screens to preserve scroll position
  const [indices, setIndices] = useState<Record<Screen, number>>({
    main: 0,
    models: 0,
    baseUrls: 0,
    envVars: 0,
    providers: 0,
    modelRegistry: 0,
    providerSelect: 0,
    geminiKeys: 0,
  });

  const activeIndex = indices[screen];
  const setActiveIndex = (idx: number | ((prev: number) => number)) => {
    setIndices((prev) => ({
      ...prev,
      [screen]: typeof idx === "function" ? idx(prev[screen]) : idx,
    }));
  };

  const saveConfig = (newSettings: DeepcodingSettings) => {
    if (scope === "project") {
      writeProjectSettings(newSettings, projectRoot);
      setProjectSettings(newSettings);
    } else {
      writeSettings(newSettings);
      setUserSettings(newSettings);
    }
    setResolved(resolveCurrentSettings(projectRoot));
  };

  const activeSettings = scope === "project" ? projectSettings : userSettings;
  const panelWidth = Math.max(20, Math.min(columns, 124));
  const contentWidth = Math.max(18, panelWidth - 4);
  const compactLayout = panelWidth < 92;
  const menuVisibleItems = Math.max(6, Math.min(12, rows - 12));
  const statusColor = testResult?.startsWith("✅")
    ? "green"
    : testResult?.startsWith("❌")
      ? "red"
      : testResult
        ? "yellow"
        : undefined;
  const modelLabel = truncateValue(resolved.model, Math.max(18, Math.floor(contentWidth * 0.32)));
  const baseUrlLabel = truncateValue(resolved.baseURL, Math.max(22, Math.floor(contentWidth * 0.42)));

  // --- Screen Definitions ---

  const geminiKeys: string[] = useMemo(() => {
    const keysStr = syncGeminiKeys(projectRoot, { importDownloads: "never" });
    return keysStr.split(",").filter((k) => k.length > 0);
  }, [projectRoot]);

  // --- Screen Definitions ---

  const mainItems: DropdownMenuItem[] = useMemo(() => {
    const isGemini = resolved.provider === "gemini";
    const items: DropdownMenuItem[] = [
      {
        key: "scope",
        label: `Settings Scope: ${scope === "project" ? "Project-Specific" : "Global"}`,
        description: "Press Enter to toggle between Project-Specific and Global settings",
      },
      {
        key: "provider",
        label: `Active Provider: ${resolved.provider === "gemini" ? "Gemini (Google)" : resolved.provider === "deepseek" ? "DeepSeek" : resolved.provider}`,
        description: "Press Enter to change the active provider",
      },
    ];

    if (isGemini) {
      const currentGeminiKey = activeSettings.geminiApiKey || resolved.geminiApiKey || "";
      const displayKey = currentGeminiKey.includes(",")
        ? `Rotation active (${currentGeminiKey.split(",").length} keys)`
        : currentGeminiKey
          ? `${currentGeminiKey.slice(0, 6)}...`
          : "None (will load from ~/.anng/gemini_keys.txt)";
      items.push(
        {
          key: "geminiApiKeyList",
          label: "Active API Key",
          description: `Configured: ${displayKey} | Press Enter to select key from list`,
        },
        {
          key: "model",
          label: "AI Model (Gemini)",
          description: `Configured: ${activeSettings.model || "None"} | Active: ${resolved.model}`,
        },
        {
          key: "baseUrl",
          label: "API Base URL (Gemini)",
          description: `Configured: ${activeSettings.env?.BASE_URL || activeSettings.geminiBaseURL || "None"} | Active: ${resolved.baseURL}`,
        }
      );
    } else {
      const currentApiKey = activeSettings.env?.API_KEY || resolved.apiKey || "";
      const displayKey = currentApiKey ? `${currentApiKey.slice(0, 6)}...` : "None";
      items.push(
        {
          key: "apiKey",
          label: "API Key (DeepSeek)",
          description: `Configured: ${displayKey} | Press Enter to set DeepSeek API key`,
        },
        {
          key: "model",
          label: "AI Model (DeepSeek)",
          description: `Configured: ${activeSettings.model || "None"} | Active: ${resolved.model}`,
        },
        {
          key: "baseUrl",
          label: "API Base URL (DeepSeek)",
          description: `Configured: ${activeSettings.env?.BASE_URL || "None"} | Active: ${resolved.baseURL}`,
        }
      );
    }

    items.push(
      {
        key: "thinking",
        label: `Thinking Mode: ${activeSettings.thinkingEnabled === undefined ? "Inherited" : activeSettings.thinkingEnabled ? "Enabled" : "Disabled"}`,
        description: `Currently Active: ${resolved.thinkingEnabled ? "Enabled" : "Disabled"} (Press Enter to toggle)`,
      },
      {
        key: "effort",
        label: `Reasoning Effort: ${activeSettings.reasoningEffort ?? "Inherited"}`,
        description: `Currently Active: ${resolved.reasoningEffort} (Press Enter to toggle)`,
      }
    );

    return items;
  }, [activeSettings, resolved, scope]);

  const modelItems: DropdownMenuItem[] = useMemo(() => {
    const activeProvider = resolved.provider || "deepseek";
    const providerModels = models.filter((m) => m.providerId === activeProvider);
    const registryNames = providerModels.map((m) => m.name);

    const isGemini = activeProvider === "gemini";
    const defaultModels = MODEL_COMMAND_MODELS.filter((m) => {
      const lower = m.toLowerCase();
      const modelIsGemini = lower.startsWith("gemini") || lower.startsWith("gemma");
      return isGemini ? modelIsGemini : !modelIsGemini;
    });

    const allModelNames: string[] = [...new Set([...defaultModels, ...registryNames])];

    const items: DropdownMenuItem[] = allModelNames.map((m) => ({
      key: m,
      label: m,
      selected: activeSettings.model === m || (!activeSettings.model && resolved.model === m),
    }));

    if (activeSettings.model && !allModelNames.includes(activeSettings.model)) {
      items.unshift({
        key: activeSettings.model,
        label: activeSettings.model,
        selected: true,
      });
    }

    items.push({
      key: "add_custom",
      label: "+ Register Custom Model for this Provider...",
      description: "Register a new model name under this provider",
    });

    items.push({
      key: "clear",
      label: "✖ Clear Model Setting",
      description: "Remove model setting from this scope",
    });

    return items;
  }, [activeSettings.model, resolved.model, resolved.provider, models]);

  const baseUrlItems: DropdownMenuItem[] = useMemo(() => {
    const isGemini = resolved.provider === "gemini";
    const currentUrl = isGemini ? activeSettings.geminiBaseURL || "" : activeSettings.env?.BASE_URL || "";

    const filteredUrls = isGemini
      ? COMMON_BASE_URLS.filter((b) => b.label.toLowerCase() === "gemini")
      : COMMON_BASE_URLS.filter((b) => b.label.toLowerCase() !== "gemini");

    const items: DropdownMenuItem[] = filteredUrls.map((b) => ({
      key: b.url,
      label: `${b.label} (${b.url})`,
      selected: currentUrl === b.url,
    }));

    if (currentUrl && !filteredUrls.some((b) => b.url === currentUrl)) {
      items.unshift({
        key: currentUrl,
        label: `Custom (${currentUrl})`,
        selected: true,
      });
    }

    items.push({
      key: "add_custom",
      label: "+ Add Custom Base URL...",
      description: "Type a new base URL",
    });

    items.push({
      key: "clear",
      label: "✖ Clear Base URL Setting",
      description: "Remove base URL setting from this scope",
    });

    return items;
  }, [activeSettings.env?.BASE_URL, activeSettings.geminiBaseURL, resolved.provider]);

  const envVarItems: DropdownMenuItem[] = useMemo(() => {
    const keys = Object.keys(activeSettings.env || {}).sort();
    const items = keys.map((k) => {
      const val = activeSettings.env![k] ?? "";
      const isSecret =
        k.toLowerCase().includes("key") || k.toLowerCase().includes("token") || k.toLowerCase().includes("secret");
      const displayVal = isSecret ? "***" : val;
      return {
        key: k,
        label: k,
        description: `Value: ${displayVal} (Press Delete to remove)`,
      };
    });

    items.push({
      key: "add_custom",
      label: "+ Add New Environment Variable...",
      description: "e.g. API_KEY, ANTHROPIC_API_KEY",
    });

    return items;
  }, [activeSettings.env]);

  const providersItems: DropdownMenuItem[] = useMemo(() => {
    const items: DropdownMenuItem[] = providers.map((p) => ({
      key: p.id,
      label: `${p.name} (${p.id})`,
      description: `API: *** @ ${p.baseURL.length > 40 ? p.baseURL.slice(0, 38) + "…" : p.baseURL}`,
    }));
    items.push({
      key: "add_provider",
      label: "+ Add Provider",
      description: "Add a new API provider (id, name, apiKey, baseURL)",
    });
    return items;
  }, [providers]);

  const modelRegistryItems: DropdownMenuItem[] = useMemo(() => {
    const items: DropdownMenuItem[] = models.map((m) => ({
      key: m.name,
      label: `${m.name} [${m.providerId}]`,
      description: m.tested ? "✅ tested" : "❌ untested",
    }));
    items.push({
      key: "add_model",
      label: "+ Add Model",
      description: "Register a new model name",
    });
    return items;
  }, [models]);

  const providerSelectionItems: DropdownMenuItem[] = useMemo(() => {
    const list = [
      { key: "gemini", label: "Gemini (Google)", selected: resolved.provider === "gemini" },
      { key: "deepseek", label: "DeepSeek", selected: resolved.provider === "deepseek" },
    ];
    for (const p of providers) {
      if (p.id !== "gemini" && p.id !== "deepseek") {
        list.push({
          key: p.id,
          label: `${p.name} (${p.id})`,
          selected: resolved.provider === p.id,
        });
      }
    }
    return list;
  }, [resolved.provider, providers]);

  const geminiApiKeyItems: DropdownMenuItem[] = useMemo(() => {
    const items: DropdownMenuItem[] = geminiKeys.map((key, idx) => {
      const masked = `${key.slice(0, 6)}...${key.slice(-4)}`;
      const isSelected = activeSettings.geminiApiKey === key;
      return {
        key: key,
        label: `Key #${idx + 1}: ${masked}`,
        selected: isSelected,
      };
    });

    items.push({
      key: "rotate_all",
      label: "🔄 Rotate all synced keys (Round-robin)",
      selected: !activeSettings.geminiApiKey,
      description: `Use all ${geminiKeys.length} keys in rotation`,
    });

    return items;
  }, [geminiKeys, activeSettings.geminiApiKey]);

  const currentItems =
    screen === "main"
      ? mainItems
      : screen === "models"
        ? modelItems
        : screen === "baseUrls"
          ? baseUrlItems
          : screen === "envVars"
            ? envVarItems
            : screen === "providers"
              ? providersItems
              : screen === "modelRegistry"
                ? modelRegistryItems
                : screen === "providerSelect"
                  ? providerSelectionItems
                  : screen === "geminiKeys"
                    ? geminiApiKeyItems
                    : envVarItems;

  const currentTitle =
    screen === "main"
      ? "Settings Overview"
      : screen === "models"
        ? "Select Main Model"
        : screen === "baseUrls"
          ? "Select Base URL"
          : screen === "envVars"
            ? "Environment Variables"
            : screen === "providers"
              ? "API Providers"
              : screen === "modelRegistry"
                ? "Models Registry"
                : screen === "providerSelect"
                  ? "Select Provider"
                  : screen === "geminiKeys"
                    ? "Select Gemini API Key"
                    : "Environment Variables";

  // --- Input Handling ---

  useTerminalInput((input, key) => {
    // 1. Handle text input prompts
    if (inputPrompt) {
      if (key.escape) {
        setInputPrompt(null);
        return;
      }
      if (key.return) {
        // --- Multi-step add provider ---
        if (
          inputPrompt === "customProvider" ||
          inputPrompt === "customProviderName" ||
          inputPrompt === "customProviderApiKey" ||
          inputPrompt === "customProviderBaseUrl"
        ) {
          const val = inputBuffer.trim() || "";
          if (inputPrompt === "customProvider") {
            setPendingProvider({ id: val || `p${providers.length + 1}` });
            setInputPrompt("customProviderName");
            setInputBuffer(
              val ? `${val.charAt(0).toUpperCase() + val.slice(1)} Key` : `Provider ${providers.length + 1}`
            );
          } else if (inputPrompt === "customProviderName") {
            setPendingProvider((prev) => ({ ...prev, name: val || prev?.id || `Provider ${providers.length + 1}` }));
            setInputPrompt("customProviderApiKey");
            setInputBuffer("");
          } else if (inputPrompt === "customProviderApiKey") {
            setPendingProvider((prev) => ({ ...prev, apiKey: val }));
            setInputPrompt("customProviderBaseUrl");
            setInputBuffer("https://opencode.ai/zen/v1");
          } else if (inputPrompt === "customProviderBaseUrl") {
            const complete: Provider = {
              id: pendingProvider?.id || `p${providers.length + 1}`,
              name: pendingProvider?.name || `Provider ${providers.length + 1}`,
              apiKey: pendingProvider?.apiKey || "",
              baseURL: val || "https://opencode.ai/zen/v1",
            };
            // If provider already exists, UPDATE it; otherwise ADD it
            const existingIdx = providers.findIndex((p) => p.id === complete.id);
            const newProviders =
              existingIdx >= 0 ? providers.map((p, i) => (i === existingIdx ? complete : p)) : [...providers, complete];
            setProviders(newProviders);
            saveProviders(projectRoot, newProviders);
            // After saving new provider, if in pick mode, auto-select it
            if (pickProviderForModel) {
              const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
              newSettings.model = pickProviderForModel;
              newSettings.env = { ...(newSettings.env || {}), API_KEY: complete.apiKey, BASE_URL: complete.baseURL };
              saveConfig(newSettings);
              setPickProviderForModel(null);
              setScreen("main");
            }
            setInputPrompt(null);
            setPendingProvider(null);
          }
          return;
        }

        // --- Add model (name only) ---
        if (inputPrompt === "customModelName") {
          const name = inputBuffer.trim();
          if (name) {
            const activeProvider = resolved.provider || "deepseek";
            const newModels = [...models, { name, tested: false, providerId: activeProvider }];
            setModels(newModels);
            saveModels(projectRoot, newModels);
          }
          setInputPrompt(null);
          return;
        }

        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        newSettings.env = { ...(newSettings.env || {}) };

        if (inputPrompt === "customModel" && inputBuffer.trim()) {
          newSettings.model = inputBuffer.trim();
          saveConfig(newSettings);
        } else if (inputPrompt === "customBaseUrl" && inputBuffer.trim()) {
          newSettings.env.BASE_URL = inputBuffer.trim();
          saveConfig(newSettings);
        } else if (inputPrompt === "customEnvVar" && inputBuffer.trim()) {
          const bufferStr = inputBuffer.trim();
          if (bufferStr.includes("=")) {
            const [k, ...vParts] = bufferStr.split("=");
            newSettings.env[k.trim()] = vParts.join("=").trim();
          } else {
            if (/^[A-Z_][A-Z0-9_]*$/.test(bufferStr)) {
              newSettings.env[bufferStr] = "";
            } else {
              newSettings.env["API_KEY"] = bufferStr;
            }
          }
          saveConfig(newSettings);
        } else if (inputPrompt === "editEnvVar" && editingEnvKey) {
          newSettings.env[editingEnvKey] = inputBuffer.trim();
          saveConfig(newSettings);
        }

        setInputPrompt(null);
        setEditingEnvKey(null);
        return;
      }
      if (key.backspace || key.delete) {
        setInputBuffer((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && !input.startsWith("\x1b")) {
        setInputBuffer((s) => s + input.replace(/\r/g, ""));
      }
      return;
    }

    // 2. Handle menu navigation
    if (key.escape) {
      if (screen === "main") {
        onExit();
      } else {
        setScreen("main");
        // Clear provider-pick mode when canceling provider selection
        if (pickProviderForModel) {
          setPickProviderForModel(null);
        }
      }
      return;
    }

    if (key.upArrow) {
      setActiveIndex((idx) => (idx - 1 + currentItems.length) % currentItems.length);
      return;
    }
    if (key.downArrow) {
      setActiveIndex((idx) => (idx + 1) % currentItems.length);
      return;
    }

    // 3. Handle item deletion (envVars, providers, modelRegistry) and test (modelRegistry)
    if (screen === "envVars" && (key.delete || input === "d" || input === "D")) {
      const item = currentItems[activeIndex];
      if (item && item.key !== "add_custom") {
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        newSettings.env = { ...(newSettings.env || {}) };
        delete newSettings.env[item.key];
        saveConfig(newSettings);
        if (activeIndex >= currentItems.length - 1) {
          setActiveIndex(Math.max(0, currentItems.length - 2));
        }
      }
      return;
    }

    if (screen === "providers" && (key.delete || input === "d" || input === "D")) {
      const item = currentItems[activeIndex];
      if (item && item.key !== "add_provider") {
        const newProviders = providers.filter((p) => p.id !== item.key);
        setProviders(newProviders);
        saveProviders(projectRoot, newProviders);
        if (activeIndex >= currentItems.length - 1) {
          setActiveIndex(Math.max(0, currentItems.length - 2));
        }
      }
      return;
    }

    if (screen === "modelRegistry" && (key.delete || input === "d" || input === "D")) {
      const item = currentItems[activeIndex];
      if (item && item.key !== "add_model") {
        const newModels = models.filter((m) => m.name !== item.key);
        setModels(newModels);
        saveModels(projectRoot, newModels);
        if (activeIndex >= currentItems.length - 1) {
          setActiveIndex(Math.max(0, currentItems.length - 2));
        }
      }
      return;
    }

    if (screen === "modelRegistry" && (input === "t" || input === "T")) {
      const item = currentItems[activeIndex];
      if (item && item.key !== "add_model") {
        const modelName = item.key;
        const testedSettings = { ...resolved, model: modelName };
        const providerConfig = getProviderConfig(testedSettings);
        if (!providerConfig.apiKey) {
          setTestResult(`❌ ${modelName}: No API key configured`);
          setTimeout(() => setTestResult(null), 4000);
          return;
        }
        const isGemini = isGeminiModel(modelName);
        const displayName = isGemini
          ? "Google API"
          : providerConfig.baseURL.includes("deepseek")
            ? "DeepSeek"
            : "Provider";
        setTestResult(`⏳ Testing ${modelName} with ${displayName}...`);
        import("openai")
          .then(({ default: OpenAI }) => {
            const client = new OpenAI({
              apiKey: providerConfig.apiKey,
              baseURL: providerConfig.baseURL,
              dangerouslyAllowBrowser: true,
            });
            return client.chat.completions.create({
              model: modelName,
              messages: [{ role: "user", content: "Respond with just the word OK" }],
              max_tokens: 10,
            });
          })
          .then(() => {
            const newModels = models.map((m) => (m.name === modelName ? { ...m, tested: true } : m));
            setModels(newModels);
            saveModels(projectRoot, newModels);
            setTestResult(`✅ ${modelName} with ${displayName}: OK`);
            setTimeout(() => setTestResult(null), 5000);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            setTestResult(`❌ ${modelName} with ${displayName}: ${msg}`);
            setTimeout(() => setTestResult(null), 8000);
          });
      }
      return;
    }

    // 4. Handle item selection
    if ((input === " " && !key.ctrl && !key.meta) || (key.return && !key.shift && !key.meta)) {
      const item = currentItems[activeIndex];
      if (!item) return;

      if (screen === "main") {
        if (item.key === "scope") setScope((s) => (s === "project" ? "user" : "project"));
        else if (item.key === "provider") setScreen("providerSelect");
        else if (item.key === "geminiApiKeyList") setScreen("geminiKeys");
        else if (item.key === "apiKey") {
          setEditingEnvKey("API_KEY");
          setInputPrompt("editEnvVar");
          setInputBuffer(activeSettings.env?.API_KEY || "");
        } else if (item.key === "model") setScreen("models");
        else if (item.key === "baseUrl") setScreen("baseUrls");
        else if (item.key === "thinking") {
          const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
          newSettings.thinkingEnabled = !(newSettings.thinkingEnabled ?? resolved.thinkingEnabled);
          saveConfig(newSettings);
        } else if (item.key === "effort") {
          const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
          newSettings.reasoningEffort =
            (newSettings.reasoningEffort ?? resolved.reasoningEffort) === "max" ? "high" : "max";
          saveConfig(newSettings);
        } else if (item.key === "providers") setScreen("providers");
        else if (item.key === "modelRegistry") setScreen("modelRegistry");
        return;
      }

      if (screen === "providerSelect") {
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        newSettings.provider = item.key;
        if (item.key === "gemini") {
          newSettings.model = "gemini-2.5-flash";
        } else if (item.key === "deepseek") {
          newSettings.model = "deepseek-v4-pro";
        } else {
          const providerModels = models.filter((m) => m.providerId === item.key);
          newSettings.model = providerModels.length > 0 ? providerModels[0].name : item.key;
        }
        saveConfig(newSettings);
        setScreen("main");
        return;
      }

      if (screen === "geminiKeys") {
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        if (item.key === "rotate_all") {
          newSettings.geminiApiKey = undefined;
        } else {
          newSettings.geminiApiKey = item.key;
        }
        saveConfig(newSettings);
        setScreen("main");
        return;
      }

      if (screen === "models") {
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        if (item.key === "add_custom") {
          setInputPrompt("customModel");
          setInputBuffer("");
        } else if (item.key === "clear") {
          delete newSettings.model;
          saveConfig(newSettings);
          setScreen("main");
        } else {
          const selectedModel = item.key;
          if (isGeminiModel(selectedModel)) {
            newSettings.model = selectedModel;
            saveConfig(newSettings);
            setScreen("main");
          } else {
            const hasApiKey = !!newSettings.env?.API_KEY;
            if (hasApiKey) {
              newSettings.model = selectedModel;
              saveConfig(newSettings);
              setScreen("main");
            } else {
              setPickProviderForModel(selectedModel);
              setScreen("providers");
            }
          }
        }
        return;
      }

      if (screen === "baseUrls") {
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        newSettings.env = { ...(newSettings.env || {}) };
        if (item.key === "add_custom") {
          setInputPrompt("customBaseUrl");
          setInputBuffer("");
        } else if (item.key === "clear") {
          if (resolved.provider === "gemini") {
            delete newSettings.geminiBaseURL;
          } else {
            delete newSettings.env.BASE_URL;
          }
          saveConfig(newSettings);
          setScreen("main");
        } else {
          if (resolved.provider === "gemini") {
            newSettings.geminiBaseURL = item.key;
          } else {
            newSettings.env.BASE_URL = item.key;
          }
          saveConfig(newSettings);
          setScreen("main");
        }
        return;
      }

      if (screen === "envVars") {
        if (item.key === "add_custom") {
          setInputPrompt("customEnvVar");
          setInputBuffer("");
        } else {
          // Edit existing env var
          setEditingEnvKey(item.key);
          setInputPrompt("editEnvVar");
          setInputBuffer(activeSettings.env?.[item.key] || "");
        }
        return;
      }

      if (screen === "providers") {
        if (item.key === "add_provider") {
          setInputPrompt("customProvider");
          setInputBuffer("");
        } else if (pickProviderForModel) {
          // Pick mode: user chose a model first, now picking provider
          const provider = providers.find((p) => p.id === item.key);
          if (provider) {
            const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
            newSettings.model = pickProviderForModel;
            newSettings.env = { ...(newSettings.env || {}), API_KEY: provider.apiKey, BASE_URL: provider.baseURL };
            saveConfig(newSettings);
            setPickProviderForModel(null);
            setScreen("main");
          }
        } else if (item.key !== "add_provider") {
          // Enter on existing provider → cycle through fields to edit
          // For now, prompt for new apiKey
          setPendingProvider(providers.find((p) => p.id === item.key) ?? null);
          setInputPrompt("customProviderApiKey");
          setInputBuffer(providers.find((p) => p.id === item.key)?.apiKey ?? "");
        }
        return;
      }

      if (screen === "modelRegistry") {
        if (item.key === "add_model") {
          setInputPrompt("customModelName");
          setInputBuffer("");
        }
        return;
      }
    }
  });

  const primaryColor = "#D4704B";

  return (
    <Box flexDirection="column" paddingX={1} width={panelWidth}>
      <Box flexDirection={compactLayout ? "column" : "row"} justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column" flexGrow={1}>
          <Text bold color={primaryColor}>
            Settings
          </Text>
          <Text dimColor>Models, providers, environment variables, and runtime behavior.</Text>
        </Box>
        <Box flexDirection={compactLayout ? "column" : "row"} gap={2}>
          <Text color={primaryColor}>Scope: {scope === "project" ? "Project" : "User"}</Text>
          <Text dimColor>Model: {modelLabel}</Text>
          <Text dimColor>Base URL: {baseUrlLabel}</Text>
        </Box>
      </Box>
      <Text color={primaryColor}>{buildDivider(contentWidth)}</Text>

      {!inputPrompt ? (
        <DropdownMenu
          width={contentWidth}
          title={currentTitle}
          helpText={
            screen === "main"
              ? "Esc to exit"
              : screen === "envVars"
                ? "Enter to add/edit · D to delete · Esc to back"
                : screen === "providers"
                  ? pickProviderForModel
                    ? `Pick a provider for model "${pickProviderForModel}" · Esc to cancel`
                    : "Enter to add · D to delete · Esc to back"
                  : screen === "modelRegistry"
                    ? "Enter to add · D to delete · T to test · Esc to back"
                    : "Enter to select · Esc to back"
          }
          items={currentItems}
          activeIndex={activeIndex}
          activeColor={primaryColor}
          maxVisible={menuVisibleItems}
        />
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={primaryColor}>{buildDivider(contentWidth)}</Text>
          <Text bold color={primaryColor}>
            {inputPrompt === "customProvider"
              ? "Enter Provider ID (e.g., ds1):"
              : inputPrompt === "customProviderName"
                ? "Enter Provider Name (e.g., DeepSeek Key 1):"
                : inputPrompt === "customProviderApiKey"
                  ? pendingProvider?.id
                    ? `Enter API Key for ${pendingProvider.id}:`
                    : "Enter API Key:"
                  : inputPrompt === "customProviderBaseUrl"
                    ? "Enter Base URL (Enter for default):"
                    : inputPrompt === "customModelName"
                      ? "Enter Model Name:"
                      : inputPrompt === "customModel"
                        ? "Enter Custom Main Model Name:"
                        : inputPrompt === "customBaseUrl"
                          ? "Enter Custom Base URL:"
                          : inputPrompt === "customEnvVar"
                            ? "Add Environment Variable (Format: KEY=VALUE):"
                            : `Edit Value for ${editingEnvKey}:`}
          </Text>
          <Box marginTop={1} paddingLeft={2}>
            <Text color={primaryColor}>› </Text>
            <Text wrap="wrap">{inputBuffer}█</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to save, Esc to cancel</Text>
          </Box>
        </Box>
      )}

      {testResult ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={primaryColor}>{buildDivider(contentWidth)}</Text>
          <Text color={statusColor}>{testResult}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
