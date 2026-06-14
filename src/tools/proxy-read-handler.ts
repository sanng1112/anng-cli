import * as fs from "fs";
import type { ToolExecutionContext, ToolExecutionResult } from "./executor";
import { readTextFileWithMetadata } from "../common/file-utils";

export async function handleProxyReadTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const filePath = typeof args.file_path === "string" ? args.file_path : "";
  const query = typeof args.query === "string" ? args.query : "";

  if (!filePath || !query) {
    return { ok: false, name: "ProxyRead", error: "Missing file_path or query." };
  }

  if (!fs.existsSync(filePath)) {
    return { ok: false, name: "ProxyRead", error: "File not found." };
  }

  const { content } = readTextFileWithMetadata(filePath);

  try {
    const { createProxyClient } = await import("../common/openai-client");
    const { resolveCurrentSettings } = await import("../settings");
    const client = createProxyClient(context.projectRoot);
    const settings = resolveCurrentSettings(context.projectRoot);

    if (!client) {
      return { ok: false, name: "ProxyRead", error: "Proxy API key is not configured." };
    }

    const res = await client.chat.completions.create({
      model: settings.proxyModel || "deepseek-v4-flash-free",
      messages: [
        {
          role: "system",
          content:
            "You are a code reading proxy. You will receive a large file and a specific query from the main AI. Read the file carefully, extract the relevant functions, classes, or logic that answer the query. Return only the extracted code snippets and a brief explanation. Keep it concise.",
        },
        {
          role: "user",
          content: `File:\n${filePath}\n\nQuery:\n${query}\n\nFile Content:\n${content.slice(0, 500000)}`,
        },
      ],
    });

    const summary = res.choices[0]?.message?.content || "";
    return {
      ok: true,
      name: "ProxyRead",
      output: `Proxy extracted this from the file:\n\n${summary}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, name: "ProxyRead", error: `Proxy failed to read: ${message}` };
  }
}
