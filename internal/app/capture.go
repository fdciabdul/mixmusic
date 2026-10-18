package app

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

// captureFromEnv screenshots pages of the main window, then quits, when
// MIXMUSIC_CAPTURE names a directory: a tool for the screenshots of the
// documentation and for checking the interface.
//
//	MIXMUSIC_CAPTURE=shots MIXMUSIC_CAPTURE_ROUTES=/,/settings MIXMUSIC_CAPTURE_SIZE=1440x900 mixmusic
//
// MIXMUSIC_CAPTURE_WAIT is how long each page gets to load, as "5s".
func (a *App) captureFromEnv(win *mygo.Window) {
	dir := os.Getenv("MIXMUSIC_CAPTURE")
	if dir == "" {
		return
	}
	routes := []string{"/"}
	if r := os.Getenv("MIXMUSIC_CAPTURE_ROUTES"); r != "" {
		routes = strings.Split(r, ",")
	}
	wait := 5 * time.Second
	if d, err := time.ParseDuration(os.Getenv("MIXMUSIC_CAPTURE_WAIT")); err == nil {
		wait = d
	}
	if w, h, ok := strings.Cut(os.Getenv("MIXMUSIC_CAPTURE_SIZE"), "x"); ok {
		wi, _ := strconv.Atoi(w)
		hi, _ := strconv.Atoi(h)
		if wi > 0 && hi > 0 {
			win.SetSize(wi, hi)
		}
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Fatal(err)
	}
	go func() {
		time.Sleep(wait) // the first load
		for i, route := range routes {
			route = strings.TrimSpace(route)
			NavigateRequested.Emit(win, route)
			time.Sleep(wait)
			png, err := win.CapturePage()
			if err != nil {
				log.Printf("mixmusic: capturing %s: %v", route, err)
				continue
			}
			name := fmt.Sprintf("%02d%s.png", i, strings.NewReplacer("/", "-", "?", "-", "=", "-", ":", "-").Replace(route))
			if err := os.WriteFile(filepath.Join(dir, name), png, 0o644); err != nil {
				log.Printf("mixmusic: %v", err)
			}
		}
		mygo.App.Quit()
	}()
}
