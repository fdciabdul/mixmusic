// The theme engine: it turns a theme manifest and the user's appearance
// settings into the --mm-* variables, data-opt-* attributes and the theme's
// stylesheet that the whole interface is drawn from.
import { computed, effect, signal } from "@preact/signals";
import { Addons, events, System, type Inventory, type Settings, type Theme } from "../mygo";
import { settings } from "../state/settings";
import { artwork } from "../lib/format";
import { inkOn, parseHex, readableOn, toHex } from "./color";

export const inventory = signal<Inventory>({ themes: [], plugins: [], problems: [] });

export const themes = computed(() => inventory.value.themes);

// The computer's appearance, for themes that follow it.
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
export const systemDark = signal(darkQuery.matches);
darkQuery.addEventListener("change", (e) => (systemDark.value = e.matches));

/** themeIdOf returns the theme the settings show now: theirs, or the light or dark one of the computer's appearance. */
export function themeIdOf(s: Settings | null): string {
  if (!s) return "mix";
  if (!s.followSystem) return s.theme;
  return systemDark.value ? s.darkTheme : s.lightTheme;
}

/** themePatch is the change of settings that shows a theme: the theme itself, or the one of the mode the computer is in. */
export function themePatch(s: Settings | null, id: string): Partial<Settings> {
  if (!s?.followSystem) return { theme: id };
  return systemDark.value ? { darkTheme: id } : { lightTheme: id };
}

/** activeTheme is the theme of the settings, or the default. */
export const activeTheme = computed<Theme | null>(() => {
  const id = themeIdOf(settings.value);
  const list = themes.value;
  return list.find((t) => t.id === id) ?? list.find((t) => t.id === "mix") ?? list[0] ?? null;
});

/** artworkAccent is the colour of the artwork playing, when the theme follows it. */
export const artworkAccent = signal<string | null>(null);

// Narrow windows fold the sidebar to its icons, unless the user unfolds it.
const narrowQuery = matchMedia("(max-width: 1180px)");
export const narrowWindow = signal(narrowQuery.matches);
narrowQuery.addEventListener("change", (e) => {
  narrowWindow.value = e.matches;
  sidebarOverride.value = null;
});

/** sidebarOverride is the user unfolding or folding the sidebar of a narrow window. */
export const sidebarOverride = signal<boolean | null>(null);

/** sidebarCollapsed is whether the sidebar shows as icons only. */
export const sidebarCollapsed = computed(
  () => sidebarOverride.value ?? ((settings.value?.sidebarCollapsed ?? false) || narrowWindow.value),
);

export async function loadInventory(): Promise<Inventory> {
  inventory.value = await Addons.list();
  events.addonsChanged.on((inv) => (inventory.value = inv));
  return inventory.value;
}

/** optionValues returns the values of a theme's options, defaults included. */
export function optionValues(theme: Theme, s: Settings): Record<string, string> {
  const chosen = s.themeOptions?.[theme.id] ?? {};
  const out: Record<string, string> = {};
  for (const o of theme.options) out[o.id] = chosen[o.id] ?? o.default;
  return out;
}

let appliedOptions: string[] = [];

/** apply puts a theme and the appearance settings on the root element. */
function apply(theme: Theme, s: Settings, dynamic: string | null): void {
  const root = document.documentElement;
  const style = root.style;
  for (const [key, value] of Object.entries(theme.colors)) style.setProperty(`--mm-${key}`, value);
  const fonts = theme.fonts;
  const setOrClear = (name: string, value: string | undefined) =>
    value ? style.setProperty(name, value) : style.removeProperty(name);
  setOrClear("--mm-font-body", fonts.body);
  setOrClear("--mm-font-display", fonts.display || fonts.body);
  setOrClear("--mm-font-mono", fonts.mono);
  setOrClear("--mm-radius", theme.radius);
  root.style.colorScheme = theme.scheme;
  root.dataset.theme = theme.id;
  root.dataset.scheme = theme.scheme;
  root.dataset.density = s.density;
  style.setProperty("--mm-font-scale", String(s.fontScale || 1));

  // The accent: the artwork's, the user's, or the theme's.
  const bg = parseHex(theme.colors["bg"] ?? "") ?? { r: 0, g: 0, b: 0 };
  const pick = (s.dynamicAccent && dynamic) || s.accent || "";
  const rgb = parseHex(pick);
  if (rgb) {
    const readable = readableOn(rgb, bg);
    style.setProperty("--mm-accent", toHex(readable));
    style.setProperty("--mm-accent-text", inkOn(readable));
  }

  // Options, as attributes and variables themes style with.
  for (const id of appliedOptions) {
    delete root.dataset[optKey(id)];
    style.removeProperty(`--opt-${id}`);
  }
  appliedOptions = [];
  const values = optionValues(theme, s);
  for (const o of theme.options) {
    const v = values[o.id] ?? o.default;
    root.dataset[optKey(o.id)] = v;
    style.setProperty(`--opt-${o.id}`, o.type === "range" ? `${v}${o.unit ?? ""}` : v);
    appliedOptions.push(o.id);
  }

  // The theme's stylesheet, then the user's own CSS on top.
  sheet("mm-theme-css", theme.styles ? `${theme.baseUrl}${theme.styles}?v=${encodeURIComponent(theme.version)}` : null);
  let custom = document.getElementById("mm-custom-css") as HTMLStyleElement | null;
  if (!custom) {
    custom = document.createElement("style");
    custom.id = "mm-custom-css";
    document.head.append(custom);
  }
  if (custom.textContent !== s.customCss) custom.textContent = s.customCss;
}

/** optKey turns an option ID into its dataset key: "white-tiles" → "optWhiteTiles". */
const optKey = (id: string) => "opt" + id.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

function sheet(id: string, href: string | null): void {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    // After the app's styles, before the user's own CSS.
    const custom = document.getElementById("mm-custom-css");
    document.head.insertBefore(link, custom);
  }
  if (link.getAttribute("href") !== href) link.href = href;
}

/** initTheme applies the theme now and whenever it or the settings change. */
export function initTheme(currentArtwork: () => string | undefined): void {
  effect(() => {
    const t = activeTheme.value;
    const s = settings.value;
    if (t && s) apply(t, s, artworkAccent.value);
  });
  effect(() => {
    document.documentElement.dataset.sidebar = sidebarCollapsed.value ? "collapsed" : "expanded";
  });
  let lastUrl: string | undefined;
  effect(() => {
    const url = currentArtwork();
    const follow = settings.value?.dynamicAccent ?? false;
    if (!follow || !url) {
      if (!url) artworkAccent.value = null;
      return;
    }
    if (url === lastUrl) return;
    lastUrl = url;
    System.artworkColor(url).then(
      (c) => url === lastUrl && (artworkAccent.value = c),
      () => url === lastUrl && (artworkAccent.value = null),
    );
  });
}

/** smallArtwork picks the artwork the accent is taken from. */
export const accentArtwork = (images: Parameters<typeof artwork>[0]) => artwork(images, 120);
