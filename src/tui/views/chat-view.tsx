import React from "react";

export type ChatViewProps = {
  showReasoning: boolean;
  reasoning?: string;
  answer: string;
  status?: string | null;
  failReason?: string | null;
  errorLine?: string | null;
};

export function ChatView({
  showReasoning,
  reasoning,
  answer,
  status,
  failReason,
  errorLine,
}: ChatViewProps): React.ReactElement {
  return (
    <>
      {showReasoning && reasoning ? `${reasoning}\n` : null}
      {status ? `Status: ${status}\n` : null}
      {failReason ? `Failed: ${failReason}\n` : null}
      {errorLine ? `Error: ${errorLine}\n` : null}
      {answer}
    </>
  );
}
