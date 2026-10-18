// The head of an album, a playlist or an artist: its artwork on a flat
// tile, the facts, and the actions.
import type { ComponentChildren } from "preact";
import { Icon } from "./Icon";
import { SourceMark } from "./SourceMark";
import type { Source } from "../mygo";

interface Props {
  image?: string;
  source: Source;
  facts: ComponentChildren[];
  onPlay?: () => void;
  onShuffle?: () => void;
  onMenu?: (el: HTMLElement) => void;
  playLabel?: string;
  description?: string;
  children?: ComponentChildren;
}

export function CollectionHead({ image, source, facts, onPlay, onShuffle, onMenu, playLabel = "play", description, children }: Props) {
  return (
    <div class="mm-collection">
      <div class="mm-collection-art">
        {image ? <img src={image} alt="" class="mm-artwork" /> : <span class="mm-artwork-empty" />}
      </div>
      <div class="mm-collection-info">
        <p class="mm-collection-facts">
          <span class="mm-collection-fact-line">
            <SourceMark source={source} label />
            {facts.filter(Boolean).map((f, i) => (
              <span key={i}>
                {" · "}
                {f}
              </span>
            ))}
          </span>
        </p>
        {description && <p class="mm-collection-description">{description}</p>}
        <div class="mm-actions">
          {onPlay && (
            <button type="button" class="mm-button mm-button-primary" onClick={onPlay}>
              {playLabel}
              <Icon name="play" size={16} />
            </button>
          )}
          {onShuffle && (
            <button type="button" class="mm-button mm-button-outline" onClick={onShuffle}>
              <Icon name="shuffle" size={16} />
              shuffle
            </button>
          )}
          {children}
          {onMenu && (
            <button
              type="button"
              class="mm-round"
              aria-label="More"
              onClick={(e) => onMenu(e.currentTarget as HTMLElement)}
            >
              <Icon name="more" size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
