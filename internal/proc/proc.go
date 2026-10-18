// Package proc starts helper programs, such as yt-dlp, without showing a
// console window for them on Windows.
package proc

import (
	"context"
	"os/exec"
)

// Command returns a command that runs name with args, killed when ctx is
// done.
func Command(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	hideWindow(cmd)
	return cmd
}
