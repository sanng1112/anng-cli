import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";
import {
  listQueues, loadQueue, addTask, updateTask, removeTask,
  toggleTask, moveTask, clearQueue, getNextPendingTask,
  addNamedQueue, deleteNamedQueue,
  type QueueTask, type QueueInfo,
} from "../../common/task-queue";

type QueueViewProps = {
  projectRoot: string;
  onExit: () => void;
  onProcessTask: (taskText: string) => void;
  screenWidth: number;
  promptHistory?: string[];
  queueVisible: boolean;
  onToggleVisibility: () => void;
  refreshTick?: number;
};

type Screen = "list" | "add" | "edit" | "confirm-clear" | "queue-menu";

export const QueueView = React.memo(function QueueView({
  projectRoot, onExit, onProcessTask, screenWidth,
  promptHistory = [], queueVisible, onToggleVisibility, refreshTick,
}: QueueViewProps): React.ReactElement {
  const [queues, setQueues] = useState<QueueInfo[]>(() => listQueues(projectRoot));
  const [activeQueueIdx, setActiveQueueIdx] = useState(0);
  const [tasks, setTasks] = useState<QueueTask[]>(() => {
    const q = listQueues(projectRoot);
    return q.length > 0 ? loadQueue(projectRoot, q[0].name) : [];
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [screen, setScreen] = useState<Screen>("list");
  const [inputBuffer, setInputBuffer] = useState("");
  const [editIndex, setEditIndex] = useState(-1);
  const [statusMsg, setStatusMsg] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeQueue = queues[activeQueueIdx];
  const panelWidth = Math.min(screenWidth, 100);
  const primaryColor = "#D4704B";

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMsg(""), 3000);
  }, []);

  const refreshQueues = useCallback(() => { setQueues(listQueues(projectRoot)); }, [projectRoot]);
  const refreshTasks = useCallback(() => {
    if (activeQueue) setTasks(loadQueue(projectRoot, activeQueue.name));
  }, [projectRoot, activeQueue]);

  const switchQueue = useCallback((idx: number) => {
    setActiveQueueIdx(idx); setSelectedIndex(0); setScreen("list"); setInputBuffer(""); setEditIndex(-1);
  }, []);

  useEffect(() => {
    if (activeQueue) setTasks(loadQueue(projectRoot, activeQueue.name));
  }, [projectRoot, activeQueue]);

  const pendingCount = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);
  const filteredHistory = useMemo(() => promptHistory.filter((h) => h.length > 0 && !h.startsWith("/")), [promptHistory]);

  // Auto-refresh when refreshTick changes (new items auto-pushed from App)
  const _refreshTick = refreshTick ?? 0;
  useEffect(() => {
    refreshQueues();
    refreshTasks();
  }, [_refreshTick, refreshQueues, refreshTasks]);
  useTerminalInput(
    (input, key) => {
      if (screen === "add") {
        if (key.escape) { setScreen("list"); setInputBuffer(""); return; }
        if (key.return) {
          const trimmed = inputBuffer.trim();
          if (trimmed && activeQueue) {
            const task = addTask(projectRoot, activeQueue.name, trimmed);
            showStatus(task ? `Added: "${trimmed.slice(0, 60)}"` : "Failed to add");
            refreshTasks(); refreshQueues();
          }
          setInputBuffer(""); setScreen("list"); return;
        }
        if (key.backspace) { setInputBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) { setInputBuffer((b) => b + input); }
        return;
      }
      if (screen === "edit") {
        if (key.escape) { setScreen("list"); setInputBuffer(""); setEditIndex(-1); return; }
        if (key.return) {
          const trimmed = inputBuffer.trim();
          if (trimmed && activeQueue && editIndex >= 0) {
            updateTask(projectRoot, activeQueue.name, editIndex, trimmed);
            showStatus(`Updated: "${trimmed.slice(0, 60)}"`); refreshTasks();
          }
          setInputBuffer(""); setScreen("list"); setEditIndex(-1); return;
        }
        if (key.backspace) { setInputBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) { setInputBuffer((b) => b + input); }
        return;
      }
      if (screen === "confirm-clear") {
        if (key.escape) { setScreen("list"); return; }
        if (key.return && activeQueue) {
          clearQueue(projectRoot, activeQueue.name); showStatus("Queue cleared");
          refreshTasks(); refreshQueues(); setScreen("list");
        }
        return;
      }
      if (screen === "queue-menu") {
        if (key.escape) { setScreen("list"); return; }
        if (key.return) {
          const trimmed = inputBuffer.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
          if (trimmed) {
            if (addNamedQueue(projectRoot, trimmed)) showStatus(`Queue "${trimmed}" created`);
            else showStatus(`Queue "${trimmed}" already exists`);
            refreshQueues();
          }
          setInputBuffer(""); setScreen("list"); return;
        }
        if (key.backspace) { setInputBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) { setInputBuffer((b) => b + input); }
        return;
      }

      if (showHistory) {
        if (key.escape) { setShowHistory(false); return; }
        if (key.return && filteredHistory.length > 0 && activeQueue) {
          const sel = filteredHistory[historyIndex];
          if (sel) {
            addTask(projectRoot, activeQueue.name, sel);
            showStatus(`Pulled: "${sel.slice(0, 60)}"`); refreshTasks(); refreshQueues();
          }
          setShowHistory(false); return;
        }
        if (key.upArrow) { setHistoryIndex((i) => Math.max(0, i - 1)); return; }
        if (key.downArrow) { setHistoryIndex((i) => Math.min(filteredHistory.length - 1, i + 1)); return; }
        return;
      }
      if (key.escape || (key.ctrl && (input === "o" || input === "O"))) { onExit(); return; }
      if (key.tab && queues.length > 0) { switchQueue((activeQueueIdx + 1) % queues.length); return; }
      if (/^[1-9]$/.test(input)) {
        const idx = parseInt(input) - 1;
        if (idx < queues.length) { switchQueue(idx); return; }
      }
      if (key.return && tasks.length > 0) {
        const sel = tasks[selectedIndex];
        if (sel && activeQueue) {
          toggleTask(projectRoot, activeQueue.name, selectedIndex);
          showStatus(sel.done ? "Re-opened" : "Completed");
          refreshTasks(); refreshQueues();
        }
        return;
      }
      if (key.upArrow) { setSelectedIndex((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelectedIndex((i) => Math.min(tasks.length - 1, i + 1)); return; }
      if (input === "e" || input === "E") {
        if (tasks.length > 0) {
          const sel = tasks[selectedIndex];
          setEditIndex(selectedIndex); setInputBuffer(sel.text); setScreen("edit");
        }
        return;
      }
      if (input === "a" || input === "A") { setScreen("add"); setInputBuffer(""); return; }
      if (input === "h" || input === "H") {
        if (filteredHistory.length > 0) { setShowHistory(true); setHistoryIndex(0); }
        else showStatus("No history available");
        return;
      }
      if ((input === "d" || input === "D" || key.delete) && tasks.length > 0 && activeQueue) {
        const sel = tasks[selectedIndex];
        if (sel) {
          removeTask(projectRoot, activeQueue.name, selectedIndex);
          showStatus("Removed"); refreshTasks(); refreshQueues();
          setSelectedIndex((i) => Math.min(i, tasks.length - 2));
        }
        return;
      }
      if (input === "c" || input === "C") {
        if (tasks.length > 0) setScreen("confirm-clear");
        else showStatus("Queue is already empty");
        return;
      }
      if (input === "p" || input === "P") {
        if (activeQueue) {
          const next = getNextPendingTask(projectRoot, activeQueue.name);
          if (next) onProcessTask(next.text);
          else showStatus("No pending tasks");
        }
        return;
      }
      if (input === "q" || input === "Q") { setScreen("queue-menu"); setInputBuffer(""); return; }
      if (input === "v" || input === "V") { onToggleVisibility(); return; }
      if (key.shift && key.upArrow && tasks.length > 0 && activeQueue && selectedIndex > 0) {
        moveTask(projectRoot, activeQueue.name, selectedIndex, selectedIndex - 1);
        setSelectedIndex((i) => i - 1); refreshTasks();
        return;
      }
      if (key.shift && key.downArrow && tasks.length > 0 && activeQueue && selectedIndex < tasks.length - 1) {
        moveTask(projectRoot, activeQueue.name, selectedIndex, selectedIndex + 1);
        setSelectedIndex((i) => i + 1); refreshTasks();
        return;
      }
    },
    { isActive: queueVisible }
  );
  useTerminalInput(
    (input, key) => {
      if (screen === "add") {
        if (key.escape) { setScreen("list"); setInputBuffer(""); return; }
        if (key.return) {
          const trimmed = inputBuffer.trim();
          if (trimmed && activeQueue) {
            const task = addTask(projectRoot, activeQueue.name, trimmed);
            showStatus(task ? `Added: "${trimmed.slice(0, 60)}"` : "Failed to add");
            refreshTasks(); refreshQueues();
          }
          setInputBuffer(""); setScreen("list"); return;
        }
        if (key.backspace) { setInputBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) { setInputBuffer((b) => b + input); }
        return;
      }
      if (screen === "edit") {
        if (key.escape) { setScreen("list"); setInputBuffer(""); setEditIndex(-1); return; }
        if (key.return) {
          const trimmed = inputBuffer.trim();
          if (trimmed && activeQueue && editIndex >= 0) {
            updateTask(projectRoot, activeQueue.name, editIndex, trimmed);
            showStatus(`Updated: "${trimmed.slice(0, 60)}"`); refreshTasks();
          }
          setInputBuffer(""); setScreen("list"); setEditIndex(-1); return;
        }
        if (key.backspace) { setInputBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) { setInputBuffer((b) => b + input); }
        return;
      }
      if (screen === "confirm-clear") {
        if (key.escape) { setScreen("list"); return; }
        if (key.return && activeQueue) {
          clearQueue(projectRoot, activeQueue.name); showStatus("Queue cleared");
          refreshTasks(); refreshQueues(); setScreen("list");
        }
        return;
      }
      if (screen === "queue-menu") {
        if (key.escape) { setScreen("list"); return; }
        if (key.return) {
          const trimmed = inputBuffer.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
          if (trimmed) {
            if (addNamedQueue(projectRoot, trimmed)) showStatus(`Queue "${trimmed}" created`);
            else showStatus(`Queue "${trimmed}" already exists`);
            refreshQueues();
          }
          setInputBuffer(""); setScreen("list"); return;
        }
        if (key.backspace) { setInputBuffer((b) => b.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && !key.escape && !key.return) { setInputBuffer((b) => b + input); }
        return;
      }

      if (showHistory) {
        if (key.escape) { setShowHistory(false); return; }
        if (key.return && filteredHistory.length > 0 && activeQueue) {
          const sel = filteredHistory[historyIndex];
          if (sel) {
            addTask(projectRoot, activeQueue.name, sel);
            showStatus(`Pulled: "${sel.slice(0, 60)}"`); refreshTasks(); refreshQueues();
          }
          setShowHistory(false); return;
        }
        if (key.upArrow) { setHistoryIndex((i) => Math.max(0, i - 1)); return; }
        if (key.downArrow) { setHistoryIndex((i) => Math.min(filteredHistory.length - 1, i + 1)); return; }
        return;
      }
      if (key.escape || (key.ctrl && (input === "o" || input === "O"))) { onExit(); return; }
      if (key.tab && queues.length > 0) { switchQueue((activeQueueIdx + 1) % queues.length); return; }
      if (/^[1-9]$/.test(input)) {
        const idx = parseInt(input) - 1;
        if (idx < queues.length) { switchQueue(idx); return; }
      }
      if (key.return && tasks.length > 0) {
        const sel = tasks[selectedIndex];
        if (sel && activeQueue) {
          toggleTask(projectRoot, activeQueue.name, selectedIndex);
          showStatus(sel.done ? "Re-opened" : "Completed");
          refreshTasks(); refreshQueues();
        }
        return;
      }
      if (key.upArrow) { setSelectedIndex((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelectedIndex((i) => Math.min(tasks.length - 1, i + 1)); return; }
      if (input === "e" || input === "E") {
        if (tasks.length > 0) {
          const sel = tasks[selectedIndex];
          setEditIndex(selectedIndex); setInputBuffer(sel.text); setScreen("edit");
        }
        return;
      }
      if (input === "a" || input === "A") { setScreen("add"); setInputBuffer(""); return; }
      if (input === "h" || input === "H") {
        if (filteredHistory.length > 0) { setShowHistory(true); setHistoryIndex(0); }
        else showStatus("No history available");
        return;
      }
      if ((input === "d" || input === "D" || key.delete) && tasks.length > 0 && activeQueue) {
        const sel = tasks[selectedIndex];
        if (sel) {
          removeTask(projectRoot, activeQueue.name, selectedIndex);
          showStatus("Removed"); refreshTasks(); refreshQueues();
          setSelectedIndex((i) => Math.min(i, tasks.length - 2));
        }
        return;
      }
      if (input === "c" || input === "C") {
        if (tasks.length > 0) setScreen("confirm-clear");
        else showStatus("Queue is already empty");
        return;
      }
      if (input === "p" || input === "P") {
        if (activeQueue) {
          const next = getNextPendingTask(projectRoot, activeQueue.name);
          if (next) onProcessTask(next.text);
          else showStatus("No pending tasks");
        }
        return;
      }
      if (input === "q" || input === "Q") { setScreen("queue-menu"); setInputBuffer(""); return; }
      if (input === "v" || input === "V") { onToggleVisibility(); return; }
      if (key.shift && key.upArrow && tasks.length > 0 && activeQueue && selectedIndex > 0) {
        moveTask(projectRoot, activeQueue.name, selectedIndex, selectedIndex - 1);
        setSelectedIndex((i) => i - 1); refreshTasks();
        return;
      }
      if (key.shift && key.downArrow && tasks.length > 0 && activeQueue && selectedIndex < tasks.length - 1) {
        moveTask(projectRoot, activeQueue.name, selectedIndex, selectedIndex + 1);
        setSelectedIndex((i) => i + 1); refreshTasks();
        return;
      }
    },
    { isActive: queueVisible }
  );

  if (!queueVisible) return React.createElement(Box, {}, null);
  if (screen === "add") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Text bold color={primaryColor}>+ Add Task to "{activeQueue?.label}"</Text>
        <Box marginTop={1} paddingX={1}>
          <Text bold color={primaryColor}>&gt; </Text>
          <Text>{inputBuffer || ""}</Text>
          <Text dimColor>{inputBuffer.length === 0 ? "Type task and press Enter..." : "|"}</Text>
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to save . Esc to cancel</Text></Box>
      </Box>
    );
  }
  if (screen === "edit") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Text bold color={primaryColor}>Edit Task #{editIndex + 1}</Text>
        <Box marginTop={1} paddingX={1}>
          <Text bold color={primaryColor}>&gt; </Text>
          <Text>{inputBuffer || ""}</Text>
          <Text dimColor>|</Text>
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to save . Esc to cancel</Text></Box>
      </Box>
    );
  }
  if (screen === "confirm-clear") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Box paddingY={1}><Text bold color="red">Clear all {tasks.length} tasks from "{activeQueue?.label}"?</Text></Box>
        <Box><Text dimColor>Press Enter to confirm . Esc to cancel</Text></Box>
      </Box>
    );
  }
  if (screen === "queue-menu") {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Text bold color={primaryColor}>Manage Queues</Text>
        <Box marginTop={1} flexDirection="column" paddingX={1}>
          {queues.map((q, i) => (
            <Box key={q.name} flexDirection="row">
              <Text bold={i === activeQueueIdx} color={i === activeQueueIdx ? primaryColor : undefined}>
                {i === activeQueueIdx ? "> " : "  "}{q.label}
              </Text>
              <Text dimColor> ({q.taskCount} tasks)</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text bold color={primaryColor}>&gt; </Text>
          <Text>{inputBuffer || ""}</Text>
          <Text dimColor>{inputBuffer.length === 0 ? "Type new queue name..." : "|"}</Text>
        </Box>
        <Box marginTop={1}><Text dimColor>Enter to create . Esc back . Tab cycles queues</Text></Box>
      </Box>
    );
  }
  if (showHistory) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
        <Text bold color={primaryColor}>Pull from History</Text>
        <Text dimColor>  (Select to add to "{activeQueue?.label}")</Text>
        <Box marginTop={1} flexDirection="column" paddingX={1}>
          {filteredHistory.length === 0 ? (
            <Text dimColor>No history available</Text>
          ) : (
            filteredHistory.slice(-10).reverse().map((h, i) => (
              <Box key={i} flexDirection="row">
                <Text color={i === historyIndex ? primaryColor : undefined} bold={i === historyIndex}>
                  {i === historyIndex ? "> " : "  "}
                </Text>
                <Text wrap="truncate-end" dimColor={i !== historyIndex}>{h.slice(0, 80)}</Text>
              </Box>
            ))
          )}
        </Box>
        <Box marginTop={1}><Text dimColor>Up/Down Select . Enter Pull . Esc Cancel</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={panelWidth} minWidth={60}>
      <Box marginBottom={1} justifyContent="space-between">
        <Box flexDirection="row" gap={1}>
          {queues.map((q, i) => (
            <Box key={q.name} paddingX={1} borderStyle={i === activeQueueIdx ? "round" : undefined}
              borderColor={i === activeQueueIdx ? primaryColor : undefined}>
              <Text bold={i === activeQueueIdx} color={i === activeQueueIdx ? primaryColor : undefined}>
                {q.label}
              </Text>
              <Text dimColor> ({q.pendingCount})</Text>
            </Box>
          ))}
        </Box>
        <Box><Text dimColor>{tasks.length} tasks . {pendingCount} pending</Text></Box>
      </Box>
      {tasks.length === 0 ? (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Queue "{activeQueue?.label}" is empty.</Text>
          <Text dimColor>Press <Text bold color={primaryColor}>A</Text> to add . <Text bold color={primaryColor}>H</Text> pull from history</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box key={task.id} flexDirection="row" paddingY={0}>
                <Box width={2} flexShrink={0}>
                  <Text color={isSelected ? primaryColor : undefined}>{isSelected ? ">" : " "}</Text>
                </Box>
                <Box width={3} flexShrink={0}>
                  <Text color={task.done ? "green" : "yellow"} bold>{task.done ? "v" : "o"}</Text>
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
          Tab Switch . 1-9 Jump . Up/Down Nav . <Text bold color={primaryColor}>E</Text>dit . <Text bold color={primaryColor}>A</Text>dd
          . <Text bold color={primaryColor}>D</Text>el . <Text bold color={primaryColor}>C</Text>lear . <Text bold color={primaryColor}>P</Text>rocess
          . <Text bold color={primaryColor}>H</Text>istory . <Text bold color={primaryColor}>Q</Text>ueues . <Text bold color={primaryColor}>V</Text> Hide
          . Shift+Up/Down Move
        </Text>
      </Box>
    </Box>
  );
});

export default QueueView;
