import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { handleSearchSegmentTool } from "../tools/searchsegment-handler";
import type { ToolExecutionContext } from "../tools/executor";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("searchsegment validates missing url parameter", async () => {
  const result = await handleSearchSegmentTool({}, {} as ToolExecutionContext);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Missing required "url" string/);
});

test("searchsegment fetches a URL and converts simple HTML to clean markdown", async () => {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    return {
      ok: true,
      status: 200,
      text: async () => `
        <html>
          <head>
            <style>body { color: red; }</style>
            <script>console.log("hello");</script>
          </head>
          <body>
            <nav><a href="/home">Home</a></nav>
            <h1>My Page Title</h1>
            <p>Welcome to this <a href="http://example.com">awesome website</a>.</p>
            <footer>Copyright 2026</footer>
          </body>
        </html>
      `,
    } as Response;
  }) as typeof fetch;

  const result = await handleSearchSegmentTool({ url: "http://test-url.com" }, {} as ToolExecutionContext);

  assert.equal(result.ok, true);
  assert.ok(result.output);
  // Heading h1 converted to # My Page Title
  assert.match(result.output, /# My Page Title/);
  // Paragraph converted
  assert.match(result.output, /Welcome to this/);
  // Links converted
  assert.match(result.output, /\[awesome website\]\(http:\/\/example.com\)/);
  // Script, Style, Nav, Footer stripped
  assert.ok(!result.output.includes("console.log"));
  assert.ok(!result.output.includes("Copyright 2026"));
});

test("searchsegment handles fetch errors gracefully", async () => {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    return {
      ok: false,
      status: 404,
    } as Response;
  }) as typeof fetch;

  const result = await handleSearchSegmentTool({ url: "http://test-url-failed.com" }, {} as ToolExecutionContext);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Failed to fetch URL content: status 404/);
});
