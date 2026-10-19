//go:build unix

package discord

import (
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestSocketPaths(t *testing.T) {
	env := map[string]string{"XDG_RUNTIME_DIR": "/run/user/1000", "TMPDIR": "/tmp/", "TEMP": "/var/tmp"}
	paths := socketPaths(func(k string) string { return env[k] })
	// Three folders, /tmp once, each with seven sandboxes of ten sockets.
	if len(paths) != 3*7*10 {
		t.Errorf("%d paths, want 210", len(paths))
	}
	if paths[0] != "/run/user/1000/discord-ipc-0" || paths[9] != "/run/user/1000/discord-ipc-9" {
		t.Errorf("paths begin %q", paths[:10])
	}
	for _, want := range []string{
		"/run/user/1000/app/com.discordapp.Discord/discord-ipc-0",
		"/run/user/1000/app/com.discordapp.DiscordCanary/discord-ipc-0",
		"/run/user/1000/app/dev.vencord.Vesktop/discord-ipc-0",
		"/run/user/1000/snap.discord/discord-ipc-0",
		"/run/user/1000/.flatpak/com.discordapp.Discord/xdg-run/discord-ipc-0",
		"/tmp/discord-ipc-0",
		"/var/tmp/discord-ipc-3",
	} {
		if !slices.Contains(paths, want) {
			t.Errorf("no %s", want)
		}
	}
	if i, j := slices.Index(paths, "/run/user/1000/snap.discord/discord-ipc-0"), slices.Index(paths, "/tmp/discord-ipc-0"); i > j {
		t.Error("/tmp comes before $XDG_RUNTIME_DIR")
	}

	if paths := socketPaths(func(string) string { return "" }); paths[0] != "/tmp/discord-ipc-0" || len(paths) != 70 {
		t.Errorf("without the environment: %d paths, first %s", len(paths), paths[0])
	}
}

func TestDialSockets(t *testing.T) {
	dir, err := os.MkdirTemp("", "mmdc")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	paths := []string{filepath.Join(dir, "discord-ipc-0"), filepath.Join(dir, "snap.discord", "discord-ipc-0"), filepath.Join(dir, "discord-ipc-1")}

	if _, err := dialSockets(context.Background(), paths); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("no sockets: %v, want ErrNotRunning", err)
	}

	// A socket a Discord app left behind when it quit.
	stale, err := net.ListenUnix("unix", &net.UnixAddr{Name: paths[0], Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	stale.SetUnlinkOnClose(false)
	stale.Close()
	if _, err := dialSockets(context.Background(), paths); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("a stale socket: %v, want ErrNotRunning", err)
	}

	l, err := net.Listen("unix", paths[2])
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	accepted := make(chan net.Conn, 1)
	go func() {
		c, err := l.Accept()
		if err == nil {
			accepted <- c
		}
	}()
	rwc, err := dialSockets(context.Background(), paths)
	if err != nil {
		t.Fatal(err)
	}
	defer rwc.Close()
	server := <-accepted
	defer server.Close()
	if err := writeFrame(rwc, opPing, []byte("{}")); err != nil {
		t.Fatal(err)
	}
	if op, payload, err := readFrame(server); err != nil || op != opPing || string(payload) != "{}" {
		t.Errorf("the server read %d %q, %v", op, payload, err)
	}
	if _, ok := rwc.(deadliner); !ok {
		t.Error("the socket has no deadlines")
	}
}
