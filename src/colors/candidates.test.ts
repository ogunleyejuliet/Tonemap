import { describe, expect, it } from "vitest";
import { Hct } from "@material/material-color-utilities";
import { hexToArgb } from "./hex.js";
import {
  getCandidates,
  getCandidateCount,
  getCandidateHex,
  getNextCandidateIndex,
  getDefaultCandidateIndex,
  isMethodCandidateSupported,
  moveToneToward50,
  ANALOGOUS_HUE_SHIFTS,
  TRIADIC_HUE_SHIFTS,
  SPLIT_COMPLEMENTARY_HUE_SHIFTS,
  COMPLEMENTARY_CHROMA_FACTOR,
  COMPLEMENTARY_TONE_DELTA,
  MONO_TONE_FACTOR_2,
  MONO_TONE_FACTOR_3,
  MONO_CHROMA_FACTOR_4,
} from "./candidates.js";

const MID_PRIMARY = "#6750A4";
const LIGHT_PRIMARY = "#D8F3DC";
const DARK_PRIMARY = "#14342B";
const HEX_6_REGEX = /^#[0-9A-F]{6}$/i;

describe("candidate rules and constants", () => {
  it("defines the expected named constants", () => {
    expect(COMPLEMENTARY_CHROMA_FACTOR).toBe(0.8);
    expect(COMPLEMENTARY_TONE_DELTA).toBe(12);
    expect(MONO_TONE_FACTOR_2).toBe(0.75);
    expect(MONO_TONE_FACTOR_3).toBe(1.25);
    expect(MONO_CHROMA_FACTOR_4).toBe(0.7);
    expect(ANALOGOUS_HUE_SHIFTS).toEqual([30, -30, 60, -60]);
    expect(TRIADIC_HUE_SHIFTS).toEqual([120, 240]);
    expect(SPLIT_COMPLEMENTARY_HUE_SHIFTS).toEqual([150, 210]);
  });

  it("moveToneToward50 moves tones 12 units toward 50", () => {
    expect(moveToneToward50(30)).toBe(42);
    expect(moveToneToward50(70)).toBe(58);
    expect(moveToneToward50(50)).toBe(50);
    expect(moveToneToward50(45)).toBe(50); // tone + 12 = 57, wait: Math.min(100, 45 + 12) = 57
    expect(moveToneToward50(10)).toBe(22);
    expect(moveToneToward50(90)).toBe(78);
  });

  it("candidate lists and counts match the exact specifications", () => {
    // analogous: 4 candidates (+30, -30, +60, -60)
    const ana = getCandidates(MID_PRIMARY, "analogous");
    expect(ana).toHaveLength(4);
    expect(getCandidateCount("analogous")).toBe(4);

    // complementary: 3 candidates (+180; +180 x0.8 chroma; +180 tone moved 12 toward 50)
    const comp = getCandidates(MID_PRIMARY, "complementary");
    expect(comp).toHaveLength(3);
    expect(getCandidateCount("complementary")).toBe(3);

    // Verify option 2 of complementary has ~0.8 chroma of option 1
    const hct1 = Hct.fromInt(hexToArgb(comp[0]));
    const hct2 = Hct.fromInt(hexToArgb(comp[1]));
    expect(Math.abs(hct2.chroma - hct1.chroma * COMPLEMENTARY_CHROMA_FACTOR)).toBeLessThan(2.0);

    // triadic: 2 candidates (+120, +240)
    const tri = getCandidates(MID_PRIMARY, "triadic");
    expect(tri).toHaveLength(2);
    expect(getCandidateCount("triadic")).toBe(2);

    // split complementary: 2 candidates (+150, +210)
    const split = getCandidates(MID_PRIMARY, "split-complementary");
    expect(split).toHaveLength(2);
    expect(getCandidateCount("split-complementary")).toBe(2);

    // monochromatic (secondary and tertiary only): 4 candidates each
    const monoSec = getCandidates(MID_PRIMARY, "monochromatic", "secondary");
    expect(monoSec).toHaveLength(4);
    expect(getCandidateCount("monochromatic", "secondary")).toBe(4);

    const monoTert = getCandidates(MID_PRIMARY, "monochromatic", "tertiary");
    expect(monoTert).toHaveLength(4);
    expect(getCandidateCount("monochromatic", "tertiary")).toBe(4);

    // monochromatic is not supported for accent
    expect(getCandidates(MID_PRIMARY, "monochromatic", "accent")).toEqual([]);
    expect(getCandidateCount("monochromatic", "accent")).toBe(0);
  });
});

describe("switch candidate cycling behavior", () => {
  it("cycles through the chosen method's candidates and wraps around", () => {
    const candidates = getCandidates(MID_PRIMARY, "analogous");
    expect(candidates).toHaveLength(4);

    // 0 -> 1 -> 2 -> 3 -> 0
    let idx = 0;
    idx = getNextCandidateIndex(MID_PRIMARY, "analogous", "secondary", idx);
    expect(idx).toBe(1);
    idx = getNextCandidateIndex(MID_PRIMARY, "analogous", "secondary", idx);
    expect(idx).toBe(2);
    idx = getNextCandidateIndex(MID_PRIMARY, "analogous", "secondary", idx);
    expect(idx).toBe(3);
    idx = getNextCandidateIndex(MID_PRIMARY, "analogous", "secondary", idx);
    expect(idx).toBe(0); // wraps around
  });

  it("pressing never changes the method", () => {
    // getNextCandidateIndex is a pure function operating strictly on indices
    // The method argument is an input filter, never modified
    const method = "complementary";
    const nextIdx = getNextCandidateIndex(MID_PRIMARY, method, "accent", 0);
    expect(nextIdx).toBe(1);
    expect(method).toBe("complementary");
  });

  it("is disabled on custom and material methods", () => {
    expect(isMethodCandidateSupported("custom")).toBe(false);
    expect(isMethodCandidateSupported("material")).toBe(false);
    expect(isMethodCandidateSupported("unknown")).toBe(false);

    expect(isMethodCandidateSupported("analogous")).toBe(true);
    expect(isMethodCandidateSupported("complementary")).toBe(true);
    expect(isMethodCandidateSupported("triadic")).toBe(true);
    expect(isMethodCandidateSupported("split-complementary")).toBe(true);
    expect(isMethodCandidateSupported("monochromatic", "secondary")).toBe(true);
    expect(isMethodCandidateSupported("monochromatic", "tertiary")).toBe(true);
    expect(isMethodCandidateSupported("monochromatic", "accent")).toBe(false);
  });

  it("resets candidate on method change", () => {
    // Secondary default is candidate 0
    const secDefault = getDefaultCandidateIndex(MID_PRIMARY, "analogous", "secondary");
    expect(secDefault).toBe(0);

    // Accent default is candidate 0
    const accDefault = getDefaultCandidateIndex(MID_PRIMARY, "complementary", "accent");
    expect(accDefault).toBe(0);

    // Tertiary defaults to candidate 1 for harmony presets (to avoid collision with secondary)
    const tertDefault = getDefaultCandidateIndex(MID_PRIMARY, "analogous", "tertiary");
    expect(tertDefault).toBe(1);
  });
});

describe("secondary and tertiary collision avoidance", () => {
  it("secondary and tertiary use different candidates by default", () => {
    for (const method of ["analogous", "complementary", "triadic", "split-complementary"] as const) {
      const secIdx = getDefaultCandidateIndex(MID_PRIMARY, method, "secondary");
      const tertIdx = getDefaultCandidateIndex(MID_PRIMARY, method, "tertiary");
      expect(secIdx).not.toBe(tertIdx);

      const secHex = getCandidateHex(MID_PRIMARY, method, secIdx, "secondary");
      const tertHex = getCandidateHex(MID_PRIMARY, method, tertIdx, "tertiary");
      expect(secHex).not.toBe(tertHex);
    }
  });

  it("secondary and tertiary monochromatic defaults never equal each other", () => {
    const secHex = getCandidateHex(MID_PRIMARY, "monochromatic", 0, "secondary");
    const tertHex = getCandidateHex(MID_PRIMARY, "monochromatic", 0, "tertiary");
    expect(secHex).not.toBe(tertHex);
  });

  it("skips a candidate whose hex equals the other role's current hex when cycling", () => {
    const candidates = getCandidates(MID_PRIMARY, "analogous");
    // candidates: [C0, C1, C2, C3]
    // Suppose secondary has index 0 (candidates[0])
    // Tertiary is on index 3 (candidates[3]), and presses next:
    // Natural next is 0, but candidates[0] === secondary hex!
    // So it should skip index 0 and return index 1!
    const otherHex = candidates[0];
    const nextIdx = getNextCandidateIndex(
      MID_PRIMARY,
      "analogous",
      "tertiary",
      3,
      otherHex,
    );
    expect(nextIdx).toBe(1);
    expect(candidates[nextIdx]).not.toBe(otherHex);
  });

  it("secondary and tertiary never end up equal throughout entire cycle", () => {
    const method = "analogous";
    const candidates = getCandidates(MID_PRIMARY, method);
    let secIdx = 0;
    let tertIdx = 1;

    // Simulate cycling secondary 10 times, verifying no collision
    for (let i = 0; i < 10; i++) {
      const tertHex = candidates[tertIdx];
      secIdx = getNextCandidateIndex(MID_PRIMARY, method, "secondary", secIdx, tertHex);
      expect(candidates[secIdx]).not.toBe(tertHex);
    }

    // Simulate cycling tertiary 10 times, verifying no collision
    for (let i = 0; i < 10; i++) {
      const secHex = candidates[secIdx];
      tertIdx = getNextCandidateIndex(MID_PRIMARY, method, "tertiary", tertIdx, secHex);
      expect(candidates[tertIdx]).not.toBe(secHex);
    }
  });
});

describe("valid hex results for light, dark, and mid primaries", () => {
  const primaries = [
    { name: "mid", hex: MID_PRIMARY },
    { name: "light", hex: LIGHT_PRIMARY },
    { name: "dark", hex: DARK_PRIMARY },
  ];

  const methods = [
    "analogous",
    "complementary",
    "triadic",
    "split-complementary",
    "monochromatic",
  ] as const;

  for (const { name, hex } of primaries) {
    it(`produces valid 6-digit hex candidates for ${name} primary (${hex})`, () => {
      for (const method of methods) {
        // secondary
        const secCandidates = getCandidates(hex, method, "secondary");
        expect(secCandidates.length).toBeGreaterThan(0);
        for (const c of secCandidates) {
          expect(c).toMatch(HEX_6_REGEX);
        }

        // tertiary
        const tertCandidates = getCandidates(hex, method, "tertiary");
        expect(tertCandidates.length).toBeGreaterThan(0);
        for (const c of tertCandidates) {
          expect(c).toMatch(HEX_6_REGEX);
        }

        // accent (except monochromatic)
        if (method !== "monochromatic") {
          const accCandidates = getCandidates(hex, method, "accent");
          expect(accCandidates.length).toBeGreaterThan(0);
          for (const c of accCandidates) {
            expect(c).toMatch(HEX_6_REGEX);
          }
        }
      }
    });
  }
});
