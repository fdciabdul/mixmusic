// The app shell and its routes.
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PlayerBar } from "./PlayerBar";
import { SidePanel } from "./SidePanel";
import { ContextMenu, Dialog, Toasts } from "../components/Overlays";
import { CommandPalette } from "../components/CommandPalette";
import { current, match } from "../lib/router";
import { sidePanel } from "../state/ui";
import { Home } from "../pages/Home";
import { Search } from "../pages/Search";
import { AlbumPage, ArtistPage, PlaylistPage } from "../pages/Collections";
import { Library } from "../pages/Library";
import { Stats } from "../pages/Stats";
import { NowPlaying } from "../pages/NowPlaying";
import { Settings } from "../pages/Settings";
import { Marketplace } from "../pages/Marketplace";
import { Explore, MoodPage } from "../pages/Explore";
import { NotFound, PluginPage } from "../pages/Other";
import type { ComponentChildren } from "preact";

type Route = [pattern: string, render: (params: Record<string, string>) => ComponentChildren];

const routes: Route[] = [
  ["/", () => <Home />],
  ["/search", () => <Search />],
  ["/explore", () => <Explore />],
  ["/explore/:tab", (p) => <Explore tab={p["tab"]} />],
  ["/mood/:params", (p) => <MoodPage params={p["params"]!} />],
  ["/album/:id", (p) => <AlbumPage id={p["id"]!} />],
  ["/artist/:id", (p) => <ArtistPage id={p["id"]!} />],
  ["/playlist/:id", (p) => <PlaylistPage id={p["id"]!} />],
  ["/library", () => <Library />],
  ["/library/:tab", (p) => <Library tab={p["tab"]} />],
  ["/stats", () => <Stats />],
  ["/now-playing", () => <NowPlaying />],
  ["/settings", () => <Settings />],
  ["/settings/:tab", (p) => <Settings tab={p["tab"]} />],
  ["/marketplace", () => <Marketplace />],
  ["/marketplace/:tab", (p) => <Marketplace tab={p["tab"]} />],
  ["/plugin/*", (p) => <PluginPage path={`/plugin/${p["*"]}`} />],
];

function Page() {
  const path = current.value.path;
  for (const [pattern, render] of routes) {
    const params = match(pattern, path);
    if (params) return <>{render(params)}</>;
  }
  return <NotFound />;
}

export function App() {
  const path = current.value.path;
  // Pages of the same kind keep their scroll; another page starts at the top.
  const key = path === "/search" ? `${path}?${current.value.query.get("q") ?? ""}` : path;
  return (
    <div class="mm-app" data-panel={sidePanel.value ?? "none"}>
      <Sidebar />
      <TopBar />
      <main class="mm-main mm-scroll" id="mm-main" key={key}>
        <Page />
      </main>
      <SidePanel />
      <PlayerBar />
      <ContextMenu />
      <Dialog />
      <CommandPalette />
      <Toasts />
    </div>
  );
}
