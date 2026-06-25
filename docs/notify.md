# Thông báo khi hoàn thành tác vụ

Runtime Go hiện tại của ANNG CLI **chưa** triển khai field `notify` kiểu cũ.

## Trạng thái hiện tại

Hiện tại:

- `notify` không nằm trong danh sách cấu hình runtime được hỗ trợ
- ANNG CLI không tự chạy script thông báo sau khi hoàn thành tác vụ
- thêm `notify` vào `settings.json` sẽ không có tác dụng trong runtime Go hiện tại

## Cách làm thay thế

Nếu cần thông báo ngay bây giờ, hãy bọc ANNG CLI bằng shell script của riêng bạn.

Ví dụ:

```bash
#!/usr/bin/env bash
set -euo pipefail

./anng --yolo -p "chạy test và tóm tắt kết quả"

notify-send "ANNG CLI" "Tác vụ đã hoàn tất"
```

Bạn có thể thay `notify-send` bằng bất kỳ cơ chế nào khác:

- webhook Slack
- `osascript` trên macOS
- PowerShell toast notification trên Windows
- terminal bell / OSC notification

Khi runtime Go có hỗ trợ notification thật sự, tài liệu này cần được cập nhật lại theo implementation mới.
