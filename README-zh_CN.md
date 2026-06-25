<div align="center">
<br/>
<br/>
<p align="center">
  <a href='https://anng.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="anng-cli"/>
  </a>
</p>
<h1>ANNG CLI</h1>

[![][github-contributors-shield]][github-contributors-link] [![][github-forks-shield]][github-forks-link] [![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link] [![][github-issues-pr-shield]][github-issues-pr-link] [![][github-license-shield]][github-license-link]

[English](./README-en.md) · 中文 · [Tiếng Việt](./README.md)

<br/>
</div>

[ANNG CLI](https://github.com/lessweb/anng-cli) 是一个基于 Go 的终端 AI 编码助手，提供 Bubble Tea TUI、无界面执行模式、skills 和 MCP 集成。

## 环境要求

- Go `1.24` 或更高版本
- 你要使用的模型提供商 API Key

## 构建

```bash
go build -o anng ./cmd/anng
```

或使用 `Makefile`：

```bash
make build
```

运行测试：

```bash
make test
```

## 运行

启动交互式 TUI：

```bash
./anng
```

启动时携带初始提示词：

```bash
./anng -p "总结这个项目"
```

自动批准的无界面任务：

```bash
./anng --yolo --max-turns 10 -p "运行测试并修复失败"
```

## 配置

ANNG CLI 会先读取 `./.anng/settings.json`，不存在时再回退到 `~/.anng/settings.json`。

示例：

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com",
  "autoAccept": false,
  "planMode": false,
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

当前 Go 运行时支持的顶层字段：

| 字段 | 说明 |
| --- | --- |
| `provider` | `openai`、`deepseek`、`anthropic` 或 `google` |
| `model` | 模型标识 |
| `apiKey` | OpenAI-compatible 提供商 API Key |
| `baseUrl` | 可选 API 地址覆盖 |
| `geminiApiKey` | 使用 Google 提供商时的 Gemini API Key |
| `geminiBaseUrl` | 可选 Gemini OpenAI-compatible 地址 |
| `autoAccept` | 自动批准工具权限提示 |
| `planMode` | 规划模式，阻止会修改状态的工具 |
| `thinkingEnabled` | 在支持的模型上启用 thinking mode |
| `reasoningEffort` | 可选 `-`、`none`、`low`、`medium`、`high`、`max` |
| `models` | TUI 中显示的自定义模型列表 |
| `env` | 与 settings 一起保存的额外环境变量 |

环境变量：

- `ANNG_PROVIDER`
- `ANNG_MODEL`
- `ANNG_API_KEY`
- `ANNG_BASE_URL`
- `ANNG_THINKING_ENABLED`
- `ANNG_REASONING_EFFORT`
- `GEMINI_API_KEY`
- `GEMINI_BASE_URL`

## 命令

在 TUI 中输入 `/` 打开命令菜单。

| 命令 | 作用 |
| --- | --- |
| `/new` | 新建会话 |
| `/resume` | 恢复历史会话 |
| `/continue` | 继续最近的活动会话 |
| `/model` | 切换模型与 reasoning 设置 |
| `/settings` | 编辑运行时设置 |
| `/skills` | 查看可用 skills |
| `/mcp` | 查看 MCP 服务状态 |
| `/undo` | 恢复之前的 checkpoint |
| `/init` | 创建 `AGENTS.md` |
| `/raw` | 切换显示模式 |
| `/team`、`/team-dp`、`/team-wf` | 打开 team orchestration 视图 |
| `/exit` | 退出程序 |

## 基本按键

| 按键 | 作用 |
| --- | --- |
| `Enter` | 发送提示词 |
| `Ctrl+J` | 插入换行 |
| `Esc` | 中断或返回 |
| `Ctrl+C` / `Ctrl+D` | 退出 |

## 支持的提供商

- `openai`
- `deepseek`
- `anthropic`
- `google`

## 文档

- [快速开始](./docs/quickstart.md)
- [配置说明](./docs/configuration.md)
- [MCP](./docs/mcp.md)
- [Agent Skills](./docs/agent-skills.md)

## 参与贡献

```bash
git clone https://github.com/lessweb/anng-cli.git
cd anng-cli
make test
make build
```

## 许可证

MIT

<!-- LINK GROUP -->

[github-contributors-link]: https://github.com/lessweb/anng-cli/graphs/contributors
[github-contributors-shield]: https://img.shields.io/github/contributors/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-forks-link]: https://github.com/lessweb/anng-cli/network/members
[github-forks-shield]: https://img.shields.io/github/forks/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-stars-link]: https://github.com/lessweb/anng-cli/network/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-issues-link]: https://github.com/lessweb/anng-cli/issues
[github-issues-shield]: https://img.shields.io/github/issues/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-issues-pr-link]: https://github.com/lessweb/anng-cli/pulls
[github-issues-pr-shield]: https://img.shields.io/github/issues-pr/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-license-link]: https://github.com/lessweb/anng-cli/blob/main/LICENSE
[github-license-shield]: https://img.shields.io/github/license/lessweb/anng-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
