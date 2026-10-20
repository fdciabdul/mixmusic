package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/updater"
)

// releasesAPI answers with the newest release of MixMusic.
const releasesAPI = "https://api.github.com/repos/fzn0x/mixmusic/releases/latest"

// UpdateStatus is whether MixMusic updates itself, and how.
type UpdateStatus struct {
	// Enabled is false for builds that cannot replace themselves: those
	// of development, and installs of a package manager.
	Enabled bool `json:"enabled"`
	// Kind is how this copy was installed, which decides the download of
	// a release that replaces it: "installer", "portable", "app",
	// "archive", "deb", "rpm", "appimage" or "development".
	Kind string `json:"kind"`
	// AutomaticChecks checks for a new version once a day.
	AutomaticChecks bool `json:"automaticChecks"`
	// AutomaticDownloads installs new versions without asking; they run
	// at the next launch.
	AutomaticDownloads bool `json:"automaticDownloads"`
	// LastCheck is when MixMusic last checked, as RFC 3339, or "".
	LastCheck string `json:"lastCheck"`
	// Installed is the version InstallUpdate put in place of this one,
	// which runs once MixMusic restarts, or "".
	Installed string `json:"installed"`
}

// UpdatesChanged tells every window the update preferences changed, after
// a check too.
var UpdatesChanged = mygo.NewEvent[UpdateStatus]("updatesChanged")

func (a *App) updateStatus() UpdateStatus {
	s := UpdateStatus{
		Enabled:            mygo.Updater.Enabled(),
		Kind:               installKind(),
		AutomaticChecks:    updater.AutomaticChecks(),
		AutomaticDownloads: updater.AutomaticDownloads(),
	}
	if t := updater.LastCheck(); !t.IsZero() {
		s.LastCheck = t.Format(time.RFC3339)
	}
	a.mu.Lock()
	s.Installed = a.installed
	a.mu.Unlock()
	return s
}

// watchUpdates tells the windows when the update preferences change.
func (a *App) watchUpdates() {
	updater.OnChange(func() { UpdatesChanged.Broadcast(a.updateStatus()) })
}

// Updates returns whether MixMusic updates itself, and how.
func (s *System) Updates() UpdateStatus { return s.a.updateStatus() }

// SetUpdates turns the daily check and the installs without asking on or
// off.
func (s *System) SetUpdates(automaticChecks, automaticDownloads bool) UpdateStatus {
	updater.SetAutomaticChecks(automaticChecks)
	updater.SetAutomaticDownloads(automaticDownloads && automaticChecks)
	return s.a.updateStatus()
}

// Release is the newest release of MixMusic, as this copy gets it.
type Release struct {
	// Version is the newest version, without its "v".
	Version string `json:"version"`
	// Newer is whether it is newer than this copy.
	Newer bool `json:"newer"`
	// Date is when it was published, as RFC 3339.
	Date string `json:"date"`
	// Page is the release's page: its notes and all of its downloads.
	Page string `json:"page"`
	// Download is the address of the release's file made for this copy,
	// such as its .deb, which copies that do not update themselves are
	// replaced with; "" when the release has none.
	Download string `json:"download"`
	// File is the name of that file.
	File string `json:"file"`
}

// LatestRelease asks GitHub for the newest release of MixMusic.
func (s *System) LatestRelease(ctx context.Context) (Release, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return latestRelease(ctx, http.DefaultClient, releasesAPI, installKind(), runtime.GOARCH, s.Info().Version)
}

// InstallUpdate downloads the newest version, checks its signature and
// puts it in place of this one, reporting the download's progress. It
// runs once MixMusic restarts. It returns the version installed.
func (s *System) InstallUpdate(ctx context.Context, progress *mygo.Channel[InstallProgress]) (string, error) {
	if !s.a.updating.TryLock() {
		return "", errors.New("the update is downloading already")
	}
	defer s.a.updating.Unlock()
	up, err := mygo.Updater.Check(ctx)
	switch {
	case errors.Is(err, mygo.ErrUpdatesDisabled):
		return "", errors.New("this copy of MixMusic cannot replace its own files: download the new version instead")
	case err != nil:
		return "", err
	case up == nil:
		// GitHub lists a release before its update files are uploaded.
		return "", errors.New("no update is ready to install yet; try again in a few minutes")
	}
	err = up.Install(ctx, func(done, total int64) {
		progress.Send(InstallProgress{Done: done, Total: total})
	})
	if err != nil {
		return "", err
	}
	s.a.mu.Lock()
	s.a.installed = up.Version
	s.a.mu.Unlock()
	UpdatesChanged.Broadcast(s.a.updateStatus())
	return up.Version, nil
}

// Restart quits MixMusic and starts it again, as the update it installed.
func (s *System) Restart() { mygo.App.Relaunch() }

// githubRelease is what GitHub tells of a release.
type githubRelease struct {
	TagName     string `json:"tag_name"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Assets      []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

// latestRelease reads the newest release from api, GitHub's, for a copy
// of the version running, installed as kind on arch.
func latestRelease(ctx context.Context, client *http.Client, api, kind, arch, running string) (Release, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, api, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "MixMusic/"+running)
	res, err := client.Do(req)
	if err != nil {
		return Release{}, fmt.Errorf("asking GitHub for the newest version: %w", err)
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusTooManyRequests:
		return Release{}, errors.New("GitHub limits how often it answers; try again in an hour")
	case res.StatusCode != http.StatusOK:
		return Release{}, fmt.Errorf("asking GitHub for the newest version: it answered %s", res.Status)
	}
	var gh githubRelease
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&gh); err != nil {
		return Release{}, fmt.Errorf("reading the newest version: %w", err)
	}
	version := strings.TrimPrefix(gh.TagName, "v")
	if version == "" {
		return Release{}, errors.New("reading the newest version: the release has no version")
	}
	r := Release{Version: version, Newer: newerVersion(version, running), Date: gh.PublishedAt, Page: gh.HTMLURL}
	if file := releaseFile(kind, version, arch); file != "" {
		for _, a := range gh.Assets {
			if a.Name == file {
				r.Download, r.File = a.URL, file
			}
		}
	}
	return r, nil
}

// releaseFile names the file of a release that replaces a copy installed
// as kind on arch, as the release workflow names it; "" when none does.
func releaseFile(kind, version, arch string) string {
	switch kind {
	case "installer":
		return fmt.Sprintf("mixmusic-%s-windows-%s-setup.exe", version, arch)
	case "portable":
		return fmt.Sprintf("mixmusic-%s-windows-%s-portable.zip", version, arch)
	case "app":
		return fmt.Sprintf("mixmusic-%s-macos-universal.dmg", version)
	case "archive":
		return fmt.Sprintf("mixmusic-%s-linux-%s.tar.gz", version, arch)
	case "deb":
		return fmt.Sprintf("mixmusic-%s-linux-%s.deb", version, arch)
	case "rpm":
		return fmt.Sprintf("mixmusic-%s-linux-%s.rpm", version, arch)
	case "appimage":
		return fmt.Sprintf("mixmusic-%s-linux-%s.AppImage", version, arch)
	}
	return ""
}

// installKind tells how this copy of MixMusic was installed.
func installKind() string {
	if mygo.IsDev() {
		return "development"
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	return kindOf(runtime.GOOS, filepath.Dir(exe), os.Getenv("APPIMAGE") != "", func(p string) bool {
		_, err := os.Stat(p)
		return err == nil
	})
}

// kindOf tells how a copy whose executable is in dir was installed on
// goos: the Windows installer leaves its uninstaller beside it, and the
// .deb and the .rpm put it in /opt/mixmusic, which dpkg keeps a list of
// for the .deb.
func kindOf(goos, dir string, appImage bool, exists func(string) bool) string {
	switch goos {
	case "windows":
		if exists(filepath.Join(dir, "Uninstall.exe")) {
			return "installer"
		}
		return "portable"
	case "darwin":
		return "app"
	}
	switch {
	case appImage:
		return "appimage"
	case dir == "/opt/mixmusic" && exists("/var/lib/dpkg/info/mixmusic.list"):
		return "deb"
	case dir == "/opt/mixmusic":
		return "rpm"
	}
	return "archive"
}

// newerVersion reports whether version a comes after b: their numbers one
// by one, then a release after its pre-releases.
func newerVersion(a, b string) bool {
	an, apre, _ := strings.Cut(strings.TrimPrefix(a, "v"), "-")
	bn, bpre, _ := strings.Cut(strings.TrimPrefix(b, "v"), "-")
	as, bs := strings.Split(an, "."), strings.Split(bn, ".")
	for i := range max(len(as), len(bs)) {
		if x, y := versionPart(as, i), versionPart(bs, i); x != y {
			return x > y
		}
	}
	if apre == "" || bpre == "" {
		return apre == "" && bpre != ""
	}
	return apre > bpre
}

// versionPart returns the number at i of a version's parts, 0 past its
// end.
func versionPart(parts []string, i int) int {
	if i >= len(parts) {
		return 0
	}
	n, _ := strconv.Atoi(parts[i])
	return n
}
