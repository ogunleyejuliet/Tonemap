import type { PaletteName } from "../colors/keyColors.js";
import type { RoleName, RoleRef } from "../colors/roles.js";
import type { BuiltPalette } from "../colors/palettes.js";

export interface CreatePayload {
  palettes: Record<PaletteName, BuiltPalette>;
  roles: Record<RoleName, string>;
  roleRefs: Record<RoleName, RoleRef>;
}

export interface ColorValuePlan {
  type: "COLOR";
  hex: string;
}

export interface AliasValuePlan {
  type: "ALIAS";
  targetId: string;
  targetName: string;
}

export type VariableValuePlan = ColorValuePlan | AliasValuePlan;

export interface VariablePlanSpec {
  id: string;
  name: string;
  resolvedType: "COLOR";
  valuesByMode: Record<string, VariableValuePlan>;
}

export interface CollectionPlanSpec {
  id: string;
  name: string;
  modes: string[];
  variables: VariablePlanSpec[];
  pluginData: Record<string, string>;
}

export interface WritePlan {
  collections: CollectionPlanSpec[];
  totalVariables: number;
  useFallback: boolean;
}

export interface CreateResult {
  success: boolean;
  collectionsCount: number;
  variablesCount: number;
  usedFallback: boolean;
  message: string;
}
