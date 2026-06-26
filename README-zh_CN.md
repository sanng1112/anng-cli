<div align="center">
<br/>
<p align="center">
  <a href='https://anng.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="anng-cli"/>
  </a>
</p>
<h1>ANNG CLI</h1>

<h3>运行在终端上的自主 AI 编码助手 🚀</h3>

[![npm](https://img.shields.io/npm/v/anng-cli?color=D4704B&labelColor=black&logo=npm&logoColor=white&style=flat-square)](https://www.npmjs.com/package/anng-cli)
[![github-stars](https://img.shields.io/github/stars/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/stargazers)
[![github-license](https://img.shields.io/github/license/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/blob/main/LICENSE)

<br/>
[Tiếng Việt](./README.md) · [English](./README-en.md) · 中文
</div>

---

**ANNG CLI** 是一款专为自主编程（Autonomous Programming）设计和优化的终端 AI 编码助手。

它专门针对 **DeepSeek V4/R1** 和 **Google Gemini 1.5/2.0 Pro** 等先进的推理/思考模型进行了深度调优。ANNG CLI 能够实现软件开发全生命周期的自动化：从编写代码、测试和调试，到协调多智能体（Multi-Agent）团队合作解决复杂的软件项目。

---

## 🌟 主要功能

- 🤖 **多服务商支持与 LLM 优化：** 支持多个大模型服务商（OpenAI, DeepSeek, Gemini 等），并可在终端 TUI 中直接切换**思考模式（Thinking Mode）**和调节**推理强度（Reasoning Effort）**。
- 🎨 **优雅的终端 UI (TUI)：** 基于 React Ink 构建的极简 TUI，包含 ASCII/Quadrant 块风格和精致的 `#D4704B` 配色。支持直接从剪贴板粘贴图片 (`Ctrl+V`)。
- 👥 **多智能体团队模式（Team Mode）：** 将复杂开发任务分解并在多个并行运行的 Worker Agent 之间进行协调。支持在 **Tmux** 拆分面板中直观展示运行过程。
- 🛠️ **模型上下文协议 (MCP)：** 可通过接入 MCP 服务器将大模型连接至数据库、网页浏览器、Git 仓库、AWS、Slack 等，无限扩展 Agent 能力。
- 🧩 **智能体技能系统 (Skills System)：** 支持通过 Markdown 文件 (`SKILL.md`) 及伴随脚本为 Agent 自定义特定项目的标准化工作流。
- 🔑 **API Key 自动轮换：** 针对 Gemini，支持在 `~/.anng/gemini_keys.txt` 中写入多个 Key，系统将自动进行轮换以规避服务商的 Rate Limit。
- 🛡️ **细粒度权限控制：** 包含安全的沙箱策略配置，AI 在执行文件读写删除、执行 Shell 命令或发起网络请求前均需确认。支持免打扰的 **YOLO** 模式 (`--yolo`)。
- 📋 **持久化任务队列：** 顺序管理并排队执行任务，队列状态自动持久化在 `.anng/memory/task-queue.md` 中。

---

## 🚀 安装与运行

### 全局安装 (通过 NPM)
```bash
npm install -g anng-cli
```

### 源码安装 (用于本地开发)
```bash
# 克隆仓库
git clone https://github.com/lessweb/anng-cli.git
cd anng-cli
npm install

# 构建并进行本地全局链接
npm run build
npm link
```

### 运行
在任意项目目录下启动 ANNG CLI：
```bash
anng
```

---

## ⚙️ 配置说明 (`settings.json`)

ANNG CLI 按照以下优先级解析配置文件：
1. 项目级配置：`./.anng/settings.json`
2. 用户级配置：`~/.anng/settings.json`

*(配置文件与 ANNG VSCode 插件共享，一次配置，随处可用)*

### DeepSeek 配置示例
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

### Gemini 配置示例（含 API Key 自动轮换）
要启用多个 Gemini API Key 自动轮换，请创建 `~/.anng/gemini_keys.txt` 文件并逐行填入您的 Key（每行一个）。接着配置 `settings.json`：
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

### 配置 MCP 服务器
在 `mcpServers` 对象中注册 MCP 服务器以启用外部工具扩展：
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

### 权限安全设置
配置 AI 在执行操作前请求确认的策略：
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
支持的权限范围：
- `read-in-cwd` / `read-out-cwd`：读取当前工作区内/外的文件。
- `write-in-cwd` / `write-out-cwd`：写入当前工作区内/外的文件。
- `delete-in-cwd` / `delete-out-cwd`：删除当前工作区内/外的文件。
- `query-git-log` / `mutate-git-log`：执行 Git 查询或操作。
- `network`：允许发起网络 HTTP 请求。
- `mcp`：使用已加载的 MCP 服务工具。

---

## 🎮 使用指南

### 1. 终端 TUI 快捷键
| 按键 | 功能 |
| :--- | :--- |
| `Enter` | 发送 Prompt / 确认允许工具执行。 |
| `Shift+Enter` | 插入换行符以输入多行 Prompt。 |
| `Ctrl+V` | 从剪贴板粘贴图片。 |
| `Ctrl+X` | 清除已粘贴的图片。 |
| `Esc` | 中断当前 AI 文本输出或推理思考流。 |
| `Home` / `End` | 将光标移动到输入行的行首/行尾。 |
| `Alt+Left/Right` | 逐字移动光标。 |
| `Ctrl+W` | 删除光标前的单词。 |
| `Ctrl+C` (连续按两次) | 强制退出程序。 |

### 2. TUI 斜杠命令
在输入框输入 `/` 即可打开命令菜单：
- `/model`：切换模型、开启/关闭思考模式，或者选择推理强度 (Low/Medium/High/Max)。
- `/skills`：列出当前项目和全局所有可用的技能。
- `/mcp`：查看 MCP 服务器连接状态及可用的工具列表。
- `/queue`：管理和执行任务队列（如 `/queue add <task>`，`/queue list`，`/queue process`）。
- `/new`：开始全新对话（清除当前会话历史）。
- `/resume`：选择并恢复历史对话会话。
- `/continue`：继续当前的活动会话。
- `/undo`：撤销代码修改和/或将对话状态恢复到上一步。
- `/raw`：切换 Raw 视图以展开或折叠模型的思考/推理步骤。
- `/query`：显示当前会话指标、项目统计数据及系统配置。
- `/bg`：查看后台运行的异步进程与任务。
- `/btw <msg>`：向 AI 发送简短备忘，不触发正式的代码执行。
- `/init`：快速初始化 `AGENTS.md` 文件（用于对大模型说明项目规则）。
- `/exit`：安全退出 TUI 应用。

### 3. 命令行参数 (CLI 运行)
可以通过命令行参数直接以无界面模式（Headless）或自定义状态启动：
```bash
# 在 YOLO 模式下直接执行任务（自动确认所有操作）
anng --yolo -p "用 Node.js 编写一个 test.js 脚本并运行"

# Plan 模式：执行任何工具前强制进行用户确认
anng --plan -p "重构 src/utils 下的所有文件"

# 限制最大会话轮数的自动运行（防死循环）
anng --yolo --max-turns 15 -p "在 ./dashboard 目录构建 React 仪表盘"

# 启动多智能体团队模式（Team Mode）
anng --team -p "编写一个带有精美 UI 的 HTML/JS 贪吃蛇游戏"

# 启动 Team Mode 并使用 Tmux 分屏面板直观展示各个 Worker 的工作状态
anng --team --tmux -p "分析当前代码库并将其重构为干净架构 (Clean Architecture)"

# 使用 8 个并行 Worker 智能体运行 Team Mode
anng --team --team-workers 8 -p "为 src/ 目录下的所有文件编写单元测试"
```

---

## 👥 多智能体团队模式 (Team Mode)

当使用 `--team` 参数启动时，ANNG CLI 会进行多任务分工协作：
1. **Dispatcher Agent（分发者）：** 分析项目结构、制定架构规划、拆分任务，并将其指派给不同的 Worker Agent。
2. **Worker Agents（工作者）：** 并行处理分配的任务（如编写代码、编译、测试等）。
3. **Reviewer Agent（评审者，可选）：** 在最终合并代码补丁前对代码进行评审。

结合 `--tmux` 参数（需要系统已安装 `tmux`）启动时，系统会自动打开 Tmux 会话并拆分屏幕，您可直观看到多个 Worker Agent 协同工作的终端窗口。

---

## 🧩 技能系统 (Skills System)

Skills 是您规范或扩展 AI Agent 项目特定工作流的方式。每个 Skill 是一个文件夹，且必须包含 `SKILL.md` 文件：
- **YAML Frontmatter**：定义 `name` 和 `description`。
- **Markdown 主体**：具体指导 Agent 执行步骤的说明。
- **辅助文件夹（可选）**：`scripts/` 存放可执行脚本，`examples/` 存放代码编写参考示例。

### 扫描加载顺序：
系统将按照以下顺序扫描加载可用技能：
1. 项目级 (Native): `./.anng/skills/`
2. 项目级 (Interoperable): `./.agents/skills/`
3. 用户级 (Native): `~/.anng/skills/`
4. 用户级 (Interoperable): `~/.agents/skills/`

---

## 🔍 内置网页搜索与数据抓取
ANNG CLI 自带强大的网络数据能力：
- **`searchweb`**：在互联网上搜索最新文档、Issue 或模块包。
- **`searchsegment`**：抓取特定网页，并将 HTML 自动转换为精简的 Markdown 格式，以节省大模型 Token。

---

## 🙋 常见问题 (FAQ)

#### 1. ANNG CLI 是否有 VSCode 插件？
有！您可以在 [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=vegamo.anng-vscode) 搜索并安装。VSCode 插件与 CLI 共享相同的 `~/.anng/settings.json` 文件，您无需重复配置 API Key。

#### 2. 如何在任务完成后向 Slack 自动发送通知？
编写一个向 Slack Webhook 推送消息的 shell 脚本。然后在 `settings.json` 中配置 `"notify"` 字段为该脚本的绝对路径即可：
```json
{
  "notify": "/absolute/path/to/your/slack-notify.sh"
}
```

#### 3. DeepSeek V4 不支持多模态输入（图片），我该如何使用图片粘贴？
DeepSeek V4 目前是纯文本模型。如果您要使用多模态能力（在 TUI 中使用 `Ctrl+V` 粘贴图片），请在 TUI 中输入 `/model` 切换为 `gemini-2.5-pro` 或 `gpt-4o` 等支持多模态的模型。

#### 4. 是否可以在代码修改后自动进行代码风格与语法检查？
可以，请在 `settings.json` 中配置 `"autoLinter"`（例如 `"npm run lint"` 或 `"eslint --fix"`）。AI 会在修改完文件后自动运行此命令进行自纠自错。

---

## 🤝 贡献与支持

我们非常欢迎提交 Issue、反馈或 Pull Request！

如果 ANNG CLI 提高了您的开发效率，请为我们点亮一颗 **Star 🌟**！

- **GitHub 仓库**: [https://github.com/lessweb/anng-cli](https://github.com/lessweb/anng-cli)
- **问题反馈与建议**: [GitHub Issues](https://github.com/lessweb/anng-cli/issues)

---
**License:** 本项目基于 [MIT](./LICENSE) 协议发布。
