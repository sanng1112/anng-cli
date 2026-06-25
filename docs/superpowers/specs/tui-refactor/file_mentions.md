# Specification: `internal/tui/file_mentions.go`

> Historical TUI refactor spec: legacy `.tsx` and `src/ui/...` references are comparison notes from before the Go migration completed.

## 1. Description & Purpose
`file_mentions.go` handles file-mentioning autocompletion triggers (using `@`). It scans the project workspace directory to list files and folders, allowing developers to mention files in their chat prompt for context loading.

## 2. TS Counterpart Comparison
* **TS Files:**
  * [FileMentionMenu/index.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/components/FileMentionMenu/index.tsx)
  * [file-mentions.ts](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/core/file-mentions.ts)
* **TS Responsibility:** Performs workspace recursive file scanning, filters matches on active query, handles key event overrides, and replaces selected tokens.
* **Go Current State:** Relies on basic `filepath.Glob(cwd + query + "*")` execution.
* **Functional Gap:** Globbing synchronously on a huge codebase blocks the single-threaded Bubble Tea UI render cycle, causing input stutter. Token replacement replaces too many letters or places cursor at the wrong position.

## 3. Specifications for Refactoring

### A. Scanning & Caching Engine
To prevent blocking, the codebase should scan and cache workspace file structures asynchronously, reloading in the background on launch and when a subprocess completes.

```go
type FileMentionCache struct {
	mu    sync.Mutex
	Files []string // Cached workspace path list (relative to project root)
}
```

### B. Mention State Model
Track state of the file mention menu:

```go
type FileMentionMenu struct {
	Cache       *FileMentionCache
	Matches     []string
	SelectedIdx int
	Visible     bool
	StartOffset int // Starting character index of "@" in input buffer
}
```

### C. Matching Logic
* **Activation:** Triggered when the character sequence `@` is typed, or when the cursor sits inside a word prefixed with `@`.
* **Filtering:** Perform case-insensitive fuzzy matching or path-prefix matching against the cached file list.
* **Format:** Folders must end with `/` (e.g. `@internal/`) and files remain normal (e.g. `@go.mod`).
* **Limit:** Restrict matches to maximum 10 items to prevent screen clutter.

### D. Token Replacement Logic
When a file item is selected (via `Tab` or `Enter` inside the mention menu):
1. Delete characters in the input buffer from the `@` position up to current cursor position.
2. Insert the selected file reference (e.g. `internal/tui/app.go `) followed by a space.
3. Reposition input buffer cursor at the end of the newly inserted path.
