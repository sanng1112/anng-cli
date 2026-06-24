package tui

type TuiView string

const (
	ViewChat        TuiView = "chat"
	ViewSessionList TuiView = "session-list"
	ViewUndo        TuiView = "undo"
	ViewMcpStatus   TuiView = "mcp-status"
	ViewSettings    TuiView = "settings"
	ViewModelSelect TuiView = "model-select"
	ViewSkillsList  TuiView = "skills-list"
	ViewInput       TuiView = "input"
	ViewTeam        TuiView = "team"
)
