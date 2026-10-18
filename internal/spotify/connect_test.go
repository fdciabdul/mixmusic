package spotify

import (
	"context"
	"testing"
)

func TestPlaybackState(t *testing.T) {
	c, _ := newFake(t, map[string]string{
		"GET /me/player": `{"device": {"id": "d1", "name": "Desk", "type": "Computer", "is_active": true, "volume_percent": 70},
			"is_playing": true, "progress_ms": 1234, "item": ` + trackJSON + `}`,
		"GET /me/player/devices": `{"devices": [{"id": "d1", "name": "Desk", "type": "Computer", "is_active": true}]}`,
	})
	s, err := c.State(context.Background())
	if err != nil || s == nil {
		t.Fatalf("state = %v, %v", s, err)
	}
	if !s.Playing || s.ProgressMs != 1234 || s.Device.Name != "Desk" || s.Track == nil || s.Track.ID != "sp:t1" {
		t.Errorf("state = %+v", s)
	}
	devices, err := c.Devices(context.Background())
	if err != nil || len(devices) != 1 || !devices[0].Active {
		t.Errorf("devices = %+v, %v", devices, err)
	}
}

func TestStateWithoutActiveDevice(t *testing.T) {
	c, _ := newFake(t, map[string]string{"GET /me/player": ""})
	s, err := c.State(context.Background())
	if err != nil || s != nil {
		t.Errorf("state = %+v, %v", s, err)
	}
}
