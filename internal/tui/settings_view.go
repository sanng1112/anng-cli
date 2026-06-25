package tui

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"anng-cli/internal/config"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// SettingsViewModel is an OVERLAY floating on top of chat.
// Navigation: ← → for categories (horizontal), ↑ ↓ for items (vertical).

type SubmenuItem struct {
	Key     string
	Label   string
	Default bool
}

type SettingsItem struct {
	Key         string
	Label       string
	Kind        string
	Description string
}

type SettingsCategory struct {
	Name  string
	Key   string
	Items []SettingsItem
}

type SettingsViewModel struct {
	Visible bool
	Step    string
	Scope   string

	ActiveCategory int
	ActiveItem     int

	SearchQuery string
	SearchItems []SettingsItem

	Submenu        []SubmenuItem
	SubmenuIdx     int
	SubmenuTitle   string
	SubmenuSetting string

	ListManage    []string
	ListManageKey string
	ListManageIdx int

	Input   *InputBuffer
	ErrLine string

	Config AppConfig
}

func NewSettingsViewModel(cfg AppConfig) SettingsViewModel {
	scope := "project"
	if home, _ := os.UserHomeDir(); home != "" && strings.HasPrefix(cfg.SettingsPath, home) {
		scope = "user"
	}
	return SettingsViewModel{
		Visible: false, Step: "browse", Scope: scope,
		ActiveCategory: 0, ActiveItem: 0,
		Input: NewInputBuffer(), Config: cfg,
	}
}

func settingLabel(m *SettingsViewModel, key string) string {
	switch key {
	case "scope":
		if m.Scope == "user" { return "Scope: Global (User)" }
		return "Scope: Project"
	case "provider":
		if m.Config.Provider == "" { return "Provider: Infer" }
		return "Provider: " + m.Config.Provider
	case "model":
		if m.Config.Model == "" { return "Model: —" }
		return "Model: " + m.Config.Model
	case "apiKey":
		if m.Config.ApiKey == "" { return "API Key: Not set" }
		if len(m.Config.ApiKey) <= 8 { return "API Key: ********" }
		return "API Key: " + m.Config.ApiKey[:4] + "..." + m.Config.ApiKey[len(m.Config.ApiKey)-4:]
	case "baseURL":
		if m.Config.BaseURL == "" { return "Base URL: Default" }
		return "Base URL: " + m.Config.BaseURL
	case "temperature":
		return fmt.Sprintf("Temperature: %.1f", m.Config.Temperature)
	case "maxTokens":
		return fmt.Sprintf("Max Tokens: %d", m.Config.MaxTokens)
	case "thinking":
		return fmt.Sprintf("Thinking: %v", m.Config.ThinkingEnabled)
	case "reasoning":
		e := m.Config.ReasoningEffort
		if e == "" { e = "-" }
		return "Reasoning Effort: " + e
	case "timeout":
		return fmt.Sprintf("Timeout: %ds", m.Config.RequestTimeout)
	case "auto_accept":
		return fmt.Sprintf("Auto-Accept: %v", m.Config.AutoAccept)
	case "plan_mode":
		return fmt.Sprintf("Plan Mode: %v", m.Config.PlanMode)
	case "custom_instructions":
		s := m.Config.CustomInstructions
		if len(s) > 30 { s = s[:27] + "..." }
		if s == "" { s = "Not configured" }
		return "Custom Instructions: " + s
	case "active_skills":
		return fmt.Sprintf("Active Skills: %d", len(m.Config.ActiveSkills))
	case "context_budget":
		return fmt.Sprintf("Context Budget: %d", m.Config.ContextBudget)
	case "context_compaction":
		v := m.Config.ContextCompaction
		if v == "" { v = "auto" }
		return "Compaction: " + v
	case "theme":
		v := m.Config.Theme
		if v == "" { v = "dark" }
		return "Theme: " + v
	case "language":
		v := m.Config.Language
		if v == "" { v = "vi" }
		return "Language: " + v
	case "allowed_tools":
		return fmt.Sprintf("Allowed Tools: %d", len(m.Config.AllowedTools))
	case "blocked_tools":
		return fmt.Sprintf("Blocked Tools: %d", len(m.Config.BlockedTools))
	}
	return key
}

func settingDesc(key string) string {
	switch key {
	case "scope": return "Toggle project/user scope"
	case "provider": return "openai / deepseek / anthropic / google"
	case "model": return "Select or add custom model"
	case "apiKey": return "Set your API key"
	case "baseURL": return "Custom API endpoint"
	case "temperature": return "0.0 - 2.0"
	case "maxTokens": return "Max output tokens"
	case "thinking": return "Enable thinking/reasoning"
	case "reasoning": return "- / none / low / medium / high / max"
	case "timeout": return "Seconds"
	case "auto_accept": return "Auto-approve all tool actions"
	case "plan_mode": return "Block writes, read-only plan"
	case "custom_instructions": return "Extra system prompt text"
	case "active_skills": return "Comma-separated skill names"
	case "context_budget": return "Token budget for context window"
	case "context_compaction": return "auto / summarize / drop / off"
	case "theme": return "dark / light / auto"
	case "language": return "vi / en / zh"
	case "allowed_tools": return "Empty = all allowed"
	case "blocked_tools": return "Denylist tool names"
	}
	return ""
}

func settingsCategories() []SettingsCategory {
	return []SettingsCategory{
		{Name: "Provider", Key: "provider", Items: []SettingsItem{
			{Key: "scope", Kind: "toggle"},
			{Key: "provider", Kind: "select"},
			{Key: "model", Kind: "select"},
			{Key: "apiKey", Kind: "edit"},
			{Key: "baseURL", Kind: "edit"},
		}},
		{Name: "Generation", Key: "generation", Items: []SettingsItem{
			{Key: "temperature", Kind: "edit"},
			{Key: "maxTokens", Kind: "edit"},
			{Key: "thinking", Kind: "toggle"},
			{Key: "reasoning", Kind: "edit"},
			{Key: "timeout", Kind: "edit"},
		}},
		{Name: "Behavior", Key: "behavior", Items: []SettingsItem{
			{Key: "auto_accept", Kind: "toggle"},
			{Key: "plan_mode", Kind: "toggle"},
			{Key: "custom_instructions", Kind: "edit"},
			{Key: "active_skills", Kind: "edit"},
		}},
		{Name: "Context", Key: "context", Items: []SettingsItem{
			{Key: "context_budget", Kind: "edit"},
			{Key: "context_compaction", Kind: "edit"},
		}},
		{Name: "UI", Key: "ui", Items: []SettingsItem{
			{Key: "theme", Kind: "edit"},
			{Key: "language", Kind: "edit"},
		}},
		{Name: "Security", Key: "security", Items: []SettingsItem{
			{Key: "allowed_tools", Kind: "edit"},
			{Key: "blocked_tools", Kind: "edit"},
		}},
	}
}

func allSettingsFlattened() []SettingsItem {
	var flat []SettingsItem
	for _, cat := range settingsCategories() {
		for _, it := range cat.Items {
			it.Description = settingDesc(it.Key)
			flat = append(flat, it)
		}
	}
	return flat
}

func (m *SettingsViewModel) getCurrentItems() []SettingsItem {
	if m.ActiveCategory < 0 || m.ActiveCategory >= len(settingsCategories()) {
		return nil
	}
	items := settingsCategories()[m.ActiveCategory].Items
	for i := range items {
		items[i].Label = settingLabel(m, items[i].Key)
		items[i].Description = settingDesc(items[i].Key)
	}
	return items
}

// ─── Update ───────────────────────────────────────

func (m SettingsViewModel) Update(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch m.Step {
	case "browse", "search":
		return m.updateBrowse(msg)
	case "edit":
		return m.updateEdit(msg)
	case "submenu":
		return m.updateSubmenu(msg)
	case "listmanage":
		return m.updateListManage(msg)
	case "provider":
		return m.updateProviderSelect(msg)
	case "models":
		return m.updateModelsSelect(msg)
	}
	return m, nil
}

func (m SettingsViewModel) updateBrowse(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			if m.Step == "search" {
				m.Step = "browse"
				m.SearchQuery = ""
				m.SearchItems = nil
				break
			}
			m.Visible = false
			m.ErrLine = ""
			return m, nil

		case tea.KeyLeft:
			if m.Step == "search" { break }
			m.ActiveCategory--
			if m.ActiveCategory < 0 { m.ActiveCategory = len(settingsCategories()) - 1 }
			m.ActiveItem = 0

		case tea.KeyRight:
			if m.Step == "search" { break }
			m.ActiveCategory++
			if m.ActiveCategory >= len(settingsCategories()) { m.ActiveCategory = 0 }
			m.ActiveItem = 0

		case tea.KeyUp:
			if m.Step == "search" {
				if m.ActiveItem > 0 { m.ActiveItem-- }
				break
			}
			items := m.getCurrentItems()
			if m.ActiveItem > 0 { m.ActiveItem-- }
			_ = items

		case tea.KeyDown:
			if m.Step == "search" {
				if m.ActiveItem < len(m.SearchItems)-1 { m.ActiveItem++ }
				break
			}
			items := m.getCurrentItems()
			if m.ActiveItem < len(items)-1 { m.ActiveItem++ }

		case tea.KeyEnter:
			m.ErrLine = ""
			if m.Step == "search" && len(m.SearchItems) > 0 {
				return m.handleItemAction(m.SearchItems[m.ActiveItem].Key)
			}
			items := m.getCurrentItems()
			if m.ActiveItem >= 0 && m.ActiveItem < len(items) {
				return m.handleItemAction(items[m.ActiveItem].Key)
			}

		case tea.KeyRunes:
			if len(msg.Runes) > 0 {
				if m.Step != "search" {
					m.Step = "search"
					m.SearchQuery = string(msg.Runes)
				} else {
					m.SearchQuery += string(msg.Runes)
				}
				m.SearchItems = filterSettings(allSettingsFlattened(), m.SearchQuery)
				m.ActiveItem = 0
			}

		case tea.KeyBackspace:
			if m.Step == "search" && len(m.SearchQuery) > 0 {
				m.SearchQuery = m.SearchQuery[:len(m.SearchQuery)-1]
				m.SearchItems = filterSettings(allSettingsFlattened(), m.SearchQuery)
				m.ActiveItem = 0
			}
		case tea.KeySpace:
			if m.Step == "search" {
				m.SearchQuery += " "
				m.SearchItems = filterSettings(allSettingsFlattened(), m.SearchQuery)
				m.ActiveItem = 0
			}
		}
	}
	return m, nil
}

func (m SettingsViewModel) handleItemAction(key string) (SettingsViewModel, tea.Cmd) {
	m.ErrLine = ""
	switch key {
	case "scope":
		if m.Scope == "project" { m.Scope = "user" } else { m.Scope = "project" }
		m.saveSettings()
	case "thinking":
		m.Config.ThinkingEnabled = !m.Config.ThinkingEnabled
		if !m.Config.ThinkingEnabled && m.Config.ReasoningEffort == "" {
			m.Config.ReasoningEffort = "-"
		}
		m.saveSettings()
	case "auto_accept":
		if !m.Config.AutoAccept && m.Config.PlanMode {
			m.ErrLine = "Disable Plan Mode first."; return m, nil
		}
		m.Config.AutoAccept = !m.Config.AutoAccept; m.saveSettings()
	case "plan_mode":
		if !m.Config.PlanMode && m.Config.AutoAccept {
			m.ErrLine = "Disable Auto-Accept first."; return m, nil
		}
		m.Config.PlanMode = !m.Config.PlanMode; m.saveSettings()
	case "provider":
		return m.openSubmenu("Select Provider", key, []SubmenuItem{
			{Key: "", Label: "Infer from model/endpoint", Default: m.Config.Provider == ""},
			{Key: "openai", Label: "OpenAI", Default: m.Config.Provider == "openai"},
			{Key: "deepseek", Label: "DeepSeek", Default: m.Config.Provider == "deepseek"},
			{Key: "anthropic", Label: "Anthropic", Default: m.Config.Provider == "anthropic"},
			{Key: "google", Label: "Google (Gemini)", Default: m.Config.Provider == "google"},
		})
	case "reasoning":
		return m.openSubmenu("Reasoning Effort", key, []SubmenuItem{
			{Key: "-", Label: "Default"}, {Key: "none", Label: "None"},
			{Key: "low", Label: "Low"}, {Key: "medium", Label: "Medium"},
			{Key: "high", Label: "High"}, {Key: "max", Label: "Max"},
		})
	case "theme":
		return m.openSubmenu("Theme", key, []SubmenuItem{
			{Key: "dark", Label: "Dark", Default: m.Config.Theme == "dark" || m.Config.Theme == ""},
			{Key: "light", Label: "Light", Default: m.Config.Theme == "light"},
			{Key: "auto", Label: "Auto (system)", Default: m.Config.Theme == "auto"},
		})
	case "language":
		return m.openSubmenu("Language", key, []SubmenuItem{
			{Key: "vi", Label: "Tiếng Việt", Default: m.Config.Language == "vi" || m.Config.Language == ""},
			{Key: "en", Label: "English", Default: m.Config.Language == "en"},
			{Key: "zh", Label: "中文", Default: m.Config.Language == "zh"},
		})
	case "context_compaction":
		return m.openSubmenu("Context Compaction", key, []SubmenuItem{
			{Key: "auto", Label: "Auto", Default: m.Config.ContextCompaction == "auto" || m.Config.ContextCompaction == ""},
			{Key: "summarize", Label: "Summarize"}, {Key: "drop", Label: "Drop oldest"},
			{Key: "off", Label: "Off"},
		})
	case "temperature":
		return m.openSubmenu("Temperature", key,
			numericSubmenu(m.Config.Temperature, []float64{0.0, 0.1, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0}))
	case "maxTokens":
		return m.openSubmenu("Max Output Tokens", key,
			intSubmenu(m.Config.MaxTokens, []int{0, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 128000}))
	case "timeout":
		return m.openSubmenu("Request Timeout", key,
			intSubmenu(m.Config.RequestTimeout, []int{0, 15, 30, 60, 120, 180, 300, 600}))
	case "context_budget":
		return m.openSubmenu("Context Budget", key,
			intSubmenu(m.Config.ContextBudget, []int{0, 4096, 8192, 16384, 32768, 65536, 128000, 256000}))
	case "active_skills":
		m.Step = "listmanage"; m.ListManage = copyStrings(m.Config.ActiveSkills)
		m.ListManageKey = key; m.ListManageIdx = 0; m.Input.Clear()
	case "allowed_tools":
		m.Step = "listmanage"; m.ListManage = copyStrings(m.Config.AllowedTools)
		m.ListManageKey = key; m.ListManageIdx = 0; m.Input.Clear()
	case "blocked_tools":
		m.Step = "listmanage"; m.ListManage = copyStrings(m.Config.BlockedTools)
		m.ListManageKey = key; m.ListManageIdx = 0; m.Input.Clear()
	case "model":
		items := []SubmenuItem{}
		for _, model := range m.Config.Models {
			items = append(items, SubmenuItem{Key: model, Label: model, Default: model == m.Config.Model})
		}
		items = append(items, SubmenuItem{Key: "_add_custom", Label: "+ Add custom model..."})
		items = append(items, SubmenuItem{Key: "_clear", Label: "✖ Clear active model"})
		return m.openSubmenu("Select AI Model", key, items)
	case "apiKey", "baseURL", "custom_instructions":
		m.Step = "edit"; m.Input.Clear(); m.ErrLine = ""
		m.Input.Insert(currentValue(m.Config, key))
	}
	return m, nil
}

func (m SettingsViewModel) openSubmenu(title, setting string, items []SubmenuItem) (SettingsViewModel, tea.Cmd) {
	m.Step = "submenu"; m.SubmenuTitle = title; m.SubmenuSetting = setting
	m.Submenu = items; m.SubmenuIdx = 0
	for i, it := range items { if it.Default { m.SubmenuIdx = i; break } }
	return m, nil
}

func numericSubmenu(current float64, values []float64) []SubmenuItem {
	var items []SubmenuItem
	for _, v := range values {
		label := fmt.Sprintf("%.1f", v)
		if v == 0 { label = "Default" }
		items = append(items, SubmenuItem{Key: fmt.Sprintf("%.1f", v), Label: label,
			Default: v == current || (current == 0 && v == 0)})
	}
	return items
}

func intSubmenu(current int, values []int) []SubmenuItem {
	var items []SubmenuItem
	for _, v := range values {
		label := fmt.Sprintf("%d", v)
		if v == 0 { label = "Default" }
		items = append(items, SubmenuItem{Key: fmt.Sprintf("%d", v), Label: label,
			Default: v == current || (current == 0 && v == 0)})
	}
	return items
}

func copyStrings(src []string) []string {
	if src == nil { return nil }
	out := make([]string, len(src)); copy(out, src); return out
}

func currentValue(cfg AppConfig, key string) string {
	switch key {
	case "apiKey": return cfg.ApiKey
	case "baseURL": return cfg.BaseURL
	case "temperature": return fmt.Sprintf("%.1f", cfg.Temperature)
	case "maxTokens": return fmt.Sprintf("%d", cfg.MaxTokens)
	case "reasoning": return cfg.ReasoningEffort
	case "timeout": return fmt.Sprintf("%d", cfg.RequestTimeout)
	case "custom_instructions": return cfg.CustomInstructions
	case "active_skills": return strings.Join(cfg.ActiveSkills, ", ")
	case "context_budget": return fmt.Sprintf("%d", cfg.ContextBudget)
	case "context_compaction": return cfg.ContextCompaction
	case "theme": return cfg.Theme
	case "language": return cfg.Language
	case "allowed_tools": return strings.Join(cfg.AllowedTools, ", ")
	case "blocked_tools": return strings.Join(cfg.BlockedTools, ", ")
	}
	return ""
}

func (m SettingsViewModel) updateEdit(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			m.Step = "browse"
		case tea.KeyEnter:
			newVal := strings.TrimSpace(m.Input.GetText())
			key := ""
			if m.ActiveCategory >= 0 && m.ActiveCategory < len(settingsCategories()) {
				items := settingsCategories()[m.ActiveCategory].Items
				if m.ActiveItem >= 0 && m.ActiveItem < len(items) {
					key = items[m.ActiveItem].Key
				}
			}
			if key == "" && len(m.SearchItems) > m.ActiveItem {
				key = m.SearchItems[m.ActiveItem].Key
			}
			if key != "" {
				applyValue(&m, key, newVal)
				m.saveSettings()
			}
			m.Step = "browse"
		case tea.KeyBackspace:
			m.Input.Backspace()
		case tea.KeyRunes:
			m.Input.Insert(string(msg.Runes))
		case tea.KeySpace:
			m.Input.Insert(" ")
		}
	}
	return m, nil
}

func applyValue(m *SettingsViewModel, key, val string) {
	switch key {
	case "apiKey": m.Config.ApiKey = val
	case "baseURL": m.Config.BaseURL = val
	case "temperature":
		if f, err := strconv.ParseFloat(val, 64); err == nil && f >= 0 && f <= 2 { m.Config.Temperature = f }
	case "maxTokens":
		if n, err := strconv.Atoi(val); err == nil && n > 0 { m.Config.MaxTokens = n }
	case "reasoning": m.Config.ReasoningEffort = val
	case "timeout":
		if n, err := strconv.Atoi(val); err == nil && n > 0 { m.Config.RequestTimeout = n }
	case "custom_instructions": m.Config.CustomInstructions = val
	case "active_skills":
		if val == "" { m.Config.ActiveSkills = nil } else { m.Config.ActiveSkills = splitTrim(val) }
	case "context_budget":
		if n, err := strconv.Atoi(val); err == nil && n >= 0 { m.Config.ContextBudget = n }
	case "context_compaction": m.Config.ContextCompaction = val
	case "theme": m.Config.Theme = val
	case "language": m.Config.Language = val
	case "allowed_tools":
		if val == "" { m.Config.AllowedTools = nil } else { m.Config.AllowedTools = splitTrim(val) }
	case "blocked_tools":
		if val == "" { m.Config.BlockedTools = nil } else { m.Config.BlockedTools = splitTrim(val) }
	}
}

func splitTrim(s string) []string {
	parts := strings.Split(s, ",")
	var out []string
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" { out = append(out, t) }
	}
	return out
}

func (m SettingsViewModel) updateProviderSelect(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	providers := []string{"", "openai", "deepseek", "anthropic", "google"}
	idx := 0
	for i, p := range providers {
		if p == m.Config.Provider { idx = i; break }
	}
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			m.Step = "browse"
		case tea.KeyUp:
			idx--
			if idx < 0 { idx = len(providers) - 1 }
		case tea.KeyDown:
			idx++
			if idx >= len(providers) { idx = 0 }
		case tea.KeyEnter:
			m.Config.Provider = providers[idx]
			m.saveSettings()
			m.Step = "browse"
		}
	}
	return m, nil
}

func (m SettingsViewModel) updateModelsSelect(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			m.Step = "browse"
		case tea.KeyEnter:
			m.Step = "browse"
		}
	}
	return m, nil
}

func (m SettingsViewModel) updateSubmenu(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			m.Step = "browse"
		case tea.KeyUp:
			if m.SubmenuIdx > 0 { m.SubmenuIdx-- }
		case tea.KeyDown:
			if m.SubmenuIdx < len(m.Submenu)-1 { m.SubmenuIdx++ }
		case tea.KeyEnter:
			if m.SubmenuIdx >= 0 && m.SubmenuIdx < len(m.Submenu) {
				sel := m.Submenu[m.SubmenuIdx]
				switch m.SubmenuSetting {
				case "provider": m.Config.Provider = sel.Key
				case "reasoning": m.Config.ReasoningEffort = sel.Key
				case "theme": m.Config.Theme = sel.Key
				case "language": m.Config.Language = sel.Key
				case "context_compaction": m.Config.ContextCompaction = sel.Key
				case "temperature":
					if f, err := strconv.ParseFloat(sel.Key, 64); err == nil { m.Config.Temperature = f }
				case "maxTokens":
					if n, err := strconv.Atoi(sel.Key); err == nil { m.Config.MaxTokens = n }
				case "timeout":
					if n, err := strconv.Atoi(sel.Key); err == nil { m.Config.RequestTimeout = n }
				case "context_budget":
					if n, err := strconv.Atoi(sel.Key); err == nil { m.Config.ContextBudget = n }
				case "model":
					if sel.Key == "_add_custom" {
						m.Step = "edit"; m.Input.Clear(); m.ErrLine = ""
						return m, nil
					} else if sel.Key == "_clear" {
						m.Config.Model = ""
					} else {
						m.Config.Model = sel.Key
					}
				}
				m.saveSettings()
			}
			m.Step = "browse"
		}
	}
	return m, nil
}

func (m SettingsViewModel) updateListManage(msg tea.Msg) (SettingsViewModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyEsc:
			m.Step = "browse"
		case tea.KeyUp:
			if m.ListManageIdx > 0 { m.ListManageIdx-- }
		case tea.KeyDown:
			if m.ListManageIdx < len(m.ListManage) { m.ListManageIdx++ }
		case tea.KeyEnter:
			// Add new item from input
			newVal := strings.TrimSpace(m.Input.GetText())
			if newVal != "" {
				m.ListManage = append(m.ListManage, newVal)
				m.Input.Clear()
				m.ListManageIdx = len(m.ListManage)
			}
		case tea.KeyBackspace:
			if m.Input.GetText() == "" && len(m.ListManage) > 0 {
				// Remove selected item when input is empty
				if m.ListManageIdx >= 0 && m.ListManageIdx < len(m.ListManage) {
					m.ListManage = append(m.ListManage[:m.ListManageIdx], m.ListManage[m.ListManageIdx+1:]...)
					if m.ListManageIdx >= len(m.ListManage) { m.ListManageIdx = len(m.ListManage) - 1 }
					if m.ListManageIdx < 0 { m.ListManageIdx = 0 }
				}
			} else {
				m.Input.Backspace()
			}
		case tea.KeyRunes:
			m.Input.Insert(string(msg.Runes))
		case tea.KeySpace:
			m.Input.Insert(" ")
		}
	}
	// Auto-save on changes
	switch m.ListManageKey {
	case "active_skills": m.Config.ActiveSkills = m.ListManage
	case "allowed_tools": m.Config.AllowedTools = m.ListManage
	case "blocked_tools": m.Config.BlockedTools = m.ListManage
	}
	return m, nil
}

// ─── Save ──────────────────────────────────────────

func (m *SettingsViewModel) saveSettings() {
	var targetPath string
	if m.Scope == "user" {
		home, _ := os.UserHomeDir()
		targetPath = filepath.Join(home, ".anng", "settings.json")
	} else {
		targetPath = filepath.Join(m.Config.ProjectRoot, ".anng", "settings.json")
	}
	m.Config.SettingsPath = targetPath
	_ = os.MkdirAll(filepath.Dir(targetPath), 0755)

	cfg := &config.Settings{
		Model:              m.Config.Model,
		ApiKey:             m.Config.ApiKey,
		BaseURL:            m.Config.BaseURL,
		Provider:           m.Config.Provider,
		GeminiApiKey:       m.Config.GeminiApiKey,
		GeminiBaseURL:      m.Config.GeminiBaseURL,
		MaxTokens:          m.Config.MaxTokens,
		Temperature:        m.Config.Temperature,
		ThinkingEnabled:    m.Config.ThinkingEnabled,
		ReasoningEffort:    m.Config.ReasoningEffort,
		RequestTimeout:     m.Config.RequestTimeout,
		AutoAccept:         m.Config.AutoAccept,
		PlanMode:           m.Config.PlanMode,
		CustomInstructions: m.Config.CustomInstructions,
		ActiveSkills:       m.Config.ActiveSkills,
		ContextBudget:      m.Config.ContextBudget,
		ContextCompaction:  m.Config.ContextCompaction,
		Theme:              m.Config.Theme,
		Language:           m.Config.Language,
		AllowedTools:       m.Config.AllowedTools,
		BlockedTools:       m.Config.BlockedTools,
		Env:                nil,
		Models:             m.Config.Models,
	}
	if err := config.SaveConfig(targetPath, cfg); err != nil {
		m.ErrLine = err.Error()
	}
}

// ─── Search ────────────────────────────────────────

func filterSettings(items []SettingsItem, query string) []SettingsItem {
	q := strings.ToLower(query)
	var out []SettingsItem
	for _, it := range items {
		label := strings.ToLower(it.Label)
		desc := strings.ToLower(it.Description)
		if strings.Contains(label, q) || strings.Contains(desc, q) || strings.Contains(it.Key, q) {
			out = append(out, it)
		}
	}
	return out
}

// ─── View ──────────────────────────────────────────

func (m *SettingsViewModel) View() string {
	if !m.Visible { return "" }

	boxW := 72
	contentW := boxW - 4

	lineStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray))
	accentStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(BrandOrangeColor)).Bold(true)
	mutedStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(ColorMutedGray))

	// ── Title ──
	title := accentStyle.Render("Settings")
	titleFill := contentW - lipgloss.Width("Settings") - 1 // -1 for the space before ─
	topLine := lineStyle.Render("┌─ ") + title + lineStyle.Render(" "+strings.Repeat("─", titleFill)+"┐")

	// ── Category tabs (horizontal, width-safe) ──
	cats := settingsCategories()
	shortNames := map[string]string{
		"Provider":   "Prov",
		"Generation": "Gen",
		"Behavior":   "Behav",
		"Context":    "Ctx",
		"UI":         "UI",
		"Security":   "Sec",
	}
	tabParts := make([]string, 0, len(cats)*2-1)
	avail := contentW
	for i, cat := range cats {
		if i > 0 {
			tabParts = append(tabParts, mutedStyle.Render("│"))
			avail -= lipgloss.Width("│")
		}
		name := shortNames[cat.Name]
		if name == "" { name = cat.Name }
		marker := "  "
		style := lipgloss.NewStyle()
		if i == m.ActiveCategory && m.Step != "search" {
			style = style.Foreground(lipgloss.Color(BrandOrangeColor)).Bold(true)
			marker = "■ "
		} else {
			style = style.Foreground(lipgloss.Color(ColorMutedGray))
		}
		label := marker + name
		tabW := lipgloss.Width(label)
		if tabW > avail && i > 0 {
			// Not enough space, compact further
			label = marker + name[:min(3, len(name))]
			tabW = lipgloss.Width(label)
		}
		avail -= tabW
		tabParts = append(tabParts, style.Render(label))
	}
	// Pad remaining space
	padding := max(0, avail)
	tabLine := lineStyle.Render("│ ") + strings.Join(tabParts, "") + strings.Repeat(" ", padding) + lineStyle.Render(" │")

	// ── Divider ──
	div := lineStyle.Render("│ " + strings.Repeat("─", contentW) + " │")

	// ── Body lines ──
	var body []string
	body = append(body, tabLine)
	body = append(body, div)

	if m.Step == "search" {
		// Search header
		searchLine := fmt.Sprintf("  🔍 %s█", m.SearchQuery)
		body = append(body, lineStyle.Render("│ ")+searchLine+strings.Repeat(" ", max(0, contentW-lipgloss.Width(searchLine)))+lineStyle.Render(" │"))
		body = append(body, "")

		// Search results
		for i, item := range m.SearchItems {
			label := settingLabel(m, item.Key)
			prefix := "  "
			if i == m.ActiveItem { prefix = "› " }
			line := prefix + label
			if i == m.ActiveItem {
				highlighted := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(line)
				fill := contentW - lipgloss.Width(line)
				if fill < 0 { fill = 0 }
				body = append(body, lineStyle.Render("│ ")+highlighted+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
			} else {
				fill := contentW - lipgloss.Width(line)
				if fill < 0 { fill = 0 }
				body = append(body, lineStyle.Render("│ ")+line+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
			}
		}
		if len(m.SearchItems) == 0 {
			emptyLine := mutedStyle.Render("  No matching settings")
			fill := contentW - lipgloss.Width(emptyLine)
			if fill < 0 { fill = 0 }
			body = append(body, lineStyle.Render("│ ")+emptyLine+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
		}
	} else if m.Step == "submenu" {
		// Submenu selection
		titleLine := accentStyle.Render(m.SubmenuTitle)
		fill := contentW - lipgloss.Width(m.SubmenuTitle)
		if fill < 0 { fill = 0 }
		body = append(body, lineStyle.Render("│ ")+titleLine+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
		body = append(body, lineStyle.Render("│ ")+strings.Repeat(" ", contentW)+lineStyle.Render(" │"))
		for i, item := range m.Submenu {
			prefix := "  "
			if i == m.SubmenuIdx { prefix = "› " }
			mark := "  "
			if item.Default { mark = "● " }
			line := prefix + mark + item.Label
			fill := contentW - lipgloss.Width(line)
			if fill < 0 { fill = 0 }
			if i == m.SubmenuIdx {
				highlighted := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(line)
				body = append(body, lineStyle.Render("│ ")+highlighted+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
			} else {
				body = append(body, lineStyle.Render("│ ")+line+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
			}
		}
		hint := mutedStyle.Render("↑↓ navigate · enter select · esc back")
		hintFill := contentW - lipgloss.Width("↑↓ navigate · enter select · esc back")
		if hintFill < 0 { hintFill = 0 }
		body = append(body, lineStyle.Render("│ ")+hint+strings.Repeat(" ", hintFill)+lineStyle.Render(" │"))

	} else if m.Step == "listmanage" {
		// List management (add/remove)
		titleLine := accentStyle.Render("Manage " + m.ListManageKey)
		fill := contentW - lipgloss.Width("Manage " + m.ListManageKey)
		if fill < 0 { fill = 0 }
		body = append(body, lineStyle.Render("│ ")+titleLine+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
		body = append(body, lineStyle.Render("│ ")+strings.Repeat(" ", contentW)+lineStyle.Render(" │"))

		// Current items
		for i, item := range m.ListManage {
			prefix := "  "
			if i == m.ListManageIdx { prefix = "› " }
			line := prefix + "📦 " + item
			fill := contentW - lipgloss.Width(line)
			if fill < 0 { fill = 0 }
			if i == m.ListManageIdx {
				highlighted := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(line)
				body = append(body, lineStyle.Render("│ ")+highlighted+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
			} else {
				body = append(body, lineStyle.Render("│ ")+line+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
			}
		}
		if len(m.ListManage) == 0 {
			emptyLine := mutedStyle.Render("  (empty)")
			body = append(body, lineStyle.Render("│ ")+emptyLine+strings.Repeat(" ", max(0, contentW-lipgloss.Width("  (empty)")))+lineStyle.Render(" │"))
		}

		// Add new item input
		inputLine := "  ➕ " + m.Input.GetText() + "█"
		body = append(body, lineStyle.Render("│ ")+inputLine+strings.Repeat(" ", max(0, contentW-lipgloss.Width(inputLine)))+lineStyle.Render(" │"))
		hint := mutedStyle.Render("type: add · backspace empty: remove selected · enter: save · esc: done")
		hintFill := contentW - lipgloss.Width("type: add · backspace empty: remove selected · enter: save · esc: done")
		if hintFill < 0 { hintFill = 0 }
		body = append(body, lineStyle.Render("│ ")+hint+strings.Repeat(" ", hintFill)+lineStyle.Render(" │"))

	} else {
		// Items in current category
		items := m.getCurrentItems()
		for i, item := range items {
			label := settingLabel(m, item.Key)
			desc := settingDesc(item.Key)
			prefix := "  "
			if i == m.ActiveItem { prefix = "› " }
			line := prefix + label

			var fullLine string
			if desc != "" {
				descView := mutedStyle.Render(desc)
				avail := contentW - lipgloss.Width(line) - 1
				if lipgloss.Width(desc) > avail {
					descView = mutedStyle.Render(truncateStr(desc, avail))
				}
				spaces := max(1, contentW-lipgloss.Width(line)-lipgloss.Width(descView))
				fullLine = line + strings.Repeat(" ", spaces) + descView
			} else {
				fullLine = line + strings.Repeat(" ", max(0, contentW-lipgloss.Width(line)))
			}

			if i == m.ActiveItem {
				highlighted := lipgloss.NewStyle().Background(lipgloss.Color(BrandOrangeColor)).Foreground(lipgloss.Color("#FFFFFF")).Render(fullLine)
				body = append(body, lineStyle.Render("│ ")+highlighted+lineStyle.Render(" │"))
			} else {
				body = append(body, lineStyle.Render("│ ")+fullLine+lineStyle.Render(" │"))
			}
		}
	}

	// ── Edit input ──
	if m.Step == "edit" {
		editLine := accentStyle.Render("✎ ") + m.Input.GetText() + "█"
		body = append(body, lineStyle.Render("│ ")+editLine+strings.Repeat(" ", max(0, contentW-lipgloss.Width(editLine)))+lineStyle.Render(" │"))
		body = append(body, lineStyle.Render("│ ")+mutedStyle.Render("enter: save · esc: cancel")+strings.Repeat(" ", max(0, contentW-22))+lineStyle.Render(" │"))
	}

	// ── Error ──
	if m.ErrLine != "" {
		errStyle := lipgloss.NewStyle().Foreground(lipgloss.Color(ColorRed))
		errLine := errStyle.Render("⚠ " + m.ErrLine)
		fill := contentW - lipgloss.Width(errLine)
		if fill < 0 { fill = 0 }
		body = append(body, lineStyle.Render("│ ")+errLine+strings.Repeat(" ", fill)+lineStyle.Render(" │"))
	}

	// ── Footer hints ──
	var hint string
	if m.Step == "browse" {
		hint = "↑↓ navigate · ← → category · enter edit · esc close · type search"
	} else if m.Step == "search" {
		hint = "↑↓ navigate · enter select · esc back · type refine"
	} else {
		hint = ""
	}
	if hint != "" {
		hintView := mutedStyle.Render(hint)
		hintFill := contentW - lipgloss.Width(hint)
		if hintFill < 0 { hintFill = 0 }
		body = append(body, lineStyle.Render("│ ")+hintView+strings.Repeat(" ", hintFill)+lineStyle.Render(" │"))
	}

	// ── Bottom line ──
	bottomLine := lineStyle.Render("└" + strings.Repeat("─", contentW+2) + "┘")

	return strings.Join(append(append([]string{topLine}, body...), bottomLine), "\n") + "\n"
}

func truncateStr(s string, maxW int) string {
	w := 0
	for i, r := range s {
		rw := 1
		if r > 127 { rw = 2 }
		if w+rw > maxW {
			if i < 3 { return "" }
			return string([]rune(s)[:i-1]) + "…"
		}
		w += rw
	}
	return s
}
