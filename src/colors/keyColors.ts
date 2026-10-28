import {
  Hct,
  SchemeTonalSpot,
  TonalPalette,
} from "@material/material-color-utilities";
import { argbToHex, hexToArgb, normalizeHex } from "./hex.js";

export const DEFAULT_WARNING_HEX = "#FFA500";
export const DEFAULT_SUCCESS_HEX = "#2E9E4F";

export {
  EXAMPLE_PRIMARY,
  EXAMPLE_SECONDARY,
  EXAMPLE_TERTIARY,
  secondaryToneRatio,
  secondaryChromaRatio,
  secondaryHueShift,
  tertiaryToneUpRatio,
  tertiaryChromaRatio,
  tertiaryHueShift,
} from "./candidates.js";
import { getCandidates } from "./candidates.js";

export type BasePaletteName =
  | "primary"
  | "secondary"
  | "tertiary"
  | "neutral"
  | "neutralVariant"
  | "error"
  | "warning"
  | "success";

export type PaletteName = BasePaletteName | "accent";

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

export type AccentMethod =
  | "complementary"
  | "triadic"
  | "split-complementary"
  | "analogous"
  | "custom";

export interface KeyColorInputs {
  primary: string;
  secondary?: string;
  tertiary?: string;
  neutral?: string;
  neutralVariant?: string;
  error?: string;
  warning?: string;
  success?: string;
  accent?: string;
  accentEnabled?: boolean;
}

export interface KeyColorOptions {
  /** Default "material". A provided hex in inputs.secondary overrides "material". */
  secondary?: SecondaryTertiaryMode;
  secondaryOption?: number;
  /** Default "material". A provided hex in inputs.tertiary overrides "material". */
  tertiary?: SecondaryTertiaryMode;
  tertiaryOption?: number;
  accent?: AccentMethod;
  accentOption?: number;
  accentEnabled?: boolean;
}

export type ResolvedKeyColors = Record<BasePaletteName, string> & {
  accent?: string;
};

/**
 * Rotate the primary color's HCT hue by the harmony delta, or for monochromatic,
 * derive secondary/tertiary colors using the example-derived tone/chroma ratios and hue shifts.
 * Returns a canonical hex string.
 */
export function harmonyKeyColor(
  primaryHex: string,
  preset: HarmonyPreset,
  role: "secondary" | "tertiary" | "accent" = "secondary",
  optionIndex: number = 0,
): string {
  const candidates = getCandidates(primaryHex, preset, role);
  if (candidates.length === 0) {
    throw new Error(`Unknown harmony preset: "${preset}"`);
  }
  const safeIdx =
    ((optionIndex % candidates.length) + candidates.length) % candidates.length;
  return candidates[safeIdx];
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
    secondary: argbToHex(spot.secondaryPalette.tone(40)),
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
  optionIndex: number = 0,
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
    if (inputHex !== undefined && inputHex.trim() !== "") return normalizeHex(inputHex);
    return harmonyKeyColor(primaryHex, mode, which, optionIndex);
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
    options.secondaryOption ?? 0,
  );
  const tertiary = resolveSecondaryOrTertiary(
    "tertiary",
    primary,
    inputs.tertiary,
    options.tertiary,
    defaults,
    options.tertiaryOption ?? (options.tertiary === options.secondary && options.tertiary !== "monochromatic" ? 1 : 0),
  );

  const resolved: ResolvedKeyColors = {
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

  const accentEnabled =
    options.accentEnabled ??
    inputs.accentEnabled ??
    (inputs.accent !== undefined && inputs.accent.trim() !== "");

  if (accentEnabled) {
    const accentMethod = options.accent ?? (inputs.accent ? "custom" : "complementary");
    if (accentMethod === "custom") {
      if (inputs.accent && inputs.accent.trim() !== "") {
        resolved.accent = normalizeHex(inputs.accent);
      } else {
        resolved.accent = harmonyKeyColor(primary, "complementary", "accent", options.accentOption ?? 0);
      }
    } else {
      if (inputs.accent && inputs.accent.trim() !== "") {
        resolved.accent = normalizeHex(inputs.accent);
      } else {
        resolved.accent = harmonyKeyColor(primary, accentMethod, "accent", options.accentOption ?? 0);
      }
    }
  }

  return resolved;
}
