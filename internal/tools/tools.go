// Package tools finds and installs the programs MixMusic runs: yt-dlp,
// which finds the audio streams of YouTube, and a JavaScript runtime, which
// yt-dlp needs to solve the challenges YouTube sends.
package tools

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/fzn0x/mixmusic/internal/proc"
)

// releaseURL is where the latest yt-dlp release's files are downloaded.
const releaseURL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/"

// latestURL redirects to the page of the latest yt-dlp release, whose path
// ends in its version. It is a variable for tests.
var latestURL = "https://github.com/yt-dlp/yt-dlp/releases/latest"

// ErrNoYTDLP is returned when yt-dlp is not installed.
var ErrNoYTDLP = errors.New("yt-dlp is not installed: install it from Settings › Playback")

// Manager finds the tools, and installs yt-dlp into Dir.
type Manager struct {
	// Dir holds the tools MixMusic installs.
	Dir string
	// HTTP downloads them.
	HTTP *http.Client

	mu        sync.Mutex
	ytdlpPath string // a path the user chose, overriding the search
	jsRuntime string // a runtime the user chose: "deno", "node", "bun" or "quickjs"
}

// New returns a manager that installs tools into dir.
func New(dir string) *Manager {
	return &Manager{Dir: dir, HTTP: &http.Client{Timeout: 5 * time.Minute}}
}

// Configure sets the paths the user chose; empty values search for the
// tools.
func (m *Manager) Configure(ytdlpPath, jsRuntime string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ytdlpPath, m.jsRuntime = ytdlpPath, jsRuntime
}

// exe adds the executable suffix of the platform to name.
func exe(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

// managedPath is where InstallYTDLP puts yt-dlp.
func (m *Manager) managedPath() string { return filepath.Join(m.Dir, exe("yt-dlp")) }

// toolDirs are the folders where installers put programs that an app
// opened from the desktop does not find on its PATH: opened from the
// Finder, the Dock or a desktop menu, it gets a short PATH, without
// Homebrew's folders or the ones Deno and Bun install into. It is a
// variable for tests.
var toolDirs = func() []string {
	home, _ := os.UserHomeDir()
	var dirs []string
	inHome := func(parts ...string) {
		if home != "" {
			dirs = append(dirs, filepath.Join(append([]string{home}, parts...)...))
		}
	}
	inHome(".deno", "bin")
	inHome(".bun", "bin")
	if runtime.GOOS == "windows" {
		inHome("scoop", "shims")
		if d := os.Getenv("LOCALAPPDATA"); d != "" {
			dirs = append(dirs, filepath.Join(d, "Microsoft", "WinGet", "Links"))
		}
		if d := os.Getenv("ProgramFiles"); d != "" {
			dirs = append(dirs, filepath.Join(d, "nodejs"))
		}
		return dirs
	}
	inHome(".local", "bin")
	inHome("bin")
	inHome(".volta", "bin")
	return append(dirs, "/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/home/linuxbrew/.linuxbrew/bin", "/snap/bin")
}

// lookPath finds a program on the PATH, else in the folders installers
// put programs in.
func lookPath(name string) (string, error) {
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	for _, dir := range toolDirs() {
		if p := filepath.Join(dir, exe(name)); isFile(p) {
			return p, nil
		}
	}
	return "", exec.ErrNotFound
}

// YTDLP returns the path of yt-dlp: the one the user chose, else the one
// MixMusic installed, else one installed on the system.
func (m *Manager) YTDLP() (string, error) {
	m.mu.Lock()
	chosen := m.ytdlpPath
	m.mu.Unlock()
	if chosen != "" {
		if isFile(chosen) {
			return chosen, nil
		}
		return "", fmt.Errorf("yt-dlp not found at %s", chosen)
	}
	if p := m.managedPath(); isFile(p) {
		return p, nil
	}
	if p, err := lookPath("yt-dlp"); err == nil {
		return p, nil
	}
	return "", ErrNoYTDLP
}

// jsRuntimes are the runtimes yt-dlp can use, in the order it prefers them,
// with the names of their executables.
var jsRuntimes = []struct{ name, command string }{
	{"deno", "deno"},
	{"node", "node"},
	{"bun", "bun"},
	{"quickjs", "qjs"},
}

// JSRuntime returns the JavaScript runtime yt-dlp should use, and its path.
func (m *Manager) JSRuntime() (name, path string, ok bool) {
	m.mu.Lock()
	chosen := m.jsRuntime
	m.mu.Unlock()
	for _, rt := range jsRuntimes {
		if chosen != "" && rt.name != chosen {
			continue
		}
		if p := filepath.Join(m.Dir, exe(rt.command)); isFile(p) {
			return rt.name, p, true
		}
		if p, err := lookPath(rt.command); err == nil {
			return rt.name, p, true
		}
	}
	return "", "", false
}

// YTDLPArgs returns the arguments every yt-dlp run gets: the JavaScript
// runtime to use, and where to cache what it learns about YouTube's player.
func (m *Manager) YTDLPArgs(cacheDir string) []string {
	args := []string{"--no-warnings", "--no-progress"}
	if cacheDir != "" {
		args = append(args, "--cache-dir", cacheDir)
	}
	if name, path, ok := m.JSRuntime(); ok {
		args = append(args, "--js-runtimes", name+":"+path)
	}
	return args
}

// Tool describes an installed tool.
type Tool struct {
	Found   bool   `json:"found"`
	Name    string `json:"name,omitempty"`
	Path    string `json:"path,omitempty"`
	Version string `json:"version,omitempty"`
	// Managed is set for tools MixMusic installed, which it can update.
	Managed bool `json:"managed,omitempty"`
}

// Status describes the tools MixMusic runs.
type Status struct {
	YTDLP     Tool `json:"ytdlp"`
	JSRuntime Tool `json:"jsRuntime"`
}

// Status finds the tools and asks them their versions.
func (m *Manager) Status(ctx context.Context) Status {
	var s Status
	if p, err := m.YTDLP(); err == nil {
		s.YTDLP = Tool{Found: true, Name: "yt-dlp", Path: p, Version: version(ctx, p, "--version"), Managed: p == m.managedPath()}
	}
	if name, p, ok := m.JSRuntime(); ok {
		flag := "--version"
		if name == "quickjs" {
			flag = "-h"
		}
		s.JSRuntime = Tool{Found: true, Name: name, Path: p, Version: version(ctx, p, flag)}
	}
	return s
}

// version returns the first line a program prints for flag.
func version(ctx context.Context, path, flag string) string {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	out, err := proc.Command(ctx, path, flag).Output()
	if err != nil {
		return ""
	}
	line, _, _ := strings.Cut(strings.TrimSpace(string(out)), "\n")
	return strings.TrimSpace(line)
}

// asset returns the name of the yt-dlp executable of a platform in its
// releases.
func asset(goos, goarch string) (string, error) {
	switch goos + "/" + goarch {
	case "windows/amd64":
		return "yt-dlp.exe", nil
	case "windows/arm64":
		return "yt-dlp_arm64.exe", nil
	case "windows/386":
		return "yt-dlp_x86.exe", nil
	case "linux/amd64":
		return "yt-dlp_linux", nil
	case "linux/arm64":
		return "yt-dlp_linux_aarch64", nil
	case "darwin/amd64", "darwin/arm64":
		return "yt-dlp_macos", nil
	}
	return "", fmt.Errorf("yt-dlp has no build for %s/%s: install it with your package manager", goos, goarch)
}

// Progress reports how many bytes of a download arrived, of total (0 when
// unknown).
type Progress func(done, total int64)

// InstallYTDLP downloads the latest yt-dlp for this platform into Dir,
// checking it against the checksums the release publishes. It replaces a
// yt-dlp installed before, so it also updates it.
func (m *Manager) InstallYTDLP(ctx context.Context, progress Progress) error {
	name, err := asset(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return err
	}
	sums, err := m.fetch(ctx, releaseURL+"SHA2-256SUMS", nil)
	if err != nil {
		return fmt.Errorf("downloading yt-dlp checksums: %w", err)
	}
	want, err := checksum(sums, name)
	if err != nil {
		return err
	}
	data, err := m.fetch(ctx, releaseURL+name, progress)
	if err != nil {
		return fmt.Errorf("downloading yt-dlp: %w", err)
	}
	if got := sha256.Sum256(data); hex.EncodeToString(got[:]) != want {
		return errors.New("downloaded yt-dlp does not match its published checksum")
	}
	if err := os.MkdirAll(m.Dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(m.Dir, ".yt-dlp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o755); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), m.managedPath())
}

// LatestYTDLP returns the version of the latest yt-dlp release, such as
// 2026.08.19.
func (m *Manager) LatestYTDLP(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, latestURL, nil)
	if err != nil {
		return "", err
	}
	client := *m.HTTP
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	res.Body.Close()
	_, v, ok := strings.Cut(res.Header.Get("Location"), "/releases/tag/")
	if !ok || v == "" || strings.Contains(v, "/") {
		return "", fmt.Errorf("finding the latest yt-dlp: HTTP %d without a release", res.StatusCode)
	}
	return v, nil
}

// UpdateYTDLP replaces the yt-dlp MixMusic installed with the latest
// release when that is newer, and reports whether it did. It leaves alone
// a yt-dlp the user installed or chose, which they keep up to date.
func (m *Manager) UpdateYTDLP(ctx context.Context) (bool, error) {
	m.mu.Lock()
	chosen := m.ytdlpPath
	m.mu.Unlock()
	if chosen != "" || !isFile(m.managedPath()) {
		return false, nil
	}
	latest, err := m.LatestYTDLP(ctx)
	if err != nil {
		return false, err
	}
	if version(ctx, m.managedPath(), "--version") == latest {
		return false, nil
	}
	if err := m.InstallYTDLP(ctx, nil); err != nil {
		return false, err
	}
	return true, nil
}

// checksum finds the SHA-256 of file in a SHA2-256SUMS listing.
func checksum(sums []byte, file string) (string, error) {
	sc := bufio.NewScanner(bytes.NewReader(sums))
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) == 2 && strings.TrimPrefix(fields[1], "*") == file {
			return strings.ToLower(fields[0]), nil
		}
	}
	return "", fmt.Errorf("no checksum published for %s", file)
}

// fetch downloads url into memory, reporting progress.
func (m *Manager) fetch(ctx context.Context, url string, progress Progress) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := m.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	var buf bytes.Buffer
	r := io.Reader(io.LimitReader(res.Body, 256<<20))
	if progress != nil {
		r = &progressReader{r: r, total: res.ContentLength, fn: progress}
	}
	if _, err := io.Copy(&buf, r); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type progressReader struct {
	r     io.Reader
	done  int64
	total int64
	last  time.Time
	fn    Progress
}

func (p *progressReader) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	p.done += int64(n)
	if now := time.Now(); err != nil || now.Sub(p.last) > 100*time.Millisecond {
		p.last = now
		p.fn(p.done, max(p.total, 0))
	}
	return n, err
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
