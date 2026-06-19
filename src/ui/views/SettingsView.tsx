import React, { useState, useMemo } from "react";
import { Box, Text } from "ink";
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

type SettingsScope = "project" | "user";
type Screen = "main" | "models" | "baseUrls" | "envVars" | "providers" | "modelRegistry";
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

export function SettingsView({ projectRoot, onExit }: { projectRoot: string; onExit: () => void }) {
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

  // --- Screen Definitions ---

  const mainItems: DropdownMenuItem[] = useMemo(
    () => [
      {
        key: "scope",
        label: `Settings Scope: ${scope === "project" ? "Project-Specific" : "Global"}`,
        description: "Press Enter to toggle between Project-Specific and Global settings",
      },
      {
        key: "model",
        label: "AI Model",
        description: `Configured: ${activeSettings.model || "None"} | Active: ${resolved.model}`,
      },
      {
        key: "baseUrl",
        label: "API Base URL",
        description: `Configured: ${activeSettings.env?.BASE_URL || "None"} | Active: ${resolved.baseURL}`,
      },
      {
        key: "envVars",
        label: "Environment Variables (API Keys)",
        description: `${Object.keys(activeSettings.env || {}).length} variables set in this scope`,
      },
      {
        key: "thinking",
        label: `Thinking Mode: ${activeSettings.thinkingEnabled === undefined ? "Inherited" : activeSettings.thinkingEnabled ? "Enabled" : "Disabled"}`,
        description: `Currently Active: ${resolved.thinkingEnabled ? "Enabled" : "Disabled"} (Press Enter to toggle)`,
      },
      {
        key: "effort",
        label: `Reasoning Effort: ${activeSettings.reasoningEffort ?? "Inherited"}`,
        description: `Currently Active: ${resolved.reasoningEffort} (Press Enter to toggle)`,
      },
      {
        key: "providers",
        label: "Providers",
        description: `${providers.length} providers configured (API Keys + Base URLs)`,
      },
      {
        key: "modelRegistry",
        label: "Models Registry",
        description: `${models.length} models registered`,
      },
    ],
    [activeSettings, resolved, scope, providers.length, models.length]
  );

  const modelItems: DropdownMenuItem[] = useMemo(() => {
    // Merge predefined + registry models (dedup, preserve order)
    const registryNames = models.map((m) => m.name);
    const allModelNames: string[] = [...new Set([...MODEL_COMMAND_MODELS, ...registryNames])];

    const items: DropdownMenuItem[] = allModelNames.map((m) => ({
      key: m,
      label: m,
      selected: activeSettings.model === m || (!activeSettings.model && resolved.model === m),
    }));

    // Add current model at top if it's custom (not in any list)
    if (activeSettings.model && !allModelNames.includes(activeSettings.model)) {
      items.unshift({
        key: activeSettings.model,
        label: activeSettings.model,
        selected: true,
      });
    }

    items.push({
      key: "add_custom",
      label: "+ Add Custom Model...",
      description: "Type a new model name",
    });

    items.push({
      key: "clear",
      label: "✖ Clear Model Setting",
      description: "Remove model setting from this scope",
    });

    return items;
  }, [activeSettings.model, resolved.model, models]);

  const baseUrlItems: DropdownMenuItem[] = useMemo(() => {
    const currentUrl = activeSettings.env?.BASE_URL;
    const items: DropdownMenuItem[] = COMMON_BASE_URLS.map((b) => ({
      key: b.url,
      label: `${b.label} (${b.url})`,
      selected: currentUrl === b.url,
    }));

    if (currentUrl && !COMMON_BASE_URLS.some((b) => b.url === currentUrl)) {
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
  }, [activeSettings.env?.BASE_URL]);

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
      label: m.name,
      description: m.tested ? "✅ tested" : "❌ untested",
    }));
    items.push({
      key: "add_model",
      label: "+ Add Model",
      description: "Register a new model name",
    });
    return items;
  }, [models]);

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
            const newModels = [...models, { name, tested: false }];
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
        const allProviders = loadProviders(projectRoot);
        const provider = allProviders.length > 0 ? allProviders[0] : null;
        if (!provider || !provider.apiKey) {
          setTestResult(`❌ ${modelName}: No provider configured`);
          setTimeout(() => setTestResult(null), 4000);
          return;
        }
        setTestResult(`⏳ Testing ${modelName} with ${provider.id}...`);
        import("openai")
          .then(({ default: OpenAI }) => {
            const client = new OpenAI({
              apiKey: provider.apiKey,
              baseURL: provider.baseURL,
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
            setTestResult(`✅ ${modelName} with ${provider.id}: OK`);
            setTimeout(() => setTestResult(null), 5000);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            setTestResult(`❌ ${modelName} with ${provider.id}: ${msg}`);
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
        else if (item.key === "model") setScreen("models");
        else if (item.key === "baseUrl") setScreen("baseUrls");
        else if (item.key === "envVars") setScreen("envVars");
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
          // After picking model, switch to provider picker
          setPickProviderForModel(item.key);
          setScreen("providers");
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
          delete newSettings.env.BASE_URL;
          saveConfig(newSettings);
          setScreen("main");
        } else {
          newSettings.env.BASE_URL = item.key;
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
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={80}>
      <Text bold color={primaryColor}>
        ⚙ Settings ({scope === "project" ? "Project" : "User"} Scope)
      </Text>

      {!inputPrompt ? (
        <DropdownMenu
          width={76}
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
          maxVisible={8}
        />
      ) : (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
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
          <Text>{inputBuffer}█</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to save, Esc to cancel</Text>
          </Box>
        </Box>
      )}

      {testResult ? (
        <Box marginTop={1} paddingX={1}>
          <Text color="green">{testResult}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
