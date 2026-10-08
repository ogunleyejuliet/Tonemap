import { describe, it, expect } from "vitest";
import { buildColorSystem } from "../colors/system.js";
import { buildWritePlan, validatePayload, buildCreatePayload } from "./plan.js";
import {
  compareWritePlan,
  type SystemSnapshot,
  type SnapshotVariable,
  type SnapshotCollection,
} from "./compare.js";

function buildSnapshotFromPlan(plan: ReturnType<typeof buildWritePlan>): SystemSnapshot {
  const snapshotCols: SnapshotCollection[] = [];

  for (const cSpec of plan.collections) {
    const vars: SnapshotVariable[] = [];
    for (const vSpec of cSpec.variables) {
      const valuesByMode: SnapshotVariable["valuesByMode"] = {};
      for (const [mName, valPlan] of Object.entries(vSpec.valuesByMode)) {
        if (valPlan.type === "COLOR") {
          valuesByMode[mName] = { type: "COLOR", hex: valPlan.hex };
        } else {
          valuesByMode[mName] = {
            type: "ALIAS",
            targetId: valPlan.targetId,
            targetName: valPlan.targetName,
          };
        }
      }
      vars.push({
        id: vSpec.id,
        name: vSpec.name,
        valuesByMode,
      });
    }
    snapshotCols.push({
      id: cSpec.id,
      name: cSpec.name,
      modes: cSpec.modes.reduce((acc, m) => ({ ...acc, [m]: m }), {}),
      variables: vars,
    });
  }

  return {
    layout: plan.useFallback ? "fallback" : "standard",
    collections: snapshotCols,
  };
}

describe("compareWritePlan pure comparison tests", () => {
  const sys1 = buildColorSystem({ primary: "#6750A4" }, { autoFixContrast: false });
  const val1 = validatePayload(buildCreatePayload(sys1));
  if (!val1.valid) throw new Error("Invalid val1");
  const plan1 = buildWritePlan(val1.payload, { fallback: false });

  it("1. identical inputs give no changes ('Nothing to update.')", () => {
    const snapshot = buildSnapshotFromPlan(plan1);
    const diff = compareWritePlan(snapshot, plan1);

    expect(diff.hasChanges).toBe(false);
    expect(diff.changedCount).toBe(0);
    expect(diff.addedCount).toBe(0);
    expect(diff.summaryText).toBe("Nothing to update.");
    expect(diff.changes.length).toBe(0);
  });

  it("2. a changed primary color changes palette values and role aliases", () => {
    const snapshot = buildSnapshotFromPlan(plan1);

    const sys2 = buildColorSystem({ primary: "#00E3AA" }, { autoFixContrast: false });
    const val2 = validatePayload(buildCreatePayload(sys2));
    if (!val2.valid) throw new Error("Invalid val2");
    const plan2 = buildWritePlan(val2.payload, { fallback: false });

    const diff = compareWritePlan(snapshot, plan2);

    expect(diff.hasChanges).toBe(true);
    expect(diff.changedCount).toBeGreaterThan(0);

    const primary40Change = diff.changes.find((c) => c.id === "palette:primary:40");
    expect(primary40Change).toBeDefined();
    expect(primary40Change?.formatted).toContain("Primary/40: 6750A4 to 00E3AA");
  });

  it("3. an auto-fix swap changes only the alias target for affected roles", () => {
    // sysNoFix has autoFix disabled; sysWithFix has autoFix enabled
    const sysNoFix = buildColorSystem({ primary: "#6750A4" }, { autoFixContrast: false });
    const valNoFix = validatePayload(buildCreatePayload(sysNoFix));
    if (!valNoFix.valid) throw new Error("Invalid valNoFix");
    const planNoFix = buildWritePlan(valNoFix.payload, { fallback: false });
    const snapshot = buildSnapshotFromPlan(planNoFix);

    const sysWithFix = buildColorSystem({ primary: "#6750A4" }, { autoFixContrast: true });
    const valWithFix = validatePayload(buildCreatePayload(sysWithFix));
    if (!valWithFix.valid) throw new Error("Invalid valWithFix");
    const planWithFix = buildWritePlan(valWithFix.payload, { fallback: false });

    const diff = compareWritePlan(snapshot, planWithFix);

    if (sysWithFix.fixes.length > 0) {
      expect(diff.hasChanges).toBe(true);
      // Palette colors should NOT change between autoFix off vs on
      const paletteChanges = diff.changes.filter((c) => c.type === "PALETTE_COLOR_CHANGE");
      expect(paletteChanges.length).toBe(0);

      // Only role alias target changes should exist
      const roleAliasChanges = diff.changes.filter((c) => c.type === "ROLE_ALIAS_CHANGE");
      expect(roleAliasChanges.length).toBeGreaterThan(0);
    }
  });

  it("4. a renamed variable is matched by m3gen_id and keeps its new name in reporting", () => {
    const snapshot = buildSnapshotFromPlan(plan1);
    // User renames "Primary/40" in Figma to "Brand Primary 40"
    const primary40Var = snapshot.collections[0].variables.find(
      (v) => v.id === "palette:primary:40",
    );
    if (primary40Var) {
      primary40Var.name = "Brand Primary 40";
    }

    // Now update primary color to #00E3AA
    const sys2 = buildColorSystem({ primary: "#00E3AA" }, { autoFixContrast: false });
    const val2 = validatePayload(buildCreatePayload(sys2));
    if (!val2.valid) throw new Error("Invalid val2");
    const plan2 = buildWritePlan(val2.payload, { fallback: false });

    const diff = compareWritePlan(snapshot, plan2);

    const change = diff.changes.find((c) => c.id === "palette:primary:40");
    expect(change).toBeDefined();
    // Uses the custom name "Brand Primary 40" from Figma snapshot
    expect(change?.formatted).toContain("Brand Primary 40: 6750A4 to 00E3AA");
  });

  it("5. a missing variable in the snapshot is reported as added", () => {
    const snapshot = buildSnapshotFromPlan(plan1);
    // Remove palette:primary:40 from snapshot
    snapshot.collections[0].variables = snapshot.collections[0].variables.filter(
      (v) => v.id !== "palette:primary:40",
    );

    const diff = compareWritePlan(snapshot, plan1);

    expect(diff.hasChanges).toBe(true);
    expect(diff.addedCount).toBe(1);

    const added = diff.changes.find((c) => c.type === "VARIABLE_ADDED");
    expect(added).toBeDefined();
    expect(added?.formatted).toBe("Added: Primary/40");
  });

  it("6. an extra tagged variable in snapshot is reported as left unchanged", () => {
    const snapshot = buildSnapshotFromPlan(plan1);
    // Add an extra custom variable tagged with m3gen_id
    snapshot.collections[0].variables.push({
      id: "palette:custom_extra:10",
      name: "Custom Extra/10",
      valuesByMode: {
        Value: { type: "COLOR", hex: "#123456" },
      },
    });

    const diff = compareWritePlan(snapshot, plan1);

    expect(diff.untouchedCount).toBe(1);
    const untouched = diff.changes.find((c) => c.type === "VARIABLE_UNTOUCHED");
    expect(untouched).toBeDefined();
    expect(untouched?.formatted).toContain("Custom Extra/10 (left unchanged)");
  });

  it("7. reports all 12 fixed roles as added for an existing system snapshot that does not have them", () => {
    const snapshot = buildSnapshotFromPlan(plan1);
    const fixedRoleIds = [
      "role:primaryFixed",
      "role:primaryFixedDim",
      "role:onPrimaryFixed",
      "role:onPrimaryFixedVariant",
      "role:secondaryFixed",
      "role:secondaryFixedDim",
      "role:onSecondaryFixed",
      "role:onSecondaryFixedVariant",
      "role:tertiaryFixed",
      "role:tertiaryFixedDim",
      "role:onTertiaryFixed",
      "role:onTertiaryFixedVariant",
    ];

    // Filter out the 12 fixed roles from snapshot to simulate an older existing system
    const colorCol = snapshot.collections.find((c) => c.name === "Color");
    if (colorCol) {
      colorCol.variables = colorCol.variables.filter((v) => !fixedRoleIds.includes(v.id));
    }

    const diff = compareWritePlan(snapshot, plan1);

    expect(diff.hasChanges).toBe(true);
    expect(diff.addedCount).toBe(12);

    const addedIds = diff.changes.filter((c) => c.type === "VARIABLE_ADDED").map((c) => c.id);
    for (const fixedId of fixedRoleIds) {
      expect(addedIds).toContain(fixedId);
    }
  });
});
