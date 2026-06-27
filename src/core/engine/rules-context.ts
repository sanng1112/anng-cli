import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function buildRuleBundle(projectRoot: string): string[] {
  const rules: string[] = [];
  const globalAgents = path.join(os.homedir(), ".anng", "AGENTS.md");
  const projectAgents = path.join(projectRoot, ".anng", "AGENTS.md");
  const rootAgents = path.join(projectRoot, "AGENTS.md");

  if (fs.existsSync(globalAgents)) {
    rules.push(fs.readFileSync(globalAgents, "utf8"));
  }
  if (fs.existsSync(projectAgents)) {
    rules.push(fs.readFileSync(projectAgents, "utf8"));
  } else if (fs.existsSync(rootAgents)) {
    rules.push(fs.readFileSync(rootAgents, "utf8"));
  }
  return rules;
}
