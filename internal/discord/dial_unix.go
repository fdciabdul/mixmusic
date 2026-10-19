//go:build unix

package discord

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"syscall"
)

// sandboxes are the folders, under a temporary or runtime folder, where
// the Discord app packaged as a Flatpak or a Snap puts its socket.
var sandboxes = []string{
	"",
	"app/com.discordapp.Discord",
	"snap.discord",
	".flatpak/com.discordapp.Discord/xdg-run",
}

// dial connects to the first socket of the Discord app that answers.
func dial(ctx context.Context) (io.ReadWriteCloser, error) {
	return dialSockets(ctx, socketPaths(os.Getenv))
}

// socketPaths returns where the Discord app may have its socket,
// discord-ipc-0 to discord-ipc-9, in the order to try them: in
// $XDG_RUNTIME_DIR, $TMPDIR, $TMP, $TEMP and /tmp, and in the sandboxes
// under each.
func socketPaths(getenv func(string) string) []string {
	var paths []string
	seen := map[string]bool{}
	for _, base := range []string{getenv("XDG_RUNTIME_DIR"), getenv("TMPDIR"), getenv("TMP"), getenv("TEMP"), "/tmp"} {
		if base == "" || seen[filepath.Clean(base)] {
			continue
		}
		seen[filepath.Clean(base)] = true
		for _, sandbox := range sandboxes {
			for i := range 10 {
				paths = append(paths, filepath.Join(base, sandbox, "discord-ipc-"+strconv.Itoa(i)))
			}
		}
	}
	return paths
}

// dialSockets connects to the first of the sockets that answers. It
// returns ErrNotRunning when none exists, or when the only ones are left
// behind by a Discord app that quit.
func dialSockets(ctx context.Context, paths []string) (io.ReadWriteCloser, error) {
	var d net.Dialer
	var failed error
	for _, path := range paths {
		if _, err := os.Stat(path); err != nil {
			continue
		}
		c, err := d.DialContext(ctx, "unix", path)
		if err == nil {
			return c, nil
		}
		if ctx.Err() != nil {
			return nil, fmt.Errorf("discord: %w", ctx.Err())
		}
		if failed == nil && !errors.Is(err, syscall.ECONNREFUSED) && !errors.Is(err, os.ErrNotExist) {
			failed = err
		}
	}
	if failed != nil {
		return nil, fmt.Errorf("discord: %w", failed)
	}
	return nil, ErrNotRunning
}
