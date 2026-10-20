// MixMusic's own audio engine, outside the webview: on Windows, the Go side
// decodes the audio of a track and plays it on the device itself, with the
// sound of AudioEngine: the same equalizer, levelling, volume, crossfades
// and analyser, which it computes as Web Audio does. This has AudioEngine's
// API, and drives it through the Player service. It plays Opus, which
// YouTube serves for nearly every track; the web engine plays the others.
import { events as appEvents, Player, type NativeAnalysis } from "../mygo";
import type { Engine, EngineEvents } from "./audio";

/** How long a reading of the analyser keeps it fetching its data. */
const readingKeepsFetching = 1000;

/** unsupported starts the error of a track the native engine can't decode. */
const unsupported = "the audio format is not supported";

/**
 * NativeAnalyser stands for the AnalyserNode of the web engine: it has its
 * reading methods and properties, fftSize 256, and no Web Audio
 * connections. Each reading gives what the engine analysed last, and asks
 * it for the next, as an animation frame reads it.
 */
export class NativeAnalyser {
  readonly fftSize = 256;
  readonly frequencyBinCount = 128;
  readonly minDecibels = -100;
  readonly maxDecibels = -30;
  readonly smoothingTimeConstant = 0.8;
  private bytes = new Uint8Array(128);
  private decibels = new Float32Array(128).fill(-Infinity);
  private waveform = new Float32Array(256);
  private fetching = false;
  private wantDecibels = -Infinity;
  private wantWaveform = -Infinity;

  private fetch(): void {
    if (this.fetching) return;
    this.fetching = true;
    const now = performance.now();
    Player.nativeAnalyser(now - this.wantDecibels < readingKeepsFetching, now - this.wantWaveform < readingKeepsFetching)
      .then((a: NativeAnalysis) => {
        this.bytes.set(a.bytes ?? []);
        if (a.decibels) this.decibels.set(a.decibels.map((db) => (db <= -1000 ? -Infinity : db)));
        if (a.waveform) this.waveform.set(a.waveform);
      })
      .catch(() => {})
      .finally(() => (this.fetching = false));
  }

  getByteFrequencyData(array: Uint8Array): void {
    this.fetch();
    array.set(this.bytes.subarray(0, array.length));
  }

  getFloatFrequencyData(array: Float32Array): void {
    this.wantDecibels = performance.now();
    this.fetch();
    array.set(this.decibels.subarray(0, array.length));
  }

  getFloatTimeDomainData(array: Float32Array): void {
    this.wantWaveform = performance.now();
    this.fetch();
    array.set(this.waveform.subarray(0, array.length));
  }

  getByteTimeDomainData(array: Uint8Array): void {
    this.wantWaveform = performance.now();
    this.fetch();
    for (let i = 0; i < Math.min(array.length, this.waveform.length); i++) {
      array[i] = Math.min(Math.max(128 * (this.waveform[i]! + 1), 0), 255);
    }
  }
}

export class NativeEngine implements Engine {
  private src = "";
  private pos = 0;
  private dur = 0;
  private isPaused = true;
  /** wanted is whether the track should play, to carry on in the fallback. */
  private wanted = false;
  /** fallback is the web engine while it plays a track this one can't. */
  private fallback: Engine | null = null;
  /** active is set while the player uses this engine: it hears its events then. */
  active = false;
  private readonly native = new NativeAnalyser();

  constructor(
    private events: EngineEvents,
    private web: Engine,
  ) {
    appEvents.nativeAudio.on((e) => {
      if (!this.active || this.fallback) return;
      switch (e.kind) {
        case "time":
          this.pos = e.positionMs;
          if (e.durationMs > 0) this.dur = e.durationMs;
          this.events.time(this.pos, this.dur);
          break;
        case "ended":
          this.isPaused = true;
          this.events.ended();
          break;
        case "error":
          if (e.message.startsWith(unsupported) && this.src) {
            // Not Opus: the web engine plays this track.
            this.fallback = this.web;
            void Player.nativeStop();
            void this.web.load(this.src, this.pos, this.wanted);
            break;
          }
          this.events.error(e.message);
          break;
        case "playing":
          this.isPaused = !e.playing;
          this.events.playing(e.playing);
          if (e.playing) this.events.buffering(false);
          break;
        case "buffering":
          this.events.buffering(e.buffering);
          break;
      }
    });
  }

  /** analyser stands for the web engine's AnalyserNode. */
  get analyser(): AnalyserNode | null {
    if (this.fallback) return this.fallback.analyser;
    return this.src ? (this.native as unknown as AnalyserNode) : null;
  }

  /** leaveFallback stops the web engine, if it played the last track. */
  private leaveFallback(): void {
    this.fallback?.stop();
    this.fallback = null;
  }

  /** load plays url from startMs. */
  async load(url: string, startMs = 0, autoplay = true): Promise<void> {
    this.leaveFallback();
    this.src = url;
    this.pos = startMs;
    this.dur = 0;
    this.isPaused = !autoplay;
    this.wanted = autoplay;
    await Player.nativeLoad(url, startMs, autoplay);
  }

  /** preload starts loading url, for the next track. */
  preload(url: string): void {
    void Player.nativePreload(url).catch(() => {});
  }

  /** crossfade plays url while what plays fades out, over seconds. */
  async crossfade(url: string, seconds: number): Promise<void> {
    if (this.fallback) return this.load(url, 0, true); // no fading across engines
    this.src = url;
    this.pos = 0;
    this.dur = 0;
    this.wanted = true;
    await Player.nativeCrossfade(url, seconds);
  }

  async play(): Promise<void> {
    this.wanted = true;
    if (this.fallback) return this.fallback.play();
    // A failure comes as an error event, which the player shows.
    await Player.nativePlay().catch(() => {});
  }

  pause(): void {
    this.wanted = false;
    if (this.fallback) return this.fallback.pause();
    void Player.nativePause();
  }

  /** stop silences the engine and forgets its tracks; it lets go of the device. */
  stop(): void {
    this.leaveFallback();
    this.src = "";
    this.isPaused = true;
    this.wanted = false;
    void Player.nativeStop();
  }

  seek(ms: number): void {
    if (this.fallback) return this.fallback.seek(ms);
    this.pos = Math.max(0, ms);
    void Player.nativeSeek(this.pos);
  }

  get loaded(): boolean {
    return this.fallback ? this.fallback.loaded : !!this.src;
  }

  get paused(): boolean {
    return this.fallback ? this.fallback.paused : this.isPaused;
  }

  get position(): number {
    return this.fallback ? this.fallback.position : this.pos;
  }

  get duration(): number {
    return this.fallback ? this.fallback.duration : this.dur;
  }

  // The sound goes to both engines, for the fallback to sound the same.

  setVolume(v: number): void {
    this.web.setVolume(v);
    void Player.nativeSetVolume(v);
  }

  setEqualizer(enabled: boolean, gains: number[], preamp: number): void {
    this.web.setEqualizer(enabled, gains, preamp);
    void Player.nativeSetEqualizer(enabled, gains, preamp);
  }

  setNormalize(on: boolean): void {
    this.web.setNormalize(on);
    void Player.nativeSetNormalize(on);
  }
}
