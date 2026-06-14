# Improve File Reading Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed

**Goal:** Upgrade the CLI file-reading harness to support 100% accurate PDF text parsing without external system dependencies, and optimize large text file reading using streams to prevent memory overhead and potential heap out of memory crashes.

**Architecture:** We will replace the external `pdftotext` child process execution and inaccurate regex-based page counting with the pure-JS, serverless-optimized `unpdf` library. We will refactor `readTextFile` in `src/tools/read-handler.ts` to utilize Node's `readline` and `fs.createReadStream` to scan only the requested line ranges (offset and limit) rather than reading whole files into memory. Finally, we will add robust PDF and large-file test coverage to the integration tests.

**Tech Stack:** TypeScript, Node.js, `unpdf`

---

### Task 1: Add `unpdf` Dependency

**Files:**
- Modify: `package.json`

- [x] **Step 1: Write a failing import test**

Create a temporary test file `src/tests/unpdf-import.test.ts` to verify the import of `unpdf` fails initially:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("unpdf dependency is present and importable", async () => {
  try {
    const { getDocumentProxy } = await import("unpdf");
    assert.ok(getDocumentProxy);
  } catch (err) {
    throw new Error("unpdf is not installed: " + String(err));
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/tests/unpdf-import.test.ts`
Expected: FAIL with "Cannot find module 'unpdf'" or similar import error.

- [x] **Step 3: Add unpdf to package.json and install**

Add `"unpdf": "^0.2.2"` to dependencies in `package.json`:

```json
  "dependencies": {
    "chalk": "^5.6.2",
    "ejs": "^5.0.2",
    "gradient-string": "^3.0.0",
    "gray-matter": "^4.0.3",
    "ignore": "^7.0.5",
    "ink": "^7.0.4",
    "ink-gradient": "^4.0.1",
    "js-tiktoken": "^1.0.21",
    "openai": "^6.35.0",
    "react": "^19.2.5",
    "undici": "^7.25.0",
    "unpdf": "^0.2.2",
    "zod": "^4.4.3"
  },
```

And run standard install command:
```bash
npm install --no-audit
```

- [x] **Step 4: Run the import test to verify it passes**

Run: `npx tsx --test src/tests/unpdf-import.test.ts`
Expected: PASS

- [x] **Step 5: Clean up import test and commit**

Remove `src/tests/unpdf-import.test.ts`:
```bash
rm src/tests/unpdf-import.test.ts
git add package.json package-lock.json
git commit -m "chore: add unpdf dependency for pure-JS PDF parsing"
```

---

### Task 2: Implement Accurate PDF Text Extraction

**Files:**
- Modify: `src/tools/read-handler.ts`
- Modify: `src/tests/tool-handlers.test.ts`

- [x] **Step 1: Write a failing integration test for PDF text extraction**

Add this test at the end of `src/tests/tool-handlers.test.ts` to mock/test PDF file reading:

```typescript
test("Read handler extracts text and metadata from PDF files using pure JS parser", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "test-document.pdf");
  
  // Minimal valid 1-page PDF file structure (base64 encoded)
  const pdfBase64 = "JVBERi0xLjQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKICA8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSICAvTWVkaWFCb3ggWyAwIDAgMzAwIDMwMCBdIC9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKNCAwIG9iagogIDw8IC9MZW5ndGggMzUgPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgoxMDAgMTAwIFRkCihIZWxsbyBQREYpIFRqCkVVCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjkgMDAwMDAgbiAKMDAwMDAwMDEyOSAwMDAwIG4gCjAwMDAwMDAyMjEgMDAwMDAgbiAKdHJhaWxlcagogIDw8IC9TaXplIDUgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjMxNAolJUVPRg==";
  fs.writeFileSync(filePath, Buffer.from(pdfBase64, "base64"));

  const readResult = await handleReadTool({ file_path: filePath }, createContext("pdf-read", workspace));

  assert.equal(readResult.ok, true);
  assert.match(readResult.output ?? "", /Hello PDF/);
  assert.equal(readResult.metadata?.pageCount, 1);
  assert.equal(readResult.metadata?.mime, "text/plain");
});
```

- [x] **Step 2: Run tests to verify it fails**

Run: `npx tsx --test src/tests/tool-handlers.test.ts`
Expected: FAIL (due to missing "Hello PDF" content because pdftotext cannot parse mock binary easily without native utility or pdftotext is not called on the correct format).

- [x] **Step 3: Modify read-handler.ts to use unpdf**

Replace the PDF handling section (lines 161–238) in `src/tools/read-handler.ts` and clean up `countPdfPages`.

```typescript
    if (ext === ".pdf") {
      const pagesParam = typeof args.pages === "string" ? args.pages.trim() : "";
      const buffer = fs.readFileSync(filePath);
      
      let pageCount = 0;
      let pdf;
      try {
        const { getDocumentProxy } = await import("unpdf");
        pdf = await getDocumentProxy(new Uint8Array(buffer));
        pageCount = pdf.numPages;
      } catch (err) {
        return {
          ok: false,
          name: "read",
          error: `Failed to parse PDF document: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const pageRange = pagesParam ? parsePageRange(pagesParam) : null;

      if (!pageRange && pageCount > PDF_LARGE_PAGE_THRESHOLD) {
        return {
          ok: false,
          name: "read",
          error: `PDF has ${pageCount} pages; provide "pages" to read a range.`,
        };
      }

      if (pageRange && pageRange.count > PDF_MAX_PAGE_RANGE) {
        return {
          ok: false,
          name: "read",
          error: `PDF page range exceeds ${PDF_MAX_PAGE_RANGE} pages.`,
        };
      }

      if (pageRange && pageRange.end > pageCount) {
        return {
          ok: false,
          name: "read",
          error: `PDF page range exceeds total page count (${pageCount}).`,
        };
      }

      let pdfText = "";
      const startPage = pageRange ? pageRange.start : 1;
      const endPage = pageRange ? pageRange.end : pageCount;

      try {
        for (let i = startPage; i <= endPage; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          pdfText += `--- Page ${i} ---\n${pageText}\n\n`;
        }
      } catch (err) {
        return {
          ok: false,
          name: "read",
          error: `Failed to extract text from PDF: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (pdfText.trim()) {
        markFileRead(context.sessionId, filePath, {
          content: pdfText,
          timestamp: Math.floor(stat.mtimeMs),
          isPartialView: pageRange !== null,
        });
        return {
          ok: true,
          name: "read",
          output: pdfText,
          metadata: {
            mime: "text/plain",
            bytes: buffer.length,
            pageCount,
            pages: pageRange ? `${pageRange.start}-${pageRange.end}` : `1-${pageCount}`,
          },
        };
      }

      return {
        ok: true,
        name: "read",
        output: `PDF loaded. Total Pages: ${pageCount}. (No text could be extracted. The PDF might be scanned or contain only images.)`,
        metadata: {
          mime: "application/pdf",
          bytes: buffer.length,
          pageCount,
          pages: pageRange ? `${pageRange.start}-${pageRange.end}` : null,
        },
      };
    }
```

Remove the unused `countPdfPages(buffer: Buffer)` function declaration (lines 542–550 in `src/tools/read-handler.ts`).

- [x] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/tests/tool-handlers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/read-handler.ts src/tests/tool-handlers.test.ts
git commit -m "feat(read): implement pure-JS PDF page parsing and text extraction using unpdf"
```

---

### Task 3: Optimize Large File Reading via Stream & Readline

**Files:**
- Modify: `src/tools/read-handler.ts`
- Modify: `src/tests/tool-handlers.test.ts`

- [x] **Step 1: Write failing test verifying stream reading accuracy and performance**

Add this test at the end of `src/tests/tool-handlers.test.ts`:

```typescript
test("Read handler reads specific offsets and limits from large files using stream line-by-line", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "large-test-file.txt");
  
  const sampleLines = Array.from({ length: 50 }, (_, i) => `Line content number ${i + 1}`);
  fs.writeFileSync(filePath, sampleLines.join("\n"));

  const readResult = await handleReadTool(
    { file_path: filePath, offset: 10, limit: 5 },
    createContext("stream-read", workspace)
  );

  assert.equal(readResult.ok, true);
  const expectedOutput = sampleLines.slice(9, 14).map((line, idx) => {
    return `${String(10 + idx).padStart(6, " ")}\t${line}`;
  }).join("\n");
  assert.equal(readResult.output, expectedOutput);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/tests/tool-handlers.test.ts`
Expected: FAIL (or verify it can compile and run correctly).

- [x] **Step 3: Modify readTextFile to use readline and streams**

Update `readTextFile` and add a metadata reader helper:

```typescript
import * as readline from "readline";

export function detectFileMetadata(filePath: string): {
  encoding: BufferEncoding;
  lineEndings: "LF" | "CRLF";
  timestamp: number;
} {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(4096);
  let bytesRead = 0;
  try {
    bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
  } finally {
    fs.closeSync(fd);
  }
  const chunk = buffer.slice(0, bytesRead);
  const encoding = detectEncoding(chunk);
  const text = chunk.toString(encoding);
  const lineEndings = text.includes("\r\n") ? "CRLF" : "LF";
  return { encoding, lineEndings, timestamp: Math.floor(stat.mtimeMs) };
}

async function readTextFile(
  filePath: string,
  offset: number | null,
  limit: number
): Promise<TextReadResult> {
  const { encoding, lineEndings, timestamp } = detectFileMetadata(filePath);
  
  const startLine = offset ? offset - 1 : 0;
  const endLine = startLine + limit;

  const fileStream = fs.createReadStream(filePath, { encoding });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const selected: string[] = [];
  let currentLine = 0;
  let hasMoreLines = false;

  for await (const line of rl) {
    currentLine++;
    if (currentLine > startLine && currentLine <= endLine) {
      selected.push(line);
    }
    if (currentLine > endLine) {
      hasMoreLines = true;
      rl.close();
      fileStream.destroy();
      break;
    }
  }

  const actualStartLine = startLine + 1;
  const actualEndLine = selected.length > 0 ? startLine + selected.length : actualStartLine;
  const isPartialView = actualStartLine !== 1 || hasMoreLines;

  return {
    content: selected.join("\n"),
    output: formatWithLineNumbers(selected, actualStartLine),
    startLine: actualStartLine,
    endLine: actualEndLine,
    totalLines: currentLine,
    isPartialView,
    encoding,
    lineEndings,
    timestamp,
  };
}
```

And update `handleReadTool` line 277:
```typescript
    const textResult = await readTextFile(filePath, offset.value, limit.value);
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test src/tests/tool-handlers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tools/read-handler.ts src/tests/tool-handlers.test.ts
git commit -m "perf(read): read text files using streams and readline to avoid out-of-memory errors on large files"
```

---

### Task 4: Add Edge Case and Error Testing

**Files:**
- Modify: `src/tests/tool-handlers.test.ts`

- [x] **Step 1: Add tests for PDF page range limits**

Add a test validating error messages on invalid pages:

```typescript
test("Read handler returns error for page ranges that exceed constraints", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "range-test.pdf");
  
  // Minimal valid 1-page PDF
  const pdfBase64 = "JVBERi0xLjQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKICA8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSICAvTWVkaWFCb3ggWyAwIDAgMzAwIDMwMCBdIC9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKNCAwIG9iagogIDw8IC9MZW5ndGggMzUgPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgoxMDAgMTAwIFRkCihIZWxsbyBQREYpIFRqCkVVCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjkgMDAwMDAgbiAKMDAwMDAwMDEyOSAwMDAwIG4gCjAwMDAwMDAyMjEgMDAwMDAgbiAKdHJhaWxlcagogIDw8IC9TaXplIDUgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjMxNAolJUVPRg==";
  fs.writeFileSync(filePath, Buffer.from(pdfBase64, "base64"));

  // 1. Pages out of range
  const errResultRange = await handleReadTool(
    { file_path: filePath, pages: "2-5" },
    createContext("pdf-range-err", workspace)
  );
  assert.equal(errResultRange.ok, false);
  assert.match(errResultRange.error ?? "", /PDF page range exceeds total page count/);

  // 2. Excess page count requested (limit is 20)
  const errResultLimit = await handleReadTool(
    { file_path: filePath, pages: "1-25" },
    createContext("pdf-limit-err", workspace)
  );
  assert.equal(errResultLimit.ok, false);
  assert.match(errResultLimit.error ?? "", /PDF page range exceeds/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/tests/tool-handlers.test.ts`
Expected: FAIL (or verify page count validation errors).

- [x] **Step 3: Refactor code if needed to handle page edge cases correctly**

(The implementation in Task 2 already has proper validation checks, so the test will pass once the Task 2 code is running).

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/tests/tool-handlers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/tests/tool-handlers.test.ts
git commit -m "test(read): add validation tests for PDF page range limits"
```

---

### Task 5: Enhance the Test Harness & Run Complete Checks

**Files:**
- Modify: `src/tests/run-tests.mjs`
- Modify: `package.json`

- [x] **Step 1: Write check for test concurrency and coverage**

Modify `src/tests/run-tests.mjs` to run all tests in parallel via CLI and output summaries nicely.

- [x] **Step 2: Verify existing configuration**

Run `npm test` to make sure all 465+ tests still pass without failures.

- [x] **Step 3: Modify run-tests.mjs and package.json**

Update `src/tests/run-tests.mjs` to configure parallel test execution:

```javascript
// Cross-platform test runner: finds all *.test.ts files and runs them via tsx in parallel.
// Uses the glob package for reliable cross-platform pattern expansion (Node 20+).
/* eslint-disable */

import { globSync } from "glob";
import { spawnSync } from "child_process";

const cwd = new URL("../..", import.meta.url);
const testFiles = globSync("src/tests/*.test.ts", { cwd });

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=4", ...testFiles], { stdio: "inherit", cwd });

process.exit(result.status ?? 1);
```

Add test coverage scripts to `package.json`:

```json
    "test": "node src/tests/run-tests.mjs",
    "test:coverage": "node --experimental-test-coverage src/tests/run-tests.mjs",
    "test:single": "tsx --test",
```

- [x] **Step 4: Run test suite to verify speed and output**

Run: `npm test`
Expected: All tests pass successfully and execution time is reduced due to concurrency.

- [x] **Step 5: Commit**

```bash
git add src/tests/run-tests.mjs package.json
git commit -m "perf(test): enable test concurrency and add coverage configuration to test runner"
```
