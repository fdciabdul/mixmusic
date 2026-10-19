package settings

import (
	"encoding/json"
	"testing"
)

func TestDefaultIsClean(t *testing.T) {
	d := Default()
	a, _ := json.Marshal(d)
	b, _ := json.Marshal(d.Clean())
	if string(a) != string(b) {
		t.Errorf("Clean changed the defaults:\n%s\n%s", a, b)
	}
}

func TestCleanClampsAndRepairs(t *testing.T) {
	s := Settings{
		Theme:           "../../etc",
		Accent:          "red; background: url(x)",
		FontScale:       5,
		SpotifyPlayback: "nonsense",
		Crossfade:       60,
		Volume:          -1,
		Equalizer:       Equalizer{Gains: []float64{99, -99}},
		JSRuntime:       "python",
		EnabledPlugins:  []string{"sleep-timer", "sleep-timer", "Bad ID", "../x"},
		RegistryURL:     "http://insecure.example",
	}.Clean()
	if s.Theme != "mix" || s.Accent != "" || s.FontScale != 1 || s.SpotifyPlayback != SpotifyPlaybackConnect {
		t.Errorf("appearance and playback not repaired: %+v", s)
	}
	if s.Crossfade != 12 || s.Volume != 0 || len(s.Equalizer.Gains) != len(Bands) {
		t.Errorf("ranges not clamped: %+v", s)
	}
	if s.JSRuntime != "" || len(s.EnabledPlugins) != 1 || s.RegistryURL != DefaultRegistryURL {
		t.Errorf("tools and add-ons not repaired: %+v", s)
	}
}

func TestValidID(t *testing.T) {
	for id, want := range map[string]bool{"mix": true, "sleep-timer": true, "a1": true, "": false, "-x": false, "Mix": false, "a/b": false, "a.b": false} {
		if got := ValidID(id); got != want {
			t.Errorf("ValidID(%q) = %v", id, got)
		}
	}
}

func TestActiveTheme(t *testing.T) {
	s := Default()
	if got := s.ActiveTheme(true); got != "mix" {
		t.Errorf("not following the system, dark: %q", got)
	}
	s.Theme = "sakura"
	s.FollowSystem = true
	if got := s.ActiveTheme(true); got != "mix" {
		t.Errorf("dark appearance: %q", got)
	}
	if got := s.ActiveTheme(false); got != "daylight" {
		t.Errorf("light appearance: %q", got)
	}
	s.LightTheme, s.DarkTheme = "Not An ID", ""
	if c := s.Clean(); c.LightTheme != "daylight" || c.DarkTheme != "mix" {
		t.Errorf("cleaned to %q and %q", c.LightTheme, c.DarkTheme)
	}
}
