import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";
import type { SessionEntry } from "../../session";

type RunningProcesses = SessionEntry["processes"];

type BackgroundProcessesViewProps = {
  processStdoutRef: React.RefObject<Map<number, string>>;
  runningProcesses: RunningProcesses;
  sessionProcessCount: number;
  onDismiss: () => void;
  screenWidth: number;
  screenHeight: number;
};

type ProcessInfo = {
  pid: string;
  command: string;
  startTime: string;
  timeoutMs?: number;
  timedOut?: boolean;
  stdout: string;
};

const REFRESH_INTERVAL_MS = 500;

export const BackgroundProcessesView = React.memo(function BackgroundProcessesView({
  processStdoutRef,
  runningProcesses,
  sessionProcessCount,
  onDismiss,
  screenWidth,
  screenHeight: _screenHeight,
}: BackgroundProcessesViewProps): React.ReactElement {
  const [processList, setProcessList] = useState<ProcessInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedPid, setExpandedPid] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Refresh process list periodically
  useEffect(() => {
    const update = () => {
      setNow(Date.now());
      if (!runningProcesses || runningProcesses.size === 0) {
        setProcessList([]);
        return;
      }
      const list: ProcessInfo[] = [];
      for (const [pid, proc] of runningProcesses.entries()) {
        const pidNum = Number(pid);
        const stdout = processStdoutRef.current.get(pidNum) ?? "";
        list.push({
          pid,
          command: proc.command,
          startTime: proc.startTime,
          timeoutMs: proc.timeoutMs,
          timedOut: proc.timedOut,
          stdout,
        });
      }
      setProcessList(list);
    };
    update();
    const interval = setInterval(update, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runningProcesses, processStdoutRef]);

  const panelWidth = Math.min(screenWidth, 100);

  useTerminalInput(
    (input, key) => {
      if (key.escape || (key.ctrl && (input === "o" || input === "O"))) {
        onDismiss();
        return;
      }
      if (key.return) {
        if (processList.length > 0) {
          const selected = processList[selectedIndex];
          if (selected) {
            if (expandedPid === selected.pid) {
              setExpandedPid(null);
            } else {
              setExpandedPid(selected.pid);
            }
          }
        }
        return;
      }
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(processList.length - 1, i + 1));
        return;
      }
      if (key.pageUp || key.leftArrow) {
        setExpandedPid(null);
        return;
      }
    },
    { isActive: true }
  );

  const primaryColor = "#D4704B";

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold color={primaryColor}>
            ⚙ Background Processes
          </Text>
          <Text dimColor>  (Enter to expand · Esc to close)</Text>
        </Box>
        <Box>
          <Text dimColor>
            {processList.length} active · {sessionProcessCount} total this session
          </Text>
        </Box>
      </Box>
      {/* No processes */}
      {processList.length === 0 ? (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>No background processes running.</Text>
          <Text dimColor>Processes appear here when you run bash commands via the AI assistant.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {processList.map((proc, idx) => {
            const isSelected = idx === selectedIndex;
            const isExpanded = expandedPid === proc.pid;
            const elapsed = getElapsed(proc.startTime, now);
            const deadline = proc.timeoutMs
              ? getDeadlineText(proc.startTime, proc.timeoutMs, now)
              : "no timeout";

            return (
              <Box key={proc.pid} flexDirection="column">
                <Box flexDirection="row" paddingX={1} paddingY={0}>
                  <Box width={2} flexShrink={0}>
                    <Text color={isSelected ? primaryColor : undefined}>
                      {isSelected ? "▸" : " "}
                    </Text>
                  </Box>
                  <Box width={8} flexShrink={0}>
                    <Text bold color={proc.timedOut ? "red" : undefined}>
                      PID {proc.pid}
                    </Text>
                  </Box>
                  <Box width={10} flexShrink={0}>
                    <Text dimColor>{elapsed}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <Text wrap="truncate-end" dimColor={!isSelected}>
                      {proc.command}
                    </Text>
                  </Box>
                  <Box width={14} flexShrink={0}>
                    <Text color={isExpired(proc.startTime, proc.timeoutMs, now) ? "red" : "green"} dimColor>
                      {deadline}
                    </Text>
                  </Box>
                </Box>
                {isExpanded && proc.stdout ? (
                  <Box
                    flexDirection="column"
                    marginLeft={4}
                    paddingX={1}
                    paddingY={1}
                    borderStyle="single"
                    borderLeft={false}
                    borderRight={false}
                    borderTop={true}
                    borderBottom={true}
                    borderDimColor
                  >
                    <Text bold dimColor>Output:</Text>
                    <Text wrap="wrap">{proc.stdout || "(no output yet)"}</Text>
                  </Box>
                ) : isExpanded ? (
                  <Box marginLeft={4} paddingX={1}>
                    <Text dimColor>(no output yet)</Text>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          ↑↓ Navigate · Enter Toggle Output · Esc/← Collapse All · Ctrl+O Close
        </Text>
      </Box>
    </Box>
  );
});

function getElapsed(startTime: string, now: number): string {
  try {
    const start = new Date(startTime).getTime();
    const diff = Math.max(0, now - start);
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  } catch {
    return "?";
  }
}

function getDeadlineText(startTime: string, timeoutMs: number, now: number): string {
  try {
    const start = new Date(startTime).getTime();
    const deadline = start + timeoutMs;
    const remaining = Math.max(0, deadline - now);
    if (remaining === 0) return "expiring...";
    const secs = Math.floor(remaining / 1000);
    if (secs < 60) return `${secs}s left`;
    const mins = Math.floor(secs / 60);
    return `${mins}m left`;
  } catch {
    return "?";
  }
}

function isExpired(startTime: string, timeoutMs: number | undefined, now: number): boolean {
  if (typeof timeoutMs !== "number") return false;
  try {
    const start = new Date(startTime).getTime();
    return now >= start + timeoutMs;
  } catch {
    return false;
  }
}

export default BackgroundProcessesView;


