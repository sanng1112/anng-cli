package tools

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// HttpRequestTool makes an HTTP request with the specified method, headers, and body.
// Returns status, response headers, and truncated body.
func HttpRequestTool(ctx context.Context, args map[string]interface{}) (string, error) {
	url, ok := args["url"].(string)
	if !ok || url == "" {
		return "", errors.New("missing required argument 'url'")
	}

	method := "GET"
	if m, ok := args["method"].(string); ok && m != "" {
		method = strings.ToUpper(m)
	}

	var bodyReader io.Reader
	if b, ok := args["body"].(string); ok && b != "" {
		bodyReader = bytes.NewReader([]byte(b))
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return "", err
	}

	if headersMap, ok := args["headers"].(map[string]interface{}); ok {
		for k, v := range headersMap {
			if vs, ok := v.(string); ok {
				req.Header.Set(k, vs)
			}
		}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	bodyText := string(respBytes)
	maxChars := 20000
	if len(bodyText) > maxChars {
		bodyText = bodyText[:maxChars] + "\n\n...[TRUNCATED_DUE_TO_SIZE]..."
	}

	var headersBuilder strings.Builder
	for k, v := range resp.Header {
		headersBuilder.WriteString(fmt.Sprintf("%s: %s\n", k, strings.Join(v, ", ")))
	}

	output := fmt.Sprintf("Status: %s\nHeaders:\n%s\nBody:\n%s", resp.Status, headersBuilder.String(), bodyText)
	return output, nil
}
