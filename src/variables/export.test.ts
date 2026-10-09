import { describe, it, expect } from "vitest";
import sample from "../../Sample/tokens.json";
import { buildColorSystem } from "../colors/index.js";
import { buildCreatePayload, buildWritePlan } from "./plan.js";
import { exportSnapshotToTokensJson, writePlanToSnapshot, type RoleToken } from "./export.js";

interface TokenItem {
  path: string;
  token: { type: string; value: string; blendMode?: string; description?: string };
}

// Helper to extract all key paths and their values from a token object tree (ignoring "extensions")
function extractTokenPaths(obj: Record<string, unknown>, current: string[] = []): TokenItem[] {
  let results: TokenItem[] = [];
  for (const key of Object.keys(obj)) {
    if (key === "extensions") continue;
    const val = obj[key] as Record<string, unknown> | undefined;
    if (val && typeof val === "object" && typeof val.type === "string") {
      results.push({ path: current.concat(key).join("."), token: val as unknown as TokenItem["token"] });
    } else if (val && typeof val === "object") {
      results = results.concat(extractTokenPaths(val, current.concat(key)));
    }
  }
  return results;
}

describe("JSON Exporter (exportSnapshotToTokensJson)", () => {
  function getSamplePayload() {
    const sys = buildColorSystem({ primary: "#6750A4" }, { secondary: "material", tertiary: "material", autoFixContrast: true });
    return buildCreatePayload(sys);
  }

  it("produces the same JSON shape for both standard and fallback layouts", () => {
    const payload = getSamplePayload();
    const stdPlan = buildWritePlan(payload, { fallback: false });
    const fbPlan = buildWritePlan(payload, { fallback: true });

    const stdExport = exportSnapshotToTokensJson(stdPlan);
    const fbExport = exportSnapshotToTokensJson(fbPlan);

    expect(stdExport.jsonObject).toEqual(fbExport.jsonObject);
    expect(stdExport.counts).toEqual(fbExport.counts);
  });

  it("ensures every role value is a reference and never a hex", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload, { fallback: false });
    const res = exportSnapshotToTokensJson(plan);

    const json = res.jsonObject as Record<string, Record<string, unknown>>;
    const lightRoles = extractTokenPaths(json["color light"]);
    const darkRoles = extractTokenPaths(json["color dark"]);

    const allRoles = [...lightRoles, ...darkRoles];
    expect(allRoles.length).toBeGreaterThan(0);

    for (const item of allRoles) {
      const val = item.token.value;
      expect(val).toMatch(/^\{palette\.[a-z0-9\s-]+\.[0-9]+\}$/);
      expect(val).not.toMatch(/^#[0-9A-Fa-f]{6,8}$/);
    }
  });

  it("ensures every role reference points to an existing palette token", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload, { fallback: false });
    const res = exportSnapshotToTokensJson(plan);

    const json = res.jsonObject as Record<string, Record<string, unknown>>;
    const paletteObj = json.palette;

    const lightRoles = extractTokenPaths(json["color light"]);
    const darkRoles = extractTokenPaths(json["color dark"]);

    for (const item of [...lightRoles, ...darkRoles]) {
      const refStr = item.token.value;
      const refClean = refStr.replace(/^\{palette\./, "").replace(/\}$/, "");
      const pathSegments = refClean.split(".");

      let current: Record<string, unknown> | undefined = paletteObj;
      for (const seg of pathSegments) {
        expect(current).toBeDefined();
        current = current![seg] as Record<string, unknown> | undefined;
      }
      expect(current).toBeDefined();
      expect(current!.type).toBe("color");
    }
  });

  it("uses new names for renamed variables", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload, { fallback: false });
    const snapshot = writePlanToSnapshot(plan);

    const palCol = snapshot.collections.find((c) => c.name === "Palette")!;
    const v40 = palCol.variables.find((v) => v.name === "Primary/40")!;
    v40.name = "Custom Primary/40";

    const colorCol = snapshot.collections.find((c) => c.name === "Color")!;
    const vRole = colorCol.variables.find((v) => v.name === "color/primary")!;
    vRole.name = "color/main-primary";

    const res = exportSnapshotToTokensJson(snapshot);
    const json = res.jsonObject as Record<string, Record<string, Record<string, RoleToken>>>;

    expect(json.palette["custom primary"]?.["40"]).toBeDefined();
    expect(json.palette.primary?.["40"]).toBeUndefined();

    expect(json["color light"].color["main-primary"]).toBeDefined();
    expect(json["color light"].color.primary).toBeUndefined();

    expect(json["color light"].color["main-primary"].value).toBe("{palette.custom primary.40}");
  });

  it("key structure matches sample/tokens.json (palette, color light, color dark, nesting, value formats)", () => {
    const payload = getSamplePayload();
    const plan = buildWritePlan(payload, { fallback: false });
    const res = exportSnapshotToTokensJson(plan);

    const generated = res.jsonObject;
    expect(Object.keys(generated)).toEqual(Object.keys(sample));

    expect(res.counts.paletteTokens).toBe(122);
    expect(res.counts.roleTokensLight).toBe(57);
    expect(res.counts.roleTokensDark).toBe(57);
  });
});

describe("ADDITIONAL REQUIREMENT: Exporter Comparison with Sample/tokens.json", () => {
  it("compares exporter output with sample/tokens.json key paths, value formats, and role references", () => {
    const sampleObj = sample as Record<string, Record<string, unknown>>;
    const samplePalTokens = extractTokenPaths(sampleObj.palette);
    const sampleLightTokens = extractTokenPaths(sampleObj["color light"]);
    const sampleDarkTokens = extractTokenPaths(sampleObj["color dark"]);

    // Assert key path counts (ignoring extensions blocks)
    expect(samplePalTokens.length).toBe(122);
    expect(sampleLightTokens.length).toBe(57);
    expect(sampleDarkTokens.length).toBe(57);

    const primaryObj = (sampleObj.palette.primary as Record<string, { value: string }>)["40"];
    const samplePrimaryHex8 = primaryObj.value;
    const samplePrimaryHex6 = samplePrimaryHex8.substring(0, 7);

    const tertiaryObj = (sampleObj.palette.tertiary as Record<string, { value: string }>)["40"];
    const sampleTertiaryHex8 = tertiaryObj.value;
    const sampleTertiaryHex6 = sampleTertiaryHex8.substring(0, 7);

    // Rebuild system from sample's primary and key colors with default settings
    const sys = buildColorSystem(
      { primary: samplePrimaryHex6, tertiary: sampleTertiaryHex6 },
      { secondary: "material", tertiary: "custom", autoFixContrast: true },
    );
    const payload = buildCreatePayload(sys);
    const plan = buildWritePlan(payload, { fallback: false });
    const res = exportSnapshotToTokensJson(plan);
    const generated = res.jsonObject as Record<string, Record<string, unknown>>;

    const genPalTokens = extractTokenPaths(generated.palette);
    const genLightTokens = extractTokenPaths(generated["color light"]);
    const genDarkTokens = extractTokenPaths(generated["color dark"]);

    // Key path counts match sample/tokens.json exactly
    expect(genPalTokens.length).toBe(122);
    expect(genLightTokens.length).toBe(57);
    expect(genDarkTokens.length).toBe(57);

    // Set of key paths are 100% identical
    const samplePalPaths = new Set(samplePalTokens.map((t) => t.path));
    const genPalPaths = new Set(genPalTokens.map((t) => t.path));
    expect(genPalPaths).toEqual(samplePalPaths);

    const sampleLightPaths = new Set(sampleLightTokens.map((t) => t.path));
    const genLightPaths = new Set(genLightTokens.map((t) => t.path));
    expect(genLightPaths).toEqual(sampleLightPaths);

    const sampleDarkPaths = new Set(sampleDarkTokens.map((t) => t.path));
    const genDarkPaths = new Set(genDarkTokens.map((t) => t.path));
    expect(genDarkPaths).toEqual(sampleDarkPaths);

    // Value formats match
    for (const item of genPalTokens) {
      expect(item.token.value).toMatch(/^#[0-9a-f]{8}$/);
    }

    for (const item of [...genLightTokens, ...genDarkTokens]) {
      expect(item.token.value).toMatch(/^\{palette\.[a-z0-9\s-]+\.[0-9]+\}$/);
    }

    // Role references comparison
    const sampleLightMap = new Map(sampleLightTokens.map((t) => [t.path, t.token.value]));
    const sampleDarkMap = new Map(sampleDarkTokens.map((t) => [t.path, t.token.value]));

    const diffs: Array<{ role: string; mode: string; expected: string; actual: string }> = [];

    for (const item of genLightTokens) {
      const expected = sampleLightMap.get(item.path);
      const actual = item.token.value;
      if (expected !== actual) {
        diffs.push({ role: item.path, mode: "Light", expected: expected || "missing", actual });
      }
    }

    for (const item of genDarkTokens) {
      const expected = sampleDarkMap.get(item.path);
      const actual = item.token.value;
      if (expected !== actual) {
        diffs.push({ role: item.path, mode: "Dark", expected: expected || "missing", actual });
      }
    }

    if (diffs.length > 0) {
      const diffReport = diffs
        .map((d) => `Role '${d.role}' (${d.mode}): expected sample '${d.expected}', got '${d.actual}'`)
        .join("\n");
      throw new Error(`Role reference mismatch with sample/tokens.json:\n${diffReport}`);
    }

    expect(diffs.length).toBe(0);
  });
});
