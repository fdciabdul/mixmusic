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

func TestStatsDaily(t *testing.T) {
	l := open(t)
	zone := time.FixedZone("UTC+7", 7*60*60)
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, zone)
	l.now = func() time.Time { return now }
	a := tr("yt:a", media.SourceYouTube, "A")
	// Two plays on the 16th, local time; one just after midnight of the 18th.
	now = time.Date(2026, 10, 16, 9, 0, 0, 0, zone)
	l.RecordPlay(a)
	l.RecordPlay(a)
	now = time.Date(2026, 10, 18, 0, 30, 0, 0, zone)
	l.RecordPlay(a)
	now = time.Date(2026, 10, 18, 12, 0, 0, 0, zone)

	s := l.Stats(7)
	if len(s.Daily) != 7 || s.Daily[0].Date != "2026-10-12" || s.Daily[6].Date != "2026-10-18" {
		t.Fatalf("daily days = %+v", s.Daily)
	}
	if d := s.Daily[4]; d.Date != "2026-10-16" || d.Plays != 2 || d.Minutes != 6 {
		t.Errorf("the 16th = %+v", d)
	}
	if d := s.Daily[6]; d.Plays != 1 || d.Minutes != 3 {
		t.Errorf("the 18th = %+v", d)
	}
	if d := s.Daily[5]; d.Plays != 0 || d.Minutes != 0 {
		t.Errorf("a day without plays = %+v", d)
	}
	if all := l.Stats(0); len(all.Daily) != 90 || all.Daily[89].Plays != 1 {
		t.Errorf("all time covers %d days, last %+v", len(all.Daily), all.Daily[len(all.Daily)-1])
	}
}
