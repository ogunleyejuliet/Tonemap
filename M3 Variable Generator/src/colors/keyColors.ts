import {
  Hct,
  SchemeTonalSpot,
  TonalPalette,
  sanitizeDegreesDouble,
} from "@material/material-color-utilities";
import { argbToHex, hexToArgb, normalizeHex } from "./hex.js";

export const DEFAULT_WARNING_HEX = "#FFA500";
export const DEFAULT_SUCCESS_HEX = "#2E9E4F";

/**
 * Monochromatic harmony preset parameters.
 * Derived from an example color set (Primary: #00E3AA, Secondary: #008F70, Tertiary: #75F8D2).
 * The rule was derived from this one example and can be re-tuned by changing the three example colors.
 */
export const EXAMPLE_PRIMARY = "#00E3AA";
export const EXAMPLE_SECONDARY = "#008F70";
export const EXAMPLE_TERTIARY = "#75F8D2";

const examplePrimaryHct = Hct.fromInt(hexToArgb(EXAMPLE_PRIMARY));
const exampleSecondaryHct = Hct.fromInt(hexToArgb(EXAMPLE_SECONDARY));
const exampleTertiaryHct = Hct.fromInt(hexToArgb(EXAMPLE_TERTIARY));

export const secondaryToneRatio = exampleSecondaryHct.tone / examplePrimaryHct.tone;
export const secondaryChromaRatio = exampleSecondaryHct.chroma / examplePrimaryHct.chroma;
export const secondaryHueShift = exampleSecondaryHct.hue - examplePrimaryHct.hue;

export const tertiaryToneUpRatio = (100 - exampleTertiaryHct.tone) / (100 - examplePrimaryHct.tone);
export const tertiaryChromaRatio = exampleTertiaryHct.chroma / examplePrimaryHct.chroma;
export const tertiaryHueShift = exampleTertiaryHct.hue - examplePrimaryHct.hue;

export type PaletteName =
  | "primary"
  | "secondary"
  | "tertiary"
  | "neutral"
  | "neutralVariant"
  | "error"
  | "warning"
  | "success";

export type HarmonyPreset =
  | "analogous"
  | "complementary"
  | "triadic"
  | "split-complementary"
  | "monochromatic";

export const HARMONY_DELTAS: Record<HarmonyPreset, number> = {
  analogous: 30,
  complementary: 180,
  triadic: 120,
  "split-complementary": 150,
  monochromatic: 0,
};

export type SecondaryTertiaryMode =
  | "material"
  | "custom"
  | HarmonyPreset;

export interface KeyColorInputs {
  primary: string;
  secondary?: string;
  tertiary?: string;
  neutral?: string;
  neutralVariant?: string;
  error?: string;
  warning?: string;
  success?: string;
}

export interface KeyColorOptions {
  /** Default "material". A provided hex in inputs.secondary overrides "material". */
  secondary?: SecondaryTertiaryMode;
  /** Default "material". A provided hex in inputs.tertiary overrides "material". */
  tertiary?: SecondaryTertiaryMode;
}

export type ResolvedKeyColors = Record<PaletteName, string>;

/**
 * Rotate the primary color's HCT hue by the harmony delta, or for monochromatic,
 * derive secondary/tertiary colors using the example-derived tone/chroma ratios and hue shifts.
 * Returns a canonical hex string.
 */
export function harmonyKeyColor(
  primaryHex: string,
  preset: HarmonyPreset,
  role: "secondary" | "tertiary" = "secondary",
): string {
  const primary = normalizeHex(primaryHex);
  const hct = Hct.fromInt(hexToArgb(primary));
  if (preset === "monochromatic") {
    const h = hct.hue;
    const C = hct.chroma;
    const T = hct.tone;
    if (role === "secondary") {
      const hue = sanitizeDegreesDouble(h + secondaryHueShift);
      const chroma = C * secondaryChromaRatio;
      const tone = T * secondaryToneRatio;
      return argbToHex(Hct.from(hue, chroma, tone).toInt());
    } else {
      const hue = sanitizeDegreesDouble(h + tertiaryHueShift);
      const chroma = C * tertiaryChromaRatio;
      const tone = 100 - (100 - T) * tertiaryToneUpRatio;
      return argbToHex(Hct.from(hue, chroma, tone).toInt());
    }
  }
  const delta = HARMONY_DELTAS[preset];
  if (delta === undefined) throw new Error(`Unknown harmony preset: "${preset}"`);
  const hue = sanitizeDegreesDouble(hct.hue + delta);
  return argbToHex(Hct.from(hue, hct.chroma, hct.tone).toInt());
}

function isHarmonyPreset(mode: string): mode is HarmonyPreset {
  return mode in HARMONY_DELTAS;
}

/**
 * The library's own tonal-spot secondary palette for a primary hex, used
 * untouched (no rebuild, no lock) when the method is "Material default".
 */
export function librarySecondaryPalette(primaryHex: string): TonalPalette {
  const spot = new SchemeTonalSpot(
    Hct.fromInt(hexToArgb(normalizeHex(primaryHex))),
    false,
    0,
  );
  return spot.secondaryPalette;
}

/**
 * The library's own tonal-spot tertiary palette for a primary hex, used
 * untouched (no rebuild, no lock) when the method is "Material default".
 */
export function libraryTertiaryPalette(primaryHex: string): TonalPalette {
  const spot = new SchemeTonalSpot(
    Hct.fromInt(hexToArgb(normalizeHex(primaryHex))),
    false,
    0,
  );
  return spot.tertiaryPalette;
}

/** Hex shown in the UI field for a "Material default" accent: the library palette's tone 40. */
export function materialPaletteTone40(
  primaryHex: string,
  which: "secondary" | "tertiary",
): string {
  const palette =
    which === "secondary"
      ? librarySecondaryPalette(primaryHex)
      : libraryTertiaryPalette(primaryHex);
  return argbToHex(palette.tone(40));
}

/**
 * Library tonal-spot defaults derived from the primary's hue (no invented chroma numbers).
 * Pinned to @material/material-color-utilities 0.3.0 (exact): its tonal-spot
 * palettes are primary/36, secondary/16, tertiary hue+60/24, neutral/6,
 * neutral-variant/8, error 25/84, and it imports cleanly without patching node_modules.
 */
function materialDefaults(primaryHex: string): {
  secondary: string;
  tertiary: string;
  neutral: string;
  neutralVariant: string;
  error: string;
} {
  const primaryHct = Hct.fromInt(hexToArgb(primaryHex));
  const spot = new SchemeTonalSpot(primaryHct, false, 0);
  return {
    secondary: argbToHex(spot.secondaryPalette.keyColor.toInt()),
    tertiary: argbToHex(spot.tertiaryPalette.keyColor.toInt()),
    neutral: argbToHex(spot.neutralPalette.keyColor.toInt()),
    neutralVariant: argbToHex(spot.neutralVariantPalette.keyColor.toInt()),
    error: argbToHex(spot.errorPalette.keyColor.toInt()),
  };
}

function resolveSecondaryOrTertiary(
  which: "secondary" | "tertiary",
  primaryHex: string,
  inputHex: string | undefined,
  mode: SecondaryTertiaryMode | undefined,
  defaults: { secondary: string; tertiary: string },
): string {
  const fallback = which === "secondary" ? defaults.secondary : defaults.tertiary;
  if (mode === undefined || mode === "material") {
    // Convenience: an explicitly typed hex wins over the "material" default.
    if (inputHex !== undefined && inputHex.trim() !== "") return normalizeHex(inputHex);
    return fallback;
  }
  if (mode === "custom") {
    if (inputHex === undefined || inputHex.trim() === "") {
      throw new Error(`"${which}" mode is "custom" but no hex was provided.`);
    }
    return normalizeHex(inputHex);
  }
  if (isHarmonyPreset(mode)) {
    return harmonyKeyColor(primaryHex, mode, which);
  }
  throw new Error(`Unknown "${which}" mode: "${mode}"`);
}

/**
 * Resolve all 8 key colors to canonical hex strings.
 * - primary is required.
 * - warning defaults to #FFA500, success to #2E9E4F.
 * - error/neutral/neutralVariant default to the installed library's own
 *   tonal-spot scheme palettes derived from the primary hue.
 * - secondary/tertiary default to "material" (library tonal-spot defaults),
 *   or a custom hex, or an HCT-hue-rotation harmony preset.
 */
export function resolveKeyColors(
  inputs: KeyColorInputs,
  options: KeyColorOptions = {},
): ResolvedKeyColors {
  if (!inputs || !inputs.primary || inputs.primary.trim() === "") {
    throw new Error('"primary" is required.');
  }
  const primary = normalizeHex(inputs.primary);
  const defaults = materialDefaults(primary);

  const secondary = resolveSecondaryOrTertiary(
    "secondary",
    primary,
    inputs.secondary,
    options.secondary,
    defaults,
  );
  const tertiary = resolveSecondaryOrTertiary(
    "tertiary",
    primary,
    inputs.tertiary,
    options.tertiary,
    defaults,
  );

  return {
    primary,
    secondary,
    tertiary,
    neutral:
      inputs.neutral !== undefined && inputs.neutral.trim() !== ""
        ? normalizeHex(inputs.neutral)
        : defaults.neutral,
    neutralVariant:
      inputs.neutralVariant !== undefined && inputs.neutralVariant.trim() !== ""
        ? normalizeHex(inputs.neutralVariant)
        : defaults.neutralVariant,
    error:
      inputs.error !== undefined && inputs.error.trim() !== ""
        ? normalizeHex(inputs.error)
        : defaults.error,
    warning:
      inputs.warning !== undefined && inputs.warning.trim() !== ""
        ? normalizeHex(inputs.warning)
        : DEFAULT_WARNING_HEX,
    success:
      inputs.success !== undefined && inputs.success.trim() !== ""
        ? normalizeHex(inputs.success)
        : DEFAULT_SUCCESS_HEX,
  };
}
