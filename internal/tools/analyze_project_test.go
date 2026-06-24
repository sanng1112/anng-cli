package tools

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"anng-cli/internal/contextkeys"
)

func TestAnalyzeProjectTool(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_project")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Create a subdirectory with a Go file
	srcDir := filepath.Join(tempDir, "src")
	if err := os.MkdirAll(srcDir, 0755); err != nil {
		t.Fatal(err)
	}

	sampleGo := filepath.Join(srcDir, "main.go")
	content := `package main

type MyStruct struct{}

func MyFunc() {}
`
	if err := os.WriteFile(sampleGo, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, tempDir)
	args := map[string]interface{}{
		"depth": float64(3),
	}

	res, err := AnalyzeProjectTool(ctx, args)
	if err != nil {
		t.Fatalf("Analyze failed: %v", err)
	}

	if !strings.Contains(res, "MyStruct") {
		t.Errorf("Expected MyStruct in semantic map, got: %q", res)
	}
	if !strings.Contains(res, "MyFunc") {
		t.Errorf("Expected MyFunc in semantic map, got: %q", res)
	}
}

func TestAnalyzeProjectToolDefaultRoot(t *testing.T) {
	// Should not crash with default context (no project root set)
	ctx := context.Background()
	args := map[string]interface{}{}

	res, err := AnalyzeProjectTool(ctx, args)
	if err != nil {
		t.Fatalf("Expected no error with default root, got: %v", err)
	}
	if res == "" {
		t.Error("Expected non-empty output")
	}
}

func TestASTAnalyzeProjectTool(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "test_ast_project")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	srcDir := filepath.Join(tempDir, "src")
	_ = os.MkdirAll(srcDir, 0755)

	sampleGo := filepath.Join(srcDir, "service.go")
	content := `package src

type Runner interface {
	Run(ctx context.Context) error
}

type MyRunner struct {
	Name string
}

func (r *MyRunner) Run(ctx context.Context) error {
	return nil
}
`
	_ = os.WriteFile(sampleGo, []byte(content), 0644)

	ctx := context.WithValue(context.Background(), contextkeys.ProjectRootKey, tempDir)
	args := map[string]interface{}{"depth": float64(3)}

	res, err := AnalyzeProjectTool(ctx, args)
	if err != nil {
		t.Fatalf("AST analyze failed: %v", err)
	}

	if !strings.Contains(res, "Runner [Interface]") {
		t.Errorf("Expected interface details in output, got: %q", res)
	}
	if !strings.Contains(res, "MyRunner [Struct]") {
		t.Errorf("Expected struct details in output, got: %q", res)
	}
	if !strings.Contains(res, "Method: Run") {
		t.Errorf("Expected struct method details in output, got: %q", res)
	}
}
