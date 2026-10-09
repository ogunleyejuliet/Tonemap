import type { SystemSnapshot, SnapshotVariable, SnapshotCollection, SnapshotVariableValue } from "./compare.js";
import type { WritePlan } from "./types.js";

export interface PaletteToken {
  type: "color";
  value: string;
  blendMode: "normal";
}

export interface RoleToken {
  description: string;
  type: "color";
  value: string;
}

export interface ExportCounts {
  paletteTokens: number;
  roleTokensLight: number;
  roleTokensDark: number;
  totalRoleTokens: number;
}

export interface ExportResult {
  jsonString: string;
  jsonObject: Record<string, unknown>;
  counts: ExportCounts;
}

/**
 * Converts a WritePlan into a SystemSnapshot structure.
 */
export function writePlanToSnapshot(plan: WritePlan): SystemSnapshot {
  const snapshotCols: SnapshotCollection[] = plan.collections.map((colSpec) => {
    const modesObj: Record<string, string> = {};
    colSpec.modes.forEach((m) => {
      modesObj[m] = m;
    });

    const vars: SnapshotVariable[] = colSpec.variables.map((vSpec) => {
      const valuesByMode: SnapshotVariable["valuesByMode"] = {};
      for (const [modeName, valPlan] of Object.entries(vSpec.valuesByMode)) {
        if (valPlan.type === "COLOR") {
          valuesByMode[modeName] = { type: "COLOR", hex: valPlan.hex };
        } else if (valPlan.type === "ALIAS") {
          valuesByMode[modeName] = {
            type: "ALIAS",
            targetId: valPlan.targetId,
            targetName: valPlan.targetName,
          };
        }
      }
      return {
        id: vSpec.id,
        name: vSpec.name,
        valuesByMode,
      };
    });

    return {
      id: colSpec.pluginData?.m3gen_id || colSpec.id || colSpec.name,
      name: colSpec.name,
      modes: modesObj,
      variables: vars,
    };
  });

  return {
    layout: plan.useFallback ? "fallback" : "standard",
    collections: snapshotCols,
  };
}

function normalizeHex8(hex: string): string {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length === 6) {
    clean = clean + "ff";
  }
  return `#${clean.toLowerCase()}`;
}

function setNestedValue(obj: Record<string, unknown>, path: string[], value: PaletteToken | RoleToken): void {
  let current = obj as Record<string, Record<string, unknown>>;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, Record<string, unknown>>;
  }
  current[path[path.length - 1]] = value as unknown as Record<string, unknown>;
}

/**
 * Pure exporter function. Converts a SystemSnapshot or WritePlan into tokens.json structure.
 * No figma global dependencies.
 */
export function exportSnapshotToTokensJson(input: SystemSnapshot | WritePlan): ExportResult {
  const snapshot: SystemSnapshot = "collections" in input && "layout" in input
    ? input as SystemSnapshot
    : writePlanToSnapshot(input as WritePlan);

  const output: Record<string, Record<string, unknown>> = {
    palette: {},
    "color light": {},
    "color dark": {},
  };

  // Build palette variable maps for alias target resolution
  const paletteVarsById = new Map<string, SnapshotVariable>();
  const paletteVarsByName = new Map<string, SnapshotVariable>();

  for (const col of snapshot.collections) {
    const isPaletteCol = col.id === "collection:palette" || col.name.toLowerCase() === "palette";
    if (isPaletteCol) {
      for (const v of col.variables) {
        paletteVarsById.set(v.id, v);
        paletteVarsByName.set(v.name, v);
      }
    }
  }

  let paletteTokens = 0;
  let roleTokensLight = 0;
  let roleTokensDark = 0;

  // Helper to format role references like {palette.primary.40} or {palette.neutral variant.90}
  function resolveRoleRef(val: SnapshotVariableValue): string {
    if (val.type !== "ALIAS") {
      return val.hex || "";
    }

    let targetName = "";
    if (val.targetId && paletteVarsById.has(val.targetId)) {
      targetName = paletteVarsById.get(val.targetId)!.name;
    } else if (val.targetName) {
      targetName = val.targetName;
    } else {
      targetName = val.targetId || "";
    }

    const segments = targetName.split("/").map((s) => s.toLowerCase());
    const refPath = segments.join(".");
    return `{palette.${refPath}}`;
  }

  // Process collections
  for (const col of snapshot.collections) {
    const colNameLower = col.name.toLowerCase();
    const isPaletteCol = col.id === "collection:palette" || colNameLower === "palette";

    if (isPaletteCol) {
      for (const v of col.variables) {
        const path = v.name.split("/").map((s) => s.toLowerCase());
        const firstValKey = Object.keys(v.valuesByMode)[0];
        const valObj = firstValKey ? v.valuesByMode[firstValKey] : undefined;
        const hex = valObj?.hex || "#000000";
        const hex8 = normalizeHex8(hex);

        const token: PaletteToken = {
          type: "color",
          value: hex8,
          blendMode: "normal",
        };

        setNestedValue(output["palette"], path, token);
        paletteTokens++;
      }
    } else {
      // Role collection(s)
      for (const v of col.variables) {
        const path = v.name.split("/").map((s) => s.toLowerCase());

        // Check Light mode
        if (colNameLower === "color light" || colNameLower === "color") {
          const valLight = v.valuesByMode["Light"] || (colNameLower === "color light" ? Object.values(v.valuesByMode)[0] : undefined);
          if (valLight) {
            const ref = resolveRoleRef(valLight);
            const token: RoleToken = {
              description: "",
              type: "color",
              value: ref,
            };
            setNestedValue(output["color light"], path, token);
            roleTokensLight++;
          }
        }

        // Check Dark mode
        if (colNameLower === "color dark" || colNameLower === "color") {
          const valDark = v.valuesByMode["Dark"] || (colNameLower === "color dark" ? Object.values(v.valuesByMode)[0] : undefined);
          if (valDark) {
            const ref = resolveRoleRef(valDark);
            const token: RoleToken = {
              description: "",
              type: "color",
              value: ref,
            };
            setNestedValue(output["color dark"], path, token);
            roleTokensDark++;
          }
        }
      }
    }
  }

  const counts: ExportCounts = {
    paletteTokens,
    roleTokensLight,
    roleTokensDark,
    totalRoleTokens: roleTokensLight + roleTokensDark,
  };

  const jsonString = JSON.stringify(output, null, 2);

  return {
    jsonString,
    jsonObject: output,
    counts,
  };
}
