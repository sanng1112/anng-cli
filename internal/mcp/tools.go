package mcp

import (
	"github.com/sashabaranov/go-openai"
)

// ToOpenAITools converts MCP tool descriptions to OpenAI tool schemas.
// Each MCP tool is namespaced as "mcp__<server>__<tool>" to avoid collisions.
func ToOpenAITools(serverName string, tools []ToolDescription) []openai.Tool {
	result := make([]openai.Tool, 0, len(tools))
	for _, t := range tools {
		if t.InputSchema == nil {
			t.InputSchema = map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			}
		}
		// Ensure the schema has the required "type" field
		schema, ok := t.InputSchema.(map[string]interface{})
		if !ok {
			schema = map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			}
		}
		if _, exists := schema["type"]; !exists {
			schema["type"] = "object"
		}

		result = append(result, openai.Tool{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "mcp__" + serverName + "__" + t.Name,
				Description: t.Description,
				Parameters:  schema,
			},
		})
	}
	return result
}

// MCPToolServerAndName parses a namespaced tool name like "mcp__filesystem__read"
// into server name ("filesystem") and tool name ("read").
func MCPToolServerAndName(namespacedName string) (server, tool string) {
	// Format: mcp__<server>__<tool>
	parts := splitN(namespacedName, "__", 3)
	if len(parts) < 3 {
		return "", ""
	}
	return parts[1], parts[2]
}

func splitN(s, sep string, n int) []string {
	// Simple split implementation that splits at most n-1 times
	result := make([]string, 0, n)
	start := 0
	count := 0
	for i := 0; i < len(s)-len(sep)+1 && count < n-1; i++ {
		if s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
			count++
		}
	}
	result = append(result, s[start:])
	return result
}
