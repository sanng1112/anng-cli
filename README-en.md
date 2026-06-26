<div align="center">
<br/>
<p align="center">
  <a href='https://anng.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="anng-cli"/>
  </a>
</p>
<h1>ANNG CLI</h1>

<h3>Autonomous AI Coding Assistant on the Terminal 🚀</h3>

[![npm](https://img.shields.io/npm/v/anng-cli?color=D4704B&labelColor=black&logo=npm&logoColor=white&style=flat-square)](https://www.npmjs.com/package/anng-cli)
[![github-stars](https://img.shields.io/github/stars/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/stargazers)
[![github-license](https://img.shields.io/github/license/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/blob/main/LICENSE)

<br/>
[Tiếng Việt](./README.md) · English · [中文](./README-zh_CN.md)
</div>

---

**ANNG CLI** is a terminal-based AI coding assistant designed and optimized for autonomous programming. 

Specially tuned for advanced reasoning models like **DeepSeek V4/R1** and **Google Gemini 1.5/2.0 Pro**, ANNG CLI automates the entire software development lifecycle: from writing code, testing, and debugging to orchestrating a team of intelligent Multi-Agents to tackle complex software projects.

---

## 🌟 Key Features

- 🤖 **Multi-Provider & LLM-Optimized:** Supports multiple LLM providers (OpenAI, DeepSeek, Gemini, etc.) with native toggle for **Thinking Mode** and fine-grained **Reasoning Effort** controls accessible directly from the TUI.
- 🎨 **Elegant Terminal UI (TUI):** A minimalist TUI built with React Ink, featuring ASCII/Quadrant Blocks and a sophisticated `#D4704B` color palette. Supports pasting images directly from the clipboard (`Ctrl+V`).
- 👥 **Multi-Agent Team Mode:** Dispatches and coordinates complex tasks among multiple parallel AI agents. Supports visual execution in split panels using **Tmux**.
- 🛠️ **Model Context Protocol (MCP):** Easily expand agent capabilities by connecting to databases, web browsers, Git repositories, AWS, Slack, and more via MCP servers.
- 🧩 **Agent Skills System:** Define custom, project-specific workflows for your agents using Markdown files (`SKILL.md`) and companion scripts.
- 🔑 **Automatic API Key Rotation:** Automatically read and rotate multiple API keys from `~/.anng/gemini_keys.txt` to seamlessly handle provider rate limits.
- 🛡️ **Granular Permission Control:** Secure sandbox policy settings to confirm or auto-allow file reads, writes, deletes, command execution, or network requests. Supports a hassle-free **YOLO** mode (`--yolo`).
- 📋 **Persistent Task Queue:** Manage and queue tasks sequentially, persisting queue state under `.anng/memory/task-queue.md`.

---

## 🚀 Installation & Setup

### Install globally from NPM
```bash
npm install -g anng-cli
```

### Install from Source (For local development)
```bash
# Clone the repository
git clone https://github.com/lessweb/anng-cli.git
cd anng-cli
npm install

# Build and link globally
npm run build
npm link
```

### Run
Launch ANNG CLI in any project directory:
```bash
anng
```

---

## ⚙️ Configuration (`settings.json`)

ANNG CLI resolves configurations in the following priority order:
1. Project-level settings: `./.anng/settings.json`
2. User-level settings: `~/.anng/settings.json`

*(Configuration file is shared with the ANNG VSCode extension—configure once, use everywhere).*

### Sample Configuration for DeepSeek
```json
{
  "env": {
    "MODEL": "deepseek-v4-pro",
    "BASE_URL": "https://api.deepseek.com/v1",
    "API_KEY": "sk-..."
  },
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

### Sample Configuration for Gemini (with Key Rotation)
To rotate multiple Gemini API keys, create a `~/.anng/gemini_keys.txt` file and insert your keys (one key per line). Then configure `settings.json`:
```json
{
  "provider": "gemini",
  "env": {
    "MODEL": "gemini-2.5-pro",
    "GEMINI_BASE_URL": "https://generativelanguage.googleapis.com/v1beta/openai/"
  },
  "thinkingEnabled": true
}
```

### Configuring MCP Servers
Enable external capabilities by registering MCP servers under the `mcpServers` object:
```json
{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "/path/to/your/repo"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost:5432/mydb"]
    }
  }
}
```

### Permission Settings
Configure how ANNG asks for approval before running operations:
```json
{
  "permissions": {
    "defaultMode": "askAll",
    "allow": ["read-in-cwd", "query-git-log"],
    "deny": ["delete-out-cwd"],
    "ask": ["write-in-cwd", "write-out-cwd", "network", "mcp"]
  }
}
```
Supported permission scopes:
- `read-in-cwd` / `read-out-cwd`: Read files within/outside the current working directory.
- `write-in-cwd` / `write-out-cwd`: Write files within/outside the current working directory.
- `delete-in-cwd` / `delete-out-cwd`: Delete files within/outside the current working directory.
- `query-git-log` / `mutate-git-log`: Perform git operations.
- `network`: Allow outgoing network HTTP requests.
- `mcp`: Execute tools provided by active MCP servers.

---

## 🎮 How to Use

### 1. Keyboard Shortcuts in TUI
| Key | Action |
| :--- | :--- |
| `Enter` | Send the prompt / Confirm tool execution. |
| `Shift+Enter` | Insert a newline for multi-line prompts. |
| `Ctrl+V` | Paste an image from the clipboard. |
| `Ctrl+X` | Clear pasted images. |
| `Esc` | Interrupt the active AI response/reasoning stream. |
| `Home` / `End` | Move cursor to start/end of the input line. |
| `Alt+Left/Right` | Move cursor word-by-word. |
| `Ctrl+W` | Delete the word before the cursor. |
| `Ctrl+C` (twice) | Force quit the application. |

### 2. Slash Commands in TUI
Type `/` in the prompt input to open the commands menu:
- `/model`: Switch models, toggle thinking, or select reasoning effort (Low/Medium/High/Max).
- `/skills`: List all active and available agent skills.
- `/mcp`: View MCP servers status and list their loaded tools.
- `/queue`: Manage task queue (`/queue add <task>`, `/queue list`, `/queue process`).
- `/new`: Start a fresh conversation (resets active session history).
- `/resume`: Select and resume a past conversation from your logs.
- `/continue`: Continue the active session (or resume one if prompt is empty).
- `/undo`: Revert the codebase changes and/or conversation history to a previous state.
- `/raw`: Toggle raw view to show or collapse model reasoning steps.
- `/query`: Show session metrics, project stats, and current configuration.
- `/bg`: View running background processes and tasks.
- `/btw <msg>`: Send a quick side note to the AI without triggering a code run.
- `/init`: Initialize an `AGENTS.md` file (LLM-friendly project instructions).
- `/exit`: Safely exit the TUI application.

### 3. Command Line Flags (CLI execution)
Run in headless mode or configure execution states using command line arguments:
```bash
# Direct execution in YOLO mode (auto-accept all operations)
anng --yolo -p "Write a test.js script and run it using node"

# Plan mode: force confirmation for every single tool execution
anng --plan -p "Refactor all files under src/utils"

# Headless mode with a maximum turn limit to prevent infinite loops
anng --yolo --max-turns 15 -p "Build a React dashboard app inside ./dashboard"

# Run Multi-Agent Team Mode
anng --team -p "Develop a Snake game in HTML/JS with a polished UI"

# Run Team Mode visualized in separate Tmux window panes
anng --team --tmux -p "Analyze current repo and refactor it into clean architecture"

# Run Team Mode with 8 parallel worker agents
anng --team --team-workers 8 -p "Write unit tests for all files in src/"
```

---

## 👥 Multi-Agent (Team Mode)

With the `--team` flag, ANNG CLI acts as a coordinator:
1. **Dispatcher Agent:** Inspects the repository, plans the architectural tasks, breaks down the workload, and assigns them to worker agents.
2. **Worker Agents:** Process individual assignments in parallel (writing code, compiling, testing).
3. **Reviewer Agent (Optional):** Evaluates codebase patches before they are merged.

Using `--tmux` automatically launches a Tmux session, splitting your screen into dynamic visual panels where you can see every active Worker Agent solving code tasks simultaneously.

---

## 🧩 Skills System

Skills let you standardize workflows for the AI. A skill is a folder that must contain a `SKILL.md` file:
- **YAML Frontmatter**: Defines `name` and `description`.
- **Markdown Body**: Custom instructions guiding the agent through specific actions.
- **Helper Directories (Optional)**: `scripts/` for execution tools, `examples/` for reference code implementations.

### Discovery Order:
ANNG CLI scans for skills in the following order:
1. Project-level (Native): `./.anng/skills/`
2. Project-level (Interoperable): `./.agents/skills/`
3. User-level (Native): `~/.anng/skills/`
4. User-level (Interoperable): `~/.agents/skills/`

---

## 🔍 Built-in Web Search & Crawling
ANNG CLI is equipped with built-in internet access:
- **`searchweb`**: Searches the web for docs, bugs, or packages.
- **`searchsegment`**: Crawls specific web pages and parses HTML into clean Markdown to save context tokens.

---

## 🙋 FAQ

#### 1. Does ANNG CLI have a VSCode extension?
Yes! The VSCode extension is available on the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=vegamo.anng-vscode). It shares the same `~/.anng/settings.json` file as the CLI.

#### 2. How can I receive Slack notifications when a task completes?
Write a shell script that pushes status payloads to your Slack Webhook. Set the `"notify"` attribute in `settings.json` to the absolute path of your script:
```json
{
  "notify": "/absolute/path/to/your/slack-notify.sh"
}
```

#### 3. DeepSeek V4 does not support images. How can I paste images?
DeepSeek V4 is a text-only model. If you want to use multimodal inputs (pasting images using `Ctrl+V`), switch the model to a multimodal model like `gemini-2.5-pro` or `gpt-4o` using `/model` command inside the TUI.

#### 4. Can I customize tests and syntax checks after code generation?
Yes, set the `"autoLinter"` option in `settings.json` (e.g., `"npm run lint"` or `"eslint --fix"`). The AI will run this task automatically after updating files to self-correct code styles or syntax errors.

---

## 🤝 Contributing & Support

We welcome issues, feedback, and pull requests!

If ANNG CLI is making your development faster and fun, please give us a **Star 🌟**!

- **GitHub Repository**: [https://github.com/lessweb/anng-cli](https://github.com/lessweb/anng-cli)
- **Bug Reports & Feature Requests**: [GitHub Issues](https://github.com/lessweb/anng-cli/issues)

---
**License:** Released under the [MIT](./LICENSE) License.
