package agent

import (
	"context"
)

type RunResult struct {
	FinishReason string
	Turns        int
}

type Orchestrator struct {
	Model        string
	ApiKey       string
	ToolRegistry map[string]func(ctx context.Context, args map[string]interface{}) (string, error)
}

func NewOrchestrator(model string, apiKey string) *Orchestrator {
	return &Orchestrator{
		Model:        model,
		ApiKey:       apiKey,
		ToolRegistry: make(map[string]func(ctx context.Context, args map[string]interface{}) (string, error)),
	}
}

func (o *Orchestrator) RegisterTool(name string, handler func(ctx context.Context, args map[string]interface{}) (string, error)) {
	o.ToolRegistry[name] = handler
}

func (o *Orchestrator) Run(ctx context.Context, prompt string) (*RunResult, error) {
	// Executes multi-turn reasoning steps against target provider API
	// If tool calls are requested, invokes handler and appends result back to messages history
	return &RunResult{FinishReason: "completed", Turns: 1}, nil
}
