import {
  resolveKeyColors,
  type KeyColorInputs,
  type KeyColorOptions,
  type ResolvedKeyColors,
} from "./keyColors.js";
import {
  buildPalettes,
  type BuildPalettesResult,
} from "./palettes.js";
import {
  checkAndFixContrast,
  type ContrastFix,
  type ContrastWarning,
} from "./contrast.js";
import type { RoleName, RoleRef, ResolvedRoles } from "./roles.js";

export interface BuildSystemOptions extends KeyColorOptions {
  /** Default true. Set false to skip WCAG auto-fix (warnings still reported). */
  autoFixContrast?: boolean;
  /** Default true. Set false to skip the primary tone-40 lock (for library comparisons). */
  applyPrimaryLock?: boolean;
}

export interface ColorSystem {
  keyColors: ResolvedKeyColors;
  palettes: BuildPalettesResult["palettes"];
  primaryMeasuredTone: number;
  primaryWarning: string | null;
  secondaryMeasuredTone: number;
  secondaryWarning: string | null;
  tertiaryMeasuredTone: number;
  tertiaryWarning: string | null;
  roles: ResolvedRoles;
  roleRefs: Record<RoleName, RoleRef>;
  fixes: ContrastFix[];
  warnings: ContrastWarning[];
}

/**
 * Build the full color system: key colors -> tonal palettes (primary lock,
 * plus secondary/tertiary locks in harmony/custom modes; the library
 * palettes untouched in "Material default" mode) -> roles -> WCAG auto-fix.
 * Pure color math, no figma API.
 */
export function buildColorSystem(
  inputs: KeyColorInputs,
  options: BuildSystemOptions = {},
): ColorSystem {
  // An explicitly typed hex is treated as custom even without a method,
  // matching resolveKeyColors; only a true default uses the library palette.
  const secondaryMethod =
    options.secondary ?? (inputs.secondary ? "custom" : "material");
  const tertiaryMethod =
    options.tertiary ?? (inputs.tertiary ? "custom" : "material");
  const keyColors = resolveKeyColors(inputs, {
    secondary: secondaryMethod,
    tertiary: tertiaryMethod,
  });
  const {
    palettes,
    primaryMeasuredTone,
    primaryWarning,
    secondaryMeasuredTone,
    secondaryWarning,
    tertiaryMeasuredTone,
    tertiaryWarning,
  } = buildPalettes(keyColors, {
    applyPrimaryLock: options.applyPrimaryLock ?? true,
    secondaryMode: secondaryMethod === "material" ? "material" : "locked",
    tertiaryMode: tertiaryMethod === "material" ? "material" : "locked",
  });
  const { roles, roleRefs, fixes, warnings } = checkAndFixContrast(palettes, {
    enabled: options.autoFixContrast ?? true,
  });
  return {
    keyColors,
    palettes,
    primaryMeasuredTone,
    primaryWarning,
    secondaryMeasuredTone,
    secondaryWarning,
    tertiaryMeasuredTone,
    tertiaryWarning,
    roles,
    roleRefs,
    fixes,
    warnings,
  };
}
