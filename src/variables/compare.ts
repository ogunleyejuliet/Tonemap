import type { WritePlan } from "./types.js";

export interface SnapshotVariableValue {
  type: "COLOR" | "ALIAS";
  hex?: string;
  targetId?: string;
  targetName?: string;
}

export interface SnapshotVariable {
  id: string; // m3gen_id
  name: string; // current Figma name (user may have renamed it)
  valuesByMode: Record<string, SnapshotVariableValue>; // modeName -> value
}

export interface SnapshotCollection {
  id: string; // m3gen_id
  name: string;
  modes: Record<string, string>; // modeName -> modeId
  inputsJson?: string;
  variables: SnapshotVariable[];
}

export interface SystemSnapshot {
  layout: "standard" | "fallback";
  collections: SnapshotCollection[];
  inputsJson?: string;
}

export interface PaletteChange {
  type: "PALETTE_COLOR_CHANGE";
  id: string;
  varName: string;
  oldHex: string;
  newHex: string;
  formatted: string;
}

export interface RoleAliasChange {
  type: "ROLE_ALIAS_CHANGE";
  id: string;
  varName: string;
  mode: string;
  oldTargetName: string;
  newTargetName: string;
  formatted: string;
}

export interface VariableAdded {
  type: "VARIABLE_ADDED";
  id: string;
  varName: string;
  formatted: string;
}

export interface VariableUntouched {
  type: "VARIABLE_UNTOUCHED";
  id: string;
  varName: string;
  formatted: string;
}

export type VariableChange =
  | PaletteChange
  | RoleAliasChange
  | VariableAdded
  | VariableUntouched;

export interface UpdateDiffResult {
  hasChanges: boolean;
  changes: VariableChange[];
  changedCount: number;
  addedCount: number;
  untouchedCount: number;
  summaryText: string;
}

function normalizeHexUpper(hex: string): string {
  return hex.trim().replace(/^#/, "").toUpperCase();
}

/**
 * Pure comparison function between an existing Figma system snapshot and a new WritePlan.
 * - Matches variables by m3gen_id (not by name) so renamed variables keep their names.
 * - Detects palette color changes, role alias target changes, added variables, and untouched extra variables.
 */
export function compareWritePlan(
  snapshot: SystemSnapshot,
  plan: WritePlan,
): UpdateDiffResult {
  const changes: VariableChange[] = [];
  let changedCount = 0;
  let addedCount = 0;
  let untouchedCount = 0;

  // Build map of existing variables by m3gen_id
  const existingVarsById = new Map<string, SnapshotVariable>();
  for (const col of snapshot.collections) {
    for (const v of col.variables) {
      existingVarsById.set(v.id, v);
    }
  }

  // Set of plan variable IDs seen
  const planVarIdsSeen = new Set<string>();

  for (const planCol of plan.collections) {
    for (const planVar of planCol.variables) {
      planVarIdsSeen.add(planVar.id);
      const existing = existingVarsById.get(planVar.id);

      if (!existing) {
        // Variable in plan but not in existing snapshot -> Added
        addedCount++;
        changes.push({
          type: "VARIABLE_ADDED",
          id: planVar.id,
          varName: planVar.name,
          formatted: `Added: ${planVar.name}`,
        });
        continue;
      }

      // Match found! Check values mode by mode.
      const varDisplayName = existing.name; // Keep existing user-chosen name if renamed
      let varChanged = false;

      for (const [modeName, planVal] of Object.entries(planVar.valuesByMode)) {
        const existingVal = existing.valuesByMode[modeName];

        if (planVal.type === "COLOR") {
          const newHexNorm = normalizeHexUpper(planVal.hex);
          const oldHexNorm = existingVal && existingVal.type === "COLOR" && existingVal.hex
            ? normalizeHexUpper(existingVal.hex)
            : "";

          if (oldHexNorm !== newHexNorm) {
            varChanged = true;
            changes.push({
              type: "PALETTE_COLOR_CHANGE",
              id: planVar.id,
              varName: varDisplayName,
              oldHex: oldHexNorm,
              newHex: newHexNorm,
              formatted: `${varDisplayName}: ${oldHexNorm} to ${newHexNorm}`,
            });
          }
        } else if (planVal.type === "ALIAS") {
          const oldTargetName = existingVal && existingVal.type === "ALIAS" && existingVal.targetName
            ? existingVal.targetName
            : "";
          const newTargetName = planVal.targetName;

          if (oldTargetName !== newTargetName) {
            varChanged = true;
            changes.push({
              type: "ROLE_ALIAS_CHANGE",
              id: planVar.id,
              varName: varDisplayName,
              mode: modeName,
              oldTargetName,
              newTargetName,
              formatted: `${varDisplayName} (${modeName}): ${oldTargetName || "None"} to ${newTargetName}`,
            });
          }
        }
      }

      if (varChanged) {
        changedCount++;
      }
    }
  }

  // Check for existing variables that are no longer in the plan -> Left untouched
  for (const [existingId, existingVar] of existingVarsById.entries()) {
    if (!planVarIdsSeen.has(existingId)) {
      untouchedCount++;
      changes.push({
        type: "VARIABLE_UNTOUCHED",
        id: existingId,
        varName: existingVar.name,
        formatted: `${existingVar.name} (left unchanged)`,
      });
    }
  }

  const hasChanges = changedCount > 0 || addedCount > 0;
  let summaryText = "";
  if (!hasChanges) {
    summaryText = "Nothing to update.";
  } else {
    const parts: string[] = [];
    if (changedCount > 0) parts.push(`${changedCount} variable${changedCount > 1 ? "s" : ""} changed`);
    if (addedCount > 0) parts.push(`${addedCount} variable${addedCount > 1 ? "s" : ""} added`);
    if (untouchedCount > 0) parts.push(`${untouchedCount} left unchanged`);
    summaryText = parts.join(", ");
  }

  return {
    hasChanges,
    changes,
    changedCount,
    addedCount,
    untouchedCount,
    summaryText,
  };
}
