package youtube

import (
	"testing"

	"github.com/fzn0x/mixmusic/internal/media"
)

func TestParseArtist(t *testing.T) {
	a, err := parseArtist(fixture(t, "artist"), "UCbM50mQtG58vhLZonicYUrQ")
	if err != nil {
		t.Fatal(err)
	}
	if a.Name != "DJT" {
		t.Errorf("name = %q", a.Name)
	}
	if len(a.TopTracks) == 0 {
		t.Error("no top tracks")
	}
	if len(a.Albums) != 1 || a.Albums[0].Title != "Q-ENA II" || a.Albums[0].Year != "2021" {
		t.Errorf("albums = %+v", a.Albums)
	}
	if len(a.Singles) == 0 || a.Singles[0].Kind != media.AlbumKindSingle || len(a.Singles[0].Artists) == 0 {
		t.Errorf("singles = %+v", a.Singles)
	}
	if len(a.Artwork) == 0 {
		t.Error("no artwork")
	}
}
