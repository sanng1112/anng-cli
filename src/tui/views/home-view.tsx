import React from "react";
import { Box, Text } from "ink";
import type { ProjectStorageSnapshot, RecentSessionSummary } from "../../common/project-storage";
import type { DaemonManifest } from "../../core/team/daemon-state";
import type { SessionMessageRole } from "../../session/types";
import { anngPalette } from "../palette";

export function HomeView(props: {
  cwd: string;
  mode: "interactive" | "plan" | "yolo";
  provider: string;
  model: string;
  teamLabel: string;
  contextHints: string[];
  storage?: ProjectStorageSnapshot;
  recentSessions?: RecentSessionSummary[];
  latestTranscript?: Array<{ role?: SessionMessageRole; content?: string | null }>;
  recentDaemonTasks?: DaemonManifest[];
}): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor={anngPalette.accentDim} flexDirection="column" paddingX={1} marginRight={1}>
      <Text color={anngPalette.accent}>Shell</Text>
      <Text>mode={props.mode}</Text>
      <Text>provider={props.provider}</Text>
      <Text>model={props.model}</Text>
      <Text>team={props.teamLabel}</Text>
      <Text dimColor>cwd={props.cwd}</Text>
      <Text dimColor>context={props.contextHints.length > 0 ? props.contextHints.join(", ") : "none"}</Text>
      {props.storage ? (
        <>
          <Text dimColor>projectCode={props.storage.projectCode}</Text>
          <Text dimColor>
            storage={props.storage.projectDirExists ? "ready" : "missing"} sessions=
            {props.storage.sessionsIndexExists ? "yes" : "no"} queues=
            {props.storage.queueFileCount}
          </Text>
        </>
      ) : null}
      <Text color={anngPalette.accent}>Recent Sessions</Text>
      {props.recentSessions && props.recentSessions.length > 0 ? (
        props.recentSessions.slice(0, 3).map((session) => (
          <Text key={session.id} dimColor>
            {session.id.slice(0, 8)} {session.status} {session.summary ?? "<no summary>"}
          </Text>
        ))
      ) : (
        <Text dimColor>none</Text>
      )}
      <Text color={anngPalette.accent}>Latest Transcript</Text>
      {props.latestTranscript && props.latestTranscript.length > 0 ? (
        props.latestTranscript.map((message, index) => (
          <Text key={`${message.role ?? "unknown"}-${index}`} dimColor>
            [{message.role ?? "unknown"}] {compactTranscriptLine(message.content)}
          </Text>
        ))
      ) : (
        <Text dimColor>none</Text>
      )}
      <Text color={anngPalette.accent}>Recent Daemon Tasks</Text>
      {props.recentDaemonTasks && props.recentDaemonTasks.length > 0 ? (
        props.recentDaemonTasks.slice(0, 3).map((task) => (
          <Text key={task.id} dimColor>
            {task.id.slice(0, 8)} {task.status} {task.prompt}
          </Text>
        ))
      ) : (
        <Text dimColor>none</Text>
      )}
    </Box>
  );
}

function compactTranscriptLine(content: string | null | undefined): string {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "<empty>";
  }
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}
