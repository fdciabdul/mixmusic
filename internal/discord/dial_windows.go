//go:build windows

package discord

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"syscall"
)

// dial opens the first named pipe of the Discord app that is open.
func dial(context.Context) (io.ReadWriteCloser, error) {
	return dialPipes(pipeNames())
}

// pipeNames returns the named pipes the Discord app may open, in the order
// to try them: \\.\pipe\discord-ipc-0 to \\.\pipe\discord-ipc-9.
func pipeNames() []string {
	names := make([]string, 10)
	for i := range names {
		names[i] = `\\.\pipe\discord-ipc-` + strconv.Itoa(i)
	}
	return names
}

// dialPipes opens the first of the named pipes that exists, for overlapped
// I/O, which lets the pipe take deadlines. It returns ErrNotRunning when
// none exists.
func dialPipes(names []string) (io.ReadWriteCloser, error) {
	var failed error
	for _, name := range names {
		f, err := os.OpenFile(name, os.O_RDWR|syscall.FILE_FLAG_OVERLAPPED, 0)
		if err == nil {
			return f, nil
		}
		if failed == nil && !errors.Is(err, os.ErrNotExist) {
			failed = err // a pipe that exists but is busy, or not ours
		}
	}
	if failed != nil {
		return nil, fmt.Errorf("discord: %w", failed)
	}
	return nil, ErrNotRunning
}
