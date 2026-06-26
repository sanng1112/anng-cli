import React, { useEffect, useMemo, useState } from "react";
import { useInput } from "ink";
import DropdownMenu from "../DropdownMenu";
import { loadModels } from "../../../team/provider-types";
import type { ModelConfigSelection, ReasoningEffort } from "../../../settings";

type ModelStep = "model" | "thinking";

type ThinkingModeOption = {
  label: string;
  thinkingEnabled: boolean;
  reasoningEffort?: ReasoningEffort;
};

export const MODEL_COMMAND_MODELS = [
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
] as const;

export const MODEL_COMMAND_THINKING_OPTIONS: ThinkingModeOption[] = [
  { label: "Thinking mode [max]", thinkingEnabled: true, reasoningEffort: "max" },
  { label: "Thinking mode [high]", thinkingEnabled: true, reasoningEffort: "high" },
  { label: "No thinking", thinkingEnabled: false },
];

function getThinkingOptionIndex(config: Pick<ModelConfigSelection, "thinkingEnabled" | "reasoningEffort">): number {
  const index = MODEL_COMMAND_THINKING_OPTIONS.findIndex((option) => {
    if (!config.thinkingEnabled) {
      return !option.thinkingEnabled;
    }
    return option.thinkingEnabled && option.reasoningEffort === config.reasoningEffort;
  });
  return index >= 0 ? index : 0;
}

type Props = {
  open: boolean;
  modelConfig: ModelConfigSelection;
  width: number;
  onClose: () => void;
  onModelConfigChange: (selection: ModelConfigSelection) => string | Promise<string>;
  onStatusMessage?: (message: string | null) => void;
  /** Project root directory for reading `.anng/models.json` registry */
  projectRoot: string;
};

const ModelsDropdown: React.FC<Props> = ({
  open,
  modelConfig,
  width,
  onClose,
  onModelConfigChange,
  onStatusMessage,
  projectRoot,
}) => {
  const [step, setStep] = useState<ModelStep | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [registryModels, setRegistryModels] = useState<string[]>([]);

  // Load registry models from disk each time the dropdown opens
  useEffect(() => {
    if (open) {
      setRegistryModels(loadModels(projectRoot).map((m) => m.name));
    }
  }, [open, projectRoot]);

  // Merge predefined + registry models (dedup, preserve order)
  const allModels: string[] = useMemo(() => {
    const set = new Set<string>(MODEL_COMMAND_MODELS);
    const result: string[] = [...MODEL_COMMAND_MODELS];
    for (const m of registryModels) {
      if (!set.has(m)) {
        set.add(m);
        result.push(m);
      }
    }
    return result;
  }, [registryModels]);

  const displayModel = pendingModel ?? modelConfig.model;
  const hasCustomModel = !allModels.includes(displayModel);
  const modelOptionCount = allModels.length + (hasCustomModel ? 1 : 0);

  // Initialize state when opened
  useEffect(() => {
    if (open) {
      const currentIndex = allModels.findIndex((m) => m === modelConfig.model);
      setPendingModel(null);
      setStep("model");
      setActiveIndex(currentIndex >= 0 ? currentIndex + (hasCustomModel ? 1 : 0) : 0);
    } else {
      setStep(null);
    }
  }, [open, modelConfig.model, allModels, hasCustomModel]);

  const currentActiveIndex = hasCustomModel && activeIndex > 0 ? activeIndex - 1 : activeIndex;
  const predefinedModel = allModels[currentActiveIndex];

  // Validate activeIndex bounds
  useEffect(() => {
    if (!step) {
      return;
    }
    const optionCount = step === "model" ? modelOptionCount : MODEL_COMMAND_THINKING_OPTIONS.length;
    if (activeIndex >= optionCount) {
      setActiveIndex(Math.max(0, optionCount - 1));
    }
  }, [activeIndex, step, modelOptionCount]);

  function selectItem(): void {
    if (step === "model") {
      const model = hasCustomModel && activeIndex === 0 ? displayModel : (predefinedModel ?? modelConfig.model);
      setPendingModel(model);
      setStep("thinking");
      setActiveIndex(getThinkingOptionIndex(modelConfig));
      return;
    }

    const option = MODEL_COMMAND_THINKING_OPTIONS[activeIndex] ?? MODEL_COMMAND_THINKING_OPTIONS[0]!;
    const selection: ModelConfigSelection = {
      model: pendingModel ?? modelConfig.model,
      thinkingEnabled: option.thinkingEnabled,
      reasoningEffort: option.reasoningEffort ?? modelConfig.reasoningEffort,
    };
    onClose();
    Promise.resolve(onModelConfigChange(selection))
      .then((message) => {
        if (message) {
          onStatusMessage?.(message);
        }
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        onStatusMessage?.(`Failed to update model settings: ${msg}`);
      });
  }

  useInput(
    (input, key) => {
      if (!step) {
        return;
      }

      const optionCount = step === "model" ? modelOptionCount : MODEL_COMMAND_THINKING_OPTIONS.length;

      if (key.upArrow) {
        setActiveIndex((idx) => (idx - 1 + optionCount) % optionCount);
        return;
      }
      if (key.downArrow) {
        setActiveIndex((idx) => (idx + 1) % optionCount);
        return;
      }
      if ((input === " " && !key.ctrl && !key.meta) || (key.return && !key.shift && !key.meta)) {
        selectItem();
        return;
      }
      if (key.tab || key.escape) {
        onClose();
        return;
      }
    },
    { isActive: open }
  );

  if (!open || !step) {
    return null;
  }

  const items =
    step === "model"
      ? [
          ...(hasCustomModel
            ? [
                {
                  key: displayModel,
                  label: `${displayModel} (current)`,
                  description: "custom model",
                  selected: true,
                },
              ]
            : []),
          ...allModels.map((model) => ({
            key: model,
            label: model,
            description: model === displayModel ? "current model" : "",
            selected: model === displayModel,
          })),
        ]
      : MODEL_COMMAND_THINKING_OPTIONS.map((option, i) => ({
          key: option.label,
          label: option.label,
          description: option.thinkingEnabled ? `reasoningEffort: ${option.reasoningEffort}` : "thinking disabled",
          selected: getThinkingOptionIndex(modelConfig) === i,
        }));

  return (
    <DropdownMenu
      width={width}
      title={step === "model" ? "Select Model" : "Select Thinking Mode"}
      helpText={step === "model" ? "Space/Enter select model · Esc to cancel" : "Space/Enter apply · Esc to cancel"}
      items={items}
      activeIndex={activeIndex}
      activeColor="#D4704B"
      maxVisible={10}
    />
  );
};

export { getThinkingOptionIndex };
export default ModelsDropdown;
