package tui

import (
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type ResumeSessionMsg struct {
	SessionName string
}

type RestoreCheckpointMsg struct {
	Checkpoint string
}

type BackToChatMsg struct{}

type SessionListModel struct {
	Dropdown    DropdownMenuModel
	ProjectRoot string
}

func NewSessionListModel(projectRoot string) SessionListModel {
	sessions := LoadSessions(projectRoot)
	var items []DropdownItem
	for _, s := range sessions {
		items = append(items, DropdownItem{Key: s, Label: s})
	}
	return SessionListModel{
		Dropdown:    NewDropdownMenuModel("Resumable Chat Sessions", "enter: resume  •  esc: cancel  •  d: delete session", items, 10),
		ProjectRoot: projectRoot,
	}
}

func (m SessionListModel) Update(msg tea.Msg) (SessionListModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyRunes:
			if string(msg.Runes) == "d" && len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				m.deleteSessionFile(selected)
				m.Dropdown.Items = append(m.Dropdown.Items[:m.Dropdown.ActiveIndex], m.Dropdown.Items[m.Dropdown.ActiveIndex+1:]...)
				if m.Dropdown.ActiveIndex >= len(m.Dropdown.Items) && len(m.Dropdown.Items) > 0 {
					m.Dropdown.ActiveIndex = len(m.Dropdown.Items) - 1
				}
				return m, nil
			}
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		case tea.KeyEnter:
			if len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				return m, func() tea.Msg { return ResumeSessionMsg{SessionName: selected} }
			}
		}
	}
	return m, nil
}

func (m SessionListModel) deleteSessionFile(sessionName string) {
	home, _ := os.UserHomeDir()
	projectCode := strings.ReplaceAll(m.ProjectRoot, "/", "-")
	projectCode = strings.ReplaceAll(projectCode, "\\", "-")
	projectCode = strings.ReplaceAll(projectCode, ":", "")
	basePath := filepath.Join(home, ".anng", "projects", projectCode, sessionName)
	_ = os.Remove(basePath + ".jsonl")
	_ = os.Remove(basePath + ".json")
}

func (m SessionListModel) View() string {
	return "\n" + m.Dropdown.Render()
}

type UndoSelectorModel struct {
	Dropdown DropdownMenuModel
}

func NewUndoSelectorModel(checkpoints []string) UndoSelectorModel {
	var items []DropdownItem
	for _, c := range checkpoints {
		items = append(items, DropdownItem{Key: c, Label: "[Target] " + c})
	}
	return UndoSelectorModel{
		Dropdown: NewDropdownMenuModel("Undo conversation checkpoints", "enter: restore point  •  esc: cancel", items, 10),
	}
}

func (m UndoSelectorModel) Update(msg tea.Msg) (UndoSelectorModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		case tea.KeyEnter:
			if len(m.Dropdown.Items) > 0 {
				selected := m.Dropdown.Items[m.Dropdown.ActiveIndex].Key
				return m, func() tea.Msg { return RestoreCheckpointMsg{Checkpoint: selected} }
			}
		}
	}
	return m, nil
}

func (m UndoSelectorModel) View() string {
	return "\n" + m.Dropdown.Render()
}
