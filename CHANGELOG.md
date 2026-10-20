# Changelog

All notable changes to MixMusic are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Make playlists on YouTube Music, from the library or from a track's or a
  list's menu, add tracks of either service to them, and take tracks out of
  your own playlists.
- Use YouTube Music as a brand channel of your account, with its own home
  feed, library and likes, chosen in Settings › Accounts.
- What you play joins your YouTube Music history, which its home and its
  radios are made from; a switch in Settings › Accounts turns it off.
- A log of what goes wrong, without your sign-ins, and the report of a
  crash, which the next start offers to send. Settings › About opens the
  logs folder, and reports a problem with the version and setup filled in.
- Going back or forward returns to where the page was scrolled.
- Downloads for more systems: a portable zip for Windows, an RPM package
  for Fedora and openSUSE, and an AppImage for any Linux.
- Settings › About shows the newest version. A copy that updates itself
  installs it there, with its progress, and restarts into it; the `.deb`,
  the `.rpm` and the AppImage download their own file of it.

### Changed

- The name of a page and its sections shrink to fit the window, and a long
  name, such as a search, an album or a playlist, wraps, instead of running
  off the edge: every section of Settings shows, About included. Tiles,
  empty pages and settings follow the room the side panels leave too.
- Tracks play signed out also when you signed in to YouTube Music: with your
  session, yt-dlp found fewer streams, often none it could play. No file
  keeps a copy of the session for it any more, and the audio quality of
  your account no longer applies.
- MixMusic updates the yt-dlp it installed, once a day.
- Discord's member list shows the artists you listen to, instead of
  MixMusic.
- The Debian package installs the libraries of the tray icon and of the
  keyring.

### Fixed

- Signing in to YouTube Music no longer leaves a blank window and freezes
  MixMusic, its search included, once Google sends the window back to
  YouTube Music, which it does at once when it remembers you.
- Home shows all of its shelves, not only those YouTube sends first.
- Your saved playlists, albums and artists of YouTube Music show in full,
  not only their first page.
- Opened from the Finder, the Dock or a desktop menu, MixMusic finds yt-dlp
  and Deno, Node.js or Bun installed with Homebrew, or by Deno's and Bun's
  own installers.
- When YouTube Music ends your session, MixMusic says so and asks you to
  sign in again, instead of showing an empty library.
- A track that cannot play says why in plain words, such as being not
  available in your country, instead of yt-dlp's message.
- The radio skips other uploads, and the music videos, of songs already in
  the queue.
- After three tracks in a row that cannot play, the queue stops instead of
  skipping through all of it, and a last track that cannot play still
  starts the radio.
- On macOS, a click on the Dock icon shows the window closed to the tray.
- Discord shows what plays from its Canary build, and from Vesktop,
  installed with Flatpak.

## [0.2.0] - 2026-10-19

Your own YouTube Music in MixMusic, an explore page, Last.fm and Discord, and
updates that install themselves. MixMusic 0.1.0 cannot update itself, so
install this version by hand once; the versions after it come to the app.

### Added

- Sign in to YouTube Music, in a window showing Google's own page: your home
  feed and library (liked songs, playlists, albums, artists), likes that reach
  YouTube Music, and the audio quality of your account.
- Save albums and playlists, and follow artists, on their service, YouTube
  Music or Spotify, from their pages.
- Explore: new albums and singles, trending songs, the charts, and moods and
  genres, each with its playlists.
- Related songs, playlists and artists at the foot of the now playing page.
- Scrobbling to Last.fm, with your own API account; plays sent later when
  offline, and a switch to pause it.
- What plays on your Discord profile, with the artwork and the time left.
- Updates: MixMusic checks the latest release once a day and installs it when
  you agree, or by itself if you choose.
- Change the keys of every command, plugins' too, in Settings › Shortcuts.
- Follow the computer's light or dark mode with a theme for each.
- The minutes listened day by day on the stats page, also as a table.
- Search inside a playlist, a mix or the liked songs, and sort them by title,
  artist or length.
- Show synced lyrics as plain text.

### Changed

- Home shows YouTube Music's home feed; what was its explore page moved to
  Explore.

## [0.1.0] - 2026-10-19

The first release of **MixMusic**: Spotify and YouTube Music in one desktop
player, for macOS, Windows and Linux.

### Added

- Search YouTube Music and Spotify at once, with search suggestions.
- One queue for tracks of both services: shuffle, repeat, crossfade, and a
  radio carrying on when the queue runs out.
- Spotify tracks on Spotify Connect, or from their recording on YouTube
  Music, without Premium.
- Home shelves of both services and of your own listening; album, artist and
  playlist pages.
- Liked songs and mixes holding tracks of every service; import of a
  playlist into a mix; history and listening stats.
- Synced lyrics, a visualizer, a 10-band equalizer, volume levelling and an
  offline cache of played tracks.
- The tray, media keys, notifications, a mini player, start at login and
  `mixmusic://` links.
- Six themes, theme options, an accent following the artwork, your own CSS,
  and plugins with a typed API.
- A marketplace of community themes and plugins.
- Apps for macOS 12 and later (Apple silicon and Intel), Windows 10 and 11,
  and Linux, on x64 and Arm64.

[Unreleased]: https://github.com/fzn0x/mixmusic/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fzn0x/mixmusic/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fzn0x/mixmusic/releases/tag/v0.1.0
