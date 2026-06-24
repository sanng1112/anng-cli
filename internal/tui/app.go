package tui

import (
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const BrandColor = "#D4704B"

var (
	titleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color(BrandColor)).
			Bold(true).
			MarginBottom(1)

	inputStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(BrandColor)).
			Padding(0, 1)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#888888")).
			MarginTop(1)

	errorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ef4444"))

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#f59e0b"))
)

// AppConfig holds startup configuration passed from main.
type AppConfig struct {
	Version       string
	ProjectRoot   string
	InitialPrompt string
	AutoAccept    bool
	PlanMode      bool
	MaxTurns      int
}

// AppModel is the root Bubble Tea model that drives the entire TUI.
type AppModel struct {
	// layout
	Width  int
	Height int

	// view routing
	CurrentView   TuiView
	Sessions      []string
	SessionIdx    int
	Checkpoints   []string
	CheckpointIdx int

	// chat/input state
	Buffer    *InputBuffer
	LogBuffer []string
	ShowMenu  bool
	MenuIdx   int
	SlashItems []string
	MenuMatches []string

	// permission prompt
	PendingPermission *PermissionRequest
	PermCursor        int

	// process stdout overlay
	ShowStdout    bool
	StdoutBuf     string
	StdoutCommand string

	// app state
	Config  AppConfig
	Busy    bool
	ErrLine string
}

func InitialModelWithConfig(cfg AppConfig) AppModel {
	home, _ := os.UserHomeDir()
	cwd := FormatHomeRelativePath(cfg.ProjectRoot, home)
	if cwd == "" {
		cwd = cfg.ProjectRoot
	}

	return AppModel{
		CurrentView: ViewChat,
		Buffer:      NewInputBuffer(),
		LogBuffer:   []string{},
		SlashItems: []string{
			"/exit    — Thoát",
			"/new     — Phiên hội thoại mới",
			"/resume  — Tiếp tục phiên cũ",
			"/undo    — Hoàn tác checkpoint",
			"/mcp     — Trạng thái MCP servers",
			"/settings — Cài đặt",
			"/model   — Chọn model AI",
		},
		Config: AppConfig{
			Version:       cfg.Version,
			ProjectRoot:   cwd,
			InitialPrompt: cfg.InitialPrompt,
			AutoAccept:    cfg.AutoAccept,
			PlanMode:      cfg.PlanMode,
			MaxTurns:      cfg.MaxTurns,
		},
	}
}

// InitialModel creates a default model for backwards compatibility with tests.
func InitialModel() AppModel {
	return InitialModelWithConfig(AppConfig{Version: "0.2.000"})
}

func (m AppModel) Init() tea.Cmd {
	return nil
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height

	case tea.KeyMsg:
		// ── Permission overlay ─────────────────────────────────────────────
		if m.PendingPermission != nil {
			switch msg.Type {
			case tea.KeyEsc:
				m.PendingPermission = nil
			case tea.KeyUp:
				if m.PermCursor > 0 {
					m.PermCursor--
				}
			case tea.KeyDown:
				if m.PermCursor < 2 {
					m.PermCursor++
				}
			case tea.KeyEnter:
				// 0=Allow, 1=AlwaysAllow, 2=Deny
				m.PendingPermission = nil
				m.PermCursor = 0
			}
			return m, nil
		}

		// ── Session-list view ──────────────────────────────────────────────
		if m.CurrentView == ViewSessionList {
			switch msg.Type {
			case tea.KeyEsc:
				m.CurrentView = ViewChat
			case tea.KeyUp:
				if m.SessionIdx > 0 {
					m.SessionIdx--
				}
			case tea.KeyDown:
				if m.SessionIdx < len(m.Sessions)-1 {
					m.SessionIdx++
				}
			case tea.KeyEnter:
				m.CurrentView = ViewChat
			}
			return m, nil
		}

		// ── Undo view ──────────────────────────────────────────────────────
		if m.CurrentView == ViewUndo {
			switch msg.Type {
			case tea.KeyEsc:
				m.CurrentView = ViewChat
			case tea.KeyUp:
				if m.CheckpointIdx > 0 {
					m.CheckpointIdx--
				}
			case tea.KeyDown:
				if m.CheckpointIdx < len(m.Checkpoints)-1 {
					m.CheckpointIdx++
				}
			case tea.KeyEnter:
				m.CurrentView = ViewChat
			}
			return m, nil
		}

		// ── MCP / Settings views ───────────────────────────────────────────
		if m.CurrentView == ViewMcpStatus || m.CurrentView == ViewSettings {
			if msg.Type == tea.KeyEsc {
				m.CurrentView = ViewChat
			}
			return m, nil
		}

		// ── Chat / input view ──────────────────────────────────────────────
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyCtrlD:
			return m, tea.Quit

		case tea.KeyEsc:
			if m.ShowMenu {
				m.ShowMenu = false
				m.MenuMatches = nil
				m.MenuIdx = 0
			} else {
				m.Buffer.Clear()
			}

		case tea.KeyEnter:
			text := strings.TrimSpace(m.Buffer.GetText())
			m.Buffer.Clear()
			m.ShowMenu = false
			m.MenuMatches = nil
			m.MenuIdx = 0

			switch text {
			case "/exit":
				return m, tea.Quit
			case "/new":
				m.LogBuffer = []string{}
				m.ErrLine = ""
			case "/resume":
				m.CurrentView = ViewSessionList
			case "/undo":
				m.CurrentView = ViewUndo
			case "/mcp":
				m.CurrentView = ViewMcpStatus
			case "/settings":
				m.CurrentView = ViewSettings
			default:
				if text != "" {
					m.LogBuffer = append(m.LogBuffer, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render("> ")+text)
				}
			}

		case tea.KeyBackspace:
			m.Buffer.Backspace()
			m.updateMenu()

		case tea.KeyDelete:
			m.Buffer.Delete()

		case tea.KeyLeft:
			if msg.Alt {
				m.Buffer.MoveWordLeft()
			} else {
				m.Buffer.MoveLeft()
			}

		case tea.KeyRight:
			if msg.Alt {
				// MoveWordRight not yet impl, skip
			} else {
				m.Buffer.MoveRight()
			}

		case tea.KeyUp:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx > 0 {
					m.MenuIdx--
				}
			}

		case tea.KeyDown:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx < len(m.MenuMatches)-1 {
					m.MenuIdx++
				}
			}

		case tea.KeyTab:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				selected := strings.SplitN(m.MenuMatches[m.MenuIdx], " ", 2)[0]
				m.Buffer.Clear()
				m.Buffer.Insert(selected)
				m.ShowMenu = false
				m.MenuMatches = nil
			}

		case tea.KeyRunes:
			m.Buffer.Insert(string(msg.Runes))
			m.updateMenu()

		case tea.KeySpace:
			m.Buffer.Insert(" ")
			m.updateMenu()
		}
	}

	return m, nil
}

// updateMenu refreshes slash-command autocomplete state.
func (m *AppModel) updateMenu() {
	text := m.Buffer.GetText()
	if strings.HasPrefix(text, "/") {
		matches := FilterAutocomplete(m.SlashItems, text)
		m.MenuMatches = matches
		m.ShowMenu = len(matches) > 0
		if m.MenuIdx >= len(matches) {
			m.MenuIdx = 0
		}
	} else {
		m.ShowMenu = false
		m.MenuMatches = nil
		m.MenuIdx = 0
	}
}

func (m AppModel) View() string {
	w := m.Width
	if w <= 0 {
		w = 80
	}
	h := m.Height
	if h <= 0 {
		h = 24
	}

	// ── Sub-views ──────────────────────────────────────────────────────────
	if m.PendingPermission != nil {
		return "\n" + RenderPermissionPrompt(*m.PendingPermission, m.PermCursor)
	}

	switch m.CurrentView {
	case ViewSessionList:
		return "\n" + RenderSessionList(m.Sessions, m.SessionIdx)
	case ViewUndo:
		return "\n" + RenderUndoSelector(m.Checkpoints, m.CheckpointIdx)
	case ViewMcpStatus:
		return "\n" + RenderMcpStatus(
			[]string{"filesystem", "google-search"},
			map[string]string{"filesystem": "connected", "google-search": "connected"},
		)
	case ViewSettings:
		return "\n" + renderSettings(m.Config)
	}

	if m.ShowStdout {
		return "\n" + RenderProcessStdoutView(m.StdoutCommand, m.StdoutBuf, 120, h)
	}

	// ── Chat view ──────────────────────────────────────────────────────────
	var sb strings.Builder

	// Welcome screen on first render (no log yet)
	if len(m.LogBuffer) == 0 {
		sb.WriteString(RenderWelcomeScreen(WelcomeConfig{
			ProjectRoot:     m.Config.ProjectRoot,
			Model:           "deepseek-v3 (default)",
			ThinkingEnabled: false,
			ReasoningEffort: "-",
			Version:         m.Config.Version,
		}, w))
		sb.WriteString("\n\n")
	} else {
		// Scrollback chat log
		maxLog := h - 8
		if maxLog < 1 {
			maxLog = 1
		}
		logs := m.LogBuffer
		if len(logs) > maxLog {
			logs = logs[len(logs)-maxLog:]
		}
		for _, line := range logs {
			sb.WriteString(line)
			sb.WriteString("\n")
		}
	}

	// Errors
	if m.ErrLine != "" {
		sb.WriteString(errorStyle.Render("Error: "+m.ErrLine) + "\n")
	}

	// Status (busy)
	if m.Busy {
		sb.WriteString(statusStyle.Render("⠋ Thinking...") + "\n")
	}

	// Autocomplete dropdown (above input)
	if m.ShowMenu && len(m.MenuMatches) > 0 {
		sb.WriteString(RenderDropdownMenu(m.MenuMatches, m.MenuIdx, w))
		sb.WriteString("\n")
	}

	// Input box
	inputWidth := w - 4
	if inputWidth < 20 {
		inputWidth = 20
	}
	inputContent := m.Buffer.GetText() + "█"
	styledInput := inputStyle.Width(inputWidth).Render(inputContent)
	sb.WriteString(styledInput)
	sb.WriteString("\n")

	// Help bar
	modeTag := ""
	if m.Config.PlanMode {
		modeTag = statusStyle.Render(" [plan]")
	} else if m.Config.AutoAccept {
		modeTag = lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e")).Render(" [auto]")
	}
	helpLine := helpStyle.Render("enter: send  •  tab: complete  •  esc: clear  •  /: commands  •  ctrl+c: quit")
	sb.WriteString(fmt.Sprintf("%s%s\n", helpLine, modeTag))

	return sb.String()
}

// renderSettings shows a simple settings view.
func renderSettings(cfg AppConfig) string {
	var lines []string
	border := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Padding(1, 2)

	lines = append(lines, titleStyle.Render("Settings"))
	lines = append(lines, "")
	lines = append(lines, fmt.Sprintf("  Version:      %s", cfg.Version))
	lines = append(lines, fmt.Sprintf("  Project root: %s", cfg.ProjectRoot))
	lines = append(lines, fmt.Sprintf("  Auto-accept:  %v", cfg.AutoAccept))
	lines = append(lines, fmt.Sprintf("  Plan mode:    %v", cfg.PlanMode))
	lines = append(lines, fmt.Sprintf("  Max turns:    %d", cfg.MaxTurns))
	lines = append(lines, "")
	lines = append(lines, helpStyle.Render("esc: back to chat"))

	return border.Render(strings.Join(lines, "\n"))
}
