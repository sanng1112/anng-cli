import React, { useCallback } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";

/**
 * A single action button in the modal footer.
 */
export type ModalAction = {
  /** Display label for the button. */
  label: string;
  /** Callback when the button is activated. */
  onAction: () => void;
  /** Whether this is the primary (highlighted) action. */
  primary?: boolean;
  /** Whether this action should appear as a cancel/destructive option. */
  cancel?: boolean;
};

/**
 * Props for the Modal component.
 */
export type ModalProps = {
  /** Whether the modal is visible. */
  isOpen: boolean;
  /** Callback when the modal requests to close (Escape or cancel action). */
  onClose: () => void;
  /** Optional title displayed at the top of the modal. */
  title?: string;
  /** Main content rendered in the body of the modal. */
  children?: React.ReactNode;
  /** Optional action buttons rendered in the footer area. */
  actions?: ModalAction[];
  /** Custom width as percentage of terminal columns (0-100). Default: 60. */
  widthPercent?: number;
  /** Custom height as percentage of terminal rows (0-100). Default: 50. */
  heightPercent?: number;
  /** Override the color for the title bar. Default: "#D4704B". */
  titleColor?: string;
  /** Color for border and accents. Default: "#D4704B". */
  accentColor?: string;
  /** Label for the close hint shown in the footer. Default: "Esc to close". */
  closeHint?: string;
};

/**
 * Minimum width in columns for the modal content area.
 */
const MIN_CONTENT_WIDTH = 40;

/**
 * Minimum height in rows for the modal content area.
 */
const MIN_CONTENT_HEIGHT = 8;

/**
 * A reusable modal dialog for terminal UIs built with Ink.
 *
 * Renders a centered overlay with a backdrop, optional title, scrollable
 * content area, and action buttons in the footer. Pressing Escape closes
 * the modal. Action buttons are navigable via arrow keys and Enter.
 */
const Modal = React.memo(function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  widthPercent = 60,
  heightPercent = 50,
  titleColor = "#D4704B",
  accentColor = "#D4704B",
  closeHint = "Esc to close",
}: ModalProps): React.ReactElement | null {
  const { columns, rows } = useWindowSize();

  // Track the focused action index for keyboard navigation
  const [activeActionIndex, setActiveActionIndex] = React.useState(0);

  // Reset active action index when the modal opens or actions change
  React.useEffect(() => {
    setActiveActionIndex(0);
  }, [isOpen, actions]);

  // Calculate modal dimensions based on terminal size
  const modalWidth = Math.max(MIN_CONTENT_WIDTH, Math.floor((columns * Math.min(widthPercent, 100)) / 100));
  const modalHeight = Math.max(
    MIN_CONTENT_HEIGHT,
    Math.min(rows - 4, Math.floor((rows * Math.min(heightPercent, 100)) / 100))
  );

  // Calculate content height (subtract title bar, footer, and borders)
  const titleLines = title ? 2 : 0;
  const actionsLines = actions && actions.length > 0 ? 3 : 1;
  const borderLines = 2;
  const contentHeight = Math.max(3, modalHeight - titleLines - actionsLines - borderLines);

  // Compute horizontal padding for centering
  const sidePadding = Math.max(0, Math.floor((columns - modalWidth) / 2));

  // Compute vertical padding for centering
  const topPadding = Math.max(0, Math.floor((rows - modalHeight) / 2));

  // Close on Escape
  useInput(
    useCallback(
      (input, key) => {
        if (key.escape) {
          onClose();
          return;
        }

        // Navigate actions with arrow keys when actions exist
        if (actions && actions.length > 0) {
          if (key.leftArrow || key.upArrow) {
            setActiveActionIndex((prev) => (prev <= 0 ? actions.length - 1 : prev - 1));
            return;
          }
          if (key.rightArrow || key.downArrow) {
            setActiveActionIndex((prev) => (prev >= actions.length - 1 ? 0 : prev + 1));
            return;
          }
          if (key.return) {
            const activeAction = actions[activeActionIndex];
            if (activeAction) {
              activeAction.onAction();
            }
            return;
          }
        }
      },
      [onClose, actions, activeActionIndex]
    ),
    { isActive: isOpen }
  );

  // Close on Ctrl+C when modal is active
  useInput(
    useCallback(
      (input, key) => {
        if (key.ctrl && input === "c") {
          onClose();
        }
      },
      [onClose]
    ),
    { isActive: isOpen }
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Box flexDirection="column" width={columns}>
      {/* Top padding to center vertically */}
      {topPadding > 0 ? <Box height={topPadding} /> : null}

      {/* Side padding row with centered modal */}
      {sidePadding > 0 ? (
        <Box height={contentHeight + titleLines + actionsLines + borderLines}>
          {/* Left side padding */}
          <Box width={sidePadding} />

          {/* Modal body */}
          <Box
            width={modalWidth}
            height={contentHeight + titleLines + actionsLines + borderLines}
            flexDirection="column"
            borderStyle="round"
            borderColor={accentColor}
          >
            {/* Title bar */}
            {title ? (
              <Box
                borderStyle="single"
                borderBottom={true}
                borderTop={false}
                borderLeft={false}
                borderRight={false}
                borderDimColor
                paddingX={1}
                paddingY={0}
              >
                <Text bold color={titleColor}>
                  {title}
                </Text>
              </Box>
            ) : null}

            {/* Content body */}
            <Box flexGrow={1} flexDirection="column" overflow="hidden" paddingX={1} height={contentHeight}>
              {children ? (
                typeof children === "string" ? (
                  <Text>{children}</Text>
                ) : (
                  children
                )
              ) : (
                <Text dimColor>(no content)</Text>
              )}
            </Box>

            {/* Footer */}
            <Box
              borderStyle="single"
              borderTop={true}
              borderBottom={false}
              borderLeft={false}
              borderRight={false}
              borderDimColor
              flexDirection="column"
              paddingX={1}
            >
              {/* Action buttons */}
              {actions && actions.length > 0 ? (
                <Box gap={2} justifyContent="center" paddingY={0}>
                  {actions.map((action, index) => {
                    const isActive = index === activeActionIndex;
                    const color = action.cancel ? "red" : accentColor;
                    return (
                      <Box key={action.label} flexShrink={0}>
                        <Text
                          color={isActive ? color : undefined}
                          bold={isActive}
                          inverse={isActive}
                          dimColor={!isActive && !action.primary}
                        >
                          {isActive ? "[" : " "}
                          {action.label}
                          {isActive ? "]" : " "}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              ) : null}

              {/* Close hint */}
              <Box justifyContent="center">
                <Text dimColor>
                  {closeHint}
                  {actions && actions.length > 0 ? " · ←/→ to navigate · Enter to confirm" : ""}
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
});

export default Modal;
