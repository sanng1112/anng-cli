# Kiến Trúc Multi-Agent: Data Parallelism (DP) & Workflow (WF)

Tài liệu này đóng vai trò là "Bộ não chiến thuật" lưu trữ các quyết định thiết kế cốt lõi của hệ thống Multi-Agent trong dự án `anng-cli`, đặc biệt là việc xây dựng Graph State Machine cho `/team-dp` và định hướng cho `/team-wf`.

## 1. Bản Chất Của /team-dp (Data Parallelism)

`/team-dp` được thiết kế theo kiến trúc **Embarrassingly Parallel** (Song song độc lập) kết hợp với **Graph State Machine** (Máy trạng thái dạng Đồ thị).

### 1.1. Mục đích cốt lõi
- DP sinh ra **không phải** để lập trình (Software Engineering) một dự án phức tạp cần chia sẻ tài nguyên chung.
- DP sinh ra để làm **Công nhân Dữ liệu (Data Processing)** cho các bài toán xử lý hàng loạt:
  - Dịch thuật đa ngôn ngữ (1 file gốc -> 50 ngôn ngữ).
  - Sinh dữ liệu huấn luyện (Synthetic Data Generation).
  - Xử lý hàng loạt văn bản (Tóm tắt, cào dữ liệu, tạo nội dung tự động).

### 1.2. Graph State Machine (Luồng hoạt động bên trong 1 Tiểu đội)
Thay vì các Agent chạy theo một mảng tuần tự cứng nhắc, hệ thống đã được nâng cấp thành **Đồ thị phân mảnh (DAG - Directed Acyclic Graph có vòng lặp hở)**.

Mỗi Tiểu đội (Clone) hoạt động dựa trên cấu trúc:
- **Nodes (Agents):** Các thực thể AI đóng vai trò cụ thể (VD: Worker, Tester).
- **Edges (Cạnh nối):** Quy tắc luân chuyển dữ liệu giữa các Agents.
  - `always`: Chuyển thẳng từ A sang B.
  - `on_reject`: Xảy ra khi Tester (B) đánh giá NO. Luồng sẽ quay ngược lại A để làm lại (Tạo ra vòng lặp đối chất).
  - `on_success`: Xảy ra khi Tester (B) đánh giá YES. Luồng đi đến END để chốt kết quả.

**Cơ chế cô lập ngữ cảnh (Context Isolation):**
Bản chất các Agents đều dùng chung một Core Model (LLM), nhưng chúng giao tiếp qua kiến trúc cô lập. Agent A gọi API bằng System Prompt A và không có ký ức của Agent B. Agent B nhận Output của A như một dữ liệu độc lập. Điều này phá vỡ hiện tượng "Ảo giác thỏa hiệp" (Sycophancy) của LLM, giúp các Agent đối kháng và bắt lỗi nhau một cách cực kỳ khắt khe.

### 1.3. Giới hạn của /team-dp (Tính năng "Mù")
- Các Node trong DP chạy dưới dạng **Bare LLM** (Gọi API thuần túy).
- Chúng KHÔNG có Tools (không thể read/write file, không chạy bash).
- Các Clone không giao tiếp với nhau. Thằng code Chunk 1 không biết thằng code Chunk 2 làm gì.
- **Tại sao lại giới hạn?** Để đảm bảo Tốc độ tối đa và tránh xung đột (Race Condition) khi hàng chục luồng cùng thao tác lên hệ thống tệp.

## 2. Định Hướng Chuyển Giao Sang /team-wf (Workflow Parallelism)

Nếu DP là Máy cày (xử lý dữ liệu lớn, song song độc lập), thì WF là Bác sĩ phẫu thuật (chuẩn xác, tuần tự, có kiểm soát).

### 2.1. Mục đích cốt lõi
- Dùng cho **Software Engineering** thực thụ: Code một tính năng, Refactor mã nguồn, Sửa bug.

### 2.2. Điểm khác biệt so với DP
- **Full Harness & Tools:** Các Node trong `/team-wf` không bị "mù". Chúng được cấp đầy đủ quyền đọc/ghi file, duyệt thư mục, chạy terminal (npm test, build) thông qua Tool Executor.
- **Global Graph (Đồ thị toàn cục):** Không còn là các tiểu đội nhân bản độc lập. `/team-wf` vẽ ra một luồng công việc nối tiếp. Ví dụ:
  1. `Architect Node:` Lên thiết kế kiến trúc chung.
  2. `Coder Nodes (Parralel):` Dựa vào thiết kế để code các module.
  3. `Integrator Node:` Gom tất cả lại, chạy test, build và sửa lỗi.

### 3. Masterplan (Sự kết hợp hoàn hảo)
Sức mạnh tối thượng của hệ thống nằm ở việc kết hợp cả hai:
1. **Pha Map (Dùng DP):** Chạy 30 luồng song song không có side-effect (không sửa file) để vắt kiệt tư duy của LLM sinh ra 30 bản Đặc tả kỹ thuật / Test case chi tiết. Output là 30 file Markdown.
2. **Pha Reduce (Dùng WF):** Đọc 30 file Markdown đó, và dùng các WF Agents (có Full Tools) để âm thầm code, test và build ra sản phẩm thực tế. 

Đây chính là mô hình **Map-Reduce Agentic Workflow** - nền tảng của hệ thống AI tự động hóa cao cấp.
