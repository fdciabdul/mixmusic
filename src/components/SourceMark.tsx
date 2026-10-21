// Where a track comes from, as a mark whose form differs by service, so it
// reads in any theme and without colour: a disc for Spotify, a square for
// YouTube Music, two rings for MixMusic's own mixes.
import type { Source } from "../mygo";
import { sourceName } from "../lib/format";

export function SourceMark({ source, label }: { source: Source; label?: boolean }) {
  const name = sourceName(source);
  return (
    <span class="mm-source" data-source={source} title={name}>
      {source === "spotify" && (
        <svg class="mm-source-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="currentColor" />
          <g fill="none" stroke="#000" stroke-linecap="round" stroke-width="1.9">
            <path d="M5.6 9c4.3-1.3 9.5-.9 13.2 1.4" />
            <path d="M6.4 12.5c3.6-1 7.8-.6 10.9 1.3" />
            <path d="M7.3 15.8c2.9-.8 5.9-.5 8.5 1" />
          </g>
        </svg>
      )}
      {source === "youtube" && (
        <svg class="mm-source-logo" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="currentColor" />
          <circle cx="12" cy="12" r="6.6" fill="none" stroke="#fff" stroke-width="1.5" />
          <path d="M10 8.7 15.4 12 10 15.3z" fill="#fff" />
        </svg>
      )}
      <svg class="mm-source-mark" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        {source === "spotify" && <circle cx="5" cy="5" r="4.2" fill="currentColor" />}
        {source === "youtube" && <rect x="1" y="1" width="8" height="8" fill="currentColor" />}
        {source === "local" && (
          <g fill="none" stroke="currentColor" stroke-width="1.3">
            <circle cx="3.6" cy="5" r="2.8" />
            <circle cx="6.4" cy="5" r="2.8" />
          </g>
        )}
      </svg>
      {label ? <span>{name}</span> : <span class="mm-source-name mm-visually-hidden">{name}</span>}
    </span>
  );
}
