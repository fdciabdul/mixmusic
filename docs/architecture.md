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
  search, suggestions, the home and explore pages, charts, moods and genres,
  albums, artists, playlists, related tracks, radios and plain lyrics.
  Signed in with the cookies of the user's session, which it signs its
  requests with as the website does, it reads and changes their library:
  liked songs, playlists, albums, subscriptions, likes and saves. Its
  parsers are tested against recorded responses in `testdata/`, and against
  the live service with `MIXMUSIC_LIVE=1 go test ./internal/youtube -run
  Live` (`MIXMUSIC_YT_COOKIES` adds a signed-in account).
- **`internal/spotify`** signs in with PKCE on a loopback callback, refreshes
  tokens, reads the Web API (search, albums, artists, playlists, the
  library), controls Spotify Connect devices, and hands the page the token of
  Spotify's player.
- **`internal/stream`** finds the audio of a YouTube video with yt-dlp, keeps
  it until its URL expires, and serves it at `stream://localhost/yt/<id>`:
  range requests, chunked fetches from YouTube, a new URL when YouTube
  refuses the old one, and an on-disk cache of tracks played to their end.
  `Proxy.Open` reads the same audio for the native engine, in the background.
- **`internal/webm`** reads the audio of WebM files, as YouTube serves it:
  the packets of the first audio track with their times, and seeking by the
  Cues, reading a file played from its start straight through.
- **`internal/opus`** decodes Opus: a pure Go port of libopus 1.6.1's decoder
  (`celt`, `silk` and the range decoder `rangedec`), which decodes the test
  vectors of RFC 8251 as libopus does, bit for bit.
- **`internal/audio`** is the native engine, MixMusic's own player outside
  the webview: two decks, each a goroutine that reads a track with
  `internal/webm` and decodes it with `internal/opus` into a ring the audio
  thread plays from, and the web player's preamp, equalizer, levelling
  compressor, volume and analyser, ported from Chromium's Web Audio, which
  they match sample for sample. `internal/audio/output` plays it on the
  system's output, without cgo: through WASAPI on Windows, an Audio Queue on
  macOS, and PulseAudio, which PipeWire serves too, or ALSA on Linux.
- **`internal/nowplaying`** shows what the native engine plays in the
  system's media controls, which the webview does for what it plays, and
  passes on what they ask: Now Playing on macOS, through MediaPlayer, and an
  MPRIS player on Linux, served by GIO's GDBus, both called with purego.
- **`internal/tools`** finds yt-dlp and a JavaScript runtime, and installs
  yt-dlp from its releases, checked against their published checksums.
- **`internal/match`** finds a Spotify track's recording on YouTube Music, by
  title, artists and duration, for playback without Spotify Connect.
- **`internal/lyrics`** finds synced lyrics on LRCLIB and reads LRC.
- **`internal/library`** keeps liked songs, mixes, the history and stats in
  `library.json`.
- **`internal/lastfm`** signs in to Last.fm with the user's API account and
  scrobbles by Last.fm's rules, keeping what fails offline for later.
- **`internal/discord`** shows what plays on the user's Discord profile, over
  Discord's local pipe or socket.
- **`internal/diag`** writes the log, `mixmusic.log` in the logs folder,
  rotated at a megabyte and without the cookies, hashes and tokens a line
  may hold, and has Go write a crash to `crash.log` there, which the next
  start keeps as `crash-<time>.log` and offers to report.
- **`internal/addons`** validates theme and plugin manifests, lists the
  built-in and installed add-ons, serves their files at `addons://`, and
  installs add-ons from the community registry.
- **`internal/store`** writes JSON files atomically; **`internal/settings`**
  defines the settings and keeps them in range.
- **`internal/app`** binds the services the page calls, emits events to the
  page (`nowPlaying`, `playerCommand`, `settingsChanged`, `addonsChanged`,
  `accountsChanged`, `navigate`, `nativeAudio`), and puts MixMusic on the
  desktop.

`mygo generate` writes `src/mygo.ts`, the typed client of the services,
from the Go code; `bun run dev` and `bun run build` keep it current.

## The page

- **`src/player`** plays the queue. Tracks of YouTube Music, and Spotify
  tracks matched to their recording, play in `AudioEngine`: two `<audio>`
  elements routed through Web Audio (preamp, ten bands, an optional compressor
  that levels loudness, an analyser), the idle one preloading the next track
  and fading it in for crossfades. With MixMusic's own audio engine on, as it
  is by default on macOS and Linux, `NativeEngine` (`native.ts`) plays them
  instead, where the app can play it (`Info.nativeAudio`), through the native
  engine of the Go side, and gives, for the AnalyserNode, an object with its
  reading methods; tracks without Opus fall back to `AudioEngine`. Spotify
  tracks play on a Spotify device through `ConnectEngine`, which sends it
  commands and polls what it plays: a Spotify Connect device, through the Web
  API, or MixMusic itself, whose page Spotify's Web Playback SDK makes a
  device of its own (`spotify.ts`). The player reports what plays to the Go
  side, which feeds the tray, notifications and the mini player.
- **`src/theme`** applies the theme's manifest as `--mm-*` variables, its options
  as `data-opt-*` attributes, its stylesheet, and the accent of the artwork.
- **`src/plugins`** starts the plugins the user enabled, with the API of
  `api.ts`, typed for authors in `sdk/index.d.ts`.
- **`src/app`**, **`src/pages`** and **`src/components`** are the interface:
  Preact with signals, and plain CSS in `src/styles`.

## Data

Everything lives in the user's data folder (`%AppData%\MixMusic` on
Windows, `~/.config/MixMusic` on Linux): `settings.json`, `library.json`,
`addons/`, `bin/` (yt-dlp), the YouTube session (`youtube-session.bin`,
encrypted with a key of the system's credential store, which also keeps the
Spotify token and the Last.fm connection), the scrobbles still to send, and
`updater.json`, the update preferences. The cache folder holds audio, matches and
yt-dlp's cache, and the logs folder the log and the crash reports.
`MIXMUSIC_DATA_DIR` moves all three into one folder, for a portable copy or
a test run.

## Capture mode

`MIXMUSIC_CAPTURE=<dir>` screenshots routes of the main window, then quits:

```sh
MIXMUSIC_CAPTURE=shots MIXMUSIC_CAPTURE_ROUTES="/|/search?q=jazz|/settings" MIXMUSIC_CAPTURE_SIZE=1440x900 ./MixMusic
```

A route starting with `js:` runs a script in the page instead, as clicking
a button; `MIXMUSIC_CAPTURE_WAIT` sets how long each step gets (`5s`), and
`MIXMUSIC_CAPTURE_ZOOM` zooms the page (`1.25`) for sharper screenshots.
