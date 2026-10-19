package lastfm

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"sync"
	"testing"
	"time"
)

// common leaves out of form the parameters every call has, and returns it.
func common(form url.Values) url.Values {
	for _, name := range []string{"method", "api_key", "api_sig", "format", "sk"} {
		form.Del(name)
	}
	return form
}

func TestNowPlaying(t *testing.T) {
	var forms []url.Values
	c := testServer(t, func(form url.Values) (int, string) {
		if form.Get("method") != "track.updateNowPlaying" || form.Get("sk") != "SK" {
			t.Errorf("form = %v", form)
		}
		forms = append(forms, common(form))
		return http.StatusOK, `{"nowplaying": {"artist": {"corrected": "0", "#text": "Ünsaid"}, "track": {"corrected": "0", "#text": "Café Night"}, "album": {"corrected": "0", "#text": "Lights"}, "albumArtist": {"corrected": "0", "#text": ""}, "ignoredMessage": {"code": "0", "#text": ""}}}`
	})
	ctx := context.Background()
	if err := c.NowPlaying(ctx, "SK", Track{Artist: "Ünsaid", Title: "Café Night", Album: "Lights", Duration: 3*time.Minute + 34600*time.Millisecond}); err != nil {
		t.Fatal(err)
	}
	if err := c.NowPlaying(ctx, "SK", Track{Artist: "B", Title: "T"}); err != nil {
		t.Fatal(err)
	}
	want := []url.Values{
		{"artist": {"Ünsaid"}, "track": {"Café Night"}, "album": {"Lights"}, "duration": {"215"}},
		{"artist": {"B"}, "track": {"T"}},
	}
	if !reflect.DeepEqual(forms, want) {
		t.Errorf("forms = %v", forms)
	}
}

func TestScrobbleSendsIndexedPlays(t *testing.T) {
	var form url.Values
	c := testServer(t, func(f url.Values) (int, string) {
		if f.Get("method") != "track.scrobble" || f.Get("sk") != "SK" {
			t.Errorf("form = %v", f)
		}
		form = common(f)
		return http.StatusOK, `{"scrobbles": {"scrobble": [` +
			`{"artist": {"corrected": "0", "#text": "Ünsaid"}, "album": {"corrected": "0", "#text": "Lights"}, "track": {"corrected": "0", "#text": "Café Night"}, "albumArtist": {"corrected": "0", "#text": ""}, "ignoredMessage": {"code": "0", "#text": ""}, "timestamp": "1700000000"},` +
			`{"artist": {"corrected": "0", "#text": "B"}, "album": {"corrected": "0"}, "track": {"corrected": "0", "#text": "T"}, "albumArtist": {"corrected": "0", "#text": ""}, "ignoredMessage": {"code": "0", "#text": ""}, "timestamp": "1700000300"}` +
			`], "@attr": {"accepted": 2, "ignored": 0}}}`
	})
	start := time.Unix(1700000000, 0)
	plays := []Play{
		{Track: Track{Artist: "Ünsaid", Title: "Café Night", Album: "Lights", Duration: 215 * time.Second}, Start: start},
		{Track: Track{Artist: "B", Title: "T"}, Start: start.Add(5 * time.Minute)},
	}
	if err := c.Scrobble(context.Background(), "SK", plays); err != nil {
		t.Fatal(err)
	}
	want := url.Values{
		"artist[0]": {"Ünsaid"}, "track[0]": {"Café Night"}, "album[0]": {"Lights"}, "duration[0]": {"215"}, "timestamp[0]": {"1700000000"},
		"artist[1]": {"B"}, "track[1]": {"T"}, "timestamp[1]": {"1700000300"},
	}
	if !reflect.DeepEqual(form, want) {
		t.Errorf("form = %v", form)
	}
}

// manyPlays returns n plays a minute apart.
func manyPlays(n int) []Play {
	plays := make([]Play, n)
	for i := range plays {
		plays[i] = Play{Track: Track{Artist: "Artist", Title: fmt.Sprint("Song ", i), Duration: 3 * time.Minute}, Start: time.Unix(1700000000+int64(i)*60, 0)}
	}
	return plays
}

func TestScrobbleSplitsBatches(t *testing.T) {
	var mu sync.Mutex
	var sizes []int
	sent := 0
	c := testServer(t, func(form url.Values) (int, string) {
		mu.Lock()
		defer mu.Unlock()
		n := 0
		for form.Has("artist[" + strconv.Itoa(n) + "]") {
			i := strconv.Itoa(n)
			if form.Get("track["+i+"]") != fmt.Sprint("Song ", sent+n) || form.Get("timestamp["+i+"]") != strconv.Itoa(1700000000+(sent+n)*60) || form.Get("duration["+i+"]") != "180" {
				t.Errorf("play %d of call %d: %s, %s", n, len(sizes), form.Get("track["+i+"]"), form.Get("timestamp["+i+"]"))
			}
			n++
		}
		sizes = append(sizes, n)
		sent += n
		return http.StatusOK, fmt.Sprintf(`{"scrobbles": {"scrobble": [], "@attr": {"accepted": %d, "ignored": 0}}}`, n)
	})
	if err := c.Scrobble(context.Background(), "SK", manyPlays(120)); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(sizes, []int{50, 50, 20}) {
		t.Errorf("calls of %v plays", sizes)
	}
}

func TestScrobbleStopsAtAFailedCall(t *testing.T) {
	calls := 0
	c := testServer(t, func(url.Values) (int, string) {
		calls++
		if calls == 2 {
			return http.StatusServiceUnavailable, `{"error": 11, "message": "Service Offline - This service is temporarily offline. Try again later."}`
		}
		return http.StatusOK, `{"scrobbles": {"scrobble": [], "@attr": {"accepted": 50, "ignored": 0}}}`
	})
	err := c.Scrobble(context.Background(), "SK", manyPlays(120))
	if !IsTemporary(err) || calls != 2 {
		t.Errorf("err = %v after %d calls", err, calls)
	}
	if err := c.Scrobble(context.Background(), "SK", nil); err != nil || calls != 2 {
		t.Errorf("no plays: err = %v, calls = %d", err, calls)
	}
}
