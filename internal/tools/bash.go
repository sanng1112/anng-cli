package tools

import (
	"context"
	"io"
	"os/exec"
	"github.com/creack/pty"
)

var BashOutputCallback func(command string, output string)
var PermissionCheck func(command string, cwd string) error

func ExecuteBashCommand(ctx context.Context, command string, cwd string) (string, error) {
	if PermissionCheck != nil {
		if err := PermissionCheck(command, cwd); err != nil {
			return "", err
		}
	}

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
			chunk := buf[:n]
			outputBytes = append(outputBytes, chunk...)
			if BashOutputCallback != nil {
				BashOutputCallback(command, string(chunk))
			}
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
