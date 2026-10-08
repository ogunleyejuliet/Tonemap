import { validatePayload, buildWritePlan } from "./src/variables/plan.js";
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

class AddModeError extends Error {
  constructor(public originalError: string) {
    super(originalError);
    this.name = "AddModeError";
  }
}

export async function createSystemInFigma(rawPayload: unknown): Promise<CreateResult> {
  // 1. Safety check for existing collections
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
          message: "A system already exists in this file. Updating will come in a later version.",
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

  // 2. Validate payload before writing anything
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

  // 3. Execution state & Rollback support
  const createdCollections: VariableCollection[] = [];
  const createdVariables: Variable[] = [];

  function rollback(): void {
    for (const v of createdVariables) {
      try {
        v.remove();
      } catch (_err) {
        /* rollback cleanup */
      }
    }
    for (const c of createdCollections) {
      try {
        c.remove();
      } catch (_err) {
        /* rollback cleanup */
      }
    }
  }

  async function writeCollections(
    planCollections: CollectionPlanSpec[],
  ): Promise<{ variablesCount: number; collectionsCount: number }> {
    const varMap = new Map<string, Variable>();

    for (const cSpec of planCollections) {
      const col = figma.variables.createVariableCollection(cSpec.name);
      createdCollections.push(col);
      col.setPluginData("m3gen", "1");
      if (cSpec.pluginData.m3gen_id) {
        col.setPluginData("m3gen_id", cSpec.pluginData.m3gen_id);
      }

      // Handle modes
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

      // Create variables
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

    return {
      collectionsCount: createdCollections.length,
      variablesCount: createdVariables.length,
    };
  }

  // 4. Try Standard Plan first, then Fallback if adding Dark mode fails
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

figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  if (!msg) return;
  if (msg.type === "close") {
    figma.closePlugin();
    return;
  }
  if (msg.type === "create-system") {
    const result = await createSystemInFigma(msg.payload);
    if (result.success) {
      figma.notify(result.message);
    } else {
      figma.notify(result.message, { error: true });
    }
    figma.ui.postMessage({ type: "create-result", result });
  }
};
