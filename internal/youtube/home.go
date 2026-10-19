package youtube

import (
	"context"

	"github.com/fzn0x/mixmusic/internal/media"
)

// Home returns the shelves of YouTube Music's home page: quick picks,
// mixes, albums and playlists. Signed in, they are the user's own.
func (c *Client) Home(ctx context.Context) ([]media.Shelf, error) {
	n, err := c.browse(ctx, "FEmusic_home")
	if err != nil {
		return nil, err
	}
	return parseShelves(n), nil
}

// parseShelves reads the carousels and grids of a browse page.
func parseShelves(n node) []media.Shelf {
	return sectionShelves(n.get("contents", "singleColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer", "content", "sectionListRenderer", "contents"))
}

// sectionShelves reads the shelves among the sections of a page: its
// carousels, and its grids of cards. Sections of other kinds, and shelves
// with no item MixMusic can show, are left out.
func sectionShelves(sections node) []media.Shelf {
	shelves := []media.Shelf{}
	for _, s := range sections.list() {
		if inner := s.get("itemSectionRenderer", "contents"); inner.exists() {
			shelves = append(shelves, sectionShelves(inner)...)
			continue
		}
		var (
			title, subtitle string
			contents        []node
		)
		if carousel := s.get("musicCarouselShelfRenderer"); carousel.exists() {
			header := carousel.get("header", "musicCarouselShelfBasicHeaderRenderer")
			title, subtitle = header.get("title").text(), header.get("strapline").text()
			contents = carousel.get("contents").list()
		} else if grid := s.get("gridRenderer"); grid.exists() {
			title = grid.get("header", "gridHeaderRenderer", "title").text()
			contents = grid.get("items").list()
		} else if list := s.get("musicShelfRenderer"); list.exists() {
			title = list.get("title").text()
			contents = list.get("contents").list()
		} else {
			continue
		}
		items := parseItems(contents)
		if len(items) == 0 {
			continue
		}
		shelves = append(shelves, media.Shelf{Title: title, Subtitle: subtitle, Source: media.SourceYouTube, Items: items})
	}
	return shelves
}
