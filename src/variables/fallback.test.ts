import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildColorSystem } from "../colors/system.js";
import { buildCreatePayload } from "./plan.js";

interface FakeCollection {
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  pluginData: Map<string, string>;
  setPluginData: (k: string, v: string) => void;
  getPluginData: (k: string) => string | undefined;
  renameMode: (id: string, newName: string) => void;
  addMode: (mName: string) => string;
  remove: () => void;
}

interface FakeVariable {
  name: string;
  collection: FakeCollection;
  resolvedType: string;
  pluginData: Map<string, string>;
  valuesByMode: Map<string, unknown>;
  setPluginData: (k: string, v: string) => void;
  getPluginData: (k: string) => string | undefined;
  setValueForMode: (mId: string, val: unknown) => void;
  remove: () => void;
}

let collections: FakeCollection[] = [];
let variables: FakeVariable[] = [];
let addModeErrorToThrow: Error | null = null;
let createCollectionErrorToThrow: ((name: string) => Error | null) | null = null;

const figmaMock = {
  showUI: () => {},
  ui: {
    onmessage: null,
    postMessage: () => {},
  },
  variables: {
    getLocalVariableCollectionsAsync: async () => collections,
    createVariableCollection: (name: string) => {
      if (createCollectionErrorToThrow) {
        const err = createCollectionErrorToThrow(name);
        if (err) throw err;
      }
      const pluginData = new Map<string, string>();
      const modes = [{ modeId: "mode-default", name: "Mode 1" }];
      const col: FakeCollection = {
        name,
        modes,
        pluginData,
        setPluginData: (k, v) => pluginData.set(k, v),
        getPluginData: (k) => pluginData.get(k),
        renameMode: (id, newName) => {
          const m = modes.find((item) => item.modeId === id);
          if (m) m.name = newName;
        },
        addMode: (mName: string) => {
          if (addModeErrorToThrow) {
            throw addModeErrorToThrow;
          }
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
      const valuesByMode = new Map<string, unknown>();
      const v: FakeVariable = {
        name,
        collection,
        resolvedType: type,
        pluginData,
        valuesByMode,
        setPluginData: (k, v) => pluginData.set(k, v),
        getPluginData: (k) => pluginData.get(k),
        setValueForMode: (mId, val) => valuesByMode.set(mId, val),
        remove: () => {
          const idx = variables.indexOf(v);
          if (idx !== -1) variables.splice(idx, 1);
        },
      };
      variables.push(v);
      return v;
    },
    createVariableAlias: (targetVar: FakeVariable) => {
      return { type: "VARIABLE_ALIAS", id: targetVar.name };
    },
  },
};

(globalThis as unknown as { figma: unknown }).figma = figmaMock;
(globalThis as unknown as { __html__: string }).__html__ = "";

// Import code.ts after setting up global figma mock
const { createSystemInFigma } = await import("../../code.ts");

describe("free plan fallback trigger in createSystemInFigma", () => {
  const validSystem = buildColorSystem({ primary: "#6750A4" });
  const validPayload = buildCreatePayload(validSystem);

  beforeEach(() => {
    collections.length = 0;
    variables.length = 0;
    addModeErrorToThrow = null;
    createCollectionErrorToThrow = null;
  });

  it("Path 1: addMode succeeds -> creates Standard plan with 2 collections (Palette and Color)", async () => {
    const res = await createSystemInFigma(validPayload);
    expect(res.success).toBe(true);
    expect(res.usedFallback).toBe(false);
    expect(res.collectionsCount).toBe(2);
    expect(collections.map((c) => c.name)).toEqual(["Palette", "Color"]);
  });

  it("Path 2: addMode throws any error -> rolls back standard plan, calls console.warn, and succeeds using fallback (Color Light & Color Dark)", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    addModeErrorToThrow = new Error("Plan mode limit exceeded on Figma team");

    const res = await createSystemInFigma(validPayload);

    expect(consoleWarnSpy).toHaveBeenCalledWith("Plan mode limit exceeded on Figma team");
    expect(res.success).toBe(true);
    expect(res.usedFallback).toBe(true);
    expect(res.collectionsCount).toBe(3);
    expect(collections.map((c) => c.name)).toEqual([
      "Palette",
      "Color Light",
      "Color Dark",
    ]);
    expect(res.message).toContain("Figma said: Plan mode limit exceeded on Figma team");

    consoleWarnSpy.mockRestore();
  });

  it("Path 3: addMode throws AND fallback also fails -> rolls back everything and reports both errors", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    addModeErrorToThrow = new Error("First error: addMode failed");

    createCollectionErrorToThrow = (name: string) => {
      if (name === "Color Dark") {
        return new Error("Second error: Fallback collection creation failed");
      }
      return null;
    };

    const res = await createSystemInFigma(validPayload);

    expect(res.success).toBe(false);
    expect(res.usedFallback).toBe(true);
    expect(res.collectionsCount).toBe(0);
    expect(res.variablesCount).toBe(0);
    expect(collections.length).toBe(0);
    expect(variables.length).toBe(0);
    expect(res.message).toContain("Failed to create variables in fallback mode: Second error: Fallback collection creation failed");
    expect(res.message).toContain("Figma said: First error: addMode failed");

    consoleWarnSpy.mockRestore();
  });
});
