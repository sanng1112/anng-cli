# Cấu hình ANNG CLI

## Thứ tự ưu tiên

ANNG CLI resolve cấu hình theo thứ tự:

1. Mặc định trong code
2. `~/.anng/settings.json`
3. `./.anng/settings.json`
4. Biến môi trường

Cấu hình theo project sẽ ghi đè cấu hình user. Biến môi trường sẽ ghi đè cả hai.

## Vị trí file cấu hình

ANNG CLI đọc các file sau:

- Mức user: `~/.anng/settings.json`
- Mức project: `<project root>/.anng/settings.json`

Cùng một file `settings.json` cũng được dùng để khai báo MCP servers.

## Các field runtime đang hỗ trợ

Runtime Go hiện tại hỗ trợ các field top-level sau:

| Field | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `provider` | string | `openai`, `deepseek`, `anthropic` hoặc `google` |
| `model` | string | Model đang dùng |
| `apiKey` | string | API key cho các provider OpenAI-compatible |
| `baseUrl` | string | Ghi đè API base URL nếu cần |
| `geminiApiKey` | string | Gemini API key khi dùng provider Google |
| `geminiBaseUrl` | string | Endpoint OpenAI-compatible cho Gemini nếu cần |
| `autoAccept` | boolean | Tự động chấp nhận prompt xin quyền của tool |
| `planMode` | boolean | Chạy planning mode và chặn các tool có tính thay đổi |
| `thinkingEnabled` | boolean | Bật thinking mode trên model hỗ trợ |
| `reasoningEffort` | string | `-`, `none`, `low`, `medium`, `high`, hoặc `max` |
| `models` | string[] | Danh sách model tuỳ chỉnh hiển thị trong TUI |
| `env` | object | Biến môi trường bổ sung lưu kèm settings |
| `mcpServers` | object | Khai báo MCP servers để runtime nạp khi khởi động |

Ví dụ:

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com",
  "autoAccept": false,
  "planMode": false,
  "thinkingEnabled": true,
  "reasoningEffort": "max",
  "models": ["deepseek-v4-pro", "gpt-4o"]
}
```

## Biến môi trường

Các biến môi trường sau sẽ ghi đè giá trị trong `settings.json`:

| Biến môi trường | Field tương ứng |
| --- | --- |
| `ANNG_PROVIDER` | `provider` |
| `ANNG_MODEL` | `model` |
| `ANNG_API_KEY` | `apiKey` |
| `ANNG_BASE_URL` | `baseUrl` |
| `ANNG_THINKING_ENABLED` | `thinkingEnabled` |
| `ANNG_REASONING_EFFORT` | `reasoningEffort` |
| `GEMINI_API_KEY` | `geminiApiKey` |
| `GEMINI_BASE_URL` | `geminiBaseUrl` |

## Ghi chú theo provider

- `provider: "gemini"` sẽ được normalize thành `google`.
- Với các model DeepSeek V4, `thinkingEnabled` mặc định là `true`.
- Nếu bật thinking mode mà không chỉ định `reasoningEffort`, runtime sẽ dùng `-`.
- `autoAccept` và `planMode` không thể cùng bật.

## MCP Servers

MCP servers được khai báo trong cùng file `settings.json` qua field `mcpServers`.

Ví dụ:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

Các field hỗ trợ cho mỗi server:

| Field | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `command` | string | Executable hoặc command để khởi chạy |
| `args` | string[] | Danh sách tham số truyền vào command |
| `env` | object | Biến môi trường cho process MCP |

MCP servers sẽ được nạp khi app khởi động. Nếu kết nối lỗi, runtime sẽ in warning và hiển thị trạng thái trong màn hình MCP.
