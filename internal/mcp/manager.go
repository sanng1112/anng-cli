package mcp

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// ManagedServer holds one MCP server instance and its state.
type ManagedServer struct {
	Name       string
	Config     MCPServerConfig
	Client     *MCPClient
	Status     string // "disconnected", "connecting", "connected", "error"
	LastError  string
	Tools      []ToolDescription
	Resources  []ResourceDescription
	Reconnect  bool
	RetryCount int
}

// MCPManager manages the lifecycle of multiple MCP servers.
type MCPManager struct {
	mu      sync.RWMutex
	servers map[string]*ManagedServer
	config  *MCPConfig
}

// NewMCPManager creates a manager from config.
func NewMCPManager(config *MCPConfig) *MCPManager {
	manager := &MCPManager{
		servers: make(map[string]*ManagedServer),
		config:  config,
	}
	for name, cfg := range config.Servers {
		manager.servers[name] = &ManagedServer{
			Name:      name,
			Config:    cfg,
			Status:    "disconnected",
			Reconnect: true,
		}
	}
	return manager
}

// ConnectAll starts all configured MCP servers and performs initialize handshake.
func (m *MCPManager) ConnectAll(ctx context.Context) []error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var errs []error
	for name, server := range m.servers {
		if server.Status == "connected" {
			continue
		}
		if err := m.connectServer(ctx, name); err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}

// Connect starts a single MCP server by name.
func (m *MCPManager) Connect(ctx context.Context, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	_, exists := m.servers[name]
	if !exists {
		return fmt.Errorf("server %q not found in config", name)
	}
	return m.connectServer(ctx, name)
}

func (m *MCPManager) connectServer(ctx context.Context, name string) error {
	server := m.servers[name]
	server.Status = "connecting"

	transport, err := NewStdioTransport(ctx, server.Config.Command, server.Config.Args, server.Config.Env)
	if err != nil {
		server.Status = "error"
		server.LastError = err.Error()
		return fmt.Errorf("start %s: %w", name, err)
	}

	client := NewMCPClient(name, transport)
	initResult, err := client.Initialize(ctx)
	if err != nil {
		transport.Close()
		server.Status = "error"
		server.LastError = err.Error()
		return fmt.Errorf("init %s: %w", name, err)
	}

	server.Client = client
	server.Status = "connected"
	server.LastError = ""
	server.RetryCount = 0

	// Discover tools
	tools, err := client.ListTools(ctx)
	if err != nil {
		log.Printf("MCP %s: tools/list failed (non-fatal): %v", name, err)
	} else {
		server.Tools = tools
	}

	// Discover resources
	resources, err := client.ListResources(ctx)
	if err != nil {
		log.Printf("MCP %s: resources/list failed (non-fatal): %v", name, err)
	} else {
		server.Resources = resources
	}

	_ = initResult
	log.Printf("MCP %s: connected (%d tools, %d resources)", name, len(server.Tools), len(server.Resources))
	return nil
}

// DisconnectAll shuts down all MCP servers.
func (m *MCPManager) DisconnectAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for name, server := range m.servers {
		if server.Client != nil {
			_ = server.Client.Close()
		}
		server.Status = "disconnected"
		server.Client = nil
		log.Printf("MCP %s: disconnected", name)
	}
}

// GetServer returns the managed server by name.
func (m *MCPManager) GetServer(name string) (*ManagedServer, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.servers[name]
	return s, ok
}

// ServerNames returns all configured server names.
func (m *MCPManager) ServerNames() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var names []string
	for n := range m.servers {
		names = append(names, n)
	}
	return names
}

// ServerStatuses returns the status of all servers.
func (m *MCPManager) ServerStatuses() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	statuses := make(map[string]string)
	for n, s := range m.servers {
		statuses[n] = s.Status
	}
	return statuses
}

// AllTools returns all tools from all connected MCP servers.
func (m *MCPManager) AllTools() map[string][]ToolDescription {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string][]ToolDescription)
	for name, server := range m.servers {
		if server.Status == "connected" && len(server.Tools) > 0 {
			result[name] = server.Tools
		}
	}
	return result
}

// CallTool calls a tool on the appropriate MCP server and returns the result.
func (m *MCPManager) CallTool(ctx context.Context, serverName string, toolName string, args map[string]interface{}) (*CallToolResult, error) {
	m.mu.RLock()
	server, exists := m.servers[serverName]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("MCP server %q not found", serverName)
	}
	if server.Status != "connected" || server.Client == nil {
		return nil, fmt.Errorf("MCP server %q not connected", serverName)
	}

	return server.Client.CallTool(ctx, toolName, args)
}

// AutoReconnectLoop runs a background loop that checks server health and reconnects.
func (m *MCPManager) AutoReconnectLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.reconnectFailed(ctx)
		}
	}
}

func (m *MCPManager) reconnectFailed(ctx context.Context) {
	// Collect servers that need reconnection under a short lock, then reconnect outside the lock
	type reconnectJob struct {
		Name       string
		RetryCount int
	}
	var toReconnect []reconnectJob

	m.mu.Lock()
	for name, server := range m.servers {
		if !server.Reconnect {
			continue
		}
		if server.Status == "connected" && server.Client != nil && !server.Client.Healthy() {
			server.Status = "disconnected"
			server.LastError = "connection lost"
		}
		if server.Status == "disconnected" || server.Status == "error" {
			server.RetryCount++
			backoff := time.Duration(min(server.RetryCount, 5)) * 2 * time.Second
			log.Printf("MCP %s: reconnecting (attempt %d) after %v", name, server.RetryCount, backoff)
			toReconnect = append(toReconnect, reconnectJob{Name: name, RetryCount: server.RetryCount})
		}
	}
	m.mu.Unlock()

	// Reconnect outside the lock so other operations are not blocked
	for _, job := range toReconnect {
		m.mu.Lock()
		server := m.servers[job.Name]
		server.RetryCount = job.RetryCount
		m.mu.Unlock()

		_ = m.connectServer(ctx, job.Name)
	}
}
