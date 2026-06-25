package agent

import "github.com/sashabaranov/go-openai"

func toolSpecs() []openai.Tool {
	return []openai.Tool{
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "bash",
				Description: "Propose a shell command to execute on the system. Use 'cwd' for path.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"command": map[string]interface{}{
							"type":        "string",
							"description": "The exact bash command line string to run.",
						},
						"cwd": map[string]interface{}{
							"type":        "string",
							"description": "Optional working directory.",
						},
					},
					"required": []string{"command"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "read_file",
				Description: "Read the full text content of a file from the workspace path.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{
							"type":        "string",
							"description": "Path to read, relative or absolute.",
						},
						"start_line": map[string]interface{}{
							"type":        "number",
							"description": "Optional 1-based starting line number.",
						},
						"end_line": map[string]interface{}{
							"type":        "number",
							"description": "Optional 1-based ending line number.",
						},
					},
					"required": []string{"file_path"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "write_to_file",
				Description: "Create a new file or overwrite an existing file. If file already exists and is non-empty, you must read it first.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{"type": "string"},
						"content":   map[string]interface{}{"type": "string"},
					},
					"required": []string{"file_path", "content"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "replace_file_content",
				Description: "Edit an existing file by replacing a single contiguous block of code.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path":           map[string]interface{}{"type": "string"},
						"target_content":      map[string]interface{}{"type": "string"},
						"replacement_content": map[string]interface{}{"type": "string"},
						"start_line":          map[string]interface{}{"type": "number"},
						"end_line":            map[string]interface{}{"type": "number"},
					},
					"required": []string{"file_path", "target_content", "replacement_content", "start_line", "end_line"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "multi_replace_file_content",
				Description: "Edit multiple non-adjacent blocks of code in a file.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"file_path": map[string]interface{}{"type": "string"},
						"replacement_chunks": map[string]interface{}{
							"type": "array",
							"items": map[string]interface{}{
								"type": "object",
								"properties": map[string]interface{}{
									"target_content":      map[string]interface{}{"type": "string"},
									"replacement_content": map[string]interface{}{"type": "string"},
									"start_line":          map[string]interface{}{"type": "number"},
									"end_line":            map[string]interface{}{"type": "number"},
								},
								"required": []string{"target_content", "replacement_content", "start_line", "end_line"},
							},
						},
					},
					"required": []string{"file_path", "replacement_chunks"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "ask_question",
				Description: "Ask the user a clarifying question when requirements are ambiguous.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"question": map[string]interface{}{"type": "string"},
					},
					"required": []string{"question"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "search_web",
				Description: "Query search engines to get web information or documentation.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"query": map[string]interface{}{"type": "string"},
					},
					"required": []string{"query"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "HttpRequest",
				Description: "Make an HTTP request and return status, headers, and body.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"url":    map[string]interface{}{"type": "string"},
						"method": map[string]interface{}{"type": "string"},
						"body":   map[string]interface{}{"type": "string"},
						"headers": map[string]interface{}{
							"type": "object",
						},
					},
					"required": []string{"url"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "UpdatePlan",
				Description: "Record or update the current execution plan.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"plan": map[string]interface{}{"type": "string"},
					},
					"required": []string{"plan"},
				},
			},
		},
		{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        "AnalyzeProject",
				Description: "Analyze the current workspace structure and symbols.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"depth": map[string]interface{}{"type": "number"},
					},
				},
			},
		},
	}
}
