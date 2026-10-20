package stream

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestSourceReadsWhole(t *testing.T) {
	var minGen atomic.Int32
	size := chunkSize + 54321
	srv, data := upstream(t, size, &minGen)
	p := testProxy(srv, size)
	p.Cache = NewCache(t.TempDir(), 1<<30)
	s, err := p.Open(context.Background(), testID, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	got, err := io.ReadAll(s)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("%d bytes of %d, %v", len(got), size, err)
	}
	if !p.Cache.Has(testID) {
		t.Error("the track read whole is not in the cache")
	}
	// From the cache, the same.
	s2, err := p.Open(context.Background(), testID, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	if got, err := io.ReadAll(s2); err != nil || !bytes.Equal(got, data) {
		t.Errorf("from the cache: %d bytes, %v", len(got), err)
	}
}

func TestSourceSeeks(t *testing.T) {
	var minGen atomic.Int32
	size := 100000
	srv, data := upstream(t, size, &minGen)
	s, err := testProxy(srv, size).Open(context.Background(), testID, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	buf := make([]byte, 1000)
	for _, at := range []int64{90000, 10, 50000, 0, 99000} {
		if pos, err := s.Seek(at, io.SeekStart); pos != at || err != nil {
			t.Fatalf("Seek(%d) = %d, %v", at, pos, err)
		}
		if _, err := io.ReadFull(s, buf); err != nil || !bytes.Equal(buf, data[at:at+1000]) {
			t.Fatalf("at %d: %v", at, err)
		}
	}
	if pos, err := s.Seek(-500, io.SeekEnd); pos != int64(size)-500 || err != nil {
		t.Errorf("Seek from the end = %d, %v", pos, err)
	}
	if _, err := s.Seek(-1, io.SeekStart); err == nil {
		t.Error("a negative position seeked")
	}
}

func TestSourceRefused(t *testing.T) {
	var minGen atomic.Int32
	minGen.Store(1 << 30) // every URL expired
	srv, _ := upstream(t, 1000, &minGen)
	_, err := testProxy(srv, 1000).Open(context.Background(), testID, nil)
	if err == nil {
		t.Fatal("a refused stream opened")
	}
	if strings.HasPrefix(err.Error(), "stream:") || err.Error() == errLoad.Error() {
		t.Errorf("the error %q doesn't say why in plain words", err)
	}
}

// stallingUpstream serves its first chunk, then holds the next ones until
// release closes.
func stallingUpstream(t *testing.T, size int, release chan struct{}) *httptest.Server {
	t.Helper()
	data := make([]byte, size)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Range"), "bytes=0-") {
			select {
			case <-release:
			case <-r.Context().Done():
				return
			}
		}
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(data))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestSourceInterruptsAWaitingRead(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	size := chunkSize + 1000
	srv := stallingUpstream(t, size, release)
	var interrupt atomic.Bool
	s, err := testProxy(srv, size).Open(context.Background(), testID, interrupt.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.Seek(chunkSize+10, io.SeekStart); err != nil {
		t.Fatal(err)
	}
	read := make(chan error, 1)
	go func() {
		_, err := s.Read(make([]byte, 10))
		read <- err
	}()
	select {
	case err := <-read:
		t.Fatalf("the read beyond what came returned %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	interrupt.Store(true)
	s.Wake()
	select {
	case err := <-read:
		if !errors.Is(err, ErrInterrupted) {
			t.Errorf("the interrupted read returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the interrupted read still waits")
	}
}

func TestSourceCloseStopsTheDownload(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	size := chunkSize + 1000
	var canceled atomic.Bool
	inner := stallingUpstream(t, size, release)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		req, _ := http.NewRequestWithContext(r.Context(), r.Method, inner.URL+r.URL.String(), nil)
		req.Header = r.Header
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			canceled.Store(r.Context().Err() != nil)
			return
		}
		defer resp.Body.Close()
		for k, v := range resp.Header {
			w.Header()[k] = v
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}))
	defer srv.Close()
	s, err := testProxy(srv, size).Open(context.Background(), testID, nil)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond) // the second chunk waits upstream
	s.Close()
	if _, err := s.Read(make([]byte, 10)); err == nil {
		t.Error("read after Close")
	}
	deadline := time.Now().Add(5 * time.Second)
	for !canceled.Load() {
		if time.Now().After(deadline) {
			t.Fatal("the download goes on after Close")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
