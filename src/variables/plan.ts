import type { PaletteName } from "../colors/keyColors.js";
import { ROLE_DEFINITIONS, type RoleName } from "../colors/roles.js";
import type { ColorSystem } from "../colors/system.js";
import type {
  CreatePayload,
  WritePlan,
  CollectionPlanSpec,
  VariablePlanSpec,
} from "./types.js";

export function buildCreatePayload(system: ColorSystem): CreatePayload {
  return {
    palettes: system.palettes,
    roles: system.roles,
    roleRefs: system.roleRefs,
  };
}

export const PALETTE_ORDER: PaletteName[] = [
  "primary",
  "secondary",
  "tertiary",
  "neutral",
  "neutralVariant",
  "error",
  "warning",
  "success",
];

export const PALETTE_LABELS: Record<PaletteName, string> = {
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
  neutral: "Neutral",
  neutralVariant: "Neutral Variant",
  error: "Error",
  warning: "Warning",
  success: "Success",
};

export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function isValidHex(hex: unknown): boolean {
  if (typeof hex !== "string") return false;
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}

export type ValidationResult =
  | { valid: true; payload: CreatePayload }
  | { valid: false; error: string };

/**
 * Validate that payload has all required palettes, tones, valid hex strings,
 * and resolving role references before writing any variables.
 */
export function validatePayload(rawPayload: unknown): ValidationResult {
  if (!rawPayload || typeof rawPayload !== "object") {
    return { valid: false, error: "Payload must be a non-null object." };
  }

  const p = rawPayload as Partial<CreatePayload>;
  if (!p.palettes || typeof p.palettes !== "object") {
    return { valid: false, error: "Payload is missing required 'palettes' object." };
  }

  if (!p.roleRefs || typeof p.roleRefs !== "object") {
    return { valid: false, error: "Payload is missing required 'roleRefs' object." };
  }

  // Check palettes
  for (const key of PALETTE_ORDER) {
    const palette = p.palettes[key];
    if (!palette) {
      return { valid: false, error: `Payload is missing palette '${key}'.` };
    }
    if (!Array.isArray(palette.tones) || palette.tones.length === 0) {
      return { valid: false, error: `Palette '${key}' has no tones array.` };
    }
    if (!palette.hex || typeof palette.hex !== "object") {
      return { valid: false, error: `Palette '${key}' has no hex mapping object.` };
    }
    for (const tone of palette.tones) {
      const hexVal = palette.hex[tone];
      if (!isValidHex(hexVal)) {
        return {
          valid: false,
          error: `Palette '${key}' tone ${tone} has invalid hex value '${String(hexVal)}'.`,
        };
      }
    }
  }

  // Check role refs
  const roleNames = Object.keys(ROLE_DEFINITIONS) as RoleName[];
  for (const role of roleNames) {
    const ref = p.roleRefs[role];
    if (!ref) {
      return { valid: false, error: `Payload is missing role reference for '${role}'.` };
    }
    const targetPalette = p.palettes[ref.palette];
    if (!targetPalette) {
      return {
        valid: false,
        error: `Role '${role}' references unknown palette '${ref.palette}'.`,
      };
    }
    if (!targetPalette.tones.includes(ref.lightTone)) {
      return {
        valid: false,
        error: `Role '${role}' light tone ${ref.lightTone} does not exist in palette '${ref.palette}'.`,
      };
    }
    if (!targetPalette.tones.includes(ref.darkTone)) {
      return {
        valid: false,
        error: `Role '${role}' dark tone ${ref.darkTone} does not exist in palette '${ref.palette}'.`,
      };
    }
  }

  return { valid: true, payload: p as CreatePayload };
}

export interface BuildPlanOptions {
  fallback?: boolean;
}

/**
 * Pure function that turns a validated payload into a WritePlan.
 * No Figma API calls or globals.
 */
export function buildWritePlan(
  payload: CreatePayload,
  options: BuildPlanOptions = {},
): WritePlan {
  const useFallback = options.fallback ?? false;

  // 1. Build Palette Collection Spec
  const paletteVariables: VariablePlanSpec[] = [];
  const paletteNamesSeen = new Set<string>();

  for (const paletteKey of PALETTE_ORDER) {
    const palette = payload.palettes[paletteKey];
    const paletteLabel = PALETTE_LABELS[paletteKey];

    for (const tone of palette.tones) {
      const varName = `${paletteLabel}/${tone}`;
      if (paletteNamesSeen.has(varName)) {
        throw new Error(`Duplicate palette variable name: '${varName}'`);
      }
      paletteNamesSeen.add(varName);

      paletteVariables.push({
        id: `palette:${paletteKey}:${tone}`,
        name: varName,
        resolvedType: "COLOR",
        valuesByMode: {
          Value: {
            type: "COLOR",
            hex: palette.hex[tone],
          },
        },
      });
    }
  }

  const paletteCollectionSpec: CollectionPlanSpec = {
    id: "collection:palette",
    name: "Palette",
    modes: ["Value"],
    variables: paletteVariables,
    pluginData: {
      m3gen: "1",
      m3gen_id: "collection:palette",
    },
  };

  const roleNames = Object.keys(ROLE_DEFINITIONS) as RoleName[];

  if (!useFallback) {
    // 2. Standard Plan: Single "Color" collection with modes ["Light", "Dark"]
    const colorVariables: VariablePlanSpec[] = [];
    const colorNamesSeen = new Set<string>();

    for (const role of roleNames) {
      const ref = payload.roleRefs[role];
      const varName = `color/${kebab(role)}`;
      if (colorNamesSeen.has(varName)) {
        throw new Error(`Duplicate color variable name: '${varName}'`);
      }
      colorNamesSeen.add(varName);

      const lightLabel = PALETTE_LABELS[ref.palette];
      const darkLabel = PALETTE_LABELS[ref.palette];

      colorVariables.push({
        id: `role:${role}`,
        name: varName,
        resolvedType: "COLOR",
        valuesByMode: {
          Light: {
            type: "ALIAS",
            targetId: `palette:${ref.palette}:${ref.lightTone}`,
            targetName: `${lightLabel}/${ref.lightTone}`,
          },
          Dark: {
            type: "ALIAS",
            targetId: `palette:${ref.palette}:${ref.darkTone}`,
            targetName: `${darkLabel}/${ref.darkTone}`,
          },
        },
      });
    }

    const colorCollectionSpec: CollectionPlanSpec = {
      id: "collection:color",
      name: "Color",
      modes: ["Light", "Dark"],
      variables: colorVariables,
      pluginData: {
        m3gen: "1",
        m3gen_id: "collection:color",
      },
    };

    const totalVariables = paletteVariables.length + colorVariables.length;

    return {
      collections: [paletteCollectionSpec, colorCollectionSpec],
      totalVariables,
      useFallback: false,
    };
  } else {
    // 3. Fallback Plan: "Color Light" and "Color Dark" collections
    const lightVariables: VariablePlanSpec[] = [];
    const darkVariables: VariablePlanSpec[] = [];

    for (const role of roleNames) {
      const ref = payload.roleRefs[role];
      const varName = `color/${kebab(role)}`;

      const lightLabel = PALETTE_LABELS[ref.palette];
      const darkLabel = PALETTE_LABELS[ref.palette];

      lightVariables.push({
        id: `role:${role}:light`,
        name: varName,
        resolvedType: "COLOR",
        valuesByMode: {
          Light: {
            type: "ALIAS",
            targetId: `palette:${ref.palette}:${ref.lightTone}`,
            targetName: `${lightLabel}/${ref.lightTone}`,
          },
        },
      });

      darkVariables.push({
        id: `role:${role}:dark`,
        name: varName,
        resolvedType: "COLOR",
        valuesByMode: {
          Dark: {
            type: "ALIAS",
            targetId: `palette:${ref.palette}:${ref.darkTone}`,
            targetName: `${darkLabel}/${ref.darkTone}`,
          },
        },
      });
    }

    const colorLightSpec: CollectionPlanSpec = {
      id: "collection:color_light",
      name: "Color Light",
      modes: ["Light"],
      variables: lightVariables,
      pluginData: {
        m3gen: "1",
        m3gen_id: "collection:color_light",
      },
    };

    const colorDarkSpec: CollectionPlanSpec = {
      id: "collection:color_dark",
      name: "Color Dark",
      modes: ["Dark"],
      variables: darkVariables,
      pluginData: {
        m3gen: "1",
        m3gen_id: "collection:color_dark",
      },
    };

    const totalVariables =
      paletteVariables.length + lightVariables.length + darkVariables.length;

    return {
      collections: [paletteCollectionSpec, colorLightSpec, colorDarkSpec],
      totalVariables,
      useFallback: true,
    };
  }
}
