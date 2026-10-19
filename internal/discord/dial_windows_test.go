//go:build windows

package discord

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	createNamedPipe  = kernel32.NewProc("CreateNamedPipeW")
	connectNamedPipe = kernel32.NewProc("ConnectNamedPipe")
)

// listenPipe creates a named pipe that one client can open, and returns
// the server's end once a client opened it.
func listenPipe(t *testing.T, name string) func() *os.File {
	t.Helper()
	const pipeAccessDuplex = 0x3
	p, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		t.Fatal(err)
	}
	h, _, err := createNamedPipe.Call(uintptr(unsafe.Pointer(p)), pipeAccessDuplex, 0, 1, 4096, 4096, 0, 0)
	if syscall.Handle(h) == syscall.InvalidHandle {
		t.Fatalf("creating %s: %v", name, err)
	}
	server := os.NewFile(h, name)
	t.Cleanup(func() { server.Close() })
	return func() *os.File {
		t.Helper()
		const errorPipeConnected = 535
		if ok, _, err := connectNamedPipe.Call(h, 0); ok == 0 && err != syscall.Errno(errorPipeConnected) {
			t.Fatalf("waiting for the client: %v", err)
		}
		// Stop a read the client never answers.
		timer := time.AfterFunc(5*time.Second, func() { server.Close() })
		t.Cleanup(func() { timer.Stop() })
		return server
	}
}

func testPipe(t *testing.T) string {
	return fmt.Sprintf(`\\.\pipe\mixmusic-discord-test-%d-%s`, os.Getpid(), t.Name())
}

func TestDialPipesNotRunning(t *testing.T) {
	_, err := dialPipes([]string{testPipe(t) + "-0", testPipe(t) + "-1"})
	if !errors.Is(err, ErrNotRunning) {
		t.Errorf("err = %v, want ErrNotRunning", err)
	}
}

func TestDialPipe(t *testing.T) {
	name := testPipe(t)
	accept := listenPipe(t, name)
	rwc, err := dialPipes([]string{name + "-missing", name})
	if err != nil {
		t.Fatal(err)
	}
	defer rwc.Close()
	server := accept()

	if err := writeFrame(rwc, opFrame, []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}
	if op, payload, err := readFrame(server); err != nil || op != opFrame || string(payload) != `{"a":1}` {
		t.Fatalf("the server read %d %q, %v", op, payload, err)
	}

	d, ok := rwc.(deadliner)
	if !ok {
		t.Fatal("the pipe has no deadlines")
	}
	if err := d.SetDeadline(time.Now().Add(50 * time.Millisecond)); err != nil {
		t.Fatalf("setting a deadline: %v", err)
	}
	if _, _, err := readFrame(rwc); !errors.Is(err, os.ErrDeadlineExceeded) {
		t.Errorf("reading past the deadline: %v", err)
	}
}

func TestClientOverPipe(t *testing.T) {
	name := testPipe(t)
	accept := listenPipe(t, name)
	c := New("1234")
	c.dial = func(context.Context) (io.ReadWriteCloser, error) { return dialPipes([]string{name}) }
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	server := accept()

	op, payload, err := readFrame(server)
	if err != nil || op != opHandshake || string(payload) != `{"v":1,"client_id":"1234"}` {
		t.Fatalf("handshake = %d %s, %v", op, payload, err)
	}
	writeFrame(server, opFrame, []byte(`{"cmd":"DISPATCH","evt":"READY","data":{"v":1}}`))
	_, payload, err = readFrame(server)
	if err != nil {
		t.Fatal(err)
	}
	var cmd sentCommand
	if err := json.Unmarshal(payload, &cmd); err != nil || cmd.Cmd != "SET_ACTIVITY" {
		t.Fatalf("command = %s, %v", payload, err)
	}
	writeFrame(server, opPing, []byte(`{}`))
	if op, _, err := readFrame(server); err != nil || op != opPong {
		t.Fatalf("answer to the ping = %d, %v", op, err)
	}
	writeFrame(server, opFrame, []byte(`{"cmd":"SET_ACTIVITY","nonce":"`+cmd.Nonce+`","data":{}}`))
	if err := wait(t, done); err != nil {
		t.Fatal(err)
	}
	if err := c.Close(); err != nil {
		t.Errorf("close = %v", err)
	}
}
