import React from "react";
import { Box, Text } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";

export type TeamAgentRule = { name: string; prompt: string; model?: string; apiKey?: string; baseURL?: string };

export function TeamCreateView({ onExit }: { projectRoot: string; screenWidth: number; onRunTask: (t: string) => void; onStartTeam: (a: TeamAgentRule[]) => void; onExit: () => void }): React.ReactElement {
  useTerminalInput((_input, key) => { if (key.escape) onExit(); }, { isActive: true });
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="#D4704B" width={60}>
      <Text bold color="#D4704B">👥 Team Builder</Text>
      <Text dimColor>Team mode is currently unavailable (module under restoration).</Text>
      <Text dimColor>Press Esc to go back.</Text>
    </Box>
  );
}
