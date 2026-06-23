import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { handleReadTool } from "../tools/read-handler";
import { getSessionSnippets } from "../common/state";
import type { ToolExecutionContext } from "../tools/executor";

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anng-json-tests-"));
  tempDirs.push(dir);
  return dir;
}

function createContext(
  sessionId: string,
  projectRoot: string,
  overrides: Partial<ToolExecutionContext> = {}
): ToolExecutionContext {
  return {
    sessionId,
    projectRoot,
    toolCall: {
      id: "test-tool-call",
      type: "function",
      function: {
        name: "read",
        arguments: "{}",
      },
    },
    ...overrides,
  };
}

test("Read JSON file - pretty-prints minified JSON and returns structure summary", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "minified.json");
  const obj: Record<string, any> = { name: "test", nested: { array: [1, 2, 3], active: true } };
  for (let i = 0; i < 50; i++) {
    obj[`key_${i}`] = "a".repeat(50);
  }
  fs.writeFileSync(filePath, JSON.stringify(obj));

  const context = createContext("json-test", workspace);
  const result = await handleReadTool({ file_path: filePath }, context);

  assert.equal(result.ok, true);
  assert.match(result.output ?? "", /JSON Structure Summary/);
  assert.match(result.output ?? "", /Snippet ID:/);

  const snippets = getSessionSnippets("json-test");
  assert.equal(snippets.length, 1);
  const snippet = snippets[0];
  // Verify it was pretty printed and thus contains multiple lines
  assert.ok(snippet.preview.includes("\n"));
  // Verify line numbers or formatted contents are correct (without truncating the line to 2000 chars)
  assert.ok(!snippet.preview.includes("...[truncated]"));
});

test("Read IPYNB file - saves to workspace memory, strips ANSI, truncates outputs, and supports offsets", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "notebook.ipynb");
  const ipynb = {
    cells: [
      {
        cell_type: "code",
        source: ["print('hello')\n", "raise ValueError('error')"],
        outputs: [
          {
            output_type: "stream",
            text: ["hello\n"],
          },
          {
            output_type: "error",
            ename: "ValueError",
            evalue: "error",
            traceback: ["\u001b[0;31mValueError\u001b[0m: error"],
          },
        ],
      },
    ],
  };
  fs.writeFileSync(filePath, JSON.stringify(ipynb));

  const context = createContext("ipynb-test", workspace);

  // Read full notebook
  const result = await handleReadTool({ file_path: filePath }, context);
  assert.equal(result.ok, true);
  assert.match(result.output ?? "", /Snippet ID:/);

  const snippets = getSessionSnippets("ipynb-test");
  assert.equal(snippets.length, 1);
  const preview = snippets[0].preview;

  // Verify ANSI is stripped
  assert.ok(!preview.includes("\u001b[0;31m"));
  assert.ok(preview.includes("ValueError: error"));

  // Read partial notebook using offset and limit
  const partialResult = await handleReadTool({ file_path: filePath, offset: 2, limit: 2 }, context);
  assert.equal(partialResult.ok, true);
  const partialSnippets = getSessionSnippets("ipynb-test");
  const lastSnippet = partialSnippets[partialSnippets.length - 1];
  // Cell 1 header is on line 1, source print is line 2.
  assert.equal(lastSnippet.startLine, 2);
  assert.equal(lastSnippet.endLine, 3);
});
