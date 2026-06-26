import React, { useMemo } from "react";
import { Box, Text, useWindowSize } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";
import { BUILTIN_SLASH_COMMANDS, formatSlashCommandDescription } from "../core/slash-commands";

type HelpViewProps = {
  onExit: () => void;
};

const SHORTCUTS: Array<{ key: string; description: string }> = [
  { key: "Enter", description: "Send the prompt" },
  { key: "Shift+Enter", description: "Insert a newline" },
  { key: "Esc", description: "Interrupt the current model turn or close the panel" },
  { key: "/", description: "Open the skills and commands menu" },
  { key: "Ctrl+R", description: "Open raw display mode selection" },
  { key: "Ctrl+V", description: "Paste an image from the clipboard" },
  { key: "Ctrl+D twice", description: "Quit ANNG CLI" },
];

export const HelpView = React.memo(function HelpView({ onExit }: HelpViewProps): React.ReactElement {
  const { columns } = useWindowSize();
  const panelWidth = Math.max(20, Math.min(columns ?? 80, 108));
  const commandItems = useMemo(
    () =>
      BUILTIN_SLASH_COMMANDS.map((item) => ({
        label: item.label,
        description: formatSlashCommandDescription(item.description),
      })),
    []
  );

  useTerminalInput(
    (input, key) => {
      if (key.escape || (key.ctrl && (input === "o" || input === "O")) || key.return) {
        onExit();
      }
    },
    { isActive: true }
  );

  const primaryColor = "#D4704B";

  return (
    <Box flexDirection="column" paddingX={1} width={panelWidth}>
      <Box borderStyle="round" borderColor={primaryColor} flexDirection="column" paddingX={1} marginBottom={1}>
        <Text bold color={primaryColor}>
          {">"}_ ANNG Help
        </Text>
        <Text color={primaryColor}>{"─".repeat(Math.max(12, panelWidth - 4))}</Text>
        <Text dimColor>Commands, shortcuts, and quick usage help. Press Enter or Esc to close.</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={primaryColor}>
          Commands
        </Text>
        {commandItems.map((item) => (
          <Box key={item.label} flexDirection="row" marginLeft={2}>
            <Box width={22}>
              <Text>{item.label}</Text>
            </Box>
            <Box flexGrow={1}>
              <Text>{item.description}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text bold color={primaryColor}>
          Shortcuts
        </Text>
        {SHORTCUTS.map((item) => (
          <Box key={item.key} flexDirection="row" marginLeft={2}>
            <Box width={22}>
              <Text>{item.key}</Text>
            </Box>
            <Box flexGrow={1}>
              <Text>{item.description}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
});

export default HelpView;
