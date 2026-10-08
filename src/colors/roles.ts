import type { PaletteName } from "./keyColors.js";
import type { BuiltPalette } from "./palettes.js";
import { paletteHex } from "./palettes.js";

export interface RoleRef {
  palette: PaletteName;
  lightTone: number;
  darkTone: number;
}

/**
 * Every role as (palette name + tone number) per mode, exactly as specified:
 * accent roles follow P40/P80, on-P100/P20, container-P90/P30,
 * on-container-P30/P90; surfaces use the listed N/NV tones.
 */
export const ROLE_DEFINITIONS = {
  // Primary
  primary: { palette: "primary", lightTone: 40, darkTone: 80 },
  onPrimary: { palette: "primary", lightTone: 100, darkTone: 20 },
  primaryContainer: { palette: "primary", lightTone: 90, darkTone: 30 },
  onPrimaryContainer: { palette: "primary", lightTone: 30, darkTone: 90 },
  // Secondary
  secondary: { palette: "secondary", lightTone: 40, darkTone: 80 },
  onSecondary: { palette: "secondary", lightTone: 100, darkTone: 20 },
  secondaryContainer: { palette: "secondary", lightTone: 90, darkTone: 30 },
  onSecondaryContainer: { palette: "secondary", lightTone: 30, darkTone: 90 },
  // Tertiary
  tertiary: { palette: "tertiary", lightTone: 40, darkTone: 80 },
  onTertiary: { palette: "tertiary", lightTone: 100, darkTone: 20 },
  tertiaryContainer: { palette: "tertiary", lightTone: 90, darkTone: 30 },
  onTertiaryContainer: { palette: "tertiary", lightTone: 30, darkTone: 90 },
  // Error
  error: { palette: "error", lightTone: 40, darkTone: 80 },
  onError: { palette: "error", lightTone: 100, darkTone: 20 },
  errorContainer: { palette: "error", lightTone: 90, darkTone: 30 },
  onErrorContainer: { palette: "error", lightTone: 30, darkTone: 90 },
  // Warning
  warning: { palette: "warning", lightTone: 40, darkTone: 80 },
  onWarning: { palette: "warning", lightTone: 100, darkTone: 20 },
  warningContainer: { palette: "warning", lightTone: 90, darkTone: 30 },
  onWarningContainer: { palette: "warning", lightTone: 30, darkTone: 90 },
  // Success
  success: { palette: "success", lightTone: 40, darkTone: 80 },
  onSuccess: { palette: "success", lightTone: 100, darkTone: 20 },
  successContainer: { palette: "success", lightTone: 90, darkTone: 30 },
  onSuccessContainer: { palette: "success", lightTone: 30, darkTone: 90 },
  // Surfaces
  background: { palette: "neutral", lightTone: 98, darkTone: 6 },
  onBackground: { palette: "neutral", lightTone: 10, darkTone: 90 },
  surface: { palette: "neutral", lightTone: 98, darkTone: 6 },
  onSurface: { palette: "neutral", lightTone: 10, darkTone: 90 },
  surfaceVariant: { palette: "neutralVariant", lightTone: 90, darkTone: 30 },
  onSurfaceVariant: { palette: "neutralVariant", lightTone: 30, darkTone: 80 },
  outline: { palette: "neutralVariant", lightTone: 50, darkTone: 60 },
  outlineVariant: { palette: "neutralVariant", lightTone: 80, darkTone: 30 },
  inverseSurface: { palette: "neutral", lightTone: 20, darkTone: 90 },
  inverseOnSurface: { palette: "neutral", lightTone: 95, darkTone: 20 },
  inversePrimary: { palette: "primary", lightTone: 80, darkTone: 40 },
  surfaceDim: { palette: "neutral", lightTone: 87, darkTone: 6 },
  surfaceBright: { palette: "neutral", lightTone: 98, darkTone: 24 },
  surfaceContainerLowest: { palette: "neutral", lightTone: 100, darkTone: 4 },
  surfaceContainerLow: { palette: "neutral", lightTone: 96, darkTone: 10 },
  surfaceContainer: { palette: "neutral", lightTone: 94, darkTone: 12 },
  surfaceContainerHigh: { palette: "neutral", lightTone: 92, darkTone: 17 },
  surfaceContainerHighest: { palette: "neutral", lightTone: 90, darkTone: 22 },
  shadow: { palette: "neutral", lightTone: 0, darkTone: 0 },
  scrim: { palette: "neutral", lightTone: 0, darkTone: 0 },
  surfaceTint: { palette: "primary", lightTone: 40, darkTone: 80 },

  // Fixed roles
  primaryFixed: { palette: "primary", lightTone: 90, darkTone: 90 },
  primaryFixedDim: { palette: "primary", lightTone: 80, darkTone: 80 },
  onPrimaryFixed: { palette: "primary", lightTone: 10, darkTone: 10 },
  onPrimaryFixedVariant: { palette: "primary", lightTone: 30, darkTone: 30 },
  secondaryFixed: { palette: "secondary", lightTone: 90, darkTone: 90 },
  secondaryFixedDim: { palette: "secondary", lightTone: 80, darkTone: 80 },
  onSecondaryFixed: { palette: "secondary", lightTone: 10, darkTone: 10 },
  onSecondaryFixedVariant: { palette: "secondary", lightTone: 30, darkTone: 30 },
  tertiaryFixed: { palette: "tertiary", lightTone: 90, darkTone: 90 },
  tertiaryFixedDim: { palette: "tertiary", lightTone: 80, darkTone: 80 },
  onTertiaryFixed: { palette: "tertiary", lightTone: 10, darkTone: 10 },
  onTertiaryFixedVariant: { palette: "tertiary", lightTone: 30, darkTone: 30 },
} as const satisfies Record<string, RoleRef>;

export type RoleName = keyof typeof ROLE_DEFINITIONS;

export interface ResolvedRoles {
  light: Record<RoleName, string>;
  dark: Record<RoleName, string>;
}

/** Resolve every role to its actual hex color per mode. */
export function resolveRoles(
  palettes: Record<PaletteName, BuiltPalette>,
): ResolvedRoles {
  const light = {} as Record<RoleName, string>;
  const dark = {} as Record<RoleName, string>;
  for (const [role, ref] of Object.entries(ROLE_DEFINITIONS) as Array<
    [RoleName, RoleRef]
  >) {
    light[role] = paletteHex(palettes, ref.palette, ref.lightTone);
    dark[role] = paletteHex(palettes, ref.palette, ref.darkTone);
  }
  return { light, dark };
}
