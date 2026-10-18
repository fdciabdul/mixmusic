package youtube

import (
	"encoding/json"
	"testing"
)

func parse(t *testing.T, s string) node {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		t.Fatal(err)
	}
	return node{v}
}

func TestNodeGet(t *testing.T) {
	n := parse(t, `{"a": [{"b": "x"}, {"b": "y"}], "n": 42}`)
	if got := n.get("a", 1, "b").str(); got != "y" {
		t.Errorf("a[1].b = %q", got)
	}
	if got := n.get("a", -1, "b").str(); got != "y" {
		t.Errorf("a[-1].b = %q", got)
	}
	if n.get("a", 5, "b").exists() || n.get("missing", "deep").exists() {
		t.Error("missing paths should not exist")
	}
	if got := n.get("n").str(); got != "42" {
		t.Errorf("n = %q", got)
	}
}

func TestNodeText(t *testing.T) {
	n := parse(t, `{"runs": [{"text": "Daft"}, {"text": " Punk"}]}`)
	if got := n.text(); got != "Daft Punk" {
		t.Errorf("text = %q", got)
	}
	if got := parse(t, `{"simpleText": "Hi"}`).text(); got != "Hi" {
		t.Errorf("simpleText = %q", got)
	}
}

func TestNodeRenderer(t *testing.T) {
	name, r := parse(t, `{"musicShelfRenderer": {"title": "x"}}`).renderer()
	if name != "musicShelfRenderer" || r.get("title").str() != "x" {
		t.Errorf("renderer = %q, %v", name, r.v)
	}
}
