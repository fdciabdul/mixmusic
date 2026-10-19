package youtube

import (
	"context"
	"strings"

	"github.com/fzn0x/mixmusic/internal/media"
)

// moodsBrowseID is the browse ID of the page of one mood or genre, which
// its params choose.
const moodsBrowseID = "FEmusic_moods_and_genres_category"

// Mood is a mood or a genre of YouTube Music, such as Chill or Jazz.
type Mood struct {
	Title string `json:"title"`
	// Params opens its page, with Client.Mood.
	Params string `json:"params"`
}

// MoodGroup is a group of moods, such as "Moods & moments" or "Genres".
type MoodGroup struct {
	Title string `json:"title"`
	Moods []Mood `json:"moods"`
}

// Explore returns the shelves of YouTube Music's explore page: new albums
// and singles, trending songs and new music videos.
func (c *Client) Explore(ctx context.Context) ([]media.Shelf, error) {
	n, err := c.browse(ctx, "FEmusic_explore")
	if err != nil {
		return nil, err
	}
	return parseShelves(n), nil
}

// Charts returns the shelves of YouTube Music's charts: the top songs,
// videos and artists of the region.
func (c *Client) Charts(ctx context.Context) ([]media.Shelf, error) {
	n, err := c.browse(ctx, "FEmusic_charts")
	if err != nil {
		return nil, err
	}
	return parseShelves(n), nil
}

// Moods returns the moods and the genres YouTube Music browses by.
func (c *Client) Moods(ctx context.Context) ([]MoodGroup, error) {
	n, err := c.browse(ctx, "FEmusic_moods_and_genres")
	if err != nil {
		return nil, err
	}
	return parseMoods(n), nil
}

func parseMoods(n node) []MoodGroup {
	groups := []MoodGroup{}
	sections := n.get("contents", "singleColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer", "content", "sectionListRenderer", "contents")
	for _, s := range sections.list() {
		grid := s.get("gridRenderer")
		if !grid.exists() {
			continue
		}
		g := MoodGroup{Title: grid.get("header", "gridHeaderRenderer", "title").text(), Moods: []Mood{}}
		for _, item := range grid.get("items").list() {
			b := item.get("musicNavigationButtonRenderer")
			endpoint := b.get("clickCommand", "browseEndpoint")
			if params := endpoint.get("params").str(); params != "" && endpoint.get("browseId").str() == moodsBrowseID {
				g.Moods = append(g.Moods, Mood{Title: strings.TrimSpace(b.get("buttonText").text()), Params: params})
			}
		}
		if len(g.Moods) > 0 {
			groups = append(groups, g)
		}
	}
	return groups
}

// Mood returns the title of a mood or a genre, and its shelves of
// playlists.
func (c *Client) Mood(ctx context.Context, params string) (string, []media.Shelf, error) {
	n, err := c.call(ctx, "browse", map[string]any{"browseId": moodsBrowseID, "params": params}, nil)
	if err != nil {
		return "", nil, err
	}
	shelves := parseShelves(n)
	if len(shelves) == 0 {
		return "", nil, ErrNotFound
	}
	return n.get("header", "musicHeaderRenderer", "title").text(), shelves, nil
}
