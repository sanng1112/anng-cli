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

  // Semantic Code Search: Scan for exports in src/ directory
  let semanticMap = "Semantic Export Map (Classes, Functions, Types):\n";
  try {
    semanticMap += getSemanticMap(path.join(projectRoot, "src"));
  } catch (_err) {
    semanticMap += "(No src directory found or failed to scan)\n";
  }

  return {
    ok: true,
    name: "AnalyzeProject",
    output: `Directory Tree:\n${treeOutput}\n\nPackage.json dependencies:\n${packageJson.slice(0, 5000)}\n\n${semanticMap.slice(0, 15000)}`,
  };
}

/**
 * Recursively scans a directory for .ts and .tsx files,
 * extracting exported symbols to build a semantic map.
 */
function getSemanticMap(dir: string): string {
  if (!fs.existsSync(dir)) return "";

  let map = "";
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      map += getSemanticMap(fullPath);
    } else if (file.isFile() && (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx"))) {
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        // Matches standard exports: export class Foo, export function bar, export type Baz, export const Qux
        const exportRegex = /^export\s+(?:async\s+)?(?:class|interface|type|function|const|let)\s+([a-zA-Z0-9_]+)/gm;
        let match;
        const symbols: string[] = [];
        while ((match = exportRegex.exec(content)) !== null) {
          symbols.push(match[1]);
        }
        if (symbols.length > 0) {
          map += `- ${path.basename(fullPath)}: ${symbols.join(", ")}\n`;
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }
  }
  return map;
}
