package youtube

import "testing"

func TestParseQueue(t *testing.T) {
	n := fixture(t, "next")
	tracks := parseQueue(n)
	if len(tracks) < 2 {
		t.Fatalf("tracks = %d", len(tracks))
	}
	first := tracks[0]
	if first.ID != "yt:w3XzgjlKFjc" || first.Title != "Draft Punk" || first.DurationMs != 208000 {
		t.Errorf("first = %+v", first)
	}
	if len(first.Artists) != 1 || first.Artists[0].Name != "DJT" {
		t.Errorf("artists = %+v", first.Artists)
	}
	if first.Album == nil || first.Album.Name != "Q-ENA II" {
		t.Errorf("album = %+v", first.Album)
	}
	if got := lyricsBrowseID(n); got != "MPLYt_I0lA998lMLT-8" {
		t.Errorf("lyrics browse id = %q", got)
	}
}

func TestParseLyrics(t *testing.T) {
	text, source := parseLyrics(fixture(t, "lyrics"))
	if text == "" || source != "Source: Example Lyrics" {
		t.Errorf("lyrics = %q, %q", text, source)
	}
}
