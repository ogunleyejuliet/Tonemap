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
  /** Measured HCT tone of the secondary key hex. */
  secondaryMeasuredTone: number;
  /** Non-null when secondary tone is >~10 away from 40. */
  secondaryWarning: string | null;
}

/** "material": library tonal-spot palette untouched. "custom": palette built from key color's hue and chroma. */
export type AccentPaletteMode = "material" | "custom";

export interface BuildPalettesOptions {
  /** Default true. Set false to skip the primary lock (used for library comparisons). */
  applyPrimaryLock?: boolean;
  /** Default "custom". "material" uses the library tonal-spot palette as-is. */
  secondaryMode?: AccentPaletteMode;
  /** Default "custom". "material" uses the library tonal-spot palette as-is. */
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

/**
 * Build a TonalPalette for every key color.
 * The primary and secondary locks set tone 40 to exactly their key color hex
 * so the seed colors survive untouched. Tertiary is built from the HCT hue and chroma
 * of its key color (with TonalPalette.fromHueAndChroma in custom/harmony modes, or sampled
 * untouched from the library tonal-spot palette in "material" mode), and no tone is replaced.
 * Error, warning and success are never locked. Dark roles always stay at tone 80.
 */
export function buildPalettes(
  keyColors: ResolvedKeyColors,
  options: BuildPalettesOptions = {},
): BuildPalettesResult {
  const applyPrimaryLock = options.applyPrimaryLock ?? true;
  const secondaryMode = options.secondaryMode ?? "custom";
  const tertiaryMode = options.tertiaryMode ?? "custom";

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
  palettes.secondary.hex[40] = keyColors.secondary;

  const primaryMeasuredTone = Hct.fromInt(hexToArgb(keyColors.primary)).tone;
  const primaryDistance = Math.abs(primaryMeasuredTone - 40);
  const primaryWarning =
    primaryDistance > 10
      ? `Primary ${keyColors.primary} has measured tone ${primaryMeasuredTone.toFixed(1)}, ` +
        `which is ${primaryDistance.toFixed(1)} away from 40. Tone 40 is locked to the typed hex, ` +
        `so surrounding tones may look uneven.`
      : null;

  const secondaryMeasuredTone = Hct.fromInt(hexToArgb(keyColors.secondary)).tone;
  const secondaryDistance = Math.abs(secondaryMeasuredTone - 40);
  const secondaryWarning =
    secondaryDistance > 10
      ? `This color sits near tone ${Math.round(secondaryMeasuredTone)}, so the shade strip may look out of order. It is still secondary40.`
      : null;

  return {
    palettes,
    primaryMeasuredTone,
    primaryWarning,
    secondaryMeasuredTone,
    secondaryWarning,
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
