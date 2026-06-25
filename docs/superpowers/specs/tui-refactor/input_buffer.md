# Specification: `internal/tui/input_buffer.go`

> Historical TUI refactor spec: this document may compare against removed TypeScript prompt-buffer modules. Those references are archival, not active code paths.

## 1. Description & Purpose
`input_buffer.go` maintains the text buffer typed by the user, keeps track of the cursor caret position, and performs string edits (character additions, deletions, word navigation, backspacing).

## 2. TS Counterpart Comparison
* **TS Files:**
  * [prompt-buffer.ts](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/core/prompt-buffer.ts)
  * [prompt-undo-redo.ts](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/core/prompt-undo-redo.ts)
* **TS Responsibility:** Provides robust prompt buffer state mutation functions, paste block segment formatting, word selection, line killing, Emacs shortcut combinations, and undo/redo stacks.
* **Go Current State:** Implements custom `InputBuffer` tracking a slice of runes with standard insert, delete, backspace, and left/right cursor movements.
* **Functional Gap:** Lacks multi-line layout support (`Shift+Enter` returns), paste boundaries, scroll viewports, prompt history navigation, undo/redo editing states, and common TUI navigation shortcuts (`Ctrl+A`/`Ctrl+E`).

## 3. Specifications for Refactoring

### A. Extended InputBuffer State
Expand structural metrics of the input buffer:

```go
type InputBuffer struct {
	runes      []rune
	cursor     int
	history    []string
	historyIdx int      // -1 when editing a new prompt; >= 0 when browsing history
	tempBuffer string   // Stash active prompt when browsing history
	undoStack  [][]rune
	redoStack  [][]rune
}
```

### B. Emacs Shortcut Actions to Implement
Support typical shell editor shortcuts in `Update()` loops:

* **Cursor Navigation:**
  * `Ctrl+A` / `Home`: Set cursor index to start of buffer line.
  * `Ctrl+E` / `End`: Set cursor index to end of buffer line.
  * `Left Arrow` / `Ctrl+B`: Move cursor left by one character.
  * `Right Arrow` / `Ctrl+F`: Move cursor right by one character.
  * `Alt+Left Arrow` / `Meta+B`: Move cursor back to beginning of previous word boundary.
  * `Alt+Right Arrow` / `Meta+F`: Move cursor forward to end of next word boundary.
* **Deletion & Modification:**
  * `Ctrl+U`: Clear entire input line.
  * `Ctrl+K`: Kill line (delete all characters from cursor position to end of buffer).
  * `Ctrl+W` / `Meta+Backspace`: Delete word immediately before cursor.
  * `Backspace` / `Ctrl+H`: Remove rune behind cursor.
  * `Delete` / `Ctrl+D`: Remove rune in front of cursor.
* **History Browsing:**
  * `Ctrl+P` / `Up Arrow` (at line start): Load previous prompt from history.
  * `Ctrl+N` / `Down Arrow` (at line end): Load next prompt from history (or restore `tempBuffer` if at index -1).
* **Newlines:**
  * `Shift+Enter`: Insert `\n` rune into the active cursor index instead of submitting the form.

### C. Undo/Redo Editing Buffer State
Before modifying text for actions like clear, paste, or word deletion:
1. Append current `runes` copy to `undoStack` (cap stack size at 50).
2. Reset `redoStack`.
3. Support `Ctrl+Z` to pop state from `undoStack` and push current state to `redoStack`.
4. Support `Ctrl+Y` to pop state from `redoStack`.
