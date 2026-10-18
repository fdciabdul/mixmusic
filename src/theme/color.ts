// Colour arithmetic for the theme engine.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** parseHex reads "#abc" or "#aabbcc". */
export function parseHex(hex: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export const toHex = ({ r, g, b }: RGB): string =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** luminance is the relative luminance of WCAG. */
export function luminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const black = { r: 0, g: 0, b: 0 };
const white = { r: 255, g: 255, b: 255 };

/** inkOn returns black or white, whichever reads better on a colour. */
export const inkOn = (c: RGB): string => (contrast(c, black) >= contrast(c, white) ? "#000000" : "#ffffff");

/** mix blends a into b by t. */
export const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

/**
 * readableOn shifts an accent until it reads against a background, at
 * least 3:1 as large text and controls need, keeping its hue.
 */
export function readableOn(accent: RGB, bg: RGB): RGB {
  const toward = luminance(bg) < 0.5 ? white : black;
  let c = accent;
  for (let i = 0; i < 10 && contrast(c, bg) < 3; i++) c = mix(c, toward, 0.15);
  return c;
}
