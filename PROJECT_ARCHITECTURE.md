# PROJECT_ARCHITECTURE.md

## 1. Tổng quan Kiến trúc Hệ thống (System Architecture Overview)
`Anng_cli` là một công cụ Agentic AI (CLI-based) được thiết kế theo kiến trúc **Multi-Model PEVF (Plan-Execute-Verify-Fix) pipeline**. Mục tiêu của kiến trúc này là sử dụng nhiều mô hình (Model) AI chuyên biệt phối hợp với nhau nhằm lên kế hoạch, thực thi các bước sửa đổi mã nguồn, kiểm chứng kết quả và tự động sửa lỗi, tương tác trực tiếp với codebase của dự án một cách an toàn và có kiểm soát.

## 2. Các Bất biến Kiến trúc (Architectural Invariants)
Hệ thống tuân thủ nghiêm ngặt các nguyên tắc bất biến (invariants) sau đây để đảm bảo an toàn và tính nhất quán:
- Không có output nào từ Model được tin tưởng trước khi đi qua hàng rào Contract (Zod Schema) + Semantic Validation.
- Không có bất kỳ thay đổi tệp tin (mutation) nào được phép vượt ra ngoài danh sách `filesToWrite` đã được hoạch định.
- Không có một PlanStep nào được thực thi trước khi toàn bộ các bước phụ thuộc (`dependencies`) của nó hoàn tất thành công.
- Không lặp lại vô hạn việc sửa lỗi (retry) trên cùng một `errorSignature`.
- Mọi execution run thực tế đều phải phát ra telemetry/trace log để phục vụ audit và gỡ lỗi.

## 3. Cấu trúc thư mục (Directory Structure)
Mô tả toàn bộ cấu trúc các thư mục quan trọng, tách biệt rõ ràng các tầng logic của hệ thống.

```text
/run/media/sanng/New Volume/Seminar/Anng_cli/
├── src/
│   ├── cli.tsx                  # Entry point của ứng dụng CLI, khởi tạo UI (ink) và các session
│   ├── harness/                 # Core PEVF Multi-Model Pipeline (Tầng điều phối luồng chính)
│   ├── common/                  # Utilities dùng chung, cấu hình, quản lý khóa (keys), logging
│   ├── tools/                   # Các handler thực thi tác vụ vật lý (Bash, Edit, Read, Web Search)
│   ├── mcp/                     # Tích hợp Model Context Protocol (MCP) clients và manager
│   ├── prompt-engine/           # Hệ thống build, template hóa system prompt và thu thập metadata
│   ├── session/                 # Quản lý phiên làm việc của người dùng, context, message factory
│   ├── team/                    # Cơ chế phân bổ task cho Multi-Agent (Capabilities, Orchestrator)
│   ├── ui/                      # Các thành phần giao diện người dùng dựa trên thư viện Ink (React CLI)
│   └── tests/                   # Hệ thống Unit, Integration, và E2E tests (nơi chứa `pipeline-real-model.test.ts`)
```

## 4. Chi tiết từng File và Package (File & Package Specifications)

### 4.1. `src/harness/` (Core PEVF Pipeline)
Đây là hệ thống trung tâm điều phối chu trình PEVF.
- **`pipeline-orchestrator.ts`**: Trái tim của hệ thống. Quản lý State Machine (`planning`, `executing`, `verifying_step`, `repairing`, `verifying_final`, `done`, `failed`). Điều hướng dữ liệu giữa các adapters. Sinh ra các file trace E2E phục vụ debug.
- **`pipeline-types.ts`**: Định nghĩa các Interface và Types cốt lõi: `PipelineState`, `PlanStep`, `FailureRecord`.
- **`pipeline-contracts.ts`**: Sử dụng thư viện `zod` để ép kiểu dữ liệu I/O (Input/Output). Chứa các schemas bất biến: `PlannerOutputSchema`, `ExecutorOutputSchema`, và `SimplePatchSchema`.
- **`pipeline-adapters.ts`**: Các adapter giao tiếp với LLM (Planner Adapter, Executor Adapter). Nhận input từ orchestrator, format request dưới dạng JSON Mode, gọi qua `openai-client.ts`, và parse kết quả bằng schemas từ `pipeline-contracts.ts`.
- **`pipeline-validators.ts`**: Thực hiện kiểm tra ngữ nghĩa sâu (Semantic Validation). Ví dụ: phát hiện vòng lặp vô hạn (circular dependencies) trong đồ thị `dependsOn`, độ lớn (granularity) hợp lý của từng task.
- **`patch-handler.ts`**: Lớp bảo vệ biên (boundary layer). Nhận các structured patch object từ Executor, đối chiếu với ranh giới `filesToWrite` và apply patch vào mã nguồn thông qua file system.
- **`pipeline-error-utils.ts`**: Module tiện ích trích xuất và chuẩn hóa thông báo lỗi thành các `errorSignature` duy nhất, giúp hệ thống nhóm và nhận diện lỗi lặp lại.
- **`pipeline-telemetry.ts`**: Thu thập số liệu telemetry pipeline (token count, parse fails, success rate).
- **`pipeline-factories.ts`**: Các hàm Factory pattern khởi tạo trạng thái data ban đầu cho pipeline.

### 4.2. `src/common/` (Core Utilities & Infrastructure)
Cung cấp hạ tầng cần thiết cho toàn bộ ứng dụng.
- **`openai-client.ts`**: SDK Wrapper quản lý kết nối LLM (OpenAI/Gemini/Anthropic). Chịu trách nhiệm fallback, config base URL, gọi `response_format: { type: "json_object" }` và bắt exception ở tầng HTTP.
- **`key-rotator.ts`** & **`gemini-keys-sync.ts`**: Hệ thống quản lý nhiều API credentials và provider, đảm nhận việc xoay vòng (rotation) API keys, chọn key khả dụng theo trạng thái quota/rate limits, nhằm tăng độ bền bỉ (reliability) và duy trì tính ổn định của hệ thống trước các lỗi giới hạn tốc độ của dịch vụ bên thứ ba.
- **`file-utils.ts`**, **`file-history.ts`**: Cung cấp khả năng thao tác đọc ghi file an toàn, đồng thời duy trì version history để hỗ trợ rollback trạng thái tệp tin khi cần thiết.
- **`bash-timeout.ts`**, **`shell-utils.ts`**, **`process-tree.ts`**: Thực thi lệnh shell (bash), bọc trong bộ định thời (timeout guards) và theo dõi cây tiến trình (process trees) để đảm bảo an toàn.
- **`audit-logger.ts`**, **`error-logger.ts`**, **`debug-logger.ts`**: Hệ thống logging phân cấp phục vụ diagnostics.
- **`state.ts`**: Global Singleton lưu trữ cấu hình môi trường, thông tin workspace, LLM preferences.

### 4.3. `src/tools/` (Agent Action Handlers)
Cầu nối vật lý giữa Agent và môi trường local.
- **Lưu ý Kiến trúc**: Mặc dù các tool handlers truyền thống (`bash`, `edit`, `write`, `read`, `web search`) vẫn tồn tại ở đây, cấu trúc PEVF Pipeline mới có sự tách biệt về trách nhiệm. Thay vì Executor Model gọi Tool Handler trực tiếp một cách tự do, quy trình mới định tuyến luồng qua các rào cản: **Executor -> Structured Action (JSON) -> Patch/Boundary Layer (`PatchHandler`) -> File System / Tool Handlers**.
- **`executor.ts`**: Dispatcher trung tâm của các tool truyền thống.
- **`bash-handler.ts`**, **`edit-handler.ts`**, **`write-handler.ts`**, **`read-handler.ts`**, **`web-search-handler.ts`**: Các trình xử lý tương tác vật lý.

### 4.4. Các phần khác (`src/session/`, `src/prompt-engine/`, `src/team/`, `src/mcp/`)
- Quản lý phiên chat (`session/`), nén context (compaction), build dynamic prompts (`prompt-engine/`), quản lý phân quyền nhóm Multi-Agent (`team/`) và tích hợp chuẩn công cụ mở rộng (`mcp/`).

---

## 5. Các Ràng Buộc Liên Kết Kỹ Thuật (Strict Constraints & Integrations)

Việc ghép nối các module tuân thủ nghiêm ngặt các rào cản kỹ thuật để đảm bảo tính an toàn:

1. **Ràng buộc I/O (Zod Contract Barrier):**
   Mọi dữ liệu ra/vào giữa Model và `PipelineOrchestrator` bắt buộc phải đi qua `pipeline-contracts.ts`. Nếu output là unstructured text, Adapter lập tức ném lỗi schema.
2. **Ràng buộc Biên Tệp (File Boundary Enforcements):**
   `Executor` sinh ra các Edit Patch hoặc Write Command, `PatchHandler` sẽ đối chiếu `targetFile` với `filesToWrite` từ plan. Nếu nằm ngoài, từ chối áp dụng và ném lỗi.
3. **Ràng buộc Đồ Thị Phụ Thuộc (Dependency Graph Validation):**
   Đồ thị PlanStep phải là DAG (Không chu trình). `PipelineOrchestrator` chỉ chạy step khi `dependsOn` của nó đã `done`.
4. **Ràng buộc Quản Lý API Keys:**
   API SDK chỉ nhận 1 API key string; `key-rotator.ts` sẽ chọn và truyền một key duy nhất vào client tại một thời điểm để tránh lỗi HTTP 400.

---

## 6. Phân loại Lỗi & Vùng Sự Cố (Failure Taxonomy & Domains)

Để hệ thống xử lý (repair) đúng cách và phục vụ việc truy vết (debug) hiệu quả, lỗi được phân hoạch rõ ràng:

### 6.1. Taxonomy các lỗi kiểm tra ngữ nghĩa và cấu trúc
Hệ thống sử dụng enum `PipelineErrorType` để phân loại chính xác bản chất của lỗi:
- `planner_schema_error`: Planner trả về dữ liệu không đúng cấu trúc Zod (ví dụ trả về string thay vì Array of Steps).
- `planner_semantic_error`: Kế hoạch vi phạm tính logic (ví dụ: Dependency có vòng lặp, Step quá to/không hợp lý).
- `executor_schema_error`: Executor không trả về đúng cấu trúc Action mong muốn.
- `executor_semantic_error`: Hành động hợp lệ về schema nhưng sai logic.
- `patch_apply_error`: Lỗi khi `PatchHandler` apply edit (không tìm thấy targetContent, vi phạm ranh giới file).
- `verify_failure`: Lỗi phát sinh trong giai đoạn kiểm chứng (tests fail, code linter báo lỗi).
- `repair_loop_abort`: Bị ngắt do vi phạm giới hạn sửa chữa liên tiếp trên cùng một `errorSignature`.

### 6.2. Vùng Lỗi (Failure Domains)
Các lỗi trên thuộc về các phân tầng sự cố khác nhau:
- **Model output layer**: Lỗi sinh văn bản/cấu trúc sai của LLM.
- **Validation layer**: Bị chặn bởi Zod hoặc Semantic validators do vi phạm contract.
- **Patch application layer**: Lỗi cấp độ string-matching và thao tác I/O.
- **Verification layer**: Lỗi logic mã nguồn, biên dịch, hoặc test.
- **External process/tool layer**: Lỗi khi gọi command/bash fail.
- **API transport/auth layer**: Lỗi HTTP, Rate Limit, hoặc Authentication.

---

## 7. Cơ chế Phục hồi (Rollback Semantics)

Cơ chế xử lý và phục hồi trạng thái khi có lỗi xảy ra như sau:
- **Ở mức Step/Repair**: Nếu `PatchHandler` lỗi (ví dụ patch không khớp string), thao tác ghi file bị chặn từ sớm, tệp hệ thống không bị biến đổi. Hệ thống ghi nhận lỗi và đẩy sang `repairing`.
- **Lỗi toàn cục (Final Verify Fail / Repair Fail)**: Hiện tại, hệ thống thiên về chiến lược **giữ nguyên hiện trạng (keep trace) để developer inspect** thay vì tự động rollback (hoàn tác) toàn bộ. Điều này giúp dev có thể đọc artifact logs, xem trace và gỡ rối hành vi của Model tận gốc.
- **Khả năng mở rộng**: Tính năng rollback sử dụng `file-history.ts` đóng vai trò là một cơ chế bảo vệ dự phòng (opt-in capability), có thể kích hoạt trong các kịch bản abort cưỡng bức.

---

## 8. Vòng đời Thực thi E2E (Multi-Model Lifecycle)

1. **User Prompt** -> `planning` phase -> Gọi **PlannerAdapter** -> Check `PlannerOutputSchema` & `pipeline-validators.ts`.
2. Chuyển sang `executing` phase -> Tìm step `pending` -> Gọi **ExecutorAdapter** -> Ra Structured Action -> `patch-handler.ts` apply và check boundary.
3. Chuyển sang `verifying_step` phase -> Verify logic (linter/tests). Nếu lỗi -> `repairing`.
4. `repairing` phase -> Trích xuất `errorSignature`, check Anti-loop -> Gọi **FixerAdapter** -> Về lại `executing`.
5. Đợi mọi step `done` -> `verifying_final`.
6. Thành công -> Đưa state về `done`, ghi log trace. Thất bại toàn cục đưa về `failed`.

---

## 9. Phạm vi Hiện tại vs. Phạm vi Tương lai (Current vs Future Scope)

**Current Scope (Hiện tại đã đáp ứng)**:
- Narrow integration proven (Đã tích hợp và kiểm chứng thành công luồng cơ bản E2E).
- Planner & Executor đã được hỗ trợ tích hợp với Model thật.
- Fixer behavior được giới hạn và rào chắn an toàn (bounded).
- Sẵn sàng cho việc chạy 5-10 small, controlled trials trên các repos thực tế.

**Future Scope (Định hướng sắp tới)**:
- Multi-agent team execution (Mở rộng cho nhiều agents chuyên biệt phối hợp xử lý task lớn).
- MCP-driven tool expansion (Mở rộng khả năng của Agent thông qua chuẩn Model Context Protocol).
- Broader repo workloads (Xử lý tác vụ trên repos có quy mô siêu lớn).
- Advanced repair planning (Lập kế hoạch sửa chữa dài hạn, đa bước).
- Parallel step scheduling (Lập lịch và thực thi song song các bước PlanStep không phụ thuộc nhau).
