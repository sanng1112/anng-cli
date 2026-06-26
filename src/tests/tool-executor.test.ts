import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ToolExecutor } from "../tools/executor";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("ToolExecutor accepts title-case built-in tool aliases", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "anng-tool-executor-"));
  tempDirs.push(workspace);
  const filePath = path.join(workspace, "sample.txt");
  fs.writeFileSync(filePath, "alpha\nbeta\n", "utf8");

  const executor = new ToolExecutor(workspace);
  const executions = await executor.executeToolCalls("alias-session", [
    {
      id: "call-read",
      type: "function",
      function: {
        name: "Read",
        arguments: JSON.stringify({ file_path: filePath }),
      },
    },
  ]);

  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.result.ok, true);
  assert.equal(executions[0]?.result.name, "read");
  assert.match(executions[0]?.result.output ?? "", /File Content Saved to Workspace Memory/);
});

test("ToolExecutor returns a corrective follow-up message for unknown tool names", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "anng-tool-executor-"));
  tempDirs.push(workspace);

  const executor = new ToolExecutor(workspace);
  const executions = await executor.executeToolCalls("unknown-tool-session", [
    {
      id: "call-skill",
      type: "function",
      function: {
        name: "workspace-surface-audit",
        arguments: "{}",
      },
    },
  ]);

  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.result.ok, false);
  assert.equal(executions[0]?.result.name, "workspace-surface-audit");
  assert.equal(executions[0]?.result.error, "Unknown tool: workspace-surface-audit");
  assert.equal(executions[0]?.result.followUpMessages?.length, 1);
  assert.match(executions[0]?.result.followUpMessages?.[0]?.content ?? "", /loaded skill/i);
  assert.match(executions[0]?.result.followUpMessages?.[0]?.content ?? "", /available tools list/i);
});
