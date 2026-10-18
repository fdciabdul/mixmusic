package youtube

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientVersion(t *testing.T) {
	got := clientVersion(time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC))
	if got != "1.20261015.01.00" {
		t.Errorf("clientVersion = %q", got)
	}
}

func TestCallSendsContextAndKeepsVisitor(t *testing.T) {
	var visitors []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/youtubei/v1/search" {
			t.Errorf("path = %q", r.URL.Path)
		}
		visitors = append(visitors, r.Header.Get("X-Goog-Visitor-Id"))
		body, _ := io.ReadAll(r.Body)
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatal(err)
		}
		client := parseNode(payload).get("context", "client")
		if client.get("clientName").str() != clientName || client.get("hl").str() != "en" {
			t.Errorf("context = %v", client.v)
		}
		if parseNode(payload).get("query").str() != "q" {
			t.Errorf("query missing from %s", body)
		}
		w.Write([]byte(`{"responseContext": {"visitorData": "VISITOR"}, "ok": true}`))
	}))
	defer srv.Close()

	c := New()
	c.BaseURL = srv.URL
	for range 2 {
		n, err := c.call(context.Background(), "search", map[string]any{"query": "q"}, nil)
		if err != nil {
			t.Fatal(err)
		}
		if !n.get("ok").boolean() {
			t.Error("response not decoded")
		}
	}
	if visitors[0] != "" || visitors[1] != "VISITOR" {
		t.Errorf("visitor headers = %q", visitors)
	}
}

func TestCallReturnsAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": {"code": 400, "message": "Request contains an invalid argument."}}`))
	}))
	defer srv.Close()
	c := New()
	c.BaseURL = srv.URL
	_, err := c.call(context.Background(), "browse", nil, nil)
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 400 || apiErr.Message == "" {
		t.Fatalf("err = %v", err)
	}
}

func parseNode(v any) node { return node{v} }
