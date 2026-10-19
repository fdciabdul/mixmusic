package youtube

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fzn0x/mixmusic/internal/media"
)

// libraryPage wraps sections the way library pages lay them out: in the
// single column, the grid or the shelf inside an item section.
func libraryPage(section map[string]any) node {
	return node{map[string]any{
		"contents": map[string]any{"singleColumnBrowseResultsRenderer": map[string]any{"tabs": []any{
			map[string]any{"tabRenderer": map[string]any{"content": map[string]any{"sectionListRenderer": map[string]any{
				"contents": []any{map[string]any{"itemSectionRenderer": map[string]any{"contents": []any{section}}}},
			}}}},
		}}},
	}}
}

// carouselItems returns the raw items of a fixture's carousel or grid.
func carouselItems(t *testing.T, n node, title string) []any {
	t.Helper()
	sections := n.get("contents", "singleColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer", "content", "sectionListRenderer", "contents")
	for _, s := range sections.list() {
		c := s.get("musicCarouselShelfRenderer")
		if c.get("header", "musicCarouselShelfBasicHeaderRenderer", "title").text() == title {
			return c.get("contents").v.([]any)
		}
	}
	t.Fatalf("no shelf %q", title)
	return nil
}

func TestParseLibraryPages(t *testing.T) {
	playlists := carouselItems(t, fixture(t, "mood"), "Coffee shop blends")
	create := map[string]any{"musicTwoRowItemRenderer": map[string]any{
		"title":              map[string]any{"runs": []any{map[string]any{"text": "New playlist"}}},
		"navigationEndpoint": map[string]any{"createPlaylistEndpoint": map[string]any{}},
	}}
	page := libraryPage(map[string]any{"gridRenderer": map[string]any{"items": append([]any{create}, playlists...)}})
	shelves := parseShelves(page)
	if len(shelves) != 1 || len(shelves[0].Items) != len(playlists) || shelves[0].Items[0].Kind != media.ItemPlaylist {
		t.Fatalf("playlists page = %+v", shelves)
	}

	albums := carouselItems(t, fixture(t, "explore"), "New albums & singles")
	if items := parseShelves(libraryPage(map[string]any{"gridRenderer": map[string]any{"items": albums}})); len(items) != 1 || items[0].Items[0].Kind != media.ItemAlbum {
		t.Errorf("albums page = %+v", items)
	}

	artists := carouselItems(t, fixture(t, "charts"), "Top artists")
	subs := parseShelves(libraryPage(map[string]any{"musicShelfRenderer": map[string]any{"contents": artists}}))
	if len(subs) != 1 || subs[0].Items[0].Kind != media.ItemArtist || subs[0].Items[0].Artist.Name == "" {
		t.Errorf("subscriptions page = %+v", subs)
	}
}

func TestParseAccount(t *testing.T) {
	var v any
	json.Unmarshal([]byte(`{"actions":[{"openPopupAction":{"popup":{"multiPageMenuRenderer":{"header":{"activeAccountHeaderRenderer":{
		"accountName":{"runs":[{"text":"Ada Lovelace"}]},
		"channelHandle":{"runs":[{"text":"@ada"}]},
		"accountPhoto":{"thumbnails":[{"url":"https://yt3.example/s48"},{"url":"https://yt3.example/s88"}]}
	}}}}}}]}`), &v)
	a := parseAccount(node{v})
	if a.Name != "Ada Lovelace" || a.Handle != "@ada" || a.Photo != "https://yt3.example/s88" {
		t.Errorf("account = %+v", a)
	}
}

func TestAlbumPlaylistAndSaved(t *testing.T) {
	a, err := parseAlbum(fixture(t, "album"), "MPREb_test")
	if err != nil {
		t.Fatal(err)
	}
	if len(a.PlaylistID) < 8 || a.PlaylistID[:8] != "OLAK5uy_" {
		t.Errorf("playlist ID = %q", a.PlaylistID)
	}
	if a.Saved {
		t.Error("a page fetched signed out says the album is saved")
	}
	var h any
	json.Unmarshal([]byte(`{"buttons":[{"downloadButtonRenderer":{}},{"toggleButtonRenderer":{"isToggled":true,"defaultIcon":{"iconType":"LIBRARY_ADD"},"toggledIcon":{"iconType":"LIBRARY_SAVED"}}}]}`), &h)
	if !savedInLibrary(node{h}) {
		t.Error("the save button's state was not read")
	}
}

func TestLibraryActions(t *testing.T) {
	type request struct {
		path string
		body map[string]any
	}
	var got []request
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, _ := io.ReadAll(r.Body)
		var body map[string]any
		json.Unmarshal(data, &body)
		got = append(got, request{r.URL.Path, body})
		w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	c := New()
	c.BaseURL = srv.URL
	ctx := context.Background()
	if err := c.SetLiked(ctx, "vid", true); err != ErrSignedOut {
		t.Errorf("signed out, liking gave %v", err)
	}
	c.SetCookies(session)
	c.SetLiked(ctx, "vid", true)
	c.SetLiked(ctx, "vid", false)
	c.SetSaved(ctx, "OLAK5uy_x", true)
	c.SetSubscribed(ctx, "MPLAUCabc", true)
	c.SetSubscribed(ctx, "UCabc", false)
	want := []string{"/youtubei/v1/like/like", "/youtubei/v1/like/removelike", "/youtubei/v1/like/like", "/youtubei/v1/subscription/subscribe", "/youtubei/v1/subscription/unsubscribe"}
	if len(got) != len(want) {
		t.Fatalf("requests = %+v", got)
	}
	for i, w := range want {
		if got[i].path != w {
			t.Errorf("request %d went to %s, want %s", i, got[i].path, w)
		}
	}
	if target := got[0].body["target"].(map[string]any); target["videoId"] != "vid" {
		t.Errorf("like target = %v", target)
	}
	if target := got[2].body["target"].(map[string]any); target["playlistId"] != "OLAK5uy_x" {
		t.Errorf("save target = %v", target)
	}
	if ids := got[3].body["channelIds"].([]any); ids[0] != "UCabc" {
		t.Errorf("subscribed to %v, want the channel without MPLA", ids)
	}
}
