// Package addons manages themes and plugins: those MixMusic ships with,
// those the user installs from the community registry, and those they put
// in the add-ons folder themselves.
//
// A theme is a folder with a theme.json manifest, which sets the colors,
// fonts and shapes of the interface, and optionally a stylesheet. A plugin
// is a folder with a plugin.json manifest and an ES module whose default
// export the app calls with its plugin API.
package addons

import (
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"regexp"
	"slices"
	"strings"

	"github.com/fzn0x/mixmusic/internal/settings"
)

// Kind is a kind of add-on.
type Kind string

const (
	KindTheme  Kind = "theme"
	KindPlugin Kind = "plugin"
)

// Scheme is the scheme the app's pages load add-on files from.
const Scheme = "addons"

// ColorKeys are the colors a theme sets. Every theme sets them all, so
// that any theme works with any version of the interface.
var ColorKeys = []string{
	"bg", "surface", "surface-2", "surface-3", "border",
	"text", "text-muted", "accent", "accent-text",
	"danger", "success", "youtube", "spotify",
	"tile-1", "tile-2", "tile-3", "tile-4", "tile-text",
}

// OptionType is the kind of control a theme option shows.
type OptionType string

const (
	OptionToggle OptionType = "toggle"
	OptionSelect OptionType = "select"
	OptionColor  OptionType = "color"
	OptionRange  OptionType = "range"
)

// Choice is a value of a select option.
type Choice struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// Option is a setting a theme offers, which pages see as the attribute
// data-opt-<id> and the CSS variable --opt-<id> of the root element.
type Option struct {
	ID      string     `json:"id"`
	Label   string     `json:"label"`
	Type    OptionType `json:"type"`
	Default string     `json:"default"`
	Choices []Choice   `json:"choices,omitempty"`
	Min     float64    `json:"min,omitempty"`
	Max     float64    `json:"max,omitempty"`
	Step    float64    `json:"step,omitempty"`
	// Unit is appended to range values in the CSS variable, as "px".
	Unit string `json:"unit,omitempty"`
}

// Fonts are the font families of a theme, as CSS font-family lists.
type Fonts struct {
	Body    string `json:"body,omitempty"`
	Display string `json:"display,omitempty"`
	Mono    string `json:"mono,omitempty"`
}

// Theme is the manifest of a theme, theme.json.
type Theme struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Author      string `json:"author"`
	Description string `json:"description,omitempty"`
	// Scheme is "dark" or "light": what form controls and scrollbars
	// follow.
	Scheme string            `json:"scheme"`
	Colors map[string]string `json:"colors"`
	Fonts  Fonts             `json:"fonts"`
	// Radius is the corner radius of cards and buttons, as "12px".
	Radius string `json:"radius,omitempty"`
	// Styles is the theme's stylesheet, a file of its folder.
	Styles  string   `json:"styles,omitempty"`
	Preview string   `json:"preview,omitempty"`
	Options []Option `json:"options"`
	// Files lists the files of the theme, for the registry to install.
	Files []string `json:"files,omitempty"`

	// Set by the app, not the manifest.
	Builtin bool `json:"builtin"`
	// BaseURL is where the pages load the theme's files from.
	BaseURL string `json:"baseUrl"`
}

// Plugin is the manifest of a plugin, plugin.json.
type Plugin struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Author      string `json:"author"`
	Description string `json:"description,omitempty"`
	// Main is the plugin's ES module, a file of its folder.
	Main string `json:"main"`
	// Styles is an optional stylesheet the app loads with the plugin.
	Styles string `json:"styles,omitempty"`
	// Permissions tell users what the plugin does that they should know
	// of, such as "network" or "notifications".
	Permissions []string `json:"permissions,omitempty"`
	Files       []string `json:"files,omitempty"`

	Builtin bool   `json:"builtin"`
	BaseURL string `json:"baseUrl"`
}

var (
	versionRe = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`)
	colorRe   = regexp.MustCompile(`^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-zA-Z.,%/ +-]{1,60}\)|transparent)$`)
	lengthRe  = regexp.MustCompile(`^\d{1,3}(?:\.\d+)?(?:px|rem|em)$`)
	fontRe    = regexp.MustCompile(`^[A-Za-z0-9 ,"'_-]{1,200}$`)
	fileRe    = regexp.MustCompile(`^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$`)
)

// permissions are the permissions plugins may declare.
var permissions = []string{"network", "notifications", "storage", "playback"}

// ValidFile reports whether name may name a file of an add-on: a relative
// path inside its folder, without dot directories.
func ValidFile(name string) bool {
	return fileRe.MatchString(name) && path.Clean(name) == name && !strings.Contains(name, "..")
}

// ParseTheme reads and checks a theme manifest.
func ParseTheme(data []byte) (Theme, error) {
	var t Theme
	if err := json.Unmarshal(data, &t); err != nil {
		return t, fmt.Errorf("theme.json: %w", err)
	}
	return t, t.Validate()
}

// Validate checks a theme manifest.
func (t Theme) Validate() error {
	var errs []error
	errs = append(errs, validateCommon(t.ID, t.Name, t.Version, t.Author))
	if t.Scheme != "dark" && t.Scheme != "light" {
		errs = append(errs, errors.New(`scheme must be "dark" or "light"`))
	}
	for _, key := range ColorKeys {
		if !colorRe.MatchString(t.Colors[key]) {
			errs = append(errs, fmt.Errorf("colors.%s must be a color", key))
		}
	}
	for key := range t.Colors {
		if !slices.Contains(ColorKeys, key) {
			errs = append(errs, fmt.Errorf("colors.%s is not a color themes set", key))
		}
	}
	for name, f := range map[string]string{"body": t.Fonts.Body, "display": t.Fonts.Display, "mono": t.Fonts.Mono} {
		if f != "" && !fontRe.MatchString(f) {
			errs = append(errs, fmt.Errorf("fonts.%s must be a font-family list", name))
		}
	}
	if t.Radius != "" && !lengthRe.MatchString(t.Radius) {
		errs = append(errs, errors.New(`radius must be a length, as "12px"`))
	}
	if t.Styles != "" && (!ValidFile(t.Styles) || !strings.HasSuffix(t.Styles, ".css")) {
		errs = append(errs, errors.New("styles must be a .css file of the theme"))
	}
	if t.Preview != "" && !ValidFile(t.Preview) {
		errs = append(errs, errors.New("preview must be a file of the theme"))
	}
	seen := map[string]bool{}
	for _, o := range t.Options {
		if err := o.validate(); err != nil {
			errs = append(errs, fmt.Errorf("option %q: %w", o.ID, err))
		}
		if seen[o.ID] {
			errs = append(errs, fmt.Errorf("option %q is defined twice", o.ID))
		}
		seen[o.ID] = true
	}
	errs = append(errs, validateFiles(t.Files, "theme.json", t.Styles, t.Preview))
	return errors.Join(errs...)
}

func (o Option) validate() error {
	if !settings.ValidID(o.ID) {
		return errors.New("id must be lowercase letters, digits and dashes")
	}
	if strings.TrimSpace(o.Label) == "" {
		return errors.New("label is required")
	}
	switch o.Type {
	case OptionToggle:
		if o.Default != "true" && o.Default != "false" {
			return errors.New(`a toggle's default is "true" or "false"`)
		}
	case OptionSelect:
		if len(o.Choices) == 0 || !slices.ContainsFunc(o.Choices, func(c Choice) bool { return c.Value == o.Default }) {
			return errors.New("a select needs choices, the default among them")
		}
		for _, c := range o.Choices {
			if !settings.ValidID(c.Value) {
				return fmt.Errorf("choice %q must be lowercase letters, digits and dashes", c.Value)
			}
		}
	case OptionColor:
		if !colorRe.MatchString(o.Default) {
			return errors.New("a color's default must be a color")
		}
	case OptionRange:
		if o.Max <= o.Min {
			return errors.New("a range needs max above min")
		}
		if o.Unit != "" && !slices.Contains([]string{"px", "rem", "em", "%", "deg", "s", "ms"}, o.Unit) {
			return fmt.Errorf("unit %q is not supported", o.Unit)
		}
	default:
		return fmt.Errorf("type %q is not toggle, select, color or range", o.Type)
	}
	return nil
}

// ParsePlugin reads and checks a plugin manifest.
func ParsePlugin(data []byte) (Plugin, error) {
	var p Plugin
	if err := json.Unmarshal(data, &p); err != nil {
		return p, fmt.Errorf("plugin.json: %w", err)
	}
	return p, p.Validate()
}

// Validate checks a plugin manifest.
func (p Plugin) Validate() error {
	var errs []error
	errs = append(errs, validateCommon(p.ID, p.Name, p.Version, p.Author))
	if !ValidFile(p.Main) || !strings.HasSuffix(p.Main, ".js") {
		errs = append(errs, errors.New("main must be a .js file of the plugin"))
	}
	if p.Styles != "" && (!ValidFile(p.Styles) || !strings.HasSuffix(p.Styles, ".css")) {
		errs = append(errs, errors.New("styles must be a .css file of the plugin"))
	}
	for _, perm := range p.Permissions {
		if !slices.Contains(permissions, perm) {
			errs = append(errs, fmt.Errorf("permission %q is unknown; known ones: %s", perm, strings.Join(permissions, ", ")))
		}
	}
	errs = append(errs, validateFiles(p.Files, "plugin.json", p.Main, p.Styles))
	return errors.Join(errs...)
}

func validateCommon(id, name, version, author string) error {
	var errs []error
	if !settings.ValidID(id) {
		errs = append(errs, errors.New("id must be lowercase letters, digits and dashes"))
	}
	if strings.TrimSpace(name) == "" || len(name) > 60 {
		errs = append(errs, errors.New("name is required, at most 60 characters"))
	}
	if !versionRe.MatchString(version) {
		errs = append(errs, errors.New(`version must be a semantic version, as "1.0.0"`))
	}
	if strings.TrimSpace(author) == "" {
		errs = append(errs, errors.New("author is required"))
	}
	return errors.Join(errs...)
}

// validateFiles checks the file list of a manifest, when it has one: valid
// names, among them the files the manifest refers to.
func validateFiles(files []string, required ...string) error {
	if len(files) == 0 {
		return nil
	}
	var errs []error
	for _, f := range files {
		if !ValidFile(f) {
			errs = append(errs, fmt.Errorf("files: %q is not a file of the add-on", f))
		}
	}
	for _, r := range required {
		if r != "" && !slices.Contains(files, r) {
			errs = append(errs, fmt.Errorf("files must list %s", r))
		}
	}
	return errors.Join(errs...)
}
