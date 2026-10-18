// Where a track comes from, as a mark whose form differs by service, so it
// reads in any theme and without colour: a disc for Spotify, a square for
// YouTube Music, two rings for MixMusic's own mixes.
import type { Source } from "../mygo";
import { sourceName } from "../lib/format";

export function SourceMark({ source, label }: { source: Source; label?: boolean }) {
  const name = sourceName(source);
  return (
    <span class="mm-source" data-source={source} title={name}>
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        {source === "spotify" && <circle cx="5" cy="5" r="4.2" fill="currentColor" />}
        {source === "youtube" && <rect x="1" y="1" width="8" height="8" fill="currentColor" />}
        {source === "local" && (
          <g fill="none" stroke="currentColor" stroke-width="1.3">
            <circle cx="3.6" cy="5" r="2.8" />
            <circle cx="6.4" cy="5" r="2.8" />
          </g>
        )}
      </svg>
      {label ? <span>{name}</span> : <span class="mm-visually-hidden">{name}</span>}
    </span>
  );
}
