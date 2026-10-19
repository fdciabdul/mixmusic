package youtube

import (
	"testing"

	"github.com/fzn0x/mixmusic/internal/media"
)

func TestParseCharts(t *testing.T) {
	shelves := parseShelves(fixture(t, "charts"))
	if len(shelves) < 2 {
		t.Fatalf("charts = %+v", shelves)
	}
	var artists *media.Shelf
	for i := range shelves {
		if shelves[i].Title == "Top artists" {
			artists = &shelves[i]
		}
	}
	if artists == nil || artists.Items[0].Kind != media.ItemArtist || artists.Items[0].Artist.Name == "" {
		t.Errorf("top artists = %+v", artists)
	}
}

func TestParseMoods(t *testing.T) {
	groups := parseMoods(fixture(t, "moods"))
	if len(groups) != 2 || groups[0].Title != "Moods & moments" || groups[1].Title != "Genres" {
		t.Fatalf("groups = %+v", groups)
	}
	if m := groups[0].Moods[0]; m.Title != "Chill" || m.Params == "" {
		t.Errorf("first mood = %+v", m)
	}
	if len(groups[1].Moods) < 10 {
		t.Errorf("genres = %d", len(groups[1].Moods))
	}
}

func TestParseMoodPage(t *testing.T) {
	n := fixture(t, "mood")
	if title := n.get("header", "musicHeaderRenderer", "title").text(); title != "Chill" {
		t.Errorf("title = %q", title)
	}
	shelves := parseShelves(n)
	if len(shelves) == 0 || shelves[0].Title != "Coffee shop blends" || shelves[0].Items[0].Kind != media.ItemPlaylist {
		t.Errorf("shelves = %+v", shelves)
	}
}
