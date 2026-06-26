import type { ToolExecutionContext, ToolExecutionResult } from "./executor";

export async function handleSearchSegmentTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const url = typeof args.url === "string" ? args.url : "";
  if (!url.trim()) {
    return {
      ok: false,
      name: "searchsegment",
      error: 'Missing required "url" string.',
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL content: status ${response.status}`);
    }

    const html = await response.text();

    // Basic cleaning of HTML to convert to clean markdown
    let cleaned = html;

    // Remove comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

    // Remove scripts, styles, head, nav, footer
    cleaned = cleaned.replace(/<(script|style|head|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, "");

    // Basic HTML entity decode
    const entities: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
      "&nbsp;": " ",
    };
    cleaned = cleaned.replace(/&[a-z0-9#]+;/gi, (match) => entities[match] || match);

    // Convert headings
    cleaned = cleaned.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
    cleaned = cleaned.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
    cleaned = cleaned.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
    cleaned = cleaned.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n#### $1\n");

    // Convert links
    cleaned = cleaned.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

    // Convert paragraphs & linebreaks
    cleaned = cleaned.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");
    cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");

    // Strip remaining tags
    cleaned = cleaned.replace(/<[^>]+>/g, "");

    // Clean whitespace
    const lines = cleaned
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let markdown = lines.join("\n\n");

    // Limit length
    const MAX_CHARS = 20000;
    let truncated = false;
    if (markdown.length > MAX_CHARS) {
      markdown = markdown.slice(0, MAX_CHARS);
      truncated = true;
    }

    return {
      ok: true,
      name: "searchsegment",
      output: markdown,
      metadata: {
        url,
        truncated,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: "searchsegment",
      error: `Failed to fetch URL content: ${message}`,
    };
  }
}
