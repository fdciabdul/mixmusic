//go:build !(windows && (amd64 || arm64))

package wasapi

import "time"

// Stream plays audio; there are none on this system.
type Stream struct{}

// Start returns ErrUnsupported.
func Start(render func(out []float32), failed func(error)) (*Stream, error) {
	return nil, ErrUnsupported
}

// Stop does nothing.
func (s *Stream) Stop() {}

// Delay returns 0.
func (s *Stream) Delay() time.Duration { return 0 }
