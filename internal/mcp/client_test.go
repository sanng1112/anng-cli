package mcp

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMCPConfigParsing(t *testing.T) {
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
				"args": ["-e", "process.stdin.on('data', d => process.stdout.write(d));"]
			}
		}
	}`
	if err := os.WriteFile(configPath, []byte(configData), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadMCPConfig(configPath)
	if err != nil {
		t.Fatalf("Failed to load MCP config: %v", err)
	}

	server, exists := cfg.Servers["echo-server"]
	if !exists {
		t.Fatal("echo-server config should be parsed")
	}

	if server.Command != "node" {
		t.Fatalf("expected command 'node', got %q", server.Command)
	}
}

func TestLoadManagerFromSettingsPathWithoutServers(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "settings.json")
	if err := os.WriteFile(configPath, []byte(`{"model":"gpt-4o"}`), 0644); err != nil {
		t.Fatal(err)
	}

	manager, errs, err := LoadManagerFromSettingsPath(context.Background(), configPath)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if manager != nil {
		t.Fatal("expected nil manager when no mcpServers are configured")
	}
	if len(errs) != 0 {
		t.Fatalf("expected no connection errors, got %v", errs)
	}
}

func TestLoadManagerFromSettingsPathConnectsServers(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "settings.json")
	script := `
		const readline = require('readline');
		const rl = readline.createInterface({input: process.stdin, output: process.stdout});
		rl.on('line', (line) => {
			try {
				const req = JSON.parse(line);
				if (req.method === "initialize") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {protocolVersion: "2024-11-05", serverInfo: {name: "test-mcp", version: "1.0.0"}, capabilities: {tools: {}}}});
					console.log(resp);
				} else if (req.method === "tools/list") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {tools: [{name: "greet", description: "Say hello", inputSchema: {type: "object"}}]}});
					console.log(resp);
				} else if (req.method === "resources/list") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {resources: []}});
					console.log(resp);
				}
			} catch (e) {
				console.error("Error:", e.message);
			}
		});
	`
	configData := `{
		"mcpServers": {
			"test-mcp": {
				"command": "node",
				"args": ["-e", ` + strconv.Quote(script) + `]
			}
		}
	}`
	if err := os.WriteFile(configPath, []byte(configData), 0644); err != nil {
		t.Fatal(err)
	}

	manager, errs, err := LoadManagerFromSettingsPath(ctx, configPath)
	if err != nil {
		t.Fatalf("expected config to load, got %v", err)
	}
	if manager == nil {
		t.Fatal("expected non-nil manager")
	}
	defer manager.DisconnectAll()
	if len(errs) != 0 {
		t.Fatalf("expected no connection errors, got %v", errs)
	}

	server, ok := manager.GetServer("test-mcp")
	if !ok {
		t.Fatal("expected test-mcp server to be registered")
	}
	if server.Status != "connected" {
		t.Fatalf("expected server status connected, got %q", server.Status)
	}
	if len(server.Tools) != 1 || server.Tools[0].Name != "greet" {
		t.Fatalf("expected greet tool to be loaded, got %+v", server.Tools)
	}
}

func TestSendRPCWithStdioTransport(t *testing.T) {
	// Create a transport that communicates via a simple echo-like subprocess
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Use a simple node script that echoes JSON-RPC requests
	script := `
		const readline = require('readline');
		const rl = readline.createInterface({input: process.stdin, output: process.stdout});
		rl.on('line', (line) => {
			try {
				const req = JSON.parse(line);
				const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {protocolVersion: "2024-11-05", serverInfo: {name: "test", version: "1.0.0"}}});
				console.log(resp);
			} catch(e) {
				console.error("Error:", e.message);
			}
		});
	`

	transport, err := NewStdioTransport(ctx, "node", []string{"-e", script}, nil)
	if err != nil {
		t.Fatalf("Failed to create transport: %v", err)
	}
	defer transport.Close()

	result, err := SendRPC[InitializeResult](ctx, transport, "initialize", map[string]interface{}{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]interface{}{},
	})
	if err != nil {
		t.Fatalf("SendRPC failed: %v", err)
	}
	if result == nil {
		t.Fatal("expected result, got nil")
	}
	if result.ServerInfo.Name != "test" {
		t.Fatalf("expected server name 'test', got %q", result.ServerInfo.Name)
	}
}

func TestMCPClientListTools(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Simple node script that responds to tools/list
	script := `
		const readline = require('readline');
		const rl = readline.createInterface({input: process.stdin, output: process.stdout});
		rl.on('line', (line) => {
			try {
				const req = JSON.parse(line);
				if (req.method === "initialize") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {protocolVersion: "2024-11-05", serverInfo: {name: "test-tools", version: "1.0.0"}, capabilities: {tools: {}}}});
					console.log(resp);
				} else if (req.method === "tools/list") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {tools: [{name: "greet", description: "Say hello", inputSchema: {type: "object", properties: {name: {type: "string"}}}}]}});
					console.log(resp);
				} else if (req.method === "notifications/initialized") {
					// No response expected
				} else {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {}});
					console.log(resp);
				}
			} catch(e) {
				console.error("Error:", e.message);
			}
		});
	`

	transport, err := NewStdioTransport(ctx, "node", []string{"-e", script}, nil)
	if err != nil {
		t.Fatalf("Failed to create transport: %v", err)
	}
	defer transport.Close()

	client := NewMCPClient("test-tools", transport)
	initResult, err := client.Initialize(ctx)
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}
	_ = initResult

	tools, err := client.ListTools(ctx)
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}
	if len(tools) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(tools))
	}
	if tools[0].Name != "greet" {
		t.Fatalf("expected tool 'greet', got %q", tools[0].Name)
	}
}

func TestMCPClientCallTool(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	script := `
		const readline = require('readline');
		const rl = readline.createInterface({input: process.stdin, output: process.stdout});
		rl.on('line', (line) => {
			try {
				const req = JSON.parse(line);
				if (req.method === "initialize") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {protocolVersion: "2024-11-05", serverInfo: {name: "test-call", version: "1.0.0"}, capabilities: {tools: {}}}});
					console.log(resp);
				} else if (req.method === "tools/call") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {content: [{type: "text", text: "Hello, " + (req.params.arguments.name || "world") + "!"}]}});
					console.log(resp);
				} else if (req.method === "notifications/initialized") {
				} else {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {}});
					console.log(resp);
				}
			} catch(e) {
				console.error("Error:", e.message);
			}
		});
	`

	transport, err := NewStdioTransport(ctx, "node", []string{"-e", script}, nil)
	if err != nil {
		t.Fatalf("Failed to create transport: %v", err)
	}
	defer transport.Close()

	client := NewMCPClient("test-call", transport)
	_, err = client.Initialize(ctx)
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	result, err := client.CallTool(ctx, "greet", map[string]interface{}{"name": "Anng"})
	if err != nil {
		t.Fatalf("CallTool failed: %v", err)
	}
	if result == nil || len(result.Content) == 0 {
		t.Fatal("expected content in result")
	}
	if result.Content[0].Text != "Hello, Anng!" {
		t.Fatalf("expected 'Hello, Anng!', got %q", result.Content[0].Text)
	}
}

func TestMCPClientListResources(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	script := `
		const readline = require('readline');
		const rl = readline.createInterface({input: process.stdin, output: process.stdout});
		rl.on('line', (line) => {
			try {
				const req = JSON.parse(line);
				if (req.method === "initialize") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {protocolVersion: "2024-11-05", serverInfo: {name: "test-res", version: "1.0.0"}, capabilities: {resources: {}}}});
					console.log(resp);
				} else if (req.method === "resources/list") {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {resources: [{uri: "file:///test.txt", name: "Test File", mimeType: "text/plain"}]}});
					console.log(resp);
				} else if (req.method === "notifications/initialized") {
				} else {
					const resp = JSON.stringify({jsonrpc: "2.0", id: req.id, result: {}});
					console.log(resp);
				}
			} catch(e) {
				console.error("Error:", e.message);
			}
		});
	`

	transport, err := NewStdioTransport(ctx, "node", []string{"-e", script}, nil)
	if err != nil {
		t.Fatalf("Failed to create transport: %v", err)
	}
	defer transport.Close()

	client := NewMCPClient("test-res", transport)
	_, err = client.Initialize(ctx)
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	resources, err := client.ListResources(ctx)
	if err != nil {
		t.Fatalf("ListResources failed: %v", err)
	}
	if len(resources) != 1 {
		t.Fatalf("expected 1 resource, got %d", len(resources))
	}
	if resources[0].URI != "file:///test.txt" {
		t.Fatalf("expected resource URI 'file:///test.txt', got %q", resources[0].URI)
	}
}

func TestMCPManagerCreatesServerList(t *testing.T) {
	config := &MCPConfig{
		Servers: map[string]MCPServerConfig{
			"test": {Command: "node", Args: []string{"-e", "process.exit(0)"}},
		},
	}
	manager := NewMCPManager(config)
	names := manager.ServerNames()
	if len(names) != 1 || names[0] != "test" {
		t.Fatalf("expected 1 server named 'test', got %v", names)
	}
}

func TestToOpenAITools(t *testing.T) {
	tools := []ToolDescription{
		{
			Name:        "greet",
			Description: "Say hello",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{"name": map[string]interface{}{"type": "string"}},
			},
		},
	}

	result := ToOpenAITools("test-server", tools)
	if len(result) != 1 {
		t.Fatalf("expected 1 tool, got %d", len(result))
	}
	if result[0].Function.Name != "mcp__test-server__greet" {
		t.Fatalf("expected 'mcp__test-server__greet', got %q", result[0].Function.Name)
	}
}

func TestMCPToolServerAndName(t *testing.T) {
	server, tool := MCPToolServerAndName("mcp__filesystem__read")
	if server != "filesystem" || tool != "read" {
		t.Fatalf("expected server='filesystem', tool='read', got server=%q, tool=%q", server, tool)
	}

	server, tool = MCPToolServerAndName("invalid")
	if server != "" || tool != "" {
		t.Fatalf("expected empty for invalid input, got server=%q, tool=%q", server, tool)
	}
}

func TestJSONRPCError(t *testing.T) {
	err := &JSONRPCError{Code: -32601, Message: "Method not found"}
	if !strings.Contains(err.Error(), "Method not found") {
		t.Fatalf("expected error to contain 'Method not found', got %q", err.Error())
	}
}

func TestSendRPCErrorResponse(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	script := `
		const readline = require('readline');
		const rl = readline.createInterface({input: process.stdin, output: process.stdout});
		rl.on('line', (line) => {
			const resp = JSON.stringify({jsonrpc: "2.0", id: 1, error: {code: -32601, message: "Method not found"}});
			console.log(resp);
		});
	`

	transport, err := NewStdioTransport(ctx, "node", []string{"-e", script}, nil)
	if err != nil {
		t.Fatalf("Failed to create transport: %v", err)
	}
	defer transport.Close()

	_, err = SendRPC[InitializeResult](ctx, transport, "unknown_method", nil)
	if err == nil {
		t.Fatal("expected error for unknown method")
	}
	if !strings.Contains(err.Error(), "Method not found") {
		t.Fatalf("expected 'Method not found', got %q", err.Error())
	}
}
