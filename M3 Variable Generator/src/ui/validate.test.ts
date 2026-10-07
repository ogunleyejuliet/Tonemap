import { describe, expect, it } from "vitest";
import { isValidHexField, parseHexField } from "./validate.js";

describe("hex field parsing", () => {
  it("accepts 6 digits with or without #", () => {
    expect(parseHexField("#6750A4")).toBe("#6750A4");
    expect(parseHexField("6750A4")).toBe("#6750A4");
  });

  it("accepts lowercase and normalizes to uppercase", () => {
    expect(parseHexField("#ff0000")).toBe("#FF0000");
    expect(parseHexField("2e9e4f")).toBe("#2E9E4F");
  });

  it("trims surrounding whitespace", () => {
    expect(parseHexField("  #6750A4  ")).toBe("#6750A4");
    expect(parseHexField("\t00796B\n")).toBe("#00796B");
  });

  it("rejects the 3-digit shorthand", () => {
    expect(parseHexField("#abc")).toBeNull();
    expect(parseHexField("abc")).toBeNull();
    expect(parseHexField("#FFF")).toBeNull();
  });

  it("rejects invalid characters", () => {
    expect(parseHexField("#GGGGGG")).toBeNull();
    expect(parseHexField("red")).toBeNull();
    expect(parseHexField("#6750A!")).toBeNull();
    expect(parseHexField("# 6750")).toBeNull();
  });

  it("rejects wrong lengths", () => {
    expect(parseHexField("")).toBeNull();
    expect(parseHexField("#")).toBeNull();
    expect(parseHexField("#12345")).toBeNull();
    expect(parseHexField("6750A")).toBeNull();
    expect(parseHexField("#1234567")).toBeNull();
    expect(parseHexField("#RRGGBBAA")).toBeNull();
  });

  it("isValidHexField agrees with parseHexField", () => {
    expect(isValidHexField("#6750A4")).toBe(true);
    expect(isValidHexField("6750a4")).toBe(true);
    expect(isValidHexField("#abc")).toBe(false);
    expect(isValidHexField("nope")).toBe(false);
    expect(isValidHexField("")).toBe(false);
  });
});
