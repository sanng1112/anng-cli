# Hành vi quyền hạn của ANNG CLI

Tài liệu này mô tả đúng hành vi permission hiện đang được runtime Go hỗ trợ.

## Các mode hiện có

ANNG CLI hiện hỗ trợ ba mode thực tế:

1. Chế độ tương tác mặc định
2. `autoAccept`
3. `planMode`

Bạn có thể cấu hình `autoAccept` và `planMode` trong `settings.json`, hoặc dùng `--yolo` để bật tự động chấp thuận cho lần chạy hiện tại.

## Chế độ tương tác mặc định

Khi cả `autoAccept` và `planMode` đều là `false`, TUI sẽ hiện prompt xác nhận trước khi chạy shell command thông qua tool `bash`.

Hành vi hiện tại:

- Shell command có thể yêu cầu xác nhận trong TUI
- Việc xác nhận chỉ áp dụng cho lần chạy đó
- Không có ruleset allow/deny được lưu bền trong `settings.json`

## `autoAccept`

Khi `autoAccept` là `true`, prompt xác nhận cho shell command sẽ bị bỏ qua.

Ví dụ:

```json
{
  "autoAccept": true
}
```

Hoặc dùng CLI:

```bash
./anng --yolo -p "chạy test và sửa lỗi"
```

## `planMode`

Khi `planMode` là `true`, ANNG CLI giữ agent ở chế độ thiên về lập kế hoạch và chặn các tool có tính thay đổi trạng thái.

Runtime Go hiện tại chặn các tool sau trong plan mode:

- `bash`
- `write_to_file`
- `replace_file_content`
- `multi_replace_file_content`

Các tool chỉ đọc như đọc file vẫn được phép.

Ví dụ:

```json
{
  "planMode": true
}
```

## Giới hạn quan trọng

Runtime Go hiện tại **không** triển khai mô hình `permissions` theo scope như tài liệu của các phiên bản cũ.

Điều đó có nghĩa là các field sau hiện **chưa được hỗ trợ**:

- `permissions.allow`
- `permissions.deny`
- `permissions.ask`
- `permissions.defaultMode`
- lưu quyết định theo từng scope

Nếu bạn thêm các field này vào `settings.json`, runtime hiện tại sẽ bỏ qua chúng.
