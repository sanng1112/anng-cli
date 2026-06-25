package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"anng-cli/internal/contextkeys"
	"anng-cli/internal/mcp"
	"anng-cli/internal/section"
	"anng-cli/internal/tokenizer"
	"anng-cli/internal/tools"
	"github.com/sashabaranov/go-openai"
)

type RunResult struct {
	FinishReason     string
	Turns            int
	Response         string
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
}

type Orchestrator struct {
	Model           string
	ApiKey          string
	BaseURL         string
	Provider        string
	Mode            string
	MaxTurns        int
	ProjectRoot     string
	ThinkingEnabled bool
	ReasoningEffort string
	ToolRegistry    map[string]func(ctx context.Context, args map[string]interface{}) (string, error)
	MCPManager      *mcp.MCPManager
}

// NewOrchestrator creates an Orchestrator pre-registered with all standard tools.
func NewOrchestrator(model string, apiKey string, mode string) *Orchestrator {
	o := &Orchestrator{
		Model:        model,
		ApiKey:       apiKey,
		Mode:         mode,
		ToolRegistry: make(map[string]func(ctx context.Context, args map[string]interface{}) (string, error)),
	}

	// Register core tools
	o.RegisterTool("bash", func(ctx context.Context, args map[string]interface{}) (string, error) {
		cmd, _ := args["command"].(string)
		cwd, _ := args["cwd"].(string)
		if cwd == "" {
			if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
				cwd = pr
			}
		}
		return tools.ExecuteBashCommand(ctx, cmd, cwd)
	})
	o.RegisterTool("read_file", tools.ReadTool)
	o.RegisterTool("write_to_file", tools.WriteTool)
	o.RegisterTool("replace_file_content", tools.EditTool)
	o.RegisterTool("multi_replace_file_content", tools.MultiEditTool)
	o.RegisterTool("ask_question", tools.AskUserQuestionTool)
	o.RegisterTool("UpdatePlan", tools.UpdatePlanTool)
	o.RegisterTool("search_web", tools.WebSearchTool)
	o.RegisterTool("HttpRequest", tools.HttpRequestTool)
	o.RegisterTool("AnalyzeProject", tools.AnalyzeProjectTool)

	return o
}

func (o *Orchestrator) RegisterTool(name string, handler func(ctx context.Context, args map[string]interface{}) (string, error)) {
	o.ToolRegistry[name] = handler
}

// RegisterMCPTools discovers and registers all tools from connected MCP servers.
func (o *Orchestrator) RegisterMCPTools(ctx context.Context) {
	if o.MCPManager == nil {
		return
	}
	allTools := o.MCPManager.AllTools()
	for serverName, toolDescs := range allTools {
		for _, td := range toolDescs {
			toolName := "mcp__" + serverName + "__" + td.Name
			serverNameCopy := serverName
			toolNameCopy := td.Name
			o.RegisterTool(toolName, func(ctx context.Context, args map[string]interface{}) (string, error) {
				result, err := o.MCPManager.CallTool(ctx, serverNameCopy, toolNameCopy, args)
				if err != nil {
					return "", err
				}
				if result == nil {
					return "(no result)", nil
				}
				var texts []string
				for _, c := range result.Content {
					texts = append(texts, c.Text)
				}
				return strings.Join(texts, "\n"), nil
			})
		}
	}
}

func (o *Orchestrator) Run(ctx context.Context, prompt string) (*RunResult, error) {
	// Keep the tool registry synchronized with any connected MCP servers before each turn.
	o.RegisterMCPTools(ctx)

	// If ApiKey is mock, bypass API calling to support test mode
	if o.ApiKey == "mock-api-key" || o.ApiKey == "mock-key" {
		return &RunResult{FinishReason: "completed", Turns: 1}, nil
	}

	// If ApiKey is empty (user forgot to configure), return a clear error
	if o.ApiKey == "" {
		return nil, fmt.Errorf("API key is empty. Please configure it in settings.json or set the ANNG_API_KEY environment variable")
	}

	resolvedProvider := ResolveProvider(o.Provider, o.Model, o.BaseURL)
	resolvedBaseURL := o.BaseURL
	if resolvedBaseURL == "" {
		resolvedBaseURL = DefaultBaseURL(resolvedProvider)
	}

	config := openai.DefaultConfig(o.ApiKey)
	if resolvedBaseURL != "" {
		config.BaseURL = resolvedBaseURL
	}
	client := openai.NewClientWithConfig(config)

	// Fetch system prompt
	root := o.ProjectRoot
	if root == "" {
		if pr, ok := ctx.Value(contextkeys.ProjectRootKey).(string); ok {
			root = pr
		}
	}
	promptParts := NewPromptEngine().BuildPromptParts(o.Model, root, o.Mode)
	execCtx := NewExecutionContext(ExecutionContextOptions{
		SessionID:     sessionIDFromContext(ctx),
		WorkspaceRoot: root,
		Mode:          Mode(o.Mode),
	})

	messages := []openai.ChatCompletionMessage{
		{
			Role:    openai.ChatMessageRoleSystem,
			Content: promptParts.StaticPrefix,
		},
	}
	if promptParts.RuntimeOverlay != "" {
		messages = append(messages, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: promptParts.RuntimeOverlay,
		},
		)
	}
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: prompt,
	})

	turns := 0
	maxTurns := o.effectiveMaxTurns()
	var responseParts []string
	var promptTokens, completionTokens, totalTokens int
	reasoningEffort := NormalizeReasoningEffort(resolvedProvider, o.Model, o.ThinkingEnabled, o.ReasoningEffort)
	contextThreshold := CompactThreshold(o.Model, resolvedProvider)
	systemBoundary := 1
	if promptParts.RuntimeOverlay != "" {
		systemBoundary = 2
	}

	// Section caching setup
	secStore, _ := section.NewSectionStore()
	readLog, _ := section.NewReadLogStore()
	sessionID := sessionIDFromContext(ctx)
	lastSectionTurn := 0

	for turns < maxTurns {
		turns++

		// ── Section Caching: save conversation sections periodically ──
		if secStore != nil && readLog != nil && turns-lastSectionTurn >= 3 {
			// Build section content from recent messages
			var secBuilder strings.Builder
			for i := max(0, len(messages)-6); i < len(messages); i++ {
				m := messages[i]
				if m.Role == openai.ChatMessageRoleSystem {
					continue
				}
				role := m.Role
				if role == "" { role = "assistant" }
				secBuilder.WriteString(fmt.Sprintf("[%s]: %s\n", role, m.Content))
			}
			content := secBuilder.String()
			if len(content) > 200 {
				sec := section.Section{
					SessionID: sessionID,
					CreatedAt: time.Now(),
					Content:   content,
					Role:      "context",
					TokenCost: tokenizer.EstimateTokens(content),
					Tags:      []string{"auto", fmt.Sprintf("turn_%d", turns)},
				}
				_ = secStore.Save(sec)
				_ = readLog.Append(sessionID, sec.ID, "main", sec.Role, sec.TokenCost)
				lastSectionTurn = turns
			}
		}

		// ── Inject cached sections with <prompt_caching> markers ──
		if readLog != nil && secStore != nil && turns > 1 {
			cachedKeys, err := readLog.CachedSectionKeys(sessionID, 5*time.Minute)
			if err == nil && len(cachedKeys) > 0 {
				sections, err := secStore.List(sessionID)
				if err == nil && len(sections) > 0 {
					// Build prompt caching header for system message
					var cacheHeader strings.Builder
					cacheHeader.WriteString("<prompt_caching>\n")
					for _, sec := range sections {
						// Only include sections with active cache keys
						cacheKey := fmt.Sprintf("sec_%s_%s",
							sessionID[:min(8, len(sessionID))],
							sec.ID[:min(8, len(sec.ID))])
						for _, ck := range cachedKeys {
							if ck == cacheKey {
								cacheHeader.WriteString(fmt.Sprintf("<cache key=\"%s\">\n", cacheKey))
								cacheHeader.WriteString(sec.Content)
								cacheHeader.WriteString("\n</cache>\n")
								break
							}
						}
					}
					cacheHeader.WriteString("</prompt_caching>")
					if cacheHeader.Len() > 50 {
						// Inject as system message prefix
						cachedMsg := openai.ChatCompletionMessage{
							Role:    openai.ChatMessageRoleSystem,
							Content: cacheHeader.String(),
						}
						// Insert right after the first system message
						if len(messages) > 0 && messages[0].Role == openai.ChatMessageRoleSystem {
							messages = append([]openai.ChatCompletionMessage{messages[0], cachedMsg}, messages[1:]...)
						}
					}
				}
			}
		}

		// Perform Context Compaction check (pushed to 325K threshold)
		var tokMsgs []tokenizer.Message
		for _, m := range messages {
			tokMsgs = append(tokMsgs, tokenizer.Message{
				Role:    m.Role,
				Content: m.Content,
			})
		}
		decision := tokenizer.ShouldCompactContext(tokMsgs, contextThreshold)
		if decision.ShouldCompact {
			if decision.KeepFromIndex < systemBoundary {
				decision.KeepFromIndex = systemBoundary
			}
			trimmed := make([]openai.ChatCompletionMessage, 0, systemBoundary+len(messages)-decision.KeepFromIndex)
			trimmed = append(trimmed, messages[:systemBoundary]...)
			trimmed = append(trimmed, messages[decision.KeepFromIndex:]...)
			messages = trimmed
		}

		tools := toolSpecs()
		// Append MCP tools if available
		if o.MCPManager != nil {
			for serverName, toolDescs := range o.MCPManager.AllTools() {
				mcpTools := mcp.ToOpenAITools(serverName, toolDescs)
				tools = append(tools, mcpTools...)
			}
		}
		req := openai.ChatCompletionRequest{
			Model:    o.Model,
			Messages: messages,
			Tools:    tools,
		}
		if reasoningEffort != "" {
			req.ReasoningEffort = reasoningEffort
		}

		resp, err := client.CreateChatCompletion(ctx, req)
		if err != nil {
			targetURL := o.BaseURL
			if targetURL == "" {
				targetURL = "https://api.openai.com/v1"
			}
			return nil, fmt.Errorf("API call failed (Endpoint: %s, Model: %s): %w", targetURL, o.Model, err)
		}

		// Accumulate tokens
		promptTokens += resp.Usage.PromptTokens
		completionTokens += resp.Usage.CompletionTokens
		totalTokens += resp.Usage.TotalTokens

		if len(resp.Choices) == 0 {
			break
		}

		msg := resp.Choices[0].Message
		messages = append(messages, msg)

		if msg.Content != "" {
			responseParts = append(responseParts, msg.Content)
		}

		if len(msg.ToolCalls) == 0 {
			break
		}

		// Handle tool calls sequentially
		for _, tc := range msg.ToolCalls {
			handler, exists := o.ToolRegistry[tc.Function.Name]
			var toolResult string
			var toolErr error
			if !exists {
				toolResult = fmt.Sprintf("Error: Tool %s not found", tc.Function.Name)
			} else {
				// Parse arguments JSON into map
				var args map[string]interface{}
				if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
					toolResult = fmt.Sprintf("Error parsing arguments: %v", err)
				} else {
					if err := EvaluateToolCall(execCtx, tc.Function.Name, args); err != nil {
						toolResult = fmt.Sprintf("Error: %v", err)
					} else {
						toolResult, toolErr = handler(ctx, args)
						if toolErr != nil {
							toolResult = fmt.Sprintf("Error: %v", toolErr)
						}
						if tc.Function.Name == "bash" && o.checkForCompilerErrors(toolResult) && turns < maxTurns {
							toolResult = fmt.Sprintf("%s\n\n[SYSTEM CHECKPOINT]: The execution resulted in a compiler error. Please analyze the error trace, make the necessary file corrections using write/edit, and run the verification command again.", toolResult)
						}
					}
				}
			}

			messages = append(messages, openai.ChatCompletionMessage{
				Role:       openai.ChatMessageRoleTool,
				Content:    toolResult,
				ToolCallID: tc.ID,
			})
		}
	}

	return &RunResult{
		FinishReason:     "completed",
		Turns:            turns,
		Response:         strings.Join(responseParts, "\n"),
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      totalTokens,
	}, nil
}

func (o *Orchestrator) effectiveMaxTurns() int {
	if o.MaxTurns > 0 {
		return o.MaxTurns
	}
	return 10
}

func sessionIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(contextkeys.SessionIDKey).(string); ok {
		return v
	}
	return "default"
}

func (o *Orchestrator) checkForCompilerErrors(output string) bool {
	errorKeywords := []string{
		"syntax error:",
		"undefined:",
		"type mismatch",
		"exit status 1",
		"build failed",
		"compiler error",
		"not used",
	}
	for _, kw := range errorKeywords {
		if strings.Contains(strings.ToLower(output), kw) {
			return true
		}
	}
	return false
}
