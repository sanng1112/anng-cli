package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestMCPConfigParsingAndClientInit(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mcp_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	configPath := filepath.Join(tempDir, "mcp-servers.json")
	configData := `{
		"mcpServers": {
			"echo-server": {
				"command": "node",
				"args": ["-e", "const readline = require('readline'); const rl = readline.createInterface({input: process.stdin, output: process.stdout}); rl.on('line', (line) => { console.log(line); });"]
			}
		}
	}`
	_ = os.WriteFile(configPath, []byte(configData), 0644)

	cfg, err := LoadMCPConfig(configPath)
	if err != nil {
		t.Fatalf("Failed to load MCP config: %v", err)
	}

	server, exists := cfg.Servers["echo-server"]
	if !exists {
		t.Fatal("echo-server config should be parsed")
	}

	// Khởi chạy tiến trình MCP Server thực tế qua stdin/stdout
	client, err := StartMCPServer(context.Background(), server.Command, server.Args)
	if err != nil {
		t.Fatalf("Failed to start MCP server: %v", err)
	}
	defer client.Close()

	if client.Cmd == nil {
		t.Error("Client command process should not be nil")
	}
}
