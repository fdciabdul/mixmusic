// The library: liked songs and mixes made in MixMusic, the history, and
// the user's Spotify library.
import { useEffect, useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { TrackList } from "../components/TrackList";
import { TrackTools, useTrackView } from "../components/TrackTools";
import { AlbumTile, ArtistTile, PlaylistTile, Shelf } from "../components/Shelf";
import { Loading, Problem, Empty } from "../components/States";
import { Tile } from "../components/Tile";
import { Collection, type Track } from "../mygo";
import { useAsync } from "../lib/async";
import { navigate, href } from "../lib/router";
import { playTracks } from "../player/player";
import { createMix, likedIds, mixes } from "../state/library";
import { spotifySignedIn } from "../state/accounts";
import { prompt, toast, confirm } from "../state/ui";
import { errorMessage } from "../lib/format";

type Tab = "liked" | "mixes" | "history" | "spotify";

export function Library({ tab }: { tab?: string }) {
  const active: Tab = (["liked", "mixes", "history", "spotify"] as const).find((t) => t === tab) ?? "liked";
  return (
    <div class="mm-page">
      <PageHeader
        title="library"
        active={active}
        onPivot={(id) => navigate(`/library/${id}`, { replace: true })}
        pivots={[
          { id: "liked", label: "liked", count: likedIds.value.size },
          { id: "mixes", label: "mixes", count: mixes.value.length },
          { id: "history", label: "history" },
          ...(spotifySignedIn.value ? [{ id: "spotify", label: "spotify" }] : []),
        ]}
      />
      {active === "liked" && <Liked />}
      {active === "mixes" && <Mixes />}
      {active === "history" && <History />}
      {active === "spotify" && <SpotifyLibrary />}
    </div>
  );
}

const NONE: Track[] = [];

function Liked() {
  const res = useAsync(() => Collection.liked(), [likedIds.value.size]);
  const tools = useTrackView(res.data ?? NONE);
  if (res.error) return <Problem title="Couldn't load liked songs" message={res.error} action={{ label: "try again", run: res.reload }} />;
  if (!res.data) return <Loading />;
  if (res.data.length === 0)
    return (
      <Empty
        title="nothing liked yet"
        message="Tap the heart on any track, from Spotify or YouTube Music: they all gather here, in one list."
      />
    );
  const { view } = tools;
  return (
    <>
      {res.data.length > 1 && (
        <TrackTools
          noun="list"
          total={res.data.length}
          shown={view.tracks.length}
          sort={tools.sort}
          query={tools.query}
          onSort={tools.setSort}
          onQuery={tools.setQuery}
        />
      )}
      <TrackList tracks={view.tracks} play={(i) => void playTracks(view.tracks, i)} showArt empty={`No liked song matches “${tools.query}”.`} />
    </>
  );
}

function Mixes() {
  const list = mixes.value;
  return (
    <div class="mm-grid">
      <Tile
        tone={3}
        title="new mix"
        caption="tracks of every service, together"
        onClick={async () => {
          const title = await prompt("New mix", "Name", "", "create");
          if (!title) return;
          const p = await createMix(title);
          navigate(href.playlist(p.id));
        }}
      />
      {list.map((p) => (
        <PlaylistTile key={p.id} playlist={p} />
      ))}
    </div>
  );
}

function History() {
  const res = useAsync(() => Collection.history(300), []);
  if (res.error) return <Problem title="Couldn't load the history" message={res.error} />;
  if (!res.data) return <Loading />;
  if (res.data.length === 0) return <Empty title="no history yet" message="Tracks count once they played for thirty seconds." />;
  const tracks = res.data.map((p) => p.track);
  return (
    <>
      <div class="mm-actions mm-section-actions">
        <button
          type="button"
          class="mm-button mm-button-outline"
          onClick={async () => {
            if (!(await confirm("Clear history", "Forget every track you played? Your stats start over.", "clear", true))) return;
            await Collection.clearHistory();
            res.set([]);
          }}
        >
          clear history
        </button>
      </div>
      <TrackList tracks={tracks} play={(i) => void playTracks(tracks, i)} showArt numbered={false} />
    </>
  );
}

function SpotifyLibrary() {
  const playlists = useAsync(() => Collection.spotifyPlaylists(), []);
  const albums = useAsync(() => Collection.spotifyAlbums(), []);
  const artists = useAsync(() => Collection.spotifyArtists(), []);
  const [liked, setLiked] = useState<{ tracks: Track[]; total: number }>({ tracks: [], total: -1 });
  const [loadingLiked, setLoadingLiked] = useState(false);

  const more = async () => {
    setLoadingLiked(true);
    try {
      const page = await Collection.spotifyLikedTracks(liked.tracks.length);
      setLiked((l) => ({ tracks: [...l.tracks, ...page.tracks], total: page.total }));
    } catch (err) {
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setLoadingLiked(false);
    }
  };
  useEffect(() => void more(), []);

  return (
    <>
      {playlists.error && <Problem title="Couldn't load your Spotify playlists" message={playlists.error} />}
      {playlists.data && playlists.data.length > 0 && (
        <Shelf title="playlists">
          {playlists.data.map((p) => (
            <PlaylistTile key={p.id} playlist={p} />
          ))}
        </Shelf>
      )}
      {albums.data && albums.data.length > 0 && (
        <Shelf title="albums">
          {albums.data.map((a) => (
            <AlbumTile key={a.id} album={a} />
          ))}
        </Shelf>
      )}
      {artists.data && artists.data.length > 0 && (
        <Shelf title="artists you follow">
          {artists.data.map((a) => (
            <ArtistTile key={a.id} artist={a} />
          ))}
        </Shelf>
      )}
      <section class="mm-section">
        <h2 class="mm-section-title">liked on spotify</h2>
        {liked.total < 0 ? (
          <Loading rows={6} />
        ) : (
          <>
            <TrackList tracks={liked.tracks} play={(i) => void playTracks(liked.tracks, i)} showArt empty="No liked songs on Spotify." />
            {liked.tracks.length < liked.total && (
              <button type="button" class="mm-button mm-button-outline mm-load-more" disabled={loadingLiked} onClick={more}>
                {loadingLiked ? "loading…" : `load more · ${liked.tracks.length} of ${liked.total}`}
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
