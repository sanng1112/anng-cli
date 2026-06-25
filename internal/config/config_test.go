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

	configJSON := `{"model": "deepseek-v4", "apiKey": "test-key", "provider": "google", "geminiApiKey": "gemini-key", "geminiBaseUrl": "https://gemini.example/openai", "env": {"BASE_URL": "http://localhost"}}`
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
	if cfg.Provider != "google" {
		t.Errorf("Expected provider google, got %q", cfg.Provider)
	}
	if cfg.GeminiApiKey != "gemini-key" {
		t.Errorf("Expected Gemini API key gemini-key, got %q", cfg.GeminiApiKey)
	}
	if cfg.GeminiBaseURL != "https://gemini.example/openai" {
		t.Errorf("Expected Gemini base URL, got %q", cfg.GeminiBaseURL)
	}
	if cfg.Env["BASE_URL"] != "http://localhost" {
		t.Errorf("Expected Base URL, got %q", cfg.Env["BASE_URL"])
	}
}

func TestSaveConfigRejectsInvalidSettings(t *testing.T) {
	tempFile, err := os.CreateTemp("", "settings.json")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tempFile.Name())
	tempFile.Close()

	err = SaveConfig(tempFile.Name(), &Settings{
		Model:      "gpt-4o",
		Models:     []string{"gpt-4o"},
		AutoAccept: true,
		PlanMode:   true,
	})
	if err == nil {
		t.Fatal("expected validation error for conflicting modes")
	}
}

func TestDeduplicateModels(t *testing.T) {
	got := DeduplicateModels([]string{" gpt-4o ", "deepseek-chat", "gpt-4o", "", "deepseek-chat"})
	if len(got) != 2 {
		t.Fatalf("expected 2 unique models, got %d: %v", len(got), got)
	}
	if got[0] != "gpt-4o" || got[1] != "deepseek-chat" {
		t.Fatalf("unexpected model normalization result: %v", got)
	}
}
