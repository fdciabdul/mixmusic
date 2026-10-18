package youtube

import (
	"testing"

	"github.com/fzn0x/mixmusic/internal/media"
)

func TestParseShelves(t *testing.T) {
	shelves := parseShelves(fixture(t, "home"))
	if len(shelves) < 2 {
		t.Fatalf("shelves = %d", len(shelves))
	}
	if shelves[0].Title != "Quick picks" || shelves[0].Items[0].Kind != media.ItemTrack {
		t.Errorf("first shelf = %q", shelves[0].Title)
	}
	if shelves[1].Items[0].Kind != media.ItemPlaylist {
		t.Errorf("second shelf holds %s", shelves[1].Items[0].Kind)
	}
	explore := parseShelves(fixture(t, "explore"))
	if len(explore) == 0 || explore[0].Title != "New albums & singles" || explore[0].Items[0].Kind != media.ItemAlbum {
		t.Errorf("explore = %+v", explore)
	}
}
