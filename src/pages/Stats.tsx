// Stats: what the user listened to. Artists rank as circles on one fixed
// size ramp, and the share of each service shows as two overlapping rings.
import { useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { TrackList } from "../components/TrackList";
import { Loading, Empty } from "../components/States";
import { Collection, type Stats as StatsData } from "../mygo";
import { useAsync } from "../lib/async";
import { href, navigate } from "../lib/router";
import { plural } from "../lib/format";
import { playTracks } from "../player/player";

const ranges = [
  { id: "7", label: "this week" },
  { id: "30", label: "this month" },
  { id: "0", label: "all time" },
];

export function Stats() {
  const [range, setRange] = useState("7");
  const res = useAsync(() => Collection.stats(Number(range)), [range]);
  const s = res.data;
  return (
    <div class="mm-page">
      <PageHeader title="stats" active={range} onPivot={setRange} pivots={ranges} />
      {!s && <Loading />}
      {s && s.plays === 0 && <Empty title="nothing counted yet" message="Tracks count once they played for thirty seconds." />}
      {s && s.plays > 0 && <Summary s={s} />}
    </div>
  );
}

/** radius maps plays to a circle's radius on the fixed ramp: the area grows with the plays. */
const radius = (plays: number, max: number) => 14 + 46 * Math.sqrt(plays / Math.max(max, 1));

function Summary({ s }: { s: StatsData }) {
  const hours = Math.floor(s.minutes / 60);
  const time = hours > 0 ? `${hours} hr ${s.minutes % 60} min` : `${s.minutes} min`;
  const top = s.topArtists[0]?.plays ?? 1;
  const tracks = s.topTracks.map((t) => t.track);
  return (
    <>
      <p class="mm-stats-line">
        You played <strong>{plural(s.plays, "track")}</strong> for <strong>{time}</strong>:{" "}
        <span class="mm-stats-spotify">{s.spotify} from Spotify</span> and{" "}
        <span class="mm-stats-youtube">{s.youtube} from YouTube Music</span>.
      </p>
      <div class="mm-stats-grid">
        <section class="mm-section">
          <h2 class="mm-section-title">the mix</h2>
          <Venn spotify={s.spotify} youtube={s.youtube} />
        </section>
        <section class="mm-section">
          <h2 class="mm-section-title">top artists</h2>
          <div class="mm-stats-artists">
            {s.topArtists.map((a, i) => {
              const r = radius(a.plays, top);
              return (
                <button
                  key={a.artist.name}
                  type="button"
                  class="mm-stats-artist"
                  data-tone={(i % 4) + 1}
                  style={{ width: `${r * 2}px`, height: `${r * 2}px` }}
                  disabled={!a.artist.id}
                  onClick={() => a.artist.id && navigate(href.artist(a.artist.id))}
                  title={`${a.artist.name}: ${plural(a.plays, "play")}`}
                >
                  <span class="mm-ellipsis">{a.artist.name}</span>
                  <span class="mm-num">{a.plays}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <section class="mm-section">
        <h2 class="mm-section-title">top tracks</h2>
        <TrackList tracks={tracks} play={(i) => void playTracks(tracks, i)} showArt />
      </section>
    </>
  );
}

/** Venn draws the plays of each service as rings whose areas match, overlapping like the icon. */
function Venn({ spotify, youtube }: { spotify: number; youtube: number }) {
  const max = Math.max(spotify, youtube, 1);
  const rs = 20 + 70 * Math.sqrt(spotify / max);
  const ry = 20 + 70 * Math.sqrt(youtube / max);
  const w = 300;
  const cy = 100;
  return (
    <svg class="mm-venn" viewBox={`0 0 ${w} 200`} role="img" aria-label={`${spotify} plays from Spotify, ${youtube} from YouTube Music`}>
      <circle cx={w / 2 - rs * 0.55} cy={cy} r={rs} class="mm-venn-spotify" />
      <circle cx={w / 2 + ry * 0.55} cy={cy} r={ry} class="mm-venn-youtube" />
      <text x={w / 2 - rs * 0.55} y={cy} class="mm-venn-label">
        {spotify}
      </text>
      <text x={w / 2 + ry * 0.55} y={cy} class="mm-venn-label">
        {youtube}
      </text>
    </svg>
  );
}
