package app

import (
	"bytes"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

func TestCookiesFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cookies.txt")
	expires := time.Unix(1800000000, 0)
	err := cookiesFile(path, []*http.Cookie{
		{Name: "SAPISID", Value: "abc", Domain: ".youtube.com", Path: "/", Secure: true, Expires: expires},
		{Name: "LOGIN_INFO", Value: "def", Domain: "music.youtube.com"},
	})
	if err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if lines[0] != "# Netscape HTTP Cookie File" {
		t.Errorf("header = %q", lines[0])
	}
	if lines[1] != ".youtube.com\tTRUE\t/\tTRUE\t1800000000\tSAPISID\tabc" {
		t.Errorf("first cookie = %q", lines[1])
	}
	if lines[2] != "music.youtube.com\tFALSE\t/\tFALSE\t0\tLOGIN_INFO\tdef" {
		t.Errorf("second cookie = %q", lines[2])
	}
}
