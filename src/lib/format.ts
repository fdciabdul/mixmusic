// Formatting of durations, counts and artwork.
import type { Image, Ref, Source, Track } from "../mygo";

/** duration formats milliseconds as 3:28 or 1:02:03. */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** longDuration formats milliseconds as "1 hr 12 min" or "42 min". */
export function longDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr ${min % 60} min`;
}

/** plural writes a count with its noun: "1 track", "12 tracks". */
export function plural(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** artists joins the names of artists. */
export const artists = (refs: Ref[] | undefined): string => (refs ?? []).map((a) => a.name).join(", ");

/** artwork picks the smallest image at least size pixels wide, else the largest. */
export function artwork(images: Image[] | undefined, size: number): string | undefined {
  if (!images || images.length === 0) return undefined;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= size) ?? sorted[sorted.length - 1])?.url;
}

/** sourceName names a service. */
export function sourceName(source: Source): string {
  switch (source) {
    case "spotify":
      return "Spotify";
    case "youtube":
      return "YouTube Music";
    default:
      return "MixMusic";
  }
}

/** trackLine is "Title — Artist", for tooltips and notices. */
export const trackLine = (t: Track): string => `${t.title} — ${artists(t.artists)}`;

/** bytes formats a size as "512 MB". */
export function bytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** errorMessage returns the text of anything thrown. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong";
}
