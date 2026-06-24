package mcp

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestJSONRPCExchange(t *testing.T) {
	inputReader, inputWriter := io.Pipe()
	outputReader, outputWriter := io.Pipe()

	client := NewMCPClient(inputReader, outputWriter)

	// Simulate MCP server mock reply
	go func() {
		buf := make([]byte, 512)
		n, _ := outputReader.Read(buf)
		request := string(buf[:n])
		if strings.Contains(request, "initialize") {
			io.WriteString(inputWriter, `{"jsonrpc":"2.0","result":{"protocolVersion":"2024-11-05"},"id":1}`+"\n")
		}
	}()

	res, err := client.Initialize(context.Background())
	if err != nil {
		t.Fatalf("MCP initialization failed: %v", err)
	}
	if res.ProtocolVersion != "2024-11-05" {
		t.Errorf("Expected version 2024-11-05, got %q", res.ProtocolVersion)
	}
}
