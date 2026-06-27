import {
  readStoredSessionDetail,
  readStoredSessionMessages,
  readStoredSessions,
  type RecentSessionSummary,
  type StoredSessionDetail,
} from "../common/project-storage";

export async function runSessionsCommand(
  input: {
    cwd: string;
    action?: "list" | "show";
    sessionId?: string;
    outputMode?: "text" | "json";
  },
  deps: {
    readSessions?: (cwd: string) => RecentSessionSummary[];
    readSessionDetail?: (cwd: string, sessionId: string) => StoredSessionDetail | null;
    readSessionMessages?: (
      cwd: string,
      sessionId: string,
      limit?: number
    ) => Array<{ role?: string; content?: string | null }>;
    writeStdout?: (text: string) => void;
  } = {}
): Promise<void> {
  const action = input.action ?? "list";
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text));
  const readSessions = deps.readSessions ?? ((cwd: string) => readStoredSessions(cwd));
  const readSessionDetail =
    deps.readSessionDetail ?? ((cwd: string, sessionId: string) => readStoredSessionDetail(cwd, sessionId));
  const readSessionMessages =
    deps.readSessionMessages ??
    ((cwd: string, sessionId: string, limit = 8) => readStoredSessionMessages(cwd, sessionId, limit));

  if (action === "show") {
    const session = input.sessionId ? readSessionDetail(input.cwd, input.sessionId) : null;
    const messages = session && input.sessionId ? readSessionMessages(input.cwd, input.sessionId, 8) : [];
    if (input.outputMode === "json") {
      writeStdout(`${JSON.stringify({ action, session, messages })}\n`);
      return;
    }
    if (!session) {
      writeStdout(`Session not found: ${input.sessionId ?? "(missing id)"}\n`);
      return;
    }
    const lines = [
      "ANNG session",
      `${session.id}\t${session.status}\t${session.summary ?? "<no summary>"}`,
      session.failReason ? `fail=${session.failReason}` : "",
      ...messages.map((message) => `[${message.role ?? "unknown"}] ${message.content ?? ""}`),
    ].filter(Boolean);
    writeStdout(`${lines.join("\n")}\n`);
    return;
  }

  const sessions = readSessions(input.cwd);
  if (input.outputMode === "json") {
    writeStdout(`${JSON.stringify({ action, sessions })}\n`);
    return;
  }
  const lines = [
    "ANNG sessions",
    ...(sessions.length > 0
      ? sessions.map(
          (session) => `${session.id}\t${session.status}\t${session.updateTime}\t${session.summary ?? "<no summary>"}`
        )
      : ["No stored sessions."]),
  ];
  writeStdout(`${lines.join("\n")}\n`);
}
