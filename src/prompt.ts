import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import matter from "gray-matter";
import { fileURLToPath } from "url";
import type { SessionMessage } from "./session";
import { findGitBashPath, resolveShellPath } from "./common/shell-utils";
import { supportsMultimodal } from "./common/model-capabilities";

const COMPACT_PROMPT_BASE = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
  - Errors that you ran into and how you fixed them
  - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
6. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
7. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
8. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]

4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
    - [...]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

6. All user messages: 
    - [Detailed non tool use user message]
    - [...]

7. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>`;

const SYSTEM_PROMPT_BASE = `# ROLE & OBJECTIVE
You are an elite, autonomous Software Engineering AI Agent operating within a highly optimized CLI environment. Your goal is to solve complex programming tasks, debug errors, and refactor code with maximum efficiency and minimum latency.

# SYSTEM CAPABILITIES & CONSTRAINTS
1. TERMINAL TRUNCATION: If you execute a \`bash\` command and the output exceeds 200 lines, the system will automatically hard-cut the middle. You will only see the FIRST 50 lines and the LAST 50 lines. Use them to debug.
2. CONTEXT PRUNING: Your memory is actively managed. Old logs are summarized to keep context under limits. Focus on the current state.
3. PARALLEL TOOL CALLING: You are explicitly authorized and highly encouraged to execute MULTIPLE tool calls simultaneously in a single turn to save time. DO NOT work sequentially if tasks are independent.

# EXECUTION WORKFLOW
1. Analyze the user's request.
2. Determine the maximum number of independent tools you can fire simultaneously to gather information.
3. Formulate the solution and apply changes.`;

type PromptToolOptions = {
  model?: string;
  webSearchEnabled?: boolean;
  planMode?: boolean;
  autoAccept?: boolean;
};

const DEFAULT_SKILL_RESOURCE_FILE_LIMIT = 50;
const SKILL_RESOURCE_EXCLUDED_DIRS = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

export type SkillPromptDocument = {
  name: string;
  content: string;
  path?: string;
  skillFilePath?: string;
};

type SkillResourceListing = {
  files: string[];
  truncated: boolean;
};

function readToolDocs(extensionRoot: string, options: PromptToolOptions = {}): string {
  const toolsDir = path.join(extensionRoot, "templates", "tools");
  if (!fs.existsSync(toolsDir)) {
    return "";
  }

  const entries = fs.readdirSync(toolsDir);
  const docs = entries
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => {
      const fullPath = path.join(toolsDir, entry);
      try {
        let content = fs.readFileSync(fullPath, "utf8");
        if (content.includes("{{multimodal_instruction}}")) {
          const multimodalText = supportsMultimodal(options.model ?? "")
            ? "- This tool allows you to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Deepseek is a multimodal LLM."
            : "- This tool can inspect image files, but the current model is not multimodal, so image reads are not presented visually to the model.";
          content = content.replace("{{multimodal_instruction}}", multimodalText);
        }
        return content.trim();
      } catch {
        return "";
      }
    })
    .filter((content) => content.length > 0);

  return docs.join("\n\n");
}

export function buildSkillDocumentsPrompt(skills: SkillPromptDocument[]): string {
  const blocks = skills.map((skill) => renderSkillDocumentBlock(skill));
  return `Use the skill documents below to assist the user:\n${blocks.join("\n\n")}`;
}

function renderSkillDocumentBlock(skill: SkillPromptDocument): string {
  const pathAttribute = skill.path ? ` path="${escapeXml(skill.path)}"` : "";
  const resources = renderSkillResources(skill.skillFilePath);
  const content = stripSkillPromptMetadata(skill.content);
  return `<${skill.name}-skill${pathAttribute}>
${content}${resources}
</${skill.name}-skill>`;
}

function stripSkillPromptMetadata(content: string): string {
  try {
    const parsed = matter(content);
    if (!Object.prototype.hasOwnProperty.call(parsed.data, "metadata")) {
      return content;
    }

    const frontmatter = { ...parsed.data };
    delete frontmatter.metadata;
    return matter.stringify(parsed.content, frontmatter);
  } catch {
    return content;
  }
}

function renderSkillResources(skillFilePath?: string): string {
  if (!skillFilePath) {
    return "";
  }

  const listing = listSkillResourceFiles(skillFilePath, DEFAULT_SKILL_RESOURCE_FILE_LIMIT);
  if (listing.files.length === 0 && !listing.truncated) {
    return "";
  }

  const fileLines = listing.files.map((file) => `  <file>${escapeXml(file)}</file>`);
  const noteLine = listing.truncated
    ? [`  <note>Listing capped at ${DEFAULT_SKILL_RESOURCE_FILE_LIMIT} files and may be incomplete.</note>`]
    : [];
  return `\n\n<skill_resources>\n${[...fileLines, ...noteLine].join("\n")}\n</skill_resources>`;
}

function listSkillResourceFiles(skillFilePath: string, limit: number): SkillResourceListing {
  const skillDir = path.dirname(skillFilePath);
  const files: string[] = [];
  let truncated = false;

  const visit = (dir: string, relativeDir = ""): void => {
    if (files.length > limit) {
      truncated = true;
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKILL_RESOURCE_EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        visit(fullPath, relativePath);
        if (truncated) {
          return;
        }
        continue;
      }

      if (!entry.isFile() || entry.name === "SKILL.md") {
        continue;
      }

      files.push(toPosixPath(relativePath));
      if (files.length > limit) {
        truncated = true;
        return;
      }
    }
  };

  visit(skillDir);
  return { files: files.slice(0, limit), truncated };
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getCurrentDateAndModelPrompt(model?: string): string {
  const date = new Date();
  let prompt = `Today is ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}. Time passes as the conversation continues.`;
  prompt += model
    ? `
The current LLM model is ${model}. Switch models with the /model command.`
    : "";
  return prompt;
}

export function getSystemPrompt(projectRoot: string, options: PromptToolOptions = {}): string {
  const toolDocs = readToolDocs(getExtensionRoot(), options);
  let prompt = toolDocs ? `${SYSTEM_PROMPT_BASE}\n\n# Available Tools\n\n${toolDocs}` : SYSTEM_PROMPT_BASE;

  if (options.planMode) {
    prompt += `\n\n# PLANNING MODE
You are in planning mode. You cannot run mutating commands (bash, write, edit). They will be blocked. Focus on analysis.`;
  } else if (options.autoAccept) {
    prompt += `\n\n# AUTONOMOUS MODE
You are in autonomous mode. You have full execution permission. Execute quickly without asking unnecessary questions.`;
  } else {
    prompt += `\n\n# INTERACTIVE MODE
You are in interactive mode. Briefly explain your reasoning before taking major actions.`;
  }

  try {
    const anngMdPath = path.join(projectRoot, "ANNG.md");
    if (fs.existsSync(anngMdPath)) {
      const content = fs.readFileSync(anngMdPath, "utf-8");
      prompt += `\n\n# ANNG Workspace Cache / Rules\n\n${content}`;
    }
  } catch (_e) {
    // Ignore errors
  }

  return prompt;
}

export function getCompactPrompt(sessionMessages: SessionMessage[]): string {
  const jsonl = sessionMessages
    .map((message) =>
      JSON.stringify({
        id: message.id,
        role: message.role,
        content: message.content,
        contentParams: message.contentParams,
        messageParams: message.messageParams,
        createTime: message.createTime,
      })
    )
    .join("\n");
  return `${COMPACT_PROMPT_BASE}\n\nconversation below:\n\n\`\`\`jsonl\n${jsonl}\n\`\`\``;
}

export function getRuntimeContext(projectRoot: string, model?: string): string {
  const uname = getUnameInfo();
  const shellPath = getShellPathInfo();
  const shellModeOpts = process.platform === "win32" ? { "shell mode": "git-bash" } : {};
  const runtimeVersions = getRuntimeVersionInfo();
  const env = {
    "root path": projectRoot,
    pwd: projectRoot,
    homedir: os.homedir(),
    "system info": uname,
    "shell path": shellPath,
    ...shellModeOpts,
    ...runtimeVersions,
    "command installed": {
      ripgrep: checkToolInstalled("rg"),
      jq: checkToolInstalled("jq"),
    },
  };
  return `${getCurrentDateAndModelPrompt(model)}

# Local Workspace Environment

\`\`\`json
${JSON.stringify(env, null, 2)}
\`\`\``;
}

function checkToolInstalled(tool: string): boolean {
  try {
    if (process.platform === "win32") {
      const bashPath = findGitBashPath();
      execFileSync(bashPath, ["-lc", `command -v ${shellSingleQuote(tool)}`], {
        encoding: "utf8",
        stdio: "ignore",
        windowsHide: true,
      });
      return true;
    }
    execSync(`command -v ${tool}`, { encoding: "utf8", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getShellPathInfo(): string {
  try {
    return resolveShellPath();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function getRuntimeVersionInfo(): Record<string, string> {
  const versions: Record<string, string> = {};
  const pythonVersion = getCommandVersion("python3", ["--version"]);
  const nodeVersion = getCommandVersion("node", ["--version"]);

  if (pythonVersion) {
    versions["python3 version"] = pythonVersion.replace(/^Python\s+/i, "");
  }
  if (nodeVersion) {
    versions["node version"] = nodeVersion;
  }

  return versions;
}

function getCommandVersion(command: string, args: string[]): string | null {
  try {
    const commandText = [command, ...args].map(shellSingleQuote).join(" ");
    if (process.platform === "win32") {
      return execFileSync(findGitBashPath(), ["-lc", `${commandText} 2>&1`], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
    }
    return execSync(`${commandText} 2>&1`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getUnameInfo(): string {
  try {
    if (process.platform === "win32") {
      return execFileSync(findGitBashPath(), ["-lc", "uname -a"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim();
    }
    return execSync("uname -a", { encoding: "utf8" }).trim();
  } catch {
    return `${os.type()} ${os.release()} ${os.arch()}`;
  }
}

export function getExtensionRoot(): string {
  // Prefer `__dirname` which is always available in the CJS bundle output.
  // Fall back to `import.meta.url` for ESM test environments (tsx --test).
  if (typeof __dirname !== "undefined") {
    return path.resolve(__dirname, "..");
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFilePath), "..");
}

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export function getTools(_options: PromptToolOptions = {}, externalTools: ToolDefinition[] = []): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "AnalyzeProject",
        description:
          "Analyze the current project directory structure and dependencies using a proxy model to generate a high-level architecture map. Use this when starting work on a large unknown project.",
        parameters: {
          type: "object",
          properties: {
            depth: { type: "number", description: "The depth of the directory tree to scan. Default is 3." },
          },
          additionalProperties: false,
        },
      },
    },

    {
      type: "function",
      function: {
        name: "bash",
        description: "Execute shell commands in a persistent bash session.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The shell command to execute",
            },
            description: {
              type: "string",
              description:
                'Clear, concise description of what this command does in active voice. Never use words like "complex" or "risk" in the description - just describe what it does.',
            },
            sideEffects: {
              description:
                'Permission scopes required by this bash command. Use [] only for commands that do not read, write, delete, or access the network. Use ["unknown"] when the effects cannot be classified safely.',
              type: "array",
              items: {
                type: "string",
                enum: [
                  "read-in-cwd",
                  "read-out-cwd",
                  "write-in-cwd",
                  "write-out-cwd",
                  "delete-in-cwd",
                  "delete-out-cwd",
                  "query-git-log",
                  "mutate-git-log",
                  "network",
                  "unknown",
                ],
              },
              uniqueItems: true,
            },
            run_in_background: {
              type: "boolean",
              description:
                "Set to true to run the command in the background. Use this only when you need to perform a blocking task and do not need the result immediately.",
            },
          },
          required: ["command", "sideEffects"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "AskUserQuestion",
        description:
          "When the task has ambiguities or multiple implementation approaches, use this tool to pause execution and ask the user a question to get clarification or make a decision.",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              description: "Questions to present to the user. Usually only one question is needed at a time.",
              items: {
                type: "object",
                properties: {
                  question: {
                    type: "string",
                    description: "The question to ask the user.",
                  },
                  multiSelect: {
                    type: "boolean",
                    description: "Whether the user may choose multiple options.",
                  },
                  options: {
                    type: "array",
                    description: "A list of predefined options for the user to choose from.",
                    items: {
                      type: "object",
                      properties: {
                        label: {
                          type: "string",
                          description: "The display text for the option.",
                        },
                        description: {
                          type: "string",
                          description:
                            "A detailed explanation or hint about this option to help the user understand what happens if they choose it.",
                        },
                      },
                      required: ["label"],
                    },
                  },
                },
                required: ["question", "options"],
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "UpdatePlan",
        description:
          "Update the current task plan. The plan argument must be the complete markdown task list to show as the latest progress state.",
        parameters: {
          type: "object",
          properties: {
            plan: {
              type: "string",
              description:
                "The complete markdown task list, including task status markers such as [ ], [>], [x], and optional notes.",
            },
            explanation: {
              type: "string",
              description: "Optional short reason for changing the plan.",
            },
          },
          required: ["plan"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read",
        description: "Read files from the filesystem (text, images, PDFs, notebooks).",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "UNIX-style path to file",
            },
            offset: {
              type: "number",
              description: "Line number to start reading from",
            },
            limit: {
              type: "number",
              description: "Number of lines to read",
            },
            pages: {
              type: "string",
              description: 'Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files.',
            },
          },
          required: ["file_path"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write",
        description: "Create files or overwrite them with a complete string payload. Prefer edit for existing files.",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Absolute path to file",
            },
            content: {
              type: "string",
              description: "Complete file content as a single string. Serialize JSON documents before writing.",
            },
          },
          required: ["file_path", "content"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "edit",
        description: "Perform scoped string replacements in files.",
        parameters: {
          type: "object",
          properties: {
            snippet_id: {
              type: "string",
              description: "Required Read/Edit snippet_id.",
            },
            file_path: {
              type: "string",
              description: "Optional absolute path guard; must match snippet_id's file.",
            },
            old_string: {
              type: "string",
              description: "Exact text to replace inside snippet_id's scope",
            },
            new_string: {
              type: "string",
              description: "Replacement text (must differ from old_string)",
            },
            replace_all: {
              type: "boolean",
              description: "Replace all occurences of old_string (default false)",
              default: false,
            },
            expected_occurrences: {
              type: "number",
              description: "Expected number of matches, especially useful as a safety check with replace_all",
            },
          },
          required: ["snippet_id", "old_string", "new_string"],
          additionalProperties: false,
        },
      },
    },
  ];

  tools.push({
    type: "function",
    function: {
      name: "WebSearch",
      description: "Perform web searching using a natural language query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A search query phrased as a clear, specific natural language question or statement that includes key context.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  });

  for (const tool of externalTools) {
    tools.push(tool);
  }

  if (_options.planMode) {
    const allowedPlanTools = new Set(["AnalyzeProject", "AskUserQuestion", "UpdatePlan", "read", "WebSearch"]);
    return tools.filter((t) => allowedPlanTools.has(t.function.name));
  }

  return tools;
}
