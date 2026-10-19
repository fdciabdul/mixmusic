package discord

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"
)

// opcode is the kind of a frame of Discord's IPC protocol.
type opcode uint32

const (
	opHandshake opcode = 0
	opFrame     opcode = 1
	opClose     opcode = 2
	opPing      opcode = 3
	opPong      opcode = 4
)

// maxFrame is the longest payload read from Discord, which guards against a
// corrupt length. Discord's frames are a few kilobytes at most.
const maxFrame = 1 << 20

// writeFrame writes a frame: its opcode and the length of its payload, as
// little-endian 32-bit integers, then the payload. It writes the frame in
// one call, so a frame is never split between writers.
func writeFrame(w io.Writer, op opcode, payload []byte) error {
	buf := make([]byte, 8+len(payload))
	binary.LittleEndian.PutUint32(buf[0:4], uint32(op))
	binary.LittleEndian.PutUint32(buf[4:8], uint32(len(payload)))
	copy(buf[8:], payload)
	_, err := w.Write(buf)
	return err
}

// readFrame reads a frame that writeFrame wrote.
func readFrame(r io.Reader) (opcode, []byte, error) {
	var head [8]byte
	if _, err := io.ReadFull(r, head[:]); err != nil {
		return 0, nil, err
	}
	op := opcode(binary.LittleEndian.Uint32(head[0:4]))
	n := binary.LittleEndian.Uint32(head[4:8])
	if n > maxFrame {
		return 0, nil, fmt.Errorf("a frame of %d bytes is too long", n)
	}
	payload := make([]byte, n)
	if _, err := io.ReadFull(r, payload); err != nil {
		if err == io.EOF {
			err = io.ErrUnexpectedEOF
		}
		return 0, nil, err
	}
	return op, payload, nil
}

// message is the payload of a frame of opcode 1: the answer to a command,
// or an event.
type message struct {
	Evt   string          `json:"evt"`
	Nonce string          `json:"nonce"`
	Data  json.RawMessage `json:"data"`
}

// errorBody is the error of an ERROR event, and the payload of a frame of
// opcode 2.
type errorBody struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// toError returns the error of an ERROR event or of a closing frame.
func toError(payload []byte) error {
	var b errorBody
	_ = json.Unmarshal(payload, &b) // an unreadable error still is one
	return &Error{Code: b.Code, Message: b.Message}
}

// request is the payload of a command.
type request struct {
	Cmd   string `json:"cmd"`
	Args  any    `json:"args"`
	Nonce string `json:"nonce"`
}

// conn is a connection to Discord. It is used by one call at a time.
type conn struct {
	rwc io.ReadWriteCloser
	// dead is set when a failure leaves the connection unusable: a read or
	// write error, a timeout, or Discord closing it.
	dead bool
}

// handshake identifies the client as the Discord application appID and
// waits for Discord to be ready.
func (cn *conn) handshake(ctx context.Context, appID string) error {
	payload, err := json.Marshal(struct {
		V        int    `json:"v"`
		ClientID string `json:"client_id"`
	}{1, appID})
	if err != nil {
		return err
	}
	return cn.within(ctx, func() error {
		if err := cn.write(opHandshake, payload); err != nil {
			return err
		}
		for {
			m, err := cn.next()
			if err != nil {
				return err
			}
			switch m.Evt {
			case "READY":
				return nil
			case "ERROR":
				return toError(m.Data)
			}
		}
	})
}

// command sends a command and waits for its answer, which Discord tags with
// the command's nonce. An ERROR answer is returned as an *Error.
func (cn *conn) command(ctx context.Context, cmd string, args any) error {
	nonce := rand.Text()
	payload, err := json.Marshal(request{Cmd: cmd, Args: args, Nonce: nonce})
	if err != nil {
		return err
	}
	return cn.within(ctx, func() error {
		if err := cn.write(opFrame, payload); err != nil {
			return err
		}
		for {
			m, err := cn.next()
			if err != nil {
				return err
			}
			if m.Nonce != nonce {
				continue // an event, or the late answer to an earlier command
			}
			if m.Evt == "ERROR" {
				return toError(m.Data)
			}
			return nil
		}
	})
}

// next returns the next message Discord sends, answering its pings on the
// way. A closing frame is returned as an *Error.
func (cn *conn) next() (message, error) {
	for {
		op, payload, err := readFrame(cn.rwc)
		if err != nil {
			cn.dead = true
			return message{}, err
		}
		switch op {
		case opFrame:
			var m message
			if err := json.Unmarshal(payload, &m); err != nil {
				cn.dead = true
				return message{}, fmt.Errorf("decoding a frame: %w", err)
			}
			return m, nil
		case opPing:
			if err := cn.write(opPong, payload); err != nil {
				return message{}, err
			}
		case opClose:
			cn.dead = true
			return message{}, toError(payload)
		}
	}
}

// write writes a frame to the connection.
func (cn *conn) write(op opcode, payload []byte) error {
	if err := writeFrame(cn.rwc, op, payload); err != nil {
		cn.dead = true
		return err
	}
	return nil
}

// deadliner is a connection that supports deadlines, as a net.Conn or a
// named pipe opened for overlapped I/O does.
type deadliner interface {
	SetDeadline(t time.Time) error
}

// within runs f, which reads and writes the connection, until ctx's
// deadline. It sets that deadline on the connection when the connection
// supports deadlines, and closes the connection when ctx is done before f
// returns, which stops f on any connection. A connection closed so is dead.
func (cn *conn) within(ctx context.Context, f func() error) error {
	deadline, ok := ctx.Deadline()
	d, _ := cn.rwc.(deadliner)
	if d != nil && (!ok || d.SetDeadline(deadline) != nil) {
		d = nil
	}
	stop := context.AfterFunc(ctx, func() { cn.rwc.Close() })
	err := f()
	if !stop() {
		cn.dead = true
		return fmt.Errorf("discord: %w", ctx.Err())
	}
	if d != nil && !cn.dead {
		d.SetDeadline(time.Time{})
	}
	var de *Error
	switch {
	case err == nil, errors.As(err, &de):
		return err
	case errors.Is(err, os.ErrDeadlineExceeded):
		cn.dead = true
		return fmt.Errorf("discord: %w", context.DeadlineExceeded)
	}
	return fmt.Errorf("discord: %w", err)
}
