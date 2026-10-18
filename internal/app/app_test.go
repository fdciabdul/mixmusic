package app

import (
	"strings"
	"testing"

	"github.com/fzn0x/mixmusic/internal/media"
)

func TestMemoForgetsOldest(t *testing.T) {
	m := newMemo[int](2)
	m.put("a", 1)
	m.put("b", 2)
	m.put("a", 10) // an update keeps its place
	m.put("c", 3)
	if _, ok := m.get("a"); ok {
		t.Error("the oldest key was kept")
	}
	if v, ok := m.get("b"); !ok || v != 2 {
		t.Errorf("b = %d, %v", v, ok)
	}
	if v, ok := m.get("c"); !ok || v != 3 {
		t.Errorf("c = %d, %v", v, ok)
	}
}

func TestTrayTip(t *testing.T) {
	track := &media.Track{Title: "One More Time", Artists: []media.Ref{{Name: "Daft Punk"}}}
	if got := trayTip(NowPlaying{Track: track, Playing: true}); got != "One More Time — Daft Punk" {
		t.Errorf("playing tip = %q", got)
	}
	if got := trayTip(NowPlaying{Track: track}); !strings.HasPrefix(got, "Paused: ") {
		t.Errorf("paused tip = %q", got)
	}
	if got := trayTip(NowPlaying{}); got != "MixMusic" {
		t.Errorf("idle tip = %q", got)
	}
	long := &media.Track{Title: strings.Repeat("a", 200), Artists: []media.Ref{{Name: "b"}}}
	if got := trayTip(NowPlaying{Track: long, Playing: true}); len([]rune(got)) > 120 {
		t.Errorf("tip of %d characters, Windows cuts them at 127", len([]rune(got)))
	}
}

func TestIsAppHost(t *testing.T) {
	for host, want := range map[string]bool{
		"localhost:5173":    true,
		"127.0.0.1":         true,
		"mygo.localhost":    true,
		"stream.localhost":  true,
		"example.com":       false,
		"localhost.evil.io": false,
	} {
		if got := isAppHost(host); got != want {
			t.Errorf("isAppHost(%q) = %v", host, got)
		}
	}
}

func TestDeepLinkPaths(t *testing.T) {
	for path, want := range map[string]bool{
		"/search":                           true,
		"/album/yt:MPREb_I0lA998lMLT":       true,
		"/artist/sp:4tZwfgrHOc3mvqYlEYSvVi": true,
		"/settings/accounts":                true,
		"/album/../../etc":                  false,
		"/plugin/x":                         false,
		"/search/<script>":                  false,
	} {
		if got := deepLinkPathRe.MatchString(path); got != want {
			t.Errorf("%s: %v", path, got)
		}
	}
}

func TestSchemeURL(t *testing.T) {
	got := schemeURL("stream")
	if got != "http://stream.localhost/" && got != "stream://localhost/" {
		t.Errorf("schemeURL = %q", got)
	}
}
