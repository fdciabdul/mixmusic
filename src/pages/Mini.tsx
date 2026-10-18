// The mini player: a small window over the others that remote-controls the
// main window's player.
import { useEffect, useState } from "preact/hooks";
import { currentWindow } from "mygo-runtime";
import { Icon } from "../components/Icon";
import { SourceMark } from "../components/SourceMark";
import { events, Player, System, type NowPlaying, type PlayerCommand } from "../mygo";
import { artwork, artists, duration } from "../lib/format";

export function Mini() {
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [at, setAt] = useState(Date.now());
  useEffect(() => {
    Player.nowPlaying().then(setNp, () => {});
    const off = events.nowPlaying.on((n) => {
      setNp(n);
      setAt(Date.now());
    });
    document.documentElement.dataset.window = "mini";
    return off;
  }, []);
  // Move the progress on between reports.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!np?.playing) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [np?.playing]);

  const send = (cmd: PlayerCommand) => void Player.command(cmd);
  const t = np?.track;
  const pos = np ? Math.min(np.positionMs + (np.playing ? Date.now() - at : 0), np.durationMs || Infinity) : 0;
  const pct = np && np.durationMs > 0 ? (pos / np.durationMs) * 100 : 0;
  return (
    <div class="mm-mini">
      <div class="mm-mini-art">
        {t && artwork(t.artwork, 160) ? <img src={artwork(t.artwork, 160)} alt="" class="mm-artwork" /> : <span class="mm-artwork-empty" />}
      </div>
      <div class="mm-mini-main">
        <div class="mm-mini-text">
          <span class="mm-mini-title mm-ellipsis">{t ? t.title : "nothing playing"}</span>
          <span class="mm-mini-sub mm-ellipsis">
            {t && <SourceMark source={t.source} />}
            {t ? artists(t.artists) : "play something in MixMusic"}
          </span>
        </div>
        <div class="mm-mini-controls">
          <button type="button" class="mm-icon-button" aria-label="Previous" onClick={() => send({ command: "previous" })}>
            <Icon name="previous" size={18} />
          </button>
          <button type="button" class="mm-round mm-round-main" aria-label={np?.playing ? "Pause" : "Play"} onClick={() => send({ command: "toggle" })}>
            <Icon name={np?.playing ? "pause" : "play"} size={18} />
          </button>
          <button type="button" class="mm-icon-button" aria-label="Next" onClick={() => send({ command: "next" })}>
            <Icon name="next" size={18} />
          </button>
          <button
            type="button"
            class="mm-icon-button"
            data-on={np?.liked || undefined}
            aria-label={np?.liked ? "Remove from liked songs" : "Like"}
            onClick={() => send({ command: "like" })}
          >
            <Icon name="heart" size={16} fill={np?.liked} />
          </button>
          <span class="mm-mini-time mm-num">{t ? `${duration(pos)} / ${duration(np!.durationMs)}` : ""}</span>
        </div>
      </div>
      <div class="mm-mini-window">
        <button type="button" class="mm-icon-button" aria-label="Open MixMusic" onClick={() => void System.showMainWindow()}>
          <Icon name="mini" size={16} />
        </button>
        <button type="button" class="mm-icon-button" aria-label="Close the mini player" onClick={() => void currentWindow.close()}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div class="mm-mini-progress" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
