// Home: the user's own tiles, then the shelves of every service.
import { useMemo, useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { Tile } from "../components/Tile";
import { ItemTile, Shelf } from "../components/Shelf";
import { LoadingTiles, Problem } from "../components/States";
import { Catalog, Collection, System, type Shelf as ShelfData, type Source } from "../mygo";
import { useAsync } from "../lib/async";
import { navigate } from "../lib/router";
import { artwork, artists, plural } from "../lib/format";
import { mixes, likedIds } from "../state/library";
import { currentTrack, playTracks } from "../player/player";
import { accounts } from "../state/accounts";
import { InstallYTDLP } from "./Settings";

type Filter = "all" | "local" | Source;

export function Home() {
  const [filter, setFilter] = useState<Filter>("all");
  const home = useAsync(() => Catalog.home(), []);
  const recent = useAsync(() => Collection.history(1), []);
  const tools = useAsync(() => System.tools(), []);

  const shelves = useMemo(() => {
    const all: ShelfData[] = home.data ?? [];
    return filter === "all" ? all : all.filter((s) => s.source === filter);
  }, [home.data, filter]);

  const last = recent.data?.[0]?.track ?? currentTrack.value ?? undefined;
  const lastArt = last ? artwork(last.artwork, 300) : undefined;
  const spotify = accounts.value?.spotify;

  return (
    <div class="mm-page">
      <PageHeader
        title="home"
        active={filter}
        onPivot={(id) => setFilter(id as Filter)}
        pivots={[
          { id: "all", label: "everything" },
          { id: "local", label: "yours" },
          { id: "spotify", label: "spotify" },
          { id: "youtube", label: "youtube music" },
        ]}
      />

      {tools.data && !tools.data.ytdlp.found && (
        <Problem
          title="Playback needs yt-dlp"
          message="MixMusic finds the audio of YouTube Music tracks with yt-dlp. Install it once, and it stays up to date from Settings."
        >
          <InstallYTDLP onDone={tools.reload} />
        </Problem>
      )}

      <div class="mm-tile-grid">
        <Tile
          tone={1}
          size="large"
          title={last ? "jump back in" : "start here"}
          caption={last ? `${last.title} — ${artists(last.artists)}` : "search for something to play"}
          onClick={() => (last ? void playTracks([last]) : navigate("/search"))}
          label={last ? `Play ${last.title} again` : "Search for music"}
        >
          {lastArt && <img class="mm-tile-art" src={lastArt} alt="" />}
        </Tile>
        {(() => {
          const offer = spotify && !spotify.signedIn;
          const size = offer ? "small" : "wide";
          return (
            <>
              {/* Before the two others, so they stack in the last column. */}
              {offer && (
                <Tile tone={4} size="tall" title="add spotify" caption="sign in to search and play your spotify library here" onClick={() => navigate("/settings/accounts")} />
              )}
              <Tile tone={2} size={size} title="liked songs" caption={plural(likedIds.value.size, "track")} onClick={() => navigate("/library/liked")} />
              <Tile tone={3} size={size} title="your mixes" caption={plural(mixes.value.length, "mix", "mixes")} onClick={() => navigate("/library/mixes")} />
            </>
          );
        })()}
      </div>

      {home.error && !home.data && (
        <Problem title="Couldn't load the home feed" message={home.error} action={{ label: "try again", run: home.reload }} />
      )}
      {home.loading && !home.data && (
        <>
          <section class="mm-shelf">
            <LoadingTiles />
          </section>
          <section class="mm-shelf">
            <LoadingTiles />
          </section>
        </>
      )}
      {shelves.map((s, i) => {
        const tracks = s.items.flatMap((it) => (it.kind === "track" && it.track ? [it.track] : []));
        return (
          <Shelf key={`${s.title}-${i}`} title={s.title}>
            {s.items.map((it, j) => (
              <ItemTile key={j} item={it} tracks={tracks} />
            ))}
          </Shelf>
        );
      })}
      {home.data && shelves.length === 0 && (
        <p class="mm-empty-line">
          {filter === "spotify"
            ? "Sign in to Spotify in Settings › Accounts to see your playlists and recent tracks here."
            : filter === "local"
              ? "Play some tracks and make a mix: what you collect shows here."
              : "Nothing here yet."}
        </p>
      )}
    </div>
  );
}
