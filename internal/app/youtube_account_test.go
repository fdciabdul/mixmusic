package app

import (
	"bytes"
	"testing"
)

func TestSealOpen(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	data := []byte(`[{"name":"SAPISID","value":"x"}]`)
	sealed, err := seal(key, data)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte("SAPISID")) {
		t.Fatal("the session is readable in the file")
	}
	got, err := open(key, sealed)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("open = %q, %v", got, err)
	}
	if _, err := open(bytes.Repeat([]byte{8}, 32), sealed); err == nil {
		t.Error("another key opened the session")
	}
	if _, err := open(key, sealed[:4]); err == nil {
		t.Error("a damaged file opened")
	}
}
