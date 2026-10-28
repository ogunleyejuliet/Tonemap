import { describe, it, expect } from "vitest";
import { buildColorSystem } from "../colors/system.js";
import { ROLE_DEFINITIONS, type RoleName } from "../colors/roles.js";
import {
  validatePayload,
  buildWritePlan,
  buildCreatePayload,
  PALETTE_ORDER,
  COLLECTION_NAMES,
  paletteLabel,
  palettePrefix,
  keyColorVariableName,
  paletteVariableName,
  roleVariableName,
} from "./plan.js";

describe("variable write plan builder and validator (layout version 4, all lowercase names)", () => {
  const validSystem = buildColorSystem({ primary: "#6750A4" });
  const validPayload = buildCreatePayload(validSystem);

  it("validates a correct payload successfully", () => {
    const result = validatePayload(validPayload);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid payloads with clear error messages", () => {
    // Missing payload
    expect(validatePayload(null).valid).toBe(false);

    // Missing palettes
    expect(validatePayload({ roleRefs: {} }).valid).toBe(false);
    expect((validatePayload({ roleRefs: {} }) as any).error).toMatch(/palettes/i);

    // Missing palette key
    const missingPalettePayload = JSON.parse(JSON.stringify(validPayload));
    delete missingPalettePayload.palettes.secondary;
    const res1 = validatePayload(missingPalettePayload);
    expect(res1.valid).toBe(false);
    if (!res1.valid) expect(res1.error).toContain("secondary");

    // Invalid hex
    const invalidHexPayload = JSON.parse(JSON.stringify(validPayload));
    invalidHexPayload.palettes.primary.hex[40] = "NOT_A_HEX";
    const res2 = validatePayload(invalidHexPayload);
    expect(res2.valid).toBe(false);
    if (!res2.valid) expect(res2.error).toContain("NOT_A_HEX");

    // Broken role reference (target palette tone missing)
    const brokenRolePayload = JSON.parse(JSON.stringify(validPayload));
    brokenRolePayload.roleRefs.primary.lightTone = 999;
    const res3 = validatePayload(brokenRolePayload);
    expect(res3.valid).toBe(false);
    if (!res3.valid) expect(res3.error).toContain("999");
  });

  it("builds the layout version 4 write plan with 2 collections tagged m3gen_layout=4 and all lowercase names", () => {
    const plan = buildWritePlan(validPayload);
    expect(plan.collections.length).toBe(2);

    const primitivesCol = plan.collections[0];
    const colorRolesCol = plan.collections[1];

    expect(primitivesCol.name).toBe(COLLECTION_NAMES.primitives);
    expect(primitivesCol.name).toBe("primitives");
    expect(primitivesCol.modes).toEqual(["Value"]);
    expect(primitivesCol.pluginData.m3gen).toBe("1");
    expect(primitivesCol.pluginData.m3gen_layout).toBe("4");
    expect(primitivesCol.pluginData.m3gen_id).toBe("collection:primitives");

    expect(colorRolesCol.name).toBe(COLLECTION_NAMES.colorRoles);
    expect(colorRolesCol.name).toBe("color roles");
    expect(colorRolesCol.modes).toEqual(["Value"]);
    expect(colorRolesCol.pluginData.m3gen).toBe("1");
    expect(colorRolesCol.pluginData.m3gen_layout).toBe("4");
    expect(colorRolesCol.pluginData.m3gen_id).toBe("collection:color_roles");

    // Primitives: 8 key colors + 122 palette variables = 130 variables
    expect(primitivesCol.variables.length).toBe(130);

    const keyColorVars = primitivesCol.variables.filter((v) => v.name.startsWith("key colors/"));
    expect(keyColorVars.length).toBe(8);

    const paletteVars = primitivesCol.variables.filter((v) => v.name.startsWith("color palettes/"));
    expect(paletteVars.length).toBe(122);

    // Color Roles: 57 Light variables + 57 Dark variables = 114 variables
    expect(colorRolesCol.variables.length).toBe(114);

    const lightRoles = colorRolesCol.variables.filter((v) => v.name.startsWith("color light/"));
    expect(lightRoles.length).toBe(57);

    const darkRoles = colorRolesCol.variables.filter((v) => v.name.startsWith("color dark/"));
    expect(darkRoles.length).toBe(57);

    // Total variables across both collections
    expect(plan.totalVariables).toBe(244);
  });

  it("asserts that no collection, group or variable name in the write plan contains an uppercase letter", () => {
    const plan = buildWritePlan(validPayload);

    for (const col of plan.collections) {
      expect(/[A-Z]/.test(col.name)).toBe(false);

      for (const v of col.variables) {
        expect(/[A-Z]/.test(v.name)).toBe(false);

        // Check path parts (groups)
        const parts = v.name.split("/");
        for (const part of parts) {
          expect(/[A-Z]/.test(part)).toBe(false);
        }

        // For aliases, check targetName
        const modeVal = v.valuesByMode.Value;
        if (modeVal && modeVal.type === "ALIAS") {
          expect(/[A-Z]/.test(modeVal.targetName)).toBe(false);
        }
      }
    }
  });

  it("checks key color variable names using centralized keyColorVariableName helper", () => {
    const plan = buildWritePlan(validPayload);
    const primitivesCol = plan.collections[0];

    for (const pKey of PALETTE_ORDER) {
      const expectedName = keyColorVariableName(pKey);
      const found = primitivesCol.variables.find((v) => v.id === `key:${pKey}`);
      expect(found).toBeDefined();
      expect(found?.name).toBe(expectedName);
      expect(/[A-Z]/.test(expectedName)).toBe(false);
    }

    expect(keyColorVariableName("primary")).toBe("key colors/primary");
    expect(keyColorVariableName("neutralVariant")).toBe("key colors/neutral variant");
  });

  it("checks that every palette variable name equals its lowercase group name plus its tone using centralized helper", () => {
    const plan = buildWritePlan(validPayload);
    const primitivesCol = plan.collections[0];

    const paletteVars = primitivesCol.variables.filter((v) => v.name.startsWith("color palettes/"));
    expect(paletteVars.length).toBe(122);

    for (const pKey of PALETTE_ORDER) {
      const palette = validPayload.palettes[pKey];

      for (const tone of palette.tones) {
        const expectedName = paletteVariableName(pKey, tone);
        const found = paletteVars.find((v) => v.id === `palette:${pKey}:${tone}`);
        expect(found).toBeDefined();
        expect(found?.name).toBe(expectedName);
        expect(/[A-Z]/.test(expectedName)).toBe(false);
      }
    }

    // Specific examples requested in prompt
    const primary0 = primitivesCol.variables.find((v) => v.id === "palette:primary:0");
    expect(primary0?.name).toBe("color palettes/primary/primary0");

    const primary40 = primitivesCol.variables.find((v) => v.id === "palette:primary:40");
    expect(primary40?.name).toBe("color palettes/primary/primary40");

    const sec40 = primitivesCol.variables.find((v) => v.id === "palette:secondary:40");
    expect(sec40?.name).toBe("color palettes/secondary/secondary40");

    const nv40 = primitivesCol.variables.find((v) => v.id === "palette:neutralVariant:40");
    expect(nv40?.name).toBe("color palettes/neutral variant/neutral-variant40");

    const nv50 = primitivesCol.variables.find((v) => v.id === "palette:neutralVariant:50");
    expect(nv50?.name).toBe("color palettes/neutral variant/neutral-variant50");

    const n4 = primitivesCol.variables.find((v) => v.id === "palette:neutral:4");
    expect(n4?.name).toBe("color palettes/neutral/neutral4");
  });

  it("checks that every role variable name matches roleVariableName helper without extra 'color' level", () => {
    const plan = buildWritePlan(validPayload);
    const colorRolesCol = plan.collections[1];

    for (const roleName of Object.keys(ROLE_DEFINITIONS) as RoleName[]) {
      const expectedLight = roleVariableName("light", roleName);
      const lightVar = colorRolesCol.variables.find((v) => v.id === `role:light:${roleName}`);
      expect(lightVar).toBeDefined();
      expect(lightVar?.name).toBe(expectedLight);
      expect(/[A-Z]/.test(expectedLight)).toBe(false);

      const expectedDark = roleVariableName("dark", roleName);
      const darkVar = colorRolesCol.variables.find((v) => v.id === `role:dark:${roleName}`);
      expect(darkVar).toBeDefined();
      expect(darkVar?.name).toBe(expectedDark);
      expect(/[A-Z]/.test(expectedDark)).toBe(false);
    }

    // Examples requested in prompt
    const lightPrimary = colorRolesCol.variables.find((v) => v.id === "role:light:primary");
    expect(lightPrimary?.name).toBe("color light/primary");

    const darkOnPrimary = colorRolesCol.variables.find((v) => v.id === "role:dark:onPrimary");
    expect(darkOnPrimary?.name).toBe("color dark/on-primary");
  });

  it("ensures EVERY role variable value is an ALIAS to a matching lowercase color palettes variable, never a raw hex", () => {
    const plan = buildWritePlan(validPayload);
    const primitivesCol = plan.collections[0];
    const colorRolesCol = plan.collections[1];

    const paletteIds = new Set(primitivesCol.variables.map((v) => v.id));
    const paletteNames = new Set(primitivesCol.variables.map((v) => v.name));

    for (const vSpec of colorRolesCol.variables) {
      expect(vSpec.valuesByMode.Value.type).toBe("ALIAS");
      const aliasPlan = vSpec.valuesByMode.Value as {
        type: "ALIAS";
        targetId: string;
        targetName: string;
      };

      // Target must exist in primitives collection color palettes
      expect(paletteIds.has(aliasPlan.targetId)).toBe(true);
      expect(paletteNames.has(aliasPlan.targetName)).toBe(true);
      // Target name format: color palettes/<group>/<prefix><tone>
      expect(aliasPlan.targetName).toMatch(/^color palettes\/[a-z ]+\/[a-z-]+[0-9]+$/);
      expect(/[A-Z]/.test(aliasPlan.targetName)).toBe(false);
    }
  });

  it("builds write plan with accent color on: 9 key colors, 136 palette variables, 61 roles in each of light and dark", () => {
    const accentSystem = buildColorSystem(
      { primary: "#6750A4" },
      { accentEnabled: true, accent: "complementary" },
    );
    const accentPayload = buildCreatePayload(accentSystem);

    const val = validatePayload(accentPayload);
    expect(val.valid).toBe(true);

    const plan = buildWritePlan(accentPayload);
    expect(plan.collections.length).toBe(2);

    const primitivesCol = plan.collections[0];
    const colorRolesCol = plan.collections[1];

    // Key colors: 8 base + 1 accent = 9
    const keyColorVars = primitivesCol.variables.filter((v) => v.name.startsWith("key colors/"));
    expect(keyColorVars.length).toBe(9);
    const accentKey = primitivesCol.variables.find((v) => v.id === "key:accent");
    expect(accentKey).toBeDefined();
    expect(accentKey?.name).toBe("key colors/accent");

    // Palette variables: 122 base + 14 accent = 136
    const paletteVars = primitivesCol.variables.filter((v) => v.name.startsWith("color palettes/"));
    expect(paletteVars.length).toBe(136);

    const accentPaletteVars = primitivesCol.variables.filter((v) =>
      v.name.startsWith("color palettes/accent/"),
    );
    expect(accentPaletteVars.length).toBe(14);
    expect(primitivesCol.variables.find((v) => v.id === "palette:accent:0")?.name).toBe(
      "color palettes/accent/accent0",
    );
    expect(primitivesCol.variables.find((v) => v.id === "palette:accent:40")?.name).toBe(
      "color palettes/accent/accent40",
    );
    expect(primitivesCol.variables.find((v) => v.id === "palette:accent:100")?.name).toBe(
      "color palettes/accent/accent100",
    );

    // Primitives total: 9 + 136 = 145
    expect(primitivesCol.variables.length).toBe(145);

    // Roles: 57 base + 4 accent = 61 in each mode
    const lightRoles = colorRolesCol.variables.filter((v) => v.name.startsWith("color light/"));
    expect(lightRoles.length).toBe(61);

    const darkRoles = colorRolesCol.variables.filter((v) => v.name.startsWith("color dark/"));
    expect(darkRoles.length).toBe(61);

    // Color roles total: 61 + 61 = 122
    expect(colorRolesCol.variables.length).toBe(122);

    // Total variables across both collections: 145 + 122 = 267
    expect(plan.totalVariables).toBe(267);
  });

  it("asserts accent roles are aliases to accent palette variables", () => {
    const accentSystem = buildColorSystem(
      { primary: "#6750A4" },
      { accentEnabled: true, accent: "complementary", autoFixContrast: false },
    );
    const accentPayload = buildCreatePayload(accentSystem);
    const plan = buildWritePlan(accentPayload);
    const colorRolesCol = plan.collections[1];

    const accentRoles = [
      { role: "accent", lightExpected: "color palettes/accent/accent40", darkExpected: "color palettes/accent/accent80" },
      { role: "onAccent", lightExpected: "color palettes/accent/accent100", darkExpected: "color palettes/accent/accent20" },
      { role: "accentContainer", lightExpected: "color palettes/accent/accent90", darkExpected: "color palettes/accent/accent30" },
      { role: "onAccentContainer", lightExpected: "color palettes/accent/accent10", darkExpected: "color palettes/accent/accent90" },
    ];

    for (const { role, lightExpected, darkExpected } of accentRoles) {
      const lightVar = colorRolesCol.variables.find((v) => v.id === `role:light:${role}`);
      expect(lightVar).toBeDefined();
      expect(lightVar?.valuesByMode.Value.type).toBe("ALIAS");
      const lightAlias = lightVar?.valuesByMode.Value as { type: "ALIAS"; targetId: string; targetName: string };
      expect(lightAlias.targetName).toBe(lightExpected);

      const darkVar = colorRolesCol.variables.find((v) => v.id === `role:dark:${role}`);
      expect(darkVar).toBeDefined();
      expect(darkVar?.valuesByMode.Value.type).toBe("ALIAS");
      const darkAlias = darkVar?.valuesByMode.Value as { type: "ALIAS"; targetId: string; targetName: string };
      expect(darkAlias.targetName).toBe(darkExpected);
    }
  });
});
