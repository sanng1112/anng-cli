import React, { useMemo, useState } from "react";
import { Box, Text, useWindowSize } from "ink";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { useAppContext } from "../contexts";
import { useTerminalInput } from "../hooks/useTerminalInput";
import { getGoalSnapshot } from "../../common/goal-store";
import { getGeminiKeyInventory } from "../../common/gemini-keys-sync";
import { getActiveRotatorsStats } from "../../common/openai-client";
import { getProjectStorageSnapshot } from "../../common/project-storage";
import { getCompactPromptTokenThreshold, type SessionStatus } from "../../session";
import type { PermissionDefaultMode } from "../../settings";

type QueryViewProps = {
  projectRoot: string;
  sessionInfo: {
    activeSessionId: string | null;
    activeStatus: SessionStatus | null;
    activeTokens: number;
    messageCount: number;
    sessionCount: number;
  };
  modelInfo: {
    model: string;
    baseURL: string;
    thinkingEnabled: boolean;
    reasoningEffort: string;
  };
  runtimeInfo: {
    executionMode: "default" | "plan" | "autoAccept";
    permissionDefaultMode: PermissionDefaultMode;
  };
  topic?: string;
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

type StatusSection = {
  section: string;
  rows: Array<{ label: string; value: string }>;
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

function getProjectStats(projectRoot: string): { fileCount: number; totalSizeMB: string } {
  let fileCount = 0;
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      try {
        const fullPath = path.join(projectRoot, entry.name);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          fileCount++;
          totalSize += stat.size;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return { fileCount, totalSizeMB: `${(totalSize / 1024 / 1024).toFixed(1)} MB` };
}

function buildDivider(width: number): string {
  return "─".repeat(Math.max(12, width));
}

function formatExecutionMode(runtimeInfo: QueryViewProps["runtimeInfo"]): string {
  if (runtimeInfo.executionMode === "autoAccept") {
    return "Workspace (Auto approve)";
  }
  if (runtimeInfo.executionMode === "plan") {
    return "Workspace (Plan mode)";
  }
  return runtimeInfo.permissionDefaultMode === "allowAll" ? "Workspace (Allow all)" : "Workspace (Ask for approval)";
}

function formatCollaborationMode(runtimeInfo: QueryViewProps["runtimeInfo"]): string {
  if (runtimeInfo.executionMode === "plan") {
    return "Plan";
  }
  if (runtimeInfo.executionMode === "autoAccept") {
    return "Auto Accept";
  }
  return "Default";
}

function formatModelSummary(modelInfo: QueryViewProps["modelInfo"]): string {
  if (!modelInfo.thinkingEnabled) {
    return modelInfo.model;
  }
  return `${modelInfo.model} (reasoning ${modelInfo.reasoningEffort})`;
}

function formatContextWindow(model: string, activeTokens: number): string {
  const threshold = getCompactPromptTokenThreshold(model);
  const remainingRatio = Math.max(0, 1 - activeTokens / threshold);
  const remainingPercent = Math.round(remainingRatio * 100);
  return `${remainingPercent}% left (${formatCompactNumber(activeTokens)} used / ${formatCompactNumber(threshold)})`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

function findAgentsMd(projectRoot: string): string {
  const projectAgentsPath = path.join(projectRoot, ".anng", "AGENTS.md");
  if (fs.existsSync(projectAgentsPath)) {
    return "./.anng/AGENTS.md";
  }
  const repoAgentsPath = path.join(projectRoot, "AGENTS.md");
  if (fs.existsSync(repoAgentsPath)) {
    return "./AGENTS.md";
  }
  return "<none>";
}

export const QueryView = React.memo(function QueryView({
  projectRoot,
  sessionInfo,
  modelInfo,
  runtimeInfo,
  topic,
  onExit,
}: QueryViewProps): React.ReactElement {
  const { version } = useAppContext();
  const { columns } = useWindowSize();
  const [stats] = useState<SystemStats>(getSystemStats);
  const [projectStats] = useState(() => getProjectStats(projectRoot));
  const panelWidth = Math.max(20, Math.min(columns ?? 80, 108));
  const contentWidth = Math.max(18, panelWidth - 4);
  const normalizedTopic = (topic ?? "").trim().toLowerCase();

  const rotationStats = useMemo(() => {
    try {
      return getActiveRotatorsStats();
    } catch {
      return [];
    }
  }, []);

  const geminiInventory = useMemo(() => {
    try {
      return getGeminiKeyInventory(projectRoot);
    } catch {
      return { userKeys: [], downloadedKeys: [], quarantinedKeys: [] };
    }
  }, [projectRoot]);

  const goalSnapshot = useMemo(() => getGoalSnapshot(projectRoot), [projectRoot]);
  const storageSnapshot = useMemo(() => getProjectStorageSnapshot(projectRoot), [projectRoot]);

  const sections = useMemo(() => {
    const list: StatusSection[] = [
      {
        section: "Session",
        rows: [
          {
            label: "Active Session",
            value: sessionInfo.activeSessionId ? sessionInfo.activeSessionId.slice(0, 8) + "..." : "None",
          },
          { label: "Session Status", value: sessionInfo.activeStatus ?? "idle" },
          { label: "Messages", value: String(sessionInfo.messageCount) },
          { label: "Total Sessions", value: String(sessionInfo.sessionCount) },
        ],
      },
      {
        section: "Goal",
        rows: [
          { label: "Active Goal", value: goalSnapshot.activeGoal?.text ?? "None" },
          { label: "Total Goals", value: String(goalSnapshot.totalGoals) },
          { label: "Completed Goals", value: String(goalSnapshot.completedGoals) },
          { label: "Store", value: goalSnapshot.storagePath },
        ],
      },
      {
        section: "Project",
        rows: [
          { label: "Root", value: projectRoot },
          { label: "Files", value: String(projectStats.fileCount) },
          { label: "Size", value: projectStats.totalSizeMB },
          { label: "Project Code", value: storageSnapshot.projectCode },
        ],
      },
      {
        section: "Storage",
        rows: [
          { label: "Project DB Dir", value: storageSnapshot.projectDir },
          { label: "Project DB Ready", value: storageSnapshot.projectDirExists ? "yes" : "no" },
          { label: "Sessions Index", value: storageSnapshot.sessionsIndexPath },
          { label: "Sessions Index Present", value: storageSnapshot.sessionsIndexExists ? "yes" : "no" },
          { label: "Goals Store", value: storageSnapshot.goalsPath },
          { label: "Goals Store Present", value: storageSnapshot.goalsExists ? "yes" : "no" },
          { label: "Local DB Manifest", value: storageSnapshot.localDbPath },
          { label: "Local DB Present", value: storageSnapshot.localDbExists ? "yes" : "no" },
          { label: "Queue Dir", value: storageSnapshot.queueDir },
          { label: "Queue Files", value: String(storageSnapshot.queueFileCount) },
        ],
      },
      {
        section: "System",
        rows: [
          { label: "Platform", value: stats.platform },
          { label: "CPU", value: `${stats.cpuModel} (${stats.cpuCores} cores)` },
          { label: "Memory", value: `${stats.freeMemory} free / ${stats.totalMemory} total` },
          { label: "Node.js", value: stats.nodeVersion },
          { label: "Uptime", value: stats.uptime },
        ],
      },
    ];

    if (rotationStats.length > 0) {
      for (const provider of rotationStats) {
        list.push({
          section: `Key Pool: ${provider.providerLabel}`,
          rows: [
            { label: "Base URL", value: provider.baseURL },
            { label: "Total Keys", value: String(provider.totalKeys) },
            { label: "Usable Keys", value: String(provider.usableKeys) },
            { label: "Active Now", value: String(provider.activeKeys) },
            { label: "Cooling Down", value: String(provider.cooldownKeys) },
            { label: "Rate Limited", value: String(provider.rateLimitedKeys) },
            { label: "Invalid", value: String(provider.invalidKeys) },
            { label: "Requests / Failures", value: `${provider.totalRequests} / ${provider.totalFailures}` },
          ],
        });

        if (provider.globalQuota) {
          list.push({
            section: `Global Quota: ${provider.providerLabel}`,
            rows: [
              { label: "State File", value: provider.globalQuota.statePath },
              { label: "Tracked Keys", value: String(provider.globalQuota.totalTrackedKeys) },
              { label: "Usable Keys", value: String(provider.globalQuota.usableKeys) },
              { label: "Active Now", value: String(provider.globalQuota.activeKeys) },
              { label: "Rate Limited", value: String(provider.globalQuota.rateLimitedKeys) },
              { label: "Invalid", value: String(provider.globalQuota.invalidKeys) },
              {
                label: "Next Recovery",
                value:
                  provider.globalQuota.nextAvailableInSec > 0 ? `${provider.globalQuota.nextAvailableInSec}s` : "ready",
              },
            ],
          });

          const constrainedGlobalKeys = provider.globalQuota.keyStats
            .filter((stat) => stat.status !== "active")
            .slice(0, 8);
          if (constrainedGlobalKeys.length > 0) {
            list.push({
              section: `Global Key Detail: ${provider.providerLabel}`,
              rows: constrainedGlobalKeys.map((stat, index) => ({
                label: `Key #${index + 1} (${stat.maskedKey})`,
                value:
                  stat.status === "invalid"
                    ? `invalid | ${stat.invalidReason ?? "no reason recorded"}`
                    : `rate-limited ${stat.waitSec}s | ${stat.recentRequests} recent reqs`,
              })),
            });
          }
        }

        const problematicKeys = provider.keyStats.filter((stat) => stat.status !== "active").slice(0, 8);
        if (problematicKeys.length > 0) {
          list.push({
            section: `Key Detail: ${provider.providerLabel}`,
            rows: problematicKeys.map((stat, index) => ({
              label: `Key #${index + 1} (${stat.maskedKey})`,
              value:
                stat.status === "cooldown"
                  ? `cooldown ${stat.cooldownRemainingSec}s | ${stat.requests} reqs / ${stat.failures} errs`
                  : stat.status === "rate_limited"
                    ? `rate-limited ${stat.rateLimitRemainingSec}s | ${stat.requests} reqs / ${stat.failures} errs`
                    : `invalid | ${stat.requests} reqs / ${stat.failures} errs`,
            })),
          });
        }
      }
    }

    if (geminiInventory.userKeys.length > 0 || geminiInventory.quarantinedKeys.length > 0) {
      list.push({
        section: "Gemini Key Files",
        rows: [
          { label: "User Store Keys", value: String(geminiInventory.userKeys.length) },
          { label: "Downloads Keys", value: String(geminiInventory.downloadedKeys.length) },
          { label: "Quarantined Keys", value: String(geminiInventory.quarantinedKeys.length) },
          {
            label: "Downloads Import",
            value:
              geminiInventory.userKeys.length > 0
                ? "Bootstrap only; existing user store stays authoritative"
                : "Bootstrap pending",
          },
        ],
      });

      if (geminiInventory.quarantinedKeys.length > 0) {
        list.push({
          section: "Gemini Quarantine",
          rows: geminiInventory.quarantinedKeys.slice(0, 8).map((entry, index) => ({
            label: `Key #${index + 1} (${entry.key.slice(0, 6)}...)`,
            value: `${entry.reason} | last seen ${entry.lastDetectedAt}`,
          })),
        });
      }
    }

    if (!normalizedTopic) {
      return list;
    }

    return list.filter((section) => {
      if (section.section.toLowerCase().includes(normalizedTopic)) {
        return true;
      }
      return section.rows.some(
        (row) => row.label.toLowerCase().includes(normalizedTopic) || row.value.toLowerCase().includes(normalizedTopic)
      );
    });
  }, [
    geminiInventory,
    goalSnapshot,
    normalizedTopic,
    projectRoot,
    projectStats,
    rotationStats,
    sessionInfo,
    stats,
    storageSnapshot,
  ]);

  useTerminalInput(
    (input, key) => {
      if (key.escape || (key.ctrl && (input === "o" || input === "O")) || key.return) {
        onExit();
      }
    },
    { isActive: true }
  );

  const primaryColor = "#D4704B";

  return (
    <Box flexDirection="column" paddingX={1} width={panelWidth}>
      <Box borderStyle="round" borderColor={primaryColor} flexDirection="column" paddingX={1} marginBottom={1}>
        <Box flexDirection="row">
          <Text bold color={primaryColor}>
            {">"}_ ANNG Status
          </Text>
          <Text dimColor> (Esc or Enter to close)</Text>
        </Box>
        <Text color={primaryColor}>{buildDivider(contentWidth)}</Text>
        <StatusRow label="Version" value={`v${version || "unknown"}`} />
        <StatusRow label="Model" value={formatModelSummary(modelInfo)} />
        <StatusRow label="Directory" value={projectRoot} />
        <StatusRow label="Permissions" value={formatExecutionMode(runtimeInfo)} />
        <StatusRow label="Agents.md" value={findAgentsMd(projectRoot)} />
        <StatusRow label="Collaboration mode" value={formatCollaborationMode(runtimeInfo)} />
        <StatusRow label="Session" value={sessionInfo.activeSessionId ?? "<none>"} />
        <StatusRow label="Goal" value={goalSnapshot.activeGoal?.text ?? "<none>"} />
        <StatusRow label="Context window" value={formatContextWindow(modelInfo.model, sessionInfo.activeTokens)} />
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text color={primaryColor}>{buildDivider(contentWidth)}</Text>
        {normalizedTopic ? (
          <Text dimColor>Filter: {normalizedTopic}</Text>
        ) : (
          <Text dimColor>Overview of sessions, goals, storage, system, and key pools</Text>
        )}
      </Box>

      {sections.length === 0 ? (
        <Box marginLeft={2}>
          <Text dimColor>No sections match the current filter.</Text>
        </Box>
      ) : (
        sections.map((section, sectionIndex) => (
          <Box key={sectionIndex} flexDirection="column" marginBottom={1}>
            <Text bold color={primaryColor}>
              {section.section}
            </Text>
            {section.rows.map((row, rowIndex) => (
              <Box key={rowIndex} flexDirection="row" marginLeft={2}>
                <Text wrap="truncate-end" dimColor>
                  {row.label}:{" "}
                </Text>
                <Text wrap="truncate-end">{row.value}</Text>
              </Box>
            ))}
          </Box>
        ))
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={primaryColor}>{buildDivider(contentWidth)}</Text>
        <Text dimColor>{"Tip: `/status keys`, `/status gemini`, `/status goal`, `/goal <text>`, `/goal done`"}</Text>
      </Box>
    </Box>
  );
});

function StatusRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Box width={22}>
        <Text>{label}:</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="truncate-end">{value}</Text>
      </Box>
    </Box>
  );
}

export default QueryView;
