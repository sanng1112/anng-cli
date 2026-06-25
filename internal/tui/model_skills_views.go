package tui

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
)

type SwitchModelMsg struct {
	Model string
}

type AddCustomModelMsg struct{}

type ModelSelectModel struct {
	Dropdown DropdownMenuModel
}

func NewModelSelectModel(models []string, activeModel string) ModelSelectModel {
	var items []DropdownItem
	for _, m := range models {
		items = append(items, DropdownItem{
			Key:      m,
			Label:    m,
			Selected: m == activeModel,
		})
	}
	items = append(items, DropdownItem{
		Key:   "+add",
		Label: "+ Add custom model...",
	})
	return ModelSelectModel{
		Dropdown: NewDropdownMenuModel("Select AI Provider Model", "enter: select model  •  esc: cancel", items, 10),
	}
}

func (m ModelSelectModel) Update(msg tea.Msg) (ModelSelectModel, tea.Cmd) {
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
				if selected == "+add" {
					return m, func() tea.Msg { return AddCustomModelMsg{} }
				}
				return m, func() tea.Msg { return SwitchModelMsg{Model: selected} }
			}
		}
	}
	return m, nil
}

func (m ModelSelectModel) View() string {
	return "\n" + m.Dropdown.Render()
}

type UpdateActiveSkillsMsg struct {
	ActiveSkills []string
}

type SkillsListModel struct {
	Dropdown DropdownMenuModel
}

func NewSkillsListModel(skills []string, activeSkills []string) SkillsListModel {
	var items []DropdownItem
	for _, s := range skills {
		selected := false
		for _, active := range activeSkills {
			if active == s {
				selected = true
				break
			}
		}
		items = append(items, DropdownItem{
			Key:      s,
			Label:    s,
			Selected: selected,
		})
	}
	return SkillsListModel{
		Dropdown: NewDropdownMenuModel("Available Skills", "space: toggle selection  •  enter: confirm  •  esc: cancel", items, 10),
	}
}

func (m SkillsListModel) Update(msg tea.Msg) (SkillsListModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyEnter:
			var chosen []string
			for _, item := range m.Dropdown.Items {
				if item.Selected {
					chosen = append(chosen, item.Key)
				}
			}
			return m, func() tea.Msg { return UpdateActiveSkillsMsg{ActiveSkills: chosen} }
		case tea.KeySpace:
			if len(m.Dropdown.Items) > 0 {
				idx := m.Dropdown.ActiveIndex
				m.Dropdown.Items[idx].Selected = !m.Dropdown.Items[idx].Selected
			}
			return m, nil
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		}
	}
	return m, nil
}

func (m SkillsListModel) View() string {
	return "\n" + m.Dropdown.Render()
}

type McpStatusModel struct {
	Dropdown DropdownMenuModel
}

type ServerStatusInfo struct {
	Name       string
	Status     string
	ToolCount  int
	LastError  string
}

func NewMcpStatusModel(servers []ServerStatusInfo) McpStatusModel {
	var items []DropdownItem
	for _, s := range servers {
		symbol := "○"
		color := ColorRed
		if s.Status == "connected" {
			symbol = "●"
			color = ColorGreen
		} else if s.Status == "connecting" {
			symbol = "◐"
			color = BrandOrangeColor
		}
		label := s.Name
		if s.ToolCount > 0 {
			label += fmt.Sprintf(" (%d tools)", s.ToolCount)
		}
		if s.LastError != "" {
			color = ColorRed
		}
		items = append(items, DropdownItem{
			Key:   s.Name,
			Label: label,
			StatusIndicator: &StatusIndicator{
				Symbol: symbol,
				Color:  color,
			},
		})
	}
	if len(items) == 0 {
		items = []DropdownItem{{Key: "none", Label: "No MCP servers configured"}}
	}
	return McpStatusModel{
		Dropdown: NewDropdownMenuModel("MCP Server Connections", "esc: return to chat", items, 10),
	}
}

func (m McpStatusModel) Update(msg tea.Msg) (McpStatusModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc, tea.KeyEnter:
			return m, func() tea.Msg { return BackToChatMsg{} }
		case tea.KeyUp, tea.KeyDown:
			var cmd tea.Cmd
			m.Dropdown, cmd = m.Dropdown.Update(msg)
			return m, cmd
		}
	}
	return m, nil
}

func (m McpStatusModel) View() string {
	return "\n" + m.Dropdown.Render()
}
