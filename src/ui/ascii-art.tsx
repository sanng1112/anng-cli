import React from "react";
import { Box, Text } from "ink";

export function AsciiLogo() {
  return (
    <Box flexDirection="row" alignItems="center" gap={3}>
      <Box flexDirection="column" alignItems="center">
        <Text>
          <Text color="#D4704B"> ▄▄██████████▄▄ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▄████████</Text>
          <Text color="#FFFFFF">██</Text>
          <Text color="#D4704B">████████▄ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ██████████████████████ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ██████</Text>
          <Text color="#FFFFFF">████▀▀▀▀▀▀██</Text>
          <Text color="#D4704B">██████ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ██████</Text>
          <Text color="#FFFFFF">██▀ </Text>
          <Text color="#000000">▄▄▄ </Text>
          <Text color="#FFFFFF">▀██</Text>
          <Text color="#D4704B">████ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▐█████</Text>
          <Text color="#FFFFFF">██ </Text>
          <Text color="#000000">█████ </Text>
          <Text color="#FFFFFF">██</Text>
          <Text color="#D4704B">████▌</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> █████</Text>
          <Text color="#FFFFFF">██ </Text>
          <Text color="#000000">▀███▀ </Text>
          <Text color="#FFFFFF">██</Text>
          <Text color="#D4704B">████ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ██████</Text>
          <Text color="#FFFFFF">██▄ ▄██</Text>
          <Text color="#D4704B">██████ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▀█████</Text>
          <Text color="#FFFFFF">██████████</Text>
          <Text color="#D4704B">█████▀ </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▀▀██████████████▀▀ </Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text color="#D4704B"> █████╗ ███╗ ██╗███╗ ██╗ ██████╗ </Text>
        <Text color="#D4704B">██╔══██╗████╗ ██║████╗ ██║██╔════╝ </Text>
        <Text color="#D4704B">███████║██╔██╗ ██║██╔██╗ ██║██║ ███╗</Text>
        <Text color="#D4704B">██╔══██║██║╚██╗██║██║╚██╗██║██║ ██║</Text>
        <Text color="#D4704B">██║ ██║██║ ╚████║██║ ╚████║╚██████╔╝</Text>
        <Text color="#D4704B">╚═╝ ╚═╝╚═╝ ╚═══╝╚═╝ ╚═══╝ ╚═════╝ </Text>
        <Text color="#D4704B" dimColor>
          {" "}
          C L I E d i t i o n
        </Text>
      </Box>
    </Box>
  );
}
