# Security

## Reporting a vulnerability

Please report security problems privately, through GitHub's
[private vulnerability reporting](https://github.com/fzn0x/mixmusic/security/advisories/new),
not in a public issue. Tell what an attacker could do, and how to reproduce
it. You will hear back within a week, and be credited in the fix unless you
prefer not to.

## What MixMusic protects

- **Your Spotify sign-in.** The token lives in the system's credential store,
  or in a file only your user can read where there is none. MixMusic never
  sees your password.
- **Its own pages.** Only MixMusic's pages may call its Go services; links to
  websites open in your browser, not in the app's window.
- **Add-ons from the registry.** They are fetched over HTTPS, checked, size
  limited, and installed into a temporary folder that replaces the installed
  version only once valid. Theme manifests cannot inject CSS through their
  colors, fonts or lengths, and add-on files stay inside their folder.
- **yt-dlp.** MixMusic downloads it from its official releases and checks it
  against the checksums the release publishes; it passes only validated
  video IDs to it.

## What it cannot protect

Plugins run inside MixMusic with everything MixMusic can do: they can call
its services, read what you play and change the interface. MixMusic tells you
so before enabling a plugin. Enable plugins from authors you trust; plugins
of the community registry are reviewed before they are listed.

Themes are CSS: a theme's stylesheet can load images and fonts from the
internet, which tells their servers when you use the theme.
