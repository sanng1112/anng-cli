# Specification: `internal/tui/mascot.go`

> Historical TUI refactor spec: any references to legacy UI assets or `.tsx` files are comparison artifacts from the pre-Go UI.

## 1. Description & Purpose
`mascot.go` prints the CLI visual identity: a colored ASCII fox art alongside the stylized logo banner `ANNG`.

## 2. TS Counterpart Comparison
* **TS File:** [ascii-art.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/ascii-art.tsx)
* **TS Responsibility:** Generates visual layout of logo elements, fits them on narrow terminals, and tints them with colored gradient themes.
* **Go Current State:** Implements custom `FoxMap` parser mapping upper/lower rows using terminal blocks `█`, `▀`, `▄` to save height, and prints the ANNG logo.
* **Functional Gap:** Art can wrap incorrectly and corrupt screen layout on thin window dimensions.

## 3. Specifications for Refactoring

### A. Layout Responsiveness
* If terminal `Width < 80`, hide the fox ASCII art completely and render only the simplified "ANNG" text logo to save horizontal column real estate.
* If terminal `Width >= 80`, side-by-side alignment of Fox Art (left) and Text Logo (right) is used.

### B. Accurate Double-Row Block Mapping
* Keep the dual-line mapping using half-height blocks (`▀` top half, `▄` bottom half, `█` full block, ` ` space) to compress a 18-row FoxMap into 9 text rows:
  ```go
  // upperRow character = 'O', lowerRow character = '.'
  // Render: '▀' colored in Orange (foreground), transparent background.
  ```

### C. Color Consistency
* Synchronize brand colors with theme files:
  * Brand Color: Orange `#D4704B`
  * Shading: Dark Orange `#A65030`
  * Body: White `#FFFFFF`, Black `#000000`
