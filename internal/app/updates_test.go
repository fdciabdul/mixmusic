package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewerVersion(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{
		{"0.3.0", "0.2.0", true},
		{"0.2.0", "0.2.0", false},
		{"0.2.0", "0.3.0", false},
		{"0.10.0", "0.9.1", true},
		{"v1.0.0", "0.99.99", true},
		{"0.2.1", "0.2", true},
		{"0.2", "0.2.0", false},
		{"0.3.0", "0.3.0-beta.1", true},
		{"0.3.0-beta.1", "0.3.0", false},
		{"0.3.0-beta.2", "0.3.0-beta.1", true},
		{"0.3.0-beta.1", "0.2.0", true},
	} {
		if got := newerVersion(c.a, c.b); got != c.want {
			t.Errorf("newerVersion(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestKindOf(t *testing.T) {
	const installer = `C:\Users\me\AppData\Local\Programs\MixMusic`
	for _, c := range []struct {
		name     string
		goos     string
		dir      string
		appImage bool
		files    []string
		want     string
	}{
		{"installer", "windows", installer, false, []string{filepath.Join(installer, "Uninstall.exe")}, "installer"},
		{"portable zip", "windows", `D:\Apps\MixMusic`, false, nil, "portable"},
		{"app bundle", "darwin", "/Applications/MixMusic.app/Contents/MacOS", false, nil, "app"},
		{"deb", "linux", "/opt/mixmusic", false, []string{"/var/lib/dpkg/info/mixmusic.list"}, "deb"},
		{"rpm", "linux", "/opt/mixmusic", false, nil, "rpm"},
		{"AppImage", "linux", "/tmp/.mount_MixMusXYZ/usr/bin", true, nil, "appimage"},
		{"install.sh", "linux", "/home/me/.local/share/mixmusic", false, nil, "archive"},
	} {
		exists := func(p string) bool {
			for _, f := range c.files {
				if f == p {
					return true
				}
			}
			return false
		}
		if got := kindOf(c.goos, c.dir, c.appImage, exists); got != c.want {
			t.Errorf("%s: kindOf = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestReleaseFile(t *testing.T) {
	for kind, want := range map[string]string{
		"installer":   "mixmusic-0.3.0-windows-amd64-setup.exe",
		"portable":    "mixmusic-0.3.0-windows-amd64-portable.zip",
		"app":         "mixmusic-0.3.0-macos-universal.dmg",
		"archive":     "mixmusic-0.3.0-linux-amd64.tar.gz",
		"deb":         "mixmusic-0.3.0-linux-amd64.deb",
		"rpm":         "mixmusic-0.3.0-linux-amd64.rpm",
		"appimage":    "mixmusic-0.3.0-linux-amd64.AppImage",
		"development": "",
	} {
		if got := releaseFile(kind, "0.3.0", "amd64"); got != want {
			t.Errorf("releaseFile(%q) = %q, want %q", kind, got, want)
		}
	}
}

func TestLatestRelease(t *testing.T) {
	const body = `{
		"tag_name": "v0.3.0",
		"html_url": "https://github.com/fzn0x/mixmusic/releases/tag/v0.3.0",
		"published_at": "2026-10-21T10:00:00Z",
		"assets": [
			{"name": "mixmusic-0.3.0-linux-amd64.deb", "browser_download_url": "https://example.com/amd64.deb"},
			{"name": "mixmusic-0.3.0-linux-arm64.deb", "browser_download_url": "https://example.com/arm64.deb"},
			{"name": "SHA256SUMS", "browser_download_url": "https://example.com/SHA256SUMS"}
		]
	}`
	var agent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		agent = r.Header.Get("User-Agent")
		w.Write([]byte(body))
	}))
	defer srv.Close()

	r, err := latestRelease(context.Background(), srv.Client(), srv.URL, "deb", "arm64", "0.2.0")
	if err != nil {
		t.Fatal(err)
	}
	want := Release{
		Version:  "0.3.0",
		Newer:    true,
		Date:     "2026-10-21T10:00:00Z",
		Page:     "https://github.com/fzn0x/mixmusic/releases/tag/v0.3.0",
		Download: "https://example.com/arm64.deb",
		File:     "mixmusic-0.3.0-linux-arm64.deb",
	}
	if r != want {
		t.Errorf("latestRelease = %+v, want %+v", r, want)
	}
	if agent != "MixMusic/0.2.0" {
		t.Errorf("User-Agent = %q", agent)
	}

	// The release has no file for this copy: only its page.
	r, err = latestRelease(context.Background(), srv.Client(), srv.URL, "rpm", "amd64", "0.3.0")
	if err != nil {
		t.Fatal(err)
	}
	if r.Newer || r.Download != "" || r.File != "" {
		t.Errorf("latestRelease of an rpm, up to date = %+v", r)
	}
}

func TestLatestReleaseRateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"API rate limit exceeded"}`, http.StatusForbidden)
	}))
	defer srv.Close()
	_, err := latestRelease(context.Background(), srv.Client(), srv.URL, "installer", "amd64", "0.2.0")
	if err == nil || !strings.Contains(err.Error(), "try again in an hour") {
		t.Errorf("err = %v, want one that says to try again later", err)
	}
}
