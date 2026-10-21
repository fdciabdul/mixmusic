package app

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
)

// streamBase is the loopback URL the audio of YouTube videos is served at
// where a webview cannot play audio from a custom scheme: WebKitGTK's media
// player fails them with "format not supported". It is empty elsewhere.
var streamBase string

// serveStreamHTTP serves h on a loopback port and returns its base URL.
// Pages are not served from there, so the audio element, which asks for
// CORS to route its audio through Web Audio, gets it for the app's own
// origin and for no website's.
func serveStreamHTTP(h http.Handler) (string, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	go http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" {
			if u, err := url.Parse(o); err != nil || u.Scheme == "http" || u.Scheme == "https" {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD")
			w.Header().Set("Access-Control-Allow-Headers", "Range")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	}))
	return fmt.Sprintf("http://%s/", ln.Addr()), nil
}
