# Specification: `internal/tui/welcome.go`

> Historical TUI refactor spec: references to the legacy TypeScript welcome screen are archival comparison notes from the migration period.

## 1. Description & Purpose
`welcome.go` renders the welcome card presented when the CLI launches with an empty context logs buffer. It shows current settings (Model, Workspace, Version) and displays tips.

## 2. TS Counterpart Comparison
* **TS File:** [WelcomeScreen.tsx](file:///run/media/sanng/New%20Volume/Seminar/Anng_cli/src/ui/views/WelcomeScreen.tsx)
* **TS Responsibility:** Formats path relative to home (`~/`), displays brand borders, and rotates tips on each render.
* **Go Current State:** Implements `RenderWelcomeScreen` and `FormatHomeRelativePath`.
* **Functional Gap:** Tips only select randomly on layout renders but don't persist accurately or rotate interactively.

## 3. Specifications for Refactoring

### A. Dynamic Context Formatting
* **Workspace Resolution:** Ensure that path cleaning checks environment structures correctly, printing `~/workspace/path` instead of long absolute paths.
* **Model Config Indicators:** Display AI provider model selection dynamically along with reasoning effort metadata details:
  ```
  Model:            deepseek-reasoner
  Thinking Enabled: true
  Reasoning Effort: high
  ```

### B. Interactive Tips Rotation
* Maintain tip display strings inside a static array.
* Rotate tip selection automatically when a user opens a new session.
