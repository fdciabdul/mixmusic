package library

import (
	"cmp"
	"slices"
	"time"

	"github.com/fzn0x/mixmusic/internal/media"
)

// topCount is how many tracks and artists the stats rank.
const topCount = 10

// TrackPlays is a track and how often it was played.
type TrackPlays struct {
	Track media.Track `json:"track"`
	Plays int         `json:"plays"`
}

// ArtistPlays is an artist and how often their tracks were played.
type ArtistPlays struct {
	Artist media.Ref `json:"artist"`
	Plays  int       `json:"plays"`
}

// Stats sums up what the user listened to.
type Stats struct {
	Plays   int `json:"plays"`
	Minutes int `json:"minutes"`
	// YouTube and Spotify count the plays of each service's tracks.
	YouTube    int           `json:"youtube"`
	Spotify    int           `json:"spotify"`
	TopTracks  []TrackPlays  `json:"topTracks"`
	TopArtists []ArtistPlays `json:"topArtists"`
	// Days is the number of days counted; 0 counts the whole history.
	Days int `json:"days"`
}

// Stats sums up the plays of the last days, or of the whole history when
// days is 0.
func (l *Library) Stats(days int) Stats {
	s := Stats{TopTracks: []TrackPlays{}, TopArtists: []ArtistPlays{}, Days: days}
	since := time.Time{}
	if days > 0 {
		since = l.now().AddDate(0, 0, -days)
	}
	tracks := map[string]*TrackPlays{}
	artists := map[string]*ArtistPlays{}
	ms := 0
	for _, p := range l.file.Get().History {
		if p.PlayedAt.Before(since) {
			break // the history is newest first
		}
		s.Plays++
		ms += p.Track.DurationMs
		switch p.Track.Source {
		case media.SourceYouTube:
			s.YouTube++
		case media.SourceSpotify:
			s.Spotify++
		}
		if tp := tracks[p.Track.ID]; tp != nil {
			tp.Plays++
		} else {
			tracks[p.Track.ID] = &TrackPlays{Track: p.Track, Plays: 1}
		}
		for _, a := range p.Track.Artists {
			// Services spell the same artist alike, not with the same ID.
			if ap := artists[a.Name]; ap != nil {
				ap.Plays++
			} else {
				artists[a.Name] = &ArtistPlays{Artist: a, Plays: 1}
			}
		}
	}
	s.Minutes = ms / 60000
	for _, tp := range tracks {
		s.TopTracks = append(s.TopTracks, *tp)
	}
	for _, ap := range artists {
		s.TopArtists = append(s.TopArtists, *ap)
	}
	slices.SortFunc(s.TopTracks, func(a, b TrackPlays) int {
		return cmp.Or(b.Plays-a.Plays, cmp.Compare(a.Track.Title, b.Track.Title))
	})
	slices.SortFunc(s.TopArtists, func(a, b ArtistPlays) int {
		return cmp.Or(b.Plays-a.Plays, cmp.Compare(a.Artist.Name, b.Artist.Name))
	})
	s.TopTracks = s.TopTracks[:min(len(s.TopTracks), topCount)]
	s.TopArtists = s.TopArtists[:min(len(s.TopArtists), topCount)]
	return s
}
