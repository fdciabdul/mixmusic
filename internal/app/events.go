package app

import (
	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/internal/addons"
	"github.com/fzn0x/mixmusic/internal/media"
	"github.com/fzn0x/mixmusic/internal/settings"
)

// Repeat is the repeat mode of the queue.
type Repeat string

const (
	RepeatOff Repeat = "off"
	RepeatAll Repeat = "all"
	RepeatOne Repeat = "one"
)

// NowPlaying is what the player plays, as the main window reports it to
// the mini player, the tray and notifications.
type NowPlaying struct {
	Track      *media.Track `json:"track"`
	Playing    bool         `json:"playing"`
	PositionMs int          `json:"positionMs"`
	DurationMs int          `json:"durationMs"`
	Volume     float64      `json:"volume"`
	Shuffle    bool         `json:"shuffle"`
	Repeat     Repeat       `json:"repeat"`
	Liked      bool         `json:"liked"`
}

// Command is something the player is asked to do from outside the main
// window: the tray, media keys, the mini player, a deep link.
type Command string

const (
	CommandToggle   Command = "toggle"
	CommandPlay     Command = "play"
	CommandPause    Command = "pause"
	CommandNext     Command = "next"
	CommandPrevious Command = "previous"
	CommandSeek     Command = "seek"
	CommandVolume   Command = "volume"
	CommandLike     Command = "like"
	CommandShuffle  Command = "shuffle"
	CommandRepeat   Command = "repeat"
	// CommandPlayTrack plays the track of TrackID.
	CommandPlayTrack Command = "playTrack"
)

// PlayerCommand is a Command with its argument: the position in
// milliseconds to seek to, or the volume from 0 to 1.
type PlayerCommand struct {
	Command Command `json:"command"`
	Value   float64 `json:"value,omitempty"`
	TrackID string  `json:"trackId,omitempty"`
}

var (
	// NowPlayingChanged tells every window what plays.
	NowPlayingChanged = mygo.NewEvent[NowPlaying]("nowPlaying")
	// PlayerCommandSent asks the main window's player to do something.
	PlayerCommandSent = mygo.NewEvent[PlayerCommand]("playerCommand")
	// SettingsChanged tells every window the new settings.
	SettingsChanged = mygo.NewEvent[settings.Settings]("settingsChanged")
	// AddonsChanged tells every window the add-ons changed.
	AddonsChanged = mygo.NewEvent[addons.Inventory]("addonsChanged")
	// AccountsChanged tells every window the user signed in or out.
	AccountsChanged = mygo.NewEvent[AccountsStatus]("accountsChanged")
	// NavigateRequested asks the main window to show a page, such as
	// "/search?q=daft%20punk".
	NavigateRequested = mygo.NewEvent[string]("navigate")
)
