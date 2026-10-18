package media

import (
	"errors"
	"testing"
)

func TestIDRoundTrip(t *testing.T) {
	for _, source := range []Source{SourceYouTube, SourceSpotify, SourceLocal} {
		id := ID(source, "abc:def")
		got, native, err := ParseID(id)
		if err != nil {
			t.Fatalf("ParseID(%q): %v", id, err)
		}
		if got != source || native != "abc:def" {
			t.Errorf("ParseID(%q) = %q, %q", id, got, native)
		}
	}
}

func TestParseIDRejectsUnknown(t *testing.T) {
	for _, id := range []string{"", "yt:", "zz:abc", "abc"} {
		if _, _, err := ParseID(id); !errors.Is(err, ErrBadID) {
			t.Errorf("ParseID(%q) error = %v, want ErrBadID", id, err)
		}
	}
}

func TestArtistNames(t *testing.T) {
	tr := Track{Artists: []Ref{{Name: "A"}, {Name: "B"}}}
	if got := tr.ArtistNames(); got != "A, B" {
		t.Errorf("ArtistNames() = %q", got)
	}
}
