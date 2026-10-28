import { Hct, sanitizeDegreesDouble } from "@material/material-color-utilities";
import { argbToHex, hexToArgb, normalizeHex } from "./hex.js";

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

export const secondaryToneRatio =
  exampleSecondaryHct.tone / examplePrimaryHct.tone;
export const secondaryChromaRatio =
  exampleSecondaryHct.chroma / examplePrimaryHct.chroma;
export const secondaryHueShift =
  exampleSecondaryHct.hue - examplePrimaryHct.hue;

export const tertiaryToneUpRatio =
  (100 - exampleTertiaryHct.tone) / (100 - examplePrimaryHct.tone);
export const tertiaryChromaRatio =
  exampleTertiaryHct.chroma / examplePrimaryHct.chroma;
export const tertiaryHueShift =
  exampleTertiaryHct.hue - examplePrimaryHct.hue;

// Named constants for candidate rules
export const COMPLEMENTARY_CHROMA_FACTOR = 0.8;
export const COMPLEMENTARY_TONE_DELTA = 12;

export const MONO_TONE_FACTOR_2 = 0.75;
export const MONO_TONE_FACTOR_3 = 1.25;
export const MONO_CHROMA_FACTOR_4 = 0.7;

export const ANALOGOUS_HUE_SHIFTS = [30, -30, 60, -60] as const;
export const TRIADIC_HUE_SHIFTS = [120, 240] as const;
export const SPLIT_COMPLEMENTARY_HUE_SHIFTS = [150, 210] as const;

export type CandidateRole = "secondary" | "tertiary" | "accent";

function normalizeMethodName(method: string): string {
  return method.replace(/\s+/g, "-").toLowerCase();
}

/**
 * Move a tone 12 units toward 50.
 * If tone < 50, increases by delta (capped at 100).
 * If tone > 50, decreases by delta (floored at 0).
 * If tone === 50, stays at 50.
 */
export function moveToneToward50(
  tone: number,
  delta: number = COMPLEMENTARY_TONE_DELTA,
): number {
  if (tone < 50) return Math.min(50, tone + delta);
  if (tone > 50) return Math.max(50, tone - delta);
  return 50;
}

/**
 * Define in one place the ordered candidate list for each method in HCT.
 * - analogous: +30, -30, +60, -60 degrees
 * - complementary: +180; then +180 with chroma x0.8; then +180 with tone moved 12 toward 50
 * - triadic: +120, +240
 * - split complementary: +150, +210
 * - monochromatic (secondary and tertiary only):
 *     option 1: current rule derived from example
 *     options 2 to 4: tone moves 0.75x as far, tone moves 1.25x as far, and chroma ratio x0.7
 */
export function getCandidates(
  primaryHex: string,
  method: string,
  role: CandidateRole = "secondary",
): string[] {
  const primary = normalizeHex(primaryHex);
  const hct = Hct.fromInt(hexToArgb(primary));
  const h = hct.hue;
  const C = hct.chroma;
  const T = hct.tone;

  const m = normalizeMethodName(method);

  switch (m) {
    case "analogous":
      return ANALOGOUS_HUE_SHIFTS.map((shift) =>
        argbToHex(Hct.from(sanitizeDegreesDouble(h + shift), C, T).toInt()),
      );

    case "complementary": {
      const compHue = sanitizeDegreesDouble(h + 180);
      return [
        // Option 1: +180
        argbToHex(Hct.from(compHue, C, T).toInt()),
        // Option 2: +180 with chroma x0.8
        argbToHex(
          Hct.from(compHue, C * COMPLEMENTARY_CHROMA_FACTOR, T).toInt(),
        ),
        // Option 3: +180 with tone moved 12 toward 50
        argbToHex(Hct.from(compHue, C, moveToneToward50(T)).toInt()),
      ];
    }

    case "triadic":
      return TRIADIC_HUE_SHIFTS.map((shift) =>
        argbToHex(Hct.from(sanitizeDegreesDouble(h + shift), C, T).toInt()),
      );

    case "split-complementary":
      return SPLIT_COMPLEMENTARY_HUE_SHIFTS.map((shift) =>
        argbToHex(Hct.from(sanitizeDegreesDouble(h + shift), C, T).toInt()),
      );

    case "monochromatic": {
      if (role === "accent") return [];
      if (role === "secondary") {
        const hue = sanitizeDegreesDouble(h + secondaryHueShift);
        const baseChroma = C * secondaryChromaRatio;
        const deltaT = T * (1 - secondaryToneRatio);
        return [
          // Option 1: current rule derived from example
          argbToHex(Hct.from(hue, baseChroma, T - deltaT).toInt()),
          // Option 2: tone moves 0.75x as far
          argbToHex(
            Hct.from(
              hue,
              baseChroma,
              Math.max(0, Math.min(100, T - deltaT * MONO_TONE_FACTOR_2)),
            ).toInt(),
          ),
          // Option 3: tone moves 1.25x as far
          argbToHex(
            Hct.from(
              hue,
              baseChroma,
              Math.max(0, Math.min(100, T - deltaT * MONO_TONE_FACTOR_3)),
            ).toInt(),
          ),
          // Option 4: chroma ratio x0.7
          argbToHex(
            Hct.from(
              hue,
              baseChroma * MONO_CHROMA_FACTOR_4,
              T - deltaT,
            ).toInt(),
          ),
        ];
      } else {
        const hue = sanitizeDegreesDouble(h + tertiaryHueShift);
        const baseChroma = C * tertiaryChromaRatio;
        const deltaT = (100 - T) * (1 - tertiaryToneUpRatio);
        return [
          // Option 1: current rule derived from example
          argbToHex(Hct.from(hue, baseChroma, T + deltaT).toInt()),
          // Option 2: tone moves 0.75x as far
          argbToHex(
            Hct.from(
              hue,
              baseChroma,
              Math.max(0, Math.min(100, T + deltaT * MONO_TONE_FACTOR_2)),
            ).toInt(),
          ),
          // Option 3: tone moves 1.25x as far
          argbToHex(
            Hct.from(
              hue,
              baseChroma,
              Math.max(0, Math.min(100, T + deltaT * MONO_TONE_FACTOR_3)),
            ).toInt(),
          ),
          // Option 4: chroma ratio x0.7
          argbToHex(
            Hct.from(
              hue,
              baseChroma * MONO_CHROMA_FACTOR_4,
              T + deltaT,
            ).toInt(),
          ),
        ];
      }
    }

    default:
      return [];
  }
}

/**
 * Returns candidate count for a method and role.
 */
export function getCandidateCount(
  method: string,
  role: CandidateRole = "secondary",
): number {
  const m = normalizeMethodName(method);
  if (m === "analogous") return ANALOGOUS_HUE_SHIFTS.length;
  if (m === "complementary") return 3;
  if (m === "triadic") return TRIADIC_HUE_SHIFTS.length;
  if (m === "split-complementary") return SPLIT_COMPLEMENTARY_HUE_SHIFTS.length;
  if (m === "monochromatic") return role === "accent" ? 0 : 4;
  return 0;
}

/**
 * Whether the given method supports cycling candidate colors.
 */
export function isMethodCandidateSupported(
  method: string,
  role: CandidateRole = "secondary",
): boolean {
  return getCandidateCount(method, role) > 0;
}

/**
 * Resolve candidate hex at specific index. Wraps around safely.
 */
export function getCandidateHex(
  primaryHex: string,
  method: string,
  index: number,
  role: CandidateRole = "secondary",
): string | null {
  const candidates = getCandidates(primaryHex, method, role);
  if (candidates.length === 0) return null;
  const wrapped =
    ((index % candidates.length) + candidates.length) % candidates.length;
  return candidates[wrapped];
}

/**
 * Compute the next candidate index, skipping any candidate whose hex equals otherHex.
 * Wraps around to the first candidate after the last.
 */
export function getNextCandidateIndex(
  primaryHex: string,
  method: string,
  role: CandidateRole,
  currentIndex: number,
  otherHex?: string,
): number {
  const candidates = getCandidates(primaryHex, method, role);
  if (candidates.length <= 1) return 0;

  const otherNorm = otherHex ? normalizeHex(otherHex).toUpperCase() : null;

  for (let step = 1; step <= candidates.length; step++) {
    const next = (currentIndex + step) % candidates.length;
    if (!otherNorm || candidates[next].toUpperCase() !== otherNorm) {
      return next;
    }
  }

  return (currentIndex + 1) % candidates.length;
}

/**
 * Default candidate index for a method and role.
 * Secondary and tertiary must not end up with the same color:
 * they use different candidates by default.
 */
export function getDefaultCandidateIndex(
  primaryHex: string,
  method: string,
  role: CandidateRole,
  otherHex?: string,
): number {
  const candidates = getCandidates(primaryHex, method, role);
  if (candidates.length <= 1) return 0;

  const otherNorm = otherHex ? normalizeHex(otherHex).toUpperCase() : null;

  let defaultIdx = 0;
  if (role === "tertiary") {
    const m = normalizeMethodName(method);
    if (m !== "monochromatic") {
      defaultIdx = 1;
    }
  }

  if (otherNorm && candidates[defaultIdx].toUpperCase() === otherNorm) {
    for (let i = 0; i < candidates.length; i++) {
      const idx = (defaultIdx + i) % candidates.length;
      if (candidates[idx].toUpperCase() !== otherNorm) {
        return idx;
      }
    }
  }

  return defaultIdx;
}
