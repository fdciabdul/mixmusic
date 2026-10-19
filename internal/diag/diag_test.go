package diag

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"testing"
	"time"
)

func TestRedact(t *testing.T) {
	for in, want := range map[string]string{
		"Cookie: SAPISID=abc123; __Secure-3PSID=xyz; PREF=f6=40000":          "Cookie: SAPISID=…; __Secure-3PSID=…; PREF=f6=40000",
		"Authorization: SAPISIDHASH 1700000000_0a1b2c SAPISID3PHASH 17_ff":   "Authorization: SAPISIDHASH … SAPISID3PHASH …",
		"GET /2.0/?method=track.scrobble&api_key=KEY&sk=SESSION&api_sig=SIG": "GET /2.0/?method=track.scrobble&api_key=…&sk=…&api_sig=…",
		`{"access_token":"BQD","refresh_token":"AQB","expires_in":3600}`:     `{"access_token":"…","refresh_token":"…","expires_in":3600}`,
		"Authorization: Bearer BQDxyz.abc-123":                               "Authorization: Bearer …",
		"mixmusic: playing Let It Happen by Tame Impala":                     "mixmusic: playing Let It Happen by Tame Impala",
	} {
		if got := Redact(in); got != want {
			t.Errorf("Redact(%q)\n got %q\nwant %q", in, got, want)
		}
	}
}

func TestLogRotates(t *testing.T) {
	dir := t.TempDir()
	l, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	line := strings.Repeat("x", 1000) + "\n"
	for range maxLogSize/len(line) + 10 {
		fmt.Fprint(l, line)
	}
	fmt.Fprint(l, "token=secret\n")
	l.Close()
	if _, err := os.Stat(filepath.Join(dir, "mixmusic.1.log")); err != nil {
		t.Errorf("no older log after %d bytes: %v", maxLogSize, err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "mixmusic.log"))
	if !strings.Contains(string(data), "token=…") || strings.Contains(string(data), "secret") {
		t.Errorf("the new log holds %q", data[max(0, len(data)-40):])
	}
	if info, _ := os.Stat(filepath.Join(dir, "mixmusic.log")); info.Size() > maxLogSize {
		t.Errorf("the log grew to %d bytes", info.Size())
	}
}

func TestKeepCrash(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(func() { debug.SetCrashOutput(nil, debug.CrashOptions{}) })
	if kept, err := keepCrash(dir); err != nil || kept != "" {
		t.Fatalf("a first start kept %q, %v", kept, err)
	}
	// A crash fills crash.log; the next start keeps it.
	debug.SetCrashOutput(nil, debug.CrashOptions{})
	os.WriteFile(filepath.Join(dir, crashName), []byte("panic: boom\n"), 0o600)
	kept, err := keepCrash(dir)
	if err != nil || kept == "" {
		t.Fatalf("keepCrash = %q, %v", kept, err)
	}
	if data, _ := os.ReadFile(kept); string(data) != "panic: boom\n" {
		t.Errorf("the kept report holds %q", data)
	}
	if info, _ := os.Stat(filepath.Join(dir, crashName)); info.Size() != 0 {
		t.Error("crash.log was not emptied for this run")
	}
	// Only the newest reports stay.
	for i := range keepCrashes + 3 {
		os.WriteFile(filepath.Join(dir, fmt.Sprintf("crash-2026010%d-000000.log", i)), []byte("x"), 0o600)
	}
	time.Sleep(10 * time.Millisecond)
	pruneCrashes(dir)
	if reports, _ := filepath.Glob(filepath.Join(dir, "crash-*.log")); len(reports) != keepCrashes {
		t.Errorf("%d reports kept, want %d", len(reports), keepCrashes)
	}
}
