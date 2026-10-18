// Shelves: titled rows of albums, playlists, artists and tracks.
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { ArtTile } from "./Tile";
import { Icon } from "./Icon";
import { Catalog, type Album, type Artist, type Item, type Playlist, type Track } from "../mygo";
import { artists, artwork, errorMessage, plural } from "../lib/format";
import { href, navigate } from "../lib/router";
import { playTracks } from "../player/player";
import { openMenu, toast } from "../state/ui";
import { collectionMenu, trackMenu } from "../lib/trackMenu";
import { currentTrack } from "../player/player";

interface ShelfProps {
  title: string;
  children: ComponentChildren;
  action?: { label: string; run: () => void };
}

/** Shelf is a titled row that scrolls sideways. */
export function Shelf({ title, children, action }: ShelfProps) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section class="mm-shelf">
      <header class="mm-section-head">
        <h2 class="mm-section-title">{title.toLocaleLowerCase()}</h2>
        <div class="mm-shelf-nav">
          {action && (
            <button type="button" class="mm-text-button" onClick={action.run}>
              {action.label}
            </button>
          )}
          <button type="button" class="mm-icon-button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} back`}>
            <Icon name="back" size={18} />
          </button>
          <button type="button" class="mm-icon-button" onClick={() => scroll(1)} aria-label={`Scroll ${title} on`}>
            <Icon name="forward" size={18} />
          </button>
        </div>
      </header>
      <div class="mm-shelf-row" ref={row}>
        {children}
      </div>
    </section>
  );
}

/** play fetches what an album or playlist holds and plays it. */
async function playCollection(load: () => Promise<{ tracks: Track[] }>): Promise<void> {
  try {
    const { tracks } = await load();
    if (tracks.length === 0) return toast("Nothing to play here");
    await playTracks(tracks);
  } catch (err) {
    toast(errorMessage(err), { tone: "error" });
  }
}

export function AlbumTile({ album }: { album: Album }) {
  const subtitle = [album.kind && album.kind !== "album" ? album.kind : "", album.year, artists(album.artists)].filter(Boolean).join(" · ");
  const open = () => navigate(href.album(album.id));
  return (
    <ArtTile
      image={artwork(album.artwork, 300)}
      title={album.title}
      subtitle={subtitle}
      source={album.source}
      onOpen={open}
      onPlay={() => playCollection(() => Catalog.album(album.id))}
      onMenu={(e) => openMenu(e, [{ label: "Open", icon: "disc", run: open }, { label: "Play", icon: "play", run: () => playCollection(() => Catalog.album(album.id)) }])}
    />
  );
}

export function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const subtitle = [playlist.owner, playlist.trackCount ? plural(playlist.trackCount, "track") : ""].filter(Boolean).join(" · ");
  const open = () => navigate(href.playlist(playlist.id));
  return (
    <ArtTile
      image={artwork(playlist.artwork, 300)}
      title={playlist.title}
      subtitle={subtitle}
      source={playlist.source}
      onOpen={open}
      onPlay={() => playCollection(() => Catalog.playlist(playlist.id))}
      onMenu={(e) =>
        openMenu(e, [
          { label: "Open", icon: "library", run: open },
          { label: "Play", icon: "play", run: () => playCollection(() => Catalog.playlist(playlist.id)) },
        ])
      }
    />
  );
}

export function ArtistTile({ artist }: { artist: Artist }) {
  return (
    <ArtTile
      image={artwork(artist.artwork, 300)}
      title={artist.name}
      subtitle={artist.subtitle || "Artist"}
      source={artist.source}
      round
      onOpen={() => navigate(href.artist(artist.id))}
    />
  );
}

export function TrackTile({ track, queue }: { track: Track; queue: Track[] }) {
  const open = () => {
    if (track.album?.id) navigate(href.album(track.album.id));
    else void playTracks(queue, queue.indexOf(track));
  };
  return (
    <ArtTile
      image={artwork(track.artwork, 300)}
      title={track.title}
      subtitle={artists(track.artists)}
      source={track.source}
      active={currentTrack.value?.id === track.id}
      onOpen={open}
      onPlay={() => void playTracks(queue, queue.indexOf(track))}
      onMenu={(e) => openMenu(e, trackMenu(track))}
    />
  );
}

/** ItemTile shows any item of a shelf. tracks are the shelf's tracks, played in order. */
export function ItemTile({ item, tracks }: { item: Item; tracks: Track[] }) {
  switch (item.kind) {
    case "album":
      return item.album ? <AlbumTile album={item.album} /> : null;
    case "playlist":
      return item.playlist ? <PlaylistTile playlist={item.playlist} /> : null;
    case "artist":
      return item.artist ? <ArtistTile artist={item.artist} /> : null;
    case "track":
      return item.track ? <TrackTile track={item.track} queue={tracks} /> : null;
  }
}
