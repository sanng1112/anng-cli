# Specification: `internal/tui/theme.go`

> Historical TUI refactor spec: any TypeScript or `.tsx` references in this file are preserved only as migration-era comparison context.

## 1. Description & Purpose
`theme.go` consolidates stylesheet classes, lipgloss layouts, color tokens, and custom border definitions (`QuadrantBorder`) used to decorate TUI boxes.

## 2. TS Counterpart Comparison
* **TS File:** [ThemedGradient.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/ThemedGradient.tsx)
* **TS Responsibility:** Applies horizontal color gradients to text blocks and formats container margins using chalk tags.
* **Go Current State:** Implements custom `QuadrantBorder` characters and registers a couple of Lipgloss styles.
* **Functional Gap:** Style mappings (e.g. `BrandOrangeColor`) are copy-pasted across files (`app.go`, `views.go`, `theme.go`) instead of referencing a single token, which makes changing theme configurations tedious.

## 3. Specifications for Refactoring

### A. Core Design Tokens (Global Variables)
All visual styles must reside in `theme.go`:

```go
package tui

import "github.com/charmbracelet/lipgloss"

// Color Palette
const (
	ColorBrandOrange = "#D4704B" // Main identity color
	ColorDarkOrange  = "#A65030" // Shadow borders
	ColorMutedGray   = "#888888" // Secondary texts
	ColorGreen       = "#22c55e" // Success indicators
	ColorAmber       = "#f59e0b" // Warning scopes
	ColorRed         = "#ef4444" // Danger scopes
)

// Shared Lipgloss Styles
var (
	StyleTitle = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorBrandOrange)).
			Bold(true)

	StyleInput = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(ColorBrandOrange)).
			Padding(0, 1)

	StyleHelp = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorMutedGray))

	StyleError = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorRed))

	StyleStatus = lipgloss.NewStyle().
			Foreground(lipgloss.Color(ColorAmber))
)
```

### B. Truecolor Support & Fallbacks
Include check helper functions to gracefully fallback from Truecolor HEX strings to standard ANSI 16-color profiles if the user's terminal client does not support Truecolor rendering.
