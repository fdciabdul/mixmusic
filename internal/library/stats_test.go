package library

import (
	"testing"
	"time"

	"github.com/fzn0x/mixmusic/internal/media"
)

func TestStats(t *testing.T) {
	l := open(t)
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	a, b := tr("yt:a", media.SourceYouTube, "A"), tr("sp:b", media.SourceSpotify, "B")
	l.RecordPlay(a)
	l.RecordPlay(b)
	l.RecordPlay(a)
	s := l.Stats(0)
	if s.Plays != 3 || s.YouTube != 2 || s.Spotify != 1 || s.Minutes != 9 {
		t.Errorf("stats = %+v", s)
	}
	if s.TopTracks[0].Track.ID != "yt:a" || s.TopTracks[0].Plays != 2 || s.TopArtists[0].Artist.Name != "A" {
		t.Errorf("top = %+v %+v", s.TopTracks, s.TopArtists)
	}
	now = now.AddDate(0, 0, 10)
	if s := l.Stats(7); s.Plays != 0 {
		t.Errorf("plays older than a week counted: %+v", s)
	}
}
