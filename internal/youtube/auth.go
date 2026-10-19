package youtube

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// authHashes are the cookies whose value signs a request, and the name of
// the hash each gives in the Authorization header, as YouTube's own website
// sends them.
var authHashes = []struct{ cookie, scheme string }{
	{"SAPISID", "SAPISIDHASH"},
	{"__Secure-1PAPISID", "SAPISID1PHASH"},
	{"__Secure-3PAPISID", "SAPISID3PHASH"},
}

// SetCookies signs the client in as the user of a browser session of
// music.youtube.com, with its cookies, or out with none.
func (c *Client) SetCookies(cookies []*http.Cookie) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cookies = nil
	for _, ck := range cookies {
		if ck != nil && ck.Name != "" {
			copy := *ck
			c.cookies = append(c.cookies, &copy)
		}
	}
}

// Cookies returns the cookies the client signs in with, those YouTube
// changed since included.
func (c *Client) Cookies() []*http.Cookie {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]*http.Cookie, len(c.cookies))
	for i, ck := range c.cookies {
		copy := *ck
		out[i] = &copy
	}
	return out
}

// SignedIn reports whether the client signs requests in: it has the cookie
// that signs them.
func (c *Client) SignedIn() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return signingCookie(c.cookies) != ""
}

// signingCookie returns the value of the cookie that signs requests.
func signingCookie(cookies []*http.Cookie) string {
	for _, h := range authHashes {
		for _, ck := range cookies {
			if ck.Name == h.cookie && ck.Value != "" {
				return ck.Value
			}
		}
	}
	return ""
}

// authorization returns the Authorization header of a request signed at
// now, from origin: a hash of the time, the cookie and the origin for each
// signing cookie there is.
func authorization(cookies []*http.Cookie, now time.Time, origin string) string {
	ts := strconv.FormatInt(now.Unix(), 10)
	var parts []string
	for _, h := range authHashes {
		for _, ck := range cookies {
			if ck.Name == h.cookie && ck.Value != "" {
				sum := sha1.Sum([]byte(ts + " " + ck.Value + " " + origin))
				parts = append(parts, h.scheme+" "+ts+"_"+hex.EncodeToString(sum[:]))
				break
			}
		}
	}
	return strings.Join(parts, " ")
}

// cookieHeader writes the Cookie header of the cookies that have not
// expired.
func cookieHeader(cookies []*http.Cookie, now time.Time) string {
	var parts []string
	for _, ck := range cookies {
		if !ck.Expires.IsZero() && ck.Expires.Before(now) {
			continue
		}
		parts = append(parts, ck.Name+"="+ck.Value)
	}
	return strings.Join(parts, "; ")
}

// signRequest adds the user's cookies and signature to a request, when the
// client is signed in.
func (c *Client) signRequest(req *http.Request, now time.Time) {
	c.mu.Lock()
	cookies := c.cookies
	c.mu.Unlock()
	if signingCookie(cookies) == "" {
		return
	}
	req.Header.Set("Cookie", cookieHeader(cookies, now))
	req.Header.Set("Authorization", authorization(cookies, now, defaultBaseURL))
	req.Header.Set("X-Goog-AuthUser", "0")
	req.Header.Set("X-Origin", defaultBaseURL)
}

// keepCookies merges the cookies a response set into the session, and
// reports the session to OnCookies when one of them changed. Cookies set
// to expire leave it.
func (c *Client) keepCookies(set []*http.Cookie, now time.Time) {
	if len(set) == 0 {
		return
	}
	c.mu.Lock()
	if signingCookie(c.cookies) == "" {
		c.mu.Unlock()
		return // signed out: what YouTube sets for visitors is not kept
	}
	changed := false
	for _, ck := range set {
		gone := ck.MaxAge < 0 || (!ck.Expires.IsZero() && ck.Expires.Before(now))
		i := -1
		for j, old := range c.cookies {
			if old.Name == ck.Name {
				i = j
				break
			}
		}
		switch {
		case gone && i >= 0:
			c.cookies = append(c.cookies[:i], c.cookies[i+1:]...)
			changed = true
		case gone:
		case i >= 0:
			if c.cookies[i].Value != ck.Value || !c.cookies[i].Expires.Equal(ck.Expires) {
				copy := *ck
				c.cookies[i] = &copy
				changed = true
			}
		default:
			copy := *ck
			c.cookies = append(c.cookies, &copy)
			changed = true
		}
	}
	fn := c.OnCookies
	c.mu.Unlock()
	if changed && fn != nil {
		fn(c.Cookies())
	}
}
