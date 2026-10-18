package youtube

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/fzn0x/mixmusic/internal/media"
)

// fixture loads a response recorded from YouTube Music in testdata.
func fixture(t *testing.T, name string) node {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	return node{v}
}

func TestParseDuration(t *testing.T) {
	for in, want := range map[string]int{"3:28": 208000, "0:05": 5000, "1:02:03": 3723000, "2021": 0, "": 0} {
		if got := parseDuration(in); got != want {
			t.Errorf("parseDuration(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestParseSearchSongs(t *testing.T) {
	items := parseSearch(fixture(t, "search-songs"))
	if len(items) == 0 {
		t.Fatal("no songs")
	}
	first := items[0]
	if first.Kind != media.ItemTrack {
		t.Fatalf("kind = %s", first.Kind)
	}
	tr := first.Track
	if tr.ID != "yt:w3XzgjlKFjc" || tr.Title != "Draft Punk" {
		t.Errorf("track = %s %q", tr.ID, tr.Title)
	}
	if len(tr.Artists) != 1 || tr.Artists[0].Name != "DJT" || tr.Artists[0].ID != "yt:UCbM50mQtG58vhLZonicYUrQ" {
		t.Errorf("artists = %+v", tr.Artists)
	}
	if tr.Album == nil || tr.Album.Name != "Q-ENA II" || tr.Album.ID != "yt:MPREb_I0lA998lMLT" {
		t.Errorf("album = %+v", tr.Album)
	}
	if tr.DurationMs != 208000 {
		t.Errorf("duration = %d", tr.DurationMs)
	}
	if tr.Video {
		t.Error("an audio track was taken for a video")
	}
	if len(tr.Artwork) != 2 || tr.Artwork[1].Width != artworkSize {
		t.Errorf("artwork = %+v", tr.Artwork)
	}
	for _, item := range items {
		if item.Kind != media.ItemTrack || item.Track.Title == "" || len(item.Track.Artists) == 0 {
			t.Errorf("incomplete song: %+v", item.Track)
		}
	}
}

func TestParseSearchAlbums(t *testing.T) {
	items := parseSearch(fixture(t, "search-albums"))
	if len(items) == 0 {
		t.Fatal("no albums")
	}
	a := items[0].Album
	if items[0].Kind != media.ItemAlbum || a.ID != "yt:MPREb_U2TOa6FkWVi" {
		t.Fatalf("first = %+v", items[0])
	}
	if a.Kind != media.AlbumKindSingle || a.Year != "2026" {
		t.Errorf("kind, year = %q, %q", a.Kind, a.Year)
	}
	if len(a.Artists) == 0 || a.Artists[0].Name != "Infinite Webs" {
		t.Errorf("artists = %+v", a.Artists)
	}
}

func TestParseSearchArtists(t *testing.T) {
	items := parseSearch(fixture(t, "search-artists"))
	if len(items) == 0 || items[0].Kind != media.ItemArtist {
		t.Fatalf("items = %+v", items)
	}
	a := items[0].Artist
	if a.Name != "Daft Punk" || a.ID != "yt:UCRr1xG_2WIDs18a6cIiCxeA" {
		t.Errorf("artist = %q %s", a.Name, a.ID)
	}
	if a.Subtitle != "72.5M monthly audience" {
		t.Errorf("subtitle = %q", a.Subtitle)
	}
}

func TestParseSearchPlaylists(t *testing.T) {
	items := parseSearch(fixture(t, "search-playlists"))
	if len(items) == 0 || items[0].Kind != media.ItemPlaylist {
		t.Fatalf("items = %+v", items)
	}
	p := items[0].Playlist
	if p.ID != "yt:PLfP6i5T0-DkIMLNRwmJpRBs4PJvxfgwBg" {
		t.Errorf("id = %s", p.ID)
	}
	if p.Owner != "BreakingCopyright — Royalty Free Music" {
		t.Errorf("owner = %q", p.Owner)
	}
}

func TestParseSuggestions(t *testing.T) {
	got := parseSuggestions(fixture(t, "suggest"))
	if len(got) == 0 || got[0] != "daft punk" {
		t.Errorf("suggestions = %q", got)
	}
}
