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
import type { RoleRef, ResolvedRoles } from "./roles.js";

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
  roles: ResolvedRoles;
  roleRefs: Record<string, RoleRef>;
  fixes: ContrastFix[];
  warnings: ContrastWarning[];
}

/**
 * Build the full color system: key colors -> tonal palettes (primary & secondary
 * tone-40 lock; tertiary follows Material or custom/harmony hue+chroma
 * without locking; library palettes untouched in "Material default" mode)
 * -> roles -> WCAG auto-fix. Pure color math, no figma API.
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
    secondaryOption: options.secondaryOption,
    tertiary: tertiaryMethod,
    tertiaryOption: options.tertiaryOption,
    accent: options.accent,
    accentOption: options.accentOption,
    accentEnabled: options.accentEnabled ?? inputs.accentEnabled,
  });
  const {
    palettes,
    primaryMeasuredTone,
    primaryWarning,
    secondaryMeasuredTone,
    secondaryWarning,
  } = buildPalettes(keyColors, {
    applyPrimaryLock: options.applyPrimaryLock ?? true,
    secondaryMode: secondaryMethod === "material" ? "material" : "custom",
    tertiaryMode: tertiaryMethod === "material" ? "material" : "custom",
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
    roles,
    roleRefs,
    fixes,
    warnings,
  };
}
