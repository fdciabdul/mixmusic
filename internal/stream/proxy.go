package stream

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// chunkSize is how much of a stream one upstream request fetches. YouTube
// serves ranges of a few megabytes at full speed, and throttles requests
// for whole files.
const chunkSize = 4 << 20

// Proxy serves the audio of YouTube videos at /yt/<video id>, fetching it
// from YouTube in chunks. It answers range requests, so the audio element
// that plays it can seek.
type Proxy struct {
	Resolver *Resolver
	HTTP     *http.Client
	// Cache keeps the audio of tracks played to their end, if set.
	Cache *Cache
}

// NewProxy returns a proxy of the streams r resolves.
func NewProxy(r *Resolver) *Proxy {
	return &Proxy{Resolver: r, HTTP: &http.Client{Timeout: 2 * time.Minute}}
}

// Path returns the path the proxy serves a video's audio at.
func Path(videoID string) string { return "/yt/" + videoID }

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	videoID, ok := strings.CutPrefix(r.URL.Path, "/yt/")
	if !ok || !ValidVideoID(videoID) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if p.Cache != nil && p.Cache.Serve(w, r, videoID) {
		return
	}
	s, err := p.Resolver.Resolve(r.Context(), videoID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if s.Size == 0 {
		if s.Size, err = p.probeSize(r.Context(), s); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
	}
	start, end, partial, ok := parseRange(r.Header.Get("Range"), s.Size)
	if !ok {
		w.Header().Set("Content-Range", "bytes */"+strconv.FormatInt(s.Size, 10))
		http.Error(w, "range not satisfiable", http.StatusRequestedRangeNotSatisfiable)
		return
	}

	// Fetch the first chunk before answering, so that an expired URL can
	// still be resolved again and a failure reported as an error.
	first, err := p.fetch(r.Context(), s, start, min(start+chunkSize-1, end))
	if errors.Is(err, errExpired) {
		p.Resolver.Forget(videoID)
		if s, err = p.Resolver.Resolve(r.Context(), videoID); err == nil {
			first, err = p.fetch(r.Context(), s, start, min(start+chunkSize-1, end))
		}
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer first.Close()

	h := w.Header()
	h.Set("Content-Type", s.MimeType)
	h.Set("Accept-Ranges", "bytes")
	h.Set("Cache-Control", "no-store")
	h.Set("Content-Length", strconv.FormatInt(end-start+1, 10))
	if partial {
		h.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, s.Size))
		w.WriteHeader(http.StatusPartialContent)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	if r.Method == http.MethodHead {
		return
	}

	var out io.Writer = w
	var capture *capture
	if p.Cache != nil && start == 0 && end == s.Size-1 {
		if capture = p.Cache.Begin(videoID, s.MimeType, s.Size); capture != nil {
			out = io.MultiWriter(w, capture)
			defer capture.Abort() // a no-op once committed
		}
	}
	flusher, _ := w.(http.Flusher)
	body := first
	for off := start; off <= end; off += chunkSize {
		if off > start {
			if body, err = p.fetch(r.Context(), s, off, min(off+chunkSize-1, end)); err != nil {
				return // the response has started: all we can do is stop
			}
		}
		_, err := io.Copy(out, body)
		body.Close()
		if err != nil {
			return // the player went away, or YouTube did
		}
		if flusher != nil {
			flusher.Flush()
		}
	}
	if capture != nil {
		capture.Commit()
	}
}

// errExpired is returned when YouTube refuses a stream URL, which happens
// once it expired.
var errExpired = errors.New("stream: URL refused")

// fetch requests bytes start to end of a stream.
func (p *Proxy) fetch(ctx context.Context, s Stream, start, end int64) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.URL, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range s.Header {
		req.Header[k] = v
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
	res, err := p.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	switch res.StatusCode {
	case http.StatusPartialContent, http.StatusOK:
		if res.StatusCode == http.StatusOK && start > 0 {
			res.Body.Close()
			return nil, errors.New("stream: YouTube ignored the range")
		}
		return res.Body, nil
	case http.StatusForbidden, http.StatusGone:
		res.Body.Close()
		return nil, errExpired
	}
	res.Body.Close()
	return nil, fmt.Errorf("stream: YouTube answered HTTP %d", res.StatusCode)
}

// probeSize asks YouTube for the length of a stream yt-dlp did not know.
func (p *Proxy) probeSize(ctx context.Context, s Stream) (int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.URL, nil)
	if err != nil {
		return 0, err
	}
	for k, v := range s.Header {
		req.Header[k] = v
	}
	req.Header.Set("Range", "bytes=0-0")
	res, err := p.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	res.Body.Close()
	_, total, ok := strings.Cut(res.Header.Get("Content-Range"), "/")
	if size, err := strconv.ParseInt(total, 10, 64); ok && err == nil && size > 0 {
		return size, nil
	}
	return 0, errors.New("stream: YouTube did not tell the stream's length")
}

// parseRange reads a Range header of one range against a resource of size
// bytes. It returns the first and last byte, whether the request asked for
// a range at all, and false when the range cannot be satisfied.
func parseRange(header string, size int64) (start, end int64, partial, ok bool) {
	if header == "" {
		return 0, size - 1, false, size > 0
	}
	spec, found := strings.CutPrefix(header, "bytes=")
	if !found || strings.Contains(spec, ",") {
		return 0, size - 1, false, size > 0 // unsupported: send it all
	}
	from, to, _ := strings.Cut(strings.TrimSpace(spec), "-")
	switch {
	case from == "": // the last n bytes
		n, err := strconv.ParseInt(to, 10, 64)
		if err != nil || n <= 0 {
			return 0, 0, true, false
		}
		start, end = max(size-n, 0), size-1
	default:
		var err error
		if start, err = strconv.ParseInt(from, 10, 64); err != nil {
			return 0, 0, true, false
		}
		end = size - 1
		if to != "" {
			if end, err = strconv.ParseInt(to, 10, 64); err != nil {
				return 0, 0, true, false
			}
			end = min(end, size-1)
		}
	}
	if start < 0 || start > end || start >= size {
		return 0, 0, true, false
	}
	return start, end, true, true
}
