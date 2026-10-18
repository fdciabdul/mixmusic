package youtube

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/fzn0x/mixmusic/internal/media"
)

// TestLive checks the parsers against YouTube Music itself, which changes
// its responses from time to time. It runs with MIXMUSIC_LIVE=1:
//
//	MIXMUSIC_LIVE=1 go test ./internal/youtube -run Live -v
func TestLive(t *testing.T) {
	if os.Getenv("MIXMUSIC_LIVE") == "" {
		t.Skip("set MIXMUSIC_LIVE=1 to test against YouTube Music")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	c := New()

	results, err := c.SearchAll(ctx, "daft punk")
	if err != nil {
		t.Fatal(err)
	}
	if len(results.Tracks) == 0 || len(results.Albums) == 0 || len(results.Artists) == 0 || len(results.Playlists) == 0 {
		t.Fatalf("search found %d tracks, %d albums, %d artists, %d playlists",
			len(results.Tracks), len(results.Albums), len(results.Artists), len(results.Playlists))
	}
	t.Logf("first track: %s by %s", results.Tracks[0].Title, results.Tracks[0].ArtistNames())

	_, albumID, _ := media.ParseID(results.Albums[0].ID)
	album, err := c.Album(ctx, albumID)
	if err != nil || len(album.Tracks) == 0 {
		t.Fatalf("album %s: %d tracks, %v", albumID, len(album.Tracks), err)
	}

	_, artistID, _ := media.ParseID(results.Artists[0].ID)
	artist, err := c.Artist(ctx, artistID)
	if err != nil || len(artist.TopTracks) == 0 {
		t.Fatalf("artist %s: %d top tracks, %v", artistID, len(artist.TopTracks), err)
	}

	_, playlistID, _ := media.ParseID(results.Playlists[0].ID)
	playlist, err := c.Playlist(ctx, playlistID)
	if err != nil || len(playlist.Tracks) == 0 {
		t.Fatalf("playlist %s: %d tracks, %v", playlistID, len(playlist.Tracks), err)
	}

	_, videoID, _ := media.ParseID(results.Tracks[0].ID)
	radio, err := c.Radio(ctx, videoID)
	if err != nil || len(radio) < 10 {
		t.Fatalf("radio of %s: %d tracks, %v", videoID, len(radio), err)
	}

	shelves, err := c.Home(ctx)
	if err != nil || len(shelves) == 0 {
		t.Fatalf("home: %d shelves, %v", len(shelves), err)
	}

	suggestions, err := c.Suggestions(ctx, "daft p")
	if err != nil || len(suggestions) == 0 {
		t.Fatalf("suggestions: %v, %v", suggestions, err)
	}
}
