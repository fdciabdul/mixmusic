package stream

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"sync"
)

var (
	// ErrInterrupted is returned by a Read that stopped waiting for bytes.
	ErrInterrupted = errors.New("stream: read interrupted")
	errClosed      = errors.New("stream: source closed")
	// errLoad is why a download failed, when the proxy didn't say.
	errLoad = errors.New("the network failed while loading the audio")
)

// Source is the audio of a video as MixMusic's own player reads it: what
// the proxy serves at the video's path, from the cache or YouTube, which it
// downloads from the start in the background and keeps in memory, so that
// reading again and seeking back cost nothing. A track it reads whole goes
// to the cache, as one the page plays to its end does.
type Source struct {
	cancel      context.CancelFunc
	interrupted func() bool

	mu   sync.Mutex
	cond *sync.Cond
	data []byte
	size int64 // from Content-Length, or -1
	err  error // why the download ended: io.EOF when it is whole
	pos  int64
}

// Open starts downloading the audio of a video, and returns once the proxy
// answered: with why it couldn't, in plain words, as Failure tells. A Read
// waiting for bytes returns ErrInterrupted when interrupted, if not nil,
// returns true; Wake makes such a Read check it again.
func (p *Proxy) Open(ctx context.Context, videoID string, interrupted func() bool) (*Source, error) {
	ctx, cancel := context.WithCancel(ctx)
	s := &Source{cancel: cancel, interrupted: interrupted, size: -1}
	s.cond = sync.NewCond(&s.mu)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, Path(videoID), nil)
	if err != nil {
		cancel()
		return nil, err
	}
	w := &sourceWriter{s: s, header: http.Header{}, ready: make(chan struct{})}
	served := make(chan struct{})
	go func() {
		defer close(served)
		p.ServeHTTP(w, req)
		w.answer(http.StatusBadGateway) // when nothing was written
		s.mu.Lock()
		if s.err == nil {
			if int64(len(s.data)) == s.size {
				s.err = io.EOF
			} else if why := p.Failure(videoID); why != "" {
				s.err = errors.New(why)
			} else {
				s.err = errLoad
			}
		}
		s.cond.Broadcast()
		s.mu.Unlock()
	}()
	<-w.ready
	if w.status >= 400 {
		// The proxy says why once it returned.
		<-served
		s.Close()
		if why := p.Failure(videoID); why != "" {
			return nil, errors.New(why)
		}
		return nil, errLoad
	}
	return s, nil
}

// Read reads the audio, waiting for bytes that haven't come yet.
func (s *Source) Read(b []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err == errClosed {
		return 0, errClosed
	}
	for s.pos >= int64(len(s.data)) && s.err == nil {
		if s.interrupted != nil && s.interrupted() {
			return 0, ErrInterrupted
		}
		s.cond.Wait()
	}
	if s.pos < int64(len(s.data)) {
		n := copy(b, s.data[s.pos:])
		s.pos += int64(n)
		return n, nil
	}
	return 0, s.err
}

// Seek moves where Read reads; beyond what came, Read waits for it.
func (s *Source) Seek(offset int64, whence int) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch whence {
	case io.SeekStart:
	case io.SeekCurrent:
		offset += s.pos
	case io.SeekEnd:
		if s.size < 0 {
			return 0, errors.New("stream: the size is unknown")
		}
		offset += s.size
	default:
		return 0, errors.New("stream: invalid whence")
	}
	if offset < 0 {
		return 0, errors.New("stream: negative position")
	}
	s.pos = offset
	return offset, nil
}

// Wake makes a Read that waits check its interrupted function again.
func (s *Source) Wake() {
	s.mu.Lock()
	s.cond.Broadcast()
	s.mu.Unlock()
}

// Close stops the download.
func (s *Source) Close() error {
	s.cancel()
	s.mu.Lock()
	if s.err == nil {
		s.err = errClosed
	}
	s.cond.Broadcast()
	s.mu.Unlock()
	return nil
}

// sourceWriter is the response the proxy writes a Source's audio to.
type sourceWriter struct {
	s      *Source
	header http.Header
	status int
	once   sync.Once
	ready  chan struct{}
}

func (w *sourceWriter) Header() http.Header { return w.header }

func (w *sourceWriter) WriteHeader(status int) { w.answer(status) }

// answer takes the proxy's status, once.
func (w *sourceWriter) answer(status int) {
	w.once.Do(func() {
		w.status = status
		if n, err := strconv.ParseInt(w.header.Get("Content-Length"), 10, 64); err == nil && status < 300 {
			w.s.mu.Lock()
			w.s.size = n
			w.s.mu.Unlock()
		}
		close(w.ready)
	})
}

func (w *sourceWriter) Write(b []byte) (int, error) {
	w.answer(http.StatusOK)
	s := w.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return 0, s.err // closed: the proxy stops
	}
	s.data = append(s.data, b...)
	s.cond.Broadcast()
	return len(b), nil
}

func (w *sourceWriter) Flush() {}
