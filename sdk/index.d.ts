// Types of the MixMusic plugin API, for plugin authors.
//
// A plugin's module exports a default function that MixMusic calls with the
// API when the user enables the plugin. It may return a function, which
// MixMusic calls when the plugin is disabled, updated or removed:
//
//   /** @param {import("mixmusic-sdk").MixMusicAPI} api */
//   export default function activate(api) {
//     const off = api.player.on("trackchange", () => console.log(api.player.state().track?.title));
//     return off;
//   }
//
// Everything a plugin adds through the API (sidebar items, pages, track
// actions, widgets, styles, commands and listeners) is removed for it when
// it stops. See docs/plugins.md.

/** A service tracks come from; "local" is a mix made in MixMusic. */
export type Source = "youtube" | "spotify" | "local";

export interface Image {
  url: string;
  width?: number;
  height?: number;
}

/** A link to an artist or an album; id is set when the service has a page for it. */
export interface Ref {
  id?: string;
  name: string;
}

/** A track. Its id starts with its service: "yt:" for YouTube Music, "sp:" for Spotify. */
export interface Track {
  id: string;
  source: Source;
  title: string;
  artists: Ref[];
  album?: Ref | null;
  durationMs: number;
  artwork: Image[];
  explicit?: boolean;
  video?: boolean;
  url?: string;
}

export interface Album {
  id: string;
  source: Source;
  title: string;
  artists: Ref[];
  kind?: "album" | "single" | "ep";
  year?: string;
  artwork: Image[];
  trackCount?: number;
  tracks: Track[];
  url?: string;
}

export interface Artist {
  id: string;
  source: Source;
  name: string;
  artwork: Image[];
  subtitle?: string;
  description?: string;
  topTracks: Track[];
  albums: Album[];
  singles: Album[];
  related: Ref[];
  url?: string;
}

export interface Playlist {
  id: string;
  source: Source;
  title: string;
  description?: string;
  owner?: string;
  artwork: Image[];
  trackCount?: number;
  tracks: Track[];
  editable?: boolean;
  url?: string;
}

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export interface SearchResponse {
  youtube: SearchResults;
  spotify: SearchResults;
  spotifySignedIn: boolean;
  errors: string[];
}

export interface Lyrics {
  synced: boolean;
  instrumental?: boolean;
  /** Lines of the lyrics; timeMs is when a line is sung, when synced. */
  lines: { timeMs: number; text: string }[];
  source: string;
}

export interface PlayerSnapshot {
  track: Track | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  /** From 0 to 1. */
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  queue: Track[];
  /** The position of the current track in the queue, or -1. */
  index: number;
}

/** What plugins may hear of the player. */
export type PlayerEvent = "trackchange" | "statechange" | "progress" | "queuechange";

/** Plugins' render functions may return a cleanup function. */
export type Cleanup = void | (() => void);

export interface MixMusicAPI {
  /** MixMusic's version. */
  readonly version: string;
  /** The plugin's own id. */
  readonly plugin: string;

  player: {
    state(): PlayerSnapshot;
    play(): Promise<void>;
    pause(): Promise<void>;
    toggle(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    /** From 0 to 1. */
    setVolume(volume: number): void;
    /** Replaces the queue with tracks and plays the one at start. */
    playTracks(tracks: Track[], start?: number): Promise<void>;
    /** Puts tracks right after the current one. */
    playNext(tracks: Track[]): void;
    /** Adds tracks at the end of the queue. */
    enqueue(tracks: Track[]): void;
    /** Listens to the player; returns the function that stops listening. */
    on(event: PlayerEvent, listener: () => void): () => void;
    /** The Web Audio analyser of MixMusic's own player, null until it played. Spotify's audio, played in MixMusic or on a Spotify Connect device, does not reach it. With MixMusic's own audio engine (Settings › Playback), an object with the analyser's reading methods and properties, of fftSize 256, which gives the same data, and no Web Audio connections. */
    analyser(): AnalyserNode | null;
  };

  catalog: {
    /** Searches YouTube Music, and Spotify when the user signed in. */
    search(query: string): Promise<SearchResponse>;
    album(id: string): Promise<Album>;
    artist(id: string): Promise<Artist>;
    playlist(id: string): Promise<Playlist>;
    /** Tracks like the one given. */
    radio(track: Track): Promise<Track[]>;
    lyrics(track: Track): Promise<Lyrics>;
  };

  library: {
    isLiked(trackId: string): boolean;
    setLiked(track: Track, liked: boolean): Promise<void>;
    /** The playlists made in MixMusic. */
    mixes(): Playlist[];
    createMix(title: string, tracks?: Track[]): Promise<Playlist>;
  };

  ui: {
    toast(message: string, options?: { tone?: "info" | "error" | "success" }): void;
    /** Shows a page of the app, as "/search?q=jazz" or "/plugin/<id>/<page>". */
    navigate(path: string): void;
    /** Adds an item to the sidebar, opening one of the plugin's pages. icon is an SVG string of a 24×24 icon drawn in currentColor. */
    addSidebarItem(item: { id: string; label: string; icon?: string; page: string }): () => void;
    /** Adds a page at /plugin/<plugin id>/<name>, rendered into a container. */
    addPage(page: { name: string; title: string; render(container: HTMLElement): Cleanup }): () => void;
    /** Adds an item to the menu of every track. */
    addTrackAction(action: { id: string; label: string; run(track: Track): void }): () => void;
    /** Adds a section to the now playing page. */
    addWidget(widget: { id: string; title: string; render(container: HTMLElement): Cleanup }): () => void;
    /** Adds CSS to the page, under the user's own CSS. */
    addStyle(css: string): () => void;
  };

  commands: {
    /** Adds a command to the command palette, with an optional shortcut as "Mod+Shift+P" (Mod is Ctrl, or Cmd on macOS). */
    register(command: { id: string; title: string; shortcut?: string; run(): void }): () => void;
  };

  settings: {
    /** The user's settings, read only. */
    get(): Readonly<Record<string, unknown>>;
  };

  /** Values the plugin keeps between runs, up to 1 MB. */
  storage: {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    getJSON<T>(key: string, fallback: T): Promise<T>;
    setJSON(key: string, value: unknown): Promise<void>;
  };

  /** Shows a desktop notification. */
  notify(title: string, body: string): Promise<void>;
  /** Opens a web page in the default browser. */
  openExternal(url: string): Promise<void>;
}

/** The function a plugin's module exports by default. */
export type Activate = (api: MixMusicAPI) => void | (() => void) | Promise<void | (() => void)>;
