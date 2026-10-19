package youtube

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var session = []*http.Cookie{
	{Name: "SID", Value: "sid"},
	{Name: "SAPISID", Value: "abc/DEF123"},
	{Name: "__Secure-1PAPISID", Value: "one1P"},
	{Name: "__Secure-3PAPISID", Value: "three3P"},
}

func TestAuthorization(t *testing.T) {
	now := time.Unix(1760870400, 0)
	// The hashes are SHA-1 of "<time> <cookie> https://music.youtube.com", computed apart.
	want := "SAPISIDHASH 1760870400_9f48681a68b7d659172d754b02ebfe08a23686fc " +
		"SAPISID1PHASH 1760870400_1c00c5a46a29a00afa9c8c6c30e49d232f405fe4 " +
		"SAPISID3PHASH 1760870400_9dbf8a09063c7f7d03cbfa5790a9cae01264604e"
	if got := authorization(session, now, "https://music.youtube.com"); got != want {
		t.Errorf("authorization =\n%s\nwant\n%s", got, want)
	}
	if got := authorization(session[:1], now, "https://music.youtube.com"); got != "" {
		t.Errorf("signed without a signing cookie: %q", got)
	}
}

func TestSignedRequests(t *testing.T) {
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		http.SetCookie(w, &http.Cookie{Name: "SIDCC", Value: "fresh", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "SID", Value: "", MaxAge: -1, Path: "/"})
		w.Write([]byte(`{}`))
	}))
	defer srv.Close()
	c := New()
	c.BaseURL = srv.URL

	// Signed out: no cookies, no signature, and what is set is not kept.
	if _, err := c.call(context.Background(), "browse", nil, nil); err != nil {
		t.Fatal(err)
	}
	if got.Get("Cookie") != "" || got.Get("Authorization") != "" || c.SignedIn() || len(c.Cookies()) != 0 {
		t.Errorf("signed out, sent %q and %q, kept %v", got.Get("Cookie"), got.Get("Authorization"), c.Cookies())
	}

	var reported []*http.Cookie
	c.OnCookies = func(cs []*http.Cookie) { reported = cs }
	c.SetCookies(session)
	if !c.SignedIn() {
		t.Fatal("not signed in with the session")
	}
	if _, err := c.call(context.Background(), "browse", nil, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got.Get("Cookie"), "SAPISID=abc/DEF123") || !strings.Contains(got.Get("Cookie"), "SID=sid") {
		t.Errorf("Cookie = %q", got.Get("Cookie"))
	}
	if !strings.HasPrefix(got.Get("Authorization"), "SAPISIDHASH ") || got.Get("X-Goog-AuthUser") != "0" || got.Get("X-Origin") != defaultBaseURL {
		t.Errorf("headers = %v", got)
	}
	names := map[string]string{}
	for _, ck := range reported {
		names[ck.Name] = ck.Value
	}
	if names["SIDCC"] != "fresh" {
		t.Errorf("the new cookie was not kept: %v", names)
	}
	if _, ok := names["SID"]; ok {
		t.Errorf("an expired cookie stayed: %v", names)
	}

	c.SetCookies(nil)
	if c.SignedIn() {
		t.Error("still signed in after signing out")
	}
}
