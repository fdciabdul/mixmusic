// Playback on a Spotify Connect device: the player sends commands and polls
// what the device plays.
import { Player, type Track } from "../mygo";
import type { EngineEvents } from "./audio";

const POLL_MS = 1000;

export class ConnectEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: Track | null = null;
  private lastProgress = 0;
  private lastPlaying = false;
  private nearEnd = false;
  private sentAt = 0;

  constructor(private events: EngineEvents) {}

  get active(): boolean {
    return this.track !== null;
  }

  /** play plays a Spotify track on the device from positionMs. */
  async play(track: Track, positionMs = 0): Promise<void> {
    await Player.connectPlay(track, Math.round(positionMs));
    this.track = track;
    this.lastProgress = positionMs;
    this.lastPlaying = true;
    this.nearEnd = false;
    this.sentAt = Date.now();
    this.events.playing(true);
    this.events.time(positionMs, track.durationMs);
    this.poll();
  }

  async pause(): Promise<void> {
    if (!this.track) return;
    await Player.connectPause();
    this.lastPlaying = false;
    this.events.playing(false);
  }

  async resume(): Promise<void> {
    if (!this.track) return;
    await Player.connectResume();
    this.lastPlaying = true;
    this.sentAt = Date.now();
    this.events.playing(true);
  }

  async seek(ms: number): Promise<void> {
    if (!this.track) return;
    await Player.connectSeek(Math.round(ms));
    this.lastProgress = ms;
    this.sentAt = Date.now();
    this.events.time(ms, this.track.durationMs);
  }

  setVolume(v: number): void {
    if (this.track) Player.connectVolume(v).catch(() => {});
  }

  /** stop stops following the device, pausing it when asked. */
  stop(pause = false): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (pause && this.track) Player.connectPause().catch(() => {});
    this.track = null;
  }

  private poll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), POLL_MS);
  }

  private async tick(): Promise<void> {
    const track = this.track;
    if (!track) return;
    // Between polls, move the progress on locally.
    if (this.lastPlaying) {
      this.lastProgress += POLL_MS;
      this.events.time(Math.min(this.lastProgress, track.durationMs), track.durationMs);
    }
    // Ask the device every few seconds, and around the end of the track.
    const remaining = track.durationMs - this.lastProgress;
    if (Date.now() - this.sentAt < 2500 && remaining > 4000) return;
    let state;
    try {
      state = await Player.connectState();
    } catch {
      return;
    }
    if (this.track !== track) return;
    const same = state?.track?.id === track.id;
    if (same && state) {
      this.lastProgress = state.progressMs;
      if (state.playing !== this.lastPlaying) {
        this.lastPlaying = state.playing;
        this.events.playing(state.playing);
      }
      this.events.time(state.progressMs, track.durationMs);
      this.nearEnd = track.durationMs - state.progressMs < 5000;
      if (!state.playing && this.nearEnd && state.progressMs < 1500) this.finish();
      return;
    }
    // Near the end, the device moving on or stopping means the track ended.
    if (this.nearEnd) {
      this.finish();
      return;
    }
    // Otherwise the user took over the device: stop following it.
    if (this.lastPlaying) {
      this.lastPlaying = false;
      this.events.playing(false);
    }
  }

  private finish(): void {
    this.stop(false);
    this.events.ended();
  }
}
