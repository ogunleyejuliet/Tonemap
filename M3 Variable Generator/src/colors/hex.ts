import {
  argbFromHex,
  blueFromArgb,
  greenFromArgb,
  hexFromArgb,
  redFromArgb,
} from "@material/material-color-utilities";

/** Normalize a hex string to canonical 6-digit uppercase "#RRGGBB". */
export function normalizeHex(hex: string): string {
  if (typeof hex !== "string") throw new Error(`Hex must be a string, got ${typeof hex}`);
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex color: "${hex}" (expected 3 or 6 hex digits)`);
  }
  return "#" + h.toUpperCase();
}

/** Hex "#RRGGBB" -> ARGB int (opaque) using the library's parser. */
export function hexToArgb(hex: string): number {
  return argbFromHex(normalizeHex(hex));
}

/** ARGB int -> canonical "#RRGGBB" using the library's formatter. */
export function argbToHex(argb: number): string {
  return hexFromArgb(argb).toUpperCase();
}

/** Per-channel absolute differences [dR, dG, dB] between two hex colors. */
export function channelDiff(hexA: string, hexB: string): [number, number, number] {
  const a = hexToArgb(hexA);
  const b = hexToArgb(hexB);
  return [
    Math.abs(redFromArgb(a) - redFromArgb(b)),
    Math.abs(greenFromArgb(a) - greenFromArgb(b)),
    Math.abs(blueFromArgb(a) - blueFromArgb(b)),
  ];
}

/** Largest single-channel difference between two hex colors (0..255). */
export function maxChannelDiff(hexA: string, hexB: string): number {
  const [dr, dg, db] = channelDiff(hexA, hexB);
  return Math.max(dr, dg, db);
}
