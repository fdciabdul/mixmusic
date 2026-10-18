package app

import (
	"log"
	"net/url"
	"regexp"
	"runtime"
	"strings"

	"github.com/egoist/mygo"
)

// URLScheme is the scheme of MixMusic's deep links, such as
// mixmusic://search?q=daft+punk.
const URLScheme = "mixmusic"

// mediaKeys are the global shortcuts of the keyboard's media keys.
var mediaKeys = map[string]Command{
	"MediaPlayPause":     CommandToggle,
	"MediaNextTrack":     CommandNext,
	"MediaPreviousTrack": CommandPrevious,
	"MediaStop":          CommandPause,
}

// Start opens the main window and puts MixMusic on the desktop: the tray
// icon, the media keys, the deep links of portable copies. It runs once the
// app is ready.
func (a *App) Start() {
	if runtime.GOOS != "darwin" && !mygo.App.IsPackaged() {
		if err := mygo.App.RegisterURLScheme(URLScheme); err != nil {
			log.Printf("mixmusic: registering %s links: %v", URLScheme, err)
		}
	}
	win := a.openMain(mygo.App.WasOpenedAtLogin())
	a.captureFromEnv(win)
	a.setupTray()
	a.applyMediaKeys(a.settings.Get().MediaKeys)
}

// background returns the background color of the theme of the settings,
// which windows show until their page paints.
func (a *App) background() string {
	theme := a.settings.Get().Clean().Theme
	for _, t := range a.addons.List().Themes {
		if t.ID == theme {
			if bg := t.Colors["bg"]; strings.HasPrefix(bg, "#") {
				return bg
			}
		}
	}
	return "#0e0f13"
}

// openMain opens the main window, hidden when MixMusic starts at login.
func (a *App) openMain(hidden bool) *mygo.Window {
	win := mygo.NewWindow(mygo.WindowOptions{
		Title:           "MixMusic",
		Width:           1280,
		Height:          820,
		MinWidth:        940,
		MinHeight:       600,
		BackgroundColor: a.background(),
		StateKey:        "main",
		TitleBarStyle:   mygo.TitleBarHidden,
		TitleBarHeight:  48,
		Hidden:          hidden,
		URL:             "/",
	})
	win.OnClose(func(e *mygo.CloseEvent) {
		a.mu.Lock()
		tray := a.tray
		a.mu.Unlock()
		if tray != nil && a.settings.Get().CloseToTray {
			e.PreventDefault()
			win.Hide() // keep playing in the tray
		}
	})
	win.OnClosed(func() {
		a.mu.Lock()
		if a.main == win {
			a.main = nil
		}
		mini := a.mini
		a.mu.Unlock()
		if mini != nil {
			mini.Close()
		}
	})
	win.Page().OnWillNavigate(func(e *mygo.NavigateEvent) {
		// Links to websites open in the browser, never in the app's window.
		if u, err := url.Parse(e.URL); err == nil && (u.Scheme == "http" || u.Scheme == "https") && !isAppHost(u.Host) {
			e.PreventDefault()
			go mygo.Shell.OpenExternal(e.URL)
		}
	})
	a.mu.Lock()
	a.main = win
	a.mu.Unlock()
	return win
}

// isAppHost reports whether host serves the app's own pages: the dev
// server or a scheme WebView2 serves at <scheme>.localhost.
func isAppHost(host string) bool {
	h := strings.Split(host, ":")[0]
	return h == "localhost" || h == "127.0.0.1" || strings.HasSuffix(h, ".localhost")
}

// showMain shows the main window, opening it again if it was closed.
func (a *App) showMain() {
	a.mu.Lock()
	win := a.main
	a.mu.Unlock()
	if win == nil {
		win = a.openMain(false)
	}
	if win.IsMinimized() {
		win.Restore()
	}
	win.Show()
	win.Focus()
}

// showMini shows the mini player.
func (a *App) showMini() {
	a.mu.Lock()
	mini := a.mini
	a.mu.Unlock()
	if mini != nil {
		mini.Show()
		mini.Focus()
		return
	}
	mini = mygo.NewWindow(mygo.WindowOptions{
		Title:           "MixMusic mini player",
		Width:           420,
		Height:          132,
		MinWidth:        340,
		MinHeight:       112,
		MaxHeight:       180,
		Frameless:       true,
		AlwaysOnTop:     true,
		BackgroundColor: a.background(),
		StateKey:        "mini",
		URL:             "/mini",
	})
	mini.OnClosed(func() {
		a.mu.Lock()
		if a.mini == mini {
			a.mini = nil
		}
		a.mu.Unlock()
	})
	a.mu.Lock()
	a.mini = mini
	a.mu.Unlock()
}

// setupTray adds the tray icon, whose menu controls the player.
func (a *App) setupTray() {
	if len(a.opts.TrayIcon) == 0 {
		return
	}
	cmd := func(c Command) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) { a.command(PlayerCommand{Command: c}) }
	}
	menu := mygo.NewMenu([]*mygo.MenuItem{
		{Label: "Play / Pause", Click: cmd(CommandToggle)},
		{Label: "Next", Click: cmd(CommandNext)},
		{Label: "Previous", Click: cmd(CommandPrevious)},
		mygo.Separator(),
		{Label: "Show MixMusic", Click: func(*mygo.MenuItem, *mygo.Window) { a.showMain() }},
		{Label: "Mini player", Click: func(*mygo.MenuItem, *mygo.Window) { a.showMini() }},
		mygo.Separator(),
		{Role: mygo.RoleQuit},
	})
	opts := mygo.TrayOptions{Icon: a.opts.TrayIcon, ToolTip: "MixMusic"}
	if runtime.GOOS == "linux" {
		opts.Menu = menu // AppIndicator reports no clicks: it shows the menu
	}
	tray, err := mygo.NewTray(opts)
	if err != nil {
		log.Printf("mixmusic: tray: %v", err)
		return
	}
	if runtime.GOOS != "linux" {
		// A click shows the window; a right click, the menu.
		tray.OnClick(a.showMain)
		tray.OnRightClick(func() {
			tray.SetMenu(menu)
			tray.PopUpMenu()
			tray.SetMenu(nil)
		})
	}
	a.mu.Lock()
	a.tray = tray
	a.mu.Unlock()
}

// applyMediaKeys registers the media keys as global shortcuts, or
// unregisters them.
func (a *App) applyMediaKeys(on bool) {
	a.mu.Lock()
	changed := a.mediaKeys != on
	a.mediaKeys = on
	a.mu.Unlock()
	if !changed {
		return
	}
	for key, c := range mediaKeys {
		if !on {
			mygo.GlobalShortcut.Unregister(key)
			continue
		}
		if err := mygo.GlobalShortcut.Register(key, func() { a.command(PlayerCommand{Command: c}) }); err != nil {
			log.Printf("mixmusic: media key %s: %v", key, err)
		}
	}
}

// deepLinkPathRe matches the paths deep links may open.
var deepLinkPathRe = regexp.MustCompile(`^/(search|album|artist|playlist|library|settings|marketplace|lyrics|stats)(/[A-Za-z0-9:_-]*)?$`)

// HandleURL opens a deep link: mixmusic://search?q=…, mixmusic://album/<id>,
// mixmusic://play/<track id> and the like. Register it with
// mygo.App.OnOpenURL before the app runs.
func (a *App) HandleURL(raw string) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != URLScheme {
		return
	}
	path := "/" + u.Host + strings.TrimSuffix(u.Path, "/")
	mygo.App.WhenReady(func() {
		if id, ok := strings.CutPrefix(path, "/play/"); ok {
			a.command(PlayerCommand{Command: CommandPlayTrack, TrackID: id})
			return
		}
		if !deepLinkPathRe.MatchString(path) {
			return
		}
		a.showMain()
		a.mu.Lock()
		main := a.main
		a.mu.Unlock()
		if main != nil {
			target := path
			if q := u.Query().Encode(); q != "" {
				target += "?" + q
			}
			NavigateRequested.Emit(main, target)
		}
	})
}

// SecondInstance shows the main window when the user starts MixMusic again.
func (a *App) SecondInstance([]string, string) { a.showMain() }
