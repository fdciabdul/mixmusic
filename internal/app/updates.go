package app

import (
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/updater"
)

// UpdateStatus is whether MixMusic updates itself, and how.
type UpdateStatus struct {
	// Enabled is false for builds that cannot replace themselves: those
	// of development, and installs of a package manager.
	Enabled bool `json:"enabled"`
	// AutomaticChecks checks for a new version once a day.
	AutomaticChecks bool `json:"automaticChecks"`
	// AutomaticDownloads installs new versions without asking; they run
	// at the next launch.
	AutomaticDownloads bool `json:"automaticDownloads"`
	// LastCheck is when MixMusic last checked, as RFC 3339, or "".
	LastCheck string `json:"lastCheck"`
}

// UpdatesChanged tells every window the update preferences changed, after
// a check too.
var UpdatesChanged = mygo.NewEvent[UpdateStatus]("updatesChanged")

func updateStatus() UpdateStatus {
	s := UpdateStatus{
		Enabled:            mygo.Updater.Enabled(),
		AutomaticChecks:    updater.AutomaticChecks(),
		AutomaticDownloads: updater.AutomaticDownloads(),
	}
	if t := updater.LastCheck(); !t.IsZero() {
		s.LastCheck = t.Format(time.RFC3339)
	}
	return s
}

// watchUpdates tells the windows when the update preferences change.
func watchUpdates() {
	updater.OnChange(func() { UpdatesChanged.Broadcast(updateStatus()) })
}

// Updates returns whether MixMusic updates itself, and how.
func (s *System) Updates() UpdateStatus { return updateStatus() }

// CheckForUpdates checks for a new version now, in the update window,
// which says when MixMusic is up to date.
func (s *System) CheckForUpdates() { updater.CheckForUpdates() }

// SetUpdates turns the daily check and the installs without asking on or
// off.
func (s *System) SetUpdates(automaticChecks, automaticDownloads bool) UpdateStatus {
	updater.SetAutomaticChecks(automaticChecks)
	updater.SetAutomaticDownloads(automaticDownloads && automaticChecks)
	return updateStatus()
}
