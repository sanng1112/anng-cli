# ANNG CLI CLI — Đánh Giá Tổng Quan Dự Án

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đánh giá toàn diện kiến trúc, chất lượng code, quy trình phát triển, điểm mạnh và điểm yếu của dự án anng-cli

**Architecture:** Ứng dụng CLI dạng interactive coding assistant, dùng Ink (React cho terminal) làm UI, SessionManager làm trung tâm điều phối, tích hợp OpenAI-compatible API (DeepSeek), hệ thống tool handlers, MCP protocol, và hệ thống phân quyền.

**Tech Stack:** TypeScript, React (Ink 7), Node.js ≥22, ESM, esbuild bundler, OpenAI SDK, Zod, EJS templates

---

## I. TỔNG QUAN DỰ ÁN

| Thuộc tính | Giá trị |
|---|---|
| **Tên** | `anng-cli` v0.1.29 |
| **Mô tả** | Terminal AI coding assistant cho deepseek-v4 |
| **Ngôn ngữ** | TypeScript (strict mode) |
| **Số file source** | 108 file .ts/.tsx |
| **Tổng dòng code** | ~15,000+ LOC (ước tính) |
| **Test files** | 33 files, dùng Node.js native test runner |
| **Docs** | 16 file markdown (8 chủ đề × 2 ngôn ngữ) |
| **CI/CD** | GitHub Actions, matrix 3 OS × 3 Node versions |
| **License** | MIT |

---

## II. ĐIỂM MẠNH

### 1. Kiến trúc module rõ ràng
Dự án phân chia thành 5 tầng rõ rệt:
- **`ui/`** — Ink/React terminal UI (~40 files, 13 views)
- **`session.ts`** — SessionManager, trung tâm điều phối business logic
- **`tools/`** — 7 tool handlers theo Strategy Pattern
- **`mcp/`** — MCP protocol client + multi-server manager
- **`common/`** — 17 shared utilities (permissions, file I/O, logging, telemetry, etc.)

Mỗi module có ranh giới rõ ràng, ít cross-cutting concerns không kiểm soát được.

### 2. Hệ thống Tool Handler thiết kế tốt (Strategy Pattern)
```typescript
// executor.ts — registry-based dispatch
private handlers: Map<string, ToolHandler> = new Map()
// Mỗi handler đăng ký độc lập, executor không cần biết chi tiết
```
Thêm tool mới chỉ cần: (a) tạo handler, (b) đăng ký vào registry. Không cần sửa executor.

### 3. Hệ thống phân quyền tinh vi
- **Scope-based**: `read-in-cwd`, `write-out-cwd`, `network`, `mcp`, ...
- **Ba mức quyết định**: allow / deny / ask
- **Phân tích theo từng loại tool**: bash (sideEffects), read (file paths), write (file paths), edit (file paths)
- **Hỗ trợ ghi nhớ lựa chọn** vào project settings để không hỏi lại

### 4. CI/CD toàn diện
- Matrix build: Ubuntu + Windows + macOS × Node 20/22/24
- Quality gates: typecheck → lint → format check → bundle → test
- Husky pre-commit hooks + lint-staged
- `fail-fast: false` — không block các job khác khi 1 job fail

### 5. Chất lượng code tốt
- TypeScript strict mode bật toàn bộ
- ESLint: consistent-type-imports, react-hooks exhaustive-deps
- Prettier: semi, singleQuote false, trailingComma es5, printWidth 120
- Không có TODO/FIXME/HACK còn sót trong source code production

### 6. Test coverage khá toàn diện
33 test files phủ hầu hết module quan trọng: session, permissions, tool handlers, prompt, openai converter, mcp client, UI components. Mỗi module chính đều có test file tương ứng.

### 7. Hỗ trợ đa nền tảng tốt
- Windows: Git Bash detection, cmd.exe quoting, path translation, `shell: true`
- Linux/macOS: Native support
- `process-tree.ts`: kill process tree cross-platform (pgrep/kill vs taskkill)

### 8. Documentation song ngữ đầy đủ
8 chủ đề × 2 ngôn ngữ (Chinese + English): configuration, MCP, session, permissions, skills, agents, quickstart, notify.

### 9. Cơ chế Undo thông minh
Dùng bare Git repository để checkpoint file history, cho phép khôi phục code và conversation về các điểm trước đó. Thiết kế sáng tạo và đáng tin cậy.

### 10. Hệ thống Skills linh hoạt
Hỗ trợ load skills từ nhiều nguồn: project-level, user-level, cross-client interoperability (`~/.agents/skills/`). Skills được matching tự động qua LLM call khi user gửi prompt.

---

## III. ĐIỂM YẾU

### 1. 🔴 SessionManager quá khổ — God Object (CRITICAL)
**File**: `src/session.ts` — **2,834 dòng**

SessionManager đảm nhiệm quá nhiều trách nhiệm:
- Session CRUD (create, list, get, delete, rename)
- Conversation loop (activateSession với vòng lặp LLM → tools → LLM)
- Message persistence (JSONL read/write)
- Compaction (context compression)
- Streaming response handling
- Skill matching (gọi LLM riêng)
- Process tracking (bash process lifecycle)
- Undo/restore checkpointing
- Notification dispatching
- Telemetry reporting
- MCP initialization
- Token usage tracking

**Hậu quả**:
- Khó test độc lập — cần mock quá nhiều dependency
- Khó review — 2,834 dòng trong 1 file
- Khó mở rộng — bất kỳ thay đổi nào cũng có rủi ro cao
- Vi phạm Single Responsibility Principle

### 2. 🔴 App.tsx quá lớn — Fat Controller (HIGH)
**File**: `src/ui/views/App.tsx` — **881 dòng**

App component nắm toàn bộ UI state: views, slash commands, session switching, model selection, permission dialogs, undo flow, raw mode toggle, paste handling, MCP status. Quá nhiều state trong 1 component.

### 3. 🟡 edit-handler.ts quá phức tạp (MEDIUM)
**File**: `src/tools/edit-handler.ts` — **867 dòng**

Handler này chứa quá nhiều logic phức tạp trong 1 file:
- Multiple matching strategies (exact → tab-corrected → loose escape → LLM-corrected)
- Snippet-based scoping
- Replace-all guard
- Outdated snippet detection
- Smart error messages với LLM diagnosis

Nên tách thành các strategy class riêng.

### 4. 🟡 System prompt hardcoded tiếng Trung (MEDIUM)
Toàn bộ system prompt trong `prompt.ts` được viết bằng tiếng Trung. Không có cơ chế i18n, gây khó khăn cho người dùng không nói tiếng Trung.

### 5. 🟡 Không có error boundary cho Ink/React (MEDIUM)
`AppContainer.tsx` không wrap App trong error boundary. Một lỗi React không được catch có thể crash toàn bộ terminal session.

### 6. 🟡 Không có Dependency Injection Container (MEDIUM)
Tất cả dependency được wire thủ công trong SessionManager constructor và App.tsx. Khó swap implementation, khó test với mock, khó track dependency graph.

### 7. 🟡 Không có E2E tests (MEDIUM)
33 test files toàn bộ là unit/integration test. Không có test nào chạy CLI thực tế (dù với mock API). Không thể verify full flow: user input → LLM response → tool execution → UI render.

### 8. 🟡 Không có kiến trúc tài liệu (MEDIUM)
`docs/` có 8 hướng dẫn sử dụng nhưng không có tài liệu kiến trúc (architecture decision records, module dependency map, data flow diagrams). Developer mới khó nắm bắt cấu trúc.

### 9. 🟡 Các module lớn phân bố không đều (LOW)
- `session.ts`: 2,834 dòng
- `edit-handler.ts`: 867 dòng
- `App.tsx`: 881 dòng
- `prompt.ts`: 685 dòng
- `mcp-manager.ts`: 524 dòng
- `permissions.ts`: 554 dòng

6 files đã chiếm phần lớn logic. Các module nhỏ khác (5-50 dòng) được tổ chức tốt.

### 10. 🟡 Không có performance monitoring (LOW)
Không benchmark latency/p95, không track token cost per session, không monitor memory usage (dù có `memory-leak.test.ts`). Telemetry chỉ gửi event cơ bản.

### 11. 🟡 Không có semantic versioning automation (LOW)
Không có CHANGELOG.md, không có release workflow tự động, version bump thủ công.

### 12. 🟢 Thiếu smoke tests (LOW)
CI bundle rồi test unit. Nhưng không có bước smoke test: chạy CLI binary, gửi 1 prompt đơn giản, xác nhận output.

---

## IV. PHÂN TÍCH THEO TIÊU CHÍ

| Tiêu chí | Điểm (1-5) | Ghi chú |
|---|---|---|
| **Kiến trúc tổng thể** | 4/5 | Module rõ ràng, nhưng SessionManager quá lớn |
| **Chất lượng code** | 4/5 | Strict TS, lint tốt, convention nhất quán |
| **Khả năng mở rộng** | 4/5 | Tool handler pattern tốt, MCP hỗ trợ extension |
| **Khả năng bảo trì** | 3/5 | File quá lớn, không có architecture docs |
| **Test coverage** | 4/5 | 33 files, phủ tốt nhưng thiếu E2E |
| **Bảo mật** | 4/5 | Permission system tốt, API key masking trong logs |
| **Performance** | 3/5 | Chưa có benchmark, telemetry cơ bản |
| **Documentation** | 4/5 | Song ngữ đầy đủ, thiếu architecture docs |
| **CI/CD** | 4/5 | Matrix build tốt, thiếu smoke test |
| **Tính đa nền tảng** | 5/5 | Windows/Linux/macOS hỗ trợ toàn diện |

---

## V. KHUYẾN NGHỊ ƯU TIÊN

### Priority 1 (Nên làm ngay)
1. **Tách SessionManager**: Chia thành SessionStore (persistence), ConversationLoop (LLM loop), SkillMatcher, CompactionManager
2. **Thêm Error Boundary**: Wrap App trong error boundary để tránh crash toàn bộ
3. **Tách App.tsx**: Dùng state machine hoặc useReducer thay vì nhiều useState rời rạc

### Priority 2 (Nên làm sớm)
4. **Thêm architecture docs**: ADR cho các quyết định kiến trúc chính, module dependency diagram
5. **Thêm E2E/smoke tests**: Ít nhất 1 test flow cơ bản
6. **i18n system prompt**: Tách string khỏi code, hỗ trợ ít nhất EN + ZH

### Priority 3 (Cân nhắc)
7. Dependency injection container (ví dụ: tsyringe hoặc manual DI)
8. Performance benchmarks
9. Tự động hóa release (CHANGELOG, version bump, npm publish)
10. Tách edit-handler thành strategy classes

---

## VI. BIỂU ĐỒ PHỤ THUỘC MODULE

```
cli.tsx (entry)
  └─► ui/views/AppContainer
        └─► ui/views/App (881 dòng — UI state hub)
              ├─► ui/components/* (MessageView, DropdownMenu, ...)
              ├─► ui/core/* (prompt-buffer, slash-commands, ...)
              ├─► ui/hooks/* (terminal input, paste, history)
              └─► session.ts → SessionManager (2834 dòng — brain)
                    ├─► prompt.ts (685 dòng — system prompt, tools, compaction)
                    ├─► common/openai-client.ts
                    ├─► common/openai-message-converter.ts (278 dòng)
                    ├─► common/openai-thinking.ts
                    ├─► common/permissions.ts (554 dòng)
                    ├─► common/file-history.ts (git undo)
                    ├─► common/state.ts (file state, snippets)
                    ├─► common/notify.ts, telemetry.ts, debug-logger.ts, error-logger.ts
                    ├─► tools/executor.ts → ToolExecutor
                    │     ├─► bash-handler.ts
                    │     ├─► read-handler.ts
                    │     ├─► write-handler.ts
                    │     ├─► edit-handler.ts (867 dòng)
                    │     ├─► ask-user-question-handler.ts
                    │     ├─► update-plan-handler.ts
                    │     ├─► web-search-handler.ts
                    │     └─► common/validate.ts (Zod wrapper)
                    └─► mcp/mcp-manager.ts (524 dòng)
                          └─► mcp/mcp-client.ts (451 dòng — JSON-RPC over stdio)
```

---

**Tổng kết**: ANNG CLI CLI là một dự án chất lượng tốt với kiến trúc module rõ ràng, test coverage khá và CI/CD toàn diện. Vấn đề chính là **SessionManager quá khổ** (God Object pattern) và **thiếu tài liệu kiến trúc** — hai điểm này nên được ưu tiên giải quyết nếu dự án tiếp tục phát triển và mở rộng đội ngũ.
