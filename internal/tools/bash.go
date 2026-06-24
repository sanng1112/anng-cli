package tools

import (
	"context"
	"io"
	"os/exec"
	"github.com/creack/pty"
)

func ExecuteBashCommand(ctx context.Context, command string, cwd string) (string, error) {
	c := exec.CommandContext(ctx, "bash", "-c", command)
	c.Dir = cwd

	// Start command inside a PTY to emulate an interactive shell session, bypasses stdin pipe blocks
	f, err := pty.Start(c)
	if err != nil {
		return "", err
	}
	defer f.Close()

	// Read outputs
	buf := make([]byte, 1024)
	var outputBytes []byte
	for {
		n, err := f.Read(buf)
		if n > 0 {
			outputBytes = append(outputBytes, buf[:n]...)
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			// pty returns specific error when shell terminates
			break
		}
	}
	return string(outputBytes), nil
}
