import React, { useState, useMemo } from "react";
import { Box, Text } from "ink";
import { useTerminalInput } from "../hooks/useTerminalInput";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

type QueryViewProps = {
  projectRoot: string;
  sessionInfo: {
    activeSessionId: string | null;
    messageCount: number;
    sessionCount: number;
  };
  modelInfo: {
    model: string;
    baseURL: string;
    thinkingEnabled: boolean;
    reasoningEffort: string;
  };
  onExit: () => void;
};

type SystemStats = {
  cpuModel: string;
  cpuCores: number;
  totalMemory: string;
  freeMemory: string;
  nodeVersion: string;
  platform: string;
  uptime: string;
};

function getSystemStats(): SystemStats {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : "unknown";
  const cpuCores = cpus.length;
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const uptimeHours = (os.uptime() / 3600).toFixed(1);
  return {
    cpuModel,
    cpuCores,
    totalMemory: `${totalMem} GB`,
    freeMemory: `${freeMem} GB`,
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()}`,
    uptime: `${uptimeHours}h`,
  };
}

function getProjectStats(projectRoot: string) {
  let fileCount = 0;
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      try {
        const fullPath = path.join(projectRoot, entry.name);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          fileCount++;
          totalSize += stat.size;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
  return { fileCount, totalSizeMB: `${sizeMB} MB` };
}

export const QueryView = React.memo(function QueryView({
  projectRoot,
  sessionInfo,
  modelInfo,
  onExit,
}: QueryViewProps): React.ReactElement {
  const [stats] = useState<SystemStats>(getSystemStats);
  const [projectStats] = useState(() => getProjectStats(projectRoot));

  const items = useMemo(
    () => [
      {
        section: "🤖 Model Configuration",
        rows: [
          { label: "Model", value: modelInfo.model },
          { label: "API Base URL", value: modelInfo.baseURL },
          { label: "Thinking", value: modelInfo.thinkingEnabled ? `Enabled (${modelInfo.reasoningEffort})` : "Disabled" },
        ],
      },
      {
        section: "💬 Session Info",
        rows: [
          { label: "Active Session", value: sessionInfo.activeSessionId ? sessionInfo.activeSessionId.slice(0, 8) + "..." : "None" },
          { label: "Messages", value: String(sessionInfo.messageCount) },
          { label: "Total Sessions", value: String(sessionInfo.sessionCount) },
        ],
      },
      {
        section: "📁 Project",
        rows: [
          { label: "Root", value: projectRoot },
          { label: "Files", value: String(projectStats.fileCount) },
          { label: "Size", value: projectStats.totalSizeMB },
        ],
      },
      {
        section: "🖥️ System",
        rows: [
          { label: "Platform", value: stats.platform },
          { label: "CPU", value: `${stats.cpuModel} (${stats.cpuCores} cores)` },
          { label: "Memory", value: `${stats.freeMemory} free / ${stats.totalMemory} total` },
          { label: "Node.js", value: stats.nodeVersion },
          { label: "Uptime", value: stats.uptime },
        ],
      },
    ],
    [modelInfo, sessionInfo, projectStats, stats, projectRoot]
  );

  useTerminalInput(
    (input, key) => {
      if (key.escape || (key.ctrl && (input === "o" || input === "O")) || key.return) {
        onExit();
        return;
      }
    },
    { isActive: true }
  );

  const primaryColor = "#D4704B";

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={primaryColor} width={80}>
      <Box marginBottom={1}>
        <Text bold color={primaryColor}>
          🔍 ANNG System Query
        </Text>
        <Text dimColor>  (Esc or Enter to close)</Text>
      </Box>
      {items.map((section, si) => (
        <Box key={si} flexDirection="column" marginBottom={1}>
          <Text bold>{section.section}</Text>
          {section.rows.map((row, ri) => (
            <Box key={ri} flexDirection="row" marginLeft={2}>
              <Text wrap="truncate-end" dimColor>
                {row.label}:{" "}
              </Text>
              <Text wrap="truncate-end">{row.value}</Text>
            </Box>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          Tip: Use /query &lt;topic&gt; to filter — e.g., /query model, /query system
        </Text>
      </Box>
    </Box>
  );
});

export default QueryView;
