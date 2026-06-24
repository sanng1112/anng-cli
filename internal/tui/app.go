package tui

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"anng-cli/internal/agent"
	"anng-cli/internal/contextkeys"
	"anng-cli/internal/skills"
	"anng-cli/internal/tools"
	tea "github.com/charmbracelet/bubbletea"
)

var ProgramInstance *tea.Program

type ProcessOutputMsg struct {
	Command string
	Output  string
}

func init() {
	tools.BashOutputCallback = func(command string, output string) {
		if ProgramInstance != nil {
			ProgramInstance.Send(ProcessOutputMsg{Command: command, Output: output})
		}
	}
}

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
	BaseURL       string
	Models        []string
	SettingsPath  string
	ActiveSkills  []string
}

type AppModel struct {
	Width  int
	Height int

	CurrentView TuiView
	
	ChatView        ChatViewModel
	SettingsView    SettingsViewModel
	SessionListView SessionListModel
	UndoView        UndoSelectorModel
	ModelSelectView ModelSelectModel
	SkillsListView  SkillsListModel
	McpStatusView   McpStatusModel
	PermissionView  PermissionPromptModel
	TeamView        TeamViewModel
	
	Config            AppConfig
	PendingPermission *PermissionRequest
	ShowStdout        bool
	StdoutBuf         string
	StdoutCommand     string
	Busy              bool
	ErrLine           string
	ActiveCancel      context.CancelFunc
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

	loadedSkills := skills.LoadAllSkills(cwd, home)
	for _, s := range loadedSkills {
		slashItems = append(slashItems, fmt.Sprintf("/%s — %s", s.Name, s.Description))
	}

	chatVM := NewChatViewModel(cfg, slashItems)

	return AppModel{
		CurrentView: ViewChat,
		ChatView:    chatVM,
		Config:      cfg,
	}
}

func InitialModel() AppModel {
	return InitialModelWithConfig(AppConfig{Version: "0.2.0"})
}

func (m AppModel) Init() tea.Cmd {
	return nil
}

type AgentFinishedMsg struct {
	Result interface{}
	Err    error
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case ProcessOutputMsg:
		m.ShowStdout = true
		m.StdoutCommand = msg.Command
		m.StdoutBuf += msg.Output
		return m, nil

	case SpinnerTickMsg:
		var cmd tea.Cmd
		m.ChatView, cmd = m.ChatView.Update(msg)
		return m, cmd

	case tea.KeyMsg:
		// Capture Esc to close stdout overlay screen
		if m.ShowStdout {
			if msg.Type == tea.KeyEsc {
				m.ShowStdout = false
				m.StdoutBuf = ""
			}
			return m, nil
		}

		if msg.Type == tea.KeyCtrlC || msg.Type == tea.KeyCtrlD {
			if m.ActiveCancel != nil {
				m.ActiveCancel()
			}
			return m, tea.Quit
		}

		if m.Busy {
			if msg.Type == tea.KeyEsc {
				if m.ActiveCancel != nil {
					m.ActiveCancel()
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, "System: User interrupted execution.")
				}
			}
			return m, nil
		}
	case tea.WindowSizeMsg:
		m.Width = msg.Width
		m.Height = msg.Height
		m.ChatView.Width = msg.Width
		m.ChatView.Height = msg.Height
		m.TeamView.Width = msg.Width
		m.TeamView.Height = msg.Height
		return m, nil
	case ExecutePromptMsg:
		m.Busy = true
		m.ChatView.Busy = true
		m.ErrLine = ""
		m.ChatView.ErrLine = ""
		
		var ctx context.Context
		ctx, m.ActiveCancel = context.WithCancel(context.Background())

		return m, tea.Batch(
			func() tea.Msg {
				home, _ := os.UserHomeDir()
				expanded := skills.ExpandPromptWithActiveSkills(msg.Prompt, m.Config.ActiveSkills, m.Config.ProjectRoot, home)
				
				mode := "act"
				if m.Config.PlanMode {
					mode = "plan"
				} else if m.Config.AutoAccept {
					mode = "yolo"
				}
				orch := agent.NewOrchestrator(m.Config.Model, m.Config.ApiKey, mode)
				orch.BaseURL = m.Config.BaseURL
				orch.ProjectRoot = m.Config.ProjectRoot

				ctx = context.WithValue(ctx, contextkeys.ProjectRootKey, m.Config.ProjectRoot)
				ctx = context.WithValue(ctx, contextkeys.SessionIDKey, "session-tui")

				res, err := orch.Run(ctx, expanded)
				return AgentFinishedMsg{Result: res, Err: err}
			},
			spinnerTick(),
		)
	case AgentFinishedMsg:
		m.Busy = false
		m.ChatView.Busy = false
		m.ActiveCancel = nil
		if msg.Err != nil {
			m.ErrLine = msg.Err.Error()
			m.ChatView.ErrLine = msg.Err.Error()
		} else if msg.Result != nil {
			if runRes, ok := msg.Result.(*agent.RunResult); ok {
				if runRes.Response != "" {
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, runRes.Response)
				}
				if runRes.Turns > 0 {
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, fmt.Sprintf("Agent: Done in %d turns. Tokens: %d input, %d output (%d total).", runRes.Turns, runRes.PromptTokens, runRes.CompletionTokens, runRes.TotalTokens))
				} else {
					m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, runRes.FinishReason)
				}
			}
		}
		return m, nil
	}

	if m.PendingPermission != nil {
		var cmd tea.Cmd
		m.PermissionView, cmd = m.PermissionView.Update(msg)
		if dec, ok := msg.(PermissionDecisionMsg); ok {
			m.PendingPermission = nil
			_ = dec
		}
		return m, cmd
	}

	switch m.CurrentView {
	case ViewChat:
		var cmd tea.Cmd
		m.ChatView, cmd = m.ChatView.Update(msg)
		if trigger, ok := msg.(TriggerViewMsg); ok {
			m.CurrentView = trigger.View
			switch trigger.View {
			case ViewSessionList:
				m.SessionListView = NewSessionListModel(m.Config.ProjectRoot)
			case ViewUndo:
				commits := LoadGitCheckpoints(m.Config.ProjectRoot)
				m.UndoView = NewUndoSelectorModel(commits)
			case ViewSettings:
				m.SettingsView = NewSettingsViewModel(m.Config)
			case ViewModelSelect:
				m.ModelSelectView = NewModelSelectModel(m.Config.Models, m.Config.Model)
			case ViewSkillsList:
				home, _ := os.UserHomeDir()
				loaded := skills.LoadAllSkills(m.Config.ProjectRoot, home)
				var names []string
				for _, s := range loaded {
					names = append(names, s.Name)
				}
				m.SkillsListView = NewSkillsListModel(names, m.Config.ActiveSkills)
			case ViewMcpStatus:
				m.McpStatusView = NewMcpStatusModel(
					[]string{"filesystem", "google-search"},
					map[string]string{"filesystem": "connected", "google-search": "connected"},
				)
			case ViewTeam:
				m.TeamView = NewTeamViewModel(trigger.Mode)
				m.TeamView.Width = m.Width
				m.TeamView.Height = m.Height
			}
		}
		return m, cmd

	case ViewSessionList:
		var cmd tea.Cmd
		m.SessionListView, cmd = m.SessionListView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if res, ok := msg.(ResumeSessionMsg); ok {
			m.CurrentView = ViewChat
			if logs, err := LoadSessionContent(m.Config.ProjectRoot, res.SessionName); err == nil {
				m.ChatView.LogBuffer = logs
			} else {
				m.ChatView.LogBuffer = append(m.ChatView.LogBuffer, "System: Loaded session "+res.SessionName)
			}
		}
		return m, cmd

	case ViewUndo:
		var cmd tea.Cmd
		m.UndoView, cmd = m.UndoView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if restore, ok := msg.(RestoreCheckpointMsg); ok {
			m.CurrentView = ViewChat
			parts := strings.Split(restore.Checkpoint, " ")
			commitHash := parts[0]
			if strings.HasPrefix(commitHash, "[Target]") && len(parts) > 1 {
				commitHash = parts[1]
			}
			
			m.Busy = true
			m.ChatView.Busy = true
			return m, tea.Batch(
				func() tea.Msg {
					cmd := exec.Command("git", "reset", "--hard", commitHash)
					cmd.Dir = m.Config.ProjectRoot
					output, err := cmd.CombinedOutput()
					if err != nil {
						return AgentFinishedMsg{Err: fmt.Errorf("failed to restore checkpoint: %s, error: %w", string(output), err)}
					}
					return AgentFinishedMsg{Result: &agent.RunResult{FinishReason: "System: Restored git checkpoint " + commitHash, Turns: 0}}
				},
				spinnerTick(),
			)
		}
		return m, cmd

	case ViewSettings:
		var cmd tea.Cmd
		m.SettingsView, cmd = m.SettingsView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
			m.Config = m.SettingsView.Config
			m.ChatView.Config = m.SettingsView.Config
		}
		return m, cmd

	case ViewModelSelect:
		var cmd tea.Cmd
		m.ModelSelectView, cmd = m.ModelSelectView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if sw, ok := msg.(SwitchModelMsg); ok {
			m.Config.Model = sw.Model
			m.ChatView.Config.Model = sw.Model
			m.CurrentView = ViewChat
		} else if _, ok := msg.(AddCustomModelMsg); ok {
			m.CurrentView = ViewInput
			m.ChatView.Buffer.Clear()
		}
		return m, cmd

	case ViewSkillsList:
		var cmd tea.Cmd
		m.SkillsListView, cmd = m.SkillsListView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		} else if skMsg, ok := msg.(UpdateActiveSkillsMsg); ok {
			m.Config.ActiveSkills = skMsg.ActiveSkills
			m.ChatView.Config.ActiveSkills = skMsg.ActiveSkills
			m.CurrentView = ViewChat
		}
		return m, cmd

	case ViewMcpStatus:
		var cmd tea.Cmd
		m.McpStatusView, cmd = m.McpStatusView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		}
		return m, cmd

	case ViewTeam:
		var cmd tea.Cmd
		m.TeamView, cmd = m.TeamView.Update(msg)
		if _, ok := msg.(BackToChatMsg); ok {
			m.CurrentView = ViewChat
		}
		return m, cmd
	}

	return m, nil
}

func (m AppModel) View() string {
	if m.PendingPermission != nil {
		return m.PermissionView.View()
	}

	switch m.CurrentView {
	case ViewChat:
		return m.ChatView.View()
	case ViewSessionList:
		return m.SessionListView.View()
	case ViewUndo:
		return m.UndoView.View()
	case ViewSettings:
		return m.SettingsView.View()
	case ViewModelSelect:
		return m.ModelSelectView.View()
	case ViewSkillsList:
		return m.SkillsListView.View()
	case ViewMcpStatus:
		return m.McpStatusView.View()
	case ViewTeam:
		return m.TeamView.View()
	default:
		return m.ChatView.View()
	}
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

func LoadSessionContent(projectRoot string, sessionName string) ([]string, error) {
	home, _ := os.UserHomeDir()
	projectCode := strings.ReplaceAll(projectRoot, "/", "-")
	projectCode = strings.ReplaceAll(projectCode, "\\", "-")
	projectCode = strings.ReplaceAll(projectCode, ":", "")

	dir := filepath.Join(home, ".anng", "projects", projectCode)
	
	// Try JSON first
	jsonPath := filepath.Join(dir, sessionName+".json")
	data, err := os.ReadFile(jsonPath)
	if err == nil {
		var sess struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.Unmarshal(data, &sess); err == nil {
			var logs []string
			for _, m := range sess.Messages {
				if m.Role == "user" {
					logs = append(logs, "> " + m.Content)
				} else {
					logs = append(logs, m.Content)
				}
			}
			return logs, nil
		}
	}

	// Fallback to JSONL
	jsonlPath := filepath.Join(dir, sessionName+".jsonl")
	data, err = os.ReadFile(jsonlPath)
	if err == nil {
		var logs []string
		lines := strings.Split(string(data), "\n")
		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			var m struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			}
			if err := json.Unmarshal([]byte(line), &m); err == nil {
				if m.Role == "user" {
					logs = append(logs, "> " + m.Content)
				} else {
					logs = append(logs, m.Content)
				}
			}
		}
		return logs, nil
	}

	return nil, fmt.Errorf("session not found")
}

func LoadGitCheckpoints(projectRoot string) []string {
	cmd := exec.Command("git", "log", "-n", "10", "--oneline")
	cmd.Dir = projectRoot
	output, err := cmd.Output()
	if err != nil {
		return []string{"No git checkpoints found"}
	}
	lines := strings.Split(string(output), "\n")
	var checkpoints []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			checkpoints = append(checkpoints, trimmed)
		}
	}
	if len(checkpoints) == 0 {
		return []string{"No git checkpoints found"}
	}
	return checkpoints
}
