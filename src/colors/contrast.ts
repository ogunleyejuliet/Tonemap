import { hexToArgb } from "./hex.js";
import { redFromArgb, greenFromArgb, blueFromArgb } from "@material/material-color-utilities";
import type { BuiltPalette } from "./palettes.js";
import type { PaletteName } from "./keyColors.js";
import { ROLE_DEFINITIONS, type RoleName, type RoleRef, type ResolvedRoles } from "./roles.js";
import { paletteHex } from "./palettes.js";

export const CONTRAST_THRESHOLD = 4.5;

export type Mode = "light" | "dark";

export interface ContrastPair {
  bg: RoleName;
  fg: RoleName;
}

/** The 12 (bg, fg) pairs checked in each mode. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { bg: "primary", fg: "onPrimary" },
  { bg: "primaryContainer", fg: "onPrimaryContainer" },
  { bg: "secondary", fg: "onSecondary" },
  { bg: "secondaryContainer", fg: "onSecondaryContainer" },
  { bg: "tertiary", fg: "onTertiary" },
  { bg: "tertiaryContainer", fg: "onTertiaryContainer" },
  { bg: "error", fg: "onError" },
  { bg: "errorContainer", fg: "onErrorContainer" },
  { bg: "warning", fg: "onWarning" },
  { bg: "warningContainer", fg: "onWarningContainer" },
  { bg: "success", fg: "onSuccess" },
  { bg: "successContainer", fg: "onSuccessContainer" },
  // Fixed role contrast pairs
  { bg: "primaryFixed", fg: "onPrimaryFixed" },
  { bg: "primaryFixedDim", fg: "onPrimaryFixed" },
  { bg: "primaryFixed", fg: "onPrimaryFixedVariant" },
  { bg: "primaryFixedDim", fg: "onPrimaryFixedVariant" },
  { bg: "secondaryFixed", fg: "onSecondaryFixed" },
  { bg: "secondaryFixedDim", fg: "onSecondaryFixed" },
  { bg: "secondaryFixed", fg: "onSecondaryFixedVariant" },
  { bg: "secondaryFixedDim", fg: "onSecondaryFixedVariant" },
  { bg: "tertiaryFixed", fg: "onTertiaryFixed" },
  { bg: "tertiaryFixedDim", fg: "onTertiaryFixed" },
  { bg: "tertiaryFixed", fg: "onTertiaryFixedVariant" },
  { bg: "tertiaryFixedDim", fg: "onTertiaryFixedVariant" },
];

export interface ContrastFix {
  role: RoleName;
  mode: Mode;
  oldTone: number;
  newTone: number;
  contrastBefore: number;
  contrastAfter: number;
}

export interface ContrastWarning {
  bgRole: RoleName;
  fgRole: RoleName;
  mode: Mode;
  contrast: number;
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a canonical hex color. */
export function relativeLuminance(hex: string): number {
  const argb = hexToArgb(hex);
  const r = channelLuminance(redFromArgb(argb));
  const g = channelLuminance(greenFromArgb(argb));
  const b = channelLuminance(blueFromArgb(argb));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two hex colors (1..21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface FixContrastOptions {
  /** Default true. When false, detect low contrast but change nothing. */
  enabled?: boolean;
}

function cloneRefs(): Record<RoleName, RoleRef> {
  return JSON.parse(JSON.stringify(ROLE_DEFINITIONS)) as Record<RoleName, RoleRef>;
}

function resolveWithRefs(
  palettes: Record<PaletteName, BuiltPalette>,
  refs: Record<RoleName, RoleRef>,
): ResolvedRoles {
  const light = {} as Record<RoleName, string>;
  const dark = {} as Record<RoleName, string>;
  for (const [role, ref] of Object.entries(refs) as Array<[RoleName, RoleRef]>) {
    light[role] = paletteHex(palettes, ref.palette, ref.lightTone);
    dark[role] = paletteHex(palettes, ref.palette, ref.darkTone);
  }
  return { light, dark };
}

function toneOf(refs: Record<RoleName, RoleRef>, role: RoleName, mode: Mode): number {
  return mode === "light" ? refs[role].lightTone : refs[role].darkTone;
}

function setTone(
  refs: Record<RoleName, RoleRef>,
  role: RoleName,
  mode: Mode,
  tone: number,
): void {
  if (mode === "light") refs[role].lightTone = tone;
  else refs[role].darkTone = tone;
}

/**
 * Check every (X, on-X) pair per mode against WCAG 4.5 using the actual
 * (post-lock) colors. When enabled (default), repoint each failing on-X role
 * at the tone in the same palette that passes 4.5 and is numerically closest
 * to the default tone. Only on-X tones move; background tones (including
 * primary tone 40) are never changed.
 */
export function checkAndFixContrast(
  palettes: Record<PaletteName, BuiltPalette>,
  options: FixContrastOptions = {},
): {
  roles: ResolvedRoles;
  roleRefs: Record<RoleName, RoleRef>;
  fixes: ContrastFix[];
  warnings: ContrastWarning[];
} {
  const enabled = options.enabled ?? true;
  const refs = cloneRefs();
  const fixes: ContrastFix[] = [];
  const warnings: ContrastWarning[] = [];

  for (const mode of ["light", "dark"] as Mode[]) {
    for (const { bg, fg } of CONTRAST_PAIRS) {
      const bgTone = toneOf(refs, bg, mode);
      const fgTone = toneOf(refs, fg, mode);
      const bgHex = paletteHex(palettes, refs[bg].palette, bgTone);
      const fgHex = paletteHex(palettes, refs[fg].palette, fgTone);
      const before = contrastRatio(bgHex, fgHex);
      if (before >= CONTRAST_THRESHOLD) continue;

      warnings.push({ bgRole: bg, fgRole: fg, mode, contrast: before });
      if (!enabled) continue;

      const paletteName = refs[fg].palette;
      const candidates = palettes[paletteName].tones;
      let best: number | null = null;
      let bestDist = Infinity;
      let bestContrast = 0;
      for (const t of candidates) {
        const candHex = paletteHex(palettes, paletteName, t);
        const ratio = contrastRatio(bgHex, candHex);
        if (ratio < CONTRAST_THRESHOLD) continue;
        const dist = Math.abs(t - fgTone);
        if (dist < bestDist || (dist === bestDist && ratio > bestContrast)) {
          best = t;
          bestDist = dist;
          bestContrast = ratio;
        }
      }
      if (best === null || best === fgTone) continue;
      setTone(refs, fg, mode, best);
      const afterHex = paletteHex(palettes, paletteName, best);
      const after = contrastRatio(bgHex, afterHex);
      fixes.push({
        role: fg,
        mode,
        oldTone: fgTone,
        newTone: best,
        contrastBefore: before,
        contrastAfter: after,
      });
    }
  }

  return { roles: resolveWithRefs(palettes, refs), roleRefs: refs, fixes, warnings };
}
