package app

import (
	"context"
	"errors"
	"net/url"
	"runtime"

	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/internal/spotify"
	"github.com/fzn0x/mixmusic/internal/tools"
)

// Info describes the app and where pages load from.
type Info struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
	Arch     string `json:"arch"`
	Dev      bool   `json:"dev"`
	// StreamURL is the base URL of the audio scheme.
	StreamURL string `json:"streamUrl"`
	// AddonsURL is the base URL of the add-ons scheme.
	AddonsURL   string `json:"addonsUrl"`
	DataDir     string `json:"dataDir"`
	RedirectURI string `json:"redirectUri"`
}

// System gives pages what they need of the desktop and the app.
type System struct{ a *App }

// Info describes the app.
func (s *System) Info() Info {
	version := mygo.App.Version()
	if version == "" {
		version = s.a.opts.Version
	}
	return Info{
		Name:        mygo.App.Name(),
		Version:     version,
		Platform:    runtime.GOOS,
		Arch:        runtime.GOARCH,
		Dev:         mygo.IsDev(),
		StreamURL:   schemeURL(streamScheme),
		AddonsURL:   schemeURL(addonsScheme),
		DataDir:     s.a.opts.DataDir,
		RedirectURI: spotify.RedirectURI,
	}
}

// Tools describes the tools MixMusic runs: yt-dlp and a JavaScript
// runtime.
func (s *System) Tools(ctx context.Context) tools.Status { return s.a.tools.Status(ctx) }

// InstallProgress is how far a download went.
type InstallProgress struct {
	Done  int64 `json:"done"`
	Total int64 `json:"total"`
}

// InstallYTDLP downloads the latest yt-dlp into the app's data, reporting
// the download's progress.
func (s *System) InstallYTDLP(ctx context.Context, progress *mygo.Channel[InstallProgress]) (tools.Status, error) {
	err := s.a.tools.InstallYTDLP(ctx, func(done, total int64) {
		progress.Send(InstallProgress{Done: done, Total: total})
	})
	if err != nil {
		return tools.Status{}, err
	}
	return s.a.tools.Status(ctx), nil
}

// ArtworkColor returns the accent color of a piece of artwork, as
// "#rrggbb", for themes that follow what plays.
func (s *System) ArtworkColor(ctx context.Context, url string) (string, error) {
	if c, ok := s.a.colors.get(url); ok {
		return c, nil
	}
	c, err := s.a.artwork.Color(ctx, url)
	if err != nil {
		return "", err
	}
	s.a.colors.put(url, c)
	return c, nil
}

// OpenExternal opens a web page in the default browser.
func (s *System) OpenExternal(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return errors.New("only web pages open in the browser")
	}
	return mygo.Shell.OpenExternal(u.String())
}

// CacheUsage is what the audio cache holds.
type CacheUsage struct {
	Bytes  int64 `json:"bytes"`
	Tracks int   `json:"tracks"`
}

// CacheUsage returns what the audio cache holds.
func (s *System) CacheUsage() CacheUsage {
	b, n := s.a.cache.Usage()
	return CacheUsage{Bytes: b, Tracks: n}
}

// ClearCache empties the audio cache.
func (s *System) ClearCache() error { return s.a.cache.Clear() }

// ShowMiniPlayer shows the mini player, a small window over the others.
func (s *System) ShowMiniPlayer() { s.a.showMini() }

// ShowMainWindow shows the main window and closes the mini player.
func (s *System) ShowMainWindow() {
	s.a.showMain()
	s.a.mu.Lock()
	mini := s.a.mini
	s.a.mu.Unlock()
	if mini != nil {
		mini.Close()
	}
}

// Notify shows a desktop notification, for plugins.
func (s *System) Notify(title, body string) error {
	return mygo.NewNotification(mygo.NotificationOptions{Title: title, Body: body}).Show()
}

// Quit quits MixMusic.
func (s *System) Quit() { mygo.App.Quit() }
