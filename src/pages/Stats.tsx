// Stats: what the user listened to. Artists rank as circles on one fixed
// size ramp, and the share of each service shows as two overlapping rings.
import { useState } from "preact/hooks";
import { PageHeader } from "../components/PageHeader";
import { TrackList } from "../components/TrackList";
import { Loading, Empty } from "../components/States";
import { Collection, type DayPlays, type Stats as StatsData } from "../mygo";
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
      <DayChart days={s.daily} />
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

/** niceCeil rounds a value up to a clean tick: 1, 2, 2.5 or 5 times a power of ten. */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** dayOf reads a "2026-10-19" date as that day of the user's time zone. */
function dayOf(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

/** DayChart draws the minutes listened each day as columns in the accent, one per day. */
function DayChart({ days }: { days: DayPlays[] }) {
  const [active, setActive] = useState<number | null>(null);
  const n = days.length;
  if (n === 0) return null;
  const top = niceCeil(Math.max(...days.map((d) => d.minutes)));
  const peak = days.reduce((best, d, i) => (d.minutes > days[best]!.minutes ? i : best), 0);
  const every = n <= 7 ? 1 : n <= 31 ? 7 : 15;
  const height = (d: DayPlays) => (top > 0 ? (d.minutes / top) * 100 : 0);
  const describe = (d: DayPlays) => `${longDay.format(dayOf(d.date))}: ${d.minutes} min, ${plural(d.plays, "play")}`;
  const move = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n };
    const step = keys[e.key];
    if (step === undefined) return;
    e.preventDefault();
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + step)));
  };
  const tip = active === null ? null : days[active]!;
  return (
    <section class="mm-section">
      <h2 class="mm-section-title">day by day</h2>
      <p class="mm-hint">Minutes listened each day.</p>
      <div
        class="mm-days"
        tabIndex={0}
        role="group"
        aria-label="Minutes listened each day. The arrow keys go from day to day."
        onKeyDown={move}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        style={{ "--mm-days": String(n) }}
      >
        <span class="mm-days-tick mm-num">{top} min</span>
        <div class="mm-days-plot" onPointerLeave={() => setActive(null)}>
          {days.map((d, i) => (
            <div key={d.date} class="mm-day" data-active={i === active || undefined} onPointerEnter={() => setActive(i)}>
              <span class="mm-day-bar" style={{ height: `${height(d)}%` }} />
              {i === peak && d.minutes > 0 && (
                <span class="mm-day-value mm-num" style={{ bottom: `${height(d)}%` }}>
                  {d.minutes} min
                </span>
              )}
            </div>
          ))}
        </div>
        <div class="mm-days-axis" aria-hidden="true">
          {days.map((d, i) => (
            <span key={d.date}>
              {i === n - 1 ? "today" : (n - 1 - i) % every === 0 ? (n <= 7 ? weekday.format(dayOf(d.date)) : dayMonth.format(dayOf(d.date))) : ""}
            </span>
          ))}
        </div>
        {tip && (
          <div class="mm-days-tip" role="status" style={{ left: `${Math.min(0.9, Math.max(0.1, (active! + 0.5) / n)) * 100}%` }}>
            {describe(tip)}
          </div>
        )}
      </div>
      <details class="mm-days-table">
        <summary>show as a table</summary>
        <table class="mm-table">
          <thead>
            <tr>
              <th>day</th>
              <th>minutes</th>
              <th>plays</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.date}>
                <td>{longDay.format(dayOf(d.date))}</td>
                <td class="mm-num">{d.minutes}</td>
                <td class="mm-num">{d.plays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
