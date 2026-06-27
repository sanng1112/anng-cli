---
name: deep-project-audit
description: Thảo luận, phân tích và đánh giá sâu toàn diện dự án hiện tại bằng cách đọc trực tiếp mã nguồn và tệp cấu hình thay vì chỉ nhìn sơ đồ thư mục.
allow-implicit-invocation: true
---
# Deep Project Audit Skill

Khi người dùng yêu cầu đánh giá, phân tích hoặc audit dự án hiện tại, hãy tuân theo quy trình nghiêm ngặt sau để đảm bảo đánh giá sâu sắc, chi tiết và thực chất (không hời hợt):

## Quy trình thực hiện
1. **Quét cấu trúc dự án**: Gọi tool `AnalyzeProject` để lấy sơ đồ thư mục tổng quan và các dependency chính.
2. **Đọc tệp tin cấu hình**: Xác định các file cấu hình quan trọng (ví dụ: `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `.agents/AGENTS.md`) và gọi tool `read` để đọc trực tiếp nội dung của chúng.
3. **Phân tích mã nguồn cốt lõi**: Xác định các thư mục mã nguồn chính (như `src/`, `lib/`, `apps/`, `packages/`). Tìm ra ít nhất 3 file code quan trọng nhất (như entrypoint, core logic, controllers) và gọi tool `read` để đọc nội dung của chúng.
4. **Đánh giá & Tổng hợp**: Phân tích chi tiết thiết kế kiến trúc, cách tổ chức module, quản lý state, phong cách code (coding style), cơ chế xử lý lỗi, và các rủi ro bảo mật hoặc hiệu năng.
5. **Trình bày kết quả**: Cung cấp một báo cáo chi tiết bao gồm cấu trúc kiến trúc thực tế, đánh giá chi tiết chất lượng code dựa trên các file đã đọc kèm link file, và các đề xuất tối ưu hóa cụ thể.

Không được kết luận ngay chỉ sau khi chạy `AnalyzeProject`. Bạn phải thực hiện ít nhất 3-5 lượt gọi tool `read` để tìm hiểu sâu về dự án.
