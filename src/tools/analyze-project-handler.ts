import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { ToolExecutionContext, ToolExecutionResult } from "./executor";

export async function handleAnalyzeProjectTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const depth = typeof args.depth === "number" ? args.depth : 3;
  const projectRoot = context.projectRoot;

  let treeOutput = "";
  try {
    // Try to use tree command, ignoring node_modules and .git
    treeOutput = execSync(`tree -L ${depth} -I "node_modules|.git|dist|build" ${projectRoot}`).toString("utf8");
  } catch {
    // Fallback if tree is not installed
    try {
      treeOutput = execSync(
        `find ${projectRoot} -maxdepth ${depth} -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*"`
      ).toString("utf8");
    } catch {
      return {
        ok: false,
        name: "AnalyzeProject",
        error: "Failed to read directory structure. Please install 'tree' or 'find' command.",
      };
    }
  }

  // Try to read package.json or similar to get tech stack
  let packageJson = "";
  try {
    packageJson = fs.readFileSync(path.join(projectRoot, "package.json"), "utf8");
  } catch (_err) {
    // Ignored
  }

  const rawInfo = `Directory Tree:\n${treeOutput}\n\nPackage.json dependencies:\n${packageJson.slice(0, 5000)}`;

  try {
    const { createProxyClient } = await import("../common/openai-client");
    const { resolveCurrentSettings } = await import("../settings");
    const client = createProxyClient(projectRoot);
    const settings = resolveCurrentSettings(projectRoot);
    if (client) {
      const res = await client.chat.completions.create({
        model: settings.proxyModel || "deepseek-v4-flash-free",
        messages: [
          {
            role: "system",
            content:
              "You are a senior software architect. Analyze the provided directory tree and package.json dependencies. Build a concise, high-level mental map of the project architecture. Explain what the project is, the primary tech stack, and where the most critical logic resides (e.g. 'Auth is likely in src/auth', 'Database models are in src/models'). Output a clean markdown summary.",
          },
          { role: "user", content: rawInfo },
        ],
      });
      const summary = res.choices[0]?.message?.content || "";
      if (summary) {
        return {
          ok: true,
          name: "AnalyzeProject",
          output: summary,
        };
      }
    }
  } catch (_err) {
    // Fallback to raw text if Gemini fails
  }

  return {
    ok: true,
    name: "AnalyzeProject",
    output: `Raw Architecture Info (Proxy unavailable):\n\n${rawInfo.slice(0, 10000)}`,
  };
}
