// Equalizer bands and presets.

/** The center frequencies of the bands, in hertz, as the settings keep them. */
export const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export interface Preset {
  id: string;
  label: string;
  gains: number[];
}

export const PRESETS: Preset[] = [
  { id: "flat", label: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", label: "Bass boost", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: "treble", label: "Treble boost", gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: "vocal", label: "Vocal", gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  { id: "electronic", label: "Electronic", gains: [5, 4, 1, 0, -1, 1, 0, 1, 4, 5] },
  { id: "rock", label: "Rock", gains: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4] },
  { id: "acoustic", label: "Acoustic", gains: [3, 2, 1, 1, 2, 1, 2, 2, 2, 1] },
  { id: "late-night", label: "Late night", gains: [4, 3, 1, 0, 0, 0, 0, 1, 2, 3] },
  { id: "lofi", label: "Lo-fi", gains: [-3, 0, 3, 4, 2, 0, -2, -4, -6, -8] },
];

/** bandLabel writes a frequency as "32" or "1k". */
export const bandLabel = (hz: number): string => (hz >= 1000 ? `${hz / 1000}k` : String(hz));
