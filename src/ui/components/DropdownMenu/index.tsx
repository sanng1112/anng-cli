import React, { useMemo } from "react";
import { Box, Text } from "ink";

/**
 * Generic dropdown menu item structure
 */
export type DropdownMenuItem = {
  /** Unique key for React list rendering */
  key: string;
  /** Main label text (can include status indicators) */
  label: string;
  /** Secondary description text (dimmed) */
  description?: string;
  /** Whether this item is currently selected */
  selected?: boolean;
  /** Whether to show a special status indicator (e.g., loaded checkmark) */
  statusIndicator?: {
    symbol: string;
    color: string;
  };
};

/**
 * Props for the DropdownMenu component
 */
type DropdownMenuProps = {
  /** List of items to display */
  items: DropdownMenuItem[];
  /** Index of the currently active/highlighted item */
  activeIndex: number;
  /** Maximum number of visible items before scrolling */
  maxVisible?: number;
  /** Container width in columns */
  width: number;
  /** Optional title displayed at the top */
  title?: string;
  /** Color for the title (default: "magenta") */
  titleColor?: string;
  /** Color for the active item indicator (default: "cyanBright") */
  activeColor?: string;
  /** Help text displayed at the bottom */
  helpText?: string;
  /** Text to display when items list is empty */
  emptyText?: string;
  /** Custom item renderer (overrides default rendering) */
  renderItem?: (item: DropdownMenuItem, isActive: boolean) => React.ReactNode;
};

/**
 * Calculate the visible window start position for scrolling
 * Ensures the activeIndex is always visible within the window
 */
export function calculateVisibleStart(activeIndex: number, totalItems: number, maxVisible: number): number {
  return Math.min(Math.max(0, activeIndex - Math.floor((maxVisible - 1) / 2)), Math.max(0, totalItems - maxVisible));
}

function buildDivider(width: number): string {
  return "─".repeat(Math.max(12, width - 2));
}

/**
 * Generic dropdown menu component with scrolling support
 * Used by Skills Dropdown, Model Dropdown, and other selection menus
 */
const DropdownMenu = React.memo(function DropdownMenu({
  items,
  activeIndex,
  maxVisible = 8,
  width,
  title,
  titleColor = "#D4704B",
  activeColor = "cyanBright",
  helpText,
  emptyText = "No items found",
  renderItem,
}: DropdownMenuProps): React.ReactElement | null {
  // Calculate visible window
  const visibleStart = calculateVisibleStart(activeIndex, items?.length, maxVisible);
  const visibleItems = items?.slice(visibleStart, visibleStart + maxVisible);
  const stackedLayout = width < 78;

  // Calculate label column optimal width: include all possible prefixes and suffixes
  const labelColumnWidth = useMemo(() => {
    if (visibleItems.length === 0 || stackedLayout) {
      return 0;
    }
    // Calculate max width actually needed per item
    const maxContentWidth = Math.max(
      ...visibleItems.map((item) => {
        let width = 2; // prefix "> " or "  "
        if (item.selected !== undefined) {
          width += 2; // "● " or "○ "
        }
        width += item.label.length;
        if (item.statusIndicator) {
          width += 2; // " ✓" or similar
        }
        return width;
      })
    );
    const maxAllowed = Math.max(18, Math.floor(width * 0.42));
    return Math.min(maxContentWidth, maxAllowed);
  }, [stackedLayout, visibleItems, width]);

  // Early return if no items
  if (items?.length === 0) {
    return (
      <Box flexDirection="column" marginBottom={1} width={width}>
        {title ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color={titleColor} bold>
              {title}
            </Text>
            <Text color={titleColor}>{buildDivider(width)}</Text>
          </Box>
        ) : null}
        <Text dimColor>{emptyText}</Text>
        {helpText ? <Text dimColor>{helpText}</Text> : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} width={width}>
      {title ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={titleColor} bold>
            {title}
          </Text>
          <Text color={titleColor}>{buildDivider(width)}</Text>
        </Box>
      ) : null}

      {visibleStart > 0 ? (
        <Box marginBottom={1}>
          <Text dimColor>↑ {visibleStart} item above</Text>
        </Box>
      ) : null}

      <Box flexDirection="column" gap={1}>
        {visibleItems.map((item, idx) => {
          const actualIndex = visibleStart + idx;
          const isActive = actualIndex === activeIndex;

          // Use custom renderer if provided
          if (renderItem) {
            return <React.Fragment key={item.key}>{renderItem(item, isActive)}</React.Fragment>;
          }

          // Default rendering with selection indicator and optional features
          return (
            <Box key={item.key} flexDirection="column">
              <Box flexDirection={stackedLayout ? "column" : "row"} gap={stackedLayout ? 0 : 2}>
                <Box width={stackedLayout ? width : labelColumnWidth} flexShrink={0}>
                  <Text color={isActive ? activeColor : undefined} wrap="truncate-end" bold={isActive}>
                    {isActive ? "▸ " : "  "}
                    {item.selected !== undefined ? (item.selected ? "● " : "○ ") : ""}
                    {item.label}
                    {item.statusIndicator ? (
                      <Text color={item.statusIndicator.color}> {item.statusIndicator.symbol}</Text>
                    ) : null}
                  </Text>
                </Box>
                {!stackedLayout && item.description ? (
                  <Box flexGrow={1}>
                    <Text dimColor wrap="truncate-end">
                      {item.description}
                    </Text>
                  </Box>
                ) : null}
              </Box>
              {stackedLayout && item.description ? (
                <Box marginLeft={4}>
                  <Text dimColor wrap="wrap">
                    {item.description}
                  </Text>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {visibleStart + visibleItems.length < items.length ? (
        <Box marginTop={1}>
          <Text dimColor>↓ {items.length - visibleStart - visibleItems.length} more item</Text>
        </Box>
      ) : null}

      {helpText ? (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>{buildDivider(width)}</Text>
          <Text dimColor>{helpText}</Text>
        </Box>
      ) : null}
    </Box>
  );
});

export default DropdownMenu;
