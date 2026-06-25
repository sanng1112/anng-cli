package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// Transport abstracts the MCP communication channel (stdio, or future SSE/WebSocket).
type Transport interface {
	// Send writes a JSON-RPC message and returns the response line.
	Send(ctx context.Context, request string) (string, error)
	// SendNotification writes a JSON-RPC notification (no response expected).
	SendNotification(ctx context.Context, request string) error
	// Close shuts down the transport.
	Close() error
	// Healthy returns true if the transport is operational.
	Healthy() bool
}

// StdioTransport implements Transport over stdin/stdout of a child process.
type StdioTransport struct {
	mu       sync.Mutex
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	reader   *bufio.Reader
	deadline time.Duration
}

// NewStdioTransport starts a subprocess and returns a transport connected to its stdio.
func NewStdioTransport(ctx context.Context, command string, args []string, env map[string]string) (*StdioTransport, error) {
	cmd := exec.CommandContext(ctx, command, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	// Set environment variables - start with a copy of the current env, then overlay
	cmd.Env = os.Environ()
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start command: %w", err)
	}

	return &StdioTransport{
		cmd:      cmd,
		stdin:    stdin,
		reader:   bufio.NewReader(stdout),
		deadline: 30 * time.Second,
	}, nil
}

// SendNotification writes a JSON-RPC notification (no response expected).
func (t *StdioTransport) SendNotification(ctx context.Context, request string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	_, err := io.WriteString(t.stdin, request+"\n")
	return err
}

// Send writes a JSON-RPC request and reads exactly one JSON-RPC response line.
func (t *StdioTransport) Send(ctx context.Context, request string) (string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if _, err := io.WriteString(t.stdin, request+"\n"); err != nil {
		return "", fmt.Errorf("write request: %w", err)
	}

	// Use a buffered channel so the goroutine can always send without blocking
	type readResult struct {
		line string
		err  error
	}
	resultChan := make(chan readResult, 1)

	go func() {
		line, err := t.reader.ReadString('\n')
		if err != nil {
			resultChan <- readResult{err: err}
		} else {
			resultChan <- readResult{line: strings.TrimRight(line, "\r\n")}
		}
	}()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case r := <-resultChan:
		if r.err != nil {
			return "", fmt.Errorf("read response: %w", r.err)
		}
		return r.line, nil
	}
}

// Close kills the child process and cleans up.
func (t *StdioTransport) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.cmd != nil && t.cmd.Process != nil {
		_ = t.cmd.Process.Kill()
		_ = t.cmd.Wait()
	}
	return nil
}

// Healthy checks if the transport process is still alive.
func (t *StdioTransport) Healthy() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.cmd != nil && t.cmd.Process != nil && t.cmd.ProcessState == nil
}

// JSONRPCRequest is a generic JSON-RPC 2.0 request.
type JSONRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// JSONRPCError represents a JSON-RPC error object.
type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func (e *JSONRPCError) Error() string {
	return fmt.Sprintf("JSON-RPC error %d: %s", e.Code, e.Message)
}

// GenericRPCResponse holds the raw fields of any JSON-RPC response.
type GenericRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *JSONRPCError   `json:"error,omitempty"`
}

// JSONRPCRequestToBytes marshals a JSONRPCRequest to bytes for sending.
func JSONRPCRequestToBytes(req JSONRPCRequest) ([]byte, error) {
	return json.Marshal(req)
}

// SendRPC is a helper that sends a JSON-RPC request and decodes the result.
func SendRPC[T any](ctx context.Context, tport Transport, method string, params interface{}) (*T, error) {
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}
	reqData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	respLine, err := tport.Send(ctx, string(reqData))
	if err != nil {
		return nil, err
	}

	var rpcResp GenericRPCResponse
	if err := json.Unmarshal([]byte(respLine), &rpcResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	if rpcResp.Error != nil {
		return nil, rpcResp.Error
	}
	if len(rpcResp.Result) == 0 {
		return nil, nil
	}

	var result T
	if err := json.Unmarshal(rpcResp.Result, &result); err != nil {
		return nil, fmt.Errorf("unmarshal result: %w", err)
	}
	return &result, nil
}
