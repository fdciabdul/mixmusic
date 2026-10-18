// The API plugins get: what they may read and do in MixMusic. Its types are
// published for plugin authors in sdk/index.d.ts, which must follow this
// file.
import { Addons, Catalog, System, type Album, type Artist, type Playlist, type Settings, type Track } from "../mygo";
import * as player from "../player/player";
import { isLiked, mixes, setLiked, createMix } from "../state/library";
import { settings } from "../state/settings";
import { toast } from "../state/ui";
import { navigate } from "../lib/router";
import { registerCommand } from "../lib/commands";
import { appInfo } from "../lib/runtime";
import {
  add,
  pluginPages,
  sidebarItems,
  trackActions,
  widgets,
  type Cleanup,
} from "./contributions";

export interface PlayerSnapshot {
  track: Track | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  queue: Track[];
  index: number;
}

/** API is what a plugin's activate function receives. */
export interface API {
  /** version is MixMusic's version. */
  readonly version: string;
  /** plugin is the plugin's own ID. */
  readonly plugin: string;
  player: {
    state(): PlayerSnapshot;
    play(): Promise<void>;
    pause(): Promise<void>;
    toggle(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    setVolume(volume: number): void;
    playTracks(tracks: Track[], start?: number): Promise<void>;
    playNext(tracks: Track[]): void;
    enqueue(tracks: Track[]): void;
    on(event: player.PlayerEvent, listener: () => void): () => void;
    /** analyser is the Web Audio analyser of MixMusic's own player, for visualizers. */
    analyser(): AnalyserNode | null;
  };
  catalog: {
    search(query: string): ReturnType<typeof Catalog.search>;
    album(id: string): Promise<Album>;
    artist(id: string): Promise<Artist>;
    playlist(id: string): Promise<Playlist>;
    radio(track: Track): Promise<Track[]>;
    lyrics(track: Track): ReturnType<typeof Catalog.lyrics>;
  };
  library: {
    isLiked(trackId: string): boolean;
    setLiked(track: Track, liked: boolean): Promise<void>;
    mixes(): Playlist[];
    createMix(title: string, tracks?: Track[]): Promise<Playlist>;
  };
  ui: {
    toast(message: string, options?: { tone?: "info" | "error" | "success" }): void;
    navigate(path: string): void;
    addSidebarItem(item: { id: string; label: string; icon?: string; page: string }): () => void;
    addPage(page: { name: string; title: string; render(container: HTMLElement): Cleanup }): () => void;
    addTrackAction(action: { id: string; label: string; run(track: Track): void }): () => void;
    addWidget(widget: { id: string; title: string; render(container: HTMLElement): Cleanup }): () => void;
    addStyle(css: string): () => void;
  };
  commands: {
    register(command: { id: string; title: string; shortcut?: string; run(): void }): () => void;
  };
  settings: {
    get(): Readonly<Settings>;
  };
  storage: {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    getJSON<T>(key: string, fallback: T): Promise<T>;
    setJSON(key: string, value: unknown): Promise<void>;
  };
  notify(title: string, body: string): Promise<void>;
  openExternal(url: string): Promise<void>;
}

/** createAPI makes the API of one plugin; cleanups collects what to undo when it stops. */
export function createAPI(plugin: string, cleanups: (() => void)[]): API {
  const track = <T extends () => void>(undo: T): T => {
    cleanups.push(undo);
    return undo;
  };
  const scoped = (id: string) => `${plugin}.${id}`;
  let cache: Record<string, string> | null = null;
  const storage = async () => (cache ??= await Addons.storage(plugin));

  return {
    version: appInfo().version,
    plugin,
    player: {
      state: () => ({
        track: player.currentTrack.value,
        playing: player.playing.value,
        positionMs: player.position.value,
        durationMs: player.duration.value,
        volume: player.volume.value,
        shuffle: player.shuffle.value,
        repeat: player.repeat.value,
        queue: player.queue.value.map((q) => q.track),
        index: player.index.value,
      }),
      play: player.play,
      pause: player.pause,
      toggle: player.toggle,
      next: player.next,
      previous: player.previous,
      seek: player.seek,
      setVolume: player.setVolume,
      playTracks: player.playTracks,
      playNext: player.playNext,
      enqueue: player.enqueue,
      on: (event, listener) => track(player.on(event, listener)),
      analyser: player.analyser,
    },
    catalog: {
      search: (q) => Catalog.search(q),
      album: (id) => Catalog.album(id),
      artist: (id) => Catalog.artist(id),
      playlist: (id) => Catalog.playlist(id),
      radio: (t) => Catalog.radio(t),
      lyrics: (t) => Catalog.lyrics(t),
    },
    library: {
      isLiked,
      setLiked,
      mixes: () => mixes.value,
      createMix,
    },
    ui: {
      toast: (message, options) => toast(message, options),
      navigate,
      addSidebarItem: ({ id, label, icon, page }) =>
        track(add(sidebarItems, { id: scoped(id), label, icon, path: `/plugin/${plugin}/${page}`, plugin })),
      addPage: ({ name, title, render }) => track(add(pluginPages, { path: `/plugin/${plugin}/${name}`, title, render, plugin })),
      addTrackAction: ({ id, label, run }) => track(add(trackActions, { id: scoped(id), label, run, plugin })),
      addWidget: ({ id, title, render }) => track(add(widgets, { id: scoped(id), title, render, plugin })),
      addStyle: (css) => {
        const el = document.createElement("style");
        el.dataset.plugin = plugin;
        el.textContent = css;
        document.head.insertBefore(el, document.getElementById("mm-custom-css"));
        return track(() => el.remove());
      },
    },
    commands: {
      register: ({ id, title, shortcut, run }) =>
        track(registerCommand({ id: scoped(id), title, shortcut, run, group: "plugins", plugin })),
    },
    settings: {
      get: () => Object.freeze({ ...settings.value! }),
    },
    storage: {
      get: async (key) => (await storage())[key],
      set: async (key, value) => {
        await Addons.storageSet(plugin, key, value);
        (await storage())[key] = value;
      },
      delete: async (key) => {
        await Addons.storageDelete(plugin, key);
        delete (await storage())[key];
      },
      getJSON: async (key, fallback) => {
        const raw = (await storage())[key];
        if (raw == null) return fallback;
        try {
          return JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      setJSON: async (key, value) => {
        const raw = JSON.stringify(value);
        await Addons.storageSet(plugin, key, raw);
        (await storage())[key] = raw;
      },
    },
    notify: (title, body) => System.notify(title, body),
    openExternal: (url) => System.openExternal(url),
  };
}

// The API must keep the shape published to plugin authors in sdk/index.d.ts.
export const sdkCompatible: (plugin: string, cleanups: (() => void)[]) => import("../../sdk").MixMusicAPI = createAPI;
