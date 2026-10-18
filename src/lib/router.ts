// A small router on the history API: the current path is a signal, and
// pages are matched against patterns such as "/album/:id".
import { computed, signal } from "@preact/signals";

export interface Location {
  path: string;
  query: URLSearchParams;
}

function read(): Location {
  return { path: decodeURI(location.pathname) || "/", query: new URLSearchParams(location.search) };
}

export const current = signal<Location>(read());

/** canGoBack and canGoForward follow the app's own history. */
let depth = 0;
let maxDepth = 0;
export const canGoBack = signal(false);
export const canGoForward = signal(false);

function sync() {
  canGoBack.value = depth > 0;
  canGoForward.value = depth < maxDepth;
}

/** navigate shows the page at to, such as "/search?q=daft%20punk". */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = new URL(to, location.origin);
  const same = target.pathname === location.pathname && target.search === location.search;
  if (opts.replace || same) {
    history.replaceState({ depth }, "", target.pathname + target.search);
  } else {
    depth++;
    maxDepth = depth;
    history.pushState({ depth }, "", target.pathname + target.search);
  }
  current.value = read();
  sync();
}

export const back = (): void => history.back();
export const forward = (): void => history.forward();

addEventListener("popstate", (e) => {
  depth = typeof e.state?.depth === "number" ? e.state.depth : 0;
  current.value = read();
  sync();
});

/** match matches a path against a pattern, returning its parameters. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length && !pattern.endsWith("/*")) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const part = p[i]!;
    if (part === "*") {
      params["*"] = s.slice(i).join("/");
      return params;
    }
    const seg = s[i];
    if (seg === undefined) return null;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(seg);
    else if (part !== seg) return null;
  }
  return params;
}

/** section is the first segment of the path: "home", "search", "album"... */
export const section = computed(() => current.value.path.split("/")[1] || "home");

/** href builds the path of an item page. */
export const href = {
  album: (id: string) => `/album/${encodeURIComponent(id)}`,
  artist: (id: string) => `/artist/${encodeURIComponent(id)}`,
  playlist: (id: string) => `/playlist/${encodeURIComponent(id)}`,
  search: (q: string) => `/search?q=${encodeURIComponent(q)}`,
};
