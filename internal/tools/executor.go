package tools

import (
	"context"
	"fmt"
)

type ToolHandler func(ctx context.Context, args map[string]interface{}) (string, error)

type ToolRegistry struct {
	handlers map[string]ToolHandler
}

func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		handlers: make(map[string]ToolHandler),
	}
}

func (tr *ToolRegistry) Register(name string, handler ToolHandler) {
	tr.handlers[name] = handler
}

func (tr *ToolRegistry) Execute(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	handler, exists := tr.handlers[name]
	if !exists {
		return "", fmt.Errorf("tool %q not registered", name)
	}
	return handler(ctx, args)
}
