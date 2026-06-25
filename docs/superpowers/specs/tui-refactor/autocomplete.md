# Specification: `internal/tui/autocomplete.go`

> Historical TUI refactor spec: legacy TypeScript references in this file are preserved for comparison and do not point to active runtime files.

## 1. Description & Purpose
`autocomplete.go` provides filtering functionality for slash commands and dynamic rendering of suggestion lists (dropdown menu) displayed above the input bar when a user types `/`.

## 2. TS Counterpart Comparison
* **TS Files:**
  * [SlashCommandMenu.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/SlashCommandMenu.tsx)
  * [DropdownMenu/index.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/components/DropdownMenu/index.tsx)
* **TS Responsibility:** Formats available slash commands based on metadata, computes selection heights, and scrolls matches dynamically if list items exceed maximum height.
* **Go Current State:** Implements simple prefix matching and renders text using lipgloss with a simple index pointer.
* **Functional Gap:** The autocomplete rendering doesn't adjust correctly to small window sizes, and arrow/tab key capture clashes with input cursor manipulation because both systems listen to key strokes globally.

## 3. Specifications for Refactoring

### A. Autocomplete Component State Model
Encapsulate the autocompletion engine into a focused sub-component:

```go
type AutocompleteMenu struct {
	Items       []string // Set of complete command strings (e.g. "/exit - Exit CLI")
	Matches     []string // Subset matching prefix
	SelectedIdx int      // Index of currently selected item
	Visible     bool     // Whether menu should display
	MaxVisible  int      // Maximum rows to render (default: 6)
}
```

### B. Keyboard Actions to Support
When `Visible` is `true`, the parent `ChatInput` delegates key events *first* to the `AutocompleteMenu` before modifying the text buffer:

| Key Press | Autocomplete Action | Result |
| :--- | :--- | :--- |
| `Up Arrow` | Decrement `SelectedIdx` | Move selection highlight up (wrap around to bottom if < 0) |
| `Down Arrow` | Increment `SelectedIdx` | Move selection highlight down (wrap around to top if >= len) |
| `Enter` / `Tab` | Returns `CommandSelectedMsg` | Apply matching command and close menu |
| `Esc` | Clear matches, hide menu | Close menu and return focus to normal typing |

### C. Visual Rendering Specifications
* **Viewport Scrolling:** If `len(Matches) > MaxVisible`, calculate offsets to ensure the selected index stays centered or visible within the viewport window:
  ```go
  startIdx := 0
  if selectedIdx >= maxVisible {
      startIdx = selectedIdx - maxVisible + 1
  }
  ```
* **Dividers:** Split the slash command (`/command`) from its description (`Thoát ANNG`, `Phiên mới`) using a consistent separator ` — ` (em-dash) or ` - ` and apply color styling:
  * Brand Color background for highlighted item.
  * Muted foreground (gray `#888888`) for non-selected item descriptions.
* **Truncation:** Truncate descriptions that exceed the terminal width boundary to prevent row wrapping from breaking the TUI box layout.
* **Arrow Prefix:** Prepend `> ` for the active selection, and spaces `  ` for other items.
