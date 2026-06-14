<div align="center">
<br/>
<p align="center">
  <a href='https://github.com/sanng1112/anng-cli'>
    <img src='https://avatars.githubusercontent.com/u/118287711?s=200&v=4' width='100' alt="anng-cli"/>
  </a>
</p>
<h1>ANNG CLI</h1>

<h3>Trợ lý Lập trình AI Tự trị Chạy Trên Terminal — Sóc Quấn Người Mascot 🐿️</h3>

[![npm](https://img.shields.io/npm/v/anng-cli?color=D4704B&labelColor=black&logo=npm&logoColor=white&style=flat-square)](https://www.npmjs.com/package/anng-cli)
[![github-stars](https://img.shields.io/github/stars/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/stargazers)
[![github-license](https://img.shields.io/github/license/sanng1112/anng-cli?color=D4704B&labelColor=black&style=flat-square)](https://github.com/sanng1112/anng-cli/blob/main/LICENSE)

<br/>
</div>

---

**ANNG CLI** là trợ lý lập trình trí tuệ nhân tạo (AI Coding Assistant) dạng terminal (dòng lệnh) được thiết kế tối ưu cho trải nghiệm lập trình tự trị. Lấy cảm hứng từ chú sóc quấn mình nhỏ nhắn mà linh hoạt, ANNG CLI giúp tự động hóa từ viết mã, sửa lỗi, tìm kiếm cấu trúc project thông qua Codegraph, cho đến điều phối toàn bộ đội ngũ Multi-Agent thông minh giải quyết những task hóc búa nhất.

Được phát triển độc lập và cá nhân hoá để mang lại trải nghiệm *"vibe coding"* mượt mà nhất. 

---

## 🌟 Điểm nổi bật

- 🐿️ **Trải nghiệm Sóc Quấn (Squirrel Mascot):** Nhỏ gọn, linh hoạt, len lỏi mọi ngóc ngách của thư mục project, đánh index codebase bằng Codegraph & tạo cache thông minh vào `ANNG.md`.
- 🤖 **Đội ngũ Multi-Agent (Team Mode):** Khả năng gọi lệnh `anng --team`, lập tức triệu hồi một đội Agent để chia nhỏ task song song, tương tác qua các panel tmux thời gian thực.
- 🎨 **Theme Màu Cam Sang Trọng:** Giao diện TUI được tái thiết kế tinh tế với dải màu #D4704B ấm áp, hiện đại.
- 🛠️ **Hỗ trợ Model Context Protocol (MCP):** Mở rộng tính năng vô hạn (kết nối database, git, aws, slack...) thông qua MCP.
- 🧠 **Suy luận Đa Chiều (Reasoning Control):** Có menu SelectList để trực tiếp chọn Model cũng như tùy chỉnh Mức độ suy luận (Reasoning Effort) ngay tại Terminal, khỏi cần sửa config file.

---

## 🚀 Cài đặt & Khởi chạy

Cài đặt ANNG CLI thông qua `npm`:

```bash
# Cài đặt global
npm install -g anng-cli

# Hoặc tải code trực tiếp và link
git clone https://github.com/sanng1112/anng-cli.git
cd anng-cli
npm install
npm run bundle
npm link
```

Khởi chạy trong bất kỳ dự án nào:
```bash
anng
```

---

## 🎮 Hướng dẫn sử dụng

### 1. Phím tắt Terminal UI (TUI)
- `Enter`: Gửi prompt.
- `Shift+Enter`: Xuống dòng.
- `Ctrl+V`: Dán ảnh từ clipboard.
- `/`: Mở menu kỹ năng (Skills) và tính năng nhanh.
- `Esc`: Huỷ tiến trình sinh văn bản/suy luận hiện tại của AI.

### 2. Các Mode Vận Hành
```bash
# Mở giao diện TUI mặc định
anng

# Chạy lệnh trực tiếp không qua giao diện
anng -p "viết hàm tính tổng"

# Mode YOLO (Auto-Accept mọi quyền đọc/ghi)
anng --yolo -p "dọn dẹp thư mục dist"

# Chế độ làm việc Đội ngũ (Multi-Agent Team)
anng --team -p "phân tích hệ thống và tạo test case cho mọi hàm"
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
Dự án được bảo trì và phát triển bởi [sanng1112](https://github.com/sanng1112). Mọi ý tưởng đóng góp, Issue hay Pull Request đều được chào đón! Hãy star 🌟 project nếu nó giúp ích cho công việc của bạn.
