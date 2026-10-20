// MixMusic as a Spotify device of its own: Spotify's Web Playback SDK plays
// Spotify tracks in the page, with no Spotify app open, and MixMusic shows
// among the user's Spotify Connect devices while they play here. It needs
// Spotify Premium, a sign-in that grants streaming, and a webview that
// decrypts Spotify's audio, as WebView2 does on Windows.
import { effect } from "@preact/signals";
import { Player } from "../mygo";
import { accounts } from "../state/accounts";
import { settings } from "../state/settings";
import type { Device } from "./connect";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
/** NAME is the device's name among the user's Spotify devices. */
const NAME = "MixMusic";
/** READY_MS is how long the player may take to connect. */
const READY_MS = 20000;

// What MixMusic uses of the SDK.
interface SDKTrack {
  id: string | null;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  linked_from?: { id: string | null };
}

interface SDKState {
  paused: boolean;
  position: number;
  track_window: { current_track: SDKTrack | null };
}

type ErrorKind = "initialization_error" | "authentication_error" | "account_error" | "playback_error";

interface SDKPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: "ready" | "not_ready", fn: (e: { device_id: string }) => void): boolean;
  addListener(event: ErrorKind, fn: (e: { message: string }) => void): boolean;
  getCurrentState(): Promise<SDKState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  activateElement(): Promise<void>;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: { name: string; volume?: number; getOAuthToken: (done: (token: string) => void) => void }) => SDKPlayer;
    };
  }
}

/** problems say in plain words why Spotify cannot play here. */
const problems: Partial<Record<ErrorKind, string>> = {
  initialization_error: "this system's webview cannot play Spotify's protected audio",
  authentication_error: "sign in to Spotify again in Settings › Accounts, for MixMusic to play it itself",
  account_error: "Spotify plays in MixMusic with Spotify Premium only",
};

let supported: Promise<boolean> | null = null;

/**
 * canPlaySpotify tells whether the webview decrypts Spotify's audio, with
 * Widevine or PlayReady, from a secure page: WebView2 does, WebKitGTK does
 * not.
 */
export function canPlaySpotify(): Promise<boolean> {
  supported ??= (async () => {
    if (!isSecureContext || !navigator.requestMediaKeySystemAccess) return false;
    const config: MediaKeySystemConfiguration[] = [
      { initDataTypes: ["cenc"], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] },
    ];
    for (const system of ["com.widevine.alpha", "com.microsoft.playready.recommendation", "com.microsoft.playready"]) {
      try {
        await (await navigator.requestMediaKeySystemAccess(system, config)).createMediaKeys();
        return true;
      } catch {
        // The next one, then.
      }
    }
    return false;
  })();
  return supported;
}

let sdk: Promise<void> | null = null;

/** loadSDK loads Spotify's script, once it loaded. */
function loadSDK(): Promise<void> {
  sdk ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      script.remove();
      sdk = null;
      reject(new Error("Spotify's player did not load: is MixMusic online?"));
    };
    document.head.append(script);
  });
  return sdk;
}

let player: SDKPlayer | null = null;
/** activated is set once a click or a key let the player play. */
let activated = false;
/** deviceID is the device ID of the player, once Spotify knows it. */
let deviceID: Promise<string> | null = null;
/** problem is why Spotify cannot play here, once the SDK said; a new sign-in tries again. */
let problem: string | null = null;
let volume = 0.8;

/** device connects the player to Spotify, once, and returns its device ID. */
function device(): Promise<string> {
  deviceID ??= open().catch((err: unknown) => {
    close();
    throw err;
  });
  return deviceID;
}

async function open(): Promise<string> {
  if (problem) throw new Error(problem);
  if (!(await canPlaySpotify())) throw new Error((problem = problems.initialization_error!));
  const sp = accounts.value?.spotify;
  if (sp && !sp.signedIn) throw new Error("sign in to Spotify in Settings › Accounts to play it");
  if (sp && !sp.streaming) throw new Error(problems.authentication_error);
  await loadSDK();
  const p = new window.Spotify!.Player({
    name: NAME,
    volume: volume * volume,
    getOAuthToken: (done) => void Player.spotifyToken().then(done, (err: unknown) => console.error("spotify: token:", err)),
  });
  player = p;
  activated = false;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Spotify's player did not connect")), READY_MS);
    for (const kind of ["initialization_error", "authentication_error", "account_error"] as const) {
      p.addListener(kind, ({ message }) => {
        console.error(`spotify: ${kind}: ${message}`);
        problem = problems[kind] ?? message;
        clearTimeout(timer);
        reject(new Error(problem));
        // Once connected, the next track opens it again, and says why it cannot.
        if (player === p) close();
      });
    }
    p.addListener("playback_error", ({ message }) => console.error(`spotify: playback_error: ${message}`));
    p.addListener("ready", ({ device_id }) => {
      clearTimeout(timer);
      if (player === p) deviceID = Promise.resolve(device_id);
      resolve(device_id);
    });
    // Offline, the SDK connects again by itself, and tells when ready.
    p.addListener("not_ready", ({ device_id }) => console.warn(`spotify: device ${device_id} went offline`));
    p.connect().then(
      (ok) => ok || reject(new Error("Spotify's player did not connect")),
      (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}

/** close disconnects the player: MixMusic leaves the user's devices. */
function close(): void {
  player?.disconnect();
  player = null;
  deviceID = null;
}

/** spotifyDevice is MixMusic's own Spotify device, for the engine of ./connect. */
export const spotifyDevice: Device = {
  async play(track, positionMs) {
    await Player.playHere(await device(), track, positionMs);
  },
  pause: async () => player?.pause(),
  resume: async () => player?.resume(),
  seek: async (positionMs) => player?.seek(positionMs),
  async setVolume(v) {
    volume = v;
    // The curve of MixMusic's own player, so that both sound alike.
    await player?.setVolume(v * v);
  },
  async state() {
    const s = await player?.getCurrentState();
    if (!s) return null;
    const t = s.track_window.current_track;
    return {
      playing: !s.paused,
      progressMs: s.position,
      // A relinked copy keeps the ID MixMusic asked for in linked_from.
      track: t && {
        id: `sp:${t.linked_from?.id ?? t.id}`,
        title: t.name,
        artists: t.artists.map((a) => ({ name: a.name })),
        durationMs: t.duration_ms,
      },
    };
  },
  askEvery: 1000,
};

/**
 * initSpotifyPlayer connects the player while Spotify tracks play here, so
 * that MixMusic shows among the user's Spotify devices and plays at the
 * first click, and disconnects it otherwise.
 */
export function initSpotifyPlayer(): void {
  // The webview may block playback no click started: the user's first
  // click or key lets the player play.
  const activate = () => {
    if (!player || activated) return;
    activated = true;
    player.activateElement().catch(() => (activated = false));
  };
  addEventListener("pointerdown", activate, true);
  addEventListener("keydown", activate, true);
  let signedIn = "";
  effect(() => {
    const sp = accounts.value?.spotify;
    const now = `${sp?.signedIn ?? false} ${sp?.streaming ?? false}`;
    if (now !== signedIn) {
      // Signed in again, the player may play where it could not.
      signedIn = now;
      problem = null;
      close();
    }
    if (settings.value?.spotifyPlayback !== "here" || !sp?.signedIn) return close();
    device().catch((err: unknown) => console.warn("spotify:", err));
  });
}
