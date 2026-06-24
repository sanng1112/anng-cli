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
	return &settings, nil
}
