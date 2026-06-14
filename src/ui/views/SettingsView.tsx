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

type SettingsScope = "project" | "user";
type Screen = "main" | "models" | "proxyModels" | "baseUrls" | "envVars";
type InputPrompt = null | "customModel" | "customProxyModel" | "customBaseUrl" | "customEnvVar" | "editEnvVar";

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

  // Separate active indices for different screens to preserve scroll position
  const [indices, setIndices] = useState<Record<Screen, number>>({
    main: 0,
    models: 0,
    proxyModels: 0,
    baseUrls: 0,
    envVars: 0,
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
        label: `Configuration Scope: ${scope.toUpperCase()}`,
        description: "Press Enter to toggle Project/User scope",
      },
      {
        key: "model",
        label: "Main Model",
        description: `Current: ${activeSettings.model || "(Not set)"} | Effective: ${resolved.model}`,
      },
      {
        key: "proxyModel",
        label: "Proxy Model",
        description: `Current: ${activeSettings.proxyModel || "(Not set)"} | Effective: ${resolved.proxyModel || "deepseek-v4-flash-free"}`,
      },
      {
        key: "baseUrl",
        label: "Base URL (OpenAI-compatible)",
        description: `Current: ${activeSettings.env?.BASE_URL || "(Not set)"} | Effective: ${resolved.baseURL}`,
      },
      {
        key: "envVars",
        label: "Environment Variables (API Keys)",
        description: `${Object.keys(activeSettings.env || {}).length} variables set in this scope`,
      },
      {
        key: "thinking",
        label: `Thinking Mode: ${activeSettings.thinkingEnabled ?? "(Not set)"}`,
        description: `Effective: ${resolved.thinkingEnabled ? "Enabled" : "Disabled"} (Press Enter to toggle)`,
      },
      {
        key: "effort",
        label: `Reasoning Effort: ${activeSettings.reasoningEffort ?? "(Not set)"}`,
        description: `Effective: ${resolved.reasoningEffort} (Press Enter to toggle)`,
      },
    ],
    [activeSettings, resolved, scope]
  );

  const modelItems: DropdownMenuItem[] = useMemo(() => {
    const items: DropdownMenuItem[] = MODEL_COMMAND_MODELS.map((m) => ({
      key: m,
      label: m,
      selected: activeSettings.model === m || (!activeSettings.model && resolved.model === m),
    }));

    // Add custom models if they aren't in the standard list
    if (activeSettings.model && !(MODEL_COMMAND_MODELS as readonly string[]).includes(activeSettings.model)) {
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
  }, [activeSettings.model, resolved.model]);

  const proxyModelItems: DropdownMenuItem[] = useMemo(() => {
    const items: DropdownMenuItem[] = MODEL_COMMAND_MODELS.map((m) => ({
      key: m,
      label: m,
      selected: activeSettings.proxyModel === m || (!activeSettings.proxyModel && resolved.proxyModel === m),
    }));

    if (activeSettings.proxyModel && !(MODEL_COMMAND_MODELS as readonly string[]).includes(activeSettings.proxyModel)) {
      items.unshift({
        key: activeSettings.proxyModel,
        label: activeSettings.proxyModel,
        selected: true,
      });
    }

    items.push({
      key: "add_custom",
      label: "+ Add Custom Proxy Model...",
      description: "Type a new proxy model name",
    });

    items.push({
      key: "clear",
      label: "✖ Clear Proxy Model Setting",
      description: "Remove proxy model setting from this scope",
    });

    return items;
  }, [activeSettings.proxyModel, resolved.proxyModel]);

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
    const items = keys.map((k) => ({
      key: k,
      label: k,
      description: `Value: ${activeSettings.env![k]} (Press Delete to remove)`,
    }));

    items.push({
      key: "add_custom",
      label: "+ Add New Environment Variable...",
      description: "e.g. API_KEY, ANTHROPIC_API_KEY",
    });

    return items;
  }, [activeSettings.env]);

  const currentItems =
    screen === "main"
      ? mainItems
      : screen === "models"
        ? modelItems
        : screen === "proxyModels"
          ? proxyModelItems
          : screen === "baseUrls"
            ? baseUrlItems
            : envVarItems;

  const currentTitle =
    screen === "main"
      ? "Settings Overview"
      : screen === "models"
        ? "Select Main Model"
        : screen === "proxyModels"
          ? "Select Proxy Model"
          : screen === "baseUrls"
            ? "Select Base URL"
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
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        newSettings.env = { ...(newSettings.env || {}) };

        if (inputPrompt === "customModel" && inputBuffer.trim()) {
          newSettings.model = inputBuffer.trim();
          saveConfig(newSettings);
        } else if (inputPrompt === "customProxyModel" && inputBuffer.trim()) {
          newSettings.proxyModel = inputBuffer.trim();
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

    // 3. Handle item deletion (only in envVars)
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

    // 4. Handle item selection
    if ((input === " " && !key.ctrl && !key.meta) || (key.return && !key.shift && !key.meta)) {
      const item = currentItems[activeIndex];
      if (!item) return;

      if (screen === "main") {
        if (item.key === "scope") setScope((s) => (s === "project" ? "user" : "project"));
        else if (item.key === "model") setScreen("models");
        else if (item.key === "proxyModel") setScreen("proxyModels");
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
        }
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
          newSettings.model = item.key;
          saveConfig(newSettings);
          setScreen("main");
        }
        return;
      }

      if (screen === "proxyModels") {
        const newSettings = scope === "project" ? { ...projectSettings } : { ...userSettings };
        if (item.key === "add_custom") {
          setInputPrompt("customProxyModel");
          setInputBuffer("");
        } else if (item.key === "clear") {
          delete newSettings.proxyModel;
          saveConfig(newSettings);
          setScreen("main");
        } else {
          newSettings.proxyModel = item.key;
          saveConfig(newSettings);
          setScreen("main");
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
            {inputPrompt === "customModel"
              ? "Enter Custom Main Model Name:"
              : inputPrompt === "customProxyModel"
                ? "Enter Custom Proxy Model Name:"
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
    </Box>
  );
}
