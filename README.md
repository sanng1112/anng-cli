<div align="center">
<br/>
<h1>ANNG CLI</h1>

<h3>Trợ lý Lập trình AI Tự trị Chạy Trên Terminal 🚀</h3>

[![npm](https://img.shields.io/npm/v/anng-cli?color=D4704B&labelColor=black&logo=npm&logoColor=white&style=flat-square)](https://www.npmjs.com/package/anng-cli)
[![github-stars](https://img.shields.io/github/stars/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/stargazers)
[![github-license](https://img.shields.io/github/license/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/blob/main/LICENSE)

<br/>
</div>

---

**ANNG CLI** là trợ lý lập trình trí tuệ nhân tạo (AI Coding Assistant) dạng terminal (dòng lệnh) được thiết kế tối ưu cho trải nghiệm lập trình tự trị. ANNG CLI giúp tự động hóa toàn bộ quá trình phát triển phần mềm: từ viết mã, sửa lỗi, tìm kiếm cấu trúc dự án thông qua Codegraph, cho đến điều phối toàn bộ đội ngũ Multi-Agent thông minh để giải quyết những task phức tạp nhất.

Được phát triển độc lập và cá nhân hoá để mang lại trải nghiệm *"vibe coding"* cực kỳ mượt mà ngay trên giao diện dòng lệnh.

---

## 🌟 Điểm nổi bật

- ⚡ **Tốc độ & Thông minh:** Phân tích mã nguồn mạnh mẽ, đánh index codebase bằng Codegraph & tạo bộ nhớ cache thông minh vào `ANNG.md` để đọc hiểu toàn bộ dự án siêu tốc.
- 🤖 **Đa nền tảng & Linh hoạt:** Hỗ trợ đa dạng các Provider LLM (OpenAI, DeepSeek, Gemini,...) và nhiều chế độ chạy (Interactive, YOLO, Plan).
- 🎨 **Giao diện Minimalist Sang Trọng:** Giao diện TUI được thiết kế tối giản, tinh tế mang đậm chất nghệ thuật ASCII/Quadrant Blocks với dải màu `#D4704B` hiện đại, thanh lịch.
- 🛠️ **Hỗ trợ Model Context Protocol (MCP):** Mở rộng tính năng vô hạn. Kết nối trực tiếp hệ thống với Database, Git, AWS, Slack, v.v. thông qua các plugin MCP.
- 🧠 **Suy luận Đa Chiều (Reasoning Control):** Tích hợp menu SelectList cho phép trực tiếp chuyển đổi Model và tùy chỉnh Mức độ suy luận (Reasoning Effort) ngay trên Terminal một cách trực quan.

---

## 🚀 Cài đặt & Khởi chạy

Cài đặt ANNG CLI thông qua `npm` rất đơn giản:

```bash
# Cài đặt global từ NPM registry
npm install -g anng-cli

# Hoặc cài đặt bản pack local mới nhất (nếu bạn tự build)
npm pack
npm install -g ./anng-cli-*.tgz
```

Khởi chạy trong bất kỳ thư mục dự án nào của bạn:
```bash
anng
```

---

## 🎮 Hướng dẫn sử dụng

### 1. Phím tắt Terminal UI (TUI)
- `Enter`: Gửi prompt.
- `Shift+Enter`: Xuống dòng.
- `Ctrl+V`: Dán ảnh từ clipboard.
- `/`: Mở menu kỹ năng (Skills) và tính năng nhanh (Commands).
- `Esc`: Huỷ tiến trình sinh văn bản/suy luận hiện tại của AI.

### 2. Các Mode Vận Hành
```bash
# Mở giao diện TUI mặc định
anng

# Chạy một lệnh trực tiếp và thoát (không qua giao diện)
anng -p "viết hàm tính tổng"

# Mode YOLO (Auto-Accept mọi quyền đọc/ghi mà không cần hỏi lại)
anng --yolo -p "dọn dẹp thư mục dist và dọn dẹp log"

```

### 3. Cấu hình (`~/.anng/settings.json`)
Sử dụng thư mục `.anng` để tinh chỉnh cấu hình của riêng bạn:
```json
{
  "env": {
    "BASE_URL": "https://api.openai.com/v1",
    "API_KEY": "sk-...",
    "ANNG_MODEL": "gpt-4o",
    "ANNG_REASONING_EFFORT": "high"
  }
}
```

---

## 🤝 Tham gia đóng góp
Dự án được bảo trì và phát triển bởi [sanng1112](https://github.com/sanng1112). Mọi ý tưởng đóng góp, Issue hay Pull Request đều được chào đón nồng nhiệt! Hãy thả sao 🌟 cho project nếu công cụ này hữu ích cho công việc của bạn.
