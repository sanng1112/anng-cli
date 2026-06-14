import React from "react";
import { Box, Text } from "ink";

export function AsciiLogo() {
  return (
    <Box flexDirection="row" alignItems="center" gap={3}>
      <Box flexDirection="column" alignItems="flex-start">
        <Text>
          <Text color="#D4704B"> ▄▄▄████████▄▄▄</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▄████████████████▄</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> █████▀▀ ▀▀█████</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> █████ ▄▄</Text>
          <Text color="#FFFFFF">████</Text>
          <Text color="#D4704B">▄▄ ████▌</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ████▌ █</Text>
          <Text color="#FFFFFF">██▀ ▀██</Text>
          <Text color="#D4704B">█ ▐███▌</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ████▌ █</Text>
          <Text color="#FFFFFF">█</Text>
          <Text color="#000000" backgroundColor="#FFFFFF">
            {" "}
            o o{" "}
          </Text>
          <Text color="#FFFFFF">█</Text>
          <Text color="#D4704B"> ▐███</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ████ </Text>
          <Text color="#FFFFFF">█</Text>
          <Text color="#000000" backgroundColor="#FFFFFF">
            {" "}
            w{" "}
          </Text>
          <Text color="#FFFFFF">█</Text>
          <Text color="#D4704B"> ███</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▀███ █</Text>
          <Text color="#FFFFFF">█▄▄▄▄▄██</Text>
          <Text color="#D4704B"> █▀</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▀█████████████▄</Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▀▀██████████▌ </Text>
          <Text color="#888888" bold>
            _O_
          </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> ▀▀▀▀▀▀ </Text>
          <Text color="#888888" bold>
            / | \{" "}
          </Text>
        </Text>
        <Text>
          <Text color="#D4704B"> </Text>
          <Text color="#888888" bold>
            / \{" "}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text color="#D4704B"> █████╗ ███╗ ██╗███╗ ██╗ ██████╗ </Text>
        <Text color="#D4704B">██╔══██╗████╗ ██║████╗ ██║██╔════╝ </Text>
        <Text color="#D4704B">███████║██╔██╗ ██║██╔██╗ ██║██║ ███╗</Text>
        <Text color="#D4704B">██╔══██║██║╚██╗██║██║╚██╗██║██║ ██║</Text>
        <Text color="#D4704B">██║ ██║██║ ╚████║██║ ╚████║╚██████╔╝</Text>
        <Text color="#D4704B">╚═╝ ╚═╝╚═╝ ╚═══╝╚═╝ ╚═══╝ ╚═════╝ </Text>
        <Text color="#888888"> S Q U I R R E L E D I T I O N</Text>
      </Box>
    </Box>
  );
}
