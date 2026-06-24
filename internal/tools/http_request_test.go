package tools

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHttpRequestTool(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("mock response body content"))
	}))
	defer ts.Close()

	args := map[string]interface{}{
		"url":    ts.URL,
		"method": "GET",
	}

	res, err := HttpRequestTool(context.Background(), args)
	if err != nil {
		t.Fatalf("HttpRequest failed: %v", err)
	}

	if !strings.Contains(res, "mock response body content") {
		t.Errorf("Expected mock response body in output, got: %q", res)
	}
	if !strings.Contains(res, "200 OK") {
		t.Errorf("Expected status 200 OK in output, got: %q", res)
	}
}

func TestHttpRequestToolPost(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}
		w.Write([]byte("post received"))
	}))
	defer ts.Close()

	args := map[string]interface{}{
		"url":    ts.URL,
		"method": "POST",
		"body":   `{"key":"value"}`,
		"headers": map[string]interface{}{
			"Content-Type": "application/json",
		},
	}

	res, err := HttpRequestTool(context.Background(), args)
	if err != nil {
		t.Fatalf("HttpRequest POST failed: %v", err)
	}
	if !strings.Contains(res, "post received") {
		t.Errorf("Expected 'post received' in output, got: %q", res)
	}
}

func TestHttpRequestToolMissingURL(t *testing.T) {
	_, err := HttpRequestTool(context.Background(), map[string]interface{}{})
	if err == nil {
		t.Error("Expected error for missing URL, got nil")
	}
}
