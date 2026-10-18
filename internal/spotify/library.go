package spotify

import (
	"context"
	"net/http"
	"net/url"
)

// Save adds items to the user's library, by their Spotify URIs: tracks to
// their liked songs, albums to their albums, artists to those they follow.
func (c *Client) Save(ctx context.Context, uris ...string) error {
	return c.do(ctx, http.MethodPut, "/me/library", url.Values{"uris": {joinURIs(uris)}}, nil, nil)
}

// Remove takes items out of the user's library, by their Spotify URIs.
func (c *Client) Remove(ctx context.Context, uris ...string) error {
	return c.do(ctx, http.MethodDelete, "/me/library", url.Values{"uris": {joinURIs(uris)}}, nil, nil)
}

// Contains reports, for each URI, whether the item is in the user's
// library.
func (c *Client) Contains(ctx context.Context, uris ...string) ([]bool, error) {
	var out []bool
	err := c.get(ctx, "/me/library/contains", url.Values{"uris": {joinURIs(uris)}}, &out)
	return out, err
}

// AddToPlaylist appends tracks to a playlist the user may edit.
func (c *Client) AddToPlaylist(ctx context.Context, playlistID string, uris ...string) error {
	return c.do(ctx, http.MethodPost, "/playlists/"+url.PathEscape(playlistID)+"/items", nil, map[string]any{"uris": uris}, nil)
}
