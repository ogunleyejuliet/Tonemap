import { describe, expect, it } from "vitest";
import {
  parseHexInput,
  pickerToCanonicalHex,
  resolveHexOrLastValid,
  toPickerValue,
} from "./colorFieldLogic";

describe("colorFieldLogic", () => {
  describe("parseHexInput", () => {
    it("parses valid hex with leading # (lowercase, uppercase, mixed-case)", () => {
      expect(parseHexInput("#6750a4")).toBe("#6750A4");
      expect(parseHexInput("#6750A4")).toBe("#6750A4");
      expect(parseHexInput("#00e3aa")).toBe("#00E3AA");
      expect(parseHexInput("#00E3AA")).toBe("#00E3AA");
      expect(parseHexInput("#1a2B3c")).toBe("#1A2B3C");
    });

    it("parses valid hex without leading # (lowercase, uppercase, mixed-case)", () => {
      expect(parseHexInput("6750a4")).toBe("#6750A4");
      expect(parseHexInput("6750A4")).toBe("#6750A4");
      expect(parseHexInput("00e3aa")).toBe("#00E3AA");
      expect(parseHexInput("00E3AA")).toBe("#00E3AA");
      expect(parseHexInput("ff5449")).toBe("#FF5449");
    });

    it("trims surrounding whitespace before parsing", () => {
      expect(parseHexInput("  #6750a4  ")).toBe("#6750A4");
      expect(parseHexInput("   6750A4 \n")).toBe("#6750A4");
    });

    it("returns null for invalid inputs", () => {
      expect(parseHexInput("")).toBeNull();
      expect(parseHexInput("   ")).toBeNull();
      expect(parseHexInput("#123")).toBeNull(); // 3-digit shorthand not accepted
      expect(parseHexInput("123")).toBeNull();
      expect(parseHexInput("#12345")).toBeNull();
      expect(parseHexInput("#1234567")).toBeNull(); // 8-digit hex not accepted in key color input
      expect(parseHexInput("hello")).toBeNull();
      expect(parseHexInput("#xyz123")).toBeNull();
    });
  });

  describe("toPickerValue", () => {
    it("converts hex with or without # and any casing to lowercase picker value", () => {
      expect(toPickerValue("#6750A4")).toBe("#6750a4");
      expect(toPickerValue("6750A4")).toBe("#6750a4");
      expect(toPickerValue("#00E3AA")).toBe("#00e3aa");
      expect(toPickerValue("00e3aa")).toBe("#00e3aa");
    });

    it("falls back to the last valid value or default when input is invalid", () => {
      expect(toPickerValue("invalid", "#6750A4")).toBe("#6750a4");
      expect(toPickerValue("", "#00E3AA")).toBe("#00e3aa");
      expect(toPickerValue("12345", "FF5449")).toBe("#ff5449");
      expect(toPickerValue("bad")).toBe("#000000");
    });
  });

  describe("resolveHexOrLastValid", () => {
    it("returns parsed canonical uppercase hex with isValid = true for valid input", () => {
      // With #
      expect(resolveHexOrLastValid("#6750a4", "#000000")).toEqual({
        hex: "#6750A4",
        isValid: true,
      });
      // Without #
      expect(resolveHexOrLastValid("6750a4", "#000000")).toEqual({
        hex: "#6750A4",
        isValid: true,
      });
      // Uppercase
      expect(resolveHexOrLastValid("#00E3AA", "#6750A4")).toEqual({
        hex: "#00E3AA",
        isValid: true,
      });
      // Lowercase without #
      expect(resolveHexOrLastValid("ff5449", "#6750A4")).toEqual({
        hex: "#FF5449",
        isValid: true,
      });
    });

    it("returns last valid hex with isValid = false for invalid input", () => {
      const lastValid = "#6750A4";
      expect(resolveHexOrLastValid("", lastValid)).toEqual({
        hex: "#6750A4",
        isValid: false,
      });
      expect(resolveHexOrLastValid("#bad", lastValid)).toEqual({
        hex: "#6750A4",
        isValid: false,
      });
      expect(resolveHexOrLastValid("123", lastValid)).toEqual({
        hex: "#6750A4",
        isValid: false,
      });
      expect(resolveHexOrLastValid("not-a-color", lastValid)).toEqual({
        hex: "#6750A4",
        isValid: false,
      });
    });
  });

  describe("pickerToCanonicalHex", () => {
    it("converts lowercase picker value to canonical uppercase hex", () => {
      expect(pickerToCanonicalHex("#6750a4")).toBe("#6750A4");
      expect(pickerToCanonicalHex("#00e3aa")).toBe("#00E3AA");
      expect(pickerToCanonicalHex("#ff5449")).toBe("#FF5449");
    });

    it("falls back to #000000 if invalid", () => {
      expect(pickerToCanonicalHex("invalid")).toBe("#000000");
    });
  });
});
