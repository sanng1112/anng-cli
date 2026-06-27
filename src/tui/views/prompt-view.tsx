import React from "react";

export type PromptViewProps = {
  value: string;
  placeholder?: string;
};

export function PromptView({ value, placeholder }: PromptViewProps): React.ReactElement {
  return <>{value || placeholder || ""}</>;
}
