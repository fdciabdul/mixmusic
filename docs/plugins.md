# Plugins

A plugin adds to MixMusic: a page, a command, an item in the menu of every
track, a widget on the now playing page, a style. It is a folder holding a
manifest and an ES module:

```
my-plugin/
├── plugin.json
├── index.js
└── style.css   optional
```

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What it does, in one sentence.",
  "main": "index.js",
  "styles": "style.css",
  "permissions": ["playback"],
  "files": ["plugin.json", "index.js", "style.css"]
}
```

`permissions` tell users what the plugin does that they should know of
before they enable it: `playback` (controls the player), `network` (talks to
the internet), `notifications` (shows desktop notifications), `storage`
(keeps values). They are shown, not enforced: a plugin runs inside MixMusic
with everything MixMusic can do, which is why MixMusic asks the user to
trust a plugin before enabling it.

## The module

The module's default export is called with the API when the user enables
the plugin, and may return a function MixMusic calls when it stops it:

```js
/** @param {import("../../sdk").MixMusicAPI} api */
export default function activate(api) {
  api.commands.register({
    id: "shout",
    title: "Shout what plays",
    shortcut: "Mod+Shift+S",
    run: () => {
      const track = api.player.state().track;
      api.ui.toast(track ? `Now: ${track.title}` : "Nothing plays");
    },
  });

  const off = api.player.on("trackchange", () => {
    const track = api.player.state().track;
    if (track) console.log("playing", track.title, "from", track.source);
  });
  return off;
}
```

Everything a plugin adds through the API (pages, sidebar items, commands,
track actions, widgets, styles and listeners) is removed for it when it
stops: return a function only for what you started yourself, such as a
timer.

## The API

[sdk/index.d.ts](../sdk/index.d.ts) types the whole API; point your editor at
it with a JSDoc `@param` as above, or copy it next to your plugin.

| | |
|---|---|
| `api.player` | the state of the player (`state()`), the transport, the queue (`playTracks`, `playNext`, `enqueue`), events (`on("trackchange" \| "statechange" \| "progress" \| "queuechange")`) and the Web Audio `analyser()` of MixMusic's own player (with MixMusic's own audio engine, an object with the analyser's reading methods and properties, and no Web Audio connections) |
| `api.catalog` | search both services, and read albums, artists, playlists, radios and lyrics |
| `api.library` | liked songs and the user's mixes |
| `api.ui` | `toast`, `navigate`, `addSidebarItem`, `addPage`, `addTrackAction`, `addWidget`, `addStyle` |
| `api.commands` | `register` a command of the command palette, with an optional shortcut |
| `api.settings` | the user's settings, read only |
| `api.storage` | strings, or JSON, the plugin keeps between runs, up to 1 MB |
| `api.notify`, `api.openExternal` | a desktop notification; a web page in the browser |

### Pages

```js
api.ui.addSidebarItem({ id: "home", label: "my plugin", page: "home", icon: svgString });
api.ui.addPage({
  name: "home",
  title: "my plugin",
  render(el) {
    el.innerHTML = `<button class="mm-button mm-button-primary">play something</button>`;
    el.querySelector("button").onclick = () => api.ui.navigate("/search?q=lofi");
    return () => {}; // runs when the page closes
  },
});
```

The page lives at `/plugin/<plugin id>/<name>` and gets MixMusic's giant
title. Use the interface's own classes (see [themes.md](themes.md)) so that your
page follows every theme. `icon` is an SVG string of a 24×24 icon drawn in
`currentColor`.

### Tracks

Tracks have an `id` whose prefix tells their service: `yt:` for YouTube
Music, `sp:` for Spotify. A track's `source` says the same: `youtube` or
`spotify`.

```js
api.ui.addTrackAction({
  id: "copy-title",
  label: "Copy title and artists",
  run: (track) => navigator.clipboard.writeText(`${track.title} — ${track.artists.map((a) => a.name).join(", ")}`),
});
```

## Try it

1. In Settings › Plugins, choose **open plugins folder** and put your plugin's
   folder there, named after its `id`.
2. Choose **reload**, then enable it. A plugin that fails to start says why,
   in a notice and in the list.

In development builds (`bun run dev`), right-click the window and choose
Inspect to see the plugin's logs and errors; the console also has
`mixmusic`, the API, to try calls with.

## Share it

[community/README.md](../community/README.md) tells how to add your plugin to
the community registry, from which everyone can install it.
