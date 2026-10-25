import { describe, it, expect, beforeEach } from "vitest";
import { buildColorSystem } from "../colors/system.js";
import { buildCreatePayload, COLLECTION_NAMES } from "./plan.js";

interface FakeCollection {
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  variableIds: string[];
  pluginData: Map<string, string>;
  setPluginData: (k: string, v: string) => void;
  getPluginData: (k: string) => string | undefined;
  renameMode: (id: string, newName: string) => void;
  addMode: (mName: string) => string;
  remove: () => void;
}

interface FakeVariable {
  id: string;
  name: string;
  collection: FakeCollection;
  resolvedType: string;
  pluginData: Map<string, string>;
  valuesByMode: Record<string, unknown>;
  setPluginData: (k: string, v: string) => void;
  getPluginData: (k: string) => string | undefined;
  setValueForMode: (mId: string, val: unknown) => void;
  remove: () => void;
}

let collections: FakeCollection[] = [];
let variables: FakeVariable[] = [];

const figmaMock = {
  showUI: () => {},
  notify: () => {},
  ui: {
    onmessage: null,
    postMessage: () => {},
  },
  variables: {
    getLocalVariableCollectionsAsync: async () => collections,
    getVariableByIdAsync: async (id: string) => variables.find((v) => v.id === id) ?? null,
    createVariableCollection: (name: string) => {
      const pluginData = new Map<string, string>();
      const modes = [{ modeId: "mode-default", name: "Mode 1" }];
      const col: FakeCollection = {
        name,
        modes,
        variableIds: [],
        pluginData,
        setPluginData: (k, v) => pluginData.set(k, v),
        getPluginData: (k) => pluginData.get(k),
        renameMode: (id, newName) => {
          const m = modes.find((item) => item.modeId === id);
          if (m) m.name = newName;
        },
        addMode: (mName: string) => {
          const id = `mode-${modes.length + 1}`;
          modes.push({ modeId: id, name: mName });
          return id;
        },
        remove: () => {
          const idx = collections.indexOf(col);
          if (idx !== -1) collections.splice(idx, 1);
        },
      };
      collections.push(col);
      return col;
    },
    createVariable: (name: string, collection: FakeCollection, type: string) => {
      const pluginData = new Map<string, string>();
      const valuesByMode: Record<string, unknown> = {};
      const vId = `var-${variables.length + 1}`;
      const v: FakeVariable = {
        id: vId,
        name,
        collection,
        resolvedType: type,
        pluginData,
        valuesByMode,
        setPluginData: (k, v) => pluginData.set(k, v),
        getPluginData: (k) => pluginData.get(k),
        setValueForMode: (mId, val) => {
          valuesByMode[mId] = val;
        },
        remove: () => {
          const idx = variables.indexOf(v);
          if (idx !== -1) variables.splice(idx, 1);
          const cIdx = collection.variableIds.indexOf(vId);
          if (cIdx !== -1) collection.variableIds.splice(cIdx, 1);
        },
      };
      variables.push(v);
      collection.variableIds.push(vId);
      return v;
    },
    createVariableAlias: (targetVar: FakeVariable) => {
      return { type: "VARIABLE_ALIAS", id: targetVar.id };
    },
  },
};

(globalThis as unknown as { figma: unknown }).figma = figmaMock;
(globalThis as unknown as { __html__: string }).__html__ = "";

// Import code.ts after setting up global figma mock
const { createSystemInFigma, getSystemSnapshot } = await import("../../code.ts");

const EXPECTED_OLD_LAYOUT_ERROR =
  "This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create.";

describe("Figma integration: layout version 4 and older layout detection", () => {
  const validSystem = buildColorSystem({ primary: "#6750A4" });
  const validPayload = buildCreatePayload(validSystem);

  beforeEach(() => {
    collections.length = 0;
    variables.length = 0;
  });

  it("creates 2 collections with layout version 4 and lowercase names on clean file", async () => {
    const res = await createSystemInFigma(validPayload);
    expect(res.success).toBe(true);
    expect(res.collectionsCount).toBe(2);
    expect(res.variablesCount).toBe(244);

    expect(collections.map((c) => c.name)).toEqual([
      COLLECTION_NAMES.primitives,
      COLLECTION_NAMES.colorRoles,
    ]);
    expect(collections.map((c) => c.name)).toEqual(["primitives", "color roles"]);
    expect(collections[0].getPluginData("m3gen_layout")).toBe("4");
    expect(collections[1].getPluginData("m3gen_layout")).toBe("4");
    expect(collections[0].getPluginData("m3gen")).toBe("1");
    expect(collections[1].getPluginData("m3gen")).toBe("1");

    // Both collections have single mode "Value"
    expect(collections[0].modes.map((m) => m.name)).toEqual(["Value"]);
    expect(collections[1].modes.map((m) => m.name)).toEqual(["Value"]);
  });

  it("detects layout 3 collections as old and blocks creation without deleting anything", async () => {
    // Simulate layout 3 collections (with older capitalization Primitives / Color Roles)
    const oldPrimitives = figmaMock.variables.createVariableCollection("Primitives");
    oldPrimitives.setPluginData("m3gen", "1");
    oldPrimitives.setPluginData("m3gen_id", "collection:primitives");
    oldPrimitives.setPluginData("m3gen_layout", "3");

    const oldColorRoles = figmaMock.variables.createVariableCollection("Color Roles");
    oldColorRoles.setPluginData("m3gen", "1");
    oldColorRoles.setPluginData("m3gen_id", "collection:color_roles");
    oldColorRoles.setPluginData("m3gen_layout", "3");

    expect(collections.length).toBe(2);

    // getSystemSnapshot detects old layout
    const snapshotInfo = await getSystemSnapshot();
    expect(snapshotInfo.isOldLayout).toBe(true);
    expect(snapshotInfo.snapshot).toBeNull();

    // createSystemInFigma rejects and shows exact required message
    const res = await createSystemInFigma(validPayload);
    expect(res.success).toBe(false);
    expect(res.message).toBe(EXPECTED_OLD_LAYOUT_ERROR);

    // Guarantees nothing was deleted automatically
    expect(collections.length).toBe(2);
    expect(collections.map((c) => c.name)).toEqual(["Primitives", "Color Roles"]);
  });

  it("detects layout 2 collections as old regardless of capitalization", async () => {
    const oldPrimitives = figmaMock.variables.createVariableCollection("PRIMITIVES");
    oldPrimitives.setPluginData("m3gen", "1");
    oldPrimitives.setPluginData("m3gen_id", "collection:primitives");
    oldPrimitives.setPluginData("m3gen_layout", "2");

    const oldColorRoles = figmaMock.variables.createVariableCollection("color roles");
    oldColorRoles.setPluginData("m3gen", "1");
    oldColorRoles.setPluginData("m3gen_id", "collection:color_roles");
    oldColorRoles.setPluginData("m3gen_layout", "2");

    const snapshotInfo = await getSystemSnapshot();
    expect(snapshotInfo.isOldLayout).toBe(true);

    const res = await createSystemInFigma(validPayload);
    expect(res.success).toBe(false);
    expect(res.message).toBe(EXPECTED_OLD_LAYOUT_ERROR);

    expect(collections.length).toBe(2);
  });

  it("detects original v1 layout collections (Palette & Color in any capitalization) as old", async () => {
    const oldPalette = figmaMock.variables.createVariableCollection("Palette");
    oldPalette.setPluginData("m3gen", "1");

    const oldColor = figmaMock.variables.createVariableCollection("Color");
    oldColor.setPluginData("m3gen", "1");

    const snapshotInfo = await getSystemSnapshot();
    expect(snapshotInfo.isOldLayout).toBe(true);

    const res = await createSystemInFigma(validPayload);
    expect(res.success).toBe(false);
    expect(res.message).toBe(EXPECTED_OLD_LAYOUT_ERROR);

    // Nothing was deleted
    expect(collections.length).toBe(2);
  });
});
