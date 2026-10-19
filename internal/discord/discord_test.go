package discord

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeDiscord hands the test the Discord app's end of each connection a
// client dials.
type fakeDiscord struct {
	conns chan net.Conn
	dials atomic.Int32
	// noDeadlines hides the deadlines of the client's end.
	noDeadlines bool
}

func newFake(t *testing.T) (*Client, *fakeDiscord) {
	t.Helper()
	f := &fakeDiscord{conns: make(chan net.Conn, 8)}
	var mu sync.Mutex
	var opened []net.Conn
	t.Cleanup(func() {
		mu.Lock()
		defer mu.Unlock()
		for _, c := range opened {
			c.Close()
		}
	})
	c := New("1234")
	c.dial = func(context.Context) (io.ReadWriteCloser, error) {
		client, server := net.Pipe()
		mu.Lock()
		opened = append(opened, client, server)
		mu.Unlock()
		f.dials.Add(1)
		f.conns <- server
		if f.noDeadlines {
			return struct{ io.ReadWriteCloser }{client}, nil
		}
		return client, nil
	}
	return c, f
}

// accept returns the Discord app's end of the next connection.
func (f *fakeDiscord) accept(t *testing.T) *peer {
	t.Helper()
	select {
	case c := <-f.conns:
		return &peer{t: t, conn: c}
	case <-time.After(3 * time.Second):
		t.Fatal("the client did not connect")
		return nil
	}
}

// peer is the Discord app's end of a connection.
type peer struct {
	t    *testing.T
	conn net.Conn
}

func (p *peer) readRaw() (opcode, []byte) {
	p.t.Helper()
	p.conn.SetDeadline(time.Now().Add(3 * time.Second))
	op, payload, err := readFrame(p.conn)
	if err != nil {
		p.t.Fatalf("reading a frame: %v", err)
	}
	return op, payload
}

func (p *peer) send(op opcode, v any) {
	p.t.Helper()
	payload, err := json.Marshal(v)
	if err != nil {
		p.t.Fatal(err)
	}
	p.conn.SetDeadline(time.Now().Add(3 * time.Second))
	if err := writeFrame(p.conn, op, payload); err != nil {
		p.t.Fatalf("writing a frame: %v", err)
	}
}

// handshake reads the client's handshake, answers READY and returns the
// handshake.
func (p *peer) handshake() []byte {
	p.t.Helper()
	op, payload := p.readRaw()
	if op != opHandshake {
		p.t.Fatalf("opcode %d, want the handshake", op)
	}
	p.send(opFrame, map[string]any{"cmd": "DISPATCH", "evt": "READY", "nonce": nil,
		"data": map[string]any{"v": 1, "user": map[string]any{"username": "someone"}}})
	return payload
}

// sentCommand is a command as the client sent it.
type sentCommand struct {
	Cmd   string `json:"cmd"`
	Nonce string `json:"nonce"`
	Args  struct {
		PID      int             `json:"pid"`
		Activity json.RawMessage `json:"activity"`
	} `json:"args"`
}

// readCommand reads a command without answering it.
func (p *peer) readCommand() sentCommand {
	p.t.Helper()
	op, payload := p.readRaw()
	if op != opFrame {
		p.t.Fatalf("opcode %d, want a frame", op)
	}
	var cmd sentCommand
	if err := json.Unmarshal(payload, &cmd); err != nil {
		p.t.Fatalf("decoding %s: %v", payload, err)
	}
	return cmd
}

// command reads a command and answers it as done.
func (p *peer) command() sentCommand {
	p.t.Helper()
	cmd := p.readCommand()
	p.send(opFrame, map[string]any{"cmd": cmd.Cmd, "evt": nil, "nonce": cmd.Nonce, "data": map[string]any{}})
	return cmd
}

// closed reports whether the client closed its end.
func (p *peer) closed() bool {
	p.conn.SetDeadline(time.Now().Add(3 * time.Second))
	_, _, err := readFrame(p.conn)
	return errors.Is(err, io.EOF) || errors.Is(err, io.ErrClosedPipe)
}

// async runs call in the background and returns its error on the channel.
func async(call func() error) <-chan error {
	ch := make(chan error, 1)
	go func() { ch <- call() }()
	return ch
}

func wait(t *testing.T, ch <-chan error) error {
	t.Helper()
	select {
	case err := <-ch:
		return err
	case <-time.After(5 * time.Second):
		t.Fatal("the call did not return")
		return nil
	}
}

func track(title string) Activity {
	return Activity{Type: Listening, Details: title, State: "Some Artist"}
}

func TestHandshake(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	if got, want := string(p.handshake()), `{"v":1,"client_id":"1234"}`; got != want {
		t.Errorf("handshake = %s, want %s", got, want)
	}
	p.command()
	if err := wait(t, done); err != nil {
		t.Fatal(err)
	}
}

func TestHandshakeError(t *testing.T) {
	answers := map[string]func(p *peer){
		"close": func(p *peer) {
			p.send(opClose, map[string]any{"code": 4000, "message": "Invalid Client ID"})
		},
		"error event": func(p *peer) {
			p.send(opFrame, map[string]any{"cmd": "DISPATCH", "evt": "ERROR", "nonce": nil,
				"data": map[string]any{"code": 4000, "message": "Invalid Client ID"}})
		},
	}
	for name, answer := range answers {
		t.Run(name, func(t *testing.T) {
			c, f := newFake(t)
			done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
			p := f.accept(t)
			p.readRaw()
			answer(p)
			err := wait(t, done)
			var de *Error
			if !errors.As(err, &de) || de.Code != 4000 || de.Message != "Invalid Client ID" {
				t.Fatalf("err = %v, want Discord's error 4000", err)
			}
			if !p.closed() {
				t.Error("the client kept the connection")
			}

			done = async(func() error { return c.SetActivity(context.Background(), track("Song")) })
			p = f.accept(t)
			p.handshake()
			p.command()
			if err := wait(t, done); err != nil || f.dials.Load() != 2 {
				t.Errorf("after the error: err = %v, %d dials", err, f.dials.Load())
			}
		})
	}
}

func TestSetActivityJSON(t *testing.T) {
	c, f := newFake(t)
	start := time.UnixMilli(1_700_000_000_123)
	a := Activity{
		Type:       Listening,
		Details:    "Song",
		State:      "Some Artist, Another",
		Start:      start,
		End:        start.Add(3*time.Minute + 500*time.Millisecond),
		LargeImage: "https://lh3.googleusercontent.com/art=w544-h544",
		LargeText:  "Album",
	}
	done := async(func() error { return c.SetActivity(context.Background(), a) })
	p := f.accept(t)
	p.handshake()
	cmd := p.command()
	if err := wait(t, done); err != nil {
		t.Fatal(err)
	}
	if cmd.Cmd != "SET_ACTIVITY" || cmd.Nonce == "" || cmd.Args.PID != os.Getpid() {
		t.Errorf("command = %+v", cmd)
	}
	want := `{"type":2,"details":"Song","state":"Some Artist, Another",` +
		`"timestamps":{"start":1700000000123,"end":1700000180623},` +
		`"assets":{"large_image":"https://lh3.googleusercontent.com/art=w544-h544","large_text":"Album"}}`
	if got := string(cmd.Args.Activity); got != want {
		t.Errorf("activity = %s\nwant %s", got, want)
	}
}

func TestNoncesDiffer(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("One")) })
	p := f.accept(t)
	p.handshake()
	first := p.command()
	wait(t, done)
	done = async(func() error { return c.SetActivity(context.Background(), track("Two")) })
	second := p.command()
	if err := wait(t, done); err != nil {
		t.Fatal(err)
	}
	if first.Nonce == second.Nonce {
		t.Errorf("both commands have the nonce %q", first.Nonce)
	}
}

func TestClear(t *testing.T) {
	c, f := newFake(t)
	if err := c.Clear(context.Background()); err != nil || f.dials.Load() != 0 {
		t.Fatalf("clearing unconnected: err = %v, %d dials", err, f.dials.Load())
	}
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	p.handshake()
	p.command()
	wait(t, done)

	done = async(func() error { return c.Clear(context.Background()) })
	cmd := p.command()
	if err := wait(t, done); err != nil {
		t.Fatal(err)
	}
	if cmd.Cmd != "SET_ACTIVITY" || string(cmd.Args.Activity) != "null" || cmd.Args.PID != os.Getpid() {
		t.Errorf("clear = %+v, activity %s", cmd, cmd.Args.Activity)
	}
	// Cleared already: nothing to send.
	if err := wait(t, async(func() error { return c.Clear(context.Background()) })); err != nil {
		t.Fatal(err)
	}
}

func TestSkipsTheSameActivity(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("One")) })
	p := f.accept(t)
	p.handshake()
	p.command()
	wait(t, done)

	// The same again sends nothing, so the next command the app reads is
	// the different one.
	if err := wait(t, async(func() error { return c.SetActivity(context.Background(), track("One")) })); err != nil {
		t.Fatal(err)
	}
	done = async(func() error { return c.SetActivity(context.Background(), track("Two")) })
	cmd := p.command()
	wait(t, done)
	if want := `{"type":2,"details":"Two","state":"Some Artist"}`; string(cmd.Args.Activity) != want {
		t.Errorf("activity = %s, want %s", cmd.Args.Activity, want)
	}
}

func TestErrorAnswer(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	p.handshake()
	cmd := p.readCommand()
	p.send(opFrame, map[string]any{"cmd": "SET_ACTIVITY", "evt": "ERROR", "nonce": cmd.Nonce,
		"data": map[string]any{"code": 4000, "message": `child "activity" fails because [child "state" fails]`}})
	err := wait(t, done)
	var de *Error
	if !errors.As(err, &de) || de.Code != 4000 || de.Message != `child "activity" fails because [child "state" fails]` {
		t.Fatalf("err = %v", err)
	}
	if got := err.Error(); got != `discord: child "activity" fails because [child "state" fails] (4000)` {
		t.Errorf("message = %q", got)
	}

	// The connection still works, and the activity that failed is sent
	// again rather than skipped.
	done = async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p.command()
	if err := wait(t, done); err != nil || f.dials.Load() != 1 {
		t.Errorf("after the error: err = %v, %d dials", err, f.dials.Load())
	}
}

func TestPingPong(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	p.handshake()
	cmd := p.readCommand()

	p.send(opPing, map[string]any{"n": 7})
	op, payload := p.readRaw()
	if op != opPong || string(payload) != `{"n":7}` {
		t.Errorf("answer to the ping = %d %s, want the pong %s", op, payload, `{"n":7}`)
	}
	// An event, and an answer to another command, are not the answer.
	p.send(opFrame, map[string]any{"cmd": "DISPATCH", "evt": "ACTIVITY_JOIN", "nonce": nil, "data": map[string]any{}})
	p.send(opFrame, map[string]any{"cmd": "SET_ACTIVITY", "evt": "ERROR", "nonce": "another",
		"data": map[string]any{"code": 4000, "message": "not this one"}})
	p.send(opFrame, map[string]any{"cmd": "SET_ACTIVITY", "evt": nil, "nonce": cmd.Nonce, "data": map[string]any{}})
	if err := wait(t, done); err != nil {
		t.Fatal(err)
	}
}

func TestReconnect(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("One")) })
	p := f.accept(t)
	p.handshake()
	p.command()
	wait(t, done)

	// Discord quits: writing fails.
	p.conn.Close()
	if err := wait(t, async(func() error { return c.SetActivity(context.Background(), track("Two")) })); err == nil {
		t.Fatal("setting over a closed connection succeeded")
	}

	// The next call connects again, and sends the activity again although
	// it was shown over the old connection.
	done = async(func() error { return c.SetActivity(context.Background(), track("One")) })
	p = f.accept(t)
	p.handshake()
	cmd := p.readCommand()
	// Discord quits before answering: reading fails.
	p.conn.Close()
	if err := wait(t, done); err == nil {
		t.Fatal("a command Discord did not answer succeeded")
	}
	if want := `{"type":2,"details":"One","state":"Some Artist"}`; string(cmd.Args.Activity) != want {
		t.Errorf("activity = %s, want %s", cmd.Args.Activity, want)
	}

	done = async(func() error { return c.SetActivity(context.Background(), track("One")) })
	p = f.accept(t)
	p.handshake()
	p.command()
	if err := wait(t, done); err != nil || f.dials.Load() != 3 {
		t.Errorf("err = %v, %d dials, want 3", err, f.dials.Load())
	}
}

func TestNotRunning(t *testing.T) {
	c := New("1234")
	dials := 0
	c.dial = func(context.Context) (io.ReadWriteCloser, error) {
		dials++
		return nil, ErrNotRunning
	}
	for range 2 {
		if err := c.SetActivity(context.Background(), track("Song")); !errors.Is(err, ErrNotRunning) {
			t.Fatalf("err = %v, want ErrNotRunning", err)
		}
	}
	if dials != 2 {
		t.Errorf("%d dials, want one a call", dials)
	}
	if err := c.Clear(context.Background()); err != nil {
		t.Errorf("clear = %v", err)
	}
}

func TestNoAppID(t *testing.T) {
	c, f := newFake(t)
	c.SetAppID("")
	if err := c.SetActivity(context.Background(), track("Song")); err == nil || f.dials.Load() != 0 {
		t.Errorf("err = %v, %d dials", err, f.dials.Load())
	}
}

func TestDeadline(t *testing.T) {
	for _, noDeadlines := range []bool{false, true} {
		t.Run(fmt.Sprintf("noDeadlines=%v", noDeadlines), func(t *testing.T) {
			c, f := newFake(t)
			f.noDeadlines = noDeadlines
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			began := time.Now()
			done := async(func() error { return c.SetActivity(ctx, track("Song")) })
			p := f.accept(t)
			p.readRaw() // and never answer
			err := wait(t, done)
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("err = %v, want the deadline", err)
			}
			if d := time.Since(began); d > 2*time.Second {
				t.Errorf("the call took %v", d)
			}
			if !p.closed() {
				t.Error("the client kept the connection")
			}

			done = async(func() error { return c.SetActivity(context.Background(), track("Song")) })
			p = f.accept(t)
			p.handshake()
			p.command()
			if err := wait(t, done); err != nil {
				t.Errorf("after the deadline: %v", err)
			}
		})
	}
}

func TestCanceled(t *testing.T) {
	c, f := newFake(t)
	ctx, cancel := context.WithCancel(context.Background())
	done := async(func() error { return c.SetActivity(ctx, track("Song")) })
	p := f.accept(t)
	p.readRaw()
	cancel()
	if err := wait(t, done); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want canceled", err)
	}
}

func TestSetAppID(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	p.handshake()
	p.command()
	wait(t, done)

	c.SetAppID("1234") // the same: nothing changes
	c.SetAppID("5678")
	if !p.closed() {
		t.Fatal("changing the application ID kept the connection")
	}
	done = async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p = f.accept(t)
	if got, want := string(p.handshake()), `{"v":1,"client_id":"5678"}`; got != want {
		t.Errorf("handshake = %s, want %s", got, want)
	}
	p.command()
	if err := wait(t, done); err != nil || f.dials.Load() != 2 {
		t.Errorf("err = %v, %d dials", err, f.dials.Load())
	}
}

func TestClose(t *testing.T) {
	c, f := newFake(t)
	if err := c.Close(); err != nil {
		t.Fatalf("closing unconnected: %v", err)
	}
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	p.handshake()
	p.command()
	wait(t, done)

	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	if !p.closed() {
		t.Fatal("Close kept the connection")
	}
	if err := c.Close(); err != nil {
		t.Errorf("closing twice: %v", err)
	}
	done = async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p = f.accept(t)
	p.handshake()
	p.command()
	if err := wait(t, done); err != nil || f.dials.Load() != 2 {
		t.Errorf("err = %v, %d dials", err, f.dials.Load())
	}
}

func TestCloseInterruptsACall(t *testing.T) {
	c, f := newFake(t)
	done := async(func() error { return c.SetActivity(context.Background(), track("Song")) })
	p := f.accept(t)
	p.handshake()
	p.readCommand() // and never answer
	c.Close()
	if err := wait(t, done); err == nil {
		t.Error("the interrupted call succeeded")
	}
}

func TestConcurrentCalls(t *testing.T) {
	c, f := newFake(t)
	// The app answers every command until the test ends.
	go func() {
		conn := <-f.conns
		if _, _, err := readFrame(conn); err != nil {
			return
		}
		writeFrame(conn, opFrame, []byte(`{"cmd":"DISPATCH","evt":"READY","data":{}}`))
		for {
			_, payload, err := readFrame(conn)
			if err != nil {
				return
			}
			var cmd sentCommand
			json.Unmarshal(payload, &cmd)
			writeFrame(conn, opFrame, []byte(`{"cmd":"SET_ACTIVITY","nonce":"`+cmd.Nonce+`","data":{}}`))
		}
	}()
	var wg sync.WaitGroup
	for i := range 8 {
		wg.Go(func() {
			for j := range 5 {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				var err error
				if j == 4 {
					err = c.Clear(ctx)
				} else {
					err = c.SetActivity(ctx, track(fmt.Sprintf("Song %d.%d", i, j)))
				}
				cancel()
				if err != nil {
					t.Errorf("call %d.%d: %v", i, j, err)
				}
			}
		})
	}
	wg.Wait()
	if f.dials.Load() != 1 {
		t.Errorf("%d dials, want 1", f.dials.Load())
	}
}
