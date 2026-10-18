# Themes

A theme sets the colors, the typefaces and the corners of MixMusic, and may
add a stylesheet and options the user tunes in Settings › Appearance. A theme
is a folder:

```
my-theme/
├── theme.json   the manifest: colors, fonts, radius, options
├── theme.css    optional: the theme's own styles
└── preview.png  optional: an image for the marketplace
```

## Make one

1. In Settings › Appearance, choose **open themes folder**.
2. Copy a theme there, for example
   [community/themes/neon-nights](../community/themes/neon-nights), into a folder
   named after its new `id`.
3. Change `id`, `name` and `author`, then the colors.
4. Run **Reload add-ons** from the command palette (<kbd>Ctrl</kbd> <kbd>K</kbd>)
   and pick the theme in Settings › Appearance. Themes that fail to load are
   listed there, with the reason.

Every change to `theme.css` shows after a reload. Development builds
(`bun run dev`) have the web inspector: right-click the window and choose
Inspect to try styles live.

## theme.json

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What it looks like, in one sentence.",
  "scheme": "dark",
  "colors": {
    "bg": "#000000",
    "surface": "#0b0b0b",
    "surface-2": "#181818",
    "surface-3": "#272727",
    "border": "rgba(255, 255, 255, 0.16)",
    "text": "#ffffff",
    "text-muted": "#a3a3a3",
    "accent": "#00bde3",
    "accent-text": "#000000",
    "danger": "#ff5a4f",
    "success": "#a4e600",
    "youtube": "#ff4040",
    "spotify": "#1ed760",
    "tile-1": "#00bde3",
    "tile-2": "#e6007e",
    "tile-3": "#a4e600",
    "tile-4": "#ffb000",
    "tile-text": "#000000"
  },
  "fonts": {
    "body": "Selawik, 'Segoe UI', system-ui, sans-serif",
    "display": "Selawik, 'Segoe UI', system-ui, sans-serif",
    "mono": "'Cascadia Mono', ui-monospace, monospace"
  },
  "radius": "0px",
  "styles": "theme.css",
  "options": [],
  "files": ["theme.json", "theme.css"]
}
```

| Field | |
|---|---|
| `id` | lowercase letters, digits and dashes; the folder's name |
| `version` | a semantic version, as `1.2.0`; raise it with every change you publish |
| `scheme` | `dark` or `light`: what form controls and scrollbars follow |
| `colors` | every color below, as `#rgb`, `#rrggbb`, `rgb()`, `rgba()`, `hsl()`, `oklch()` or `transparent` |
| `fonts` | CSS font-family lists; MixMusic ships `Selawik`, the others must be on the user's system |
| `radius` | the corner radius of tiles, cards and buttons, as `12px` |
| `styles` | the theme's stylesheet, a `.css` file of its folder |
| `preview` | an image of the theme, for the marketplace |
| `options` | settings the user tunes, below |
| `files` | every file of the theme: the registry installs exactly these |

### Colors

| Color | Used for |
|---|---|
| `bg` | the window's ground |
| `surface`, `surface-2`, `surface-3` | panels, then hovered and pressed things on them |
| `border` | hairlines between rows and panels |
| `text`, `text-muted` | ink, and secondary ink; outlined controls are drawn in `text` |
| `accent`, `accent-text` | everything live: the playing row, the selection, the active page, primary buttons, and ink on them |
| `danger`, `success` | errors and confirmations |
| `youtube`, `spotify` | the marks telling where a track comes from |
| `tile-1` … `tile-4`, `tile-text` | the flat tiles of the home page and the stats, and ink on them |

Keep text readable: `text-muted` on `bg`, `accent-text` on `accent` and
`tile-text` on every tile need a contrast of at least 4.5:1. When the user
lets the accent follow the artwork, MixMusic picks the accent and its ink
itself, readable on your `bg`.

## Options

Options are settings of the theme the user tunes. Each sets an attribute,
`data-opt-<id>`, and a variable, `--opt-<id>`, on the root element, which
`theme.css` styles with:

```json
"options": [
  { "id": "glow", "label": "Glow on live items", "type": "toggle", "default": "true" },
  { "id": "density", "label": "Rows", "type": "select", "default": "airy",
    "choices": [{ "value": "airy", "label": "Airy" }, { "value": "tight", "label": "Tight" }] },
  { "id": "blur", "label": "Blur", "type": "range", "default": "12", "min": 0, "max": 40, "step": 2, "unit": "px" },
  { "id": "tint", "label": "Tint", "type": "color", "default": "#7b5cff" }
]
```

```css
:root[data-opt-glow="true"] .mm-track[data-playing] {
  box-shadow: 0 0 var(--opt-blur) var(--opt-tint);
}
```

| Type | Value |
|---|---|
| `toggle` | `"true"` or `"false"` |
| `select` | one of `choices`, whose values are lowercase letters, digits and dashes |
| `range` | a number from `min` to `max`; the variable carries `unit` |
| `color` | a color |

## What themes style

MixMusic draws everything from the `--mm-*` variables, so the colors and fonts
of the manifest already restyle the whole interface. `theme.css` goes
further, through these hooks, which stay stable from one version of MixMusic
to the next.

### Variables

The colors above as `--mm-<name>`, plus:

| Variable | |
|---|---|
| `--mm-font-body`, `--mm-font-display`, `--mm-font-mono` | the theme's fonts |
| `--mm-radius`, `--mm-radius-sm` | corner radii |
| `--mm-hover`, `--mm-press` | tints of hovered and pressed things |
| `--mm-rule` | the accent hairline under section titles |
| `--mm-outline` | the 2px outline of secondary buttons and inputs |
| `--mm-size-poster`, `--mm-size-hero`, `--mm-size-title`, `--mm-size-pivot`, `--mm-size-subtitle`, `--mm-size-body`, `--mm-size-small`, `--mm-size-caption` | the type scale |
| `--mm-row`, `--mm-sidebar-width`, `--mm-queue-width`, `--mm-player-height`, `--mm-page-gutter` | measures of the shell |
| `--mm-ease-out`, `--mm-fast`, `--mm-medium`, `--mm-slow` | motion, all 0 when the user asks for reduced motion |

### Attributes of the root element

| Attribute | |
|---|---|
| `data-theme` | the theme's `id` |
| `data-scheme` | `dark` or `light` |
| `data-density` | `comfortable` or `compact` |
| `data-sidebar` | `expanded` or `collapsed` |
| `data-platform` | `windows` or `linux` |
| `data-opt-*` | the theme's options |

### Classes

| Class | What it is |
|---|---|
| `.mm-app` | the whole window |
| `.mm-sidebar`, `.mm-brand`, `.mm-nav`, `.mm-nav-item`, `.mm-nav-box` | the sidebar and its navigation; the current item has `aria-current="page"` |
| `.mm-live` | the live tile of what plays, in the sidebar |
| `.mm-topbar`, `.mm-search` | the top bar and the search box |
| `.mm-main`, `.mm-page` | the main pane and the page in it |
| `.mm-page-header`, `.mm-page-title`, `.mm-pivots`, `.mm-pivot` | the page's giant word and its pivots; the active pivot has `aria-selected="true"` |
| `.mm-section`, `.mm-section-title`, `.mm-shelf`, `.mm-shelf-row` | sections and shelves |
| `.mm-tile` (`[data-tone="1"]` … `"4"`), `.mm-tile-title`, `.mm-tile-caption` | flat tiles |
| `.mm-art-tile`, `.mm-art-frame`, `.mm-artwork` | artwork of albums, playlists, artists and tracks |
| `.mm-collection`, `.mm-collection-art` | the head of an album, playlist or artist page |
| `.mm-tracklist`, `.mm-track` (`[data-playing]`), `.mm-track-title` | track lists, and the row of what plays |
| `.mm-source` (`[data-source="spotify"]`, `"youtube"`, `"local"`) | the mark telling where a track comes from |
| `.mm-panel`, `.mm-queue-row`, `.mm-lyrics`, `.mm-lyric` (`[data-state="now"]`, `"past"`) | the side panel, the queue and the lyrics |
| `.mm-player`, `.mm-transport`, `.mm-round`, `.mm-progress`, `.mm-volume` | the player bar |
| `.mm-now-sleeve`, `.mm-visualizer`, `.mm-widget` | the now playing page |
| `.mm-button` (`-primary`, `-outline`), `.mm-icon-button`, `.mm-chip`, `.mm-switch`, `.mm-slider`, `.mm-input`, `.mm-select` | controls |
| `.mm-menu`, `.mm-menu-item`, `.mm-dialog`, `.mm-toast`, `.mm-palette` | menus, dialogs, toasts and the command palette |
| `.mm-mini` | the mini player window |

Other classes and the page's structure may change between versions: style
what this table lists.

## Share it

Themes in [community/themes](../community/themes) can be installed by everyone
from the marketplace. [community/README.md](../community/README.md) tells how
to add yours.
