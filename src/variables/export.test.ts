import { describe, it, expect } from "vitest";
import sample from "../../Sample/tokens.json";
import { buildColorSystem } from "../colors/index.js";
import { buildCreatePayload, buildWritePlan, COLLECTION_NAMES } from "./plan.js";
import {
  exportSnapshotToTokensJson,
  writePlanToSnapshot,
  type RoleToken,
} from "./export.js";

interface TokenItem {
  path: string;
  token: { type: string; value: string; blendMode?: string; description?: string };
}

// Helper to extract all key paths and their values from a token object tree
function extractTokenPaths(obj: Record<string, unknown>, current: string[] = []): TokenItem[] {
  let results: TokenItem[] = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key] as Record<string, unknown> | undefined;
    if (val && typeof val === "object" && typeof val.type === "string") {
      results.push({
        path: current.concat(key).join("."),
        token: val as unknown as TokenItem["token"],
      });
    } else if (val && typeof val === "object") {
      results = results.concat(extractTokenPaths(val, current.concat(key)));
    }
  }
  return results;
}

describe("JSON Exporter (exportSnapshotToTokensJson) - Layout Version 4", () => {
  function getSamplePayload(primary = "#760646") {
    const sys = buildColorSystem(
      { primary },
      { secondary: "material", tertiary: "material", autoFixContrast: true },
    );
    return buildCreatePayload(sys);
  }

  it("produces correct top-level keys, counts, and removes 'color' subgroup from roles", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const res = exportSnapshotToTokensJson(plan);

    expect(Object.keys(res.jsonObject)).toEqual(["primitives", "color roles"]);

    expect(res.counts.keyColorTokens).toBe(8);
    expect(res.counts.paletteTokens).toBe(122);
    expect(res.counts.roleTokensLight).toBe(57);
    expect(res.counts.roleTokensDark).toBe(57);
    expect(res.counts.totalRoleTokens).toBe(114);

    const rolesObj = res.jsonObject["color roles"] as Record<string, Record<string, unknown>>;
    expect(Object.keys(rolesObj)).toEqual(["color light", "color dark"]);

    // Ensure roles are directly under "color light" and "color dark", without a "color" subgroup
    expect(rolesObj["color light"]["color"]).toBeUndefined();
    expect(rolesObj["color dark"]["color"]).toBeUndefined();
    expect(rolesObj["color light"]["primary"]).toBeDefined();
    expect(rolesObj["color light"]["on-primary"]).toBeDefined();
    expect(rolesObj["color dark"]["primary"]).toBeDefined();
  });

  it("ensures key color and palette values match ^#[0-9a-f]{8}$", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const res = exportSnapshotToTokensJson(plan);

    const primitivesObj = (res.jsonObject as Record<string, unknown>)["primitives"] as Record<string, unknown>;
    const primTokens = extractTokenPaths(primitivesObj);

    expect(primTokens.length).toBe(130); // 8 key colors + 122 palette tokens

    for (const item of primTokens) {
      expect(item.token.type).toBe("color");
      expect(item.token.value).toMatch(/^#[0-9a-f]{8}$/);
      expect(item.token.blendMode).toBe("normal");
    }
  });

  it("ensures palette tokens are named with lowercase group name plus tone", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const res = exportSnapshotToTokensJson(plan);

    const primitivesObj = res.jsonObject["primitives"] as Record<string, Record<string, unknown>>;
    const palettesObj = primitivesObj["color palettes"] as Record<string, Record<string, unknown>>;

    expect(palettesObj["primary"]["primary0"]).toBeDefined();
    expect(palettesObj["primary"]["primary40"]).toBeDefined();
    expect(palettesObj["secondary"]["secondary40"]).toBeDefined();
    expect(palettesObj["neutral variant"]["neutral-variant50"]).toBeDefined();
    expect(palettesObj["neutral"]["neutral4"]).toBeDefined();
  });

  it("ensures every role value matches ^{primitives.color palettes.[a-z0-9 -]+.[a-z0-9-]+[0-9]+}$ and is never a raw hex", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const res = exportSnapshotToTokensJson(plan);

    const rolesObj = (res.jsonObject as Record<string, unknown>)["color roles"] as Record<string, unknown>;
    const roleTokens = extractTokenPaths(rolesObj);

    expect(roleTokens.length).toBe(114); // 57 light + 57 dark

    for (const item of roleTokens) {
      const val = item.token.value;
      expect(val).toMatch(/^\{primitives\.color palettes\.[a-z0-9 -]+\.[a-z0-9-]+[0-9]+\}$/);
      expect(val).not.toMatch(/^#[0-9A-Fa-f]{6,8}$/);
    }

    // Check specific reference formats
    const lightRoles = rolesObj["color light"] as Record<string, { value: string }>;
    expect(lightRoles["primary"].value).toBe("{primitives.color palettes.primary.primary40}");
    expect(lightRoles["on-surface-variant"].value).toBe(
      "{primitives.color palettes.neutral variant.neutral-variant30}",
    );
  });

  it("ensures every role reference points to an existing palette token in primitives", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const res = exportSnapshotToTokensJson(plan);

    const json = res.jsonObject as Record<string, Record<string, unknown>>;
    const primitivesObj = json["primitives"] as Record<string, unknown>;
    const rolesObj = json["color roles"] as Record<string, unknown>;

    const roleTokens = extractTokenPaths(rolesObj);

    for (const item of roleTokens) {
      const refStr = item.token.value;
      // Extract path after {primitives.
      const refClean = refStr.replace(/^\{primitives\./, "").replace(/\}$/, "");
      const pathSegments = refClean.split(".");

      let current: Record<string, unknown> | undefined = primitivesObj;
      for (const seg of pathSegments) {
        expect(current).toBeDefined();
        current = current![seg] as Record<string, unknown> | undefined;
      }
      expect(current).toBeDefined();
      expect(current!.type).toBe("color");
      expect(current!.value).toMatch(/^#[0-9a-f]{8}$/);
    }
  });

  it("renamed variables use the new name in exported keys and reference targets", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const snapshot = writePlanToSnapshot(plan);

    // Rename a palette variable in primitives
    const primCol = snapshot.collections.find((c) => c.name === COLLECTION_NAMES.primitives)!;
    const v40 = primCol.variables.find((v) => v.name === "color palettes/primary/primary40")!;
    v40.name = "color palettes/custom brand/custom-brand40";

    // Rename a role variable in color roles
    const rolesCol = snapshot.collections.find((c) => c.name === COLLECTION_NAMES.colorRoles)!;
    const vRole = rolesCol.variables.find((v) => v.name === "color light/primary")!;
    vRole.name = "color light/main-primary";

    const res = exportSnapshotToTokensJson(snapshot);
    const json = res.jsonObject as Record<string, Record<string, any>>;

    // Renamed palette variable appears under its new name
    expect(json["primitives"]["color palettes"]["custom brand"]?.["custom-brand40"]).toBeDefined();
    expect(json["primitives"]["color palettes"]["primary"]?.["primary40"]).toBeUndefined();

    // Renamed role variable appears directly under color light with its new name
    expect(json["color roles"]["color light"]["main-primary"]).toBeDefined();
    expect(json["color roles"]["color light"]["primary"]).toBeUndefined();

    // The reference target uses the new name
    const mainPrimaryToken = json["color roles"]["color light"]["main-primary"] as RoleToken;
    expect(mainPrimaryToken.value).toBe("{primitives.color palettes.custom brand.custom-brand40}");
  });

  it("matches exported key paths with Sample/tokens.json", () => {
    // Sample/tokens.json defines the FORMAT only (key paths, nesting, value formats), not the colors.
    const sampleObj = sample as Record<string, Record<string, unknown>>;
    const sampleTokens = extractTokenPaths(sampleObj);

    expect(Object.keys(sampleObj)).toEqual(["primitives", "color roles"]);
    expect(sampleTokens.length).toBe(244); // 8 key + 122 palette + 57 light + 57 dark

    // Export with default settings
    const payload = getSamplePayload("#760646");
    const plan = buildWritePlan(payload);
    const res = exportSnapshotToTokensJson(plan);
    const generatedTokens = extractTokenPaths(res.jsonObject);

    expect(generatedTokens.length).toBe(244);

    const samplePaths = new Set(sampleTokens.map((t) => t.path));
    const generatedPaths = new Set(generatedTokens.map((t) => t.path));

    expect(generatedPaths).toEqual(samplePaths);

    // Verify format of all generated values
    for (const item of generatedTokens) {
      if (item.path.startsWith("primitives.")) {
        expect(item.token.value).toMatch(/^#[0-9a-f]{8}$/);
        expect(item.token.blendMode).toBe("normal");
      } else if (item.path.startsWith("color roles.")) {
        expect(item.token.value).toMatch(
          /^\{primitives\.color palettes\.[a-z0-9 -]+\.[a-z0-9-]+[0-9]+\}$/,
        );
      }
    }
  });

  it("does not export collections with layout 3 or lower (treated as old)", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload);
    const snapshot = writePlanToSnapshot(plan);

    // Change layout version to 3 on collections
    for (const col of snapshot.collections) {
      col.layoutVersion = "3";
    }

    const res = exportSnapshotToTokensJson(snapshot);
    expect(res.counts.keyColorTokens).toBe(0);
    expect(res.counts.paletteTokens).toBe(0);
    expect(res.counts.totalRoleTokens).toBe(0);
  });
});
