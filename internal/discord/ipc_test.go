package discord

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"testing"
)

func TestWriteFrame(t *testing.T) {
	var buf bytes.Buffer
	if err := writeFrame(&buf, opFrame, []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}
	want := append([]byte{1, 0, 0, 0, 7, 0, 0, 0}, `{"a":1}`...)
	if !bytes.Equal(buf.Bytes(), want) {
		t.Errorf("frame = % x, want % x", buf.Bytes(), want)
	}

	buf.Reset()
	writeFrame(&buf, opPong, nil)
	if want := []byte{4, 0, 0, 0, 0, 0, 0, 0}; !bytes.Equal(buf.Bytes(), want) {
		t.Errorf("empty frame = % x, want % x", buf.Bytes(), want)
	}
}

func TestReadFrame(t *testing.T) {
	// Two frames back to back, the second with a length past 255.
	long := bytes.Repeat([]byte("x"), 300)
	var buf bytes.Buffer
	buf.Write([]byte{3, 0, 0, 0, 2, 0, 0, 0, '{', '}'})
	buf.Write([]byte{2, 0, 0, 0, 0x2c, 0x01, 0, 0})
	buf.Write(long)

	op, payload, err := readFrame(&buf)
	if err != nil || op != opPing || string(payload) != "{}" {
		t.Errorf("first frame = %d %q, %v", op, payload, err)
	}
	op, payload, err = readFrame(&buf)
	if err != nil || op != opClose || !bytes.Equal(payload, long) {
		t.Errorf("second frame = %d, %d bytes, %v", op, len(payload), err)
	}
	if _, _, err := readFrame(&buf); err != io.EOF {
		t.Errorf("past the end: %v, want EOF", err)
	}
}

func TestReadFrameRoundTrip(t *testing.T) {
	for _, op := range []opcode{opHandshake, opFrame, opClose, opPing, opPong} {
		var buf bytes.Buffer
		writeFrame(&buf, op, []byte(`{"v":1}`))
		got, payload, err := readFrame(&buf)
		if err != nil || got != op || string(payload) != `{"v":1}` {
			t.Errorf("opcode %d: read %d %q, %v", op, got, payload, err)
		}
	}
}

func TestReadFrameBroken(t *testing.T) {
	head := func(op, n uint32) []byte {
		b := make([]byte, 8)
		binary.LittleEndian.PutUint32(b[0:], op)
		binary.LittleEndian.PutUint32(b[4:], n)
		return b
	}
	cases := map[string][]byte{
		"short header":  {1, 0, 0},
		"short payload": append(head(1, 10), "{}"...),
		"no payload":    head(1, 10),
		"too long":      head(1, maxFrame+1),
	}
	for name, data := range cases {
		_, _, err := readFrame(bytes.NewReader(data))
		if err == nil {
			t.Errorf("%s: no error", name)
		}
		if name != "too long" && !errors.Is(err, io.ErrUnexpectedEOF) {
			t.Errorf("%s: %v, want an unexpected EOF", name, err)
		}
	}
}
