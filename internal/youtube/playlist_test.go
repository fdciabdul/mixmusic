package youtube

import "testing"

func TestParsePlaylist(t *testing.T) {
	p, token, err := parsePlaylist(fixture(t, "playlist"), "PLfP6i5T0-DkIMLNRwmJpRBs4PJvxfgwBg")
	if err != nil {
		t.Fatal(err)
	}
	if p.Title != "Lofi Music (No Copyright) ☕" {
		t.Errorf("title = %q", p.Title)
	}
	if p.TrackCount != 56 {
		t.Errorf("track count = %d", p.TrackCount)
	}
	if token != "" {
		t.Errorf("a complete playlist has a continuation: %q", token)
	}
	if len(p.Tracks) == 0 {
		t.Fatal("no tracks")
	}
	first := p.Tracks[0]
	if first.ID != "yt:BH-SnQ8J1VU" || first.DurationMs != 209000 || len(first.Artists) == 0 {
		t.Errorf("first track = %+v", first)
	}
}
