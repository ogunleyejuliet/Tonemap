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
    expect(res.disabled).toBe(false);
  });

  it("returns disabled state with older layout message when isOldLayout is true", () => {
    const res = getActionButtonState(false, true);
    expect(res.label).toBe("Create variables");
    expect(res.helperText).toBe(
      "This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create.",
    );
    expect(res.showHelper).toBe(true);
    expect(res.disabled).toBe(true);
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

  it("5. performs a full round trip including accent color inputs", () => {
    const inputStateWithAccent: SavedInputs = {
      version: 1,
      primary: "#00E3AA",
      secondaryMethod: "analogous",
      secondaryHex: "#123456",
      tertiaryMethod: "custom",
      tertiaryHex: "#654321",
      accentEnabled: true,
      accentMethod: "split-complementary",
      accentHex: "#FF9900",
      neutral: "#112233",
      neutralVariant: "#445566",
      error: "#778899",
      warning: "#AABBCC",
      success: "#DDEEFF",
      autoFix: false,
    };

    const json = serializeSavedInputs(inputStateWithAccent);
    const parsed = parseSavedInputs(json);

    expect(parsed).toEqual(inputStateWithAccent);
    expect(parsed.accentEnabled).toBe(true);
    expect(parsed.accentMethod).toBe("split-complementary");
    expect(parsed.accentHex).toBe("#FF9900");
  });

  it("6. performs a full round trip including option indices", () => {
    const inputStateWithOptions: SavedInputs = {
      version: 1,
      primary: "#6750A4",
      secondaryMethod: "analogous",
      secondaryHex: "#7D47B7",
      secondaryOption: 2,
      tertiaryMethod: "analogous",
      tertiaryHex: "#4C5991",
      tertiaryOption: 3,
      accentEnabled: true,
      accentMethod: "complementary",
      accentHex: "#68A850",
      accentOption: 1,
      neutral: "#112233",
      neutralVariant: "#445566",
      error: "#778899",
      warning: "#AABBCC",
      success: "#DDEEFF",
      autoFix: false,
    };

    const json = serializeSavedInputs(inputStateWithOptions);
    const parsed = parseSavedInputs(json);

    expect(parsed).toEqual(inputStateWithOptions);
    expect(parsed.secondaryOption).toBe(2);
    expect(parsed.tertiaryOption).toBe(3);
    expect(parsed.accentOption).toBe(1);
  });
});

