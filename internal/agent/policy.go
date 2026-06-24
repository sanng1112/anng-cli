package agent

import "fmt"

var mutatingTools = map[string]bool{
	"bash":                       true,
	"write_to_file":              true,
	"replace_file_content":       true,
	"multi_replace_file_content": true,
}

func EvaluateToolCall(ctx ExecutionContext, toolName string, args map[string]interface{}) error {
	_ = args
	if ctx.Mode == ModePlan && mutatingTools[toolName] {
		return fmt.Errorf("tool %s is blocked in planning mode", toolName)
	}
	return nil
}
