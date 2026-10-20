// Package wasapi plays audio on Windows through WASAPI, in shared mode:
// float32 stereo at 48 kHz, which Windows converts to the format of the
// default output device, following that device when it changes. It needs
// no cgo; on other systems, and 32-bit Windows, Start returns
// ErrUnsupported.
package wasapi

import (
	"errors"
	"time"
)

var (
	// ErrNoDevice is returned when the system has no audio output device.
	ErrNoDevice = errors.New("wasapi: no audio output device")
	// ErrUnsupported is returned by Start where WASAPI is not.
	ErrUnsupported = errors.New("wasapi: only on 64-bit Windows")
)

// Rate is the sample rate of a Stream, in Hz.
const Rate = 48000

// bufferDuration is the length of the device buffer a Stream asks for:
// what it renders ahead of the device, and so the most the audio waits
// before it plays.
const bufferDuration = 40 * time.Millisecond
