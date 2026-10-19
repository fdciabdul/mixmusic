package lastfm

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"sync/atomic"
	"testing"
)

func TestTokenAndSession(t *testing.T) {
	const token = "cf45fe5a3e3cebe168480a086d7fe481"
	var approved atomic.Bool
	c := testServer(t, func(form url.Values) (int, string) {
		switch form.Get("method") {
		case "auth.getToken":
			return http.StatusOK, `{"token": "` + token + `"}`
		case "auth.getSession":
			if form.Get("token") != token {
				t.Errorf("token = %q", form.Get("token"))
			}
			if !approved.Load() {
				return http.StatusForbidden, `{"error": 14, "message": "Unauthorized Token - This token has not been authorized"}`
			}
			return http.StatusOK, `{"session": {"subscriber": 0, "name": "RJ", "key": "d580d57f32848f5dcf574d1ce18d78b2"}}`
		}
		t.Errorf("method = %q", form.Get("method"))
		return http.StatusBadRequest, `{"error": 3, "message": "Invalid Method - No method with that name in this package"}`
	})
	ctx := context.Background()

	got, err := c.Token(ctx)
	if err != nil || got != token {
		t.Fatalf("token = %q, %v", got, err)
	}
	if u := c.AuthURL(got); u != "https://www.last.fm/api/auth/?api_key=KEY&token="+token {
		t.Errorf("auth URL = %s", u)
	}
	if _, err := c.Session(ctx, got); !errors.Is(err, ErrNotAuthorized) {
		t.Fatalf("before approval: err = %v", err)
	}
	approved.Store(true)
	s, err := c.Session(ctx, got)
	if err != nil {
		t.Fatal(err)
	}
	if s != (Session{Name: "RJ", Key: "d580d57f32848f5dcf574d1ce18d78b2"}) {
		t.Errorf("session = %+v", s)
	}
}
