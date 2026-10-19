// The pages of an album, an artist and a playlist.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { signedInTo } from "../state/accounts";
import { PageHeader } from "../components/PageHeader";
import { CollectionHead } from "../components/CollectionHead";
import { TrackList } from "../components/TrackList";
import { TrackTools, useTrackView } from "../components/TrackTools";
import { AlbumTile, Shelf } from "../components/Shelf";
import { Loading, Problem } from "../components/States";
import { Catalog, Collection, System, type Track } from "../mygo";
import { useAsync } from "../lib/async";
import { artwork, longDuration, plural, sourceName } from "../lib/format";
import { href, navigate } from "../lib/router";
import { collectionMenu, startRadio } from "../lib/trackMenu";
import { playTracks, setShuffle } from "../player/player";
import { confirm, openMenu, prompt, toast } from "../state/ui";
import { refreshMixes } from "../state/library";
import { errorMessage } from "../lib/format";

const total = (tracks: Track[]) => tracks.reduce((ms, t) => ms + t.durationMs, 0);

/** EMPTY is the list of a page still loading, the same array each time. */
const EMPTY: Track[] = [];

function shuffled(tracks: Track[]) {
  setShuffle(true);
  void playTracks(tracks, Math.floor(Math.random() * tracks.length));
}

export function AlbumPage({ id }: { id: string }) {
  const res = useAsync(() => Catalog.album(id), [id]);
  const a = res.data;
  if (res.error) return <PageProblem title="album" error={res.error} retry={res.reload} />;
  if (!a) return <PageLoading title="album" />;
  return (
    <div class="mm-page">
      <PageHeader title={a.title}>
        <CollectionHead
          image={artwork(a.artwork, 544)}
          source={a.source}
          facts={[
            a.kind || "album",
            a.year,
            <ArtistLinks refs={a.artists} />,
            plural(a.trackCount || a.tracks.length, "track"),
            a.tracks.length > 0 ? longDuration(total(a.tracks)) : "",
          ]}
          onPlay={() => void playTracks(a.tracks)}
          onShuffle={() => shuffled(a.tracks)}
          onMenu={(el) => openMenu(el, [...collectionMenu(a.title, a.tracks), ...(a.url ? [externalItem(a.url, a.source)] : [])])}
        >
          {signedInTo(a.source) && (
            <KeepButton on={a.saved ?? false} label="save" onLabel="saved" what={a.title} run={(on) => Collection.setSaved("album", a.id, a.playlistId ?? "", on)} />
          )}
        </CollectionHead>
      </PageHeader>
      <TrackList tracks={a.tracks} play={(i) => void playTracks(a.tracks, i)} showAlbum={false} />
    </div>
  );
}

export function ArtistPage({ id }: { id: string }) {
  const res = useAsync(() => Catalog.artist(id), [id]);
  const [pivot, setPivot] = useState("songs");
  const a = res.data;
  if (res.error) return <PageProblem title="artist" error={res.error} retry={res.reload} />;
  if (!a) return <PageLoading title="artist" />;
  const scroll = (section: string) => {
    setPivot(section);
    document.getElementById(`mm-artist-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div class="mm-page">
      <PageHeader
        title={a.name}
        active={pivot}
        onPivot={scroll}
        pivots={[
          { id: "songs", label: "songs" },
          ...(a.albums.length ? [{ id: "albums", label: "albums" }] : []),
          ...(a.singles.length ? [{ id: "singles", label: "singles" }] : []),
          ...(a.related.length ? [{ id: "related", label: "related" }] : []),
        ]}
      >
        <CollectionHead
          image={artwork(a.artwork, 544)}
          source={a.source}
          facts={[a.subtitle]}
          description={a.description ? a.description.slice(0, 320) + (a.description.length > 320 ? "…" : "") : undefined}
          onPlay={a.topTracks.length ? () => void playTracks(a.topTracks) : undefined}
          playLabel="play top songs"
          onMenu={(el) =>
            openMenu(el, [
              ...(a.topTracks[0] ? [{ label: "Start radio", icon: "radio", run: () => void startRadio(a.topTracks[0]!) }] : []),
              ...(a.url ? [externalItem(a.url, a.source)] : []),
            ])
          }
        >
          {signedInTo(a.source) && (
            <KeepButton on={a.following ?? false} label="follow" onLabel="following" what={a.name} run={(on) => Collection.setFollowing(a.id, on)} />
          )}
        </CollectionHead>
      </PageHeader>
      <section class="mm-section" id="mm-artist-songs">
        <h2 class="mm-section-title">top songs</h2>
        <TrackList tracks={a.topTracks} play={(i) => void playTracks(a.topTracks, i)} showArt empty="No songs listed for this artist." />
      </section>
      {a.albums.length > 0 && (
        <div id="mm-artist-albums">
          <Shelf title="albums">
            {a.albums.map((al) => (
              <AlbumTile key={al.id} album={al} />
            ))}
          </Shelf>
        </div>
      )}
      {a.singles.length > 0 && (
        <div id="mm-artist-singles">
          <Shelf title="singles & eps">
            {a.singles.map((al) => (
              <AlbumTile key={al.id} album={al} />
            ))}
          </Shelf>
        </div>
      )}
      {a.related.length > 0 && (
        <section class="mm-section" id="mm-artist-related">
          <h2 class="mm-section-title">fans also like</h2>
          <div class="mm-chips">
            {a.related.map((r) =>
              r.id ? (
                <button key={r.id} type="button" class="mm-chip" onClick={() => navigate(href.artist(r.id!))}>
                  {r.name}
                </button>
              ) : null,
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function PlaylistPage({ id }: { id: string }) {
  const res = useAsync(() => Catalog.playlist(id), [id]);
  const p = res.data;
  const tools = useTrackView(p?.tracks ?? EMPTY);
  if (res.error) return <PageProblem title="playlist" error={res.error} retry={res.reload} />;
  if (!p) return <PageLoading title="playlist" />;
  const local = p.source === "local";
  const { view } = tools;
  const menu = (el: HTMLElement) =>
    openMenu(el, [
      ...collectionMenu(p.title, p.tracks, local ? undefined : p.id),
      ...(local
        ? [
            {
              label: "Rename",
              icon: "edit",
              run: async () => {
                const title = await prompt("Rename mix", "Name", p.title);
                if (!title) return;
                await Collection.updatePlaylist(p.id, title, p.description ?? "");
                await refreshMixes();
                res.reload();
              },
            },
            {
              label: "Delete",
              icon: "trash",
              danger: true,
              run: async () => {
                if (!(await confirm("Delete mix", `Delete ${p.title}? Its tracks stay where they came from.`, "delete", true))) return;
                await Collection.deletePlaylist(p.id);
                await refreshMixes();
                toast(`Deleted ${p.title}`);
                navigate("/library/mixes");
              },
            },
          ]
        : p.url
          ? [externalItem(p.url, p.source)]
          : []),
    ]);
  return (
    <div class="mm-page">
      <PageHeader title={p.title}>
        <CollectionHead
          image={artwork(p.artwork, 544)}
          source={p.source}
          facts={[
            local ? "your mix" : p.owner,
            plural(p.trackCount || p.tracks.length, "track"),
            p.tracks.length > 0 ? longDuration(total(p.tracks)) : "",
          ]}
          description={p.description}
          onPlay={p.tracks.length ? () => void playTracks(p.tracks) : undefined}
          onShuffle={p.tracks.length ? () => shuffled(p.tracks) : undefined}
          onMenu={menu}
        >
          {!local && !p.editable && signedInTo(p.source) && (
            <KeepButton on={p.saved ?? false} label="save" onLabel="saved" what={p.title} run={(on) => Collection.setSaved("playlist", p.id, "", on)} />
          )}
        </CollectionHead>
      </PageHeader>
      {p.tracks.length > 1 && (
        <TrackTools
          noun={local ? "mix" : "playlist"}
          total={p.tracks.length}
          shown={view.tracks.length}
          sort={tools.sort}
          query={tools.query}
          onSort={tools.setSort}
          onQuery={tools.setQuery}
        />
      )}
      <TrackList
        tracks={view.tracks}
        play={(i) => void playTracks(view.tracks, i)}
        showArt
        empty={
          tools.query
            ? `Nothing in this ${local ? "mix" : "playlist"} matches “${tools.query}”.`
            : local
              ? "This mix is empty: add tracks of any service from their menu, under “Add to mix”."
              : "This playlist is empty."
        }
        menuContext={
          local
            ? (i) => ({
                removeFromMix: () =>
                  Collection.removeFromPlaylist(p.id, view.indices[i]!).then(
                    () => (res.reload(), refreshMixes()),
                    (err) => toast(errorMessage(err), { tone: "error" }),
                  ),
              })
            : undefined
        }
      />
    </div>
  );
}

function ArtistLinks({ refs }: { refs: { id?: string; name: string }[] }) {
  return (
    <span>
      {refs.map((r, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {r.id ? (
            <a href={href.artist(r.id)} onClick={(e) => (e.preventDefault(), navigate(href.artist(r.id!)))}>
              {r.name}
            </a>
          ) : (
            r.name
          )}
        </span>
      ))}
    </span>
  );
}

function externalItem(url: string, source: Parameters<typeof sourceName>[0]) {
  return {
    label: `Open in ${sourceName(source)}`,
    icon: "external",
    run: () => void System.openExternal(url),
  };
}

function PageLoading({ title }: { title: string }) {
  return (
    <div class="mm-page">
      <PageHeader title={title} />
      <Loading />
    </div>
  );
}

function PageProblem({ title, error, retry }: { title: string; error: string; retry: () => void }) {
  return (
    <div class="mm-page">
      <PageHeader title={title} />
      <Problem title={`Couldn't open this ${title}`} message={error} action={{ label: "try again", run: retry }} />
    </div>
  );
}


/** KeepButton keeps an album, a playlist or an artist in the user's library on its service, or lets it go. */
function KeepButton({ on, label, onLabel, what, run }: { on: boolean; label: string; onLabel: string; what: string; run: (on: boolean) => Promise<void> }) {
  const [kept, setKept] = useState(on);
  const [busy, setBusy] = useState(false);
  useEffect(() => setKept(on), [on]);
  const toggle = async () => {
    const next = !kept;
    setKept(next); // show it at once; undo when the service refuses
    setBusy(true);
    try {
      await run(next);
      toast(next ? `${what}: ${onLabel}` : `${what}: no longer ${onLabel}`);
    } catch (err) {
      setKept(!next);
      toast(errorMessage(err), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" class="mm-button mm-button-outline mm-keep" data-on={kept || undefined} aria-pressed={kept} disabled={busy} onClick={toggle}>
      <Icon name={kept ? "check" : "plus"} size={16} />
      {kept ? onLabel : label}
    </button>
  );
}
