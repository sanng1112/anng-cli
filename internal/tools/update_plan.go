package tools

import (
	"context"
	"errors"
)

// UpdatePlanTool records a plan update from the agent.
// The plan content is returned to the caller for display in the TUI.
func UpdatePlanTool(ctx context.Context, args map[string]interface{}) (string, error) {
	plan, ok := args["plan"].(string)
	if !ok || plan == "" {
		return "", errors.New("missing required string 'plan'")
	}
	return "Plan updated.", nil
}
