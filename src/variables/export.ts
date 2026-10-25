import type { SystemSnapshot, SnapshotVariable, SnapshotCollection } from "./compare.js";
import type { WritePlan } from "./types.js";
import { COLLECTION_NAMES } from "./plan.js";

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
  keyColorTokens: number;
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
 * Converts a WritePlan into a SystemSnapshot structure for testing or exporting.
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
      layoutVersion: colSpec.pluginData?.m3gen_layout || "4",
    };
  });

  return {
    layoutVersion: "4",
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

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: PaletteToken | RoleToken,
): void {
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
 * Only exports collections tagged with layout version 4 ("primitives" and "color roles").
 * No Figma global dependencies.
 */
export function exportSnapshotToTokensJson(input: SystemSnapshot | WritePlan): ExportResult {
  const snapshot: SystemSnapshot =
    "collections" in input && !("totalVariables" in input)
      ? (input as SystemSnapshot)
      : writePlanToSnapshot(input as WritePlan);

  const output: Record<string, Record<string, unknown>> = {
    [COLLECTION_NAMES.primitives]: {},
    [COLLECTION_NAMES.colorRoles]: {},
  };

  // Only export collections tagged with layout version 4 ("primitives" and "color roles")
  const validCols = snapshot.collections.filter((col) => {
    if (col.layoutVersion && col.layoutVersion !== "4") return false;
    const nameLower = col.name.toLowerCase();
    return (
      nameLower === COLLECTION_NAMES.primitives ||
      nameLower === COLLECTION_NAMES.colorRoles
    );
  });

  // Map variables across collections to resolve aliases
  const varsById = new Map<string, { colKey: string; v: SnapshotVariable }>();
  for (const col of validCols) {
    const colKey = col.name.toLowerCase();
    for (const v of col.variables) {
      varsById.set(v.id, { colKey, v });
    }
  }

  let keyColorTokens = 0;
  let paletteTokens = 0;
  let roleTokensLight = 0;
  let roleTokensDark = 0;

  for (const col of validCols) {
    const colKey = col.name.toLowerCase();
    if (!output[colKey]) {
      output[colKey] = {};
    }

    for (const v of col.variables) {
      const path = v.name.split("/").map((s) => s.toLowerCase());
      const firstValKey = Object.keys(v.valuesByMode)[0];
      const valObj = firstValKey ? v.valuesByMode[firstValKey] : undefined;
      if (!valObj) continue;

      if (valObj.type === "COLOR") {
        const hex = valObj.hex || "#000000";
        const hex8 = normalizeHex8(hex);
        const token: PaletteToken = {
          type: "color",
          value: hex8,
          blendMode: "normal",
        };
        setNestedValue(output[colKey], path, token);
        if (path[0] === "key colors") {
          keyColorTokens++;
        } else if (path[0] === "color palettes") {
          paletteTokens++;
        }
      } else if (valObj.type === "ALIAS") {
        let targetColKey: string = COLLECTION_NAMES.primitives;
        let targetName = "";

        if (valObj.targetId && varsById.has(valObj.targetId)) {
          const targetInfo = varsById.get(valObj.targetId)!;
          targetColKey = targetInfo.colKey;
          targetName = targetInfo.v.name;
        } else if (valObj.targetName) {
          targetName = valObj.targetName;
        } else {
          targetName = valObj.targetId || "";
        }

        const targetSegments = targetName.split("/").map((s) => s.toLowerCase());
        const refPath = `${targetColKey}.${targetSegments.join(".")}`;
        const refValue = `{${refPath}}`;

        const token: RoleToken = {
          description: "",
          type: "color",
          value: refValue,
        };
        setNestedValue(output[colKey], path, token);
        if (path[0] === "color light") {
          roleTokensLight++;
        } else if (path[0] === "color dark") {
          roleTokensDark++;
        }
      }
    }
  }

  const counts: ExportCounts = {
    keyColorTokens,
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
