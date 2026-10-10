import { describe, expect, it } from "vitest";
import {
  getActionButtonState,
  serializeSavedInputs,
  parseSavedInputs,
  getDefaultInputs,
  type SavedInputs,
} from "./inputs.js";

describe("getActionButtonState pure function", () => {
  it("returns Create state when system does not exist", () => {
    const res = getActionButtonState(false);
    expect(res.label).toBe("Create variables");
    expect(res.helperText).toBe("");
    expect(res.showHelper).toBe(false);
    expect(res.mode).toBe("create");
  });

  it("returns Update state with helper text when system exists", () => {
    const res = getActionButtonState(true);
    expect(res.label).toBe("Update variables");
    expect(res.helperText).toBe("A system has already been created. Just update or change your values.");
    expect(res.showHelper).toBe(true);
    expect(res.mode).toBe("update");
  });
});

describe("saving and loading inputs pure functions", () => {
  it("1. performs a full round trip", () => {
    const inputState: SavedInputs = {
      version: 1,
      primary: "#00E3AA",
      secondaryMethod: "analogous",
      secondaryHex: "#123456",
      tertiaryMethod: "custom",
      tertiaryHex: "#654321",
      neutral: "#112233",
      neutralVariant: "#445566",
      error: "#778899",
      warning: "#AABBCC",
      success: "#DDEEFF",
      autoFix: false,
    };

    const json = serializeSavedInputs(inputState);
    const parsed = parseSavedInputs(json);

    expect(parsed).toEqual(inputState);
  });

  it("2. handles invalid JSON gracefully using defaults", () => {
    const defaults = getDefaultInputs();

    expect(parseSavedInputs("invalid json string")).toEqual(defaults);
    expect(parseSavedInputs(null)).toEqual(defaults);
    expect(parseSavedInputs(undefined)).toEqual(defaults);
    expect(parseSavedInputs(12345)).toEqual(defaults);
    expect(parseSavedInputs("{ truncated json")).toEqual(defaults);
  });

  it("3. supplies default values for missing or invalid fields without throwing errors", () => {
    const partialJson = JSON.stringify({
      primary: "#FF0000",
      secondaryMethod: "triadic",
      // missing secondaryHex, tertiaryMethod, neutral, error, autoFix, etc.
    });

    const parsed = parseSavedInputs(partialJson);

    expect(parsed.primary).toBe("#FF0000");
    expect(parsed.secondaryMethod).toBe("triadic");
    expect(parsed.version).toBe(1);
    expect(parsed.autoFix).toBe(true);
    // Missing neutral/error/etc. are filled with defaults for #FF0000
    const expectedDefaults = getDefaultInputs("#FF0000");
    expect(parsed.neutral).toBe(expectedDefaults.neutral);
    expect(parsed.error).toBe(expectedDefaults.error);
    expect(parsed.warning).toBe(expectedDefaults.warning);
    expect(parsed.success).toBe(expectedDefaults.success);
  });

  it("4. handles an older version number seamlessly", () => {
    const olderVersionJson = JSON.stringify({
      version: 0,
      primary: "#184CC3",
      secondaryMethod: "material",
      autoFix: true,
    });

    const parsed = parseSavedInputs(olderVersionJson);

    expect(parsed.version).toBe(0);
    expect(parsed.primary).toBe("#184CC3");
    expect(parsed.secondaryMethod).toBe("material");
    const expectedDefaults = getDefaultInputs("#184CC3");
    expect(parsed.neutral).toBe(expectedDefaults.neutral);
  });
});
