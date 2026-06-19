import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
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
    treeOutput = execFileSync("tree", [
      "-L",
      String(depth),
      "-I",
      "node_modules|.git|dist|build",
      projectRoot,
    ]).toString("utf8");
  } catch {
    // Fallback if tree is not installed
    try {
      treeOutput = execFileSync("find", [
        projectRoot,
        "-maxdepth",
        String(depth),
        "-not",
        "-path",
        "*/node_modules/*",
        "-not",
        "-path",
        "*/.git/*",
        "-not",
        "-path",
        "*/dist/*",
      ]).toString("utf8");
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

  return {
    ok: true,
    name: "AnalyzeProject",
    output: `Directory Tree:\n${treeOutput}\n\nPackage.json dependencies:\n${packageJson.slice(0, 5000)}`,
  };
}
