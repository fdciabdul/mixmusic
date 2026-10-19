// Explore: what is new on YouTube Music, its charts, and its moods and
// genres, each opening on playlists of its own.
import { PageHeader } from "../components/PageHeader";
import { Shelves } from "../components/Shelf";
import { Tile } from "../components/Tile";
import { LoadingTiles, Problem } from "../components/States";
import { Catalog, type Shelf } from "../mygo";
import { useAsync } from "../lib/async";
import { navigate } from "../lib/router";

const tabs = [
  { id: "new", label: "new" },
  { id: "charts", label: "charts" },
  { id: "moods", label: "moods & genres" },
];

/** moodHref is the page of a mood or a genre. */
export const moodHref = (params: string) => `/mood/${encodeURIComponent(params)}`;

export function Explore({ tab }: { tab?: string }) {
  const active = tabs.find((t) => t.id === tab)?.id ?? "new";
  return (
    <div class="mm-page">
      <PageHeader title="explore" active={active} pivots={tabs} onPivot={(id) => navigate(`/explore/${id}`, { replace: true })} />
      {active === "new" && <ShelvesOf load={() => Catalog.explore()} what="what is new" />}
      {active === "charts" && <ShelvesOf load={() => Catalog.charts()} what="the charts" />}
      {active === "moods" && <Moods />}
    </div>
  );
}

function ShelvesOf({ load, what }: { load: () => Promise<Shelf[]>; what: string }) {
  const res = useAsync(load, [what]);
  if (res.error) return <Problem title={`Couldn't load ${what}`} message={res.error} action={{ label: "try again", run: res.reload }} />;
  if (!res.data) return <Loading />;
  if (res.data.length === 0) return <p class="mm-empty-line">YouTube Music shows nothing here right now.</p>;
  return <Shelves shelves={res.data} />;
}

function Moods() {
  const res = useAsync(() => Catalog.moods(), []);
  if (res.error) return <Problem title="Couldn't load the moods and genres" message={res.error} action={{ label: "try again", run: res.reload }} />;
  if (!res.data) return <Loading />;
  let n = 0;
  return (
    <>
      {res.data.map((g) => (
        <section class="mm-section" key={g.title}>
          <h2 class="mm-section-title">{g.title.toLocaleLowerCase()}</h2>
          <div class="mm-mood-grid">
            {g.moods.map((m) => (
              <Tile
                key={m.params}
                tone={((n++ % 4) + 1) as 1 | 2 | 3 | 4}
                title={m.title.toLocaleLowerCase()}
                label={`Playlists for ${m.title}`}
                onClick={() => navigate(moodHref(m.params))}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** MoodPage shows the playlists of a mood or a genre. */
export function MoodPage({ params }: { params: string }) {
  const res = useAsync(() => Catalog.mood(params), [params]);
  if (res.error) {
    return (
      <div class="mm-page">
        <PageHeader title="mood" />
        <Problem title="Couldn't open this mood" message={res.error} action={{ label: "try again", run: res.reload }} />
      </div>
    );
  }
  return (
    <div class="mm-page">
      <PageHeader title={res.data?.title.toLocaleLowerCase() || "mood"} />
      {res.data ? <Shelves shelves={res.data.shelves} /> : <Loading />}
    </div>
  );
}

function Loading() {
  return (
    <>
      <section class="mm-shelf">
        <LoadingTiles />
      </section>
      <section class="mm-shelf">
        <LoadingTiles />
      </section>
    </>
  );
}
