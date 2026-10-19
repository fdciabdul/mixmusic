package youtube

import (
	"context"
	"errors"
	"strings"

	"github.com/fzn0x/mixmusic/internal/media"
)

// ErrSignedOut is returned for what needs the user signed in.
var ErrSignedOut = errors.New("youtube music: sign in to YouTube Music first")

// likedSongs is the playlist ID of the user's liked songs.
const likedSongs = "LM"

// Account is the YouTube account the client is signed in as.
type Account struct {
	Name   string `json:"name"`
	Handle string `json:"handle,omitempty"`
	Photo  string `json:"photo,omitempty"`
}

// Account returns the account the client is signed in as.
func (c *Client) Account(ctx context.Context) (Account, error) {
	if !c.SignedIn() {
		return Account{}, ErrSignedOut
	}
	n, err := c.call(ctx, "account/account_menu", map[string]any{}, nil)
	if err != nil {
		return Account{}, err
	}
	a := parseAccount(n)
	if a.Name == "" {
		return Account{}, ErrSignedOut
	}
	return a, nil
}

func parseAccount(n node) Account {
	h := n.get("actions", 0, "openPopupAction", "popup", "multiPageMenuRenderer", "header", "activeAccountHeaderRenderer")
	a := Account{Name: h.get("accountName").text(), Handle: h.get("channelHandle").text()}
	if thumbs := h.get("accountPhoto", "thumbnails").list(); len(thumbs) > 0 {
		a.Photo = thumbs[len(thumbs)-1].get("url").str()
	}
	return a
}

// LikedSongs returns the user's liked songs on YouTube Music.
func (c *Client) LikedSongs(ctx context.Context) (media.Playlist, error) {
	if !c.SignedIn() {
		return media.Playlist{}, ErrSignedOut
	}
	return c.Playlist(ctx, likedSongs)
}

// LibraryPlaylists returns the playlists the user made or saved.
func (c *Client) LibraryPlaylists(ctx context.Context) ([]media.Playlist, error) {
	items, err := c.libraryItems(ctx, "FEmusic_liked_playlists")
	playlists := []media.Playlist{}
	for _, it := range items {
		// Liked songs have a place of their own.
		if it.Kind == media.ItemPlaylist && it.Playlist.ID != media.ID(media.SourceYouTube, likedSongs) {
			playlists = append(playlists, *it.Playlist)
		}
	}
	return playlists, err
}

// LibraryAlbums returns the albums the user saved.
func (c *Client) LibraryAlbums(ctx context.Context) ([]media.Album, error) {
	items, err := c.libraryItems(ctx, "FEmusic_liked_albums")
	albums := []media.Album{}
	for _, it := range items {
		if it.Kind == media.ItemAlbum {
			albums = append(albums, *it.Album)
		}
	}
	return albums, err
}

// LibraryArtists returns the artists the user subscribes to.
func (c *Client) LibraryArtists(ctx context.Context) ([]media.Artist, error) {
	items, err := c.libraryItems(ctx, "FEmusic_library_corpus_artists")
	artists := []media.Artist{}
	for _, it := range items {
		if it.Kind == media.ItemArtist {
			artists = append(artists, *it.Artist)
		}
	}
	return artists, err
}

// libraryItems returns the items of a page of the user's library.
func (c *Client) libraryItems(ctx context.Context, browseID string) ([]media.Item, error) {
	if !c.SignedIn() {
		return nil, ErrSignedOut
	}
	n, err := c.browse(ctx, browseID)
	if err != nil {
		return nil, err
	}
	var items []media.Item
	for _, s := range parseShelves(n) {
		items = append(items, s.Items...)
	}
	return items, nil
}

// SetLiked likes a track on YouTube Music, by its video ID, or takes the
// like back.
func (c *Client) SetLiked(ctx context.Context, videoID string, liked bool) error {
	return c.rate(ctx, map[string]any{"videoId": videoID}, liked)
}

// SetSaved saves a playlist, or an album by its playlist (OLAK5uy_…), to
// the user's library, or takes it out.
func (c *Client) SetSaved(ctx context.Context, playlistID string, saved bool) error {
	return c.rate(ctx, map[string]any{"playlistId": playlistID}, saved)
}

func (c *Client) rate(ctx context.Context, target map[string]any, on bool) error {
	if !c.SignedIn() {
		return ErrSignedOut
	}
	endpoint := "like/removelike"
	if on {
		endpoint = "like/like"
	}
	_, err := c.call(ctx, endpoint, map[string]any{"target": target}, nil)
	return err
}

// SetSubscribed subscribes the user to an artist, by its channel ID, or
// unsubscribes them.
func (c *Client) SetSubscribed(ctx context.Context, channelID string, on bool) error {
	if !c.SignedIn() {
		return ErrSignedOut
	}
	endpoint := "subscription/unsubscribe"
	if on {
		endpoint = "subscription/subscribe"
	}
	// Artist pages are browsed as MPLAUC…; subscriptions take the channel.
	_, err := c.call(ctx, endpoint, map[string]any{"channelIds": []string{strings.TrimPrefix(channelID, "MPLA")}}, nil)
	return err
}
