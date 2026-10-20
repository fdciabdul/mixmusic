// Playback on a Spotify Connect device: the player sends commands and polls
// what the device plays. Spotify's reports lag its commands by a few
// seconds, and may name a track by another ID, that of the copy Spotify
// relinked for the user's country, so the engine waits for the device to
// settle and knows its track by more than its ID.
import { Player, type Track } from "../mygo";
import type { EngineEvents } from "./audio";

/** DeviceState is what a device plays, as it reports it. */
export interface DeviceState {
  playing: boolean;
  progressMs: number;
  track: Pick<Track, "id" | "title" | "artists" | "durationMs"> | null;
}

/** Device is a Spotify device the engine plays on and follows. */
export interface Device {
  play(track: Track, positionMs: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** setVolume sets the volume, from 0 to 1. */
  setVolume(volume: number): Promise<void>;
  /** state tells what the device plays, or null when it plays nothing. */
  state(): Promise<DeviceState | null>;
  /** askEvery is how often the device is asked what it plays, in milliseconds. */
  askEvery: number;
}

/** connectDevice is the Spotify Connect device of the settings, or the active one. */
export const connectDevice: Device = {
  play: (track, positionMs) => Player.connectPlay(track, positionMs),
  pause: () => Player.connectPause(),
  resume: () => Player.connectResume(),
  seek: (positionMs) => Player.connectSeek(positionMs),
  setVolume: (volume) => Player.connectVolume(volume),
  state: () => Player.connectState(),
  askEvery: 3000,
};

/** TICK_MS moves the progress on between the device's reports. */
const TICK_MS = 1000;
/** SETTLE_MS is how long the device's reports may still tell what it did before a command. */
const SETTLE_MS = 5000;
/** END_MS is how close to its end a track is ending. */
const END_MS = 6000;

/** plain keeps the letters and digits of a name, in lowercase. */
const plain = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** sameTrack tells whether the device plays track: by its ID, or for a relinked copy, by its title, first artist and length. */
function sameTrack(playing: DeviceState["track"], track: Track): boolean {
  if (!playing) return false;
  if (playing.id === track.id) return true;
  return (
    plain(playing.title) === plain(track.title) &&
    plain(playing.artists[0]?.name) === plain(track.artists[0]?.name) &&
    Math.abs(playing.durationMs - track.durationMs) < 3000
  );
}

export class ConnectEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: Track | null = null;
  private progress = 0;
  private playing = false;
  /** sentAt is when the device got the last command; askedAt when it was last asked what it plays. */
  private sentAt = 0;
  private askedAt = 0;
  private asking = false;
  /** startedAt is where the track started; nudged is set once the device was told again to play it. */
  private startedAt = 0;
  private nudged = false;
  /** ending is set once the device told the track is in its last seconds. */
  private ending = false;
  /** strays counts the reports in a row of the device playing something else. */
  private strays = 0;
  /** lost is set once the device plays something else: playing starts the track there again. */
  private lost = false;

  constructor(
    private events: EngineEvents,
    private device: Device,
  ) {}

  get active(): boolean {
    return this.track !== null;
  }

  /** play plays a Spotify track on the device from positionMs. */
  async play(track: Track, positionMs = 0): Promise<void> {
    // Until the device plays it, its reports would end the track before.
    this.stop(false);
    await this.device.play(track, Math.round(positionMs));
    this.track = track;
    this.progress = this.startedAt = positionMs;
    this.nudged = false;
    this.ending = false;
    this.strays = 0;
    this.lost = false;
    this.sentAt = Date.now();
    this.playing = true;
    this.events.playing(true);
    this.events.time(positionMs, track.durationMs);
    this.poll();
  }

  async pause(): Promise<void> {
    if (!this.track) return;
    // A device that plays something else is not paused for it.
    if (!this.lost) await this.device.pause();
    this.sentAt = Date.now();
    this.playing = false;
    this.events.playing(false);
  }

  async resume(): Promise<void> {
    const track = this.track;
    if (!track) return;
    if (this.lost) return this.play(track, this.progress);
    await this.device.resume();
    this.sentAt = Date.now();
    this.playing = true;
    this.events.playing(true);
  }

  async seek(ms: number): Promise<void> {
    const track = this.track;
    if (!track) return;
    // Once lost, the track starts from there when it plays again.
    if (!this.lost) await this.device.seek(Math.round(ms));
    this.progress = ms;
    this.ending = false;
    this.sentAt = Date.now();
    this.events.time(ms, track.durationMs);
  }

  setVolume(v: number): void {
    if (this.track) this.device.setVolume(v).catch(() => {});
  }

  /** stop stops following the device, pausing it when asked. */
  stop(pause = false): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (pause && this.track && !this.lost) this.device.pause().catch(() => {});
    this.track = null;
    this.playing = false;
  }

  private poll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  private async tick(): Promise<void> {
    const track = this.track;
    if (!track) return;
    if (this.playing) {
      this.progress = Math.min(this.progress + TICK_MS, track.durationMs);
      this.events.time(this.progress, track.durationMs);
    }
    const asked = Date.now();
    const near = track.durationMs - this.progress < END_MS;
    if (this.asking || (asked - this.askedAt < this.device.askEvery && !near)) return;
    this.asking = true;
    this.askedAt = asked;
    let state: DeviceState | null;
    try {
      state = await this.device.state();
    } catch {
      return;
    } finally {
      this.asking = false;
    }
    // A report asked for before the last command tells what the device did before it.
    if (this.track !== track || this.sentAt > asked) return;
    this.follow(track, state, Date.now() - this.sentAt < SETTLE_MS);
  }

  /** follow takes in what the device reported, while it settles after a command or not. */
  private follow(track: Track, state: DeviceState | null, settling: boolean): void {
    if (state && sameTrack(state.track, track)) {
      this.strays = 0;
      this.lost = false;
      // After its end, Spotify plays the track again from its start when it
      // repeats, or stops on it, at its start or at its end.
      const back = state.progressMs < 3000 || (!state.playing && track.durationMs - state.progressMs < 1500);
      if (this.ending && !settling && back) return this.finish();
      // The device may still report the track loading, paused.
      if (settling && this.playing && !state.playing) return;
      // A device may take the track and wait, paused, where it was to
      // start: it is told once more to play.
      if (this.playing && !state.playing && !this.nudged && state.progressMs - this.startedAt < 1500) {
        this.nudged = true;
        this.sentAt = Date.now();
        this.device.resume().catch(() => {});
        return;
      }
      this.progress = state.progressMs;
      this.ending = track.durationMs - state.progressMs < END_MS;
      if (state.playing !== this.playing) {
        this.playing = state.playing;
        this.events.playing(state.playing);
      }
      this.events.time(state.progressMs, track.durationMs);
      return;
    }
    // The device may still report what it played before the command.
    if (settling) return;
    // Around the end, the device moving on or stopping means the track ended.
    if (this.ending || (this.playing && track.durationMs - this.progress < END_MS)) return this.finish();
    // Otherwise someone plays something else on it: twice in a row, it is lost.
    if (++this.strays < 2 || this.lost) return;
    this.lost = true;
    if (this.playing) {
      this.playing = false;
      this.events.playing(false);
    }
  }

  private finish(): void {
    this.stop(false);
    this.events.ended();
  }
}
