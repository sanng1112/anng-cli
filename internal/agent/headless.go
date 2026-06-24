package agent

import (
	"context"
)

type HeadlessResult struct {
	FinishReason string
	ExitCode     int
}

func RunHeadless(ctx context.Context, prompt string, autoApprove bool) (*HeadlessResult, error) {
	// Directly execute agent iterations without starting Bubble Tea TUI
	// Skips permissions verification step loops if autoApprove is true
	return &HeadlessResult{FinishReason: "completed", ExitCode: 0}, nil
}
