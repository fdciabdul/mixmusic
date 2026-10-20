// Command mixmusic is a desktop music player that brings Spotify and
// YouTube Music together in one customizable interface.
package main

import (
	_ "embed"
	"log"
	"os"
	"path/filepath"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/updater"

	"github.com/fzn0x/mixmusic/builtin"
	"github.com/fzn0x/mixmusic/internal/app"
	"github.com/fzn0x/mixmusic/internal/diag"
)

//go:embed resources/tray.png
var trayIcon []byte

// version is the version of builds made without the mygo CLI, which links
// the version of mygo.config.ts into the app.
const version = "0.3.2"

func main() {
	// MIXMUSIC_DATA_DIR keeps everything in one folder: a portable copy,
	// or a test run apart from the user's own data.
	if dir := os.Getenv("MIXMUSIC_DATA_DIR"); dir != "" {
		mygo.App.SetPath(mygo.PathUserData, filepath.Join(dir, "data"))
		mygo.App.SetPath(mygo.PathCache, filepath.Join(dir, "cache"))
		mygo.App.SetPath(mygo.PathLogs, filepath.Join(dir, "logs"))
	}
	if !mygo.App.RequestSingleInstanceLock() {
		return // the running instance takes over
	}
	// The log and the crash reports, once this is the instance that runs.
	logsDir, err := mygo.App.Path(mygo.PathLogs)
	if err != nil {
		log.Fatal(err)
	}
	running := mygo.App.Version()
	if running == "" {
		running = version
	}
	logs, lastCrash, err := diag.Start(logsDir, running)
	if err != nil {
		log.Printf("mixmusic: writing the log: %v", err)
		logsDir = ""
	} else {
		defer logs.Close()
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
		DataDir:   dataDir,
		CacheDir:  cacheDir,
		Builtin:   builtin.FS,
		TrayIcon:  trayIcon,
		Version:   version,
		LogsDir:   logsDir,
		LastCrash: lastCrash,
	})
	if err != nil {
		log.Fatal(err)
	}
	a.Bind()
	// Signed updates from the releases on GitHub, checked once a day.
	mygo.Use(updater.Plugin)
	mygo.App.OnSecondInstance(a.SecondInstance)
	mygo.App.OnActivate(a.Activate)
	mygo.App.OnOpenURL(a.HandleURL)
	mygo.App.WhenReady(a.Start)
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
