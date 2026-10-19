package lastfm

import (
	"context"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

// maxBatch is the most plays one track.scrobble call takes.
const maxBatch = 50

// Track is a song as Last.fm knows it.
type Track struct {
	// Artist and Title name the track. Tracks without both are neither
	// announced nor scrobbled.
	Artist string `json:"artist"`
	Title  string `json:"title"`
	// Album is empty when it is not known.
	Album string `json:"album,omitempty"`
	// Duration is the length of the track, or 0 when it is not known. In
	// JSON it is a number of nanoseconds.
	Duration time.Duration `json:"duration,omitempty"`
}

// complete reports whether t has the artist and title Last.fm needs.
func (t Track) complete() bool {
	return strings.TrimSpace(t.Artist) != "" && strings.TrimSpace(t.Title) != ""
}

// Play is a listen to a track: the track and when it started playing.
type Play struct {
	Track
	// Start is when the track started playing.
	Start time.Time `json:"start"`
}

// NowPlaying tells Last.fm that the user of sessionKey started listening to
// t, which their profile shows until the track ends or another one starts.
func (c *Client) NowPlaying(ctx context.Context, sessionKey string, t Track) error {
	params := url.Values{"sk": {sessionKey}, "artist": {t.Artist}, "track": {t.Title}}
	if t.Album != "" {
		params.Set("album", t.Album)
	}
	if s := seconds(t.Duration); s > 0 {
		params.Set("duration", strconv.Itoa(s))
	}
	return c.call(ctx, "track.updateNowPlaying", params, nil)
}

// Scrobble adds plays to the listening history of the user of sessionKey.
// It sends them in order, up to 50 per call. When a call fails, Scrobble
// returns its error without making the rest; the plays of the calls before
// were scrobbled.
func (c *Client) Scrobble(ctx context.Context, sessionKey string, plays []Play) error {
	for batch := range slices.Chunk(plays, maxBatch) {
		params := url.Values{"sk": {sessionKey}}
		for i, p := range batch {
			n := "[" + strconv.Itoa(i) + "]"
			params.Set("artist"+n, p.Artist)
			params.Set("track"+n, p.Title)
			params.Set("timestamp"+n, strconv.FormatInt(p.Start.Unix(), 10))
			if p.Album != "" {
				params.Set("album"+n, p.Album)
			}
			if s := seconds(p.Duration); s > 0 {
				params.Set("duration"+n, strconv.Itoa(s))
			}
		}
		if err := c.call(ctx, "track.scrobble", params, nil); err != nil {
			return err
		}
	}
	return nil
}

// seconds returns d in whole seconds, rounded.
func seconds(d time.Duration) int {
	return int(d.Round(time.Second) / time.Second)
}
