package store

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type doc struct {
	Name  string   `json:"name"`
	Items []string `json:"items"`
}

func TestOpenMissingUsesDefault(t *testing.T) {
	f, err := Open(filepath.Join(t.TempDir(), "doc.json"), doc{Name: "default"})
	if err != nil {
		t.Fatal(err)
	}
	if got := f.Get().Name; got != "default" {
		t.Errorf("Name = %q, want default", got)
	}
}

func TestUpdatePersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "doc.json")
	f, err := Open(path, doc{})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Update(func(d *doc) error {
		d.Name = "saved"
		d.Items = append(d.Items, "a")
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	again, err := Open(path, doc{})
	if err != nil {
		t.Fatal(err)
	}
	if got := again.Get(); got.Name != "saved" || len(got.Items) != 1 {
		t.Errorf("reopened = %+v", got)
	}
}

func TestUpdateErrorKeepsValue(t *testing.T) {
	f, err := Open(filepath.Join(t.TempDir(), "doc.json"), doc{Name: "before", Items: []string{"x"}})
	if err != nil {
		t.Fatal(err)
	}
	boom := errors.New("boom")
	err = f.Update(func(d *doc) error {
		d.Name = "after"
		d.Items[0] = "changed"
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("Update error = %v, want boom", err)
	}
	if got := f.Get(); got.Name != "before" || got.Items[0] != "x" {
		t.Errorf("value changed after a failed update: %+v", got)
	}
}

func TestOpenCorruptMovesAside(t *testing.T) {
	path := filepath.Join(t.TempDir(), "doc.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	f, err := Open(path, doc{Name: "fresh"})
	if err != nil {
		t.Fatal(err)
	}
	if f.Get().Name != "fresh" {
		t.Errorf("corrupt file was not replaced by the default")
	}
	if _, err := os.Stat(path + ".broken"); err != nil {
		t.Errorf("corrupt file was not kept aside: %v", err)
	}
}
