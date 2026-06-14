import React, { useMemo } from "react";
import { Box, Text } from "ink";

const COLORS: Record<string, string | undefined> = {
  O: "#D4704B", // Orange
  D: "#A65030", // Dark Orange (Shading)
  W: "#FFFFFF", // White (Chest, Tail Tip)
  B: "#000000", // Black (Outline, Eyes, Nose, Paws)
  e: "#000000", // Eye (Black)
  n: "#000000", // Nose (Black)
  ".": undefined, // Transparent
};

const FOX_MAP = [
  "............BBBBBBBB....",
  "..........BBOOOOOOOOBB..",
  "......BB..BOOOOOOOOOOOB.",
  ".....BOOB.BDOOOOOOOOOOB.",
  "....BOOOOBBDDOOOOOOOOOB.",
  "...BDOOOOOOOOOOOOOOOOOB.",
  "...BOeOOOOOOOOOOOOOOOOB.",
  "..BDOOOOOOOOOOOOOOOOOOB.",
  "..BnOOOOOOOOOOOOOOOOOBB.",
  "..BWWWWWOOOOOOOOOOOOBWB.",
  "...BBWWWOOOOOOOOOOOBWWB.",
  ".....BDOOOOOOOOOOOBWWWB.",
  ".....BDOOOOOOOOOOBWWWWB.",
  "....BDOOOOOOOOOOBWWWWWB.",
  "....BDOOOOOOOOOOBWWWWBB.",
  "...BDOOOOOOOODDBWWBB....",
  "..BDDDBBBOOOOBBDBB......",
  "..BBBB..BBBB..BBB.......",
];

const LOGO_LINES = [
  "█████╗ ███╗   ██╗███╗   ██╗ ██████╗",
  "██╔══██╗████╗  ██║████╗  ██║██╔════╝",
  "███████║██╔██╗ ██║██╔██╗ ██║██║  ███╗",
  "██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║",
  "██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝",
  "╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝",
];

export function AsciiLogo() {
  const renderedLines = useMemo(() => {
    const lines = [];
    for (let r = 0; r < FOX_MAP.length; r += 2) {
      const upperRow = FOX_MAP[r];
      const lowerRow = FOX_MAP[r + 1] || ".".repeat(upperRow.length);

      const parts: React.ReactNode[] = [];
      let lastProps: Record<string, string> | null = null;
      let currentString = "";

      const pushPart = () => {
        if (currentString.length > 0 && lastProps) {
          parts.push(
            <Text key={parts.length} {...lastProps}>
              {currentString}
            </Text>
          );
        }
      };

      for (let i = 0; i < upperRow.length; i++) {
        const u = upperRow[i];
        const l = lowerRow[i];
        const colorU = COLORS[u];
        const colorL = COLORS[l];

        let char = " ";
        const props: Record<string, string> = {};

        if (u === l) {
          if (colorU) {
            char = "█";
            props.color = colorU;
          } else {
            char = " ";
          }
        } else if (colorU && !colorL) {
          char = "▀";
          props.color = colorU;
        } else if (!colorU && colorL) {
          char = "▄";
          props.color = colorL;
        } else if (colorU && colorL) {
          char = "▀";
          props.color = colorU;
          props.backgroundColor = colorL;
        }

        const propsKey = JSON.stringify(props);
        const lastPropsKey = lastProps ? JSON.stringify(lastProps) : null;

        if (propsKey !== lastPropsKey) {
          pushPart();
          lastProps = props;
          currentString = char;
        } else {
          currentString += char;
        }
      }
      pushPart();

      // Add logo text on specific lines (vertically centered)
      let rightText = null;
      if (r / 2 >= 1 && r / 2 <= 6) {
        const logoLine = LOGO_LINES[r / 2 - 1];
        rightText = <Text color="#D4704B"> {logoLine}</Text>;
      }

      lines.push(
        <Text key={r} wrap="truncate-end">
          {parts}
          {rightText}
        </Text>
      );
    }
    return lines;
  }, []);

  return (
    <Box flexDirection="column" alignItems="flex-start">
      {renderedLines}
    </Box>
  );
}
