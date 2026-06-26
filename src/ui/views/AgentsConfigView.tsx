import React from "react";
import { Box, Text } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";

export function AgentsConfigView({ onExit }: { projectRoot: string; onExit: () => void }): React.ReactElement {
  useTerminalInput(
    (_input, key) => {
      if (key.escape) onExit();
    },
    { isActive: true }
  );
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="#D4704B" width={60}>
      <Text bold color="#D4704B">
        🤖 Agents Configuration
      </Text>
      <Text dimColor>Team mode is currently unavailable (module under restoration).</Text>
      <Text dimColor>Press Esc to go back.</Text>
    </Box>
  );
}
