// Sorting a list of tracks and searching inside it, without changing the
// list itself: a view of it, which remembers where each track came from.
import { useMemo, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { Select } from "./Controls";
import type { Track } from "../mygo";

export type SortKey = "order" | "title" | "artist" | "length";

const sorts: { value: SortKey; label: string }[] = [
  { value: "order", label: "Playlist order" },
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
  { value: "length", label: "Length" },
];

/** TrackView is a list as shown: its tracks, and the index of each in the list it came from. */
export interface TrackView {
  tracks: Track[];
  indices: number[];
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
const artistNames = (t: Track) => t.artists.map((a) => a.name).join(", ");

/** viewTracks keeps the tracks matching query, in the order of sort. */
export function viewTracks(tracks: Track[], sort: SortKey, query: string): TrackView {
  const words = fold(query).split(/\s+/).filter(Boolean);
  let rows = tracks.map((track, index) => ({ track, index }));
  if (words.length > 0) {
    rows = rows.filter(({ track }) => {
      const text = fold(`${track.title} ${artistNames(track)} ${track.album?.name ?? ""}`);
      return words.every((w) => text.includes(w));
    });
  }
  const by: Record<SortKey, ((a: Track, b: Track) => number) | null> = {
    order: null,
    title: (a, b) => collator.compare(a.title, b.title),
    artist: (a, b) => collator.compare(artistNames(a), artistNames(b)) || collator.compare(a.title, b.title),
    length: (a, b) => a.durationMs - b.durationMs,
  };
  const compare = by[sort];
  // Equal keys keep the list's own order.
  if (compare) rows.sort((a, b) => compare(a.track, b.track) || a.index - b.index);
  return { tracks: rows.map((r) => r.track), indices: rows.map((r) => r.index) };
}

/** useTrackView holds the sort and the search of a list, and the view they make. */
export function useTrackView(tracks: Track[]) {
  const [sort, setSort] = useState<SortKey>("order");
  const [query, setQuery] = useState("");
  const view = useMemo(() => viewTracks(tracks, sort, query), [tracks, sort, query]);
  return { view, sort, setSort, query, setQuery };
}

interface Props {
  total: number;
  shown: number;
  sort: SortKey;
  query: string;
  onSort: (sort: SortKey) => void;
  onQuery: (query: string) => void;
  /** what names the list: "playlist", "mix". */
  noun: string;
}

/** TrackTools is the search box and the sort of a list of tracks. */
export function TrackTools({ total, shown, sort, query, onSort, onQuery, noun }: Props) {
  return (
    <div class="mm-track-tools">
      <label class="mm-track-search">
        <Icon name="search" size={16} />
        <input
          class="mm-input"
          type="search"
          spellcheck={false}
          placeholder={`search this ${noun}`}
          aria-label={`Search this ${noun}`}
          value={query}
          onInput={(e) => onQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Escape" && query && (e.stopPropagation(), onQuery(""))}
        />
      </label>
      <Select value={sort} options={sorts.map((s) => (s.value === "order" ? { ...s, label: `${noun[0]!.toUpperCase()}${noun.slice(1)} order` } : s))} label="Sort by" onChange={onSort} />
      {query && (
        <span class="mm-track-count mm-num" aria-live="polite">
          {shown} of {total}
        </span>
      )}
    </div>
  );
}
