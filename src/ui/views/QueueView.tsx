import React, { useState, useMemo, useCallback } from "react";
import { Box, Text } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";
import {
  loadQueue,
  addTask,
  removeTask,
  toggleTask,
  clearQueue,
  getNextPendingTask,
  type QueueTask,
} from "../../common/task-queue";

type QueueViewProps = {
  projectRoot: string;
  onExit: () => void;
  onProcessTask: (taskText: string) => void;
  screenWidth: number;
};

type Screen = "list" | "add" | "confirm-clear";
export const QueueView = React.memo(function QueueView({
  projectRoot,
  onExit,
  onProcessTask,
  screenWidth,
}: QueueViewProps): React.ReactElement {
  const [tasks, setTasks] = useState<QueueTask[]>(() => loadQueue(projectRoot).tasks);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("list");
  const [addBuffer, setAddBuffer] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const panelWidth = Math.min(screenWidth, 100);

  const refresh = useCallback(() => {
    setTasks(loadQueue(projectRoot).tasks);
  }, [projectRoot]);

  const pendingCount = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);


  useTerminalInput(
    (input, key) => {
      if (screen === "add") {
        if (key.escape) { setScreen("list"); setAddBuffer(""); return; }
        if (key.return) {
          const trimmed = addBuffer.trim();
          if (trimmed) {
            const task = addTask(projectRoot, trimmed);
            setStatusMsg(task ? `Added: "${trimmed.slice(0, 60)}"` : "Failed to add");
            refresh();
          }
          setAddBuffer("");
          setScreen("list");
          return;
        }
        if (key.backspace) { setAddBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) {
          setAddBuffer((b) => b + input);
        }
        return;
      }
      if (screen === "confirm-clear") {
        if (key.escape) { setScreen("list"); return; }
        if (key.return) {
          setStatusMsg(clearQueue(projectRoot) ? "Queue cleared" : "Failed to clear");
          refresh();
          setScreen("list");
        }
        return;
      }
      // List screen
      if (key.escape || (key.ctrl && (input === "o" || input === "O"))) { onExit(); return; }
      if (key.return && tasks.length > 0) {
        const selected = tasks[selectedIndex];
        if (selected) {
          toggleTask(projectRoot, selectedIndex);
          setStatusMsg(selected.done ? `Re-opened: "${selected.text.slice(0, 50)}"` : `Done: "${selected.text.slice(0, 50)}"`);
          refresh();
        }
        return;
      }
      if (key.upArrow) { setSelectedIndex((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelectedIndex((i) => Math.min(tasks.length - 1, i + 1)); return; }
      if (input === "a" || input === "A") { setScreen("add"); setAddBuffer(""); return; }
      if ((input === "d" || input === "D" || key.delete) && tasks.length > 0) {
        const selected = tasks[selectedIndex];
        if (selected) {
          removeTask(projectRoot, selectedIndex);
          setStatusMsg(`Removed: "${selected.text.slice(0, 50)}"`);
          refresh();
          setSelectedIndex((i) => Math.min(i, tasks.length - 2));
        }
        return;
      }
      if (input === "c" || input === "C") {
        if (tasks.length > 0) setScreen("confirm-clear");
        else setStatusMsg("Queue is already empty");
        return;
      }
      if (input === "p" || input === "P") {
        const next = getNextPendingTask(projectRoot);
        if (next) onProcessTask(next.text);
        else setStatusMsg("No pending tasks");
        return;
      }
    },
    { isActive: true }
  );

  const primaryColor = "#D4704B";

  if (screen === "add") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Text bold color={primaryColor}>📋 Add Task</Text>
        <Box marginTop={1} paddingX={1}>
          <Text bold color={primaryColor}>&gt; </Text>
          <Text>{addBuffer || ""}</Text>
          <Text dimColor>{addBuffer.length === 0 ? "Type your task and press Enter..." : "█"}</Text>
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to save · Esc to cancel</Text></Box>
      </Box>
    );
  }

  if (screen === "confirm-clear") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Box paddingY={1}><Text bold color="red">⚠ Clear all {tasks.length} tasks?</Text></Box>
        <Box><Text dimColor>Press Enter to confirm · Esc to cancel</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold color={primaryColor}>📋 Task Queue</Text>
          <Text dimColor>  (Enter toggle · Esc close)</Text>
        </Box>
        <Box><Text dimColor>{tasks.length} tasks · {pendingCount} pending</Text></Box>
      </Box>
      {tasks.length === 0 ? (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Queue is empty.</Text>
          <Text dimColor>Press <Text bold color={primaryColor}>A</Text> to add, or <Text bold>/queue add &lt;task&gt;</Text>.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box key={`${idx}`} flexDirection="row" paddingY={0}>
                <Box width={2} flexShrink={0}>
                  <Text color={isSelected ? primaryColor : undefined}>{isSelected ? "▸" : " "}</Text>
                </Box>
                <Box width={3} flexShrink={0}>
                  <Text color={task.done ? "green" : "yellow"} bold>{task.done ? "✓" : "○"}</Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text wrap="truncate-end" dimColor={task.done || !isSelected} strikethrough={task.done}>
                    {task.text}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      {statusMsg ? (<Box marginTop={1}><Text dimColor>{statusMsg}</Text></Box>) : null}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ Nav · Enter Toggle · <Text bold color={primaryColor}>A</Text>dd · <Text bold color={primaryColor}>D</Text>el · <Text bold color={primaryColor}>C</Text>lear · <Text bold color={primaryColor}>P</Text>rocess
        </Text>
      </Box>
    </Box>
  );
});

export default QueueView;
