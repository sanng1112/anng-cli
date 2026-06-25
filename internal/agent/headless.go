package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"anng-cli/internal/config"
	"anng-cli/internal/contextkeys"
	"anng-cli/internal/mcp"
)

type HeadlessResult struct {
	FinishReason string
	ExitCode     int
}

func resolveHeadlessMode(autoApprove bool, configPlanMode bool, forcePlan bool) string {
	if forcePlan || configPlanMode {
		return "plan"
	}
	if autoApprove {
		return "yolo"
	}
	return "act"
}

func resolveHeadlessSettingsPath(cwd string, home string) string {
	settingsPath := filepath.Join(cwd, ".anng", "settings.json")
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		return filepath.Join(home, ".anng", "settings.json")
	}
	return settingsPath
}

func RunHeadless(ctx context.Context, prompt string, autoApprove bool, forcePlan bool, jsonMode bool, verbose bool, maxTurns int) (*HeadlessResult, error) {
	cwd, _ := os.Getwd()
	home, _ := os.UserHomeDir()
	settingsPath := resolveHeadlessSettingsPath(cwd, home)

	var modelName, apiKey, baseURL string
	var provider string
	var geminiApiKey, geminiBaseURL string
	var planMode, thinkingEnabled bool
	var reasoningEffort string
	if os.Getenv("ANNG_TEST") == "true" {
		modelName = "deepseek-chat"
		apiKey = "mock-api-key"
		baseURL = ""
		provider = ""
	} else {
		cfg, err := config.LoadConfig(settingsPath)
		if err == nil && cfg != nil {
			modelName = cfg.Model
			apiKey = cfg.ApiKey
			baseURL = cfg.BaseURL
			provider = cfg.Provider
			geminiApiKey = cfg.GeminiApiKey
			geminiBaseURL = cfg.GeminiBaseURL
			planMode = cfg.PlanMode
			thinkingEnabled = cfg.ThinkingEnabled
			reasoningEffort = cfg.ReasoningEffort
		} else {
			// Use environment variables as fallback
			modelName = os.Getenv("ANNG_MODEL")
			if modelName == "" {
				modelName = "deepseek-chat"
			}
			apiKey = os.Getenv("ANNG_API_KEY")
			baseURL = os.Getenv("ANNG_BASE_URL")
			provider = os.Getenv("ANNG_PROVIDER")
			geminiApiKey = os.Getenv("GEMINI_API_KEY")
			geminiBaseURL = os.Getenv("GEMINI_BASE_URL")
			if os.Getenv("ANNG_THINKING_ENABLED") == "true" {
				thinkingEnabled = true
			}
			reasoningEffort = os.Getenv("ANNG_REASONING_EFFORT")
		}
	}

	resolvedProvider := ResolveProvider(provider, modelName, baseURL)
	provider = string(resolvedProvider)
	apiKey, baseURL = ResolveCredentials(resolvedProvider, apiKey, baseURL, geminiApiKey, geminiBaseURL)
	if baseURL == "" {
		baseURL = DefaultBaseURL(resolvedProvider)
	}

	isV4Model := modelName == "deepseek-v4-flash" || modelName == "deepseek-v4-pro" || modelName == "deepseek-v4-flash-free" || modelName == "deepseek-v4-pro-free"
	if isV4Model && !thinkingEnabled {
		thinkingEnabled = true
	}
	if reasoningEffort == "" && thinkingEnabled {
		reasoningEffort = "-"
	}

	mode := resolveHeadlessMode(autoApprove, planMode, forcePlan)
	orch := NewOrchestrator(modelName, apiKey, mode)
	orch.MaxTurns = maxTurns
	orch.Provider = provider
	orch.ThinkingEnabled = thinkingEnabled
	orch.ReasoningEffort = reasoningEffort
	if baseURL != "" {
		orch.BaseURL = baseURL
	}

	// Inject project root and session ID into context for tool use
	ctx = context.WithValue(ctx, contextkeys.ProjectRootKey, cwd)
	ctx = context.WithValue(ctx, contextkeys.SessionIDKey, "session-headless")

	if manager, _, err := mcp.LoadManagerFromSettingsPath(ctx, settingsPath); err == nil && manager != nil {
		defer manager.DisconnectAll()
		orch.MCPManager = manager
	}
	if verbose {
		fmt.Fprintf(os.Stderr, "Headless run: mode=%s provider=%s model=%s max_turns=%d settings=%s\n", mode, provider, modelName, orch.MaxTurns, settingsPath)
	}

	res, err := orch.Run(ctx, prompt)
	if err != nil {
		if verbose {
			fmt.Fprintf(os.Stderr, "Headless run failed: %v\n", err)
		}
		if jsonMode {
			jsonOutput := map[string]interface{}{
				"error":        err.Error(),
				"finishReason": "failed",
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			_ = enc.Encode(jsonOutput)
		}
		return &HeadlessResult{FinishReason: "failed", ExitCode: 1}, err
	}

	if jsonMode {
		jsonOutput := map[string]interface{}{
			"response":         res.Response,
			"turns":            res.Turns,
			"finishReason":     res.FinishReason,
			"promptTokens":     res.PromptTokens,
			"completionTokens": res.CompletionTokens,
			"totalTokens":      res.TotalTokens,
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(jsonOutput)
	} else if res.Response != "" {
		fmt.Println(res.Response)
	}
	if verbose {
		fmt.Fprintf(os.Stderr, "Headless run finished: reason=%s turns=%d total_tokens=%d\n", res.FinishReason, res.Turns, res.TotalTokens)
	}

	return &HeadlessResult{FinishReason: res.FinishReason, ExitCode: 0}, nil
}
