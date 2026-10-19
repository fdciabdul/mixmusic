// Package settings defines the user's preferences and their defaults.
package settings

import (
	"regexp"
	"slices"
	"strings"
)

// SpotifyPlayback chooses how Spotify tracks play.
type SpotifyPlayback string

const (
	// SpotifyPlaybackMatch plays Spotify tracks through MixMusic's own
	// player, from their recording on YouTube Music.
	SpotifyPlaybackMatch SpotifyPlayback = "match"
	// SpotifyPlaybackConnect plays Spotify tracks on a Spotify Connect
	// device, which needs Spotify Premium.
	SpotifyPlaybackConnect SpotifyPlayback = "connect"
)

// Density chooses how much room the interface gives each element.
type Density string

const (
	DensityComfortable Density = "comfortable"
	DensityCompact     Density = "compact"
)

// Quality chooses between the best audio and smaller streams.
type Quality string

const (
	QualityBest  Quality = "best"
	QualitySaver Quality = "saver"
)

// Bands are the center frequencies of the equalizer's bands, in hertz.
var Bands = []int{32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000}

// Equalizer shapes the sound of MixMusic's own player.
type Equalizer struct {
	Enabled bool   `json:"enabled"`
	Preset  string `json:"preset"`
	// Gains are in decibels, one per band, from -12 to 12.
	Gains []float64 `json:"gains"`
	// Preamp is in decibels, from -12 to 12.
	Preamp float64 `json:"preamp"`
}

// Settings are the user's preferences.
type Settings struct {
	// Appearance.
	Theme string `json:"theme"`
	// FollowSystem shows LightTheme while the computer is in light mode
	// and DarkTheme while it is in dark mode, in place of Theme.
	FollowSystem bool   `json:"followSystem"`
	LightTheme   string `json:"lightTheme"`
	DarkTheme    string `json:"darkTheme"`
	// ThemeOptions holds the values of each theme's options, by theme ID
	// and option ID.
	ThemeOptions map[string]map[string]string `json:"themeOptions"`
	// Accent replaces the theme's accent color, unless empty.
	Accent string `json:"accent"`
	// DynamicAccent takes the accent color from the artwork playing.
	DynamicAccent bool    `json:"dynamicAccent"`
	CustomCSS     string  `json:"customCss"`
	Density       Density `json:"density"`
	// FontScale scales the text, from 0.85 to 1.3.
	FontScale float64 `json:"fontScale"`
	// SidebarCollapsed shows the sidebar as icons only.
	SidebarCollapsed bool `json:"sidebarCollapsed"`

	// Playback.
	SpotifyPlayback SpotifyPlayback `json:"spotifyPlayback"`
	// SpotifyDevice is the Spotify Connect device to play on; the active
	// one when empty.
	SpotifyDevice string  `json:"spotifyDevice"`
	Quality       Quality `json:"quality"`
	// Crossfade overlaps tracks by this many seconds, from 0 to 12.
	Crossfade int `json:"crossfade"`
	// Normalize evens out the loudness of tracks.
	Normalize bool `json:"normalize"`
	// Autoplay continues with similar tracks when the queue ends.
	Autoplay  bool      `json:"autoplay"`
	Equalizer Equalizer `json:"equalizer"`
	// Volume is from 0 to 1.
	Volume float64 `json:"volume"`
	// CacheSizeMB bounds the audio cache; 0 turns it off.
	CacheSizeMB int `json:"cacheSizeMb"`

	// Accounts.
	SpotifyClientID string `json:"spotifyClientId"`

	// The desktop.
	CloseToTray   bool `json:"closeToTray"`
	Notifications bool `json:"notifications"`
	MediaKeys     bool `json:"mediaKeys"`

	// Tools.
	YTDLPPath string `json:"ytdlpPath"`
	JSRuntime string `json:"jsRuntime"`

	// Add-ons.
	EnabledPlugins []string `json:"enabledPlugins"`
	// RegistryURL is the address of the community registry of themes and
	// plugins.
	RegistryURL string `json:"registryUrl"`
}

// DefaultRegistryURL is the community registry in MixMusic's repository.
const DefaultRegistryURL = "https://raw.githubusercontent.com/fzn0x/mixmusic/main/community/registry.json"

// Default returns the settings of a new install.
func Default() Settings {
	return Settings{
		Theme:           "mix",
		LightTheme:      "daylight",
		DarkTheme:       "mix",
		ThemeOptions:    map[string]map[string]string{},
		DynamicAccent:   true,
		Density:         DensityComfortable,
		FontScale:       1,
		SpotifyPlayback: SpotifyPlaybackConnect,
		Quality:         QualityBest,
		Autoplay:        true,
		Equalizer:       Equalizer{Preset: "flat", Gains: make([]float64, len(Bands))},
		Volume:          0.8,
		CacheSizeMB:     1024,
		CloseToTray:     false,
		Notifications:   true,
		MediaKeys:       true,
		EnabledPlugins:  []string{},
		RegistryURL:     DefaultRegistryURL,
	}
}

var (
	colorRe = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)
	idRe    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
)

// ValidID reports whether id can name a theme or a plugin: lowercase
// letters, digits and dashes.
func ValidID(id string) bool { return idRe.MatchString(id) }

// ActiveTheme returns the ID of the theme to show: Theme, or the light or
// dark one of the computer's appearance when the theme follows it.
func (s Settings) ActiveTheme(dark bool) string {
	switch {
	case !s.FollowSystem:
		return s.Theme
	case dark:
		return s.DarkTheme
	default:
		return s.LightTheme
	}
}

// Clean returns s with every value in its range, and the defaults in place
// of values that are missing or invalid.
func (s Settings) Clean() Settings {
	d := Default()
	if !ValidID(s.Theme) {
		s.Theme = d.Theme
	}
	if !ValidID(s.LightTheme) {
		s.LightTheme = d.LightTheme
	}
	if !ValidID(s.DarkTheme) {
		s.DarkTheme = d.DarkTheme
	}
	if s.ThemeOptions == nil {
		s.ThemeOptions = map[string]map[string]string{}
	}
	if s.Accent != "" && !colorRe.MatchString(s.Accent) {
		s.Accent = ""
	}
	if s.Density != DensityCompact {
		s.Density = DensityComfortable
	}
	if s.FontScale < 0.85 || s.FontScale > 1.3 {
		s.FontScale = d.FontScale
	}
	if s.SpotifyPlayback != SpotifyPlaybackMatch && s.SpotifyPlayback != SpotifyPlaybackConnect {
		s.SpotifyPlayback = d.SpotifyPlayback
	}
	if s.Quality != QualitySaver {
		s.Quality = QualityBest
	}
	s.Crossfade = min(max(s.Crossfade, 0), 12)
	s.Volume = min(max(s.Volume, 0), 1)
	if len(s.Equalizer.Gains) != len(Bands) {
		s.Equalizer.Gains = make([]float64, len(Bands))
	}
	for i, g := range s.Equalizer.Gains {
		s.Equalizer.Gains[i] = min(max(g, -12), 12)
	}
	s.Equalizer.Preamp = min(max(s.Equalizer.Preamp, -12), 12)
	if s.Equalizer.Preset == "" {
		s.Equalizer.Preset = "custom"
	}
	s.CacheSizeMB = min(max(s.CacheSizeMB, 0), 64*1024)
	s.SpotifyClientID = strings.TrimSpace(s.SpotifyClientID)
	if !slices.Contains([]string{"", "deno", "node", "bun", "quickjs"}, s.JSRuntime) {
		s.JSRuntime = ""
	}
	plugins := []string{}
	for _, id := range s.EnabledPlugins {
		if ValidID(id) && !slices.Contains(plugins, id) {
			plugins = append(plugins, id)
		}
	}
	s.EnabledPlugins = plugins
	if !strings.HasPrefix(s.RegistryURL, "https://") {
		s.RegistryURL = d.RegistryURL
	}
	return s
}
