import * as fs from "node:fs";
import { buildRuleBundle } from "../core/rules/discovery";
import { buildProjectContextHints, getProjectMemoryPaths } from "../core/memory/project-memory";

export async function runContextCommand(
  input: { cwd: string; outputMode?: "text" | "json" },
  deps: {
    buildRuleSummary?: (cwd: string) => { sources: string[]; content: string };
    readMemorySummary?: (cwd: string) => { memoryDir: string; hints: string[] };
    writeStdout?: (text: string) => void;
  } = {}
) {
  const buildRuleSummary =
    deps.buildRuleSummary ??
    ((cwd: string) => {
      const bundle = buildRuleBundle({ cwd });
      return {
        sources: bundle.files.filter((f) => {
          try {
            return fs.existsSync(f);
          } catch {
            return false;
          }
        }),
        content: bundle.content,
      };
    });
  const readMemorySummary =
    deps.readMemorySummary ??
    ((cwd: string) => ({
      memoryDir: getProjectMemoryPaths(cwd).memoryDir,
      hints: buildProjectContextHints(cwd),
    }));
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text));

  const rules = buildRuleSummary(input.cwd);
  const memory = readMemorySummary(input.cwd);
  if (input.outputMode === "json") {
    writeStdout(`${JSON.stringify({ rules, memory })}\n`);
    return;
  }
  writeStdout(
    [
      "ANNG context",
      `memoryDir=${memory.memoryDir}`,
      `hints=${memory.hints.join(", ") || "none"}`,
      `ruleSources=${rules.sources.join(", ") || "none"}`,
    ].join("\n") + "\n"
  );
}
