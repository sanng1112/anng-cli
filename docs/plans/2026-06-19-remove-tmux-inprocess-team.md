# Refactor: Remove tmux, Simplify Team System to In-Process Only

## Lý do

Hiện tại code team orchestration có **2 execution path**:
1. **In-process** (mode `"internal"`) — Worker chạy trong cùng process, dùng `SessionManager.handleUserPrompt()`
2. **Tmux** (mode `"tmux"` / `"dmux"`) — Worker spawn trong tmux pane, giao tiếp qua send-keys/capture-pane

Path #1 đã hoạt động và là default. Path #2 tốn ~400 dòng code cho tmux infrastructure, nhưng:
- Chỉ hoạt động nếu có tmux installed (Linux/macOS)
- Không portable (Windows, CI, Docker)
- Giao tiếp text-based fragile
- Không structured, không track được real result
- Gây hiểu lầm cho user (README nói "qua tmux")

**Mục tiêu:** Xoá bỏ hoàn toàn tmux dependency, chỉ giữ in-process path, đơn giản hoá codebase.

---

## Tổng quan thay đổi

| File | Action | Dòng |
|------|--------|------|
| `src/team/integrations/tmux-manager.ts` | **DELETE** | 103 |
| `src/team/integrations/dmux-adapter.ts` | **DELETE** | 66 |
| `src/team/integrations/terminal-multiplexer.ts` | **DELETE** | 18 |
| `src/team/team-tmux-layout.ts` | **DELETE** | 115 |
| `src/team/types.ts` | **MODIFY** | Remove tmux types |
| `src/team/agent-worker.ts` | **MODIFY** | Remove tmux execution path |
| `src/team/agent-worker-pool.ts` | **MODIFY** | Remove `mux` parameter |
| `src/team/team-orchestrator.ts` | **MODIFY** | Remove `setupMultiplexer()`, tmux-related code |
| `src/harness/run-worker.ts` | **DELETE** | (chỉ dùng cho tmux worker) |
| `src/cli.tsx` | **MODIFY** | Remove `--tmux`, `--worker` flags |
| `src/ui/views/App.tsx` | **MODIFY** | Remove tmux references |
| `src/team/index.ts` | **CREATE** | Public API exports |

---

## Step 1: Simplify types.ts

### Xoá:
```typescript
export type TeamExecutionMode = "internal" | "tmux" | "dmux" | "headless";
// → chỉ giữ: "internal" | "headless"
```

### Xoá:
- `TmuxLayoutConfig` interface
- `TmuxLayoutResult` interface  
- `TeamSettings.tmux` section
- `TeamExecutionMode` → đổi thành `"internal" | "headless"`

### Giữ nguyên:
- `TeamTask`, `TeamTaskResult`, `TeamResult`, `TeamSession`
- `AgentConfig`, `AgentContract`
- `FileConflictResolver`, `ResultAggregator`

---

## Step 2: Simplify agent-worker.ts

### Xoá:
- Import `TerminalMultiplexer`
- `mux` parameter từ `AgentWorkerOptions`
- Entire `if (this.options.mux)` block (dòng ~144-172) — tmux pane creation + polling

### Chỉ giữ:
- In-process path (else branch) — dùng `SessionManager.handleUserPrompt()`

**Kết quả:** `AgentWorker.executeTask()` chỉ còn ~40 dòng (thay vì ~100).

---

## Step 3: Simplify agent-worker-pool.ts

### Xoá:
- Import `TerminalMultiplexer`
- `mux` parameter từ `AgentWorkerPoolOptions`
- Pass `mux` vào `AgentWorker`

---

## Step 4: Simplify team-orchestrator.ts

### Xoá:
- Import TmuxManager, DmuxAdapter, TeamTmuxLayout, TerminalMultiplexer
- `private mux` field
- `private tmuxLayout` field
- `setupMultiplexer()` method
- tmux cleanup code

### Simplify `executeTask()`:
- Remove mode check for tmux/dmux
- Remove `setupMultiplexer()` call
- Remove tmux cleanup in finally block

---

## Step 5: Xoá tmux infrastructure files

| File | Reason |
|------|--------|
| `integrations/tmux-manager.ts` | Tmux-specific |
| `integrations/dmux-adapter.ts` | Tmux-specific |
| `integrations/terminal-multiplexer.ts` | Abstract cho tmux |
| `team-tmux-layout.ts` | Tmux layout management |
| `harness/run-worker.ts` | Chỉ dùng cho worker trong tmux pane |

---

## Step 6: Simplify cli.tsx

### Xoá:
- `--tmux` flag parsing
- `--worker` mode handling
- `--team-mode` flag (chỉ còn internal)
- `runWorker` import + call

### Update help text:
```diff
- "  anng --team --tmux -p <prompt>    Team mode with tmux visual panels",
- "  anng --worker -p <prompt>         Sub-process worker (for tmux)",
+ "  anng --team -p <prompt>           Team mode: multi-agent task dispatch",
```

---

## Step 7: Simplify App.tsx

### Xoá:
- Tmux mode references trong team config
- "Tmux session cleaned up" messages

### Simplify:
```diff
- mode: teamTmux ? "tmux" : (teamModeValue ?? "internal"),
+ mode: "internal",
```

---

## Step 8: Update README.md

### Sửa:
```diff
- - 🤖 **Đội ngũ Multi-Agent (Team Mode):** ... tương tác và hiển thị log real-time qua các panel tmux thời gian thực.
+ - 🤖 **Đội ngũ Multi-Agent (Team Mode):** ... chia nhỏ task song song, tự động tổng hợp kết quả.
```

---

## Step 9: Verify (Build + Test)

```bash
npm run build
node --import tsx --test --test-concurrency=1 src/tests/session.test.ts
node --import tsx --test --test-concurrency=2 src/tests/prompt.test.ts ...
```

---

## Timeline

| Step | Files | Effort |
|------|-------|--------|
| 1 | `types.ts` | ~5 phút |
| 2 | `agent-worker.ts` | ~10 phút |
| 3 | `agent-worker-pool.ts` | ~5 phút |
| 4 | `team-orchestrator.ts` | ~10 phút |
| 5 | Delete 5 files | ~2 phút |
| 6 | `cli.tsx` | ~10 phút |
| 7 | `App.tsx` | ~5 phút |
| 8 | `README.md` | ~2 phút |
| 9 | Build + Test | ~5 phút |
| **Total** | **~9 files modified** | **~54 phút** |
