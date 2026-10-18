// Now playing: the artwork on a flat field of its own colour, the track's
// giant name, its lyrics, a visualizer and what plugins add.
import { useEffect, useRef } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { Empty } from "../components/States";
import { SourceMark } from "../components/SourceMark";
import { Lyrics } from "../app/SidePanel";
import { Progress } from "../app/PlayerBar";
import * as player from "../player/player";
import { artwork, artists } from "../lib/format";
import { href, navigate } from "../lib/router";
import { widgets, type Widget } from "../plugins/contributions";
import { isLiked, likedIds, toggleLiked } from "../state/library";

export function NowPlaying() {
  const t = player.currentTrack.value;
  likedIds.value;
  if (!t) {
    return (
      <div class="mm-page">
        <PageHeader title="now playing" />
        <Empty title="nothing playing" message="Play a track and it fills this page, with its lyrics." />
      </div>
    );
  }
  const next = player.upNext.value;
  const liked = isLiked(t.id);
  return (
    <div class="mm-page mm-now">
      <PageHeader title={t.title} />
      <div class="mm-now-grid">
        <div class="mm-now-sleeve">
          {artwork(t.artwork, 544) ? <img src={artwork(t.artwork, 544)} alt="" class="mm-artwork" /> : <span class="mm-artwork-empty" />}
          <Visualizer />
        </div>
        <div class="mm-now-info">
          <div class="mm-now-artists">
            <SourceMark source={t.source} label />
            <span class="mm-now-credits">
              {t.artists.map((a, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {a.id ? (
                    <a href={href.artist(a.id)} onClick={(e) => (e.preventDefault(), navigate(href.artist(a.id!)))}>
                      {a.name}
                    </a>
                  ) : (
                    a.name
                  )}
                </span>
              ))}
              {t.album?.name && (
                <span class="mm-now-album">
                  {t.album.id ? (
                    <a href={href.album(t.album.id)} onClick={(e) => (e.preventDefault(), navigate(href.album(t.album!.id!)))}>
                      {t.album.name}
                    </a>
                  ) : (
                    t.album.name
                  )}
                </span>
              )}
            </span>
          </div>
          <Progress />
          <div class="mm-actions">
            <button type="button" class="mm-round mm-round-main" aria-label={player.playing.value ? "Pause" : "Play"} onClick={() => void player.toggle()}>
              <Icon name={player.playing.value ? "pause" : "play"} size={22} />
            </button>
            <button type="button" class="mm-round" aria-label="Next" onClick={() => void player.next()}>
              <Icon name="next" size={18} />
            </button>
            <button
              type="button"
              class="mm-round"
              data-on={liked || undefined}
              aria-pressed={liked}
              aria-label={liked ? "Remove from liked songs" : "Like"}
              onClick={() => toggleLiked(t)}
            >
              <Icon name="heart" size={18} fill={liked} />
            </button>
          </div>
          {next && next.track.id !== t.id && (
            <button type="button" class="mm-now-next" onClick={() => void player.next()}>
              <span class="mm-now-next-label">up next</span>
              <span class="mm-ellipsis">
                {next.track.title} — {artists(next.track.artists)}
              </span>
            </button>
          )}
          <div class="mm-now-lyrics">
            <Lyrics />
          </div>
          {widgets.value.map((w) => (
            <WidgetView key={w.id} widget={w} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WidgetView({ widget }: { widget: Widget }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      const cleanup = widget.render(ref.current);
      return () => typeof cleanup === "function" && cleanup();
    } catch (err) {
      console.error(err);
    }
  }, [widget]);
  return (
    <section class="mm-widget">
      <h2 class="mm-section-title">{widget.title.toLocaleLowerCase()}</h2>
      <div ref={ref} />
    </section>
  );
}

/** Visualizer draws the spectrum of what plays as flat bars in the accent. */
function Visualizer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let data = new Uint8Array(0);
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const a = player.analyser();
      const w = (el.width = el.clientWidth * devicePixelRatio);
      const h = (el.height = el.clientHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      if (!a || !player.playing.value) return;
      if (data.length !== a.frequencyBinCount) data = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(data);
      const bars = 32;
      const gap = 3 * devicePixelRatio;
      const bw = (w - gap * (bars - 1)) / bars;
      ctx.fillStyle = getComputedStyle(el).color;
      for (let i = 0; i < bars; i++) {
        // Lower bins carry more of the music: spread them over more bars.
        const bin = Math.floor(Math.pow(i / bars, 1.6) * (data.length * 0.75));
        const v = (data[bin] ?? 0) / 255;
        const bh = Math.max(2 * devicePixelRatio, v * h);
        ctx.fillRect(i * (bw + gap), h - bh, bw, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvas} class="mm-visualizer" aria-hidden="true" />;
}
