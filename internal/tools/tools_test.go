package tools

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAsset(t *testing.T) {
	for platform, want := range map[[2]string]string{
		{"windows", "amd64"}: "yt-dlp.exe",
		{"linux", "amd64"}:   "yt-dlp_linux",
		{"linux", "arm64"}:   "yt-dlp_linux_aarch64",
	} {
		got, err := asset(platform[0], platform[1])
		if err != nil || got != want {
			t.Errorf("asset(%s) = %q, %v", platform, got, err)
		}
	}
	if _, err := asset("plan9", "amd64"); err == nil {
		t.Error("plan9 has no yt-dlp build")
	}
}

func TestChecksum(t *testing.T) {
	sums := []byte("abc123  yt-dlp\nDEF456  yt-dlp.exe\n789  yt-dlp_linux\n")
	got, err := checksum(sums, "yt-dlp.exe")
	if err != nil || got != "def456" {
		t.Errorf("checksum = %q, %v", got, err)
	}
	if _, err := checksum(sums, "yt-dlp_macos"); err == nil {
		t.Error("a missing file has no checksum")
	}
}

func TestYTDLPPrefersChosenThenManaged(t *testing.T) {
	dir := t.TempDir()
	m := New(dir)
	t.Setenv("PATH", "")
	if _, err := m.YTDLP(); !errors.Is(err, ErrNoYTDLP) {
		t.Fatalf("YTDLP() error = %v, want ErrNoYTDLP", err)
	}
	managed := filepath.Join(dir, exe("yt-dlp"))
	if err := os.WriteFile(managed, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got, err := m.YTDLP(); err != nil || got != managed {
		t.Errorf("YTDLP() = %q, %v; want the managed copy", got, err)
	}
	chosen := filepath.Join(dir, "custom-yt-dlp")
	if err := os.WriteFile(chosen, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	m.Configure(chosen, "")
	if got, err := m.YTDLP(); err != nil || got != chosen {
		t.Errorf("YTDLP() = %q, %v; want the chosen path", got, err)
	}
}

// noToolDirs keeps a test to the PATH and the folders it makes.
func noToolDirs(t *testing.T, dirs ...string) {
	t.Helper()
	saved := toolDirs
	toolDirs = func() []string { return dirs }
	t.Cleanup(func() { toolDirs = saved })
}

func TestJSRuntimeFromDir(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", "")
	noToolDirs(t)
	m := New(dir)
	if _, _, ok := m.JSRuntime(); ok {
		t.Fatal("found a runtime in an empty PATH")
	}
	name := "deno"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	if got, _, ok := m.JSRuntime(); !ok || got != "deno" {
		t.Errorf("JSRuntime() = %q, %v", got, ok)
	}
	args := m.YTDLPArgs("")
	if args[len(args)-2] != "--js-runtimes" {
		t.Errorf("args = %q", args)
	}
}

// An app opened from the desktop has a short PATH: tools are found in the
// folders installers put them in too.
func TestToolsOutsidePath(t *testing.T) {
	t.Setenv("PATH", "")
	brew := t.TempDir()
	noToolDirs(t, filepath.Join(t.TempDir(), "missing"), brew)
	m := New(t.TempDir())
	if _, err := m.YTDLP(); err == nil {
		t.Fatal("found yt-dlp in empty folders")
	}
	for _, name := range []string{"yt-dlp", "node"} {
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		if err := os.WriteFile(filepath.Join(brew, name), []byte("x"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if got, err := m.YTDLP(); err != nil || filepath.Dir(got) != brew {
		t.Errorf("YTDLP() = %q, %v; want it in %s", got, err, brew)
	}
	if name, got, ok := m.JSRuntime(); !ok || name != "node" || filepath.Dir(got) != brew {
		t.Errorf("JSRuntime() = %q, %q, %v", name, got, ok)
	}
}

func TestLatestYTDLP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodHead {
			t.Errorf("method = %s", r.Method)
		}
		http.Redirect(w, r, "/yt-dlp/yt-dlp/releases/tag/2026.09.01", http.StatusFound)
	}))
	defer srv.Close()
	saved := latestURL
	latestURL = srv.URL + "/yt-dlp/yt-dlp/releases/latest"
	defer func() { latestURL = saved }()
	m := New(t.TempDir())
	if v, err := m.LatestYTDLP(context.Background()); err != nil || v != "2026.09.01" {
		t.Errorf("LatestYTDLP() = %q, %v", v, err)
	}
	// Nothing MixMusic installed: nothing to update.
	if updated, err := m.UpdateYTDLP(context.Background()); updated || err != nil {
		t.Errorf("UpdateYTDLP() = %v, %v without a managed yt-dlp", updated, err)
	}
}

// TestLiveInstall downloads yt-dlp and runs it. It runs with
// MIXMUSIC_LIVE=1.
func TestLiveInstall(t *testing.T) {
	if os.Getenv("MIXMUSIC_LIVE") == "" {
		t.Skip("set MIXMUSIC_LIVE=1 to download yt-dlp")
	}
	m := New(t.TempDir())
	var last int64
	if err := m.InstallYTDLP(t.Context(), func(done, total int64) { last = done }); err != nil {
		t.Fatal(err)
	}
	if last == 0 {
		t.Error("no progress reported")
	}
	s := m.Status(t.Context())
	if !s.YTDLP.Found || !s.YTDLP.Managed || s.YTDLP.Version == "" {
		t.Errorf("status = %+v", s.YTDLP)
	}
	t.Logf("installed yt-dlp %s; JavaScript runtime: %+v", s.YTDLP.Version, s.JSRuntime)
}
