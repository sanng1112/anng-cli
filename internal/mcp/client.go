package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
)

type MCPClient struct {
	reader *bufio.Reader
	writer io.Writer
}

type InitializeResult struct {
	ProtocolVersion string `json:"protocolVersion"`
}

type JSONRPCResponse struct {
	JSONRPC string           `json:"jsonrpc"`
	Result  InitializeResult `json:"result"`
	Error   interface{}      `json:"error,omitempty"`
	ID      int              `json:"id"`
}

func NewMCPClient(r io.Reader, w io.Writer) *MCPClient {
	return &MCPClient{
		reader: bufio.NewReader(r),
		writer: w,
	}
}

func (c *MCPClient) Initialize(ctx context.Context) (*InitializeResult, error) {
	req := `{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}` + "\n"
	if _, err := io.WriteString(c.writer, req); err != nil {
		return nil, err
	}

	lineChan := make(chan string, 1)
	errChan := make(chan error, 1)

	go func() {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			errChan <- err
		} else {
			lineChan <- line
		}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case err := <-errChan:
		return nil, err
	case line := <-lineChan:
		var resp JSONRPCResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			return nil, err
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("JSON-RPC error returned: %v", resp.Error)
		}
		return &resp.Result, nil
	}
}
