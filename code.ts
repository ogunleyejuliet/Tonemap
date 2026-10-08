import { validatePayload, buildWritePlan } from "./src/variables/plan.js";
import { compareWritePlan, type SystemSnapshot, type SnapshotCollection, type SnapshotVariable } from "./src/variables/compare.js";
import type { CreateResult, CollectionPlanSpec } from "./src/variables/types.js";

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

class AddModeError extends Error {
  constructor(public originalError: string) {
    super(originalError);
    this.name = "AddModeError";
  }
}

async function getSystemSnapshot(): Promise<{ snapshot: SystemSnapshot | null; paletteCol: VariableCollection | null }> {
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const pluginCols = existingCollections.filter((c) => c.getPluginData("m3gen") === "1");
  if (pluginCols.length === 0) {
    return { snapshot: null, paletteCol: null };
  }

  const paletteCol = pluginCols.find(
    (c) => c.getPluginData("m3gen_id") === "collection:palette" || c.name === "Palette",
  ) ?? null;

  const hasFallbackCols = pluginCols.some(
    (c) => c.name === "Color Light" || c.name === "Color Dark",
  );
  const layout = hasFallbackCols ? "fallback" : "standard";

  const snapshotCols: SnapshotCollection[] = [];

  for (const col of pluginCols) {
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
    });
  }

  const inputsJson = paletteCol ? paletteCol.getPluginData("m3gen_inputs") : undefined;

  return {
    snapshot: {
      layout,
      collections: snapshotCols,
      inputsJson,
    },
    paletteCol,
  };
}

export async function createSystemInFigma(
  rawPayload: unknown,
  inputs?: unknown,
): Promise<CreateResult> {
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const forbiddenNames = new Set(["Palette", "Color", "Color Light", "Color Dark"]);

  for (const col of existingCollections) {
    if (forbiddenNames.has(col.name)) {
      const isPluginMade = col.getPluginData("m3gen") === "1";
      if (isPluginMade) {
        return {
          success: false,
          collectionsCount: 0,
          variablesCount: 0,
          usedFallback: false,
          message: "A system already exists in this file. Use Update.",
        };
      } else {
        return {
          success: false,
          collectionsCount: 0,
          variablesCount: 0,
          usedFallback: false,
          message: "A collection with this name already exists and was not created by this plugin. Rename it or use a blank file.",
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
      usedFallback: false,
      message: validation.error,
    };
  }

  const createdCollections: VariableCollection[] = [];
  const createdVariables: Variable[] = [];

  function rollback(): void {
    for (const v of createdVariables) {
      try { v.remove(); } catch (_err) { /* rollback */ }
    }
    for (const c of createdCollections) {
      try { c.remove(); } catch (_err) { /* rollback */ }
    }
  }

  async function writeCollections(
    planCollections: CollectionPlanSpec[],
  ): Promise<{ variablesCount: number; collectionsCount: number }> {
    const varMap = new Map<string, Variable>();
    let paletteColCreated: VariableCollection | null = null;

    for (const cSpec of planCollections) {
      const col = figma.variables.createVariableCollection(cSpec.name);
      createdCollections.push(col);
      col.setPluginData("m3gen", "1");
      if (cSpec.pluginData.m3gen_id) {
        col.setPluginData("m3gen_id", cSpec.pluginData.m3gen_id);
      }
      if (cSpec.name === "Palette") {
        paletteColCreated = col;
      }

      const modeIdMap = new Map<string, string>();
      const defaultModeId = col.modes[0].modeId;
      col.renameMode(defaultModeId, cSpec.modes[0]);
      modeIdMap.set(cSpec.modes[0], defaultModeId);

      for (let i = 1; i < cSpec.modes.length; i++) {
        const mName = cSpec.modes[i];
        let newModeId: string;
        try {
          newModeId = col.addMode(mName);
        } catch (err) {
          const figmaErrorText = err instanceof Error ? err.message : String(err);
          console.warn(figmaErrorText);
          throw new AddModeError(figmaErrorText);
        }
        modeIdMap.set(mName, newModeId);
      }

      for (const vSpec of cSpec.variables) {
        const v = figma.variables.createVariable(vSpec.name, col, "COLOR");
        createdVariables.push(v);
        v.setPluginData("m3gen", "1");
        v.setPluginData("m3gen_id", vSpec.id);
        varMap.set(vSpec.id, v);

        for (const [mName, valPlan] of Object.entries(vSpec.valuesByMode)) {
          const mId = modeIdMap.get(mName)!;
          if (valPlan.type === "COLOR") {
            v.setValueForMode(mId, hexToFigmaRgb(valPlan.hex));
          } else if (valPlan.type === "ALIAS") {
            const targetVar = varMap.get(valPlan.targetId);
            if (!targetVar) {
              throw new Error(`Alias target variable not found: ${valPlan.targetId}`);
            }
            const alias = figma.variables.createVariableAlias(targetVar);
            v.setValueForMode(mId, alias);
          }
        }
      }
    }

    if (paletteColCreated && inputs) {
      paletteColCreated.setPluginData("m3gen_inputs", JSON.stringify(inputs));
    }

    return {
      collectionsCount: createdCollections.length,
      variablesCount: createdVariables.length,
    };
  }

  try {
    const stdPlan = buildWritePlan(validation.payload, { fallback: false });
    const res = await writeCollections(stdPlan.collections);
    return {
      success: true,
      collectionsCount: res.collectionsCount,
      variablesCount: res.variablesCount,
      usedFallback: false,
      message: `Created ${res.collectionsCount} collections and ${res.variablesCount} variables.`,
    };
  } catch (err) {
    rollback();
    createdCollections.length = 0;
    createdVariables.length = 0;

    if (err instanceof AddModeError) {
      const figmaSaid = err.originalError;
      try {
        const fbPlan = buildWritePlan(validation.payload, { fallback: true });
        const res = await writeCollections(fbPlan.collections);
        return {
          success: true,
          collectionsCount: res.collectionsCount,
          variablesCount: res.variablesCount,
          usedFallback: true,
          message: `Created ${res.collectionsCount} collections and ${res.variablesCount} variables using Free plan fallback (Color Light & Color Dark). Figma said: ${figmaSaid}`,
        };
      } catch (fbErr) {
        rollback();
        const fbErrText = fbErr instanceof Error ? fbErr.message : String(fbErr);
        return {
          success: false,
          collectionsCount: 0,
          variablesCount: 0,
          usedFallback: true,
          message: `Failed to create variables in fallback mode: ${fbErrText}. Figma said: ${figmaSaid}`,
        };
      }
    } else {
      return {
        success: false,
        collectionsCount: 0,
        variablesCount: 0,
        usedFallback: false,
        message: `Failed to create variables: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

async function previewUpdateInFigma(rawPayload: unknown) {
  const { snapshot } = await getSystemSnapshot();
  if (!snapshot) {
    return { success: false, message: "No existing plugin system found to update." };
  }

  const validation = validatePayload(rawPayload);
  if (!validation.valid) {
    return { success: false, message: validation.error };
  }

  const isFallback = snapshot.layout === "fallback";
  const plan = buildWritePlan(validation.payload, { fallback: isFallback });

  const diff = compareWritePlan(snapshot, plan);
  return {
    success: true,
    diff,
  };
}

async function applyUpdateInFigma(rawPayload: unknown, inputs?: unknown) {
  const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const pluginCols = existingCollections.filter((c) => c.getPluginData("m3gen") === "1");
  if (pluginCols.length === 0) {
    return { success: false, message: "No existing plugin system found to update." };
  }

  const validation = validatePayload(rawPayload);
  if (!validation.valid) {
    return { success: false, message: validation.error };
  }

  const paletteCol = pluginCols.find(
    (c) => c.getPluginData("m3gen_id") === "collection:palette" || c.name === "Palette",
  );

  const isFallback = pluginCols.some(
    (c) => c.name === "Color Light" || c.name === "Color Dark",
  );
  const plan = buildWritePlan(validation.payload, { fallback: isFallback });

  // Map of m3gen_id -> Variable across all plugin collections
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

  if (paletteCol) {
    oldInputsJson = paletteCol.getPluginData("m3gen_inputs");
  }

  let updatedCount = 0;
  let addedCount = 0;

  try {
    for (const cSpec of plan.collections) {
      let col = pluginCols.find(
        (c) => (c.getPluginData("m3gen_id") && c.getPluginData("m3gen_id") === cSpec.pluginData.m3gen_id) || c.name === cSpec.name,
      );

      if (!col) {
        col = figma.variables.createVariableCollection(cSpec.name);
        col.setPluginData("m3gen", "1");
        if (cSpec.pluginData.m3gen_id) {
          col.setPluginData("m3gen_id", cSpec.pluginData.m3gen_id);
        }
        const defaultModeId = col.modes[0].modeId;
        col.renameMode(defaultModeId, cSpec.modes[0]);
        for (let i = 1; i < cSpec.modes.length; i++) {
          col.addMode(cSpec.modes[i]);
        }
        pluginCols.push(col);
      }

      const modeIdMap = new Map<string, string>();
      for (const mName of cSpec.modes) {
        const found = col.modes.find((m) => m.name === mName);
        if (found) {
          modeIdMap.set(mName, found.modeId);
        } else {
          const mId = col.addMode(mName);
          modeIdMap.set(mName, mId);
        }
      }

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

        for (const [mName, valPlan] of Object.entries(vSpec.valuesByMode)) {
          const mId = modeIdMap.get(mName);
          if (!mId) continue;

          // Save old value for rollback
          oldValues.push({ variable: v, modeId: mId, value: v.valuesByMode[mId] });

          if (valPlan.type === "COLOR") {
            v.setValueForMode(mId, hexToFigmaRgb(valPlan.hex));
            updatedCount++;
          } else if (valPlan.type === "ALIAS") {
            const targetVar = varMapByM3Id.get(valPlan.targetId);
            if (!targetVar) {
              throw new Error(`Target variable for alias not found: ${valPlan.targetId}`);
            }
            const alias = figma.variables.createVariableAlias(targetVar);
            v.setValueForMode(mId, alias);
            updatedCount++;
          }
        }
      }
    }

    if (paletteCol && inputs) {
      paletteCol.setPluginData("m3gen_inputs", JSON.stringify(inputs));
    }

    const message = `System updated successfully. Applied changes to Figma variables.`;
    return {
      success: true,
      message,
      updatedCount,
      addedCount,
    };
  } catch (err) {
    // Transactional Rollback
    for (const v of newlyCreatedVariables) {
      try { v.remove(); } catch (_e) { /* rollback */ }
    }
    for (const item of oldValues) {
      try { item.variable.setValueForMode(item.modeId, item.value as VariableValue); } catch (_e) { /* rollback */ }
    }
    if (paletteCol && oldInputsJson !== undefined) {
      paletteCol.setPluginData("m3gen_inputs", oldInputsJson);
    }

    const errText = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Update failed and was rolled back: ${errText}`,
    };
  }
}

async function sendInitStatus() {
  const { snapshot } = await getSystemSnapshot();
  if (snapshot) {
    let savedInputs: unknown = null;
    if (snapshot.inputsJson) {
      try {
        savedInputs = JSON.parse(snapshot.inputsJson);
      } catch (_e) {
        savedInputs = null;
      }
    }
    figma.ui.postMessage({
      type: "init-status",
      systemExists: true,
      savedInputs,
    });
  } else {
    figma.ui.postMessage({
      type: "init-status",
      systemExists: false,
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
};
