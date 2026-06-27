import React from "react";
import { describe, expect, it } from "vitest";
import { RootView, extractRenderableText } from "../../tui/root";
import { ChatView } from "../../tui/views/chat-view";

describe("RootView", () => {
  it("renders the ANNG-branded shell", () => {
    const node = React.createElement(RootView, {
      initialPrompt: undefined,
      cwd: "/repo",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      mode: "interactive",
      teamMode: true,
      teamTmux: true,
      contextHints: ["README.md", "package.json"],
      settings: {
        env: {},
        apiKey: "sk-test",
        baseURL: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        temperature: undefined,
        thinkingEnabled: true,
        reasoningEffort: "max",
        debugLogEnabled: false,
        telemetryEnabled: false,
        notify: undefined,
        webSearchTool: undefined,
        mcpServers: {},
        permissions: {
          allow: [],
          deny: [],
          ask: [],
          defaultMode: "askAll",
        },
        enabledSkills: {},
        autoAccept: false,
        planMode: false,
        maxTurns: 25,
        headlessPrompt: undefined,
        fullPowerMode: false,
        geminiApiKey: undefined,
        geminiBaseURL: undefined,
        provider: "deepseek",
      },
      doctor: {
        cwd: "/repo",
        nodeVersion: "v22.0.0",
        tmuxInstalled: true,
        settingsPath: "/home/test/.anng/settings.json",
        settingsExists: true,
        memoryDir: "/repo/.anng/memory",
        mcpServerNames: ["git"],
        keyRows: [],
      },
      storage: {
        projectCode: "repo-code",
        projectDir: "/home/test/.anng/projects/repo-code",
        sessionsIndexPath: "/home/test/.anng/projects/repo-code/sessions-index.json",
        goalsPath: "/home/test/.anng/projects/repo-code/goals.json",
        localDbPath: "/home/test/.anng/projects/repo-code/local-db.json",
        memoryDir: "/repo/.anng/memory",
        queueDir: "/repo/.anng/memory/queues",
        agentsMdPath: "/repo/.anng/AGENTS.md",
        projectDirExists: true,
        sessionsIndexExists: true,
        goalsExists: false,
        localDbExists: true,
        queueDirExists: true,
        queueFileCount: 2,
      },
      recentSessions: [
        {
          id: "session-12345678",
          summary: "Fix daemon lifecycle",
          status: "completed",
          updateTime: "2026-01-01T00:00:00.000Z",
        },
      ],
      latestTranscript: [
        {
          role: "user",
          content: "refactor daemon lifecycle and restart handling",
        },
        {
          role: "assistant",
          content: "implemented a safer startup marker and manifest finalization path",
        },
      ],
      recentDaemonTasks: [
        {
          id: "daemon-12345678",
          prompt: "Refactor module x overnight",
          cwd: "/repo",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "running",
        },
      ],
    });
    const text = extractRenderableText(node);

    expect(text).toContain("ANNG // Terminal First Autonomy");
    expect(text).toContain("provider=deepseek");
    expect(text).toContain("model=deepseek-v4-pro");
    expect(text).toContain("team=team/tmux");
    expect(text).toContain("cwd=/repo");
    expect(text).toContain("context=README.md, package.json");
    expect(text).toContain("thinking=true");
    expect(text).toContain("tmux=installed");
    expect(text).toContain("projectCode=repo-code");
    expect(text).toContain("Recent Sessions");
    expect(text).toContain("Fix daemon lifecycle");
    expect(text).toContain("Latest Transcript");
    expect(text).toContain("[user] refactor daemon lifecycle and restart handling");
    expect(text).toContain("[assistant] implemented a safer startup marker");
    expect(text).toContain("Recent Daemon Tasks");
    expect(text).toContain("Refactor module x overnight");
  });

  it("shows reasoning content when the toggle is enabled", () => {
    const node = React.createElement(ChatView, {
      showReasoning: true,
      reasoning: "<think>inspect stack</think>",
      answer: "done",
    });

    expect(extractRenderableText(node)).toContain("<think>inspect stack</think>");
    expect(extractRenderableText(node)).toContain("done");
  });

  it("shows transcript preview including user messages", () => {
    const node = React.createElement(RootView, {
      cwd: "/repo",
      settings: {
        env: {},
        apiKey: "sk-test",
        baseURL: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        temperature: undefined,
        thinkingEnabled: true,
        reasoningEffort: "max",
        debugLogEnabled: false,
        telemetryEnabled: false,
        notify: undefined,
        webSearchTool: undefined,
        mcpServers: {},
        permissions: {
          allow: [],
          deny: [],
          ask: [],
          defaultMode: "askAll",
        },
        enabledSkills: {},
        autoAccept: false,
        planMode: false,
        maxTurns: 25,
        headlessPrompt: undefined,
        fullPowerMode: false,
        geminiApiKey: undefined,
        geminiBaseURL: undefined,
        provider: "deepseek",
      },
      doctor: {
        cwd: "/repo",
        nodeVersion: "v22.0.0",
        tmuxInstalled: true,
        settingsPath: "/home/test/.anng/settings.json",
        settingsExists: true,
        memoryDir: "/repo/.anng/memory",
        mcpServerNames: ["git"],
        keyRows: [],
      },
      latestTranscript: [
        { role: "user", content: "fix parser" },
        { role: "assistant", content: "done" },
      ],
    });
    const text = extractRenderableText(node);
    expect(text).toContain("Latest Transcript");
    expect(text).toContain("[user] fix parser");
  });

  it("asserts that the interactive path contains branding", () => {
    const node = React.createElement(RootView, {});
    const text = extractRenderableText(node);
    expect(text).toContain("ANNG // Terminal First Autonomy");
  });
});
