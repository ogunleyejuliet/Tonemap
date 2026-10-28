import type { PaletteName } from "../colors/keyColors.js";
import type { RoleRef, ResolvedRoles } from "../colors/roles.js";
import type { BuiltPalette } from "../colors/palettes.js";

export interface CreatePayload {
  keyColors?: Partial<Record<PaletteName, string>>;
  palettes: Record<string, BuiltPalette>;
  roles: ResolvedRoles;
  roleRefs: Record<string, RoleRef>;
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
}

export interface CreateResult {
  success: boolean;
  collectionsCount: number;
  variablesCount: number;
  message: string;
}
