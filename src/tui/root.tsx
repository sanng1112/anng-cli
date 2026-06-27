import React from "react";
import { Box, Text } from "ink";
import { ChatView } from "./views/chat-view";
import { ConfigView } from "./views/config-view";
import { HomeView } from "./views/home-view";
import { SessionListView } from "./views/session-list-view";
import { ContextView } from "./views/context-view";
import { anngPalette } from "./palette";
import type { DoctorStatus } from "../commands/doctor";
import type { ProjectStorageSnapshot, RecentSessionSummary } from "../common/project-storage";
import type { DaemonManifest } from "../core/team/daemon-state";
import type { ResolvedDeepcodingSettings } from "../settings";
import type { SessionMessageRole } from "../session/types";

export type RootViewProps = {
  initialPrompt?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  mode?: "interactive" | "plan" | "yolo";
  teamMode?: boolean;
  teamTmux?: boolean;
  contextHints?: string[];
  ruleSources?: string[];
  settings?: ResolvedDeepcodingSettings;
  doctor?: DoctorStatus;
  storage?: ProjectStorageSnapshot;
  recentSessions?: RecentSessionSummary[];
  latestTranscript?: Array<{ role?: SessionMessageRole; content?: string | null }>;
  recentDaemonTasks?: DaemonManifest[];
  app?: React.ReactNode;
  chat?: {
    answer: string;
    status: string | null;
    failReason: string | null;
    errorLine?: string | null;
  };
};

export function RootView({
  initialPrompt,
  cwd,
  provider,
  model,
  mode = "interactive",
  teamMode = false,
  teamTmux = false,
  contextHints = [],
  ruleSources = [],
  settings,
  doctor,
  storage,
  recentSessions = [],
  latestTranscript = [],
  recentDaemonTasks = [],
  app,
  chat,
}: RootViewProps): React.ReactElement {
  const providerLabel = provider ?? "auto";
  const modelLabel = model ?? "auto";
  const teamLabel = teamMode ? (teamTmux ? "team/tmux" : "team/internal") : "solo";

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color={anngPalette.accent}>ANNG // Terminal First Autonomy</Text>
        <Text dimColor>
          mode={mode} provider={providerLabel} model={modelLabel} team={teamLabel}
        </Text>
        {cwd ? <Text dimColor>cwd={cwd}</Text> : null}
        {initialPrompt ? <Text dimColor>prompt={initialPrompt}</Text> : null}
      </Box>
      {cwd && settings && doctor ? (
        <Box marginBottom={1}>
          <ContextView hints={contextHints} ruleSources={ruleSources} memoryDir={doctor.memoryDir} />
          <HomeView
            cwd={cwd}
            mode={mode}
            provider={providerLabel}
            model={modelLabel}
            teamLabel={teamLabel}
            contextHints={contextHints}
            storage={storage}
            recentSessions={recentSessions}
            latestTranscript={latestTranscript}
            recentDaemonTasks={recentDaemonTasks}
          />
          <SessionListView
            sessions={recentSessions.map((session) => ({
              id: session.id,
              summary: session.summary,
              status: session.status,
            }))}
          />
          <ConfigView settings={settings} doctor={doctor} />
        </Box>
      ) : null}
      {app ?? (
        <ChatView
          showReasoning={settings?.thinkingEnabled ?? false}
          answer={chat?.answer ?? ""}
          status={chat?.status}
          failReason={chat?.failReason}
          errorLine={chat?.errorLine}
        />
      )}
    </Box>
  );
}

export function extractRenderableText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => extractRenderableText(item)).join("");
  }

  if (React.isValidElement(node)) {
    if (typeof node.type === "function") {
      try {
        const rendered = (node.type as (props: unknown) => React.ReactNode)(node.props);
        return extractRenderableText(rendered);
      } catch {
        const props = node.props as { children?: React.ReactNode };
        return extractRenderableText(props.children);
      }
    }
    const props = node.props as { children?: React.ReactNode };
    return extractRenderableText(props.children);
  }

  return "";
}
