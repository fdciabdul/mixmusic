// A list of tracks: number, title and artists, album, source, like and
// duration. The playing row floods with the accent.
import { Icon } from "./Icon";
import { SourceMark } from "./SourceMark";
import type { Track } from "../mygo";
import { artwork, duration } from "../lib/format";
import { href, navigate } from "../lib/router";
import { trackMenu, type TrackMenuContext } from "../lib/trackMenu";
import { openMenu } from "../state/ui";
import { likedIds, toggleLiked } from "../state/library";
import { currentTrack, playing, toggle } from "../player/player";

interface Props {
  tracks: Track[];
  /** play plays the list from the track at index. */
  play: (index: number) => void;
  showAlbum?: boolean;
  showArt?: boolean;
  /** numbered shows positions; otherwise artwork. */
  numbered?: boolean;
  menuContext?: (index: number) => TrackMenuContext;
  empty?: string;
}

export function TrackList({ tracks, play, showAlbum = true, showArt = false, numbered = true, menuContext, empty }: Props) {
  const playingId = currentTrack.value?.id;
  const liked = likedIds.value;
  if (tracks.length === 0) return <p class="mm-empty-line">{empty ?? "No tracks here yet."}</p>;
  return (
    <div class="mm-tracklist" role="list" data-album={showAlbum || undefined}>
      {tracks.map((t, i) => {
        const current = t.id === playingId;
        const isLiked = liked.has(t.id);
        const art = showArt ? artwork(t.artwork, 64) : undefined;
        return (
          <div
            key={`${t.id}-${i}`}
            role="listitem"
            class="mm-track"
            data-playing={current || undefined}
            onDblClick={() => (current ? toggle() : play(i))}
            onContextMenu={(e) => openMenu(e, trackMenu(t, menuContext?.(i)))}
          >
            <div class="mm-track-lead">
              {showArt ? (
                art ? (
                  <img class="mm-track-art mm-artwork" src={art} alt="" loading="lazy" />
                ) : (
                  <span class="mm-track-art mm-artwork-empty" />
                )
              ) : (
                numbered && <span class="mm-track-num mm-num">{current && playing.value ? <Bars /> : i + 1}</span>
              )}
              <button
                type="button"
                class="mm-track-play"
                onClick={() => (current ? toggle() : play(i))}
                aria-label={current && playing.value ? `Pause ${t.title}` : `Play ${t.title}`}
              >
                <Icon name={current && playing.value ? "pause" : "play"} size={16} />
              </button>
            </div>
            <div class="mm-track-main">
              <span class="mm-track-title mm-ellipsis">
                {t.title}
                {t.explicit && (
                  <abbr class="mm-explicit" title="Explicit">
                    e
                  </abbr>
                )}
              </span>
              <span class="mm-track-artists mm-ellipsis">
                {t.artists.map((a, j) => (
                  <>
                    {j > 0 && ", "}
                    {a.id ? (
                      <a
                        href={href.artist(a.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(href.artist(a.id!));
                        }}
                      >
                        {a.name}
                      </a>
                    ) : (
                      a.name
                    )}
                  </>
                ))}
              </span>
            </div>
            {showAlbum && (
              <span class="mm-track-album mm-ellipsis">
                {t.album?.id ? (
                  <a
                    href={href.album(t.album.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(href.album(t.album!.id!));
                    }}
                  >
                    {t.album.name}
                  </a>
                ) : (
                  t.album?.name
                )}
              </span>
            )}
            <SourceMark source={t.source} />
            <button
              type="button"
              class="mm-icon-button mm-track-like"
              data-on={isLiked || undefined}
              aria-pressed={isLiked}
              aria-label={isLiked ? `Remove ${t.title} from liked songs` : `Like ${t.title}`}
              onClick={() => toggleLiked(t)}
            >
              <Icon name="heart" size={16} fill={isLiked} />
            </button>
            <span class="mm-track-duration mm-num">{t.durationMs > 0 ? duration(t.durationMs) : ""}</span>
            <button
              type="button"
              class="mm-icon-button mm-track-more"
              aria-label={`More for ${t.title}`}
              onClick={(e) => openMenu(e.currentTarget as HTMLElement, trackMenu(t, menuContext?.(i)))}
            >
              <Icon name="more" size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Bars is the playing mark of the current row: three bars that rise and fall. */
export function Bars() {
  return (
    <span class="mm-bars" aria-label="Playing">
      <i />
      <i />
      <i />
    </span>
  );
}
