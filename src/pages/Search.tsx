// Search: both services at once, with the query as the page's word.
import { useMemo, useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { TrackList } from "../components/TrackList";
import { AlbumTile, ArtistTile, PlaylistTile, Shelf } from "../components/Shelf";
import { Loading, Problem, Empty } from "../components/States";
import { Catalog, Collection, type SearchResults, type Track } from "../mygo";
import { useAsync } from "../lib/async";
import { current, href, navigate } from "../lib/router";
import { playTracks } from "../player/player";
import { searchInputId } from "../app/TopBar";

type Pivot = "all" | "songs" | "albums" | "artists" | "playlists";
type Scope = "both" | "spotify" | "youtube";

/** interleave alternates the items of two lists, so both services lead. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== undefined) out.push(a[i]!);
    if (b[i] !== undefined) out.push(b[i]!);
  }
  return out;
}

function merge(yt: SearchResults, sp: SearchResults, scope: Scope): SearchResults {
  if (scope === "youtube") return yt;
  if (scope === "spotify") return sp;
  return {
    tracks: interleave(sp.tracks, yt.tracks),
    albums: interleave(sp.albums, yt.albums),
    artists: interleave(sp.artists, yt.artists),
    playlists: interleave(sp.playlists, yt.playlists),
  };
}

export function Search() {
  const q = current.value.query.get("q")?.trim() ?? "";
  if (!q) return <RecentSearches />;
  return <Results key={q} q={q} />;
}

function Results({ q }: { q: string }) {
  const [pivot, setPivot] = useState<Pivot>("all");
  const [scope, setScope] = useState<Scope>("both");
  const res = useAsync(() => Catalog.search(q), [q]);
  const merged = useMemo(() => (res.data ? merge(res.data.youtube, res.data.spotify, scope) : null), [res.data, scope]);
  const play = (tracks: Track[]) => (i: number) => void playTracks(tracks, i);

  return (
    <div class="mm-page">
      <PageHeader
        title={q}
        active={pivot}
        onPivot={(id) => setPivot(id as Pivot)}
        pivots={[
          { id: "all", label: "all" },
          { id: "songs", label: "songs", count: merged?.tracks.length },
          { id: "albums", label: "albums", count: merged?.albums.length },
          { id: "artists", label: "artists", count: merged?.artists.length },
          { id: "playlists", label: "playlists", count: merged?.playlists.length },
        ]}
      >
        <div class="mm-segmented" role="radiogroup" aria-label="Services">
          {(
            [
              ["both", "both"],
              ["spotify", "spotify"],
              ["youtube", "youtube music"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {res.data && !res.data.spotifySignedIn && scope !== "youtube" && (
        <p class="mm-hint">
          Searching YouTube Music only.{" "}
          <a href="/settings/accounts" onClick={(e) => (e.preventDefault(), navigate("/settings/accounts"))}>
            Sign in to Spotify
          </a>{" "}
          to search it too.
        </p>
      )}
      {res.data && res.data.errors.length > 0 && <p class="mm-hint mm-hint-error">{res.data.errors.join(" · ")}</p>}
      {res.loading && <Loading rows={10} label="Searching" />}
      {res.error && <Problem title="The search failed" message={res.error} action={{ label: "try again", run: res.reload }} />}

      {merged && !res.loading && (
        <>
          {(pivot === "all" || pivot === "songs") && (
            <section class="mm-section">
              {pivot === "all" && <h2 class="mm-section-title">songs</h2>}
              <TrackList
                tracks={pivot === "all" ? merged.tracks.slice(0, 10) : merged.tracks}
                play={play(merged.tracks)}
                showArt
                empty="No songs match."
              />
            </section>
          )}
          {pivot === "all" ? (
            <>
              {merged.artists.length > 0 && (
                <Shelf title="artists">
                  {merged.artists.map((a) => (
                    <ArtistTile key={a.id} artist={a} />
                  ))}
                </Shelf>
              )}
              {merged.albums.length > 0 && (
                <Shelf title="albums">
                  {merged.albums.map((a) => (
                    <AlbumTile key={a.id} album={a} />
                  ))}
                </Shelf>
              )}
              {merged.playlists.length > 0 && (
                <Shelf title="playlists">
                  {merged.playlists.map((p) => (
                    <PlaylistTile key={p.id} playlist={p} />
                  ))}
                </Shelf>
              )}
            </>
          ) : (
            pivot !== "songs" && (
              <div class="mm-grid">
                {pivot === "albums" && merged.albums.map((a) => <AlbumTile key={a.id} album={a} />)}
                {pivot === "artists" && merged.artists.map((a) => <ArtistTile key={a.id} artist={a} />)}
                {pivot === "playlists" && merged.playlists.map((p) => <PlaylistTile key={p.id} playlist={p} />)}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

function RecentSearches() {
  const searches = useAsync(() => Collection.searches(), []);
  return (
    <div class="mm-page">
      <PageHeader title="search" />
      <Empty title="find anything" message="One search looks through YouTube Music and, once you sign in, Spotify.">
        <button type="button" class="mm-button mm-button-primary" onClick={() => document.getElementById(searchInputId)?.focus()}>
          start typing
        </button>
      </Empty>
      {searches.data && searches.data.length > 0 && (
        <section class="mm-section">
          <header class="mm-section-head">
            <h2 class="mm-section-title">recent</h2>
            <button
              type="button"
              class="mm-text-button"
              onClick={() => Collection.clearSearches().then(() => searches.set([]))}
            >
              clear
            </button>
          </header>
          <div class="mm-chips">
            {searches.data.map((s) => (
              <button key={s} type="button" class="mm-chip" onClick={() => navigate(href.search(s))}>
                {s}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
