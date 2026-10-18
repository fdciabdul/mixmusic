# Architecture

MixMusic is one Go program. Its window shows a web page, the interface,
in the webview the system already has (WebView2 on Windows, WebKitGTK on
Linux), through [MyGo](https://github.com/egoist/mygo). The Go side owns the
catalogs, the accounts, the library, the audio streams and the desktop; the
page owns the interface and the player.

```
┌────────────────────────── the page (src/) ───────────────────────────┐
│ pages, shell, theme engine, plugin host, player (two audio decks)   │
└──────┬────────────────────────┬───────────────────────────┬─────────┘
       │ typed calls (mygo.ts)  │ stream://  (audio)        │ addons:// (themes, plugins)
┌──────┴────────────────────────┴───────────────────────────┴─────────┐
│ internal/app: Catalog, Player, Collection, Accounts, Preferences,   │
│ Addons, System; the tray, media keys, notifications, mini player    │
├───────────┬──────────┬──────────┬────────┬─────────┬────────┬───────┤
│ youtube   │ spotify  │ stream   │ match  │ lyrics  │library │addons │
└───────────┴──────────┴──────────┴────────┴─────────┴────────┴───────┘
```

## The Go side

- **`internal/media`** defines what every service shares: tracks, albums,
  artists, playlists, shelves. IDs carry their service: `yt:<video id>`,
  `sp:<track id>`, `mx:<mix id>`.
- **`internal/youtube`** reads YouTube Music through the API its website uses:
  search, suggestions, the home and explore pages, albums, artists,
  playlists, radios and plain lyrics. Its parsers are tested against
  recorded responses in `testdata/`, and against the live service with
  `MIXMUSIC_LIVE=1 go test ./internal/youtube -run Live`.
- **`internal/spotify`** signs in with PKCE on a loopback callback, refreshes
  tokens, reads the Web API (search, albums, artists, playlists, the
  library) and controls Spotify Connect devices.
- **`internal/stream`** finds the audio of a YouTube video with yt-dlp, keeps
  it until its URL expires, and serves it at `stream://localhost/yt/<id>`:
  range requests, chunked fetches from YouTube, a new URL when YouTube
  refuses the old one, and an on-disk cache of tracks played to their end.
- **`internal/tools`** finds yt-dlp and a JavaScript runtime, and installs
  yt-dlp from its releases, checked against their published checksums.
- **`internal/match`** finds a Spotify track's recording on YouTube Music, by
  title, artists and duration, for playback without Spotify Connect.
- **`internal/lyrics`** finds synced lyrics on LRCLIB and reads LRC.
- **`internal/library`** keeps liked songs, mixes, the history and stats in
  `library.json`.
- **`internal/addons`** validates theme and plugin manifests, lists the
  built-in and installed add-ons, serves their files at `addons://`, and
  installs add-ons from the community registry.
- **`internal/store`** writes JSON files atomically; **`internal/settings`**
  defines the settings and keeps them in range.
- **`internal/app`** binds the services the page calls, emits events to the
  page (`nowPlaying`, `playerCommand`, `settingsChanged`, `addonsChanged`,
  `accountsChanged`, `navigate`), and puts MixMusic on the desktop.

`mygo generate` writes `src/mygo.ts`, the typed client of the services,
from the Go code; `bun run dev` and `bun run build` keep it current.

## The page

- **`src/player`** plays the queue. Tracks of YouTube Music, and Spotify tracks
  matched to their recording, play in `AudioEngine`: two `<audio>` elements
  routed through Web Audio (preamp, ten bands, an optional compressor that
  levels loudness, an analyser), the idle one preloading the next track and
  fading it in for crossfades. Spotify tracks play on Spotify Connect through
  `ConnectEngine`, which polls the device. The player reports what plays to
  the Go side, which feeds the tray, notifications and the mini player.
- **`src/theme`** applies the theme's manifest as `--mm-*` variables, its options
  as `data-opt-*` attributes, its stylesheet, and the accent of the artwork.
- **`src/plugins`** starts the plugins the user enabled, with the API of
  `api.ts`, typed for authors in `sdk/index.d.ts`.
- **`src/app`**, **`src/pages`** and **`src/components`** are the interface:
  Preact with signals, and plain CSS in `src/styles`.

## Data

Everything lives in the user's data folder (`%AppData%\MixMusic` on
Windows, `~/.config/MixMusic` on Linux): `settings.json`, `library.json`,
`addons/`, `bin/` (yt-dlp). The cache folder holds audio, matches and
yt-dlp's cache. `MIXMUSIC_DATA_DIR` moves both into one folder, for a portable
copy or a test run.

## Capture mode

`MIXMUSIC_CAPTURE=<dir>` screenshots routes of the main window, then quits:

```sh
MIXMUSIC_CAPTURE=shots MIXMUSIC_CAPTURE_ROUTES="/|/search?q=jazz|/settings" MIXMUSIC_CAPTURE_SIZE=1440x900 ./MixMusic
```

A route starting with `js:` runs a script in the page instead, as clicking
a button; `MIXMUSIC_CAPTURE_WAIT` sets how long each step gets (`5s`).
