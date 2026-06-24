package tui

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"anng-cli/internal/config"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type SettingsViewModel struct {
	Step      string // "main", "models", "apiKeyInput", "baseURLInput", "modelInput"
	Scope     string // "project", "user"
	CursorIdx int
	Items     []DropdownItem
	
	Dropdown DropdownMenuModel
	Input    *InputBuffer
	Config   AppConfig
}

func maskKey(key string) string {
	if key == "" {
		return "Not Configured"
	}
	if len(key) <= 8 {
		return "********"
	}
	return key[:4] + "..." + key[len(key)-4:]
}

func getBaseURLDesc(url string) string {
	if url == "" {
		return "Default OpenAI API endpoint"
	}
	return url
}

func (m *SettingsViewModel) updateMainItems() {
	scopeLabel := "Settings Scope: Project-Specific"
	if m.Scope == "user" {
		scopeLabel = "Settings Scope: Global (User)"
	}

	m.Items = []DropdownItem{
		{Key: "scope", Label: scopeLabel, Description: "Toggle global vs project"},
		{Key: "model", Label: "Active AI Model", Description: m.Config.Model},
		{Key: "apiKey", Label: "API Key", Description: maskKey(m.Config.ApiKey)},
		{Key: "baseURL", Label: "Base URL", Description: getBaseURLDesc(m.Config.BaseURL)},
		{Key: "auto_accept", Label: fmt.Sprintf("Auto-Accept: %v", m.Config.AutoAccept), Description: "Press enter to toggle"},
		{Key: "plan_mode", Label: fmt.Sprintf("Plan Mode: %v", m.Config.PlanMode), Description: "Press enter to toggle"},
	}
}

func NewSettingsViewModel(cfg AppConfig) SettingsViewModel {
	home, _ := os.UserHomeDir()
	scope := "project"
	if home != "" && strings.HasPrefix(cfg.SettingsPath, home) {
		scope = "user"
	}

	m := SettingsViewModel{
		Step:      "main",
		Scope:     scope,
		CursorIdx: 0,
		Input:     NewInputBuffer(),
		Config:    cfg,
	}
	m.updateMainItems()
	m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
	return m
}

func (m SettingsViewModel) Update(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch m.Step {
	case "main":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				return m, func() tea.Msg { return BackToChatMsg{} }
			case tea.KeyUp, tea.KeyDown:
				var cmd tea.Cmd
				m.Dropdown, cmd = m.Dropdown.Update(msg)
				m.CursorIdx = m.Dropdown.ActiveIndex
				return m, cmd
			case tea.KeyEnter:
				key := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				switch key {
				case "scope":
					if m.Scope == "project" {
						m.Scope = "user"
					} else {
						m.Scope = "project"
					}
					m.updateMainItems()
					m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
					m.Dropdown.ActiveIndex = 0
					m.saveSettings()
				case "model":
					m.Step = "models"
					var modelItems []DropdownItem
					for _, model := range m.Config.Models {
						modelItems = append(modelItems, DropdownItem{Key: model, Label: model, Selected: model == m.Config.Model})
					}
					modelItems = append(modelItems, DropdownItem{Key: "+add", Label: "+ Add custom model..."})
					m.Dropdown = NewDropdownMenuModel("Select Active Model", "enter: select  •  esc: back", modelItems, 6)
				case "apiKey":
					m.Step = "apiKeyInput"
					m.Input.Clear()
				case "baseURL":
					m.Step = "baseURLInput"
					m.Input.Clear()
				case "auto_accept":
					m.Config.AutoAccept = !m.Config.AutoAccept
					m.updateMainItems()
					m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
					m.Dropdown.ActiveIndex = 4
					m.saveSettings()
				case "plan_mode":
					m.Config.PlanMode = !m.Config.PlanMode
					m.updateMainItems()
					m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
					m.Dropdown.ActiveIndex = 5
					m.saveSettings()
				}
			}
		}
	case "models":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
				m.Dropdown.ActiveIndex = 1
			case tea.KeyUp, tea.KeyDown:
				var cmd tea.Cmd
				m.Dropdown, cmd = m.Dropdown.Update(msg)
				return m, cmd
			case tea.KeyEnter:
				selectedKey := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				if selectedKey == "+add" {
					m.Step = "modelInput"
					m.Input.Clear()
				} else {
					m.Config.Model = selectedKey
					m.updateMainItems()
					m.Step = "main"
					m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
					m.Dropdown.ActiveIndex = 1
					m.saveSettings()
				}
			}
		}
	case "modelInput":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "models"
				var modelItems []DropdownItem
				for _, model := range m.Config.Models {
					modelItems = append(modelItems, DropdownItem{Key: model, Label: model, Selected: model == m.Config.Model})
				}
				modelItems = append(modelItems, DropdownItem{Key: "+add", Label: "+ Add custom model..."})
				m.Dropdown = NewDropdownMenuModel("Select Active Model", "enter: select  •  esc: back", modelItems, 6)
			case tea.KeyEnter:
				newModelName := strings.TrimSpace(m.Input.GetText())
				if newModelName != "" {
					m.Config.Models = append(m.Config.Models, newModelName)
					m.Config.Model = newModelName
					m.updateMainItems()
					m.saveSettings()
				}
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
				m.Dropdown.ActiveIndex = 1
			case tea.KeyBackspace:
				m.Input.Backspace()
			case tea.KeyRunes:
				m.Input.Insert(string(msg.Runes))
			case tea.KeySpace:
				m.Input.Insert(" ")
			}
		}
	case "apiKeyInput":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
				m.Dropdown.ActiveIndex = 2
			case tea.KeyEnter:
				newVal := strings.TrimSpace(m.Input.GetText())
				m.Config.ApiKey = newVal
				m.updateMainItems()
				m.saveSettings()
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
				m.Dropdown.ActiveIndex = 2
			case tea.KeyBackspace:
				m.Input.Backspace()
			case tea.KeyRunes:
				m.Input.Insert(string(msg.Runes))
			case tea.KeySpace:
				m.Input.Insert(" ")
			}
		}
	case "baseURLInput":
		switch msg := msg.(type) {
		case tea.KeyMsg:
			switch msg.Type {
			case tea.KeyEsc:
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
				m.Dropdown.ActiveIndex = 3
			case tea.KeyEnter:
				newVal := strings.TrimSpace(m.Input.GetText())
				m.Config.BaseURL = newVal
				m.updateMainItems()
				m.saveSettings()
				m.Step = "main"
				m.Dropdown = NewDropdownMenuModel("Settings Menu", "enter: select  •  esc: return to chat", m.Items, 6)
				m.Dropdown.ActiveIndex = 3
			case tea.KeyBackspace:
				m.Input.Backspace()
			case tea.KeyRunes:
				m.Input.Insert(string(msg.Runes))
			case tea.KeySpace:
				m.Input.Insert(" ")
			}
		}
	}
	return m, nil
}

func (m *SettingsViewModel) saveSettings() {
	var targetPath string
	if m.Scope == "user" {
		home, _ := os.UserHomeDir()
		targetPath = filepath.Join(home, ".anng", "settings.json")
	} else {
		// Project Scope
		targetPath = filepath.Join(".anng", "settings.json")
	}
	m.Config.SettingsPath = targetPath

	// Ensure parent dir exists
	dir := filepath.Dir(targetPath)
	_ = os.MkdirAll(dir, 0755)

	cfg := &config.Settings{
		Model:      m.Config.Model,
		ApiKey:     m.Config.ApiKey,
		BaseURL:    m.Config.BaseURL,
		AutoAccept: m.Config.AutoAccept,
		PlanMode:   m.Config.PlanMode,
		Models:     m.Config.Models,
	}
	_ = config.SaveConfig(targetPath, cfg)
}

func (m SettingsViewModel) View() string {
	var sb strings.Builder
	sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Bold(true).Render("=== Settings Console ===") + "\n\n")

	switch m.Step {
	case "main", "models":
		sb.WriteString(m.Dropdown.Render())
	case "modelInput":
		sb.WriteString("Add Model Name:\n\n  " + m.Input.GetText() + "█\n\n" + lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render("enter: save  •  esc: cancel"))
	case "apiKeyInput":
		sb.WriteString("Enter API Key:\n\n  " + m.Input.GetText() + "█\n\n" + lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render("enter: save  •  esc: cancel"))
	case "baseURLInput":
		sb.WriteString("Enter Base URL:\n\n  " + m.Input.GetText() + "█\n\n" + lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray)).Render("enter: save  •  esc: cancel"))
	}

	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color(BrandOrangeColor)).Padding(1, 2).Render(sb.String())
}
