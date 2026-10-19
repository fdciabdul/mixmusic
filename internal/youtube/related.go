package youtube

import (
	"context"
	"strings"

	"github.com/fzn0x/mixmusic/internal/media"
)

// Related returns the shelves YouTube Music relates to a track: songs you
// might also like, playlists, other performances and similar artists.
func (c *Client) Related(ctx context.Context, videoID string) ([]media.Shelf, error) {
	n, err := c.call(ctx, "next", map[string]any{"videoId": videoID, "isAudioOnly": true}, nil)
	if err != nil {
		return nil, err
	}
	browseID := relatedBrowseID(n)
	if browseID == "" {
		return []media.Shelf{}, nil
	}
	page, err := c.browse(ctx, browseID)
	if err != nil {
		return nil, err
	}
	return sectionShelves(page.get("contents", "sectionListRenderer", "contents")), nil
}

// relatedBrowseID returns the browse ID of a track's related tab.
func relatedBrowseID(n node) string {
	for _, tab := range watchNextTabs(n) {
		if id := tab.get("tabRenderer", "endpoint", "browseEndpoint", "browseId").str(); strings.HasPrefix(id, "MPTRt") {
			return id
		}
	}
	return ""
}
