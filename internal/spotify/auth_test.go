package spotify

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func tokenServer(t *testing.T, check func(form url.Values)) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		check(r.PostForm)
		if r.PostForm.Get("refresh_token") == "revoked" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "invalid_grant", "error_description": "Refresh token revoked"}`))
			return
		}
		w.Write([]byte(`{"access_token": "ACCESS", "refresh_token": "REFRESH", "expires_in": 3600, "scope": "user-library-read"}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestLoginExchangesCode(t *testing.T) {
	var verifier string
	srv := tokenServer(t, func(form url.Values) {
		if form.Get("grant_type") != "authorization_code" || form.Get("code") != "CODE" || form.Get("client_id") != "client" {
			t.Errorf("form = %v", form)
		}
		verifier = form.Get("code_verifier")
	})
	a := NewAuth("client")
	a.TokenURL = srv.URL

	var sentChallenge string
	open := func(raw string) error {
		u, err := url.Parse(raw)
		if err != nil {
			return err
		}
		q := u.Query()
		if q.Get("redirect_uri") != RedirectURI || q.Get("code_challenge_method") != "S256" {
			t.Errorf("authorize query = %v", q)
		}
		sentChallenge = q.Get("code_challenge")
		// Spotify sends the browser back to the callback.
		go http.Get(fmt.Sprintf("%s?code=CODE&state=%s", RedirectURI, url.QueryEscape(q.Get("state"))))
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tok, err := a.Login(ctx, open)
	if err != nil {
		t.Fatal(err)
	}
	if tok.AccessToken != "ACCESS" || tok.RefreshToken != "REFRESH" || !tok.Valid() {
		t.Errorf("token = %+v", tok)
	}
	if challenge(verifier) != sentChallenge {
		t.Error("the verifier does not match the challenge sent")
	}
}

func TestLoginRejectsForeignState(t *testing.T) {
	a := NewAuth("client")
	open := func(string) error {
		go http.Get(RedirectURI + "?code=CODE&state=forged")
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := a.Login(ctx, open); err == nil {
		t.Fatal("a callback with another state was accepted")
	}
}

func TestLoginNeedsClientID(t *testing.T) {
	if _, err := NewAuth(" ").Login(context.Background(), nil); !errors.Is(err, ErrNoClientID) {
		t.Errorf("err = %v", err)
	}
}

func TestRefresh(t *testing.T) {
	srv := tokenServer(t, func(url.Values) {})
	a := NewAuth("client")
	a.TokenURL = srv.URL
	tok, err := a.Refresh(context.Background(), "OLD")
	if err != nil || tok.AccessToken != "ACCESS" {
		t.Fatalf("refresh = %+v, %v", tok, err)
	}
	if _, err := a.Refresh(context.Background(), "revoked"); !errors.Is(err, ErrSignInExpired) {
		t.Errorf("revoked refresh: %v", err)
	}
}
