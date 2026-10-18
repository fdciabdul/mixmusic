---
version: 1
slug: "src-main-tsx"
primary_target: "src/main.tsx"
related_targets: ["src/app"]
---

## Scope

The MixMusic app shell and its pages (home, search, album, artist, playlist, library, now playing with lyrics, settings, marketplace, stats) and the mini player window. Visitor mode: Operate.

Audience and job: power listeners on Windows and Linux who keep the player open for hours, search fast, queue tracks of Spotify and YouTube Music together, and theme and extend the player. Constraints: every surface is themeable through `--mm-*` tokens, `data-opt-*` attributes and documented `mm-*` hooks; standard controls; keyboard first.

## Direction contract

THESIS: Every place in MixMusic names itself in a giant light lowercase word that runs off the right edge of the pane, and music sits on flat colour tiles; it refuses the category's charcoal shell of rounded artwork cards under a single green accent.

OWN-WORLD: true black ground, white Selawik ink in light and semilight weights, flat tiles in cyan, magenta, lime and amber with no gradient, bevel or shadow; one accent (cyan, or the artwork's colour when dynamic) owns every live state and floods the selection; secondary buttons and inputs are 2px white outlines; square corners; dot-matrix texture only inside tiles.

STORY: The listener reads where they are from the giant word, finds Spotify and YouTube Music tracks side by side, each marked by its source, queues from both, and plays, the next track always waiting in view.

FIRST VIEWPORT: left rail of outlined icon boxes (home, search, library, marketplace, settings) with lowercase labels, the active box flooded with the accent, a library list with counts and a live now-playing tile below; main pane opens on the giant cropped page word (~9rem), pivot headers beneath peeking the next section; a row of three flat tiles (jump back in, liked songs, your mixes), then shelves of square artwork tiles; queue column on the right; player bar at the bottom with outlined round transport and a 2px accent progress line.

FORM: Metro Typographic Tiles, the user's choice over the roll (challenger, competitive), seed key 97380a47. Signature move: the giant lowercase page word cropped at the pane's edge, with pivot headers peeking the next section; live tiles flip to show what plays next. Raises kept from the round: the next track always waits in view; the playing row floods with the accent; a track's source is a mark with form, not colour alone; listening stats rank on one fixed size ramp of circles.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
