package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// configLockPath is a simple file-based lock to prevent concurrent writes.
var configLockPath string

func lockConfig() error {
	home, _ := os.UserHomeDir()
	configLockPath = filepath.Join(home, ".anng", ".settings.lock")
	for i := 0; i < 50; i++ {
		f, err := os.OpenFile(configLockPath, os.O_CREATE|os.O_EXCL, 0644)
		if err == nil {
			fmt.Fprintf(f, "pid=%d time=%s\n", os.Getpid(), time.Now().Format(time.RFC3339))
			f.Close()
			return nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return fmt.Errorf("config is locked by another ANNG instance (wait 500ms)")
}

func unlockConfig() {
	if configLockPath != "" {
		os.Remove(configLockPath)
	}
}

type Settings struct {
	// === Provider ===
	Model           string            `json:"model"`
	ApiKey          string            `json:"apiKey"`
	BaseURL         string            `json:"baseUrl,omitempty"`
	Provider        string            `json:"provider,omitempty"` // "openai", "google", "anthropic", "deepseek"
	GeminiApiKey    string            `json:"geminiApiKey,omitempty"`
	GeminiBaseURL   string            `json:"geminiBaseUrl,omitempty"`

	// === Generation ===
	MaxTokens       int               `json:"maxTokens,omitempty"`       // max output tokens
	Temperature     float64           `json:"temperature,omitempty"`     // generation temperature (0.0-2.0)
	ThinkingEnabled bool              `json:"thinkingEnabled"`
	ReasoningEffort string            `json:"reasoningEffort,omitempty"` // "-", "none", "low", "medium", "high", "max"
	RequestTimeout  int               `json:"requestTimeout,omitempty"`  // API request timeout (seconds)

	// === Behavior ===
	AutoAccept         bool              `json:"autoAccept"`
	PlanMode           bool              `json:"planMode"`
	CustomInstructions string            `json:"customInstructions,omitempty"` // custom system prompt additions
	ActiveSkills       []string          `json:"activeSkills,omitempty"`       // enabled skill names

	// === Context ===
	ContextBudget     int     `json:"contextBudget,omitempty"`     // context window budget (tokens)
	ContextCompaction string  `json:"contextCompaction,omitempty"` // "auto", "summarize", "drop", "off"

	// === UI ===
	Theme    string `json:"theme,omitempty"`    // "dark", "light", "auto"
	Language string `json:"language,omitempty"` // "vi", "en", "zh"

	// === Security ===
	AllowedTools []string `json:"allowedTools,omitempty"` // tool allowlist (empty = all allowed)
	BlockedTools []string `json:"blockedTools,omitempty"` // tool blocklist

	// === Storage ===
	Env    map[string]string `json:"env"`
	Models []string          `json:"models,omitempty"`
}

var DefaultModels = []string{"gpt-4o", "claude-3-5-sonnet", "deepseek-chat", "gemini-1.5-pro"}

var allowedProviders = map[string]bool{
	"":          true,
	"openai":    true,
	"google":    true,
	"gemini":    true,
	"anthropic": true,
	"deepseek":  true,
}

var allowedReasoningEfforts = map[string]bool{
	"":       true,
	"-":      true,
	"none":   true,
	"low":    true,
	"medium": true,
	"high":   true,
	"max":    true,
}

func LoadConfig(path string) (*Settings, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}
	if settings.Env == nil {
		settings.Env = make(map[string]string)
	}
	NormalizeSettings(&settings)
	return &settings, nil
}

func SaveConfig(path string, settings *Settings) error {
	if settings == nil {
		return errors.New("settings cannot be nil")
	}
	NormalizeSettings(settings)
	if err := ValidateSettings(settings); err != nil {
		return err
	}
	// Lock to prevent concurrent writes from multiple ANNG instances
	if err := lockConfig(); err != nil {
		return err
	}
	defer unlockConfig()
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func NormalizeSettings(settings *Settings) {
	if settings.Env == nil {
		settings.Env = make(map[string]string)
	}

	settings.Provider = normalizeProvider(settings.Provider)
	settings.Model = strings.TrimSpace(settings.Model)
	settings.ApiKey = strings.TrimSpace(settings.ApiKey)
	settings.BaseURL = strings.TrimSpace(settings.BaseURL)
	settings.GeminiApiKey = strings.TrimSpace(settings.GeminiApiKey)
	settings.GeminiBaseURL = strings.TrimSpace(settings.GeminiBaseURL)
	settings.ReasoningEffort = strings.ToLower(strings.TrimSpace(settings.ReasoningEffort))

	models := DeduplicateModels(settings.Models)
	if len(models) == 0 {
		models = append([]string{}, DefaultModels...)
	}
	settings.Models = models
}

func ValidateSettings(settings *Settings) error {
	if settings == nil {
		return errors.New("settings cannot be nil")
	}

	provider := normalizeProvider(settings.Provider)
	if !allowedProviders[provider] {
		return errors.New("provider must be one of: openai, deepseek, anthropic, google")
	}

	if strings.TrimSpace(settings.BaseURL) != "" {
		if _, err := url.ParseRequestURI(strings.TrimSpace(settings.BaseURL)); err != nil {
			return errors.New("baseUrl must be a valid absolute URL")
		}
	}

	if strings.TrimSpace(settings.GeminiBaseURL) != "" {
		if _, err := url.ParseRequestURI(strings.TrimSpace(settings.GeminiBaseURL)); err != nil {
			return errors.New("geminiBaseUrl must be a valid absolute URL")
		}
	}

	reasoning := strings.ToLower(strings.TrimSpace(settings.ReasoningEffort))
	if !allowedReasoningEfforts[reasoning] {
		return errors.New("reasoningEffort must be one of: -, none, low, medium, high, max")
	}

	models := DeduplicateModels(settings.Models)
	if len(models) == 0 {
		return errors.New("models must contain at least one model")
	}

	if settings.AutoAccept && settings.PlanMode {
		return errors.New("autoAccept and planMode cannot both be enabled")
	}

	return nil
}

func DeduplicateModels(models []string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, model := range models {
		trimmed := strings.TrimSpace(model)
		if trimmed == "" || seen[trimmed] {
			continue
		}
		seen[trimmed] = true
		out = append(out, trimmed)
	}
	return out
}

func IsBuiltInModel(model string) bool {
	model = strings.TrimSpace(model)
	for _, builtIn := range DefaultModels {
		if model == builtIn {
			return true
		}
	}
	return false
}

func normalizeProvider(provider string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "gemini" {
		return "google"
	}
	return provider
}
