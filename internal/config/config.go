package config

import (
	"encoding/json"
	"os"
)

type Settings struct {
	Model     string            `json:"model"`
	ApiKey    string            `json:"apiKey"`
	BaseURL   string            `json:"baseUrl,omitempty"`
	Provider  string            `json:"provider,omitempty"` // "openai", "anthropic", "deepseek"
	Env       map[string]string `json:"env"`
	Models    []string          `json:"models,omitempty"`
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
	if len(settings.Models) == 0 {
		settings.Models = []string{"gpt-4o", "claude-3-5-sonnet", "deepseek-chat", "gemini-1.5-pro"}
	}
	return &settings, nil
}

func SaveConfig(path string, settings *Settings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
