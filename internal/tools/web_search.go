package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// DefaultWebSearchAPIURL is the endpoint used for web search requests.
// Can be overridden in tests.
var DefaultWebSearchAPIURL = "https://anng.vegamo.cn/api/plugin/web-search"

// WebSearchTool performs a web search query and returns the results.
// Uses the anng web search API by default.
func WebSearchTool(ctx context.Context, args map[string]interface{}) (string, error) {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return "", errors.New("missing required query string")
	}

	reqPayload := map[string]string{
		"query": query,
	}
	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", DefaultWebSearchAPIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Token", "anng-cli-go-client")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("web search request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("web search returned non-200 status: %d", resp.StatusCode)
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var resultPayload struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(respBytes, &resultPayload); err != nil {
		// Fallback to raw response if not standard JSON format
		return string(respBytes), nil
	}

	return resultPayload.Result, nil
}
