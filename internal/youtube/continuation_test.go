package youtube

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fzn0x/mixmusic/internal/media"
)

// pages answers browse requests by their continuation token, "" for the
// first page, and counts the requests.
func pages(t *testing.T, byToken map[string]any) (*Client, *atomic.Int32) {
	t.Helper()
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		data, _ := io.ReadAll(r.Body)
		var body struct {
			Continuation string `json:"continuation"`
		}
		json.Unmarshal(data, &body)
		page, ok := byToken[body.Continuation]
		if !ok {
			t.Errorf("asked for page %q", body.Continuation)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(page)
	}))
	t.Cleanup(srv.Close)
	c := New()
	c.BaseURL = srv.URL
	return c, &n
}

func next(token string) []any {
	return []any{map[string]any{"nextContinuationData": map[string]any{"continuation": token}}}
}

// Library lists come a page at a time, in either of YouTube's two forms.
func TestLibraryPages(t *testing.T) {
	albums := carouselItems(t, fixture(t, "explore"), "New albums & singles")
	if len(albums) < 4 {
		t.Fatalf("the fixture has %d albums", len(albums))
	}
	first := libraryPage(map[string]any{"gridRenderer": map[string]any{"items": albums[:2], "continuations": next("T1")}})
	c, _ := pages(t, map[string]any{
		"":   first.v,
		"T1": map[string]any{"continuationContents": map[string]any{"gridContinuation": map[string]any{"items": albums[2:3], "continuations": next("T2")}}},
		"T2": map[string]any{"onResponseReceivedActions": []any{map[string]any{"appendContinuationItemsAction": map[string]any{
			"continuationItems": albums[3:4],
		}}}},
	})
	c.SetCookies(session)
	got, err := c.LibraryAlbums(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 {
		t.Errorf("read %d albums, want the 4 of three pages", len(got))
	}
}

// A list whose items end in a continuation item goes on from it.
func TestListTokenFromItem(t *testing.T) {
	artists := carouselItems(t, fixture(t, "charts"), "Top artists")
	more := map[string]any{"continuationItemRenderer": map[string]any{"continuationEndpoint": map[string]any{"continuationCommand": map[string]any{"token": "A1"}}}}
	page := libraryPage(map[string]any{"musicShelfRenderer": map[string]any{"contents": append(append([]any{}, artists[:1]...), more)}})
	if got := listToken(page); got != "A1" {
		t.Errorf("listToken = %q, want A1", got)
	}
	items, token := listContinuation(node{map[string]any{"continuationContents": map[string]any{"musicShelfContinuation": map[string]any{"contents": artists[1:2]}}}})
	if len(parseItems(items)) != 1 || parseItems(items)[0].Kind != media.ItemArtist || token != "" {
		t.Errorf("listContinuation = %d items, %q", len(items), token)
	}
}

// Home comes a few shelves at a time.
func TestHomePages(t *testing.T) {
	sections := fixture(t, "home").get("contents", "singleColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer", "content", "sectionListRenderer", "contents").v.([]any)
	var carousels []any
	for _, s := range sections {
		if _, ok := s.(map[string]any)["musicCarouselShelfRenderer"]; ok {
			carousels = append(carousels, s)
		}
	}
	if len(carousels) < 2 {
		t.Fatalf("the fixture has %d carousels", len(carousels))
	}
	first := map[string]any{"contents": map[string]any{"singleColumnBrowseResultsRenderer": map[string]any{"tabs": []any{
		map[string]any{"tabRenderer": map[string]any{"content": map[string]any{"sectionListRenderer": map[string]any{
			"contents": carousels[:1], "continuations": next("H1"),
		}}}},
	}}}}
	c, _ := pages(t, map[string]any{
		"":   first,
		"H1": map[string]any{"continuationContents": map[string]any{"sectionListContinuation": map[string]any{"contents": carousels[1:2], "continuations": next("H2")}}},
		"H2": map[string]any{"continuationContents": map[string]any{"sectionListContinuation": map[string]any{"contents": carousels[:1]}}},
	})
	shelves, err := c.Home(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(shelves) != 3 {
		t.Errorf("home has %d shelves, want the 3 of three pages", len(shelves))
	}
}

// loggedIn is the context of a response YouTube gives with logged_in set.
func loggedIn(value string) map[string]any {
	return map[string]any{"responseContext": map[string]any{"serviceTrackingParams": []any{
		map[string]any{"service": "GFEEDBACK", "params": []any{map[string]any{"key": "logged_in", "value": value}}},
	}}}
}

// When YouTube answers the session as a visitor, it ended it: the client
// says so once, and asks for no more of the account until a new sign-in.
func TestRejectedSession(t *testing.T) {
	c, requests := pages(t, map[string]any{"": loggedIn("0")})
	rejected := make(chan struct{}, 2)
	c.OnRejected = func() { rejected <- struct{}{} }

	// Signed out, a visitor's answer is no news.
	c.Home(context.Background())
	if c.Rejected() {
		t.Fatal("a signed-out client was rejected")
	}

	c.SetCookies(session)
	if _, err := c.Account(context.Background()); !errors.Is(err, ErrSessionRejected) {
		t.Fatalf("Account() = %v, want ErrSessionRejected", err)
	}
	select {
	case <-rejected:
	case <-time.After(time.Second):
		t.Fatal("OnRejected was not called")
	}
	before := requests.Load()
	if _, err := c.LibraryAlbums(context.Background()); !errors.Is(err, ErrSessionRejected) {
		t.Errorf("LibraryAlbums() = %v, want ErrSessionRejected", err)
	}
	if err := c.SetLiked(context.Background(), "vid", true); !errors.Is(err, ErrSessionRejected) {
		t.Errorf("SetLiked() = %v, want ErrSessionRejected", err)
	}
	if requests.Load() != before {
		t.Error("asked YouTube for the account after it rejected the session")
	}
	c.Home(context.Background())
	select {
	case <-rejected:
		t.Error("OnRejected was called twice")
	case <-time.After(50 * time.Millisecond):
	}

	c.SetCookies(session)
	if c.Rejected() {
		t.Error("a new sign-in is still rejected")
	}
}

func TestRejectedByStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	c := New()
	c.BaseURL = srv.URL
	c.SetCookies(session)
	if _, err := c.LibraryPlaylists(context.Background()); err == nil {
		t.Fatal("HTTP 401 gave no error")
	}
	if !c.Rejected() {
		t.Error("HTTP 401 to a signed request did not reject the session")
	}
}

// A signed-in answer keeps the session.
func TestAcceptedSession(t *testing.T) {
	c, _ := pages(t, map[string]any{"": loggedIn("1")})
	c.SetCookies(session)
	c.LibraryAlbums(context.Background())
	if c.Rejected() {
		t.Error("logged_in 1 rejected the session")
	}
}
