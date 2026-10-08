import { describe, it, expect } from "vitest";
import { buildColorSystem } from "../colors/system.js";
import { validatePayload, buildWritePlan, buildCreatePayload } from "./plan.js";

describe("variable write plan builder and validator", () => {
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

  it("builds the standard write plan with correct collections, counts, and names", () => {
    const plan = buildWritePlan(validPayload, { fallback: false });
    expect(plan.useFallback).toBe(false);
    expect(plan.collections.length).toBe(2);

    const paletteCol = plan.collections[0];
    const colorCol = plan.collections[1];

    expect(paletteCol.name).toBe("Palette");
    expect(paletteCol.modes).toEqual(["Value"]);

    expect(colorCol.name).toBe("Color");
    expect(colorCol.modes).toEqual(["Light", "Dark"]);

    // Check counts: 7 palettes * 14 tones + 1 palette * 24 tones = 122 palette vars; 57 role vars
    expect(paletteCol.variables.length).toBe(122);
    expect(colorCol.variables.length).toBe(57);
    expect(plan.totalVariables).toBe(179);

    // Check variable naming examples
    const primary40 = paletteCol.variables.find((v) => v.name === "Primary/40");
    expect(primary40).toBeDefined();
    expect(primary40?.valuesByMode.Value.type).toBe("COLOR");

    const nv50 = paletteCol.variables.find((v) => v.name === "Neutral Variant/50");
    expect(nv50).toBeDefined();

    const colorPrimary = colorCol.variables.find((v) => v.name === "color/primary");
    expect(colorPrimary).toBeDefined();

    const colorOnPrimaryContainer = colorCol.variables.find(
      (v) => v.name === "color/on-primary-container",
    );
    expect(colorOnPrimaryContainer).toBeDefined();
  });

  it("ensures EVERY role variable value in standard and fallback plans is an ALIAS and not a hex color", () => {
    const stdPlan = buildWritePlan(validPayload, { fallback: false });
    const colorCol = stdPlan.collections[1];

    for (const vSpec of colorCol.variables) {
      expect(vSpec.valuesByMode.Light.type).toBe("ALIAS");
      expect(vSpec.valuesByMode.Dark.type).toBe("ALIAS");
      // Target names should refer to Palette variables
      expect((vSpec.valuesByMode.Light as any).targetName).toMatch(/^[A-Za-z ]+\/\d+$/);
      expect((vSpec.valuesByMode.Dark as any).targetName).toMatch(/^[A-Za-z ]+\/\d+$/);
    }

    const fbPlan = buildWritePlan(validPayload, { fallback: true });
    const lightCol = fbPlan.collections[1];
    const darkCol = fbPlan.collections[2];

    for (const vSpec of lightCol.variables) {
      expect(vSpec.valuesByMode.Light.type).toBe("ALIAS");
    }
    for (const vSpec of darkCol.variables) {
      expect(vSpec.valuesByMode.Dark.type).toBe("ALIAS");
    }
  });

  it("builds the fallback write plan producing 3 collections", () => {
    const plan = buildWritePlan(validPayload, { fallback: true });
    expect(plan.useFallback).toBe(true);
    expect(plan.collections.length).toBe(3);

    const paletteCol = plan.collections[0];
    const lightCol = plan.collections[1];
    const darkCol = plan.collections[2];

    expect(paletteCol.name).toBe("Palette");
    expect(lightCol.name).toBe("Color Light");
    expect(lightCol.modes).toEqual(["Light"]);
    expect(darkCol.name).toBe("Color Dark");
    expect(darkCol.modes).toEqual(["Dark"]);

    expect(paletteCol.variables.length).toBe(122);
    expect(lightCol.variables.length).toBe(57);
    expect(darkCol.variables.length).toBe(57);
    expect(plan.totalVariables).toBe(236);
  });
});
