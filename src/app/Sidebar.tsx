// The sidebar: where to go, the user's mixes, what plugins add, and a live
// tile of what plays.
import { Icon, RawIcon, type IconName } from "../components/Icon";
import { likedIds, mixes, createMix } from "../state/library";
import { navigate, section, current, href } from "../lib/router";
import { sidebarItems } from "../plugins/contributions";
import { prompt, toast } from "../state/ui";
import { update } from "../state/settings";
import { narrowWindow, sidebarCollapsed, sidebarOverride } from "../theme/theme";
import { artwork, artists, plural } from "../lib/format";
import { currentTrack, playing, upNext } from "../player/player";

const nav: { id: string; label: string; icon: IconName; path: string }[] = [
  { id: "home", label: "home", icon: "home", path: "/" },
  { id: "search", label: "search", icon: "search", path: "/search" },
  { id: "library", label: "library", icon: "library", path: "/library" },
  { id: "stats", label: "stats", icon: "stats", path: "/stats" },
  { id: "marketplace", label: "marketplace", icon: "store", path: "/marketplace" },
  { id: "settings", label: "settings", icon: "settings", path: "/settings" },
];

function go(e: MouseEvent, path: string) {
  e.preventDefault();
  navigate(path);
}

export function Sidebar() {
  const active = section.value;
  const path = current.value.path;
  const collapsed = sidebarCollapsed.value;
  return (
    <nav class="mm-sidebar" aria-label="MixMusic">
      <div class="mm-brand">
        <svg class="mm-brand-mark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <circle cx="12" cy="16" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4" />
          <circle cx="20" cy="16" r="8.5" fill="none" stroke="var(--mm-accent)" stroke-width="2.4" />
        </svg>
        <span class="mm-brand-name">mixmusic</span>
        <button
          type="button"
          class="mm-icon-button mm-collapse"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          onClick={() => (narrowWindow.value ? (sidebarOverride.value = !collapsed) : void update({ sidebarCollapsed: !collapsed }))}
        >
          <Icon name="sidebar" size={18} />
        </button>
      </div>

      <ul class="mm-nav">
        {nav.map((n) => (
          <li key={n.id}>
            <a
              href={n.path}
              class="mm-nav-item"
              aria-current={(n.id === active || (n.id === "home" && path === "/")) ? "page" : undefined}
              onClick={(e) => go(e, n.path)}
              title={collapsed ? n.label : undefined}
            >
              <span class="mm-nav-box">
                <Icon name={n.icon} size={20} />
              </span>
              <span class="mm-nav-label">{n.label}</span>
            </a>
          </li>
        ))}
        {sidebarItems.value.map((item) => (
          <li key={item.id}>
            <a
              href={item.path}
              class="mm-nav-item"
              aria-current={path === item.path ? "page" : undefined}
              onClick={(e) => go(e, item.path)}
              title={collapsed ? item.label : undefined}
            >
              <span class="mm-nav-box">{item.icon ? <RawIcon svg={item.icon} /> : <Icon name="puzzle" size={20} />}</span>
              <span class="mm-nav-label">{item.label.toLocaleLowerCase()}</span>
            </a>
          </li>
        ))}
      </ul>

      <section class="mm-side-section" aria-labelledby="mm-mixes-title">
        <header class="mm-side-head">
          <h2 id="mm-mixes-title">your mixes</h2>
          <button
            type="button"
            class="mm-icon-button"
            aria-label="New mix"
            onClick={async () => {
              const title = await prompt("New mix", "Name", "", "create");
              if (title) {
                const p = await createMix(title);
                toast(`Created ${title}: add tracks of any service to it`);
                navigate(href.playlist(p.id));
              }
            }}
          >
            <Icon name="plus" size={18} />
          </button>
        </header>
        <ul class="mm-side-list">
          <li>
            <a
              href="/library/liked"
              class="mm-side-link"
              aria-current={path === "/library/liked" ? "page" : undefined}
              onClick={(e) => go(e, "/library/liked")}
            >
              <span class="mm-ellipsis">liked songs</span>
              <span class="mm-side-count mm-num">{likedIds.value.size}</span>
            </a>
          </li>
          {mixes.value.map((m) => (
            <li key={m.id}>
              <a
                href={href.playlist(m.id)}
                class="mm-side-link"
                aria-current={path === href.playlist(m.id) ? "page" : undefined}
                onClick={(e) => go(e, href.playlist(m.id))}
                title={`${m.title} · ${plural(m.trackCount ?? 0, "track")}`}
              >
                <span class="mm-ellipsis">{m.title}</span>
                <span class="mm-side-count mm-num">{m.trackCount ?? 0}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <LiveTile />
    </nav>
  );
}

/** LiveTile shows what plays, and flips over to show what plays next. */
function LiveTile() {
  const t = currentTrack.value;
  const next = upNext.value;
  if (!t) {
    return (
      <div class="mm-live mm-live-idle">
        <span class="mm-live-hint">nothing playing yet</span>
      </div>
    );
  }
  const art = artwork(t.artwork, 300);
  const flips = playing.value && next && next.track.id !== t.id;
  return (
    <a
      href="/now-playing"
      class="mm-live"
      data-flip={flips || undefined}
      onClick={(e) => go(e, "/now-playing")}
      aria-label={`Now playing: ${t.title} by ${artists(t.artists)}. Open now playing.`}
    >
      <div class="mm-live-card">
        <div class="mm-live-face mm-live-front">
          {art ? <img src={art} alt="" class="mm-artwork" /> : <span class="mm-artwork-empty" />}
          <span class="mm-live-label">now playing</span>
        </div>
        <div class="mm-live-face mm-live-back">
          <span class="mm-live-label">up next</span>
          <span class="mm-live-next">{next?.track.title}</span>
          <span class="mm-live-sub">{next ? artists(next.track.artists) : ""}</span>
        </div>
      </div>
      <div class="mm-live-text">
        <span class="mm-live-title mm-ellipsis">{t.title}</span>
        <span class="mm-live-sub mm-ellipsis">{artists(t.artists)}</span>
      </div>
    </a>
  );
}
