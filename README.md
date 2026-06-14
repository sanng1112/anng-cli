<div align="center">
<br/>
<p align="center">
  <a href='https://deepcode.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="deepcode-cli"/>
  </a>
</p>
<h1>Deep Code CLI</h1>

<h3>Trợ lý Lập trình AI Tự trị Chạy Trên Terminal — Hỗ Trợ Multi-Agent Team</h3>

[![][npm-release-shield]][npm-release-link] [![][npm-downloads-shield]][npm-downloads-link] [![][github-contributors-shield]][github-contributors-link] [![][github-forks-shield]][github-forks-link] [![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link] [![][github-issues-pr-shield]][github-issues-pr-link] [![][github-license-shield]][github-license-link]

[English](README-en.md) · [中文](README-zh_CN.md) · **Tiếng Việt**

<br/>
</div>

---

## Tổng Quan

**Deep Code CLI** (`@vegamo/deepcode-cli`) là trợ lý lập trình AI chạy trên terminal, tối ưu cho **DeepSeek V4** và tương thích **Google Gemini**. Hỗ trợ hai chế độ:

- **Single-Agent**: Một agent AI làm việc tuần tự — đọc code, sửa file, chạy lệnh, tìm kiếm.
- **Multi-Agent Team** (`--team`): Chia task lớn cho nhiều agent chạy song song — mỗi agent có session, context, API key riêng.

### Công Nghệ Cốt Lõi

| Lớp | Công Nghệ |
|-----|-----------|
| Runtime | Node.js ≥ 22, TypeScript |
| TUI | Ink + React 19 |
| AI Client | OpenAI SDK (tương thích DeepSeek, Gemini) |
| Bundle | esbuild (single-file binary) |
| Validation | Zod 4 |

---

## Cài Đặt

```bash
npm install -g @vegamo/deepcode-cli
```

Yêu cầu Node.js ≥ 22.

### Từ Mã Nguồn

```bash
git clone https://github.com/lessweb/deepcode-cli.git
cd deepcode-cli
npm install && npm run build && npm link
deepcode
```

---

## Cấu Hình

Tạo `~/.deepcode/settings.json`:

```json
{
  "env": {
    "MODEL": "deepseek-v4-pro",
    "BASE_URL": "https://api.deepseek.com",
    "API_KEY": "sk-..."
  },
  "thinkingEnabled": true,
  "reasoningEffort": "max"
}
```

### Gemini

```json
{
  "env": {
    "MODEL": "gemini-2.5-flash",
    "GEMINI_API_KEY": "AIzaSy..."
  }
}
```

### Team Mode

```json
{
  "team": {
    "defaultMode": "internal",
    "maxParallelWorkers": 4,
    "defaultStrategy": "dependency-order",
    "workerDefaults": {
      "model": "deepseek-v4-flash",
      "maxTurns": 30,
      "taskTimeoutMs": 600000
    }
  }
}
```

> Xem chi tiết: [docs/configuration.md](docs/configuration.md)

---

## Cách Dùng

### Single-Agent (mặc định)

```bash
deepcode                                    # Interactive TUI
deepcode -p "Fix all lint errors"          # Headless prompt
deepcode --yolo -p "Refactor auth module"  # Tự động accept permissions
```

### Multi-Agent Team

```bash
deepcode --team -p "Build REST API + React frontend + tests"
deepcode --team --tmux -p "Refactor to microservices"     # Visual tmux mode
deepcode --team --team-workers 8 -p "Migrate codebase"     # 8 workers
```

### Trong TUI

| Lệnh | Mô Tả |
|:-----|:-------|
| `/` | Mở menu skills / commands |
| `/new` | Phiên mới |
| `/resume` | Tiếp tục phiên cũ |
| `/model` | Đổi model, bật/tắt thinking |
| `/skills` | Liệt kê skills |
| `/mcp` | Trạng thái MCP servers |
| `/undo` | Khôi phục code / hội thoại |
| `/team` | Trạng thái team |
| `/exit` | Thoát |

| Phím Tắt | Thao Tác |
|:---------|:---------|
| `Enter` | Gửi tin nhắn |
| `Shift+Enter` | Xuống dòng |
| `Ctrl+V` | Dán ảnh từ clipboard |
| `Esc` | Ngắt phản hồi |
| `Ctrl+C` | Ngắt lệnh đang chạy |
| `Ctrl+D` ×2 | Thoát |

---

## Tính Năng

### Harness Thực Thi Tự Trị

- **Structured Observations**: Kết quả tool call được format JSON chuẩn hóa (`status`, `summary`, `next_actions`, `artifacts`) giúp AI phân tích nhanh.
- **Error Recovery**: Tự động chẩn đoán lỗi bash (timeout, command not found, permission denied) và đề xuất giải pháp.
- **Persistent Shell Sessions**: Mỗi session duy trì working directory riêng, theo dõi `cd` qua marker protocol.
- **Background Processes**: Hỗ trợ lệnh nền (`&`), output ghi file tạm, báo cáo qua hook.

### Hệ Thống Đọc & Ghi File

| Định Dạng | Cơ Chế |
|-----------|--------|
| Text | Stream-based, offset/limit, encoding detection (UTF-8/UTF-16LE) |
| PDF | `pdfjs-dist` + `unpdf` — thuần JavaScript, không cần `pdftotext` |
| Jupyter | Parse cells JSON, hiển thị code + output |
| Hình ảnh | Base64 cho model đa phương thức |

**Edit Tool** — 5-stage fallback: exact match → tab correction → loose escape → LLM correction → LLM diagnosis.

### Multi-Agent Team Orchestration (`--team`)

Hệ thống team tự động phân rã task lớn thành sub-tasks, dispatch cho nhiều agent chạy song song:

```
User prompt: "Build e-commerce app"
  → TaskDecomposer (LLM phân rã)
  → WorkflowEngine (DAG topology)
  → ParallelExecutor (dispatch N workers)
      ├─ AgentWorker 1 → SessionManager 1
      ├─ AgentWorker 2 → SessionManager 2
      └─ AgentWorker N → SessionManager N
  → ResultAggregator (gộp kết quả)
```

**Kiến trúc**: Mỗi worker bọc `SessionManager` độc lập — session, context, API key, compaction riêng. Code cũ không bị sửa.

**3 Execution Modes**:
- `internal` (mặc định): Workers chạy trong cùng process
- `tmux`: Mỗi worker 1 tmux pane, có thể attach xem real-time
- `headless`: CI/CD mode, output JSON

### Hỗ Trợ Đa Provider

- **DeepSeek V4**: `deepseek-v4-pro`, `deepseek-v4-flash` — thinking mode, reasoning effort
- **Google Gemini**: `gemini-2.5-flash`, `gemini-3.5-flash`, etc. — tự động xử lý role mapping, param bypass
- **Key Rotation**: Nhiều API key cách nhau dấu phẩy, tự xoay khi rate-limited

### Model Context Protocol (MCP)

Kết nối agent với GitHub, trình duyệt, database qua giao thức MCP:

```json
{
  "mcpServers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] },
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }
  }
}
```

Dùng `/mcp` trong TUI để kiểm tra trạng thái.

### Agent Skills

Skills là module kiến thức tái sử dụng, tự động khớp ngữ cảnh:

```
.deepcode/skills/code-review/
├── SKILL.md          # YAML frontmatter + hướng dẫn
├── references/       # Tài liệu tham khảo
└── examples/         # Ví dụ
```

Xem `docs/agent-skills.md`.

### Phân Quyền

10 scope (`read-in-cwd`, `write-in-cwd`, `network`, `mcp`, `team`, ...), 3 chế độ (`askAll`, `allowAll`, `denyAll`). Cấu hình trong `settings.json`.

### Quản Lý Phiên & Undo

- Session lưu trong `~/.deepcode/projects/<projectCode>/<sessionId>.jsonl`
- Undo dựa trên Git checkpoint — khôi phục code, hội thoại, hoặc cả hai

### Context Compaction

Tự động tóm tắt hội thoại khi context vượt ngưỡng (512K tokens DeepSeek V4), bảo toàn các cột mốc quan trọng.

### Thông Báo Hoàn Thành

Tự động chạy script khi agent xong việc — hỗ trợ Slack, Feishu, system notification.

---

## Tài Liệu

| Tài Liệu | Mô Tả |
|----------|-------|
| [configuration.md](docs/configuration.md) | Cấu hình chi tiết |
| [mcp.md](docs/mcp.md) | Hướng dẫn MCP |
| [agent-skills.md](docs/agent-skills.md) | Cách viết Agent Skills |
| [permission.md](docs/permission.md) | Hệ thống phân quyền |
| [session-persistence.md](docs/session-persistence.md) | Lưu trữ phiên |
| [notify.md](docs/notify.md) | Thông báo hoàn thành |

---

## Phát Triển

```bash
git clone https://github.com/lessweb/deepcode-cli.git
cd deepcode-cli
npm install
```

| Lệnh | Mô Tả |
|------|-------|
| `npx tsx src/cli.tsx` | Dev mode |
| `npm run check` | Typecheck + lint + format |
| `npm run build` | Build production |
| `npm test` | Chạy tests (637+) |

---

## Giấy Phép

MIT. Xem [LICENSE](LICENSE).

<!-- LINK GROUP -->

[npm-release-link]: https://www.npmjs.com/package/@vegamo/deepcode-cli
[npm-release-shield]: https://img.shields.io/npm/v/@vegamo/deepcode-cli?color=4d6BFE&labelColor=black&logo=npm&logoColor=white&style=flat-square&cacheSeconds=1800
[npm-downloads-link]: https://www.npmjs.com/package/@vegamo/deepcode-cli
[npm-downloads-shield]: https://img.shields.io/npm/dt/@vegamo/deepcode-cli?labelColor=black&style=flat-square&color=4d6BFE&cacheSeconds=1800
[github-contributors-link]: https://github.com/lessweb/deepcode-cli/graphs/contributors
[github-contributors-shield]: https://img.shields.io/github/contributors/lessweb/deepcode-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-forks-link]: https://github.com/lessweb/deepcode-cli/network/members
[github-forks-shield]: https://img.shields.io/github/forks/lessweb/deepcode-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-stars-link]: https://github.com/lessweb/deepcode-cli/network/stargazers
[github-stars-shield]: https://img.shields.io/github/stars/lessweb/deepcode-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-issues-link]: https://github.com/lessweb/deepcode-cli/issues
[github-issues-shield]: https://img.shields.io/github/issues/lessweb/deepcode-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-issues-pr-link]: https://github.com/lessweb/deepcode-cli/pulls
[github-issues-pr-shield]: https://img.shields.io/github/issues-pr/lessweb/deepcode-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
[github-license-link]: https://github.com/lessweb/deepcode-cli/blob/main/LICENSE
[github-license-shield]: https://img.shields.io/github/license/lessweb/deepcode-cli?color=4d6BFE&labelColor=black&style=flat-square&cacheSeconds=1800
