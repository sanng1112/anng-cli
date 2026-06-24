package tui

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"anng-cli/internal/agent"
	"anng-cli/internal/config"
	"anng-cli/internal/contextkeys"
	"anng-cli/internal/skills"
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
	Model         string
	ApiKey        string
	Models        []string
	SettingsPath  string
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
	InputPrompt   string

	// chat/input state
	Buffer    *InputBuffer
	LogBuffer []string
	ShowMenu  bool
	MenuIdx   int
	SlashItems []string
	MenuMatches []string

	// file mentions state
	ShowFileMenu    bool
	FileMatches     []string
	FileMenuIdx     int
	MentionWordStart int

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

	slashItems := []string{
		"/exit    — Thoát ANNG CLI",
		"/new     — Phiên hội thoại mới",
		"/resume  — Tiếp tục phiên cũ",
		"/continue — Tiếp tục phiên hiện tại hoặc chọn phiên cũ",
		"/undo    — Hoàn tác checkpoint",
		"/mcp     — Trạng thái MCP servers",
		"/settings — Cài đặt API, Model",
		"/model   — Chọn model AI",
		"/skills  — Danh sách các kỹ năng hiện có",
		"/init    — Khởi tạo file AGENTS.md",
		"/raw     — Chuyển đổi hiển thị (lite/normal/raw)",
		"/team    — Quản lý đội nhóm agent (team orchestration)",
		"/team-dp — Tự động mở rộng team song song (Data Parallelism)",
		"/team-wf — Chạy luồng công việc với pipeline tuần tự",
		"/custom-agents — Tùy chỉnh danh sách agent",
	}

	loadedSkills := skills.LoadAllSkills(cfg.ProjectRoot, home)
	for _, s := range loadedSkills {
		slashItems = append(slashItems, fmt.Sprintf("/%s — %s", s.Name, s.Description))
	}

	return AppModel{
		CurrentView: ViewChat,
		Buffer:      NewInputBuffer(),
		LogBuffer:   []string{},
		SlashItems:  slashItems,
		Config: AppConfig{
			Version:       cfg.Version,
			ProjectRoot:   cwd,
			InitialPrompt: cfg.InitialPrompt,
			AutoAccept:    cfg.AutoAccept,
			PlanMode:      cfg.PlanMode,
			MaxTurns:      cfg.MaxTurns,
			Model:         cfg.Model,
			ApiKey:        cfg.ApiKey,
			Models:        cfg.Models,
			SettingsPath:  cfg.SettingsPath,
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

type AgentFinishedMsg struct {
	Result *agent.RunResult
	Err    error
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case AgentFinishedMsg:
		m.Busy = false
		if msg.Err != nil {
			m.ErrLine = msg.Err.Error()
		} else if msg.Result != nil {
			m.LogBuffer = append(m.LogBuffer, fmt.Sprintf("Agent: Done in %d turns.", msg.Result.Turns))
		}
		return m, nil

	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height

	case tea.KeyMsg:
		// ── Busy blocking ─────────────────────────────────────────────────
		if m.Busy {
			if msg.Type == tea.KeyCtrlC || msg.Type == tea.KeyCtrlD {
				return m, tea.Quit
			}
			return m, nil
		}

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

		// ── Input view ──────────────────────────────────────────────────────
		if m.CurrentView == ViewInput {
			switch msg.Type {
			case tea.KeyEsc:
				m.CurrentView = ViewChat
				m.Buffer.Clear()
			case tea.KeyEnter:
				text := strings.TrimSpace(m.Buffer.GetText())
				if text != "" {
					if m.InputPrompt == "Add Model:" {
						m.Config.Models = append(m.Config.Models, text)
						m.Sessions = append(m.Config.Models, "+ Add custom model...")
						m.SessionIdx = len(m.Config.Models) - 1
						m.CurrentView = ViewModelSelect
						if m.Config.SettingsPath != "" {
							if cfg, err := config.LoadConfig(m.Config.SettingsPath); err == nil {
								cfg.Models = m.Config.Models
								config.SaveConfig(m.Config.SettingsPath, cfg)
							}
						}
					}
				}
				m.Buffer.Clear()
			case tea.KeyBackspace:
				m.Buffer.Backspace()
			case tea.KeyRunes:
				m.Buffer.Insert(string(msg.Runes))
			case tea.KeySpace:
				m.Buffer.Insert(" ")
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

		// ── Skills List view ──────────────────────────────────────────────
		if m.CurrentView == ViewSkillsList {
			if msg.Type == tea.KeyEsc || msg.Type == tea.KeyEnter {
				m.CurrentView = ViewChat
			}
			return m, nil
		}

		// ── Model-select view ──────────────────────────────────────────────
		if m.CurrentView == ViewModelSelect {
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
				if m.Sessions[m.SessionIdx] == "+ Add custom model..." {
					m.InputPrompt = "Add Model:"
					m.CurrentView = ViewInput
					m.Buffer.Clear()
				} else {
					m.Config.Model = m.Sessions[m.SessionIdx]
					m.LogBuffer = append(m.LogBuffer, fmt.Sprintf("System: Switched model to %s", m.Config.Model))
					m.CurrentView = ViewChat
					if m.Config.SettingsPath != "" {
						if cfg, err := config.LoadConfig(m.Config.SettingsPath); err == nil {
							cfg.Model = m.Config.Model
							config.SaveConfig(m.Config.SettingsPath, cfg)
						}
					}
				}
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
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				selected := strings.SplitN(m.MenuMatches[m.MenuIdx], " ", 2)[0]
				m.Buffer.Clear()
				m.Buffer.Insert(selected)
				m.ShowMenu = false
				m.MenuMatches = nil
				return m, nil
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				selected := m.FileMatches[m.FileMenuIdx]
				cursor := m.Buffer.GetCursor()
				for i := 0; i < cursor - m.MentionWordStart; i++ {
					m.Buffer.Backspace()
				}
				m.Buffer.Insert(selected + " ")
				m.ShowFileMenu = false
				m.FileMatches = nil
				return m, nil
			}

			text := strings.TrimSpace(m.Buffer.GetText())
			m.Buffer.Clear()
			m.ShowMenu = false
			m.ShowFileMenu = false
			m.MenuMatches = nil
			m.FileMatches = nil
			m.MenuIdx = 0
			m.FileMenuIdx = 0

			switch text {
			case "/exit":
				return m, tea.Quit
			case "/new":
				m.LogBuffer = []string{}
				m.ErrLine = ""
			case "/resume":
				m.Sessions = LoadSessions(m.Config.ProjectRoot)
				m.SessionIdx = 0
				m.CurrentView = ViewSessionList
			case "/undo":
				m.CurrentView = ViewUndo
			case "/mcp":
				m.CurrentView = ViewMcpStatus
			case "/settings":
				m.CurrentView = ViewSettings
			case "/model":
				m.CurrentView = ViewModelSelect
				if len(m.Config.Models) == 0 {
					m.Config.Models = []string{"gpt-4o", "claude-3-5-sonnet", "deepseek-chat", "gemini-1.5-pro"}
				}
				m.Sessions = append([]string{}, m.Config.Models...)
				m.Sessions = append(m.Sessions, "+ Add custom model...")
				m.SessionIdx = 0
			case "/skills":
				m.CurrentView = ViewSkillsList
			case "/init":
				m.LogBuffer = append(m.LogBuffer, "System: Please create AGENTS.md or use a skill.")
			case "/continue":
				m.LogBuffer = append(m.LogBuffer, "System: Continuing session...")
			case "/raw":
				m.LogBuffer = append(m.LogBuffer, "System: Toggled raw output mode.")
			case "/team", "/team-dp", "/team-wf", "/custom-agents":
				m.LogBuffer = append(m.LogBuffer, "System: Subagent team features are coming soon.")
			default:
				if text != "" {
					m.LogBuffer = append(m.LogBuffer, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render("> ")+text)
					m.Busy = true
					return m, func() tea.Msg {
						home, _ := os.UserHomeDir()
						expanded := skills.ExpandPrompt(text, m.Config.ProjectRoot, home)
						orch := agent.NewOrchestrator(m.Config.Model, m.Config.ApiKey)
						ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, m.Config.ProjectRoot)
						ctx = context.WithValue(ctx, contextkeys.SessionIDKey, "session-tui")
						res, err := orch.Run(ctx, expanded)
						return AgentFinishedMsg{Result: res, Err: err}
					}
				}
			}

		case tea.KeyBackspace:
			m.Buffer.Backspace()
			m.updateMenu()

		case tea.KeyCtrlW:
			m.Buffer.DeleteWordBefore()
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
				m.Buffer.MoveWordRight()
			} else {
				m.Buffer.MoveRight()
			}

		case tea.KeyHome:
			m.Buffer.SetCursor(0)

		case tea.KeyEnd:
			m.Buffer.SetCursor(len([]rune(m.Buffer.GetText())))

		case tea.KeyUp:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx > 0 {
					m.MenuIdx--
				}
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				if m.FileMenuIdx > 0 {
					m.FileMenuIdx--
				}
			}

		case tea.KeyDown:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				if m.MenuIdx < len(m.MenuMatches)-1 {
					m.MenuIdx++
				}
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				if m.FileMenuIdx < len(m.FileMatches)-1 {
					m.FileMenuIdx++
				}
			}

		case tea.KeyTab:
			if m.ShowMenu && len(m.MenuMatches) > 0 {
				selected := strings.SplitN(m.MenuMatches[m.MenuIdx], " ", 2)[0]
				m.Buffer.Clear()
				m.Buffer.Insert(selected)
				m.ShowMenu = false
				m.MenuMatches = nil
			} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
				selected := m.FileMatches[m.FileMenuIdx]
				cursor := m.Buffer.GetCursor()
				for i := 0; i < cursor - m.MentionWordStart; i++ {
					m.Buffer.Backspace()
				}
				m.Buffer.Insert(selected + " ")
				m.ShowFileMenu = false
				m.FileMatches = nil
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

// updateMenu refreshes slash-command autocomplete state and file mention state.
func (m *AppModel) updateMenu() {
	text := m.Buffer.GetText()
	cursor := m.Buffer.GetCursor()
	
	m.ShowMenu = false
	m.ShowFileMenu = false

	if strings.HasPrefix(text, "/") && cursor <= len([]rune(text)) && !strings.Contains(text[:cursor], " ") {
		matches := FilterAutocomplete(m.SlashItems, text)
		m.MenuMatches = matches
		m.ShowMenu = len(matches) > 0
		if m.MenuIdx >= len(matches) {
			m.MenuIdx = 0
		}
		return
	}

	runes := []rune(text)
	if cursor > 0 && cursor <= len(runes) {
		start := cursor - 1
		for start > 0 && runes[start-1] != ' ' {
			start--
		}
		currentWord := string(runes[start:cursor])
		
		if strings.HasPrefix(currentWord, "@") {
			m.MentionWordStart = start
			query := currentWord[1:]
			matches := GetFileMentions(m.Config.ProjectRoot, query)
			m.FileMatches = matches
			m.ShowFileMenu = len(matches) > 0
			if m.FileMenuIdx >= len(matches) {
				m.FileMenuIdx = 0
			}
		}
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
	case ViewModelSelect:
		return "\n" + RenderModelSelector(m.Sessions, m.SessionIdx)
	case ViewSkillsList:
		var skills []string
		for _, item := range m.SlashItems {
			if !strings.HasPrefix(item, "/") || strings.Contains(item, "Thoát") || strings.Contains(item, "Phiên") || strings.Contains(item, "Hoàn tác") || strings.Contains(item, "Trạng thái") || strings.Contains(item, "Cài đặt") || strings.Contains(item, "Chọn model") || strings.Contains(item, "Danh sách") || strings.Contains(item, "Khởi tạo") || strings.Contains(item, "Chuyển đổi") || strings.Contains(item, "Quản lý đội") || strings.Contains(item, "song song") || strings.Contains(item, "tuần tự") || strings.Contains(item, "Tùy chỉnh") {
				continue
			}
			skills = append(skills, item)
		}
		return "\n" + RenderSkillsList(skills)
	case ViewInput:
		return "\n" + lipgloss.NewStyle().Bold(true).Render(m.InputPrompt) + "\n\n  " + m.Buffer.GetText() + "█\n\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).Render("enter: save  •  esc: cancel")
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
	} else if m.ShowFileMenu && len(m.FileMatches) > 0 {
		sb.WriteString(RenderDropdownMenu(m.FileMatches, m.FileMenuIdx, w))
		sb.WriteString("\n")
	}

	// Input box
	inputWidth := w - 4
	if inputWidth < 20 {
		inputWidth = 20
	}
	textRunes := []rune(m.Buffer.GetText())
	cursorPos := m.Buffer.GetCursor()
	var inputContent string
	if cursorPos >= len(textRunes) {
		inputContent = string(textRunes) + lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(" ")
	} else {
		before := string(textRunes[:cursorPos])
		cursorChar := string(textRunes[cursorPos])
		after := string(textRunes[cursorPos+1:])
		styledCursor := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(cursorChar)
		inputContent = before + styledCursor + after
	}
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

func LoadSessions(projectRoot string) []string {
	var sessions []string
	home, _ := os.UserHomeDir()
	
	projectCode := strings.ReplaceAll(projectRoot, "/", "-")
	projectCode = strings.ReplaceAll(projectCode, "\\", "-")
	projectCode = strings.ReplaceAll(projectCode, ":", "")

	dir := filepath.Join(home, ".anng", "projects", projectCode)
	files, err := os.ReadDir(dir)
	if err != nil {
		return []string{"No sessions found"}
	}
	for _, f := range files {
		if !f.IsDir() && (strings.HasSuffix(f.Name(), ".jsonl") || strings.HasSuffix(f.Name(), ".json")) {
			if f.Name() != "sessions-index.json" {
				sessions = append(sessions, strings.TrimSuffix(f.Name(), filepath.Ext(f.Name())))
			}
		}
	}
	if len(sessions) == 0 {
		return []string{"No sessions found"}
	}
	return sessions
}
