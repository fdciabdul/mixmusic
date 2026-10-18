// The user's settings, kept by the Go side and shared by every window.
import { signal } from "@preact/signals";
import { events, Preferences, type Settings } from "../mygo";

export const settings = signal<Settings | null>(null);

/** loadSettings reads the settings and follows their changes. */
export async function loadSettings(): Promise<Settings> {
  settings.value = await Preferences.get();
  events.settingsChanged.on((s) => (settings.value = s));
  return settings.value;
}

/** current returns the settings; loadSettings must have run. */
export function current(): Settings {
  const s = settings.value;
  if (!s) throw new Error("settings are not loaded");
  return s;
}

let pending: Promise<Settings> | null = null;
let queued: Partial<Settings> = {};

/**
 * update changes some settings. Changes made while one is saving are
 * merged into the next save, so quick changes such as dragging a slider
 * never overwrite each other.
 */
export function update(patch: Partial<Settings>): Promise<Settings> {
  const base = current();
  settings.value = { ...base, ...patch }; // show it at once
  queued = { ...queued, ...patch };
  if (pending) return pending;
  pending = (async () => {
    try {
      let saved = current();
      while (Object.keys(queued).length > 0) {
        const next = { ...saved, ...queued };
        queued = {};
        saved = await Preferences.set(next);
      }
      settings.value = saved;
      return saved;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
