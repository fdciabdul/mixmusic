package youtube

import "testing"

func TestTrackCount(t *testing.T) {
	for in, want := range map[string]int{"8 songs • 20 minutes": 8, "1,234 tracks": 1234, "1 song": 1, "5.9M views": 0} {
		if got := trackCount(in); got != want {
			t.Errorf("trackCount(%q) = %d, want %d", in, got, want)
		}
	}
}
