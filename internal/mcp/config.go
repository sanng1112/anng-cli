package mcp

import (
	"context"
	"encoding/json"
	"os"
)

type MCPServerConfig struct {
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env,omitempty"`
}

type MCPConfig struct {
	Servers map[string]MCPServerConfig `json:"mcpServers"`
}

func LoadMCPConfig(path string) (*MCPConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg MCPConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func LoadManagerFromSettingsPath(ctx context.Context, path string) (*MCPManager, []error, error) {
	cfg, err := LoadMCPConfig(path)
	if err != nil {
		return nil, nil, err
	}
	if len(cfg.Servers) == 0 {
		return nil, nil, nil
	}

	manager := NewMCPManager(cfg)
	errs := manager.ConnectAll(ctx)
	return manager, errs, nil
}
