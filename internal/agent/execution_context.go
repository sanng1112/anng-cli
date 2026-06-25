package agent

type Mode string

const (
	ModeAct  Mode = "act"
	ModePlan Mode = "plan"
	ModeYolo Mode = "yolo"
)

type ExecutionContext struct {
	SessionID     string
	WorkspaceRoot string
	Mode          Mode
}

type ExecutionContextOptions struct {
	SessionID     string
	WorkspaceRoot string
	Mode          Mode
}

func NewExecutionContext(opts ExecutionContextOptions) ExecutionContext {
	return ExecutionContext{
		SessionID:     opts.SessionID,
		WorkspaceRoot: opts.WorkspaceRoot,
		Mode:          opts.Mode,
	}
}
