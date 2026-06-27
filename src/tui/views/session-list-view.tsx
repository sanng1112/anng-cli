import React from "react";

export type SessionListViewProps = {
  sessions: Array<{ id: string; summary: string | null; status: string }>;
};

export function SessionListView({ sessions }: SessionListViewProps): React.ReactElement {
  return (
    <>
      {"Recent Sessions\n"}
      {sessions.map((session) => `${session.id} ${session.status} ${session.summary ?? "<no summary>"}`).join("\n")}
    </>
  );
}
