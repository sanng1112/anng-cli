import React from "react";
import { Box, Text } from "ink";
import type { DoctorStatus } from "../../commands/doctor";
import type { ResolvedDeepcodingSettings } from "../../settings";
import { anngPalette } from "../palette";

export function ConfigView(props: { settings: ResolvedDeepcodingSettings; doctor: DoctorStatus }): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor={anngPalette.accentDim} flexDirection="column" paddingX={1}>
      <Text color={anngPalette.accent}>Runtime</Text>
      <Text>thinking={String(props.settings.thinkingEnabled)}</Text>
      <Text>reasoning={props.settings.thinkingEnabled ? props.settings.reasoningEffort : "off"}</Text>
      <Text>tmux={props.doctor.tmuxInstalled ? "installed" : "missing"}</Text>
      <Text>mcp={props.doctor.mcpServerNames.length}</Text>
      <Text dimColor>settings={props.doctor.settingsExists ? props.doctor.settingsPath : "missing"}</Text>
      <Text dimColor>memory={props.doctor.memoryDir}</Text>
    </Box>
  );
}
