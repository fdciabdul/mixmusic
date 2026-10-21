package app

import (
	"net/http"
	"testing"
)

func TestServeStreamHTTP(t *testing.T) {
	base, err := serveStreamHTTP(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("audio")) }))
	if err != nil {
		t.Fatal(err)
	}
	get := func(origin string) *http.Response {
		req, _ := http.NewRequest("GET", base+"yt/dQw4w9WgXcQ", nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res
	}
	if res := get(""); res.StatusCode != 200 {
		t.Errorf("no origin: status %d", res.StatusCode)
	}
	res := get("mygo://localhost")
	if res.StatusCode != 200 || res.Header.Get("Access-Control-Allow-Origin") != "mygo://localhost" {
		t.Errorf("app origin: status %d, allow %q", res.StatusCode, res.Header.Get("Access-Control-Allow-Origin"))
	}
	if res := get("https://evil.example"); res.StatusCode != http.StatusForbidden {
		t.Errorf("website origin: status %d, want 403", res.StatusCode)
	}
}
