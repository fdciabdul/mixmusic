package addons

import (
	"errors"
	"strings"
	"testing"
)

func TestStorage(t *testing.T) {
	dir := t.TempDir()
	s := NewStorage(dir)
	if err := s.Set("sleep-timer", "minutes", "30"); err != nil {
		t.Fatal(err)
	}
	again := NewStorage(dir)
	values, err := again.All("sleep-timer")
	if err != nil || values["minutes"] != "30" {
		t.Fatalf("values = %v, %v", values, err)
	}
	if err := again.Delete("sleep-timer", "minutes"); err != nil {
		t.Fatal(err)
	}
	if values, _ := again.All("sleep-timer"); len(values) != 0 {
		t.Errorf("after delete: %v", values)
	}
	if err := s.Set("../escape", "k", "v"); err == nil {
		t.Error("stored under a bad plugin id")
	}
	if err := s.Set("big", "k", strings.Repeat("x", maxStorage+1)); !errors.Is(err, ErrStorageFull) {
		t.Errorf("oversized value: %v", err)
	}
}
