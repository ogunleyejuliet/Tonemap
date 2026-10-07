import { Hct, TonalPalette } from "@material/material-color-utilities";
import { argbToHex, hexToArgb } from "./hex.js";
import {
  librarySecondaryPalette,
  libraryTertiaryPalette,
  type PaletteName,
  type ResolvedKeyColors,
} from "./keyColors.js";

export const STANDARD_TONES = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100,
];

export const NEUTRAL_EXTRA_TONES = [4, 6, 12, 17, 22, 24, 87, 92, 94, 96];

export const NEUTRAL_TONES = [...STANDARD_TONES, ...NEUTRAL_EXTRA_TONES].sort(
  (a, b) => a - b,
);

export interface BuiltPalette {
  name: PaletteName;
  /** The resolved key-color hex this palette was built from. */
  keyHex: string;
  hue: number;
  chroma: number;
  tones: number[];
  /** tone -> canonical hex */
  hex: Record<number, string>;
}

export interface BuildPalettesResult {
  palettes: Record<PaletteName, BuiltPalette>;
  /** Measured HCT tone of the typed primary hex. */
  primaryMeasuredTone: number;
  /** Non-null when the measured tone is more than ~10 away from 40. */
  primaryWarning: string | null;
  /** Measured HCT tone of the secondary key hex (locked or material). */
  secondaryMeasuredTone: number;
  /** Non-null when secondary is locked and its tone is >~10 away from 40. */
  secondaryWarning: string | null;
  /** Measured HCT tone of the tertiary key hex (locked or material). */
  tertiaryMeasuredTone: number;
  /** Non-null when tertiary is locked and its tone is >~10 away from 40. */
  tertiaryWarning: string | null;
}

/** "locked": palette from the key hex with tone 40 set to it. "material": library palette untouched. */
export type AccentPaletteMode = "locked" | "material";

export interface BuildPalettesOptions {
  /** Default true. Set false to skip the primary lock (used for library comparisons). */
  applyPrimaryLock?: boolean;
  /** Default "locked". "material" uses the library tonal-spot palette as-is. */
  secondaryMode?: AccentPaletteMode;
  /** Default "locked". "material" uses the library tonal-spot palette as-is. */
  tertiaryMode?: AccentPaletteMode;
}

function buildOne(
  name: PaletteName,
  keyHex: string,
  tones: number[],
): BuiltPalette {
  const hct = Hct.fromInt(hexToArgb(keyHex));
  const palette = TonalPalette.fromHueAndChroma(hct.hue, hct.chroma);
  const hex: Record<number, string> = {};
  for (const t of tones) {
    hex[t] = argbToHex(palette.tone(t));
  }
  return { name, keyHex, hue: hct.hue, chroma: hct.chroma, tones: [...tones], hex };
}

function samplePalette(
  name: PaletteName,
  keyHex: string,
  palette: TonalPalette,
  tones: number[],
): BuiltPalette {
  const hex: Record<number, string> = {};
  for (const t of tones) {
    hex[t] = argbToHex(palette.tone(t));
  }
  return {
    name,
    keyHex,
    hue: palette.hue,
    chroma: palette.chroma,
    tones: [...tones],
    hex,
  };
}

function lockWarning(paletteLabel: string, measuredTone: number): string | null {
  const distance = Math.abs(measuredTone - 40);
  if (distance <= 10) return null;
  return (
    `This color sits near tone ${Math.round(measuredTone)}, ` +
    `so the shade strip may look out of order. ` +
    `It is still ${paletteLabel}/40.`
  );
}

/**
 * Build a TonalPalette for every key color.
 * The primary lock (default) sets tone 40 of the primary palette to exactly
 * the typed hex so the seed color survives untouched. Secondary and tertiary
 * lock the same way in "locked" mode (harmony/custom hexes); in "material"
 * mode the library tonal-spot palette is sampled untouched. Error, warning
 * and success are never locked. Dark roles always stay at tone 80.
 */
export function buildPalettes(
  keyColors: ResolvedKeyColors,
  options: BuildPalettesOptions = {},
): BuildPalettesResult {
  const applyPrimaryLock = options.applyPrimaryLock ?? true;
  const secondaryMode = options.secondaryMode ?? "locked";
  const tertiaryMode = options.tertiaryMode ?? "locked";

  const secondaryHct = Hct.fromInt(hexToArgb(keyColors.secondary));
  const tertiaryHct = Hct.fromInt(hexToArgb(keyColors.tertiary));
  const secondaryLibrary =
    secondaryMode === "material"
      ? librarySecondaryPalette(keyColors.primary)
      : null;
  const tertiaryLibrary =
    tertiaryMode === "material"
      ? libraryTertiaryPalette(keyColors.primary)
      : null;

  const palettes = {
    primary: buildOne("primary", keyColors.primary, STANDARD_TONES),
    secondary:
      secondaryLibrary !== null
        ? samplePalette(
            "secondary",
            argbToHex(secondaryLibrary.tone(40)),
            secondaryLibrary,
            STANDARD_TONES,
          )
        : buildOne("secondary", keyColors.secondary, STANDARD_TONES),
    tertiary:
      tertiaryLibrary !== null
        ? samplePalette(
            "tertiary",
            argbToHex(tertiaryLibrary.tone(40)),
            tertiaryLibrary,
            STANDARD_TONES,
          )
        : buildOne("tertiary", keyColors.tertiary, STANDARD_TONES),
    neutral: buildOne("neutral", keyColors.neutral, NEUTRAL_TONES),
    neutralVariant: buildOne(
      "neutralVariant",
      keyColors.neutralVariant,
      STANDARD_TONES,
    ),
    error: buildOne("error", keyColors.error, STANDARD_TONES),
    warning: buildOne("warning", keyColors.warning, STANDARD_TONES),
    success: buildOne("success", keyColors.success, STANDARD_TONES),
  } as Record<PaletteName, BuiltPalette>;

  if (applyPrimaryLock) {
    palettes.primary.hex[40] = keyColors.primary;
  }
  if (secondaryMode === "locked") {
    palettes.secondary.hex[40] = keyColors.secondary;
  }
  if (tertiaryMode === "locked") {
    palettes.tertiary.hex[40] = keyColors.tertiary;
  }

  const primaryMeasuredTone = Hct.fromInt(hexToArgb(keyColors.primary)).tone;
  const primaryDistance = Math.abs(primaryMeasuredTone - 40);
  const primaryWarning =
    primaryDistance > 10
      ? `Primary ${keyColors.primary} has measured tone ${primaryMeasuredTone.toFixed(1)}, ` +
        `which is ${primaryDistance.toFixed(1)} away from 40. Tone 40 is locked to the typed hex, ` +
        `so surrounding tones may look uneven.`
      : null;

  const secondaryMeasuredTone = secondaryHct.tone;
  const secondaryWarning =
    secondaryMode === "locked" ? lockWarning("Secondary", secondaryMeasuredTone) : null;
  const tertiaryMeasuredTone = tertiaryHct.tone;
  const tertiaryWarning =
    tertiaryMode === "locked" ? lockWarning("Tertiary", tertiaryMeasuredTone) : null;

  return {
    palettes,
    primaryMeasuredTone,
    primaryWarning,
    secondaryMeasuredTone,
    secondaryWarning,
    tertiaryMeasuredTone,
    tertiaryWarning,
  };
}

/** Look up a single tone hex from built palettes (throws on unknown palette/tone). */
export function paletteHex(
  palettes: Record<PaletteName, BuiltPalette>,
  name: PaletteName,
  tone: number,
): string {
  const p = palettes[name];
  if (!p) throw new Error(`Unknown palette: "${name}"`);
  const hex = p.hex[tone];
  if (hex === undefined) {
    throw new Error(`Palette "${name}" has no tone ${tone}.`);
  }
  return hex;
}
