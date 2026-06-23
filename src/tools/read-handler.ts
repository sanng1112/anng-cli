import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import ignore from "ignore";
import type { ToolExecutionContext, ToolExecutionFollowUpMessage, ToolExecutionResult } from "./executor";
import { detectEncoding } from "../common/file-utils";
import {
  createFullFileSnippet,
  createSnippet,
  isAbsoluteFilePath,
  markFileRead,
  normalizeFilePath,
} from "../common/state";

const DEFAULT_LINE_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const PDF_LARGE_PAGE_THRESHOLD = 10;
const PDF_MAX_PAGE_RANGE = 20;
const LINE_NUMBER_WIDTH = 6;
const DEFAULT_GITIGNORE = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  "out/",
  ".next/",
  ".nuxt/",
  ".venv/",
  "venv/",
  "__pycache__/",
  "*.pyc",
  "*.pyo",
  ".pytest_cache/",
  ".mypy_cache/",
  ".ruff_cache/",
  ".gradle/",
  ".idea/",
  ".vscode/",
  "*.class",
  "*.jar",
  "*.war",
  "target/",
];

type PageRange = {
  start: number;
  end: number;
  count: number;
};

type TextReadResult = {
  content: string;
  output: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  isPartialView: boolean;
  encoding: BufferEncoding;
  lineEndings: "LF" | "CRLF";
  timestamp: number;
};

export async function handleReadTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  let filePath = typeof args.file_path === "string" ? normalizeFilePath(args.file_path) : "";
  if (!filePath.trim()) {
    return {
      ok: false,
      name: "read",
      error: 'Missing required "file_path" string.',
    };
  }

  if (!isAbsoluteFilePath(filePath)) {
    if (filePath.startsWith("../") || filePath.startsWith("..\\")) {
      return {
        ok: false,
        name: "read",
        error: "file_path must be an absolute path.",
      };
    }
    const normalizedSuffix = normalizeRelativeSuffix(filePath);
    const isIgnored = loadGitignoreMatcher(context.projectRoot);
    const matches = normalizedSuffix ? findSuffixMatches(context.projectRoot, normalizedSuffix, isIgnored) : [];
    if (matches.length > 1) {
      return {
        ok: false,
        name: "read",
        error:
          "file_path must be an absolute path. " +
          `The file_path is ambiguous and may refer to multiple files:\n${matches.slice(0, 3).join("\n")}` +
          (matches.length > 3 ? `\n...and ${matches.length - 3} more.` : ""),
      };
    }

    const resolvedPath = path.resolve(context.projectRoot, filePath);
    if (!fs.existsSync(resolvedPath)) {
      if (matches.length > 0) {
        return {
          ok: false,
          name: "read",
          error: "file_path must be an absolute path. " + `The file_path "${filePath}" is ambiguous.`,
        };
      } else {
        return {
          ok: false,
          name: "read",
          error: `File not found: ${filePath}`,
        };
      }
    }

    filePath = resolvedPath;
  }

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      name: "read",
      error: `File not found: ${filePath}`,
    };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: "read",
      error: `Failed to stat file: ${message}`,
    };
  }

  if (stat.isDirectory()) {
    return {
      ok: false,
      name: "read",
      error: "file_path points to a directory. Use bash ls for directories.",
    };
  }

  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === ".json") {
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const pretty = JSON.stringify(parsed, null, 2);
        const summary = generateJsonSummary(parsed);

        const offset = parseLineNumber(args.offset, "offset");
        const limit = parseLineLimit(args.limit);
        if (!offset.ok) {
          return {
            ok: false,
            name: "read",
            error: offset.error,
          };
        }
        if (!limit.ok) {
          return {
            ok: false,
            name: "read",
            error: limit.error,
          };
        }

        const startLine = offset.value ? offset.value - 1 : 0;
        const endLine = startLine + limit.value;

        const lines = pretty.split(/\r?\n/);
        const selected = lines.slice(startLine, endLine);
        const actualStartLine = startLine + 1;
        const actualEndLine = actualStartLine + selected.length - 1;
        const isPartialView = actualStartLine !== 1 || endLine < lines.length;

        const formattedContent = selected.join("\n");
        const formattedOutput = formatWithLineNumbers(selected, actualStartLine);

        markFileRead(context.sessionId, filePath, {
          content: formattedContent,
          timestamp: Math.floor(stat.mtimeMs),
          offset: isPartialView ? actualStartLine : undefined,
          limit: isPartialView ? Math.max(1, actualEndLine - actualStartLine + 1) : undefined,
          isPartialView,
          encoding: "utf8",
          lineEndings: "LF",
        });

        const snippet = isPartialView
          ? createSnippet(context.sessionId, filePath, actualStartLine, actualEndLine, formattedOutput)
          : createFullFileSnippet(context.sessionId, filePath, actualStartLine, actualEndLine, formattedOutput);

        return {
          ok: true,
          name: "read",
          output: `[File Content Saved to Workspace Memory]\nSnippet ID: ${snippet?.id}\n\nJSON Structure Summary:\n${summary}`,
          metadata: snippet
            ? {
                snippet: {
                  id: snippet.id,
                  filePath: snippet.filePath,
                  startLine: snippet.startLine,
                  endLine: snippet.endLine,
                },
              }
            : undefined,
        };
      } catch (err) {
        // Fall back to standard read if JSON parsing fails
      }
    }

    if (ext === ".ipynb") {
      const notebookLines = readNotebookLines(filePath);

      const offset = parseLineNumber(args.offset, "offset");
      const limit = parseLineLimit(args.limit);
      if (!offset.ok) {
        return {
          ok: false,
          name: "read",
          error: offset.error,
        };
      }
      if (!limit.ok) {
        return {
          ok: false,
          name: "read",
          error: limit.error,
        };
      }

      const startLine = offset.value ? offset.value - 1 : 0;
      const endLine = startLine + limit.value;

      const selected = notebookLines.slice(startLine, endLine);
      const actualStartLine = startLine + 1;
      const actualEndLine = actualStartLine + selected.length - 1;
      const isPartialView = actualStartLine !== 1 || endLine < notebookLines.length;

      const formattedContent = selected.join("\n");
      const formattedOutput = formatWithLineNumbers(selected, actualStartLine);

      markFileRead(context.sessionId, filePath, {
        content: formattedContent,
        timestamp: Math.floor(stat.mtimeMs),
        offset: isPartialView ? actualStartLine : undefined,
        limit: isPartialView ? Math.max(1, actualEndLine - actualStartLine + 1) : undefined,
        isPartialView,
        encoding: "utf8",
        lineEndings: "LF",
      });

      const snippet = isPartialView
        ? createSnippet(context.sessionId, filePath, actualStartLine, actualEndLine, formattedOutput)
        : createFullFileSnippet(context.sessionId, filePath, actualStartLine, actualEndLine, formattedOutput);

      return {
        ok: true,
        name: "read",
        output: `[File Content Saved to Workspace Memory]\nSnippet ID: ${snippet?.id}`,
        metadata: snippet
          ? {
              snippet: {
                id: snippet.id,
                filePath: snippet.filePath,
                startLine: snippet.startLine,
                endLine: snippet.endLine,
              },
            }
          : undefined,
      };
    }

    if (ext === ".pdf") {
      const pagesParam = typeof args.pages === "string" ? args.pages.trim() : "";
      const buffer = fs.readFileSync(filePath);

      let pageCount = 0;
      let pageTexts: string[] = [];
      try {
        const { getDocumentProxy, extractText } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        pageCount = pdf.numPages;
        const decodeResult = await extractText(pdf, { mergePages: false });
        pageTexts = Array.isArray(decodeResult.text) ? decodeResult.text : [decodeResult.text];
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

      for (let i = startPage; i <= endPage; i++) {
        const pageText = pageTexts[i - 1] ?? "";
        pdfText += `--- Page ${i} ---\n${pageText}\n\n`;
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

    if (isImageExtension(ext)) {
      const buffer = fs.readFileSync(filePath);
      const mime = getImageMimeType(ext);
      markFileRead(context.sessionId, filePath, {
        content: "",
        timestamp: Math.floor(stat.mtimeMs),
        isPartialView: true,
      });
      return {
        ok: true,
        name: "read",
        output: "File loaded.",
        metadata: {
          mime,
          bytes: buffer.length,
        },
        followUpMessages: [buildImageFollowUpMessage(filePath, mime, buffer)],
      };
    }

    const offset = parseLineNumber(args.offset, "offset");
    const limit = parseLineLimit(args.limit);
    if (!offset.ok) {
      return {
        ok: false,
        name: "read",
        error: offset.error,
      };
    }
    if (!limit.ok) {
      return {
        ok: false,
        name: "read",
        error: limit.error,
      };
    }

    const textResult = await readTextFile(filePath, offset.value, limit.value);

    markFileRead(context.sessionId, filePath, {
      content: textResult.content,
      timestamp: textResult.timestamp,
      offset: textResult.isPartialView ? textResult.startLine : undefined,
      limit: textResult.isPartialView ? Math.max(1, textResult.endLine - textResult.startLine + 1) : undefined,
      isPartialView: textResult.isPartialView,
      encoding: textResult.encoding,
      lineEndings: textResult.lineEndings,
    });
    const snippet = textResult.isPartialView
      ? createSnippet(context.sessionId, filePath, textResult.startLine, textResult.endLine, textResult.output)
      : createFullFileSnippet(context.sessionId, filePath, textResult.startLine, textResult.endLine, textResult.output);
    return {
      ok: true,
      name: "read",
      output: `[File Content Saved to Workspace Memory]\nSnippet ID: ${snippet?.id}`,
      metadata: snippet
        ? {
            snippet: {
              id: snippet.id,
              filePath: snippet.filePath,
              startLine: snippet.startLine,
              endLine: snippet.endLine,
            },
          }
        : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: "read",
      error: message,
    };
  }
}

function normalizeRelativeSuffix(relativePath: string): string | null {
  const normalized = path.normalize(relativePath).replace(/^(\.\/|\\)+/, "");
  return normalized.trim() ? path.sep + normalized : null;
}

function findSuffixMatches(
  root: string,
  suffix: string,
  isIgnored: ((relPath: string, isDir: boolean) => boolean) | null
): string[] {
  const matches: string[] = [];
  const queue: string[] = [root];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(root, fullPath).replace(/\\/g, "/");
      if (isIgnored && isIgnored(relPath, entry.isDirectory())) {
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(suffix)) {
        matches.push(fullPath);
      }
    }
  }

  return matches;
}

function loadGitignoreMatcher(projectRoot: string): ((relPath: string, isDir: boolean) => boolean) | null {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    const ig = ignore();
    ig.add(DEFAULT_GITIGNORE);
    return (relPath: string, isDir: boolean) => {
      if (!relPath) {
        return false;
      }
      const candidate = isDir ? `${relPath}/` : relPath;
      return ig.ignores(candidate);
    };
  }

  let content = "";
  try {
    content = fs.readFileSync(gitignorePath, "utf8");
  } catch {
    const ig = ignore();
    ig.add(DEFAULT_GITIGNORE);
    return (relPath: string, isDir: boolean) => {
      if (!relPath) {
        return false;
      }
      const candidate = isDir ? `${relPath}/` : relPath;
      return ig.ignores(candidate);
    };
  }

  const ig = ignore();
  ig.add(DEFAULT_GITIGNORE);
  ig.add(content);
  return (relPath: string, isDir: boolean) => {
    if (!relPath) {
      return false;
    }
    const candidate = isDir ? `${relPath}/` : relPath;
    return ig.ignores(candidate);
  };
}

function parseLineNumber(
  value: unknown,
  label: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: `${label} must be a number.` };
  }
  const integer = Math.trunc(numeric);
  if (integer < 1) {
    return { ok: false, error: `${label} must be >= 1.` };
  }
  return { ok: true, value: integer };
}

function parseLineLimit(value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: DEFAULT_LINE_LIMIT };
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: "limit must be a number." };
  }
  const integer = Math.trunc(numeric);
  if (integer <= 0) {
    return { ok: false, error: "limit must be > 0." };
  }
  return { ok: true, value: integer };
}

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
  const chunk = buffer.subarray(0, bytesRead);
  const encoding = detectEncoding(chunk);
  const text = chunk.toString(encoding);
  const lineEndings = text.includes("\r\n") ? "CRLF" : "LF";
  return { encoding, lineEndings, timestamp: Math.floor(stat.mtimeMs) };
}

async function readTextFile(filePath: string, offset: number | null, limit: number): Promise<TextReadResult> {
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

  try {
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
  } catch (err) {
    fileStream.destroy();
    throw err;
  }

  if (selected.length === 0) {
    return {
      content: "",
      output: "WARNING: File is empty.",
      startLine: offset ?? 1,
      endLine: offset ?? 1,
      totalLines: 0,
      isPartialView: false,
      encoding,
      lineEndings,
      timestamp,
    };
  }

  const actualStartLine = startLine + 1;
  const actualEndLine = actualStartLine + selected.length - 1;
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

function formatWithLineNumbers(lines: string[], startLineNumber: number): string {
  return lines
    .map((line, index) => {
      const lineNumber = startLineNumber + index;
      const trimmedLine = line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + " ...[truncated]" : line;
      return `${String(lineNumber).padStart(LINE_NUMBER_WIDTH, " ")}\t${trimmedLine}`;
    })
    .join("\n");
}

function isImageExtension(ext: string): boolean {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".svg", ".ico", ".avif"].includes(ext);
}

function getImageMimeType(ext: string): string {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".avif":
      return "image/avif";
    case ".png":
    default:
      return "image/png";
  }
}

function buildImageFollowUpMessage(filePath: string, mime: string, buffer: Buffer): ToolExecutionFollowUpMessage {
  const fileName = path.basename(filePath);
  return {
    role: "system",
    content:
      `The read tool has loaded \`${fileName}\`. ` + "Use the attached image content to answer the original request.",
    contentParams: [
      {
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${buffer.toString("base64")}`,
        },
      },
    ],
  };
}

function parsePageRange(input: string): PageRange {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("pages must be a non-empty string.");
  }
  if (trimmed.includes(",")) {
    throw new Error('pages must be a single range like "1-5" or "3".');
  }

  const parts = trimmed.split("-").map((part) => part.trim());
  if (parts.length === 1) {
    const value = parsePositiveInt(parts[0], "pages");
    return { start: value, end: value, count: 1 };
  }

  if (parts.length === 2) {
    const start = parsePositiveInt(parts[0], "pages");
    const end = parsePositiveInt(parts[1], "pages");
    if (end < start) {
      throw new Error("pages range end must be >= start.");
    }
    return { start, end, count: end - start + 1 };
  }

  throw new Error('pages must be a single range like "1-5" or "3".');
}

function parsePositiveInt(value: string, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a number.`);
  }
  const integer = Math.trunc(numeric);
  if (integer < 1) {
    throw new Error(`${label} must be >= 1.`);
  }
  return integer;
}

function stripAnsi(str: string): string {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

function readNotebookLines(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw) {
    return ["WARNING: File is empty."];
  }

  const parsed = JSON.parse(raw) as {
    cells?: Array<{
      cell_type?: string;
      source?: string[] | string;
      outputs?: Array<Record<string, unknown>>;
    }>;
  };

  const lines: string[] = [];
  const cells = Array.isArray(parsed.cells) ? parsed.cells : [];
  cells.forEach((cell, index) => {
    const cellType = cell.cell_type ?? "unknown";
    lines.push(`# Cell ${index + 1} (${cellType})`);

    const source = normalizeNotebookField(cell.source);
    if (source.length > 0) {
      lines.push(...source);
    }

    const outputs = Array.isArray(cell.outputs) ? cell.outputs : [];
    outputs.forEach((output, outputIndex) => {
      const outputType = typeof output.output_type === "string" ? output.output_type : "output";
      lines.push(`# Output ${outputIndex + 1} (${outputType})`);
      lines.push(...formatNotebookOutput(output));
    });
  });

  if (lines.length === 0) {
    return ["WARNING: Notebook has no cells."];
  }

  return lines;
}

function normalizeNotebookField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).replace(/\r?\n$/, ""));
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/);
  }
  return [];
}

function formatNotebookOutput(output: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const text = output.text;
  if (Array.isArray(text)) {
    lines.push(...text.map((item) => stripAnsi(String(item).replace(/\r?\n$/, ""))));
  } else if (typeof text === "string") {
    lines.push(...text.split(/\r?\n/).map(stripAnsi));
  }

  const data = output.data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const textPlain = record["text/plain"];
    if (Array.isArray(textPlain)) {
      lines.push(...textPlain.map((item) => stripAnsi(String(item).replace(/\r?\n$/, ""))));
    } else if (typeof textPlain === "string") {
      lines.push(...textPlain.split(/\r?\n/).map(stripAnsi));
    }

    const imagePng = record["image/png"];
    if (typeof imagePng === "string") {
      lines.push(`[image/png ${imagePng.length} chars]`);
    }

    const imageJpeg = record["image/jpeg"];
    if (typeof imageJpeg === "string") {
      lines.push(`[image/jpeg ${imageJpeg.length} chars]`);
    }
  }

  const trace = output.traceback;
  if (Array.isArray(trace)) {
    lines.push(...trace.map((item) => stripAnsi(String(item).replace(/\r?\n$/, ""))));
  }

  if (lines.length === 0) {
    lines.push("[output omitted]");
  }

  const MAX_OUTPUT_LINES = 50;
  const MAX_OUTPUT_CHARS = 5000;

  let totalChars = 0;
  const truncatedLines: string[] = [];
  let isTruncated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (truncatedLines.length >= MAX_OUTPUT_LINES) {
      isTruncated = true;
      break;
    }
    if (totalChars + line.length > MAX_OUTPUT_CHARS) {
      const remainingSpace = MAX_OUTPUT_CHARS - totalChars;
      if (remainingSpace > 10) {
        truncatedLines.push(line.slice(0, remainingSpace) + " ...[truncated]");
      }
      isTruncated = true;
      break;
    }
    truncatedLines.push(line);
    totalChars += line.length + 1;
  }

  if (isTruncated) {
    truncatedLines.push("[... output truncated to save tokens]");
  }

  return truncatedLines;
}

function generateJsonSummary(val: unknown, depth = 0): string {
  if (depth > 2) return "...";
  if (val === null) return "null";
  if (Array.isArray(val)) {
    const types = new Set(val.map((item) => typeof item));
    const typesStr = Array.from(types).join("|") || "empty";
    return `Array<${typesStr}>[${val.length}]`;
  }
  if (typeof val === "object") {
    const keys = Object.keys(val as Record<string, unknown>);
    if (depth === 0) {
      const summaryLines = keys.map((k) => {
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
