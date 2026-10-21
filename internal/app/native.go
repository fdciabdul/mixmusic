package app

// The native engine: MixMusic's own player outside the webview, which the
// page drives through these methods of Player when the settings choose it,
// as it drives its own AudioEngine.

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"

	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/internal/audio"
	"github.com/fzn0x/mixmusic/internal/audio/output"
	"github.com/fzn0x/mixmusic/internal/settings"
	"github.com/fzn0x/mixmusic/internal/stream"
)

// NativeAudio is an event of the native engine: those of the web engine.
type NativeAudio struct {
	// Kind is "time", "ended", "error", "playing" or "buffering".
	Kind       string  `json:"kind"`
	PositionMs float64 `json:"positionMs"`
	DurationMs float64 `json:"durationMs"`
	Playing    bool    `json:"playing"`
	Buffering  bool    `json:"buffering"`
	Message    string  `json:"message"`
}

// NativeAudioChanged tells the page what the native engine does.
var NativeAudioChanged = mygo.NewEvent[NativeAudio]("nativeAudio")

// errNoNative is returned where the system has no native engine.
var errNoNative = errors.New("MixMusic's own audio engine isn't available on this system")

// nativeEvents passes the native engine's events to the page.
type nativeEvents struct{}

func (nativeEvents) Time(position, duration time.Duration) {
	NativeAudioChanged.Broadcast(NativeAudio{Kind: "time", PositionMs: ms(position), DurationMs: ms(duration)})
}

func (nativeEvents) Ended() { NativeAudioChanged.Broadcast(NativeAudio{Kind: "ended"}) }

func (nativeEvents) Error(message string) {
	NativeAudioChanged.Broadcast(NativeAudio{Kind: "error", Message: message})
}

func (nativeEvents) Playing(playing bool) {
	NativeAudioChanged.Broadcast(NativeAudio{Kind: "playing", Playing: playing})
}

func (nativeEvents) Buffering(buffering bool) {
	NativeAudioChanged.Broadcast(NativeAudio{Kind: "buffering", Buffering: buffering})
}

func ms(d time.Duration) float64 { return float64(d) / float64(time.Millisecond) }

func fromMs(v float64) time.Duration {
	if math.IsNaN(v) || v < 0 {
		return 0
	}
	return time.Duration(v * float64(time.Millisecond))
}

// nativeEngine returns the native engine, made at its first use, or nil
// where the system has none.
func (a *App) nativeEngine() *audio.Engine {
	if !settings.NativeAudio {
		return nil
	}
	a.nativeOnce.Do(func() {
		a.native = audio.NewEngine(a.openNative, startNative, nativeEvents{})
	})
	return a.native
}

// openNative opens, for the native engine, the audio at a URL PrepareStream
// gave.
func (a *App) openNative(ctx context.Context, rawURL string, interrupted func() bool) (audio.Source, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	videoID, ok := strings.CutPrefix(u.Path, "/yt/")
	if !ok || !stream.ValidVideoID(videoID) {
		return nil, fmt.Errorf("not the audio of a video: %s", rawURL)
	}
	src, err := a.proxy.Open(ctx, videoID, interrupted)
	if err != nil {
		return nil, err
	}
	return src, nil
}

// startNative starts the output of the native engine.
func startNative(render func([]float32), failed func(error)) (audio.Output, error) {
	s, err := output.Start(render, failed)
	switch {
	case errors.Is(err, output.ErrNoDevice):
		return nil, errors.New("no audio output device")
	case err != nil:
		return nil, fmt.Errorf("the audio device couldn't start (%v)", err)
	}
	return s, nil
}

// NativeLoad plays url, a stream URL PrepareStream gave, in the native
// engine from startMs, or holds it there until NativePlay when autoplay is
// false.
func (p *Player) NativeLoad(url string, startMs float64, autoplay bool) error {
	e := p.a.nativeEngine()
	if e == nil {
		return errNoNative
	}
	if err := e.Load(url, fromMs(startMs), autoplay); err != nil {
		return err
	}
	p.a.setNative(true)
	return nil
}

// NativePreload starts loading url in the native engine, for the next track.
func (p *Player) NativePreload(url string) {
	if e := p.a.nativeEngine(); e != nil {
		e.Preload(url)
	}
}

// NativeCrossfade plays url in the native engine while what plays fades
// out, over seconds.
func (p *Player) NativeCrossfade(url string, seconds float64) error {
	e := p.a.nativeEngine()
	if e == nil {
		return errNoNative
	}
	if err := e.Crossfade(url, fromMs(seconds*1000)); err != nil {
		return err
	}
	p.a.setNative(true)
	return nil
}

// NativePlay plays the native engine's track.
func (p *Player) NativePlay() error {
	e := p.a.nativeEngine()
	if e == nil {
		return errNoNative
	}
	return e.Play()
}

// NativePause pauses the native engine.
func (p *Player) NativePause() {
	if e := p.a.nativeEngine(); e != nil {
		e.Pause()
	}
}

// NativeStop stops the native engine, which releases the audio device.
func (p *Player) NativeStop() {
	if e := p.a.nativeEngine(); e != nil {
		e.Stop()
	}
	p.a.setNative(false)
}

// NativeSeek moves the native engine's track to ms.
func (p *Player) NativeSeek(ms float64) {
	if e := p.a.nativeEngine(); e != nil {
		e.Seek(fromMs(ms))
	}
}

// NativeSetVolume sets the native engine's volume, from 0 to 1.
func (p *Player) NativeSetVolume(v float64) {
	if e := p.a.nativeEngine(); e != nil {
		e.SetVolume(min(max(v, 0), 1))
	}
}

// NativeSetEqualizer sets the native engine's equalizer: the gains of the
// bands and the preamp, in dB.
func (p *Player) NativeSetEqualizer(enabled bool, gains []float64, preamp float64) {
	e := p.a.nativeEngine()
	if e == nil {
		return
	}
	var g [len(audio.Bands)]float64
	for i := range min(len(gains), len(g)) {
		g[i] = min(max(gains[i], -12), 12)
	}
	e.SetEqualizer(enabled, g, min(max(preamp, -12), 12))
}

// NativeSetNormalize turns the native engine's levelling on or off.
func (p *Player) NativeSetNormalize(on bool) {
	if e := p.a.nativeEngine(); e != nil {
		e.SetNormalize(on)
	}
}

// NativeAnalysis is what the native engine's analyser gives, as an
// AnalyserNode of fftSize 256: Bytes as getByteFrequencyData; Decibels, when
// asked, as getFloatFrequencyData, with -1000 for -Infinity; Waveform, when
// asked, as getFloatTimeDomainData.
type NativeAnalysis struct {
	Bytes    []int     `json:"bytes"`
	Decibels []float64 `json:"decibels"`
	Waveform []float64 `json:"waveform"`
}

// NativeAnalyser returns what the native engine's analyser gives now.
func (p *Player) NativeAnalyser(decibels, waveform bool) NativeAnalysis {
	e := p.a.nativeEngine()
	if e == nil {
		return NativeAnalysis{}
	}
	var a audio.Analysis
	e.Analyse(&a)
	out := NativeAnalysis{Bytes: make([]int, len(a.Bytes))}
	for i, b := range a.Bytes {
		out.Bytes[i] = int(b)
	}
	if decibels {
		out.Decibels = make([]float64, len(a.Decibels))
		for i, db := range a.Decibels {
			out.Decibels[i] = max(float64(db), -1000)
		}
	}
	if waveform {
		out.Waveform = make([]float64, len(a.Waveform))
		for i, v := range a.Waveform {
			out.Waveform[i] = float64(v)
		}
	}
	return out
}
