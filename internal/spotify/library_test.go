package spotify

import (
	"context"
	"strings"
	"testing"
)

func TestLibraryUsesURIs(t *testing.T) {
	c, api := newFake(t, map[string]string{
		"PUT /me/library":          "",
		"GET /me/library/contains": `[true, false]`,
	})
	if err := c.Save(context.Background(), URI("track", "t1")); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(api.requests[len(api.requests)-1], "uris=spotify%3Atrack%3At1") {
		t.Errorf("save request = %s", api.requests[len(api.requests)-1])
	}
	got, err := c.Contains(context.Background(), URI("track", "t1"), URI("album", "al1"))
	if err != nil || len(got) != 2 || !got[0] || got[1] {
		t.Errorf("contains = %v, %v", got, err)
	}
}
