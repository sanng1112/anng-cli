package mcp

import (
	"context"
	"fmt"
)

// MCPClient wraps a Transport with MCP protocol methods.
type MCPClient struct {
	Transport Transport
	Name      string
}

// InitializeResult is the response shape from the MCP initialize handshake.
type InitializeResult struct {
	ProtocolVersion string `json:"protocolVersion"`
	Capabilities    struct {
		Tools     *struct{} `json:"tools,omitempty"`
		Resources *struct{} `json:"resources,omitempty"`
	} `json:"capabilities,omitempty"`
	ServerInfo struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	} `json:"serverInfo,omitempty"`
}

// ToolDescription is a single tool advertised by an MCP server.
type ToolDescription struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}

// ListToolsResult is the response from tools/list.
type ListToolsResult struct {
	Tools []ToolDescription `json:"tools"`
}

// CallToolResult is the response from tools/call.
type CallToolResult struct {
	Content []ToolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

// ToolContent is a content item in a tool call response.
type ToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// ResourceDescription is a single resource advertised by an MCP server.
type ResourceDescription struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// ListResourcesResult is the response from resources/list.
type ListResourcesResult struct {
	Resources []ResourceDescription `json:"resources"`
}

// NewMCPClient creates a new MCP client for the given server name and transport.
func NewMCPClient(name string, transport Transport) *MCPClient {
	return &MCPClient{
		Transport: transport,
		Name:      name,
	}
}

// Initialize performs the MCP initialize handshake.
func (c *MCPClient) Initialize(ctx context.Context) (*InitializeResult, error) {
	result, err := SendRPC[InitializeResult](ctx, c.Transport, "initialize", map[string]interface{}{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]interface{}{},
	})
	if err != nil {
		return nil, fmt.Errorf("initialize %s: %w", c.Name, err)
	}

	// Send initialized notification (no response expected)
	notif := JSONRPCRequest{
		JSONRPC: "2.0",
		Method:  "notifications/initialized",
	}
	reqData, _ := JSONRPCRequestToBytes(notif)
	_ = c.Transport.SendNotification(ctx, string(reqData))

	return result, nil
}

// Close shuts down the underlying transport.
func (c *MCPClient) Close() error {
	return c.Transport.Close()
}

// Healthy returns true if the transport is still operational.
func (c *MCPClient) Healthy() bool {
	return c.Transport.Healthy()
}

// ListTools calls the tools/list method on the MCP server.
func (c *MCPClient) ListTools(ctx context.Context) ([]ToolDescription, error) {
	result, err := SendRPC[ListToolsResult](ctx, c.Transport, "tools/list", nil)
	if err != nil {
		return nil, fmt.Errorf("tools/list %s: %w", c.Name, err)
	}
	if result == nil {
		return nil, nil
	}
	return result.Tools, nil
}

// CallTool calls a tool on the MCP server.
func (c *MCPClient) CallTool(ctx context.Context, name string, arguments map[string]interface{}) (*CallToolResult, error) {
	result, err := SendRPC[CallToolResult](ctx, c.Transport, "tools/call", map[string]interface{}{
		"name":      name,
		"arguments": arguments,
	})
	if err != nil {
		return nil, fmt.Errorf("tools/call %s/%s: %w", c.Name, name, err)
	}
	return result, nil
}

// ListResources calls the resources/list method on the MCP server.
func (c *MCPClient) ListResources(ctx context.Context) ([]ResourceDescription, error) {
	result, err := SendRPC[ListResourcesResult](ctx, c.Transport, "resources/list", nil)
	if err != nil {
		return nil, fmt.Errorf("resources/list %s: %w", c.Name, err)
	}
	if result == nil {
		return nil, nil
	}
	return result.Resources, nil
}
