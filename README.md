<div align="center">
<br/>
<p align="center">
  <a href='https://anng.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="anng-cli"/>
  </a>
</p>
<h1>ANNG CLI</h1>

<h3>Trợ lý Lập trình AI Tự trị Chạy Trên Terminal 🚀</h3>

[![npm](https://img.shields.io/npm/v/anng-cli?color=D4704B&labelColor=black&logo=npm&logoColor=white&style=flat-square)](https://www.npmjs.com/package/anng-cli)
[![github-stars](https://img.shields.io/github/stars/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/stargazers)
[![github-license](https://img.shields.io/github/license/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/blob/main/LICENSE)

<br/>
Tiếng Việt · [English](./README-en.md) · [中文](./README-zh_CN.md)
</div>

---

**ANNG CLI** là một trợ lý lập trình trí tuệ nhân tạo (AI Coding Assistant) dạng terminal (dòng lệnh) được thiết kế tối ưu cho trải nghiệm lập trình tự trị (autonomous programming). 

ANNG CLI được tối ưu hóa đặc biệt cho các mô hình suy luận sâu như **DeepSeek V4/R1** và **Google Gemini 1.5/2.0 Pro**, giúp tự động hóa toàn bộ quá trình phát triển phần mềm: từ viết mã, kiểm thử, sửa lỗi, tìm kiếm cấu trúc dự án cho đến điều phối toàn bộ đội ngũ Multi-Agent thông minh giải quyết những task phức tạp nhất.

Phiên bản ANNG cơ bản tập trung vào:
- Trò chuyện tương tác với các session được lưu trữ lâu dài (interactive chat with persisted sessions).
- Chạy trực tiếp một lần / chế độ headless (one-shot/headless execution).
- Cấu hình provider cục bộ mang theo key riêng (local BYOK provider configuration).
- Cơ chế quay vòng API keys thông minh cho Gemini (Gemini smart key rotation).

---

## 🌟 Tính năng nổi bật

- 🤖 **Đa nền tảng & Tối ưu LLM:** Hỗ trợ đa dạng Provider (OpenAI, DeepSeek, Gemini,...) với khả năng tùy chọn **Thinking Mode** (chế độ suy luận sâu) và **Reasoning Effort** (mức độ suy luận) trực quan ngay trên menu TUI.
- 🎨 **Terminal UI (TUI) Sang Trọng:** Giao diện TUI mặc định chạy qua shell trong `src/tui/*` (được viết bằng React Ink), thiết kế tối giản, tinh tế mang đậm chất nghệ thuật ASCII/Quadrant Blocks với dải màu `#D4704B` thanh lịch, hỗ trợ paste ảnh trực tiếp từ clipboard (`Ctrl+V`). Các mã nguồn cũ trong `src/ui/*` tạm thời được giữ lại làm lớp tương thích ngược và phục vụ kiểm thử di trú.
- 👥 **Multi-Agent (Team Mode):** Chia sẻ và điều phối công việc cho nhiều AI Agent chạy song song. Hỗ trợ hiển thị trực quan thông qua các bảng điều khiển (panes) trong **Tmux**.
- 🛠️ **Hỗ trợ Model Context Protocol (MCP):** Mở rộng tính năng vô hạn. Kết nối trực tiếp hệ thống AI với Database, Trình duyệt Web, Git, AWS, Slack, v.v. thông qua các plugin MCP server.
- 🧩 **Hệ thống Kỹ năng (Skills System):** Định nghĩa và mở rộng các kỹ năng cho Agent thông qua tài liệu định dạng Markdown (`SKILL.md`) kết hợp với các helper scripts.
- 🔑 **Tự động Quay vòng API Keys:** Tích hợp cơ chế tự động đọc và luân chuyển nhiều API Keys từ file `~/.anng/gemini_keys.txt` giúp tối ưu giới hạn lượt gọi (rate limit).
- 🛡️ **Kiểm soát Quyền An toàn:** Phân quyền chi tiết cho AI khi đọc/ghi/xóa file trong/ngoài thư mục làm việc, gọi lệnh shell, hoặc kết nối mạng. Có chế độ phê duyệt thủ công hoặc chế độ **YOLO** (`--yolo`) để tự động chạy.
- 📋 **Hàng đợi Task (Task Queue):** Quản lý và xử lý tuần tự các tác vụ trong hàng đợi, tự động lưu trữ trạng thái vào `.anng/memory/task-queue.md`.

---

## 🚀 Cài đặt & Khởi chạy

### Cài đặt global từ NPM
```bash
npm install -g anng-cli
```

### Cài đặt bản đóng gói local (dành cho phát triển)
```bash
# Clone project và cài đặt
git clone https://github.com/lessweb/anng-cli.git
cd anng-cli
npm install
npm run build
npm link
```

### Khởi chạy
Chạy lệnh sau trong bất kỳ thư mục dự án nào để bắt đầu:
```bash
anng
```

---

## ⚙️ Cấu hình (`settings.json`)

ANNG CLI tìm kiếm tệp cấu hình theo thứ tự ưu tiên:
1. Cấu hình cấp dự án: `./.anng/settings.json`
2. Cấu hình cấp người dùng: `~/.anng/settings.json`

*(Cấu hình này dùng chung và đồng bộ trực tiếp với VSCode extension của ANNG)*

### Cấu hình mẫu cho DeepSeek
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

### Cấu hình mẫu cho Gemini (Hỗ trợ quay vòng Keys)
Để tự động luân chuyển nhiều API Keys của Gemini tránh bị rate limit, bạn hãy tạo file `~/.anng/gemini_keys.txt` và nhập danh sách key (mỗi dòng một key). Sau đó cấu hình:
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

### Cấu hình Model Context Protocol (MCP)
Bạn có thể cấu hình các MCP server để cấp thêm công cụ (Tools) cho AI:
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

### Cấu hình Phân quyền bảo mật (Permissions)
Cấu hình các quyền thực thi của AI trong `settings.json`:
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
Các scope được hỗ trợ:
- `read-in-cwd` / `read-out-cwd`: Đọc file trong/ngoài thư mục dự án.
- `write-in-cwd` / `write-out-cwd`: Ghi/sửa file trong/ngoài thư mục dự án.
- `delete-in-cwd` / `delete-out-cwd`: Xóa file.
- `query-git-log` / `mutate-git-log`: Xem/thao tác với Git.
- `network`: Truy cập internet.
- `mcp`: Sử dụng các công cụ từ MCP servers.

---

## 🎮 Hướng dẫn sử dụng

### 1. Phím tắt trong TUI
| Phím | Chức năng |
| :--- | :--- |
| `Enter` | Gửi prompt / Đồng ý chạy tool. |
| `Shift+Enter` | Xuống dòng (nhập prompt nhiều dòng). |
| `Ctrl+V` | Dán ảnh từ clipboard (tự động đính kèm vào chat). |
| `Ctrl+X` | Xóa ảnh đã dán. |
| `Esc` | Hủy tiến trình sinh văn bản hoặc suy luận hiện tại của AI. |
| `Home` / `End` | Di chuyển con trỏ về đầu/cuối dòng. |
| `Alt+Trái/Phải` | Di chuyển con trỏ qua từng từ. |
| `Ctrl+W` | Xóa từ phía trước con trỏ. |
| `Ctrl+C` (2 lần) | Thoát chương trình lập tức. |

### 2. Các lệnh Slash (`/`) trong TUI
Nhập dấu `/` tại ô nhập liệu để mở menu lệnh nhanh:
- `/model`: Thay đổi Model, bật/tắt Thinking Mode, điều chỉnh Reasoning Effort (Low/Medium/High/Max).
- `/skills`: Liệt kê các Kỹ năng (Skills) đang khả dụng.
- `/mcp`: Xem trạng thái các MCP server kết nối và danh sách công cụ họ cung cấp.
- `/queue`: Quản lý hàng đợi tác vụ (`/queue add <task>`, `/queue list`, `/queue process`).
- `/new`: Bắt đầu một phiên hội thoại mới tinh (xoá lịch sử tạm thời).
- `/resume`: Chọn và tiếp tục một phiên hội thoại cũ trong lịch sử.
- `/continue`: Tiếp tục phiên hội thoại đang hoạt động.
- `/undo`: Hoàn tác (Undo) lại code hoặc trạng thái hội thoại trước đó.
- `/raw`: Bật/tắt hiển thị thô (Raw) nội dung suy luận của mô hình lý luận.
- `/query`: Hiển thị thông số cấu hình hiện tại, thông tin model và bộ nhớ.
- `/bg`: Xem danh sách các tiến trình chạy ngầm và task nền.
- `/btw <mess>`: Nhắn nhanh một lưu ý cho AI mà không kích hoạt xử lý code.
- `/init`: Tự động tạo file `AGENTS.md` (chứa hướng dẫn dự án cho LLM).
- `/exit`: Thoát ứng dụng một cách an toàn.

### 3. Khởi chạy bằng CLI Flags
Hỗ trợ chạy trực tiếp từ dòng lệnh không cần giao diện (Headless mode) hoặc tùy biến chế độ:
```bash
# Chạy một yêu cầu trực tiếp và tự động đồng ý mọi quyền (YOLO Mode)
anng --yolo -p "Hãy viết file test.js và chạy thử bằng Node"

# Lập kế hoạch trước (Plan Mode): Bắt buộc hỏi xác nhận trước từng công cụ
anng --plan -p "Refactor lại toàn bộ folder src/utils"

# Giới hạn số lượt hội thoại tối đa trong chế độ tự động chạy
anng --yolo --max-turns 15 -p "Build ứng dụng React trong ./my-app"

# Chạy Team Mode (Nhiều Agent song song phối hợp làm việc)
anng --team -p "Viết game rắn săn mồi bằng HTML/JS có giao diện đẹp"

# Chạy Team Mode kết hợp hiển thị trực quan các Agents qua các ô cửa sổ trong TMUX
anng --team --tmux -p "Phân tích và refactor dự án này sang Clean Architecture"

# Chạy Team Mode giới hạn tối đa 8 workers chạy đồng thời
anng --team --team-workers 8 -p "Viết unit test cho toàn bộ các file trong thư mục src"
```

---

## 👥 Chế độ Multi-Agent (Team Mode)

Khi sử dụng flag `--team`, ANNG CLI sẽ chuyển sang cơ chế điều phối đa tác vụ thông minh:
1. **Dispatcher Agent:** Đóng vai trò kiến trúc sư, nhận prompt từ người dùng, quét cấu trúc thư mục, lập kế hoạch tổng thể và chia nhỏ công việc thành nhiều nhiệm vụ độc lập.
2. **Worker Agents:** Nhận các nhiệm vụ nhỏ được giao từ Dispatcher, chạy song song để giải quyết (viết code, test, fix bug).
3. **Reviewer Agent (tùy chọn):** Đánh giá chất lượng code của các Worker trước khi gộp vào branch chính.

Nếu sử dụng thêm flag `--tmux` (yêu cầu máy đã cài đặt `tmux`), ANNG CLI sẽ tự động chia nhỏ cửa sổ terminal thành các panes tương ứng với mỗi Worker để bạn trực tiếp theo dõi quá trình các Agent "vibe coding" cùng một lúc.

---

## 🧩 Hệ thống Kỹ năng (Skills System)

Skills là cách để bạn huấn luyện hoặc định nghĩa quy trình làm việc chuẩn cho AI Agent trên từng dự án. Mỗi Skill được đặt trong một thư mục và bắt buộc chứa file `SKILL.md` định nghĩa:
- Frontmatter (YAML) khai báo `name` và `description`.
- Phần thân Markdown hướng dẫn AI các bước xử lý chi tiết.
- Các thư mục phụ trợ tùy chọn như `scripts/` (chứa script thực thi), `examples/` (mã nguồn mẫu).

### Thư mục quét Skills:
Hệ thống sẽ quét các kỹ năng theo thứ tự ưu tiên:
1. Cấp dự án (Native): `./.anng/skills/`
2. Cấp dự án (Interoperable): `./.agents/skills/`
3. Cấp người dùng (Native): `~/.anng/skills/`
4. Cấp người dùng (Interoperable): `~/.agents/skills/`

---

## 🔍 Tích hợp Web Search & Tiện ích
ANNG CLI tích hợp sẵn các công cụ tìm kiếm và cào dữ liệu web mạnh mẽ:
- **`searchweb`**: Tìm kiếm thông tin trên internet thông qua các bộ máy tìm kiếm phổ biến.
- **`searchsegment`**: Đọc dữ liệu từ một trang web cụ thể và tự động chuyển đổi từ HTML sang định dạng Markdown tối giản để AI đọc hiểu nhanh chóng, tiết kiệm token.

---

## 🙋 Câu hỏi thường gặp (FAQ)

#### 1. ANNG CLI có tiện ích mở rộng cho VSCode không?
Có. ANNG cung cấp một extension đầy đủ tính năng trên [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=vegamo.anng-vscode). Tiện ích này chia sẻ chung tệp cấu hình `~/.anng/settings.json` với CLI nên bạn chỉ cần cấu hình API Key một lần duy nhất.

#### 2. Làm thế nào để tự động gửi thông báo Slack sau khi hoàn thành task?
Hãy viết một script shell gửi thông điệp tới Slack Webhook của bạn. Sau đó thêm đường dẫn tuyệt đối của script vào trường `"notify"` trong file `settings.json`:
```json
{
  "notify": "/absolute/path/to/your/slack-notify.sh"
}
```

#### 3. DeepSeek V4 không hỗ trợ multimodal (đọc ảnh), vậy làm sao gửi ảnh?
Nếu bạn sử dụng `deepseek-v4-pro`, mô hình này hiện chưa hỗ trợ đọc ảnh. Nếu bạn cần phân tích UI hoặc ảnh, hãy chuyển đổi model sang `gemini-2.5-pro` hoặc `gpt-4o` qua lệnh `/model` trong TUI, sau đó dùng `Ctrl+V` để dán ảnh.

#### 4. Có thể tùy chỉnh kịch bản kiểm tra lỗi tự động (Auto Linter) không?
Có, bạn cấu hình thuộc tính `"autoLinter"` trong `settings.json` (ví dụ `"npm run lint"` hoặc `"eslint --fix"`). AI sẽ tự động chạy lệnh này sau khi chỉnh sửa file để kiểm tra cú pháp và sửa lỗi ngay lập tức.

---

## 🤝 Đóng góp phát triển

Mọi ý kiến đóng góp, báo lỗi (Issues) hoặc gửi mã nguồn (Pull Requests) đều được chào đón nồng nhiệt tại repository của dự án. 

Nếu ANNG CLI giúp tăng năng suất làm việc của bạn, hãy tặng dự án một ngôi sao **Star 🌟** nhé!

- **GitHub Repository**: [https://github.com/lessweb/anng-cli](https://github.com/lessweb/anng-cli)
- **Báo lỗi & Yêu cầu tính năng**: [GitHub Issues](https://github.com/lessweb/anng-cli/issues)

---
**License:** Phát hành dưới giấy phép [MIT](./LICENSE).
