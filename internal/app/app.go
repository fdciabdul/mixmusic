// Package app wires MixMusic together: the services its pages call, the
// events it sends them, and its place on the desktop: windows, the tray,
// media keys and notifications.
package app

import (
	"fmt"
	"io/fs"
	"log"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/internal/addons"
	"github.com/fzn0x/mixmusic/internal/artwork"
	"github.com/fzn0x/mixmusic/internal/library"
	"github.com/fzn0x/mixmusic/internal/lyrics"
	"github.com/fzn0x/mixmusic/internal/match"
	"github.com/fzn0x/mixmusic/internal/media"
	"github.com/fzn0x/mixmusic/internal/settings"
	"github.com/fzn0x/mixmusic/internal/spotify"
	"github.com/fzn0x/mixmusic/internal/store"
	"github.com/fzn0x/mixmusic/internal/stream"
	"github.com/fzn0x/mixmusic/internal/tools"
	"github.com/fzn0x/mixmusic/internal/youtube"
)

// Schemes the pages load from Go.
const (
	streamScheme = "stream"
	addonsScheme = addons.Scheme
)

// Options configure the app.
type Options struct {
	// DataDir keeps the user's settings, library and add-ons.
	DataDir string
	// CacheDir keeps what can be fetched again: audio, yt-dlp's cache.
	CacheDir string
	// Builtin holds the add-ons MixMusic ships with.
	Builtin fs.FS
	// TrayIcon is the PNG of the tray icon.
	TrayIcon []byte
	// Version is the app's version, for LRCLIB's user agent.
	Version string
	// LogsDir holds the log and the crash reports.
	LogsDir string
	// LastCrash is the crash report of the run before, when it crashed.
	LastCrash string
}

// App is MixMusic.
type App struct {
	opts Options
	// lastCrash is the crash report of the run before, until the user
	// answers about it.
	lastCrash string

	settings     *store.File[settings.Settings]
	library      *library.Library
	youtube      *youtube.Client
	auth         *spotify.Auth
	spotify      *spotify.Client
	tokens       tokenStore
	lastfmStore  lastfmStore
	youtubeStore youtubeStore
	tools        *tools.Manager
	resolver     *stream.Resolver
	proxy        *stream.Proxy
	cache        *stream.Cache
	matcher      *match.Matcher
	lyrics       *lyrics.Client
	addons       *addons.Manager
	storage      *addons.Storage
	lyricsMemo   *memo[lyrics.Lyrics]
	related      *memo[[]media.Shelf]
	artwork      *artwork.Client
	colors       *memo[string]

	presence presence
	// updates keeps the user's choices of updates.
	updates *store.File[updatePrefs]
	// checkUpdates has MixMusic look for a new version at once.
	checkUpdates chan struct{}
	// readingProfiles is set while the accounts' profiles are read in the
	// background.
	readingProfiles atomic.Bool
	// updating is held while an update installs.
	updating sync.Mutex

	mu         sync.Mutex
	installed  string // the version installed to run at the next start
	lastfm     *scrobbles
	youtubeMe  *youtube.Account
	spotifyMe  *spotify.Profile
	nowPlaying NowPlaying
	main, mini *mygo.Window
	tray       *mygo.Tray
	mediaKeys  bool
	// offer is the new version the main window offers, until the user
	// answers; putOff the one they put off until putOffUntil.
	offer       *Release
	putOff      string
	putOffUntil time.Time
}

// New opens what the app keeps in opts.DataDir and opts.CacheDir.
func New(opts Options) (*App, error) {
	a := &App{opts: opts, lastCrash: opts.LastCrash}
	var err error
	if a.settings, err = store.Open(filepath.Join(opts.DataDir, "settings.json"), settings.Default()); err != nil {
		return nil, fmt.Errorf("opening settings: %w", err)
	}
	if a.library, err = library.Open(filepath.Join(opts.DataDir, "library.json")); err != nil {
		return nil, fmt.Errorf("opening the library: %w", err)
	}
	if a.updates, err = store.Open(filepath.Join(opts.DataDir, "updater.json"), updatePrefs{}); err != nil {
		return nil, fmt.Errorf("opening the update preferences: %w", err)
	}
	a.checkUpdates = make(chan struct{}, 1)
	matches, err := store.Open(filepath.Join(opts.CacheDir, "matches.json"), map[string]media.Track{})
	if err != nil {
		return nil, fmt.Errorf("opening matches: %w", err)
	}
	s := a.settings.Get().Clean()

	a.youtube = youtube.New()
	a.auth = spotify.NewAuth(s.SpotifyClientID)
	a.spotify = spotify.NewClient(a.auth)
	a.tokens = tokenStore{file: filepath.Join(opts.DataDir, "spotify-token.json")}
	a.spotify.OnToken = func(t spotify.Token) {
		if err := a.tokens.Save(t); err != nil {
			log.Printf("mixmusic: keeping the Spotify token: %v", err)
		}
	}
	if t, err := a.tokens.Load(); err == nil {
		a.spotify.SetToken(t)
	}
	a.lastfmStore = lastfmStore{file: filepath.Join(opts.DataDir, "lastfm.json")}
	a.openLastfm()
	a.tools = tools.New(filepath.Join(opts.DataDir, "bin"))
	a.resolver = stream.NewResolver(a.tools, filepath.Join(opts.CacheDir, "yt-dlp"))
	a.cache = stream.NewCache(filepath.Join(opts.CacheDir, "audio"), 0)
	a.proxy = stream.NewProxy(a.resolver)
	a.youtubeStore = youtubeStore{dir: opts.DataDir}
	a.openYouTube()
	a.proxy.Cache = a.cache
	a.matcher = match.New(a.youtube, matches)
	a.lyrics = lyrics.New("MixMusic/" + opts.Version + " (https://github.com/fzn0x/mixmusic)")
	a.lyricsMemo = newMemo[lyrics.Lyrics](200)
	a.related = newMemo[[]media.Shelf](100)
	a.artwork = artwork.New()
	a.colors = newMemo[string](500)
	a.addons = addons.NewManager(filepath.Join(opts.DataDir, "addons"), opts.Builtin, schemeURL(addonsScheme))
	a.storage = addons.NewStorage(filepath.Join(opts.DataDir, "addons", ".storage"))
	a.apply(s)
	return a, nil
}

// apply makes settings take effect in the parts of the app they configure.
func (a *App) apply(s settings.Settings) {
	a.tools.Configure(s.YTDLPPath, s.JSRuntime)
	a.resolver.SetQuality(stream.Quality(s.Quality))
	a.cache.SetLimit(int64(s.CacheSizeMB) << 20)
	if a.auth.ClientID() != s.SpotifyClientID {
		a.auth.SetClientID(s.SpotifyClientID)
	}
	if mygo.App.IsReady() {
		a.applyMediaKeys(s.MediaKeys)
	}
	if !s.DiscordPresence {
		a.presence.update(false, "", NowPlaying{})
	}
	if a.youtube.SignedIn() && a.youtube.Channel() != s.YouTubeChannel {
		a.youtube.SetChannel(s.YouTubeChannel)
	}
}

// Bind registers the services pages call and the schemes they load from.
// It must run before mygo.App.Run.
func (a *App) Bind() {
	mygo.Bind(&Catalog{a})
	mygo.Bind(&Player{a})
	mygo.Bind(&Collection{a})
	mygo.Bind(&Accounts{a})
	mygo.Bind(&Preferences{a})
	mygo.Bind(&Addons{a})
	mygo.Bind(&System{a})
	if err := mygo.Protocol.Handle(streamScheme, a.proxy); err != nil {
		log.Fatal(err)
	}
	if err := mygo.Protocol.Handle(addonsScheme, a.addons); err != nil {
		log.Fatal(err)
	}
}

// schemeURL returns the base URL pages load a custom scheme from: WebView2
// serves custom schemes at http://<scheme>.localhost.
func schemeURL(scheme string) string {
	if runtime.GOOS == "windows" {
		return "http://" + scheme + ".localhost/"
	}
	return scheme + "://localhost/"
}

// memo remembers the results of lookups, up to a number of keys.
type memo[T any] struct {
	mu    sync.Mutex
	max   int
	order []string
	items map[string]T
}

func newMemo[T any](max int) *memo[T] {
	return &memo[T]{max: max, items: map[string]T{}}
}

func (m *memo[T]) get(key string) (T, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.items[key]
	return v, ok
}

func (m *memo[T]) put(key string, v T) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.items[key]; !ok {
		m.order = append(m.order, key)
		if len(m.order) > m.max {
			delete(m.items, m.order[0])
			m.order = m.order[1:]
		}
	}
	m.items[key] = v
}
