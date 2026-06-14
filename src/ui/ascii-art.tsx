import React, { useMemo } from "react";
import { Box, Text } from "ink";

const COLORS: Record<string, string | undefined> = {
  O: "#D4704B", // Orange
  D: "#A65030", // Dark Orange
  W: "#FFFFFF", // White
  B: "#000000", // Black
  e: "#000000", // Eye (Black)
  m: "#000000", // Mouth (Black)
  ".": undefined, // Transparent
};

const SQUIRREL_MAP = [
  "........BBBBBBBB........",
  "......BBOOOOOOOOBB......",
  ".....BBOOOOOOOOOOOOB....",
  "....BBOOOOOOOOOOOOOOB...",
  "...BBOOOOOOOOOOOOOOOOB..",
  "..BBOOOOOBBBBBBBBBOOOOB.",
  "..BBOOOOBBOOOOODDBBWWOB.",
  ".BBOOOOBBBOOOOODDDBBWWOB",
  ".BBOOOOBBOOOBBOOBDBBWOB.",
  ".BBOOOOBOOOBBeOeOBBWOB..",
  ".BBOOOOBOOOBOOOOOOBWOB..",
  ".BBOOOOBBOOOBOOmOBBWOB..",
  "..BBOOOOBBOOOBBBBBWOB...",
  "..BBOOOOOBBDDDDDDBWWOB..",
  "...BBOOOOOOBBBBBBWWOB...",
  "....BBOOOOOOOWWWWWOB....",
  ".....BBOOOOOOWWWWOBB....",
  "......BBBBBBBBBBBB......",
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
    for (let r = 0; r < SQUIRREL_MAP.length; r += 2) {
      const upperRow = SQUIRREL_MAP[r];
      const lowerRow = SQUIRREL_MAP[r + 1] || ".".repeat(upperRow.length);

      const parts = [];
      let lastProps = null;
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

        // Check if we can merge with previous
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

      // Add logo text on specific lines
      let rightText = null;
      // We have 9 rows of output (18/2). Logo has 6 lines.
      // Output rows 1 to 6 can hold the logo.
      if (r / 2 >= 1 && r / 2 <= 6) {
        const logoLine = LOGO_LINES[r / 2 - 1];
        rightText = <Text color="#D4704B"> {logoLine}</Text>;
      } else if (r / 2 === 7) {
        rightText = <Text color="#888888"> S Q U I R R E L</Text>;
      }

      lines.push(
        <Text wrap="truncate-end" key={r}>
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
