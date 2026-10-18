// Command mixmusic is a desktop music player that brings Spotify and
// YouTube Music together in one customizable interface.
package main

import (
	_ "embed"
	"log"

	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/builtin"
	"github.com/fzn0x/mixmusic/internal/app"
)

//go:embed resources/tray.png
var trayIcon []byte

// version is the version of builds made without the mygo CLI, which links
// the version of mygo.config.ts into the app.
const version = "0.1.0"

func main() {
	if !mygo.App.RequestSingleInstanceLock() {
		return // the running instance takes over
	}
	dataDir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		log.Fatal(err)
	}
	cacheDir, err := mygo.App.Path(mygo.PathCache)
	if err != nil {
		log.Fatal(err)
	}
	a, err := app.New(app.Options{
		DataDir:  dataDir,
		CacheDir: cacheDir,
		Builtin:  builtin.FS,
		TrayIcon: trayIcon,
		Version:  version,
	})
	if err != nil {
		log.Fatal(err)
	}
	a.Bind()
	mygo.App.OnSecondInstance(a.SecondInstance)
	mygo.App.OnOpenURL(a.HandleURL)
	mygo.App.WhenReady(a.Start)
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
