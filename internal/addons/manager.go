package addons

import (
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/fzn0x/mixmusic/internal/settings"
)

// Problem is an add-on that could not be loaded, and why.
type Problem struct {
	Kind   Kind   `json:"kind"`
	Folder string `json:"folder"`
	Error  string `json:"error"`
}

// Catalog lists the add-ons available.
type Catalog struct {
	Themes   []Theme   `json:"themes"`
	Plugins  []Plugin  `json:"plugins"`
	Problems []Problem `json:"problems"`
}

// Manager finds add-ons, serves their files and installs them.
type Manager struct {
	// Dir holds the add-ons the user installed: themes/<id> and
	// plugins/<id>.
	Dir string
	// Builtin holds the add-ons MixMusic ships with, laid out as Dir.
	Builtin fs.FS
	// BaseURL is where pages load add-on files from, as
	// "addons://localhost/".
	BaseURL string
	// HTTP fetches the community registry and the add-ons it lists.
	HTTP *http.Client
}

// NewManager returns a manager of the add-ons in dir and builtin, whose
// files pages load from baseURL.
func NewManager(dir string, builtin fs.FS, baseURL string) *Manager {
	return &Manager{Dir: dir, Builtin: builtin, BaseURL: baseURL, HTTP: &http.Client{Timeout: time.Minute}}
}

// folder returns the folder of a kind of add-on: "themes" or "plugins".
func folder(kind Kind) string { return string(kind) + "s" }

// manifestName returns the manifest file of a kind of add-on.
func manifestName(kind Kind) string { return string(kind) + ".json" }

type source struct {
	fsys    fs.FS
	builtin bool
}

// sources returns where add-ons are found, the built-in ones first.
func (m *Manager) sources() []source {
	var out []source
	if m.Builtin != nil {
		out = append(out, source{m.Builtin, true})
	}
	if m.Dir != "" {
		out = append(out, source{os.DirFS(m.Dir), false})
	}
	return out
}

// List finds every add-on. Add-ons the user installed cannot replace those
// MixMusic ships with: they are listed as problems.
func (m *Manager) List() Catalog {
	c := Catalog{Themes: []Theme{}, Plugins: []Plugin{}, Problems: []Problem{}}
	for _, kind := range []Kind{KindTheme, KindPlugin} {
		seen := map[string]bool{}
		for _, src := range m.sources() {
			entries, err := fs.ReadDir(src.fsys, folder(kind))
			if err != nil {
				continue
			}
			for _, e := range entries {
				if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
					continue
				}
				problem := func(msg string) { c.Problems = append(c.Problems, Problem{kind, e.Name(), msg}) }
				data, err := fs.ReadFile(src.fsys, path.Join(folder(kind), e.Name(), manifestName(kind)))
				if err != nil {
					problem("no " + manifestName(kind))
					continue
				}
				switch kind {
				case KindTheme:
					t, err := ParseTheme(data)
					if msg := check(err, t.ID, e.Name(), seen); msg != "" {
						problem(msg)
						continue
					}
					t.Builtin, t.BaseURL = src.builtin, m.fileURL(kind, t.ID)
					if t.Options == nil {
						t.Options = []Option{}
					}
					c.Themes = append(c.Themes, t)
				case KindPlugin:
					p, err := ParsePlugin(data)
					if msg := check(err, p.ID, e.Name(), seen); msg != "" {
						problem(msg)
						continue
					}
					p.Builtin, p.BaseURL = src.builtin, m.fileURL(kind, p.ID)
					c.Plugins = append(c.Plugins, p)
				}
			}
		}
	}
	return c
}

// check returns what keeps an add-on, whose manifest parsed with err, from
// loading, or "" when nothing does, and marks its id seen.
func check(err error, id, dir string, seen map[string]bool) string {
	switch {
	case err != nil:
		return err.Error()
	case id != dir:
		return "the folder must be named after the id, " + id
	case seen[id]:
		return "an add-on MixMusic ships with has this id"
	}
	seen[id] = true
	return ""
}

// fileURL returns the URL of an add-on's folder.
func (m *Manager) fileURL(kind Kind, id string) string {
	return m.BaseURL + folder(kind) + "/" + id + "/"
}

// ServeHTTP serves the files of add-ons, at /themes/<id>/<file> and
// /plugins/<id>/<file>.
func (m *Manager) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 3)
	if len(parts) != 3 || (parts[0] != "themes" && parts[0] != "plugins") || !settings.ValidID(parts[1]) || !ValidFile(parts[2]) {
		http.NotFound(w, r)
		return
	}
	// The built-in add-on of an id wins over the user's, as List says.
	fsys := m.Builtin
	if !m.isBuiltin(parts[0], parts[1]) {
		if m.Dir == "" {
			http.NotFound(w, r)
			return
		}
		fsys = os.DirFS(m.Dir)
	}
	name := path.Join(parts[0], parts[1], parts[2])
	f, err := fsys.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	ctype := mime.TypeByExtension(path.Ext(name))
	switch path.Ext(name) {
	case ".js", ".mjs":
		ctype = "text/javascript; charset=utf-8"
	case ".css":
		ctype = "text/css; charset=utf-8"
	case ".json":
		ctype = "application/json"
	}
	if ctype == "" {
		ctype = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if rs, ok := f.(io.ReadSeeker); ok {
		http.ServeContent(w, r, "", info.ModTime(), rs)
		return
	}
	io.Copy(w, f)
}

func (m *Manager) isBuiltin(kindFolder, id string) bool {
	if m.Builtin == nil {
		return false
	}
	_, err := fs.Stat(m.Builtin, path.Join(kindFolder, id))
	return err == nil
}

// ErrBuiltin is returned when removing an add-on MixMusic ships with.
var ErrBuiltin = errors.New("addons: add-ons MixMusic ships with cannot be removed")

// Uninstall removes an add-on the user installed.
func (m *Manager) Uninstall(kind Kind, id string) error {
	if !settings.ValidID(id) || (kind != KindTheme && kind != KindPlugin) {
		return errors.New("addons: bad add-on")
	}
	if m.isBuiltin(folder(kind), id) {
		return ErrBuiltin
	}
	return os.RemoveAll(filepath.Join(m.Dir, folder(kind), id))
}

// FolderOf returns the folder the user's add-ons of a kind are in,
// creating it.
func (m *Manager) FolderOf(kind Kind) (string, error) {
	dir := filepath.Join(m.Dir, folder(kind))
	return dir, os.MkdirAll(dir, 0o755)
}
