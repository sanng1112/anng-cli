package agent

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHeadlessExecutionFlow(t *testing.T) {
	t.Setenv("ANNG_TEST", "true")
	res, err := RunHeadless(context.Background(), "refactor task", true, false, false, false, 17)
	if err != nil {
		t.Fatalf("Headless execution failed: %v", err)
	}
	if res.FinishReason != "completed" {
		t.Errorf("Expected completed status, got %q", res.FinishReason)
	}
}

func TestResolveHeadlessMode(t *testing.T) {
	tests := []struct {
		name           string
		autoApprove    bool
		configPlanMode bool
		forcePlan      bool
		want           string
	}{
		{name: "default act mode", want: "act"},
		{name: "yolo mode", autoApprove: true, want: "yolo"},
		{name: "config plan mode wins", autoApprove: true, configPlanMode: true, want: "plan"},
		{name: "cli plan mode wins", autoApprove: true, forcePlan: true, want: "plan"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := resolveHeadlessMode(tc.autoApprove, tc.configPlanMode, tc.forcePlan)
			if got != tc.want {
				t.Fatalf("expected mode %q, got %q", tc.want, got)
			}
		})
	}
}

func TestRunHeadlessVerboseDoesNotFailInMockMode(t *testing.T) {
	t.Setenv("ANNG_TEST", "true")

	oldStderr := os.Stderr
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("failed to create stderr pipe: %v", err)
	}
	os.Stderr = w
	defer func() {
		os.Stderr = oldStderr
	}()

	res, err := RunHeadless(context.Background(), "refactor task", false, true, false, true, 5)
	_ = w.Close()
	output, _ := io.ReadAll(r)
	_ = r.Close()
	if err != nil {
		t.Fatalf("RunHeadless returned error: %v", err)
	}
	if res.FinishReason != "completed" {
		t.Fatalf("expected completed status, got %q", res.FinishReason)
	}
	if !strings.Contains(string(output), "Headless run: mode=plan") {
		t.Fatalf("expected verbose stderr to mention plan mode, got %q", string(output))
	}
}

func TestResolveHeadlessSettingsPathPrefersProjectSettings(t *testing.T) {
	projectRoot := t.TempDir()
	homeDir := t.TempDir()

	projectSettingsDir := filepath.Join(projectRoot, ".anng")
	if err := os.MkdirAll(projectSettingsDir, 0o755); err != nil {
		t.Fatalf("failed to create project settings dir: %v", err)
	}
	projectSettingsPath := filepath.Join(projectSettingsDir, "settings.json")
	if err := os.WriteFile(projectSettingsPath, []byte("{}"), 0o644); err != nil {
		t.Fatalf("failed to write project settings: %v", err)
	}

	got := resolveHeadlessSettingsPath(projectRoot, homeDir)
	if got != projectSettingsPath {
		t.Fatalf("expected project settings path %q, got %q", projectSettingsPath, got)
	}
}

func TestResolveHeadlessSettingsPathFallsBackToUserSettings(t *testing.T) {
	projectRoot := t.TempDir()
	homeDir := t.TempDir()

	got := resolveHeadlessSettingsPath(projectRoot, homeDir)
	want := filepath.Join(homeDir, ".anng", "settings.json")
	if got != want {
		t.Fatalf("expected fallback user settings path %q, got %q", want, got)
	}
}
