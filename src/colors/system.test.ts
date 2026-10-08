import { describe, expect, it } from "vitest";
import {
  CorePalette,
  Hct,
  Scheme,
  SchemeTonalSpot,
  TonalPalette,
  argbFromHex,
  hexFromArgb,
} from "@material/material-color-utilities";
import { buildColorSystem } from "./system.js";
import { buildPalettes, NEUTRAL_TONES, STANDARD_TONES } from "./palettes.js";
import { harmonyKeyColor, materialPaletteTone40, resolveKeyColors } from "./keyColors.js";
import { ROLE_DEFINITIONS, type RoleName } from "./roles.js";
import { contrastRatio } from "./contrast.js";
import { argbToHex, hexToArgb, maxChannelDiff } from "./hex.js";

const SEEDS_5 = ["#6750A4", "#00796B", "#B3261E", "#184CC3", "#7A5900"];

describe("primary lock", () => {
  it("sets primary tone 40 to exactly the typed hex", () => {
    for (const seed of ["#6750A4", "#00796B", "#1A56DB", "#D8F3DC"]) {
      const sys = buildColorSystem({ primary: seed });
      expect(sys.palettes.primary.hex[40]).toBe(seed.toUpperCase());
      expect(sys.roles.light.primary).toBe(seed.toUpperCase());
    }
  });

  it("reports the measured tone and warns when it is >10 away from 40", () => {
    const close = buildColorSystem({ primary: "#6750A4" });
    expect(close.primaryMeasuredTone).toBeCloseTo(40, 0);
    expect(close.primaryWarning).toBeNull();

    const far = buildColorSystem({ primary: "#D8F3DC" });
    expect(Math.abs(far.primaryMeasuredTone - 40)).toBeGreaterThan(10);
    expect(far.primaryWarning).not.toBeNull();
  });
});

describe("palette sizes", () => {
  it("builds 14 tones per palette and 24 for neutral", () => {
    const sys = buildColorSystem({ primary: "#6750A4" });
    for (const name of [
      "primary",
      "secondary",
      "tertiary",
      "neutral",
      "neutralVariant",
      "error",
      "warning",
      "success",
    ] as const) {
      const p = sys.palettes[name];
      if (name === "neutral") {
        expect(p.tones.length).toBe(24);
        expect([...p.tones].sort((a, b) => a - b)).toEqual(NEUTRAL_TONES);
      } else {
        expect(p.tones.length).toBe(14);
        expect([...p.tones].sort((a, b) => a - b)).toEqual(STANDARD_TONES);
      }
    }
  });
});

describe("role references", () => {
  it("points every role at an existing palette and tone and has exactly 57 roles", () => {
    const sys = buildColorSystem({ primary: "#6750A4" });
    expect(Object.keys(ROLE_DEFINITIONS).length).toBe(57);
    for (const [role, ref] of Object.entries(ROLE_DEFINITIONS)) {
      const palette = (sys.palettes as Record<string, { hex: Record<number, string> }>)[
        ref.palette
      ];
      expect(palette, `palette for role ${role}`).toBeDefined();
      expect(
        palette.hex[ref.lightTone],
        `${role} light tone ${ref.lightTone}`,
      ).toBeDefined();
      expect(
        palette.hex[ref.darkTone],
        `${role} dark tone ${ref.darkTone}`,
      ).toBeDefined();
    }
    // Resolved roles cover every definition in both modes.
    for (const role of Object.keys(ROLE_DEFINITIONS) as RoleName[]) {
      expect(sys.roles.light[role]).toMatch(/^#[0-9A-F]{6}$/);
      expect(sys.roles.dark[role]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("verifies each of the 12 fixed roles points to the right palette and tone in both modes", () => {
    const fixedRolesSpec: Array<[RoleName, "primary" | "secondary" | "tertiary", number]> = [
      ["primaryFixed", "primary", 90],
      ["primaryFixedDim", "primary", 80],
      ["onPrimaryFixed", "primary", 10],
      ["onPrimaryFixedVariant", "primary", 30],
      ["secondaryFixed", "secondary", 90],
      ["secondaryFixedDim", "secondary", 80],
      ["onSecondaryFixed", "secondary", 10],
      ["onSecondaryFixedVariant", "secondary", 30],
      ["tertiaryFixed", "tertiary", 90],
      ["tertiaryFixedDim", "tertiary", 80],
      ["onTertiaryFixed", "tertiary", 10],
      ["onTertiaryFixedVariant", "tertiary", 30],
    ];

    for (const [role, palette, tone] of fixedRolesSpec) {
      const def = ROLE_DEFINITIONS[role];
      expect(def.palette, `${role} palette`).toBe(palette);
      expect(def.lightTone, `${role} lightTone`).toBe(tone);
      expect(def.darkTone, `${role} darkTone`).toBe(tone);
    }
  });
});

/**
 * Shared library-comparison runner. Builds our system with no primary lock
 * and no auto-fix (so differences are real mapping differences, not the
 * lock or intentional contrast moves), then compares every applicable role
 * color against a library source, allowing a difference of 1 per RGB
 * channel for hex/HCT round-trips. Prints the largest channel difference
 * found. The expected tone map (ROLE_DEFINITIONS) is never changed here.
 */
function compareAgainstLibrary(
  sourceName: string,
  skipRoles: Set<string>,
  getArgb: (seed: string, mode: "light" | "dark", role: RoleName) => number,
): { lines: string[]; keys: Set<string> } {
  const overTolerance: string[] = [];
  const keys = new Set<string>();
  let compared = 0;
  let maxDiff = -1;
  let maxLoc = "";
  for (const seed of SEEDS_5) {
    const sys = buildColorSystem(
      { primary: seed },
      { applyPrimaryLock: false, autoFixContrast: false },
    );
    for (const mode of ["light", "dark"] as const) {
      for (const role of Object.keys(ROLE_DEFINITIONS) as RoleName[]) {
        if (skipRoles.has(role)) continue;
        const ours: string = sys.roles[mode][role];
        const argb = getArgb(seed, mode, role);
        const theirs = hexFromArgb(argb).toUpperCase();
        compared++;
        const diff = maxChannelDiff(ours, theirs);
        if (diff > maxDiff) {
          maxDiff = diff;
          maxLoc = `${seed} ${mode} ${role}: ours ${ours} vs ${sourceName} ${theirs}`;
        }
        if (diff > 1) {
          const ref = ROLE_DEFINITIONS[role];
          const tone = mode === "light" ? ref.lightTone : ref.darkTone;
          overTolerance.push(
            `${seed} ${mode} ${role}: ours ${ours} (${ref.palette} T${tone}) vs ${sourceName} ${theirs} (max channel diff ${diff})`,
          );
          keys.add(`${mode}:${role}`);
        }
      }
    }
  }
  console.log(
    `[${sourceName}] compared ${compared} role colors, ${overTolerance.length} over tolerance (±1/channel), largest channel diff ${maxDiff} at ${maxLoc}`,
  );
  if (overTolerance.length > 0) {
    console.log(`[${sourceName}] OVER-TOLERANCE:\n` + overTolerance.join("\n"));
  }
  return { lines: overTolerance, keys };
}

interface KnownDifference {
  role: RoleName;
  mode: "light" | "dark";
  reason: string;
}

/**
 * Passes only when the observed over-tolerance set exactly equals the known
 * list: an unexpected mismatch fails, and so does a listed one disappearing.
 */
function expectKnownDifferences(
  sourceName: string,
  actualKeys: Set<string>,
  known: KnownDifference[],
): void {
  const expectedKeys = new Set(known.map((k) => `${k.mode}:${k.role}`));
  const unexpected = [...actualKeys].filter((k) => !expectedKeys.has(k));
  const missing = [...expectedKeys].filter((k) => !actualKeys.has(k));
  console.log(
    `[${sourceName}] known=${expectedKeys.size} observed=${actualKeys.size} unexpected=${unexpected.length} missing=${missing.length}`,
  );
  if (unexpected.length > 0) {
    console.log(`[${sourceName}] UNEXPECTED:\n` + unexpected.join("\n"));
  }
  if (missing.length > 0) {
    console.log(`[${sourceName}] MISSING:\n` + missing.join("\n"));
  }
  expect({ unexpected, missing }).toEqual({ unexpected: [], missing: [] });
}

// Our warning/success accents are custom additions with no library equivalent.
const CUSTOM_SKIP = new Set([
  "warning",
  "onWarning",
  "warningContainer",
  "onWarningContainer",
  "success",
  "onSuccess",
  "successContainer",
  "onSuccessContainer",
]);

// The legacy static Scheme predates surface-dim/bright, surface containers
// and surface-tint, so those roles have nothing to compare against there.
const LEGACY_SKIP = new Set([
  ...CUSTOM_SKIP,
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceTint",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
]);

describe("comparison with the library dynamic tonal-spot scheme", () => {
  // Every over-tolerance (mode, role) pair observed for the 5 fixed seeds
  // against SchemeTonalSpot, each with its reason. Container text now uses
  // tone 30 in Light mode, matching the dynamic scheme; the one remaining
  // on-container entry (light onPrimaryContainer) differs only in color,
  // because primary keeps the seed chroma while the library forces
  // chroma 36.
  const KNOWN_DYNAMIC: KnownDifference[] = [
    { role: "primary", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "onPrimaryContainer", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "primaryContainer", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "surfaceTint", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "inversePrimary", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "primaryFixed", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "primaryFixedDim", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "onPrimaryFixed", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "onPrimaryFixedVariant", mode: "light", reason: "primary keeps the seed chroma" },
    { role: "primary", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "primaryContainer", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "onPrimary", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "onPrimaryContainer", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "surfaceTint", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "inversePrimary", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "primaryFixed", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "primaryFixedDim", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "onPrimaryFixed", mode: "dark", reason: "primary keeps the seed chroma" },
    { role: "onPrimaryFixedVariant", mode: "dark", reason: "primary keeps the seed chroma" },
  ];

  it("matches SchemeTonalSpot except for the known differences", () => {
    const { keys } = compareAgainstLibrary(
      "SchemeTonalSpot",
      CUSTOM_SKIP,
      (seed, mode, role) => {
        const hct = Hct.fromInt(argbFromHex(seed));
        const scheme = new SchemeTonalSpot(hct, mode === "dark", 0) as unknown as Record<
          string,
          number
        >;
        return scheme[role];
      },
    );
    // Do NOT change the tone map to hide differences: unexpected mismatches
    // fail here, and so do known ones that stop reproducing.
    expectKnownDifferences("SchemeTonalSpot", keys, KNOWN_DYNAMIC);
  });
});

describe("comparison with the library legacy static scheme", () => {
  // Every over-tolerance (mode, role) pair observed for the 5 fixed seeds
  // against legacy Scheme.light/dark, each with its reason. The legacy
  // scheme predates surface container roles and uses tone 99/10 for
  // surface; its Light container text is tone 10 (ours is now 30); its
  // dark onErrorContainer is tone 80; its primary forces chroma >= 48
  // and its neutral uses chroma 4.
  const KNOWN_LEGACY: KnownDifference[] = [
    { role: "background", mode: "light", reason: "legacy scheme uses tone 99 for light surface" },
    { role: "surface", mode: "light", reason: "legacy scheme uses tone 99 for light surface" },
    { role: "background", mode: "dark", reason: "legacy scheme uses tone 10 for dark surface" },
    { role: "surface", mode: "dark", reason: "legacy scheme uses tone 10 for dark surface" },
    { role: "onPrimaryContainer", mode: "light", reason: "legacy scheme uses tone 10 for container text" },
    { role: "onSecondaryContainer", mode: "light", reason: "legacy scheme uses tone 10 for container text" },
    { role: "onTertiaryContainer", mode: "light", reason: "legacy scheme uses tone 10 for container text" },
    { role: "onErrorContainer", mode: "light", reason: "legacy scheme uses tone 10 for container text" },
    { role: "onErrorContainer", mode: "dark", reason: "legacy dark onErrorContainer uses tone 80" },
    { role: "primaryContainer", mode: "light", reason: "legacy boosts low-chroma primaries to chroma 48" },
    { role: "onPrimaryContainer", mode: "dark", reason: "legacy boosts low-chroma primaries to chroma 48" },
    { role: "primary", mode: "dark", reason: "legacy boosts low-chroma primaries to chroma 48" },
    { role: "inversePrimary", mode: "light", reason: "legacy boosts low-chroma primaries to chroma 48" },
    { role: "onBackground", mode: "light", reason: "legacy neutral uses chroma 4" },
    { role: "onSurface", mode: "light", reason: "legacy neutral uses chroma 4" },
    { role: "inverseSurface", mode: "light", reason: "legacy neutral uses chroma 4" },
    { role: "inverseOnSurface", mode: "light", reason: "legacy neutral uses chroma 4" },
    { role: "onBackground", mode: "dark", reason: "legacy neutral uses chroma 4" },
    { role: "onSurface", mode: "dark", reason: "legacy neutral uses chroma 4" },
    { role: "inverseSurface", mode: "dark", reason: "legacy neutral uses chroma 4" },
    { role: "inverseOnSurface", mode: "dark", reason: "legacy neutral uses chroma 4" },
  ];

  it("matches Scheme.light/dark except for the known differences", () => {
    const { keys } = compareAgainstLibrary("Scheme", LEGACY_SKIP, (seed, mode, role) => {
      const argb = argbFromHex(seed);
      const scheme = (
        mode === "light" ? Scheme.light(argb) : Scheme.dark(argb)
      ) as unknown as Record<string, number>;
      return scheme[role];
    });
    // Do NOT change the tone map to hide differences: unexpected mismatches
    // fail here, and so do known ones that stop reproducing.
    expectKnownDifferences("Scheme", keys, KNOWN_LEGACY);
  });

  it("uses tone 30 for container text in Light mode, matching the dynamic scheme", () => {
    // Our map follows the current Material Theme Builder output: container
    // text is tone 30 in Light mode (90 in Dark), as resolved by the
    // dynamic scheme — not the legacy static Scheme's tone 10.
    const containerText: RoleName[] = [
      "onPrimaryContainer",
      "onSecondaryContainer",
      "onTertiaryContainer",
      "onErrorContainer",
      "onWarningContainer",
      "onSuccessContainer",
    ];
    for (const role of containerText) {
      expect(ROLE_DEFINITIONS[role].lightTone, `${role} light`).toBe(30);
      expect(ROLE_DEFINITIONS[role].darkTone, `${role} dark`).toBe(90);
    }
    for (const seed of SEEDS_5) {
      const argb = argbFromHex(seed);
      const hct = Hct.fromInt(argb);
      const light = new SchemeTonalSpot(hct, false, 0);
      // Dynamic light container text resolves to tone 30 of each palette.
      expect(hexFromArgb(light.onPrimaryContainer).toUpperCase()).toBe(
        hexFromArgb(light.primaryPalette.tone(30)).toUpperCase(),
      );
      expect(hexFromArgb(light.onSecondaryContainer).toUpperCase()).toBe(
        hexFromArgb(light.secondaryPalette.tone(30)).toUpperCase(),
      );
      expect(hexFromArgb(light.onTertiaryContainer).toUpperCase()).toBe(
        hexFromArgb(light.tertiaryPalette.tone(30)).toUpperCase(),
      );
      expect(hexFromArgb(light.onErrorContainer).toUpperCase()).toBe(
        hexFromArgb(light.errorPalette.tone(30)).toUpperCase(),
      );
      // The legacy static Scheme still uses tone 10 there (kept as a known
      // difference, not adopted).
      const core = CorePalette.of(argb);
      expect(hexFromArgb(Scheme.light(argb).onPrimaryContainer).toUpperCase()).toBe(
        hexFromArgb(core.a1.tone(10)).toUpperCase(),
      );
    }
  });
});

describe("warning/success role tones", () => {
  it("uses the same tones for warning/success roles as for error roles", () => {
    const pairs: Array<[RoleName, RoleName]> = [
      ["warning", "error"],
      ["onWarning", "onError"],
      ["warningContainer", "errorContainer"],
      ["onWarningContainer", "onErrorContainer"],
      ["success", "error"],
      ["onSuccess", "onError"],
      ["successContainer", "errorContainer"],
      ["onSuccessContainer", "onErrorContainer"],
    ];
    for (const [role, errorRole] of pairs) {
      expect(
        ROLE_DEFINITIONS[role].lightTone,
        `${role} light tone`,
      ).toBe(ROLE_DEFINITIONS[errorRole].lightTone);
      expect(
        ROLE_DEFINITIONS[role].darkTone,
        `${role} dark tone`,
      ).toBe(ROLE_DEFINITIONS[errorRole].darkTone);
      // Same tones, but each accent keeps its own palette.
      expect(ROLE_DEFINITIONS[role].palette).not.toBe(
        ROLE_DEFINITIONS[errorRole].palette,
      );
    }
  });
});

describe("secondary/tertiary tone-40 lock", () => {
  const PRIMARY = "#6750A4";

  it("locks Secondary/40 and Tertiary/40 to the typed hex in custom mode", () => {
    const sys = buildColorSystem(
      { primary: PRIMARY, secondary: "#123456", tertiary: "#ABCDEF" },
      { secondary: "custom", tertiary: "custom", autoFixContrast: false },
    );
    expect(sys.palettes.secondary.hex[40]).toBe("#123456");
    expect(sys.palettes.tertiary.hex[40]).toBe("#ABCDEF");
    expect(sys.roles.light.secondary).toBe("#123456");
    expect(sys.roles.light.tertiary).toBe("#ABCDEF");
    expect(sys.roleRefs.secondary.lightTone).toBe(40);
    expect(sys.roleRefs.tertiary.lightTone).toBe(40);
  });

  it("locks to harmony-derived hexes in harmony mode", () => {
    const sys = buildColorSystem(
      { primary: PRIMARY },
      { secondary: "analogous", tertiary: "triadic", autoFixContrast: false },
    );
    const sHex = harmonyKeyColor(PRIMARY, "analogous");
    const tHex = harmonyKeyColor(PRIMARY, "triadic");
    expect(sys.keyColors.secondary).toBe(sHex);
    expect(sys.keyColors.tertiary).toBe(tHex);
    expect(sys.palettes.secondary.hex[40]).toBe(sHex);
    expect(sys.palettes.tertiary.hex[40]).toBe(tHex);
    expect(sys.roles.light.secondary).toBe(sHex);
    expect(sys.roles.light.tertiary).toBe(tHex);
  });

  it("uses the library palette untouched in Material default mode", () => {
    const sys = buildColorSystem({ primary: PRIMARY }, { autoFixContrast: false });
    const spot = new SchemeTonalSpot(Hct.fromInt(argbFromHex(PRIMARY)), false, 0);
    for (const t of STANDARD_TONES) {
      expect(sys.palettes.secondary.hex[t]).toBe(
        argbToHex(spot.secondaryPalette.tone(t)),
      );
      expect(sys.palettes.tertiary.hex[t]).toBe(
        argbToHex(spot.tertiaryPalette.tone(t)),
      );
    }
    // The field hex is the library palette's tone 40.
    expect(materialPaletteTone40(PRIMARY, "secondary")).toBe(
      sys.palettes.secondary.hex[40],
    );
    expect(materialPaletteTone40(PRIMARY, "tertiary")).toBe(
      sys.palettes.tertiary.hex[40],
    );
  });

  it("changes no other tone when locking", () => {
    const sys = buildColorSystem(
      { primary: PRIMARY, secondary: "#1A56DB", tertiary: "#7A5900" },
      { secondary: "custom", tertiary: "custom", autoFixContrast: false },
    );
    const cases = [
      ["secondary", "#1A56DB"],
      ["tertiary", "#7A5900"],
    ] as const;
    for (const [name, keyHex] of cases) {
      const hct = Hct.fromInt(hexToArgb(keyHex));
      const natural = TonalPalette.fromHueAndChroma(hct.hue, hct.chroma);
      for (const t of STANDARD_TONES) {
        if (t === 40) {
          expect(sys.palettes[name].hex[t], `${name} T${t}`).toBe(keyHex);
        } else {
          expect(sys.palettes[name].hex[t], `${name} T${t}`).toBe(
            argbToHex(natural.tone(t)),
          );
        }
      }
    }
  });

  it("leaves error, warning and success unlocked", () => {
    const sys = buildColorSystem({ primary: PRIMARY }, { autoFixContrast: false });
    for (const name of ["error", "warning", "success"] as const) {
      const hct = Hct.fromInt(hexToArgb(sys.keyColors[name]));
      const natural = TonalPalette.fromHueAndChroma(hct.hue, hct.chroma);
      for (const t of STANDARD_TONES) {
        expect(sys.palettes[name].hex[t], `${name} T${t}`).toBe(
          argbToHex(natural.tone(t)),
        );
      }
    }
  });

  it("keeps dark main roles at tone 80", () => {
    const sys = buildColorSystem(
      { primary: PRIMARY, secondary: "#1A56DB", tertiary: "#7A5900" },
      { secondary: "custom", tertiary: "custom", autoFixContrast: false },
    );
    for (const role of ["secondary", "tertiary"] as const) {
      expect(sys.roleRefs[role].darkTone).toBe(80);
      expect(sys.roles.dark[role]).toBe(sys.palettes[role].hex[80]);
    }
  });

  it("reports measured tones and warns when a locked color is far from 40", () => {
    const sys = buildColorSystem(
      { primary: PRIMARY, secondary: "#D8F3DC", tertiary: "#1A56DB" },
      { secondary: "custom", tertiary: "custom", autoFixContrast: false },
    );
    expect(sys.secondaryMeasuredTone).toBeGreaterThan(50);
    expect(sys.secondaryWarning).toBe(
      "This color sits near tone 93, so the shade strip may look out of order. " +
        "It is still Secondary/40.",
    );
    expect(sys.tertiaryWarning).toBeNull();
    // Material mode reports no warning.
    const mat = buildColorSystem({ primary: PRIMARY }, { autoFixContrast: false });
    expect(mat.secondaryWarning).toBeNull();
    expect(mat.tertiaryWarning).toBeNull();
  });
});

describe("key-color harmony", () => {
  it("rotates the primary hue in HCT and returns hex for hue-rotation presets", async () => {
    const { harmonyKeyColor, HARMONY_DELTAS } = await import("./keyColors.js");
    const { Hct } = await import("@material/material-color-utilities");
    const { hexToArgb } = await import("./hex.js");
    const primary = "#6750A4";
    const baseHue = Hct.fromInt(hexToArgb(primary)).hue;
    for (const [preset, delta] of Object.entries(HARMONY_DELTAS)) {
      if (preset === "monochromatic") continue;
      const hex = harmonyKeyColor(primary, preset as keyof typeof HARMONY_DELTAS);
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      const hue = Hct.fromInt(hexToArgb(hex)).hue;
      let diff = Math.abs(hue - baseHue) % 360;
      if (diff > 180) diff = 360 - diff;
      // HCT round-trips through sRGB gamut mapping, so allow a few degrees.
      expect(diff).toBeGreaterThan(delta - 8);
      expect(diff).toBeLessThan(delta + 8);
    }
  });

  it("reproduces #008F70 for secondary and #75F8D2 for tertiary from #00E3AA within 1 per channel", async () => {
    const { harmonyKeyColor } = await import("./keyColors.js");
    const { hexToArgb } = await import("./hex.js");

    const maxChannelDiff = (h1: string, h2: string): number => {
      const argb1 = hexToArgb(h1);
      const argb2 = hexToArgb(h2);
      const r1 = (argb1 >> 16) & 0xff;
      const g1 = (argb1 >> 8) & 0xff;
      const b1 = argb1 & 0xff;
      const r2 = (argb2 >> 16) & 0xff;
      const g2 = (argb2 >> 8) & 0xff;
      const b2 = argb2 & 0xff;
      return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
    };

    const secHex = harmonyKeyColor("#00E3AA", "monochromatic", "secondary");
    const terHex = harmonyKeyColor("#00E3AA", "monochromatic", "tertiary");

    expect(maxChannelDiff(secHex, "#008F70")).toBeLessThanOrEqual(1);
    expect(maxChannelDiff(terHex, "#75F8D2")).toBeLessThanOrEqual(1);
  });

  it("computes secondary with lower tone and tertiary with higher tone, hue within 6 deg, and tone in 0-100 for many primaries", async () => {
    const { harmonyKeyColor, resolveKeyColors } = await import("./keyColors.js");
    const { Hct } = await import("@material/material-color-utilities");
    const { hexToArgb } = await import("./hex.js");

    const primaries = [
      "#00E3AA", // Example primary
      "#6750A4", // Mid primary (purple)
      "#00796B", // Mid primary (teal)
      "#7A5900", // Mid primary (gold/brown)
      "#D8F3DC", // Light primary (mint)
      "#BAE6FD", // Light primary (sky blue)
      "#184CC3", // Dark primary (blue)
      "#B3261E", // Dark primary (red)
      "#004B36", // Dark primary (dark green)
      "#2563EB", // Royal blue
    ];

    const hueDistance = (h1: number, h2: number): number => {
      let diff = Math.abs(h1 - h2) % 360;
      if (diff > 180) diff = 360 - diff;
      return diff;
    };

    for (const primaryHex of primaries) {
      const canonicalPrimary = primaryHex.toUpperCase();
      const primaryHct = Hct.fromInt(hexToArgb(canonicalPrimary));

      const secHex = harmonyKeyColor(canonicalPrimary, "monochromatic", "secondary");
      const terHex = harmonyKeyColor(canonicalPrimary, "monochromatic", "tertiary");

      const secHct = Hct.fromInt(hexToArgb(secHex));
      const terHct = Hct.fromInt(hexToArgb(terHex));

      // Secondary tone is lower, tertiary tone is higher than primary's tone
      expect(secHct.tone, `Secondary tone for ${canonicalPrimary}`).toBeLessThan(primaryHct.tone);
      expect(terHct.tone, `Tertiary tone for ${canonicalPrimary}`).toBeGreaterThan(primaryHct.tone);

      // Hue differs from primary's hue by less than 6 degrees
      expect(
        hueDistance(secHct.hue, primaryHct.hue),
        `Secondary hue diff for ${canonicalPrimary}`,
      ).toBeLessThan(6);
      expect(
        hueDistance(terHct.hue, primaryHct.hue),
        `Tertiary hue diff for ${canonicalPrimary}`,
      ).toBeLessThan(6);

      // All tones stay between 0 and 100
      expect(secHct.tone, `Secondary tone for ${canonicalPrimary}`).toBeGreaterThanOrEqual(0);
      expect(secHct.tone, `Secondary tone for ${canonicalPrimary}`).toBeLessThanOrEqual(100);
      expect(terHct.tone, `Tertiary tone for ${canonicalPrimary}`).toBeGreaterThanOrEqual(0);
      expect(terHct.tone, `Tertiary tone for ${canonicalPrimary}`).toBeLessThanOrEqual(100);

      // Verify via resolveKeyColors
      const resolved = resolveKeyColors(
        { primary: canonicalPrimary },
        { secondary: "monochromatic", tertiary: "monochromatic" },
      );
      expect(resolved.secondary).toBe(secHex);
      expect(resolved.tertiary).toBe(terHex);
    }
  });
});

describe("auto-fix text contrast", () => {
  it("fixes on-primary in Light mode for a very light mint", () => {
    const sys = buildColorSystem({ primary: "#D8F3DC" });
    const fix = sys.fixes.find((f) => f.role === "onPrimary" && f.mode === "light");
    expect(fix).toBeDefined();
    expect(fix!.oldTone).toBe(100);
    expect(fix!.contrastBefore).toBeLessThan(4.5);
    expect(fix!.contrastAfter).toBeGreaterThanOrEqual(4.5);
    // The fixed pair really passes WCAG now.
    expect(
      contrastRatio(sys.roles.light.primary, sys.roles.light.onPrimary),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("changes nothing for a dark color", () => {
    const sys = buildColorSystem({ primary: "#14342B" });
    expect(sys.fixes).toEqual([]);
  });

  it("never moves primary tone 40 and reports before/after contrast", () => {
    const sys = buildColorSystem({ primary: "#D8F3DC" });
    expect(sys.roleRefs.primary.lightTone).toBe(40);
    expect(sys.roleRefs.primary.darkTone).toBe(80);
    for (const f of sys.fixes) {
      expect(f.role).not.toBe("primary");
      expect(f.contrastBefore).toBeLessThan(4.5);
      expect(f.contrastAfter).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("changes nothing and returns warnings only when the option is off", () => {
    const on = buildColorSystem({ primary: "#D8F3DC" }, { autoFixContrast: true });
    expect(on.fixes.length).toBeGreaterThan(0);
    const offKeys = resolveKeyColors({ primary: "#D8F3DC" });
    const offPalettes = buildPalettes(offKeys);
    void offPalettes;
    const off = buildColorSystem({ primary: "#D8F3DC" }, { autoFixContrast: false });
    expect(off.fixes).toEqual([]);
    expect(off.warnings.length).toBeGreaterThan(0);
    // Untouched defaults still apply.
    expect(off.roleRefs.onPrimary.lightTone).toBe(100);
  });
});
