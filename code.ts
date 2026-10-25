import { validatePayload, buildWritePlan, COLLECTION_NAMES } from "./src/variables/plan.js";
import { compareWritePlan, type SystemSnapshot, type SnapshotCollection, type SnapshotVariable } from "./src/variables/compare.js";
import type { CreateResult } from "./src/variables/types.js";
import { exportSnapshotToTokensJson } from "./src/variables/export.js";

figma.showUI(__html__, { width: 900, height: 640, themeColors: true });

function hexToFigmaRgb(hex: string): { r: number; g: number; b: number; a: number } {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  const num = parseInt(clean, 16);
  return {
    r: ((num >> 16) & 0xff) / 255,
    g: ((num >> 8) & 0xff) / 255,
    b: (num & 0xff) / 255,
    a: 1,
  };
}

function figmaRgbToHex(rgb: { r: number; g: number; b: number }): string {
  const r = Math.round(rgb.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(rgb.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(rgb.b * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

const OLD_LAYOUT_ERROR =
  "This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create.";

export async function getSystemSnapshot(): Promise<{
  snapshot: SystemSnapshot | null;
  primitivesCol: VariableCollection | null;
  isOldLayout: boolean;
}> {
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const pluginCols = existingCollections.filter((c) => c.getPluginData("m3gen") === "1");
  if (pluginCols.length === 0) {
    return { snapshot: null, primitivesCol: null, isOldLayout: false };
  }

  // Check if any old layout collections exist (tagged m3gen=1 without m3gen_layout="4")
  const hasOldLayout = pluginCols.some((c) => c.getPluginData("m3gen_layout") !== "4");
  if (hasOldLayout) {
    return { snapshot: null, primitivesCol: null, isOldLayout: true };
  }

  // Layout version 4 collections
  const v4Cols = pluginCols.filter((c) => c.getPluginData("m3gen_layout") === "4");
  if (v4Cols.length === 0) {
    return { snapshot: null, primitivesCol: null, isOldLayout: false };
  }

  const primitivesCol =
    v4Cols.find(
      (c) =>
        c.getPluginData("m3gen_id") === "collection:primitives" ||
        c.name.toLowerCase() === COLLECTION_NAMES.primitives,
    ) ?? null;

  const snapshotCols: SnapshotCollection[] = [];

  for (const col of v4Cols) {
    const colId = col.getPluginData("m3gen_id") || col.name;
    const modeIdToName = new Map<string, string>();
    for (const m of col.modes) {
      modeIdToName.set(m.modeId, m.name);
    }

    const vars: SnapshotVariable[] = [];
    for (const vId of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(vId);
      if (!v) continue;
      const m3Id = v.getPluginData("m3gen_id") || v.name;

      const valuesByMode: SnapshotVariable["valuesByMode"] = {};
      for (const m of col.modes) {
        const val = v.valuesByMode[m.modeId];
        if (val && typeof val === "object" && "type" in val && val.type === "VARIABLE_ALIAS") {
          const targetVar = await figma.variables.getVariableByIdAsync(val.id);
          const targetId = targetVar ? targetVar.getPluginData("m3gen_id") || targetVar.name : "";
          const targetName = targetVar ? targetVar.name : "";
          valuesByMode[m.name] = { type: "ALIAS", targetId, targetName };
        } else if (val && typeof val === "object" && "r" in val && "g" in val && "b" in val) {
          const hex = figmaRgbToHex(val as { r: number; g: number; b: number });
          valuesByMode[m.name] = { type: "COLOR", hex };
        }
      }

      vars.push({
        id: m3Id,
        name: v.name,
        valuesByMode,
      });
    }

    const modesObj: Record<string, string> = {};
    for (const [mId, mName] of modeIdToName.entries()) {
      modesObj[mId] = mName;
    }

    snapshotCols.push({
      id: colId,
      name: col.name,
      modes: modesObj,
      variables: vars,
      layoutVersion: col.getPluginData("m3gen_layout") || "4",
    });
  }

  let inputsJson = primitivesCol ? primitivesCol.getPluginData("m3gen_inputs") : undefined;
  if (!inputsJson) {
    for (const col of v4Cols) {
      const data = col.getPluginData("m3gen_inputs");
      if (data) {
        inputsJson = data;
        break;
      }
    }
  }

  return {
    snapshot: {
      layoutVersion: "4",
      collections: snapshotCols,
      inputsJson,
    },
    primitivesCol,
    isOldLayout: false,
  };
}

export async function createSystemInFigma(
  rawPayload: unknown,
  inputs?: unknown,
): Promise<CreateResult> {
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const pluginCols = existingCollections.filter((c) => c.getPluginData("m3gen") === "1");

  // Check if old layout collections exist (detected by m3gen tag)
  const hasOldLayout = pluginCols.some((c) => c.getPluginData("m3gen_layout") !== "4");
  if (hasOldLayout) {
    return {
      success: false,
      collectionsCount: 0,
      variablesCount: 0,
      message: OLD_LAYOUT_ERROR,
    };
  }

  const forbiddenNames = new Set(["primitives", "color roles"]);
  for (const col of existingCollections) {
    if (forbiddenNames.has(col.name.toLowerCase())) {
      const isPluginMade =
        col.getPluginData("m3gen") === "1" && col.getPluginData("m3gen_layout") === "4";
      if (isPluginMade) {
        return {
          success: false,
          collectionsCount: 0,
          variablesCount: 0,
          message: "A system already exists in this file. Use Update.",
        };
      } else {
        return {
          success: false,
          collectionsCount: 0,
          variablesCount: 0,
          message:
            "A collection with this name already exists and was not created by this plugin. Rename it or use a blank file.",
        };
      }
    }
  }

  const validation = validatePayload(rawPayload);
  if (!validation.valid) {
    return {
      success: false,
      collectionsCount: 0,
      variablesCount: 0,
      message: validation.error,
    };
  }

  const createdCollections: VariableCollection[] = [];
  const createdVariables: Variable[] = [];

  function rollback(): void {
    for (const v of createdVariables) {
      try {
        v.remove();
      } catch (_err) {
        /* rollback */
      }
    }
    for (const c of createdCollections) {
      try {
        c.remove();
      } catch (_err) {
        /* rollback */
      }
    }
  }

  try {
    const plan = buildWritePlan(validation.payload);
    const varMap = new Map<string, Variable>();
    let primitivesColCreated: VariableCollection | null = null;

    for (const cSpec of plan.collections) {
      const col = figma.variables.createVariableCollection(cSpec.name);
      createdCollections.push(col);
      col.setPluginData("m3gen", "1");
      col.setPluginData("m3gen_id", cSpec.pluginData.m3gen_id);
      col.setPluginData("m3gen_layout", "4");

      if (cSpec.name === COLLECTION_NAMES.primitives) {
        primitivesColCreated = col;
      }

      const defaultModeId = col.modes[0].modeId;
      col.renameMode(defaultModeId, "Value");

      for (const vSpec of cSpec.variables) {
        const v = figma.variables.createVariable(vSpec.name, col, "COLOR");
        createdVariables.push(v);
        v.setPluginData("m3gen", "1");
        v.setPluginData("m3gen_id", vSpec.id);
        varMap.set(vSpec.id, v);

        const valPlan = vSpec.valuesByMode["Value"];
        if (valPlan.type === "COLOR") {
          v.setValueForMode(defaultModeId, hexToFigmaRgb(valPlan.hex));
        } else if (valPlan.type === "ALIAS") {
          const targetVar = varMap.get(valPlan.targetId);
          if (!targetVar) {
            throw new Error(`Alias target variable not found: ${valPlan.targetId}`);
          }
          const alias = figma.variables.createVariableAlias(targetVar);
          v.setValueForMode(defaultModeId, alias);
        }
      }
    }

    const targetCol = primitivesColCreated || createdCollections[0];
    if (targetCol && inputs) {
      targetCol.setPluginData(
        "m3gen_inputs",
        typeof inputs === "string" ? inputs : JSON.stringify(inputs),
      );
    }

    return {
      success: true,
      collectionsCount: createdCollections.length,
      variablesCount: createdVariables.length,
      message: `Created ${createdCollections.length} collections and ${createdVariables.length} variables.`,
    };
  } catch (err) {
    rollback();
    return {
      success: false,
      collectionsCount: 0,
      variablesCount: 0,
      message: `Failed to create variables: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function previewUpdateInFigma(rawPayload: unknown) {
  const { snapshot, isOldLayout } = await getSystemSnapshot();
  if (isOldLayout) {
    return { success: false, message: OLD_LAYOUT_ERROR };
  }
  if (!snapshot) {
    return { success: false, message: "No existing plugin system found to update." };
  }

  const validation = validatePayload(rawPayload);
  if (!validation.valid) {
    return { success: false, message: validation.error };
  }

  const plan = buildWritePlan(validation.payload);
  const diff = compareWritePlan(snapshot, plan);
  return {
    success: true,
    diff,
  };
}

async function applyUpdateInFigma(rawPayload: unknown, inputs?: unknown) {
  const { snapshot, isOldLayout, primitivesCol } = await getSystemSnapshot();
  if (isOldLayout) {
    return { success: false, message: OLD_LAYOUT_ERROR };
  }
  if (!snapshot) {
    return { success: false, message: "No existing plugin system found to update." };
  }

  const validation = validatePayload(rawPayload);
  if (!validation.valid) {
    return { success: false, message: validation.error };
  }

  const plan = buildWritePlan(validation.payload);

  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const pluginCols = existingCollections.filter(
    (c) => c.getPluginData("m3gen") === "1" && c.getPluginData("m3gen_layout") === "4",
  );

  // Map of m3gen_id -> Variable across all version 4 plugin collections
  const varMapByM3Id = new Map<string, Variable>();
  for (const col of pluginCols) {
    for (const vId of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(vId);
      if (v) {
        const m3Id = v.getPluginData("m3gen_id") || v.name;
        varMapByM3Id.set(m3Id, v);
      }
    }
  }

  // Transactional rollback state
  const oldValues: Array<{ variable: Variable; modeId: string; value: unknown }> = [];
  const newlyCreatedVariables: Variable[] = [];
  let oldInputsJson: string | undefined;

  if (primitivesCol) {
    oldInputsJson = primitivesCol.getPluginData("m3gen_inputs");
  }

  let updatedCount = 0;
  let addedCount = 0;

  try {
    for (const cSpec of plan.collections) {
      let col = pluginCols.find(
        (c) =>
          (c.getPluginData("m3gen_id") && c.getPluginData("m3gen_id") === cSpec.pluginData.m3gen_id) ||
          c.name.toLowerCase() === cSpec.name.toLowerCase(),
      );

      if (!col) {
        col = figma.variables.createVariableCollection(cSpec.name);
        col.setPluginData("m3gen", "1");
        col.setPluginData("m3gen_id", cSpec.pluginData.m3gen_id);
        col.setPluginData("m3gen_layout", "4");
        col.renameMode(col.modes[0].modeId, "Value");
        pluginCols.push(col);
      }

      const defaultModeId = col.modes[0].modeId;

      for (const vSpec of cSpec.variables) {
        let v = varMapByM3Id.get(vSpec.id);
        if (!v) {
          v = figma.variables.createVariable(vSpec.name, col, "COLOR");
          newlyCreatedVariables.push(v);
          v.setPluginData("m3gen", "1");
          v.setPluginData("m3gen_id", vSpec.id);
          varMapByM3Id.set(vSpec.id, v);
          addedCount++;
        }

        const valPlan = vSpec.valuesByMode["Value"];
        // Save old value for rollback
        oldValues.push({ variable: v, modeId: defaultModeId, value: v.valuesByMode[defaultModeId] });

        if (valPlan.type === "COLOR") {
          v.setValueForMode(defaultModeId, hexToFigmaRgb(valPlan.hex));
          updatedCount++;
        } else if (valPlan.type === "ALIAS") {
          const targetVar = varMapByM3Id.get(valPlan.targetId);
          if (!targetVar) {
            throw new Error(`Target variable for alias not found: ${valPlan.targetId}`);
          }
          const alias = figma.variables.createVariableAlias(targetVar);
          v.setValueForMode(defaultModeId, alias);
          updatedCount++;
        }
      }
    }

    const targetCol = primitivesCol || pluginCols[0];
    if (targetCol && inputs) {
      targetCol.setPluginData(
        "m3gen_inputs",
        typeof inputs === "string" ? inputs : JSON.stringify(inputs),
      );
    }

    const message = "System updated successfully. Applied changes to Figma variables.";
    return {
      success: true,
      message,
      updatedCount,
      addedCount,
    };
  } catch (err) {
    // Transactional Rollback
    for (const v of newlyCreatedVariables) {
      try {
        v.remove();
      } catch (_e) {
        /* rollback */
      }
    }
    for (const item of oldValues) {
      try {
        item.variable.setValueForMode(item.modeId, item.value as VariableValue);
      } catch (_e) {
        /* rollback */
      }
    }
    if (primitivesCol && oldInputsJson !== undefined) {
      primitivesCol.setPluginData("m3gen_inputs", oldInputsJson);
    }

    const errText = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Update failed and was rolled back: ${errText}`,
    };
  }
}

async function sendInitStatus() {
  const { snapshot, isOldLayout } = await getSystemSnapshot();
  if (isOldLayout) {
    figma.ui.postMessage({
      type: "init-status",
      systemExists: false,
      isOldLayout: true,
      savedInputs: null,
      message: OLD_LAYOUT_ERROR,
    });
  } else if (snapshot) {
    figma.ui.postMessage({
      type: "init-status",
      systemExists: true,
      isOldLayout: false,
      savedInputs: snapshot.inputsJson ?? null,
    });
  } else {
    figma.ui.postMessage({
      type: "init-status",
      systemExists: false,
      isOldLayout: false,
      savedInputs: null,
    });
  }
}

// Initial status check when plugin opens
sendInitStatus();

figma.ui.onmessage = async (msg: { type: string; payload?: unknown; inputs?: unknown }) => {
  if (!msg) return;
  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }
  if (msg.type === "init") {
    await sendInitStatus();
    return;
  }
  if (msg.type === "create-system") {
    const result = await createSystemInFigma(msg.payload, msg.inputs);
    if (result.success) {
      figma.notify(result.message);
    } else {
      figma.notify(result.message, { error: true });
    }
    figma.ui.postMessage({ type: "create-result", result });
    return;
  }
  if (msg.type === "preview-update") {
    const result = await previewUpdateInFigma(msg.payload);
    figma.ui.postMessage({ type: "preview-update-result", result });
    return;
  }
  if (msg.type === "apply-update") {
    const result = await applyUpdateInFigma(msg.payload, msg.inputs);
    if (result.success) {
      figma.notify(result.message);
    } else {
      figma.notify(result.message, { error: true });
    }
    figma.ui.postMessage({ type: "apply-update-result", result });
    return;
  }
  if (msg.type === "export-json") {
    try {
      const { snapshot, isOldLayout } = await getSystemSnapshot();
      if (isOldLayout) {
        figma.ui.postMessage({
          type: "export-json-result",
          success: false,
          message: OLD_LAYOUT_ERROR,
        });
        return;
      }
      if (!snapshot) {
        figma.ui.postMessage({
          type: "export-json-result",
          success: false,
          message: "No M3 color system found in file. Please create system first.",
        });
        return;
      }

      const result = exportSnapshotToTokensJson(snapshot);
      figma.ui.postMessage({
        type: "export-json-result",
        success: true,
        result,
      });
    } catch (err) {
      figma.ui.postMessage({
        type: "export-json-result",
        success: false,
        message: `Failed to export variables from Figma file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return;
  }
};
