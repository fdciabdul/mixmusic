// Command registry builds community/registry.json, the index of the
// community's themes and plugins that MixMusic's marketplace reads, and
// checks every add-on on the way.
//
//	go run ./tools/registry          # write community/registry.json
//	go run ./tools/registry -check   # fail when it is out of date or an add-on is invalid
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"

	"github.com/fzn0x/mixmusic/internal/addons"
)

// baseURL is where the app downloads the add-ons listed.
const baseURL = "https://raw.githubusercontent.com/fzn0x/mixmusic/main/community/"

// maxAddonSize bounds the files of one add-on, in bytes.
const maxAddonSize = 4 << 20

func main() {
	check := flag.Bool("check", false, "check that community/registry.json is up to date instead of writing it")
	root := flag.String("root", ".", "the repository's root")
	flag.Parse()

	community := filepath.Join(*root, "community")
	builtin, err := builtinIDs(filepath.Join(*root, "builtin"))
	if err != nil {
		log.Fatal(err)
	}
	reg := addons.Registry{Version: 1, BaseURL: baseURL, Themes: []addons.Entry{}, Plugins: []addons.Entry{}}
	var errs []error
	for _, kind := range []addons.Kind{addons.KindTheme, addons.KindPlugin} {
		entries, err := collect(community, kind, builtin)
		errs = append(errs, err)
		if kind == addons.KindTheme {
			reg.Themes = entries
		} else {
			reg.Plugins = entries
		}
	}
	errs = append(errs, reg.Validate())
	if err := errors.Join(errs...); err != nil {
		log.Fatalf("invalid add-ons:\n%v", err)
	}
	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		log.Fatal(err)
	}
	data = append(data, '\n')
	out := filepath.Join(community, "registry.json")
	if *check {
		current, _ := os.ReadFile(out)
		if !bytes.Equal(bytes.ReplaceAll(current, []byte("\r\n"), []byte("\n")), data) {
			log.Fatal("community/registry.json is out of date: run go run ./tools/registry")
		}
		fmt.Printf("ok: %d themes, %d plugins\n", len(reg.Themes), len(reg.Plugins))
		return
	}
	if err := os.WriteFile(out, data, 0o644); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("wrote %s: %d themes, %d plugins\n", out, len(reg.Themes), len(reg.Plugins))
}

// builtinIDs returns the IDs of the themes MixMusic ships with, which
// community themes may not take.
func builtinIDs(dir string) (map[string]bool, error) {
	ids := map[string]bool{}
	entries, err := os.ReadDir(filepath.Join(dir, "themes"))
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() {
			ids[e.Name()] = true
		}
	}
	return ids, nil
}

// collect reads and checks the add-ons of a kind.
func collect(community string, kind addons.Kind, builtin map[string]bool) ([]addons.Entry, error) {
	folder := string(kind) + "s"
	dirs, err := os.ReadDir(filepath.Join(community, folder))
	if errors.Is(err, fs.ErrNotExist) {
		return []addons.Entry{}, nil
	}
	if err != nil {
		return nil, err
	}
	entries := []addons.Entry{}
	var errs []error
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		dir := filepath.Join(community, folder, d.Name())
		e, err := entry(dir, kind, d.Name())
		if err == nil && kind == addons.KindTheme && builtin[e.ID] {
			err = errors.New("a theme MixMusic ships with has this id")
		}
		if err != nil {
			errs = append(errs, fmt.Errorf("%s/%s: %w", folder, d.Name(), err))
			continue
		}
		entries = append(entries, e)
	}
	slices.SortFunc(entries, func(a, b addons.Entry) int { return strings.Compare(a.ID, b.ID) })
	return entries, errors.Join(errs...)
}

// entry reads an add-on's manifest and checks its files.
func entry(dir string, kind addons.Kind, name string) (addons.Entry, error) {
	data, err := os.ReadFile(filepath.Join(dir, string(kind)+".json"))
	if err != nil {
		return addons.Entry{}, err
	}
	var e addons.Entry
	var files []string
	switch kind {
	case addons.KindTheme:
		t, err := addons.ParseTheme(data)
		if err != nil {
			return e, err
		}
		e = addons.Entry{ID: t.ID, Name: t.Name, Version: t.Version, Author: t.Author, Description: t.Description, Preview: t.Preview, Colors: t.Colors}
		files = t.Files
	default:
		p, err := addons.ParsePlugin(data)
		if err != nil {
			return e, err
		}
		e = addons.Entry{ID: p.ID, Name: p.Name, Version: p.Version, Author: p.Author, Description: p.Description, Permissions: p.Permissions}
		files = p.Files
	}
	if e.ID != name {
		return e, fmt.Errorf("the folder must be named after the id, %s", e.ID)
	}
	if strings.TrimSpace(e.Description) == "" {
		return e, errors.New("a description is required")
	}
	if len(files) == 0 {
		return e, errors.New(`"files" must list every file of the add-on`)
	}
	onDisk, size, err := walk(dir)
	if err != nil {
		return e, err
	}
	if size > maxAddonSize {
		return e, fmt.Errorf("the add-on weighs %d KB; keep it under %d KB", size>>10, maxAddonSize>>10)
	}
	listed := slices.Sorted(slices.Values(files))
	if !slices.Equal(listed, onDisk) {
		return e, fmt.Errorf(`"files" lists %v, but the folder holds %v`, listed, onDisk)
	}
	e.Path = string(kind) + "s/" + e.ID
	e.Files = listed
	return e, nil
}

// walk lists the files of a folder, as slash paths, and their total size.
func walk(dir string) ([]string, int64, error) {
	var files []string
	var size int64
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, err := filepath.Rel(dir, p)
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		size += info.Size()
		files = append(files, path.Clean(filepath.ToSlash(rel)))
		return nil
	})
	slices.Sort(files)
	return files, size, err
}
