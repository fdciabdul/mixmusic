package youtube

import (
	"context"
	"errors"
	"sync"

	"github.com/fzn0x/mixmusic/internal/media"
)

// Home returns the shelves of YouTube Music's home and explore pages:
// quick picks, new releases, trending songs and playlists.
func (c *Client) Home(ctx context.Context) ([]media.Shelf, error) {
	pages := []string{"FEmusic_home", "FEmusic_explore"}
	shelves := make([][]media.Shelf, len(pages))
	errs := make([]error, len(pages))
	var wg sync.WaitGroup
	for i, id := range pages {
		wg.Go(func() {
			n, err := c.browse(ctx, id)
			if err != nil {
				errs[i] = err
				return
			}
			shelves[i] = parseShelves(n)
		})
	}
	wg.Wait()
	var out []media.Shelf
	for _, s := range shelves {
		out = append(out, s...)
	}
	if len(out) == 0 {
		if err := errors.Join(errs...); err != nil {
			return nil, err
		}
	}
	if out == nil {
		out = []media.Shelf{}
	}
	return out, nil
}

// parseShelves reads the carousels of a browse page.

func parseShelves(n node) []media.Shelf {
	shelves := []media.Shelf{}
	sections := n.get("contents", "singleColumnBrowseResultsRenderer", "tabs", 0, "tabRenderer", "content", "sectionListRenderer", "contents")
	for _, s := range sections.list() {
		carousel := s.get("musicCarouselShelfRenderer")
		if !carousel.exists() {
			continue
		}
		header := carousel.get("header", "musicCarouselShelfBasicHeaderRenderer")
		items := parseItems(carousel.get("contents").list())
		if len(items) == 0 {
			continue
		}
		shelves = append(shelves, media.Shelf{
			Title:    header.get("title").text(),
			Subtitle: header.get("strapline").text(),
			Source:   media.SourceYouTube,
			Items:    items,
		})
	}
	return shelves
}
