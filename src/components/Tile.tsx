// Tiles: flat colour fields that are the doors of the interface, and the
// artwork tiles of albums, playlists, artists and tracks.
import type { ComponentChildren, TargetedMouseEvent } from "preact";
import { useRef } from "preact/hooks";
import { Icon } from "./Icon";
import { SourceMark } from "./SourceMark";
import type { Source } from "../mygo";

/** useTilt tilts an element toward the pointer while it is pressed. */
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const press = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--mm-tilt-x", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--mm-tilt-y", `${(x * 10).toFixed(2)}deg`);
    el.dataset.pressed = "true";
  };
  const release = () => {
    const el = ref.current;
    if (el) delete el.dataset.pressed;
  };
  return { ref, onPointerDown: press, onPointerUp: release, onPointerLeave: release, onPointerCancel: release };
}

interface TileProps {
  /** tone is which of the theme's tile colours fills the tile, 1 to 4. */
  tone: 1 | 2 | 3 | 4;
  title: string;
  /** caption sits at the bottom: a count, a hint. */
  caption?: string;
  size?: "small" | "wide" | "large";
  onClick?: () => void;
  href?: string;
  children?: ComponentChildren;
  label?: string;
}

export function Tile({ tone, title, caption, size = "small", onClick, children, label }: TileProps) {
  const tilt = useTilt<HTMLButtonElement>();
  return (
    <button
      type="button"
      class={`mm-tile mm-tile-${size}`}
      data-tone={tone}
      onClick={onClick}
      aria-label={label}
      {...tilt}
    >
      {children}
      <span class="mm-tile-title">{title.toLocaleLowerCase()}</span>
      {caption && <span class="mm-tile-caption">{caption}</span>}
    </button>
  );
}

interface ArtTileProps {
  image?: string;
  title: string;
  subtitle?: string;
  source: Source;
  round?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
  onMenu?: (e: MouseEvent) => void;
  active?: boolean;
}

/** ArtTile is the artwork of an album, a playlist, an artist or a track, with its name. */
export function ArtTile({ image, title, subtitle, source, round, onOpen, onPlay, onMenu, active }: ArtTileProps) {
  const tilt = useTilt<HTMLDivElement>();
  const open = (e: TargetedMouseEvent<HTMLElement>) => {
    e.preventDefault();
    onOpen();
  };
  return (
    <div class="mm-art-tile" data-round={round || undefined} data-active={active || undefined} onContextMenu={onMenu}>
      <div class="mm-art-frame" {...tilt}>
        {image ? (
          <img class="mm-artwork" src={image} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <div class="mm-artwork mm-artwork-empty" aria-hidden="true">
            <Icon name="disc" size={36} />
          </div>
        )}
        <button type="button" class="mm-art-open" onClick={open} aria-label={`Open ${title}`} />
        {onPlay && (
          <button
            type="button"
            class="mm-art-play"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            aria-label={`Play ${title}`}
          >
            <Icon name="play" size={18} />
          </button>
        )}
      </div>
      <div class="mm-art-text">
        <button type="button" class="mm-art-title mm-ellipsis" onClick={open} title={title}>
          {title}
        </button>
        <div class="mm-art-subtitle">
          <SourceMark source={source} />
          <span class="mm-ellipsis">{subtitle}</span>
        </div>
      </div>
    </div>
  );
}
