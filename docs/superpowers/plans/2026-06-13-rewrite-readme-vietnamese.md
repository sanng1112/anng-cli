# Rewrite README in Vietnamese Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed

**Goal:** Rewrite the primary README.md in Vietnamese, detailing the CLI features, configuration, local installation instructions from the current repository (instead of npm registry), slash commands, keybindings, and common troubleshooting/Q&A.

**Architecture:** We will replace the current Chinese-language `README.md` with a detailed Vietnamese translation. The language selection bar at the top will be updated to link English (`README-en.md`), Chinese (`README-zh_CN.md`), and Vietnamese (`README.md`). The installation section will be changed from npm registry commands to repository-based commands (`npm install`, `npm run build`, `npm link`, and `npx tsx src/cli.tsx`).

**Tech Stack:** Markdown, Git.

---

### Task 1: Rewrite README.md in Vietnamese

**Files:**
- Modify: `README.md`

- [x] **Step 1: Write the Vietnamese README.md content**

Replace the entire contents of `README.md` with the following:

```markdown
<div align="center">
<br/>
<br/>
<p align="center">
  <a href='https://deepcode.vegamo.cn/'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="deepcode-cli"/>
  </a>
</p>
<h1>Deep Code CLI</h1>

[![][npm-release-shield]][npm-release-link] [![][npm-downloads-shield]][npm-downloads-link] [![][github-contributors-shield]][github-contributors-link] [![][github-forks-shield]][github-forks-link] [![][github-stars-shield]][github-stars-link]
[![][github-issues-shield]][github-issues-link] [![][github-issues-pr-shield]][github-issues-pr-link] [![][github-license-shield]][github-license-link]

[English](README-en.md) · [中文](README-zh_CN.md) · Tiếng Việt

<br/>
</div>

[Deep Code](https://github.com/lessweb/deepcode-cli) là một trợ lý lập trình AI chạy trên terminal được tối ưu hóa đặc biệt cho mô hình `deepseek-v4`. Dự án hỗ trợ tư duy sâu (deep thinking), kiểm soát cường độ suy luận, mở rộng năng lực qua Agent Skills và tích hợp giao thức MCP (Model Context Protocol).

## Cài đặt từ mã nguồn dự án

Để thiết lập và chạy dự án `deepcode-cli` trực tiếp từ mã nguồn hiện tại, hãy làm theo các bước dưới đây:

### 1. Cài đặt các gói phụ thuộc (Dependencies)
Chạy lệnh sau tại thư mục gốc của dự án để cài đặt tất cả thư viện cần thiết:
```bash
npm install
```

### 2. Biên dịch dự án (Build)
Biên dịch mã nguồn TypeScript thành mã chạy JavaScript trong thư mục `dist`:
```bash
npm run build
```

### 3. Liên kết toàn cục (Local Link)
Để chạy lệnh `deepcode` trực tiếp từ bất kỳ thư mục nào trên hệ thống của bạn (tương tự như cài đặt toàn cục qua npm):
```bash
npm link
```

### 4. Chạy trực tiếp trong chế độ phát triển (Không cần build)
Nếu bạn đang chỉnh sửa mã nguồn và muốn chạy thử ngay lập tức mà không muốn build lại, sử dụng `tsx`:
```bash
npx tsx src/cli.tsx
```

### 5. Chạy bộ kiểm thử (Run Tests)
Để xác minh toàn bộ các tính năng hoạt động chính xác trước khi sử dụng:
```bash
npm test
```

---

## Cấu hình

Tạo file cấu hình tại đường dẫn `~/.deepcode/settings.json` với nội dung như sau:

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

> **Lưu ý:** File cấu hình này được chia sẻ chung với [Deep Code VSCode Extension](https://github.com/lessweb/deepcode), bạn không cần phải cấu hình lại nếu đã cài đặt extension.
> Để xem hướng dẫn cấu hình chi tiết (độ ưu tiên cấu hình, biến môi trường...), vui lòng tham khảo [docs/configuration.md](docs/configuration.md).

---

## Các tính năng chính

### **Skills (Năng lực bổ sung)**
Deep Code CLI hỗ trợ cơ chế Agent Skills cho phép bạn mở rộng năng lực của trợ lý AI bằng cách viết các script hoặc định nghĩa tùy chỉnh.

Skills được quét tự động theo thứ tự ưu tiên sau:

| Phạm vi (Scope) | Đường dẫn quét (Path) | Mục đích |
| :--- | :--- | :--- |
| Project | `./.deepcode/skills/` | Vị trí gốc của dự án |
| Project | `./.agents/skills/` | Tương tác chéo giữa các client |
| User | `~/.deepcode/skills/` | Vị trí gốc của người dùng |
| User | `~/.agents/skills/` | Tương tác chéo giữa các client |

### **Tối ưu hóa cho DeepSeek**
- Tinh chỉnh hiệu năng đặc biệt phù hợp với các mô hình của DeepSeek.
- Sử dụng tính năng [Context Caching](https://api-docs.deepseek.com/guides/kv_cache) của DeepSeek để giảm thiểu tối đa chi phí token.
- Hỗ trợ đầy đủ [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode) (chế độ suy nghĩ) và cấu hình mức độ suy luận (`reasoning_effort`).

---

## Lệnh Slash & Phím tắt Terminal

### Lệnh Slash (Slash Commands)

| Lệnh | Mô tả |
| :--- | :--- |
| `/` | Mở menu chọn skills hoặc danh sách lệnh |
| `/new` | Bắt đầu một phiên hội thoại mới |
| `/resume` | Tiếp tục phiên hội thoại từ lịch sử |
| `/continue` | Tiếp tục hội thoại hiện tại hoặc khôi phục hội thoại cũ |
| `/model` | Thay đổi mô hình, bật/tắt chế độ suy nghĩ và cường độ suy luận |
| `/raw` | Chuyển đổi chế độ hiển thị (Normal / Lite / Raw cuộn trôi) |
| `/init` | Khởi tạo tệp tin `AGENTS.md` cho dự án |
| `/skills` | Liệt kê các skills đang khả dụng |
| `/mcp` | Kiểm tra trạng thái máy chủ MCP và danh sách công cụ hiện có |
| `/undo` | Khôi phục mã nguồn và/hoặc hội thoại về trạng thái trước đó (dựa trên Git checkpoint) |
| `/exit` | Thoát ứng dụng (hoặc nhấn liên tục `Ctrl+D`) |

### Phím tắt Terminal (Keybindings)

| Phím tắt | Thao tác |
| :--- | :--- |
| `Enter` | Gửi tin nhắn / thực thi lệnh |
| `Shift+Enter` | Xuống dòng (hoặc nhấn `Ctrl+J`) |
| `Ctrl+V` | Dán ảnh trực tiếp từ clipboard (khi sử dụng mô hình đa phương thức) |
| `Esc` | Ngắt phản hồi đang sinh ra từ mô hình |
| `Ctrl+D` (nhấn đúp) | Thoát ứng dụng nhanh |

---

## Các mô hình hỗ trợ

- `deepseek-v4-pro` (Khuyến nghị sử dụng)
- `deepseek-v4-flash`
- Bất kỳ mô hình nào khác có API tương thích với cấu trúc OpenAI

---

## Câu hỏi thường gặp (Q&A)

### Deep Code có Plugin dành cho VSCode không?
Có. Deep Code cung cấp một extension đầy đủ tính năng cho VSCode. Bạn có thể cài đặt tại [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=vegamo.deepcode-vscode). Extension này dùng chung cấu hình `~/.deepcode/settings.json` với CLI giúp bạn chuyển đổi mượt mà giữa terminal và editor.

### Deep Code có hỗ trợ phân tích hình ảnh (Đa phương thức - Multimodal) không?
Có. Deep Code CLI hỗ trợ gửi hình ảnh bằng cách nhấn `Ctrl+V` để dán trực tiếp từ clipboard. Tuy nhiên, các mô hình `deepseek-v4` hiện tại chưa hỗ trợ đa phương thức. Nếu muốn sử dụng tính năng này, bạn có thể cấu hình mô hình `Doubao-Seed-2.0-pro` của ByteDance (Volcengine Ark) vì nó được tối ưu hóa rất tốt cho đa phương thức đa lượt hội thoại.

### Làm thế nào để tự động gửi thông báo đến Slack sau khi AI hoàn thành nhiệm vụ?
Bạn có thể viết một shell script gọi Slack Webhook, sau đó khai báo đường dẫn tuyệt đối của script này vào trường `notify` trong file `settings.json`. Tham khảo chi tiết tại hướng dẫn [docs/notify.md](docs/notify.md).

### Làm thế nào để bật công cụ tìm kiếm web (Web Search)?
Deep Code CLI tích hợp sẵn một công cụ tìm kiếm web miễn phí và đủ dùng cho hầu hết trường hợp. Nếu bạn muốn sử dụng script tìm kiếm tùy chỉnh của riêng mình, hãy thiết lập trường `webSearchTool` trong `settings.json` chỉ tới đường dẫn script của bạn. Xem chi tiết tại: https://github.com/qorzj/web_search_cli

### Cấu hình máy chủ MCP (Model Context Protocol) như thế nào?
Deep Code hỗ trợ giao thức MCP để kết nối trợ lý AI với GitHub, trình duyệt web, cơ sở dữ liệu hoặc các dịch vụ bên ngoài khác. Chỉ cần thêm cấu hình trong trường `mcpServers` của file `settings.json`. Sau đó, dùng lệnh `/mcp` trong CLI để kiểm tra danh sách các công cụ đang hoạt động. Tham khảo chi tiết tại [docs/mcp.md](docs/mcp.md).

### Phân quyền hoạt động của AI như thế nào để đảm bảo an toàn?
Deep Code không bắt buộc chạy ở chế độ YOLO (tự động chạy lệnh nguy hiểm). Dự án tích hợp hệ thống phân quyền tinh vi. Trước khi AI thực thi shell, đọc/ghi tệp tin ngoài thư mục dự án hoặc truy cập mạng, hệ thống sẽ hiển thị hộp thoại xác nhận. Bạn có thể tùy chỉnh các chính sách phân quyền này (`allow`, `deny`, `ask`) trong mục `permissions` của file `settings.json`. Xem chi tiết tại [docs/permission.md](docs/permission.md).

---

## Đóng góp mã nguồn

Chúng tôi rất hoan nghênh các đóng góp cho dự án! Quy trình đóng góp như sau:

1. Thực hiện fork và clone dự án về máy.
2. Cài đặt các gói phụ thuộc bằng `npm install`.
3. Tạo nhánh mới cho tính năng của bạn.
4. Kiểm tra chất lượng code và định dạng trước khi commit bằng lệnh `npm run check`.
5. Đảm bảo chạy `npm run format` để định dạng tự động.
6. Mở Pull Request gửi về nhánh chính.

---

## Giấy phép (License)

Dự án được phân phối dưới giấy phép **MIT**.

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
```

- [x] **Step 2: Run build and lint checks**

Verify the project is healthy by building and running formatting/type checks:
Run: `npm run check`
Expected: PASS

- [x] **Step 3: Commit the new README.md**

Run:
```bash
git add README.md
git commit -m "docs: rewrite README.md in Vietnamese with local repo installation guide"
```

---

## Self-Review

1. **Spec coverage:** 
   - Rewrite README.md in Vietnamese: Complete translation done.
   - Local installation instructions: Included `npm install`, `npm run build`, `npm link`, and `npx tsx src/cli.tsx`.
   - Links updated: Header includes English, Chinese, and Vietnamese versions.
2. **Placeholder scan:** No placeholders or TBD sections. Exact README.md content is completely provided.
3. **Type consistency:** N/A (documentation changes only).
