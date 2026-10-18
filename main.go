// Command mixmusic is a desktop music player that brings Spotify and
// YouTube Music together in one customizable interface.
package main

import (
	"log"

	"github.com/egoist/mygo"
)

func main() {
	mygo.App.WhenReady(func() {
		mygo.NewWindow(mygo.WindowOptions{
			Title:           "MixMusic",
			Width:           1280,
			Height:          800,
			MinWidth:        960,
			MinHeight:       600,
			BackgroundColor: "#0e0f13",
			StateKey:        "main",
			URL:             "/",
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
