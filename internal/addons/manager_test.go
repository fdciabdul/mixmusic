package addons

import (
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func themeJSON(id string) string { return strings.Replace(validTheme, `"test-theme"`, `"`+id+`"`, 1) }

const pluginJSON = `{"id": "hello", "name": "Hello", "version": "1.0.0", "author": "A", "main": "index.js"}`

func testManager(t *testing.T) *Manager {
	t.Helper()
	builtin := fstest.MapFS{
		"themes/mix/theme.json": {Data: []byte(themeJSON("mix"))},
		"themes/mix/theme.css":  {Data: []byte(":root{}")},
	}
	dir := t.TempDir()
	write := func(name, data string) {
		p := filepath.Join(dir, filepath.FromSlash(name))
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(data), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("themes/ocean/theme.json", themeJSON("ocean"))
	write("themes/ocean/theme.css", "body{}")
	write("themes/mix/theme.json", themeJSON("mix"))             // takes a built-in id
	write("themes/misnamed/theme.json", themeJSON("other-name")) // folder and id differ
	write("themes/broken/theme.json", "{")
	write("plugins/hello/plugin.json", pluginJSON)
	write("plugins/hello/index.js", "export default () => {}")
	return NewManager(dir, builtin, "addons://localhost/")
}

func TestList(t *testing.T) {
	c := testManager(t).List()
	if len(c.Themes) != 2 || c.Themes[0].ID != "mix" || !c.Themes[0].Builtin || c.Themes[1].ID != "ocean" || c.Themes[1].Builtin {
		t.Errorf("themes = %+v", c.Themes)
	}
	if c.Themes[1].BaseURL != "addons://localhost/themes/ocean/" {
		t.Errorf("base url = %q", c.Themes[1].BaseURL)
	}
	if len(c.Plugins) != 1 || c.Plugins[0].ID != "hello" {
		t.Errorf("plugins = %+v", c.Plugins)
	}
	if len(c.Problems) != 3 {
		t.Errorf("problems = %+v", c.Problems)
	}
}

func TestServe(t *testing.T) {
	m := testManager(t)
	for path, want := range map[string]string{
		"/themes/ocean/theme.css":  "body{}",
		"/themes/mix/theme.css":    ":root{}",
		"/plugins/hello/index.js":  "export default () => {}",
		"/themes/ocean/../../x":    "",
		"/themes/Ocean/theme.css":  "",
		"/plugins/hello/":          "",
		"/other/hello/index.js":    "",
		"/themes/ocean/nothing.js": "",
	} {
		rec := httptest.NewRecorder()
		m.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if want == "" {
			if rec.Code != 404 {
				t.Errorf("%s: %d", path, rec.Code)
			}
			continue
		}
		if rec.Code != 200 || rec.Body.String() != want {
			t.Errorf("%s: %d %q", path, rec.Code, rec.Body.String())
		}
	}
	rec := httptest.NewRecorder()
	m.ServeHTTP(rec, httptest.NewRequest("GET", "/plugins/hello/index.js", nil))
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
		t.Errorf("module served as %q", ct)
	}
}

func TestUninstall(t *testing.T) {
	m := testManager(t)
	if err := m.Uninstall(KindTheme, "mix"); !errors.Is(err, ErrBuiltin) {
		t.Errorf("uninstalling a built-in theme: %v", err)
	}
	if err := m.Uninstall(KindTheme, "ocean"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(m.Dir, "themes", "ocean")); !os.IsNotExist(err) {
		t.Error("the theme is still there")
	}
	if err := m.Uninstall(KindPlugin, "../themes"); err == nil {
		t.Error("uninstalled outside the add-ons folder")
	}
}
