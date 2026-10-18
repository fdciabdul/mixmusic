// The audio engine of MixMusic's own player: two decks, so that one track
// can fade into the next, routed through Web Audio for the equalizer, the
// volume levelling and the visualizer.
import { BANDS } from "./eq";

interface Deck {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
}

export interface EngineEvents {
  time(positionMs: number, durationMs: number): void;
  ended(): void;
  error(message: string): void;
  playing(playing: boolean): void;
  buffering(buffering: boolean): void;
}

const mediaErrors: Record<number, string> = {
  1: "playback was aborted",
  2: "the network failed while loading the audio",
  3: "the audio could not be decoded",
  4: "the audio format is not supported",
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private decks: [Deck, Deck];
  private active = 0;
  private preamp: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private compressor: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private normalizeOn = false;
  private eq = { enabled: false, gains: BANDS.map(() => 0), preamp: 0 };
  private volume = 0.8;
  private fading = false;
  analyser: AnalyserNode | null = null;

  constructor(private events: EngineEvents) {
    this.decks = [this.deck(), this.deck()];
  }

  private deck(): Deck {
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    const d: Deck = { el, source: null, gain: null };
    const mine = () => this.decks[this.active] === d;
    el.addEventListener("timeupdate", () => mine() && this.events.time(el.currentTime * 1000, this.durationOf(el)));
    el.addEventListener("durationchange", () => mine() && this.events.time(el.currentTime * 1000, this.durationOf(el)));
    el.addEventListener("ended", () => mine() && !this.fading && this.events.ended());
    el.addEventListener("playing", () => mine() && (this.events.playing(true), this.events.buffering(false)));
    el.addEventListener("pause", () => mine() && !this.fading && this.events.playing(false));
    el.addEventListener("waiting", () => mine() && this.events.buffering(true));
    el.addEventListener("canplay", () => mine() && this.events.buffering(false));
    el.addEventListener("error", () => {
      if (!mine() || !el.error || !el.src) return;
      this.events.error(mediaErrors[el.error.code] ?? "the audio could not play");
    });
    return d;
  }

  private durationOf(el: HTMLAudioElement): number {
    return Number.isFinite(el.duration) ? el.duration * 1000 : 0;
  }

  /** graph builds the Web Audio graph, once the user started playback. */
  private graph(): void {
    if (this.ctx) return;
    const ctx = new AudioContext({ latencyHint: "playback" });
    this.ctx = ctx;
    this.preamp = ctx.createGain();
    this.filters = BANDS.map((hz, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = hz;
      f.Q.value = 1.1;
      return f;
    });
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    for (const d of this.decks) {
      d.source = ctx.createMediaElementSource(d.el);
      d.gain = ctx.createGain();
      d.source.connect(d.gain);
      d.gain.connect(this.preamp);
    }
    this.decks[1 - this.active]!.gain!.gain.value = 0;
    this.route();
    this.applyEq();
    this.applyVolume();
  }

  /** route connects the chain after the preamp, with or without levelling. */
  private route(): void {
    if (!this.preamp || !this.master || !this.compressor || !this.analyser || !this.ctx) return;
    this.preamp.disconnect();
    for (const f of this.filters) f.disconnect();
    this.compressor.disconnect();
    let node: AudioNode = this.preamp;
    for (const f of this.filters) {
      node.connect(f);
      node = f;
    }
    if (this.normalizeOn) {
      node.connect(this.compressor);
      node = this.compressor;
    }
    node.connect(this.master);
    this.master.disconnect();
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  private get current(): Deck {
    return this.decks[this.active]!;
  }

  private get other(): Deck {
    return this.decks[1 - this.active]!;
  }

  /** load plays url on the active deck from startMs. */
  async load(url: string, startMs = 0, autoplay = true): Promise<void> {
    this.graph();
    this.fading = false;
    this.other.el.pause();
    const d = this.current;
    if (d.gain) d.gain.gain.value = 1;
    d.el.src = url;
    if (startMs > 0) d.el.currentTime = startMs / 1000;
    if (autoplay) await this.play();
  }

  /** preload starts loading url on the idle deck, for the next track. */
  preload(url: string): void {
    const d = this.other;
    if (d.el.src !== url) {
      d.el.src = url;
      d.el.load();
    }
  }

  /** crossfade plays url on the idle deck while the active one fades out, over seconds. */
  async crossfade(url: string, seconds: number): Promise<void> {
    this.graph();
    if (!this.ctx) return;
    const from = this.current;
    const to = this.other;
    if (to.el.src !== url) to.el.src = url;
    to.el.currentTime = 0;
    const now = this.ctx.currentTime;
    to.gain!.gain.cancelScheduledValues(now);
    to.gain!.gain.setValueAtTime(0, now);
    to.gain!.gain.linearRampToValueAtTime(1, now + seconds);
    from.gain!.gain.cancelScheduledValues(now);
    from.gain!.gain.setValueAtTime(from.gain!.gain.value, now);
    from.gain!.gain.linearRampToValueAtTime(0, now + seconds);
    this.fading = true;
    this.active = 1 - this.active;
    await to.el.play().catch(() => {});
    setTimeout(() => {
      from.el.pause();
      this.fading = false;
    }, seconds * 1000 + 50);
  }

  async play(): Promise<void> {
    this.graph();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
    try {
      await this.current.el.play();
    } catch (err) {
      if ((err as DOMException).name !== "AbortError") throw err;
    }
  }

  pause(): void {
    this.current.el.pause();
    if (this.fading) this.other.el.pause();
  }

  /** stop silences both decks and forgets their tracks. */
  stop(): void {
    for (const d of this.decks) {
      d.el.pause();
      d.el.removeAttribute("src");
      d.el.load();
    }
    this.fading = false;
  }

  seek(ms: number): void {
    this.current.el.currentTime = Math.max(0, ms / 1000);
  }

  get loaded(): boolean {
    return !!this.current.el.src;
  }

  get paused(): boolean {
    return this.current.el.paused;
  }

  get position(): number {
    return this.current.el.currentTime * 1000;
  }

  get duration(): number {
    return this.durationOf(this.current.el);
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyVolume();
  }

  private applyVolume(): void {
    // A curve, so the slider's halfway sounds like half as loud.
    const gain = this.volume * this.volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
    else for (const d of this.decks) d.el.volume = gain;
  }

  setEqualizer(enabled: boolean, gains: number[], preamp: number): void {
    this.eq = { enabled, gains, preamp };
    this.applyEq();
  }

  private applyEq(): void {
    if (!this.ctx || !this.preamp) return;
    const t = this.ctx.currentTime;
    this.preamp.gain.setTargetAtTime(this.eq.enabled ? Math.pow(10, this.eq.preamp / 20) : 1, t, 0.02);
    this.filters.forEach((f, i) => f.gain.setTargetAtTime(this.eq.enabled ? (this.eq.gains[i] ?? 0) : 0, t, 0.02));
  }

  setNormalize(on: boolean): void {
    if (this.normalizeOn === on) return;
    this.normalizeOn = on;
    this.route();
  }
}
