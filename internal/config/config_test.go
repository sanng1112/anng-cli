package config

import (
	"os"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	tempFile, err := os.CreateTemp("", "settings.json")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())

	configJSON := `{"model": "deepseek-v4", "apiKey": "test-key", "env": {"BASE_URL": "http://localhost"}}`
	if _, err := tempFile.Write([]byte(configJSON)); err != nil {
		t.Fatal(err)
	}
	tempFile.Close()

	cfg, err := LoadConfig(tempFile.Name())
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}
	if cfg.Model != "deepseek-v4" {
		t.Errorf("Expected model deepseek-v4, got %q", cfg.Model)
	}
	if cfg.ApiKey != "test-key" {
		t.Errorf("Expected API key test-key, got %q", cfg.ApiKey)
	}
	if cfg.Env["BASE_URL"] != "http://localhost" {
		t.Errorf("Expected Base URL, got %q", cfg.Env["BASE_URL"])
	}
}
