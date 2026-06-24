package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"anng-cli/internal/config"
	"anng-cli/internal/contextkeys"
)

type HeadlessResult struct {
	FinishReason string
	ExitCode     int
}

func RunHeadless(ctx context.Context, prompt string, autoApprove bool) (*HeadlessResult, error) {
	// Attempt to load settings from standard location (~/.anng/settings.json or ./.anng/settings.json)
	home, _ := os.UserHomeDir()
	settingsPath := filepath.Join(home, ".anng", "settings.json")
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		// Try project directory path
		settingsPath = filepath.Join(".anng", "settings.json")
	}

	var modelName, apiKey, baseURL string
	if os.Getenv("ANNG_TEST") == "true" {
		modelName = "deepseek-chat"
		apiKey = "mock-api-key"
		baseURL = ""
	} else {
		cfg, err := config.LoadConfig(settingsPath)
		if err == nil && cfg != nil {
			modelName = cfg.Model
			apiKey = cfg.ApiKey
			baseURL = cfg.BaseURL
		} else {
			// Use environment variables as fallback
			modelName = os.Getenv("ANNG_MODEL")
			if modelName == "" {
				modelName = "deepseek-chat"
			}
			apiKey = os.Getenv("ANNG_API_KEY")
			baseURL = os.Getenv("ANNG_BASE_URL")
		}
	}

	mode := "act"
	if autoApprove {
		mode = "yolo"
	}
	orch := NewOrchestrator(modelName, apiKey, mode)
	if baseURL != "" {
		orch.BaseURL = baseURL
	}

	// Inject project root and session ID into context for tool use
	cwd, _ := os.Getwd()
	ctx = context.WithValue(ctx, contextkeys.ProjectRootKey, cwd)
	ctx = context.WithValue(ctx, contextkeys.SessionIDKey, "session-headless")

	res, err := orch.Run(ctx, prompt)
	if err != nil {
		return &HeadlessResult{FinishReason: "failed", ExitCode: 1}, err
	}

	if res.Response != "" {
		fmt.Println(res.Response)
	}

	return &HeadlessResult{FinishReason: res.FinishReason, ExitCode: 0}, nil
}
