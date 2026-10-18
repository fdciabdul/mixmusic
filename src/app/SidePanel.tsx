// The panel at the right of the main pane: the queue, or the lyrics.
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { SourceMark } from "../components/SourceMark";
import { Bars } from "../components/TrackList";
import * as player from "../player/player";
import { artwork, artists, duration, errorMessage } from "../lib/format";
import { openMenu, sidePanel, togglePanel } from "../state/ui";
import { trackMenu } from "../lib/trackMenu";
import { Catalog, type Lyrics as LyricsData, type Track } from "../mygo";

export function SidePanel() {
  const panel = sidePanel.value;
  if (!panel) return null;
  return (
    <aside class="mm-panel" aria-label={panel === "queue" ? "Queue" : "Lyrics"}>
      {panel === "queue" ? <Queue /> : <LyricsPanel />}
    </aside>
  );
}

function PanelHead({ title, children }: { title: string; children?: preact.ComponentChildren }) {
  return (
    <header class="mm-panel-head">
      <h2 class="mm-panel-title">{title}</h2>
      <div class="mm-panel-actions">
        {children}
        <button type="button" class="mm-icon-button" aria-label={`Close ${title}`} onClick={() => (sidePanel.value = null)}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </header>
  );
}

function Queue() {
  const q = player.queue.value;
  const at = player.index.value;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const upcoming = q.slice(at + 1);
  const listRef = useRef<HTMLOListElement>(null);
  return (
    <>
      <PanelHead title="up next">
        {upcoming.length > 0 && (
          <button type="button" class="mm-text-button" onClick={player.clearUpcoming}>
            clear
          </button>
        )}
      </PanelHead>
      <div class="mm-scroll mm-panel-body">
        {at >= 0 && q[at] && (
          <div class="mm-queue-now">
            <span class="mm-queue-label">now playing</span>
            <QueueRow index={at} track={q[at]!.track} current />
          </div>
        )}
        {upcoming.length === 0 ? (
          <p class="mm-empty-line">
            {at < 0 ? "Play something and the queue shows here." : "Nothing queued. When the queue runs out, a radio of what you played carries on."}
          </p>
        ) : (
          <ol class="mm-queue-list" ref={listRef}>
            {upcoming.map((entry, i) => {
              const index = at + 1 + i;
              return (
                <li
                  key={entry.uid}
                  draggable
                  data-over={dragOver === index || undefined}
                  onDragStart={(e) => {
                    setDragFrom(index);
                    e.dataTransfer?.setData("text/plain", String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(index);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom != null) player.move(dragFrom, index);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => (setDragFrom(null), setDragOver(null))}
                >
                  <QueueRow index={index} track={entry.track} radio={entry.radio} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}

function QueueRow({ index, track, current, radio }: { index: number; track: Track; current?: boolean; radio?: boolean }) {
  const art = artwork(track.artwork, 64);
  return (
    <div
      class="mm-queue-row"
      data-playing={current || undefined}
      onDblClick={() => !current && void player.playAt(index)}
      onContextMenu={(e) => openMenu(e, trackMenu(track, { queueIndex: index }))}
    >
      <button
        type="button"
        class="mm-queue-art"
        onClick={() => (current ? void player.toggle() : void player.playAt(index))}
        aria-label={current ? (player.playing.value ? "Pause" : "Play") : `Play ${track.title}`}
      >
        {art ? <img src={art} alt="" class="mm-artwork" loading="lazy" /> : <span class="mm-artwork-empty" />}
        {current && player.playing.value ? <Bars /> : <Icon name="play" size={14} />}
      </button>
      <div class="mm-queue-text">
        <span class="mm-ellipsis mm-queue-title">{track.title}</span>
        <span class="mm-ellipsis mm-queue-sub">
          <SourceMark source={track.source} />
          {artists(track.artists)}
          {radio && <span class="mm-queue-radio"> · radio</span>}
        </span>
      </div>
      <span class="mm-num mm-queue-duration">{track.durationMs ? duration(track.durationMs) : ""}</span>
      {!current && (
        <button type="button" class="mm-icon-button mm-queue-remove" aria-label={`Remove ${track.title} from the queue`} onClick={() => player.removeAt(index)}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

function LyricsPanel() {
  return (
    <>
      <PanelHead title="lyrics" />
      <Lyrics compact />
    </>
  );
}

/** Lyrics follows the track playing; synchronized lines light up as they are sung. */
export function Lyrics({ compact }: { compact?: boolean }) {
  const track = player.currentTrack.value;
  const [state, setState] = useState<{ id?: string; lyrics?: LyricsData; error?: string }>({});
  useEffect(() => {
    if (!track) return setState({});
    const id = track.id;
    setState({ id });
    Catalog.lyrics(track).then(
      (lyrics) => setState((s) => (s.id === id ? { id, lyrics } : s)),
      (err) => setState((s) => (s.id === id ? { id, error: errorMessage(err) } : s)),
    );
  }, [track?.id]);

  const scroller = useRef<HTMLDivElement>(null);
  const lastUserScroll = useRef(0);
  const lyrics = state.lyrics;
  const pos = player.position.value;
  let activeLine = -1;
  if (lyrics?.synced) {
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i]!.timeMs <= pos + 250) activeLine = i;
      else break;
    }
  }
  useEffect(() => {
    if (activeLine < 0 || Date.now() - lastUserScroll.current < 4000) return;
    // Scroll the lyrics alone: scrollIntoView would scroll the shell too.
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (!box || !el) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [activeLine]);

  let body;
  if (!track) body = <p class="mm-empty-line">Play a track to see its lyrics.</p>;
  else if (state.error) body = <p class="mm-empty-line">{state.error}</p>;
  else if (!lyrics) body = <p class="mm-empty-line">Looking for the lyrics…</p>;
  else if (lyrics.instrumental) body = <p class="mm-empty-line">This track is instrumental.</p>;
  else
    body = (
      <div class="mm-lyrics" data-synced={lyrics.synced || undefined}>
        {lyrics.lines.map((l, i) => (
          <p
            key={i}
            data-line={i}
            class="mm-lyric"
            data-state={i === activeLine ? "now" : i < activeLine ? "past" : undefined}
            onClick={() => lyrics.synced && void player.seek(l.timeMs)}
          >
            {l.text || "♪"}
          </p>
        ))}
        <p class="mm-lyrics-source">lyrics from {lyrics.source}</p>
      </div>
    );
  return (
    <div
      class={`mm-scroll ${compact ? "mm-panel-body" : "mm-lyrics-page"}`}
      ref={scroller}
      onWheel={() => (lastUserScroll.current = Date.now())}
    >
      {body}
    </div>
  );
}

/** openQueue shows the queue panel. */
export const openQueue = () => sidePanel.value !== "queue" && togglePanel("queue");
