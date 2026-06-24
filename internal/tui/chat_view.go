package tui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type ChatViewModel struct {
	Buffer      *InputBuffer
	LogBuffer   []string
	SlashItems  []string
	ShowMenu    bool
	MenuIdx     int
	MenuMatches []string
	
	ShowFileMenu     bool
	FileMatches      []string
	FileMenuIdx      int
	MentionWordStart int
	
	Busy    bool
	ErrLine string
	Config  AppConfig
	Width   int
	Height  int

	ScrollOffset int
	SpinnerFrame int
}

type TriggerViewMsg struct {
	View TuiView
	Mode string
}

type ExecutePromptMsg struct {
	Prompt string
}

type NewSessionMsg struct{}

type SpinnerTickMsg struct{}

func spinnerTick() tea.Cmd {
	return tea.Tick(time.Millisecond*150, func(t time.Time) tea.Msg {
		return SpinnerTickMsg{}
	})
}

func NewChatViewModel(cfg AppConfig, slashItems []string) ChatViewModel {
	buf := NewInputBuffer()
	if cfg.InitialPrompt != "" {
		buf.Insert(cfg.InitialPrompt)
	}
	return ChatViewModel{
		Buffer:     buf,
		LogBuffer:  []string{},
		SlashItems: slashItems,
		Config:     cfg,
	}
}

func (m ChatViewModel) Update(msg tea.Msg) (ChatViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case SpinnerTickMsg:
		if m.Busy {
			m.SpinnerFrame++
			return m, spinnerTick()
		}
		return m, nil

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			if m.ShowMenu {
				m.ShowMenu = false
				m.MenuMatches = nil
				m.MenuIdx = 0
			} else {
				m.Buffer.Clear()
			}
		case tea.KeyCtrlJ:
			m.Buffer.Insert("\n")
		case tea.KeyPgUp:
			m.ScrollOffset += 5
			maxLog := m.Height - 8
			if m.ScrollOffset > len(m.LogBuffer)-maxLog {
				m.ScrollOffset = len(m.LogBuffer) - maxLog
			}
			if m.ScrollOffset < 0 {
				m.ScrollOffset = 0
			}
		case tea.KeyPgDown:
			m.ScrollOffset -= 5
			if m.ScrollOffset < 0 {
				m.ScrollOffset = 0
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
				for i := 0; i < cursor-m.MentionWordStart; i++ {
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

			if text != "" {
				if strings.HasPrefix(text, "/") {
					// Handle TUI navigation triggers
					switch text {
					case "/exit":
						return m, tea.Quit
					case "/new":
						m.LogBuffer = []string{}
						m.ErrLine = ""
						return m, func() tea.Msg { return NewSessionMsg{} }
					case "/resume":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewSessionList} }
					case "/undo":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewUndo} }
					case "/mcp":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewMcpStatus} }
					case "/settings":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewSettings} }
					case "/model":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewModelSelect} }
					case "/skills":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewSkillsList} }
					case "/team":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewTeam, Mode: "team"} }
					case "/team-dp":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewTeam, Mode: "team-dp"} }
					case "/team-wf":
						return m, func() tea.Msg { return TriggerViewMsg{View: ViewTeam, Mode: "team-wf"} }
					default:
						m.LogBuffer = append(m.LogBuffer, "System: Unrecognized command "+text)
					}
				} else {
					m.LogBuffer = append(m.LogBuffer, lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Render("> ")+text)
					
					// Print request summary to TUI log for user diagnostics
					targetURL := m.Config.BaseURL
					if targetURL == "" {
						targetURL = "https://api.openai.com/v1"
					}
					m.LogBuffer = append(m.LogBuffer, fmt.Sprintf("System [Request]: Model=%s, Endpoint=%s", m.Config.Model, targetURL))
					
					m.Busy = true
					m.ScrollOffset = 0 // Auto-scroll to bottom on submit
					
					return m, tea.Batch(
						func() tea.Msg {
							return ExecutePromptMsg{Prompt: text}
						},
						spinnerTick(),
					)
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
				for i := 0; i < cursor-m.MentionWordStart; i++ {
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

func (m *ChatViewModel) updateMenu() {
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

func (m ChatViewModel) View() string {
	w := m.Width
	if w <= 0 {
		w = 80
	}
	h := m.Height
	if h <= 0 {
		h = 24
	}

	var sb strings.Builder

	// Permanent small header at the top of the chat view
	headerStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Bold(true)
	titleLine := headerStyle.Render("ANNG CLI (v" + m.Config.Version + ")") + " • Model: " + m.Config.Model
	if m.Config.BaseURL != "" {
		titleLine += " • Endpoint: " + m.Config.BaseURL
	}
	sb.WriteString(titleLine + "\n")
	sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#444444")).Render(strings.Repeat("─", w)) + "\n\n")

	// Welcome screen on first render (no log yet)
	if len(m.LogBuffer) == 0 {
		sb.WriteString(RenderWelcomeScreen(WelcomeConfig{
			ProjectRoot:     m.Config.ProjectRoot,
			Model:           m.Config.Model,
			ThinkingEnabled: false,
			ReasoningEffort: "-",
			Version:         m.Config.Version,
			ShowMascot:      h >= 28,
		}, w))
		sb.WriteString("\n\n")
	} else {
		// Scrollback chat log with offset paging
		maxLog := h - 10 // Adjusted for header lines
		if maxLog < 1 {
			maxLog = 1
		}
		endIdx := len(m.LogBuffer) - m.ScrollOffset
		if endIdx < 0 {
			endIdx = 0
		}
		startIdx := endIdx - maxLog
		if startIdx < 0 {
			startIdx = 0
		}
		logs := m.LogBuffer[startIdx:endIdx]
		for _, line := range logs {
			sb.WriteString(line)
			sb.WriteString("\n")
		}
	}

	// Errors
	if m.ErrLine != "" {
		sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#ef4444")).Render("Error: "+m.ErrLine) + "\n")
	}

	// Status (busy) with animated spinner
	if m.Busy {
		spinnerFrames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
		spinnerChar := spinnerFrames[m.SpinnerFrame%len(spinnerFrames)]
		sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Render(spinnerChar+" Thinking...") + "\n")
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
	styledInput := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(BrandOrangeColor)).
		Padding(0, 1).Width(inputWidth).Render(inputContent)
	sb.WriteString(styledInput)
	sb.WriteString("\n")

	// Help bar
	modeTag := ""
	if m.Config.PlanMode {
		modeTag = lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Render(" [plan]")
	} else if m.Config.AutoAccept {
		modeTag = lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e")).Render(" [auto]")
	}
	helpLine := lipgloss.NewStyle().Foreground(lipgloss.Color("#888888")).MarginTop(1).Render("enter: send  •  tab: complete  •  esc: clear  •  /: commands  •  ctrl+c: quit")
	sb.WriteString(fmt.Sprintf("%s%s\n", helpLine, modeTag))

	// Active skills
	if len(m.Config.ActiveSkills) > 0 {
		var skillTags []string
		for _, sk := range m.Config.ActiveSkills {
			skillTags = append(skillTags, fmt.Sprintf("[%s]", sk))
		}
		activeSkillsLine := lipgloss.NewStyle().Foreground(lipgloss.Color("#f59e0b")).Render("Active Skills: " + strings.Join(skillTags, " "))
		sb.WriteString(activeSkillsLine + "\n")
	}

	return sb.String()
}
