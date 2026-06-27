import React from "react";

export function ContextView(props: { hints: string[]; ruleSources: string[]; memoryDir: string }) {
  return (
    <>
      {`Context\nmemoryDir=${props.memoryDir}\n`}
      {`hints=${props.hints.join(", ") || "none"}\n`}
      {`ruleSources=${props.ruleSources.join(", ") || "none"}`}
    </>
  );
}
