// The player: one queue of tracks of every service, played by MixMusic's
// own audio engine or on a Spotify Connect device, as each track needs.
import { batch, computed, effect, signal } from "@preact/signals";
import {
  Catalog,
  Collection,
  events,
  Player,
  type PlaybackSource,
  type PlayerCommand,
  type Repeat,
  type Track,
} from "../mygo";
import { AudioEngine, type EngineEvents } from "./audio";
import { ConnectEngine } from "./connect";
import { settings, update as updateSettings } from "../state/settings";
import { isLiked, likedIds, toggleLiked } from "../state/library";
import { toast } from "../state/ui";
import { artwork, artists, errorMessage, trackLine } from "../lib/format";
import { debounce, local, throttle } from "../lib/async";
import { navigate } from "../lib/router";

export interface QueueItem {
  /** uid tells apart two entries of the same track. */
  uid: string;
  track: Track;
  /** radio is set for tracks autoplay added after the queue ran out. */
  radio?: boolean;
}

export type PlayerEvent = "trackchange" | "statechange" | "progress" | "queuechange";

// State.

export const queue = signal<QueueItem[]>([]);
export const index = signal(-1);
export const playing = signal(false);
export const buffering = signal(false);
/** position and duration are in milliseconds. */
export const position = signal(0);
export const duration = signal(0);
export const shuffle = signal(false);
export const repeat = signal<Repeat>("off");
export const volume = signal(0.8);
export const muted = signal(false);
export const error = signal<string | null>(null);
/** source is how the current track plays, once prepared. */
export const source = signal<PlaybackSource | null>(null);

export const currentItem = computed(() => queue.value[index.value] ?? null);
export const currentTrack = computed(() => currentItem.value?.track ?? null);
export const upNext = computed(() => {
  if (repeat.value === "one") return currentItem.value;
  const next = queue.value[index.value + 1];
  if (next) return next;
  return repeat.value === "all" ? (queue.value[0] ?? null) : null;
});

let uidSeq = 0;
const uid = () => `${Date.now().toString(36)}-${(++uidSeq).toString(36)}`;
const item = (track: Track, radio = false): QueueItem => ({ uid: uid(), track, radio });

// Plugins and other parts of the app subscribe to these.
const listeners = new Map<PlayerEvent, Set<() => void>>();
export function on(event: PlayerEvent, fn: () => void): () => void {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(fn);
  return () => set!.delete(fn);
}
function emit(event: PlayerEvent): void {
  for (const fn of listeners.get(event) ?? []) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

// Engines.

const engineEvents: EngineEvents = {
  time(pos, dur) {
    batch(() => {
      position.value = pos;
      if (dur > 0) duration.value = dur;
    });
    onProgress();
  },
  ended: () => void advance(true),
  error: (message) => void onStreamError(message),
  playing(p) {
    playing.value = p;
    report();
    emit("statechange");
  },
  buffering: (b) => (buffering.value = b),
};

const audio = new AudioEngine(engineEvents);
const connect = new ConnectEngine(engineEvents);

/** analyser exposes the audio for visualizers; null until playback starts. */
export const analyser = (): AnalyserNode | null => audio.analyser;

// Loading tracks.

let loadToken = 0;
let retried = "";
let counted = "";
let prefetched = "";
let crossfading = false;

/** playAt plays the queue's entry at i, from startMs. */
export async function playAt(i: number, startMs = 0, autoplay = true): Promise<void> {
  const entry = queue.value[i];
  if (!entry) return;
  const token = ++loadToken;
  batch(() => {
    index.value = i;
    position.value = startMs;
    duration.value = entry.track.durationMs;
    error.value = null;
    buffering.value = true;
    source.value = null;
  });
  emit("trackchange");
  report();
  try {
    let src = await Player.prepare(entry.track);
    if (token !== loadToken) return;
    if (src.mode === "connect") {
      audio.stop();
      try {
        await connect.play(entry.track, startMs);
        if (token !== loadToken) return;
        source.value = src;
        buffering.value = false;
        if (!autoplay) await connect.pause();
        return;
      } catch (err) {
        if (token !== loadToken) return;
        toast(`${errorMessage(err)} — playing it from YouTube Music instead`, {
          tone: "error",
          action: { label: "settings", run: () => navigate("/settings/playback") },
        });
        src = await Player.prepareStream(entry.track);
        if (token !== loadToken) return;
      }
    }
    connect.stop(false);
    source.value = src;
    await audio.load(src.url ?? "", startMs, autoplay);
  } catch (err) {
    if (token !== loadToken) return;
    fail(errorMessage(err));
  }
}

/** fail reports a track that cannot play, and moves on after a moment. */
function fail(message: string): void {
  const t = currentTrack.value;
  batch(() => {
    error.value = message;
    buffering.value = false;
    playing.value = false;
  });
  emit("statechange");
  toast(t ? `Couldn't play ${t.title}: ${message}` : message, { tone: "error" });
  const token = loadToken;
  if (index.value < queue.value.length - 1) {
    setTimeout(() => token === loadToken && void advance(false), 2500);
  }
}

/** onStreamError retries a stream once, freshly resolved, before failing. */
async function onStreamError(message: string): Promise<void> {
  const entry = currentItem.value;
  if (!entry) return;
  if (retried === entry.uid) return fail(message);
  retried = entry.uid;
  const token = loadToken;
  const at = position.value;
  try {
    const src = await Player.prepareStream(entry.track);
    if (token !== loadToken) return;
    source.value = src;
    await audio.load(`${src.url}?retry=${Date.now()}`, at);
  } catch (err) {
    if (token === loadToken) fail(errorMessage(err));
  }
}

/** onProgress counts the play, prefetches the next track, and crossfades. */
function onProgress(): void {
  const entry = currentItem.value;
  if (!entry) return;
  const pos = position.value;
  const dur = duration.value || entry.track.durationMs;
  if (counted !== entry.uid && pos >= Math.min(30000, dur / 2)) {
    counted = entry.uid;
    Collection.recordPlay(entry.track).catch(() => {});
  }
  const next = upNext.value;
  if (next && next.uid !== entry.uid && prefetched !== next.uid && pos > 10000) {
    prefetched = next.uid;
    Player.prepare(next.track)
      .then((src) => src.mode === "stream" && src.url && audio.preload(src.url))
      .catch(() => {});
  }
  const fade = settings.value?.crossfade ?? 0;
  if (
    fade > 0 &&
    !crossfading &&
    source.value?.mode === "stream" &&
    next &&
    next.uid !== entry.uid &&
    dur > 0 &&
    dur - pos <= fade * 1000 &&
    dur > fade * 3000
  ) {
    void crossfadeTo(next, fade);
  }
  reportProgress();
}

async function crossfadeTo(next: QueueItem, seconds: number): Promise<void> {
  crossfading = true;
  try {
    const src = await Player.prepare(next.track);
    if (src.mode !== "stream" || !src.url) return; // Connect tracks start when this one ends
    const i = queue.value.findIndex((q) => q.uid === next.uid);
    if (i < 0) return;
    const token = ++loadToken;
    batch(() => {
      index.value = i;
      position.value = 0;
      duration.value = next.track.durationMs;
      source.value = src;
      error.value = null;
    });
    emit("trackchange");
    report();
    await audio.crossfade(src.url, seconds);
    if (token !== loadToken) return;
  } catch {
    // The track starts normally when the current one ends.
  } finally {
    setTimeout(() => (crossfading = false), seconds * 1000);
  }
}

// Transport.

export async function play(): Promise<void> {
  if (!currentItem.value) {
    if (queue.value.length > 0) await playAt(0);
    return;
  }
  if (connect.active) return connect.resume();
  if (!audio.loaded || error.value) return playAt(index.value, position.value);
  await audio.play();
}

export async function pause(): Promise<void> {
  if (connect.active) return connect.pause();
  audio.pause();
}

export function toggle(): Promise<void> {
  return playing.value ? pause() : play();
}

export async function seek(ms: number): Promise<void> {
  const clamped = Math.max(0, Math.min(ms, duration.value || ms));
  position.value = clamped;
  if (connect.active) await connect.seek(clamped);
  else if (audio.loaded) audio.seek(clamped);
  else if (currentItem.value) await playAt(index.value, clamped, false);
  emit("progress");
}

/** next skips to the next track. */
export const next = (): Promise<void> => advance(false);

/** advance moves on from the current track: ended tells an end from a skip. */
async function advance(ended: boolean): Promise<void> {
  const q = queue.value;
  if (q.length === 0) return;
  if (ended && repeat.value === "one") return playAt(index.value);
  if (index.value < q.length - 1) return playAt(index.value + 1);
  if (repeat.value === "all") return playAt(0);
  if (settings.value?.autoplay && (await extendWithRadio())) return playAt(index.value + 1);
  if (ended) {
    batch(() => {
      playing.value = false;
      position.value = 0;
    });
    report();
    emit("statechange");
  }
}

/** extendWithRadio adds tracks like the last ones to the queue. */
async function extendWithRadio(): Promise<boolean> {
  const seed = currentTrack.value;
  if (!seed) return false;
  try {
    const seen = new Set(queue.value.map((q) => q.track.id));
    const tracks = (await Catalog.radio(seed)).filter((t) => !seen.has(t.id)).slice(0, 25);
    if (tracks.length === 0) return false;
    queue.value = [...queue.value, ...tracks.map((t) => item(t, true))];
    emit("queuechange");
    return true;
  } catch {
    return false;
  }
}

export async function previous(): Promise<void> {
  if (position.value > 3000 || index.value <= 0) {
    if (index.value <= 0 && repeat.value === "all" && queue.value.length > 1 && position.value <= 3000) {
      return playAt(queue.value.length - 1);
    }
    return seek(0);
  }
  return playAt(index.value - 1);
}

export function setVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  batch(() => {
    volume.value = clamped;
    muted.value = false;
  });
  apply();
  saveVolume(clamped);
}

export function toggleMute(): void {
  muted.value = !muted.value;
  apply();
}

function apply(): void {
  const v = muted.value ? 0 : volume.value;
  audio.setVolume(v);
  connect.setVolume(v);
  report();
}

const saveVolume = debounce((v: number) => {
  if (settings.value && settings.value.volume !== v) updateSettings({ volume: v }).catch(() => {});
}, 600);

export function toggleShuffle(): void {
  setShuffle(!shuffle.value);
}

let unshuffled: QueueItem[] | null = null;

export function setShuffle(on: boolean): void {
  if (on === shuffle.value) return;
  const cur = currentItem.value;
  if (on) {
    unshuffled = queue.value;
    const head = queue.value.slice(0, index.value + 1);
    const rest = queue.value.slice(index.value + 1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    queue.value = [...head, ...rest];
  } else if (unshuffled) {
    const present = new Set(queue.value.map((q) => q.uid));
    const kept = unshuffled.filter((q) => present.has(q.uid));
    const known = new Set(kept.map((q) => q.uid));
    queue.value = [...kept, ...queue.value.filter((q) => !known.has(q.uid))];
    unshuffled = null;
  }
  batch(() => {
    shuffle.value = on;
    if (cur) index.value = queue.value.findIndex((q) => q.uid === cur.uid);
  });
  emit("queuechange");
  report();
}

export function cycleRepeat(): void {
  repeat.value = repeat.value === "off" ? "all" : repeat.value === "all" ? "one" : "off";
  report();
}

// The queue.

/** playTracks replaces the queue with tracks and plays the one at start. */
export function playTracks(tracks: Track[], start = 0): Promise<void> {
  if (tracks.length === 0) return Promise.resolve();
  unshuffled = null;
  const items = tracks.map((t) => item(t));
  let first = Math.max(0, Math.min(start, items.length - 1));
  if (shuffle.value) {
    const chosen = items.splice(first, 1)[0]!;
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    items.unshift(chosen);
    first = 0;
    unshuffled = tracks.map((t, i) => (i === start ? chosen : items.find((x) => x.track === t)!));
  }
  queue.value = items;
  emit("queuechange");
  return playAt(first);
}

/** playNext puts tracks right after the current one. */
export function playNext(tracks: Track[]): void {
  const at = index.value + 1;
  const q = [...queue.value];
  q.splice(at, 0, ...tracks.map((t) => item(t)));
  queue.value = q;
  emit("queuechange");
  if (index.value < 0) void playAt(0);
}

/** enqueue adds tracks at the end of the queue, before tracks of the radio. */
export function enqueue(tracks: Track[]): void {
  const q = [...queue.value];
  let at = q.length;
  while (at > index.value + 1 && q[at - 1]?.radio) at--;
  q.splice(at, 0, ...tracks.map((t) => item(t)));
  queue.value = q;
  emit("queuechange");
}

export function removeAt(i: number): void {
  if (i === index.value) return;
  const q = [...queue.value];
  q.splice(i, 1);
  batch(() => {
    queue.value = q;
    if (i < index.value) index.value--;
  });
  emit("queuechange");
}

export function move(from: number, to: number): void {
  if (from === to) return;
  const q = [...queue.value];
  const [moved] = q.splice(from, 1);
  if (!moved) return;
  q.splice(to, 0, moved);
  const cur = currentItem.value;
  batch(() => {
    queue.value = q;
    if (cur) index.value = q.findIndex((x) => x.uid === cur.uid);
  });
  emit("queuechange");
}

/** clearUpcoming empties the queue after the current track. */
export function clearUpcoming(): void {
  queue.value = queue.value.slice(0, index.value + 1);
  emit("queuechange");
}

// Telling the rest of the app what plays.

function nowPlaying() {
  return {
    track: currentTrack.value,
    playing: playing.value,
    positionMs: Math.round(position.value),
    durationMs: Math.round(duration.value),
    volume: muted.value ? 0 : volume.value,
    shuffle: shuffle.value,
    repeat: repeat.value,
    liked: currentTrack.value ? isLiked(currentTrack.value.id) : false,
  };
}

function report(): void {
  Player.report(nowPlaying()).catch(() => {});
  updateMediaSession();
  persist();
}

const reportProgress = throttle(() => {
  Player.report(nowPlaying()).catch(() => {});
  emit("progress");
  if ("mediaSession" in navigator && duration.value > 0) {
    try {
      navigator.mediaSession.setPositionState({
        duration: duration.value / 1000,
        position: Math.min(position.value, duration.value) / 1000,
        playbackRate: 1,
      });
    } catch {
      // Positions past the duration throw; the next update fixes it.
    }
  }
  persist();
}, 1000);

function updateMediaSession(): void {
  if (!("mediaSession" in navigator)) return;
  const t = currentTrack.value;
  navigator.mediaSession.playbackState = playing.value ? "playing" : t ? "paused" : "none";
  if (!t) {
    navigator.mediaSession.metadata = null;
    return;
  }
  const art = artwork(t.artwork, 512);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: artists(t.artists),
    album: t.album?.name ?? "",
    artwork: art ? [{ src: art, sizes: "512x512" }] : [],
  });
}

// The queue survives restarts, without playing on its own.

interface Saved {
  tracks: Track[];
  index: number;
  position: number;
  shuffle: boolean;
  repeat: Repeat;
}

const persist = throttle(() => {
  local.set("mm.queue", {
    tracks: queue.value.slice(0, 500).map((q) => q.track),
    index: index.value,
    position: Math.round(position.value),
    shuffle: shuffle.value,
    repeat: repeat.value,
  } satisfies Saved);
}, 2000);

// Commands from the tray, media keys, the mini player and deep links.
// The media keys may reach the page both as a global shortcut and through
// the media session: a second toggle within a moment is the same press.
let lastToggle = 0;
function debouncedToggle(): void {
  const now = Date.now();
  if (now - lastToggle < 400) return;
  lastToggle = now;
  void toggle();
}

export function command(cmd: PlayerCommand): void {
  switch (cmd.command) {
    case "toggle":
      return debouncedToggle();
    case "play":
      return void play();
    case "pause":
      return void pause();
    case "next":
      return void next();
    case "previous":
      return void previous();
    case "seek":
      return void seek(cmd.value ?? 0);
    case "volume":
      return setVolume(cmd.value ?? volume.value);
    case "like": {
      const t = currentTrack.value;
      if (t) void toggleLiked(t).then(report);
      return;
    }
    case "shuffle":
      return toggleShuffle();
    case "repeat":
      return cycleRepeat();
    case "playTrack":
      if (cmd.trackId) void playById(cmd.trackId);
      return;
  }
}

/** playById plays a track known only by its ID, from a deep link. */
async function playById(id: string): Promise<void> {
  const known = queue.value.findIndex((q) => q.track.id === id);
  if (known >= 0) return playAt(known);
  toast("Open the track's album or playlist to play it");
}

/** initPlayer restores the queue and follows settings and commands. */
export function initPlayer(): void {
  const saved = local.get<Saved | null>("mm.queue", null);
  if (saved && saved.tracks.length > 0) {
    batch(() => {
      queue.value = saved.tracks.map((t) => item(t));
      index.value = Math.min(Math.max(saved.index, 0), saved.tracks.length - 1);
      position.value = saved.position;
      duration.value = queue.value[index.value]?.track.durationMs ?? 0;
      shuffle.value = saved.shuffle;
      repeat.value = saved.repeat;
    });
  }
  const s = settings.value;
  if (s) volume.value = s.volume;
  apply();
  effect(() => {
    const st = settings.value;
    if (!st) return;
    audio.setEqualizer(st.equalizer.enabled, st.equalizer.gains, st.equalizer.preamp);
    audio.setNormalize(st.normalize);
  });
  effect(() => {
    likedIds.value; // the heart of what plays follows likes made anywhere
    report();
  });
  events.playerCommand.on(command);
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => debouncedToggle());
    ms.setActionHandler("pause", () => debouncedToggle());
    ms.setActionHandler("nexttrack", () => void next());
    ms.setActionHandler("previoustrack", () => void previous());
    ms.setActionHandler("seekto", (d) => d.seekTime != null && void seek(d.seekTime * 1000));
  }
  addEventListener("beforeunload", () => connect.stop(false));
  report();
}

/** describe names the current track for notices. */
export const describe = (): string => (currentTrack.value ? trackLine(currentTrack.value) : "Nothing playing");
