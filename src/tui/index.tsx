import React from "react";
import { render } from "ink";
import { AppContainer } from "../ui";
import { getDoctorStatus } from "../commands/doctor";
import { getProjectStorageSnapshot, readRecentSessions, readStoredSessionMessages } from "../common/project-storage";
import { buildProjectContextHints } from "../core/memory/project-memory";
import { listDaemonManifests } from "../core/team/daemon-state";
import { resolveCurrentSettings } from "../settings";
import { RootView } from "./root";
import { createAgentAdapter } from "../runtime/agent-adapter";
import { createSessionShell } from "./session-shell";

export async function renderInteractiveTui(args: {
  cwd: string;
  prompt?: string;
  provider?: string;
  model?: string;
  key?: string;
  baseUrl?: string;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  teamMode?: boolean;
  teamTmux?: boolean;
}): Promise<void> {
  const settings = resolveCurrentSettings(args.cwd);
  const doctor = getDoctorStatus(args.cwd);
  const contextHints = buildProjectContextHints(args.cwd);
  const storage = getProjectStorageSnapshot(args.cwd);
  const recentSessions = readRecentSessions(args.cwd);
  const recentDaemonTasks = listDaemonManifests(args.cwd).slice(0, 5);
  const latestSession = recentSessions[0];
  const latestTranscript =
    latestSession && latestSession.id
      ? readStoredSessionMessages(args.cwd, latestSession.id, 4).map((message) => ({
          role: message.role,
          content: message.content,
        }))
      : [];

  const adapter = await createAgentAdapter({
    cwd: args.cwd,
    provider: args.provider,
    model: args.model,
    key: args.key,
    baseUrl: args.baseUrl,
    autoAccept: args.autoAccept,
    planMode: args.planMode,
    maxTurns: args.maxTurns,
  });

  const shell = createSessionShell({
    submitPrompt: adapter.submitPrompt,
  });

  if (args.prompt) {
    await shell.submit(args.prompt);
  }

  const ink = render(
    React.createElement(RootView, {
      initialPrompt: args.prompt,
      cwd: args.cwd,
      provider: args.provider ?? settings.provider ?? "auto",
      model: args.model ?? settings.model,
      mode: args.autoAccept ? "yolo" : args.planMode ? "plan" : "interactive",
      teamMode: args.teamMode,
      teamTmux: args.teamTmux,
      contextHints,
      settings,
      doctor,
      storage,
      recentSessions,
      latestTranscript,
      recentDaemonTasks,
      chat: {
        answer: shell.getState().answer,
        status: shell.getState().status,
        failReason: shell.getState().failReason,
      },
      app: React.createElement(AppContainer, {
        projectRoot: args.cwd,
        version: "v2-dev",
        initialPrompt: args.prompt,
        autoAccept: args.autoAccept,
        planMode: args.planMode,
        maxTurns: args.maxTurns,
        onRestart: () => {
          // The v2 shell currently delegates restart orchestration to the process-level CLI entrypoint.
        },
        teamMode: args.teamMode,
        teamConfig: {
          mode: args.teamTmux ? "tmux" : "internal",
        },
      }),
    })
  );

  await ink.waitUntilExit();
}

export { RootView, extractRenderableText } from "./root";
export { anngPalette } from "./palette";
export { ChatView } from "./views/chat-view";
export { HomeView } from "./views/home-view";
export { ConfigView } from "./views/config-view";
