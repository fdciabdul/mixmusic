// The player bar: what plays, the transport, where it is in the track, and
// the volume. The next track waits in view under the current one.
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon";
import { Slider } from "../components/Slider";
import { SourceMark } from "../components/SourceMark";
import * as player from "../player/player";
import { artwork, artists, duration, sourceName } from "../lib/format";
import { href, navigate } from "../lib/router";
import { isLiked, likedIds, toggleLiked } from "../state/library";
import { openMenu, sidePanel, togglePanel } from "../state/ui";
import { settings, update } from "../state/settings";
import { spotifySignedIn } from "../state/accounts";
import { Player, System } from "../mygo";
import { trackMenu } from "../lib/trackMenu";
import { errorMessage } from "../lib/format";
import { toast } from "../state/ui";

export function PlayerBar() {
  const t = player.currentTrack.value;
  const next = player.upNext.value;
  likedIds.value; // re-render when likes change
  const liked = t ? isLiked(t.id) : false;
  const src = player.source.value;
  const matched = t && src?.mode === "stream" && src.track.id !== t.id;
  return (
    <footer class="mm-player" aria-label="Player">
      <div class="mm-player-now">
        {t ? (
          <>
            <button
              type="button"
              class="mm-player-art"
              onClick={() => navigate("/now-playing")}
              aria-label="Open now playing"
              onContextMenu={(e) => openMenu(e, trackMenu(t))}
            >
              {artwork(t.artwork, 120) ? <img src={artwork(t.artwork, 120)} alt="" class="mm-artwork" /> : <span class="mm-artwork-empty" />}
            </button>
            <div class="mm-player-text">
              <span class="mm-player-title mm-ellipsis">
                {t.album?.id ? (
                  <a href={href.album(t.album.id)} onClick={(e) => (e.preventDefault(), navigate(href.album(t.album!.id!)))}>
                    {t.title}
                  </a>
                ) : (
                  t.title
                )}
              </span>
              <span class="mm-player-artists mm-ellipsis" data-badges>
                <SourceMark source={t.source} />
                {artists(t.artists)}
                {matched && <span class="mm-player-via"> · via YouTube Music</span>}
                {src?.mode === "connect" && <span class="mm-player-via"> · on Spotify</span>}
              </span>
              {next && next.track.id !== t.id && sidePanel.value !== "queue" && (
                <span class="mm-player-next mm-ellipsis">
                  next · {next.track.title} — {artists(next.track.artists)}
                </span>
              )}
            </div>
            <button
              type="button"
              class="mm-icon-button mm-player-like"
              data-on={liked || undefined}
              aria-pressed={liked}
              aria-label={liked ? "Remove from liked songs" : "Like"}
              onClick={() => toggleLiked(t)}
            >
              <Icon name="heart" size={18} fill={liked} />
            </button>
          </>
        ) : (
          <span class="mm-player-idle">pick something to play</span>
        )}
      </div>

      <div class="mm-player-center">
        <div class="mm-transport">
          <button
            type="button"
            class="mm-icon-button"
            data-on={player.shuffle.value || undefined}
            aria-pressed={player.shuffle.value}
            aria-label="Shuffle"
            onClick={player.toggleShuffle}
          >
            <Icon name="shuffle" size={18} />
          </button>
          <button type="button" class="mm-round" aria-label="Previous" onClick={() => void player.previous()}>
            <Icon name="previous" size={18} />
          </button>
          <button
            type="button"
            class="mm-round mm-round-main"
            data-busy={player.buffering.value || undefined}
            aria-label={player.playing.value ? "Pause" : "Play"}
            onClick={() => void player.toggle()}
            disabled={!t && player.queue.value.length === 0}
          >
            <Icon name={player.playing.value ? "pause" : "play"} size={22} />
          </button>
          <button type="button" class="mm-round" aria-label="Next" onClick={() => void player.next()}>
            <Icon name="next" size={18} />
          </button>
          <button
            type="button"
            class="mm-icon-button"
            data-on={player.repeat.value !== "off" || undefined}
            aria-label={`Repeat: ${player.repeat.value}`}
            onClick={player.cycleRepeat}
          >
            <Icon name={player.repeat.value === "one" ? "repeatOne" : "repeat"} size={18} />
          </button>
        </div>
        <Progress />
      </div>

      <div class="mm-player-side">
        <button
          type="button"
          class="mm-icon-button"
          data-on={sidePanel.value === "lyrics" || undefined}
          aria-pressed={sidePanel.value === "lyrics"}
          aria-label="Lyrics"
          onClick={() => togglePanel("lyrics")}
        >
          <Icon name="lyrics" size={18} />
        </button>
        <button
          type="button"
          class="mm-icon-button"
          data-on={sidePanel.value === "queue" || undefined}
          aria-pressed={sidePanel.value === "queue"}
          aria-label="Queue"
          onClick={() => togglePanel("queue")}
        >
          <Icon name="queue" size={18} />
        </button>
        {spotifySignedIn.value && settings.value?.spotifyPlayback === "connect" && <DevicesButton />}
        <Volume />
        <button type="button" class="mm-icon-button" aria-label="Open the mini player" onClick={() => void System.showMiniPlayer()}>
          <Icon name="mini" size={18} />
        </button>
      </div>
    </footer>
  );
}

/** Progress shows where the track is, and seeks. */
export function Progress() {
  const [drag, setDrag] = useState<number | null>(null);
  const pos = drag ?? player.position.value;
  const dur = player.duration.value || player.currentTrack.value?.durationMs || 0;
  return (
    <div class="mm-progress">
      <span class="mm-progress-time mm-num">{duration(pos)}</span>
      <Slider
        class="mm-seek"
        value={Math.min(pos, dur || 1)}
        max={dur || 1}
        step={1000}
        label="Seek"
        valueText={`${duration(pos)} of ${duration(dur)}`}
        disabled={!player.currentTrack.value}
        onInput={setDrag}
        onCommit={(v) => {
          setDrag(null);
          void player.seek(v);
        }}
      />
      <span class="mm-progress-time mm-num">{duration(dur)}</span>
    </div>
  );
}

function Volume() {
  const v = player.muted.value ? 0 : player.volume.value;
  return (
    <div class="mm-volume">
      <button type="button" class="mm-icon-button" aria-label={player.muted.value ? "Unmute" : "Mute"} onClick={player.toggleMute}>
        <Icon name={v === 0 ? "volumeMute" : "volume"} size={18} />
      </button>
      <Slider value={v} label="Volume" valueText={`${Math.round(v * 100)}%`} onInput={player.setVolume} />
    </div>
  );
}

function DevicesButton() {
  const [busy, setBusy] = useState(false);
  useEffect(() => () => setBusy(false), []);
  return (
    <button
      type="button"
      class="mm-icon-button"
      aria-label="Spotify Connect devices"
      disabled={busy}
      onClick={async (e) => {
        const el = e.currentTarget as HTMLElement;
        setBusy(true);
        try {
          const devices = await Player.devices();
          const chosen = settings.value?.spotifyDevice ?? "";
          openMenu(el, [
            { label: "The active device", checked: chosen === "", run: () => void update({ spotifyDevice: "" }) },
            ...devices.map((d) => ({
              label: `${d.name}${d.active ? " · active" : ""}`,
              checked: chosen === d.id,
              disabled: d.restricted,
              run: () => void update({ spotifyDevice: d.id }),
            })),
            ...(devices.length === 0 ? [{ label: `Open ${sourceName("spotify")} on a device to see it here`, disabled: true }] : []),
          ]);
        } catch (err) {
          toast(errorMessage(err), { tone: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="devices" size={18} />
    </button>
  );
}
