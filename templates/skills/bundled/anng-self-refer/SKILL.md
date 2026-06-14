---
name: anng-self-refer
description: Answer questions about ANNG CLI CLI itself — including features, configuration, slash commands, Skills, MCP integration, permissions, notifications, session persistence, and troubleshooting. Use when the user asks how to configure or use ANNG CLI, set up MCP servers, configure notifications (Slack/Feishu), manage permissions, view available skills, understand slash commands, configure thinking mode, use Undo, or integrate ANNG CLI with VSCode.
---

# ANNG CLI Self-Refer

This Skill helps you answer user questions about ANNG CLI CLI itself by consulting the reference documentation bundled with this Skill. All docs live in the `references/` subdirectory — always refer to them for authoritative answers.

## When to use this Skill

Use this Skill when the user asks any question about ANNG CLI itself, such as:

- "List available skills"
- "How to configure MCP?"
- "Add playwright mcp to this project"
- "How to enable search?"
- "Which models are supported?"
- "How to configure thinking mode?"
- "How to set permissions?"
- "How to send notifications after task completion?"
- "What slash commands are supported?"
- "Where is session history stored?"
- "How does /undo work?"
- "How does ANNG CLI integrate with the VSCode extension?"
- Any other question about ANNG CLI CLI's features, configuration, or usage.

## Instructions

### Step 1: Identify the topic

Map the user's question to the appropriate document(s):

| Topic | Document | Key contents |
|-------|----------|-------------|
| **Overview, features, quick start** | `references/README.md` | Installation, slash commands, keyboard shortcuts, supported models, FAQ |
| **Configuration & settings** | `references/configuration.md` | `settings.json` fields, config hierarchy, env vars, thinking mode, reasoning effort, webSearchTool, enabledSkills |
| **MCP setup & usage** | `references/mcp.md` | MCP server config format, GitHub/Playwright/Filesystem examples, tool naming (`mcp__<name>__<tool>`), troubleshooting |
| **Permissions** | `references/permission.md` | Permission scopes (10 types), allow/deny/ask/defaultMode config, priority rules, persistence |
| **Notifications** | `references/notify.md` | Notify script path, injected env vars, Slack/Feishu/iTerm2/macOS/Linux/Windows examples |
| **Session persistence** | `references/session-persistence.md` | Storage paths, JSONL format, session index, compaction, `/undo` mechanics, code snapshots |

### Step 2: Read the relevant document(s)

Use the `Read` tool to read the appropriate document(s) from the list above. All paths are relative to this Skill's loaded root directory, where the `references/` subdirectory lives.

- If the question spans multiple topics, read multiple documents.
- If a document doesn't exist in the user's preferred language (e.g., Chinese), try the other language variant (e.g., `references/configuration_en.md`).
- When answering from references/README.md, focus on the relevant sections.

### Step 3: Answer with precision

- **Quote the doc directly** for config examples, JSON snippets, or command syntax.
- **Don't guess** — if the answer isn't in the docs, say so and suggest checking GitHub Issues.
- **Provide copy-paste-ready configurations** when the user asks to set something up (e.g., MCP servers, notify scripts, permissions).
- **Mention related docs** when appropriate (e.g., MCP setup references `references/mcp.md`, the permissions section references `references/permission.md`).

### Step 4: Handle common request patterns

**"List/view available skills":**
- Treat `/skills` as the canonical UI for listing currently available skills.
- If answering directly, do not infer the list only from loaded skill prompts or from project/user directories. Enumerate all discovery roots:
  1. `./.anng/skills/<folder>/SKILL.md`
  2. `./.agents/skills/<folder>/SKILL.md`
  3. `~/.anng/skills/<folder>/SKILL.md`
  4. `~/.agents/skills/<folder>/SKILL.md`
  5. bundled built-in skills as `bundled:<folder>/SKILL.md`
- For a source checkout, bundled skills live under `templates/skills/bundled/<folder>/SKILL.md`. For a packaged install, bundled skills may live under `dist/bundled/<folder>/SKILL.md`.
- Read each candidate `SKILL.md` frontmatter to get the resolved `name` and `description`; the folder name is only a fallback.
- De-duplicate by resolved `name`, keeping the highest-priority root from the order above.
- Apply `enabledSkills` from `settings.json`: if `enabledSkills["<name>"] === false`, do not list that skill as available.
- Clearly separate discoverable skills from other concepts:
  - Discoverable skills are selectable through `/skills` and come from the roots above.
  - Bundled skills are discoverable skills shipped with ANNG CLI, such as `bundled:anng-self-refer/SKILL.md`.
  - Default prompt templates or always-injected guidance are not necessarily discoverable skills unless they also exist as `*/SKILL.md` in one of the scan roots.
  - Slash commands such as `/skills`, `/mcp`, and `/undo` are commands, not skills.
- Mention that `/skills` can be used to verify the result and `enabledSkills` can enable/disable specific skills by name.

**"Configure <X> MCP":**
- Read `references/mcp.md` for the MCP format and examples
- Ask the user for any required credentials (e.g., GitHub token)
- Provide the exact `mcpServers` JSON block to add to `settings.json`
- Mention using `/mcp` to verify the setup afterwards

**"How to configure/modify <setting>":**
- Read `references/configuration.md`
- Explain which `settings.json` field controls the setting
- Clarify user-level (`~/.anng/settings.json`) vs project-level (`.anng/settings.json`)
- Provide the exact JSON snippet

**"What does <slash command> do?":**
- Read the slash command table from references/README.md
- Provide a brief explanation with any additional context from relevant docs

### Best practices

1. **Always consult the docs first** — never answer from memory alone; the docs are the source of truth.
2. **Provide copy-paste-ready JSON** — users want to copy config blocks directly into their `settings.json`.
3. **Be specific about file paths** — always specify whether it's `~/.anng/settings.json` or `.anng/settings.json`.
4. **Mention `/mcp` verification** — after any MCP configuration change, remind users to use `/mcp` to verify.
5. **Acknowledge both Chinese and English docs** — the project has docs in both languages (`references/xxx.md` for Chinese, `references/xxx_en.md` for English).

## Examples

### Example 1: "List available skills"

Read references/README.md, locate the Skills section, then enumerate all scan roots including bundled skills. Answer:

- Skills are discovered from: `./.anng/skills/`, `./.agents/skills/`, `~/.anng/skills/`, `~/.agents/skills/`, and bundled built-in skills such as `bundled:anng-self-refer/SKILL.md`.
- In a source checkout, check `templates/skills/bundled/*/SKILL.md`; in a packaged install, check `dist/bundled/*/SKILL.md`.
- Built-in bundled skills may include `anng-self-refer`, `plan`, `skill-digester`, and `skill-writer`; verify the actual list by scanning the bundled root because it can change between versions.
- Use `/skills` slash command in the ANNG CLI CLI to list all available skills
- Use `enabledSkills` in `settings.json` to enable/disable skills by name

### Example 2: "Add playwright mcp to this project"

Read `references/mcp.md`, locate the Playwright example. Answer:

- Add to `settings.json` (user-level `~/.anng/settings.json` or project-level `.anng/settings.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

- If merging with existing config, add the `"playwright"` entry into the existing `mcpServers` object
- After saving, use `/mcp` in ANNG CLI to verify the server is running

### Example 3: "How to set up Slack notifications?"

Read `references/notify.md`, locate the Slack section. Answer with the script + config.

### Example 4: "How to allow AI only read/write in current directory?"

Read `references/permission.md`, locate the strict mode example. Provide the exact JSON.
