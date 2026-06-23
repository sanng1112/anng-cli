# Improved JSON and IPYNB File Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve model comprehension of JSON and Jupyter Notebook (.ipynb) files by integrating pretty-printing, generating structural summaries for JSON, ensuring both file types leverage workspace memory (snippets), adding support for line-level offsets and limits in notebooks, truncating long outputs, and stripping ANSI escape sequences.

**Architecture:** Extend the `handleReadTool` handler in `src/tools/read-handler.ts` to parse, format, and summarize JSON documents before passing them to the snippet generator, and rewrite the `.ipynb` handling to output cell-by-cell contents as a virtual text file that integrates cleanly with workspace memory and supports pagination via `offset`/`limit`.

**Tech Stack:** TypeScript, Node.js, `js-tiktoken` (for token checks/truncations), standard workspace memory interfaces.

---

### Task 1: Create Baseline Unit Tests for JSON and IPYNB Reading

**Files:**
- Create: `src/tests/json-ipynb-read.test.ts`

- [ ] **Step 1: Write the tests**
  Create unit tests demonstrating the desired behavior:
  - Reading a minified JSON file formats it.
  - Large JSON file gets stored in workspace memory and returns a structure summary to guide the model.
  - Reading a `.ipynb` file creates a snippet in workspace memory (returns `snippet` metadata and saves to session state).
  - Notebook traceback contains stripped ANSI color codes.
  - Notebook can be partially read via `offset` and `limit`.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { handleReadTool } from "../tools/read-handler.js";
import { getSessionSnippets } from "../common/state.js";

function createTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anng-json-tests-"));
}

function createContext(sessionId: string, projectRoot: string): any {
  return {
    sessionId,
    projectRoot,
    settings: {},
  };
}

test("Read JSON file - pretty-prints minified JSON and returns structure summary", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "minified.json");
  const obj = { name: "test", nested: { array: [1, 2, 3], active: true }, longString: "a".repeat(2500) };
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
            text: ["hello\n"]
          },
          {
            output_type: "error",
            ename: "ValueError",
            evalue: "error",
            traceback: ["\u001b[0;31mValueError\u001b[0m: error"]
          }
        ]
      }
    ]
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
```

- [ ] **Step 2: Run tests to verify they fail**
  Run command: `npm run test:single src/tests/json-ipynb-read.test.ts`
  Expected: FAIL/error

- [ ] **Step 3: Commit placeholder tests**
  ```bash
  git add src/tests/json-ipynb-read.test.ts
  git commit -m "test: add baseline tests for JSON and IPYNB reading enhancements"
  ```

---

### Task 2: Implement Improved JSON Handling in `handleReadTool`

**Files:**
- Modify: `src/tools/read-handler.ts`

- [ ] **Step 1: Create a JSON structural summary helper**
  Add a helper function to describe the schema/keys of a parsed JSON object.

```typescript
function generateJsonSummary(val: unknown, depth = 0): string {
  if (depth > 2) return "...";
  if (val === null) return "null";
  if (Array.isArray(val)) {
    const types = new Set(val.map(item => typeof item));
    const typesStr = Array.from(types).join("|") || "empty";
    return `Array<${typesStr}>[${val.length}]`;
  }
  if (typeof val === "object") {
    const keys = Object.keys(val as Record<string, unknown>);
    if (depth === 0) {
      const summaryLines = keys.map(k => {
        const subVal = (val as Record<string, unknown>)[k];
        return `  - "${k}": ${generateJsonSummary(subVal, depth + 1)}`;
      });
      return `Object with ${keys.length} keys:\n${summaryLines.join("\n")}`;
    } else {
      return `Object{${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ", ..." : ""}}`;
    }
  }
  return typeof val;
}
```

- [ ] **Step 2: Update `handleReadTool` to detect and format JSON**
  Modify `handleReadTool` to check if the file has `.json` extension. If it does, try to parse it. If successful:
  - Pretty print it.
  - Generate a summary.
  - Slice using offset/limit.
  - Save to workspace memory snippet.
  - Return the snippet ID AND the structural summary in the output.

- [ ] **Step 3: Run the JSON tests**
  Run command: `npm run test:single src/tests/json-ipynb-read.test.ts`
  Verify the JSON test passes.

- [ ] **Step 4: Commit JSON read improvements**
  ```bash
  git add src/tools/read-handler.ts
  git commit -m "feat: pretty-print JSON and return structural summary to guide models"
  ```

---

### Task 3: Implement Improved Jupyter Notebook (.ipynb) Handling

**Files:**
- Modify: `src/tools/read-handler.ts`

- [ ] **Step 1: Write helper to strip ANSI escape codes and truncate cell output**
  Add `stripAnsi` function and update `formatNotebookOutput` to truncate outputs.

- [ ] **Step 2: Update `readNotebook` to format notebook into raw string array**
  Change `readNotebook` to return `string[]` of raw unnumbered lines.

- [ ] **Step 3: Update `handleReadTool` for `.ipynb` extension**
  Refactor the `.ipynb` handling block in `handleReadTool` to slice the lines, save to workspace memory snippet, and return snippet ID.

- [ ] **Step 4: Run the notebook tests**
  Run command: `npm run test:single src/tests/json-ipynb-read.test.ts`
  Verify both JSON and IPYNB tests pass.

- [ ] **Step 5: Commit Jupyter Notebook improvements**
  ```bash
  git add src/tools/read-handler.ts
  git commit -m "feat: integrate notebooks with workspace memory, strip ANSI, truncate output, support offsets"
  ```

---

### Task 4: Run Existing Test Suite and Validate Build

- [ ] **Step 1: Run the full test suite**
  Run: `npm run test`
  Verify all tests pass.
- [ ] **Step 2: Run type checking and build**
  Run: `npm run build`
  Verify compilation is successful.
- [ ] **Step 3: Final Commit**
  ```bash
  git commit -am "chore: finalize JSON and Jupyter Notebook reading enhancements"
  ```
