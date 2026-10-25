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
    keyColors: system.keyColors,
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

export const COLLECTION_NAMES = {
  primitives: "primitives",
  colorRoles: "color roles",
} as const;

export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function paletteLabel(name: PaletteName): string {
  return PALETTE_LABELS[name].toLowerCase();
}

export function palettePrefix(name: PaletteName): string {
  return paletteLabel(name).replace(/\s+/g, "-");
}

export function keyColorVariableName(name: PaletteName): string {
  return `key colors/${paletteLabel(name)}`;
}

export function paletteVariableName(name: PaletteName, tone: number): string {
  return `color palettes/${paletteLabel(name)}/${palettePrefix(name)}${tone}`;
}

export function roleVariableName(mode: "light" | "dark", role: RoleName): string {
  return `color ${mode}/${kebab(role)}`;
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

/**
 * Pure function that turns a validated payload into a WritePlan for layout version 4.
 * All collection, group, and variable names are lowercase:
 * 1. "primitives" (modes: ["Value"], layout version: "4"), containing:
 *    - "key colors/<label>" (8 variables)
 *    - "color palettes/<label>/<prefix><tone>" (122 variables, e.g. color palettes/primary/primary40)
 * 2. "color roles" (modes: ["Value"], layout version: "4"), containing:
 *    - "color light/<role>" (57 variables, aliases to primitives)
 *    - "color dark/<role>" (57 variables, aliases to primitives)
 */
export function buildWritePlan(payload: CreatePayload): WritePlan {
  // 1. Build "primitives" Collection Spec
  const primitiveVariables: VariablePlanSpec[] = [];
  const primitiveNamesSeen = new Set<string>();

  // A. Key Colors
  for (const paletteKey of PALETTE_ORDER) {
    const varName = keyColorVariableName(paletteKey);
    primitiveNamesSeen.add(varName);

    const keyHex = payload.keyColors?.[paletteKey] ?? payload.palettes[paletteKey].keyHex;

    primitiveVariables.push({
      id: `key:${paletteKey}`,
      name: varName,
      resolvedType: "COLOR",
      valuesByMode: {
        Value: {
          type: "COLOR",
          hex: keyHex,
        },
      },
    });
  }

  // B. Color Palettes
  for (const paletteKey of PALETTE_ORDER) {
    const palette = payload.palettes[paletteKey];

    for (const tone of palette.tones) {
      const varName = paletteVariableName(paletteKey, tone);
      if (primitiveNamesSeen.has(varName)) {
        throw new Error(`Duplicate primitive variable name: '${varName}'`);
      }
      primitiveNamesSeen.add(varName);

      primitiveVariables.push({
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

  const primitivesCollectionSpec: CollectionPlanSpec = {
    id: "collection:primitives",
    name: COLLECTION_NAMES.primitives,
    modes: ["Value"],
    variables: primitiveVariables,
    pluginData: {
      m3gen: "1",
      m3gen_id: "collection:primitives",
      m3gen_layout: "4",
    },
  };

  // 2. Build "color roles" Collection Spec
  const roleNames = Object.keys(ROLE_DEFINITIONS) as RoleName[];
  const roleVariables: VariablePlanSpec[] = [];
  const roleNamesSeen = new Set<string>();

  // A. Color Light roles
  for (const role of roleNames) {
    const ref = payload.roleRefs[role];
    const varName = roleVariableName("light", role);
    if (roleNamesSeen.has(varName)) {
      throw new Error(`Duplicate role variable name: '${varName}'`);
    }
    roleNamesSeen.add(varName);

    roleVariables.push({
      id: `role:light:${role}`,
      name: varName,
      resolvedType: "COLOR",
      valuesByMode: {
        Value: {
          type: "ALIAS",
          targetId: `palette:${ref.palette}:${ref.lightTone}`,
          targetName: paletteVariableName(ref.palette, ref.lightTone),
        },
      },
    });
  }

  // B. Color Dark roles
  for (const role of roleNames) {
    const ref = payload.roleRefs[role];
    const varName = roleVariableName("dark", role);
    if (roleNamesSeen.has(varName)) {
      throw new Error(`Duplicate role variable name: '${varName}'`);
    }
    roleNamesSeen.add(varName);

    roleVariables.push({
      id: `role:dark:${role}`,
      name: varName,
      resolvedType: "COLOR",
      valuesByMode: {
        Value: {
          type: "ALIAS",
          targetId: `palette:${ref.palette}:${ref.darkTone}`,
          targetName: paletteVariableName(ref.palette, ref.darkTone),
        },
      },
    });
  }

  const colorRolesCollectionSpec: CollectionPlanSpec = {
    id: "collection:color_roles",
    name: COLLECTION_NAMES.colorRoles,
    modes: ["Value"],
    variables: roleVariables,
    pluginData: {
      m3gen: "1",
      m3gen_id: "collection:color_roles",
      m3gen_layout: "4",
    },
  };

  const totalVariables = primitiveVariables.length + roleVariables.length;

  return {
    collections: [primitivesCollectionSpec, colorRolesCollectionSpec],
    totalVariables,
  };
}
