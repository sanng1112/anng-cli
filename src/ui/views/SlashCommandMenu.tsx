import { formatSlashCommandDescription, formatSlashCommandLabel } from "../core/slash-commands";
import type { SlashCommandItem } from "../core/slash-commands";
import { ARGS_SEPARATOR } from "../constants";
import React from "react";
import { Box, Text } from "ink";
import type { SkillInfo } from "../../session";

type SlashCommandMenuProps = {
  items: SlashCommandItem[];
  activeIndex: number;
  width: number;
  maxVisible?: number;
};
export function isSkillSelected(skills: SkillInfo[], skill: SkillInfo): boolean {
  return skills.some((item) => item.name === skill.name);
}
const SlashCommandMenu = React.memo(function SlashCommandMenu({
  items,
  activeIndex,
  maxVisible = 6,
  width,
}: SlashCommandMenuProps): React.ReactElement | null {
  // Calculate label column optimal width: include prefix "> " or "  " (2 chars), max half container (minus gap)
  const labelColumnWidth = React.useMemo(() => {
    if (items.length === 0) {
      return 0;
    }
    const longestLabel = Math.max(
      ...items.map((s) => s.label.length + (s.args ? s.args?.join(ARGS_SEPARATOR)?.length + 4 : 0))
    );
    const contentWidth = longestLabel + 2; // +2 for prefix "> " or "  "
    const maxAllowed = Math.max(10, (width - 2) >> 1); // Container 50% width (minus gap), at least 10 columns
    return Math.min(contentWidth, maxAllowed);
  }, [items, width]);

  if (items.length === 0) {
    return null;
  }

  // Calculate visible window start position, ensure activeIndex stays within visible area
  const visibleStart = Math.min(
    Math.max(0, activeIndex - Math.floor((maxVisible - 1) / 2)),
    Math.max(0, items.length - maxVisible)
  );
  const visibleItems = items.slice(visibleStart, visibleStart + maxVisible);

  return (
    <Box flexDirection="column" marginBottom={1} width={width}>
      {visibleStart > 0 ? (
        <Box marginLeft={2}>
          <Text dimColor>▲</Text>
        </Box>
      ) : null}
      {visibleItems.map((item, idx) => {
        const actualIndex = visibleStart + idx;
        return (
          <Box key={item.label} gap={2} flexDirection="row" flexGrow={1}>
            <Box width={labelColumnWidth} flexShrink={0} gap={2}>
              <Text color={actualIndex === activeIndex ? "#D4704B" : undefined} wrap="truncate-end">
                {actualIndex === activeIndex ? "> " : "  "}
                <Text bold>{formatSlashCommandLabel(item)}</Text>
              </Text>
              {item.args ? <Text dimColor>{item.args.join(ARGS_SEPARATOR)}</Text> : null}
            </Box>
            <Box flexGrow={1}>
              <Text color={actualIndex === activeIndex ? "#D4704B" : undefined} wrap="truncate-end" dimColor>
                {formatSlashCommandDescription(item.description)}
              </Text>
            </Box>
          </Box>
        );
      })}
      <Box marginLeft={2} flexDirection="column">
        {visibleStart + visibleItems.length < items.length ? <Text dimColor>▼</Text> : null}
        <Text dimColor>
          ({activeIndex + 1}/{items.length}) ↑↓ to navigate · Enter to select
        </Text>
      </Box>
    </Box>
  );
});

export default SlashCommandMenu;
