package lastfm

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// testServer returns a client of an API server that checks each call is a
// signed form posted with format=json, and answers it with answer.
func testServer(t *testing.T, answer func(form url.Values) (status int, body string)) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
			t.Errorf("%s with Content-Type %q", r.Method, r.Header.Get("Content-Type"))
		}
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		form := r.PostForm
		if form.Get("format") != "json" || form.Get("api_key") != "KEY" {
			t.Errorf("form = %v", form)
		}
		if got, want := form.Get("api_sig"), signature(form, "SECRET"); got != want {
			t.Errorf("api_sig = %s, want %s", got, want)
		}
		status, body := answer(form)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		io.WriteString(w, body)
	}))
	t.Cleanup(srv.Close)
	c := NewClient("KEY", "SECRET")
	c.BaseURL = srv.URL + "/2.0/"
	return c
}

func TestSignature(t *testing.T) {
	// The example of Last.fm's authentication docs, signed with the secret
	// "ilovecher": the MD5 of
	// "api_keyxxxxxxxxmethodauth.getSessiontokenyyyyyyilovecher".
	params := url.Values{"api_key": {"xxxxxxxx"}, "method": {"auth.getSession"}, "token": {"yyyyyy"}}
	if got := signature(params, "ilovecher"); got != "1333ebf6f7dec747486b6ce965cca66b" {
		t.Errorf("signature = %s", got)
	}
	// Names sort byte by byte, values are UTF-8, and format, callback and
	// api_sig are left out.
	params = url.Values{
		"method": {"track.scrobble"}, "api_key": {"KEY"}, "sk": {"SK"},
		"artist[0]": {"Ünsaid"}, "track[0]": {"Café Night"}, "timestamp[0]": {"1700000000"},
		"artist[1]": {"B"}, "track[1]": {"T"}, "timestamp[1]": {"1700000300"},
		"format": {"json"}, "callback": {"cb"}, "api_sig": {"stale"},
	}
	if got := signature(params, "SECRET"); got != "be0653ab4c57b0b5d861c3d799897585" {
		t.Errorf("signature = %s", got)
	}
}

func TestErrors(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		// code is the code of the APIError, or -1 when err is no APIError.
		code      int
		is        error
		temporary bool
	}{
		{"invalid session", http.StatusForbidden, `{"error": 9, "message": "Invalid session key - Please re-authenticate"}`, -1, ErrSessionExpired, false},
		{"service offline", http.StatusServiceUnavailable, `{"error": 11, "message": "Service Offline - This service is temporarily offline. Try again later."}`, 11, nil, true},
		{"temporary error", http.StatusOK, `{"error": 16, "message": "There was a temporary error processing your request. Please try again"}`, 16, nil, true},
		{"rate limit", http.StatusTooManyRequests, `{"error": 29, "message": "Rate Limit Exceeded - Your IP has made too many requests in a short period"}`, 29, nil, true},
		{"invalid parameters", http.StatusBadRequest, `{"error": 6, "message": "Invalid parameters - Your request is missing a required parameter"}`, 6, nil, false},
		{"bad gateway", http.StatusBadGateway, `<html><body>502 Bad Gateway</body></html>`, 0, nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := testServer(t, func(url.Values) (int, string) { return tt.status, tt.body })
			err := c.NowPlaying(context.Background(), "SK", Track{Artist: "A", Title: "T"})
			if err == nil {
				t.Fatal("no error")
			}
			var apiErr *APIError
			switch {
			case tt.is != nil && !errors.Is(err, tt.is):
				t.Errorf("err = %v, want %v", err, tt.is)
			case tt.code >= 0 && (!errors.As(err, &apiErr) || apiErr.Code != tt.code || apiErr.Status != tt.status):
				t.Errorf("err = %#v, want code %d and status %d", err, tt.code, tt.status)
			}
			if IsTemporary(err) != tt.temporary {
				t.Errorf("IsTemporary(%v) = %v", err, !tt.temporary)
			}
		})
	}
}

func TestErrorMessages(t *testing.T) {
	for err, want := range map[*APIError]string{
		{Code: 6, Message: "Invalid parameters - Your request is missing a required parameter", Status: 400}: "lastfm: Invalid parameters - Your request is missing a required parameter (error 6)",
		{Code: 29, Message: "Rate Limit Exceeded", Status: 429}:                                              "lastfm: too many requests, try again in a moment",
		{Status: 502}: "lastfm: HTTP 502",
	} {
		if err.Error() != want {
			t.Errorf("%#v: %q", err, err.Error())
		}
	}
}

func TestNetworkErrorsAreTemporary(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	c := NewClient("KEY", "SECRET")
	c.BaseURL = srv.URL
	srv.Close()
	err := c.NowPlaying(context.Background(), "SK", Track{Artist: "A", Title: "T"})
	if err == nil || !IsTemporary(err) {
		t.Errorf("err = %v, temporary %v", err, IsTemporary(err))
	}
	if IsTemporary(ErrSessionExpired) || IsTemporary(errors.New("other")) {
		t.Error("IsTemporary of a lasting error")
	}
}
