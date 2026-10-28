import { parseHexField } from "./validate.js";
import {
  harmonyKeyColor,
  materialPaletteTone40,
  resolveKeyColors,
  type AccentMethod,
  type SecondaryTertiaryMode,
} from "../colors/keyColors.js";

export type Method = SecondaryTertiaryMode;
export type { AccentMethod };

export interface SavedInputs {
  version: number;
  primary: string;
  secondaryMethod: Method;
  secondaryHex: string;
  tertiaryMethod: Method;
  tertiaryHex: string;
  neutral: string;
  neutralVariant: string;
  error: string;
  warning: string;
  success: string;
  autoFix: boolean;
  accentEnabled?: boolean;
  accentMethod?: AccentMethod;
  accentHex?: string;
}

export interface ActionButtonState {
  label: string;
  helperText: string;
  showHelper: boolean;
  mode: "create" | "update";
  disabled?: boolean;
}

export const INPUTS_VERSION = 1;
export const DEFAULT_PRIMARY = "#6750A4";

const VALID_METHODS = new Set<Method>([
  "material",
  "analogous",
  "complementary",
  "triadic",
  "split-complementary",
  "monochromatic",
  "custom",
]);

const VALID_ACCENT_METHODS = new Set<AccentMethod>([
  "complementary",
  "triadic",
  "split-complementary",
  "analogous",
  "custom",
]);

function isValidMethod(val: unknown): val is Method {
  return typeof val === "string" && VALID_METHODS.has(val as Method);
}

export function isValidAccentMethod(val: unknown): val is AccentMethod {
  return typeof val === "string" && VALID_ACCENT_METHODS.has(val as AccentMethod);
}

export function getActionButtonState(
  systemExists: boolean,
  isOldLayout: boolean = false,
): ActionButtonState {
  if (isOldLayout) {
    return {
      label: "Create variables",
      helperText:
        "This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create.",
      showHelper: true,
      mode: "create",
      disabled: true,
    };
  }
  if (systemExists) {
    return {
      label: "Update variables",
      helperText: "A system has already been created. Just update or change your values.",
      showHelper: true,
      mode: "update",
      disabled: false,
    };
  }
  return {
    label: "Create variables",
    helperText: "",
    showHelper: false,
    mode: "create",
    disabled: false,
  };
}

export function getDefaultInputs(primary: string = DEFAULT_PRIMARY): SavedInputs {
  const normPrimary = parseHexField(primary) ?? DEFAULT_PRIMARY;
  const kc = resolveKeyColors({ primary: normPrimary }, {});
  return {
    version: INPUTS_VERSION,
    primary: normPrimary,
    secondaryMethod: "material",
    secondaryHex: materialPaletteTone40(normPrimary, "secondary"),
    tertiaryMethod: "material",
    tertiaryHex: materialPaletteTone40(normPrimary, "tertiary"),
    neutral: kc.neutral,
    neutralVariant: kc.neutralVariant,
    error: kc.error,
    warning: kc.warning,
    success: kc.success,
    autoFix: true,
    accentEnabled: false,
    accentMethod: "complementary",
    accentHex: harmonyKeyColor(normPrimary, "complementary"),
  };
}

export function serializeSavedInputs(inputs: Partial<SavedInputs>): string {
  const defaults = getDefaultInputs(inputs.primary ?? DEFAULT_PRIMARY);
  const data: SavedInputs = {
    version: INPUTS_VERSION,
    primary: parseHexField(inputs.primary ?? "") ?? defaults.primary,
    secondaryMethod: isValidMethod(inputs.secondaryMethod) ? inputs.secondaryMethod : defaults.secondaryMethod,
    secondaryHex: parseHexField(inputs.secondaryHex ?? "") ?? defaults.secondaryHex,
    tertiaryMethod: isValidMethod(inputs.tertiaryMethod) ? inputs.tertiaryMethod : defaults.tertiaryMethod,
    tertiaryHex: parseHexField(inputs.tertiaryHex ?? "") ?? defaults.tertiaryHex,
    neutral: parseHexField(inputs.neutral ?? "") ?? defaults.neutral,
    neutralVariant: parseHexField(inputs.neutralVariant ?? "") ?? defaults.neutralVariant,
    error: parseHexField(inputs.error ?? "") ?? defaults.error,
    warning: parseHexField(inputs.warning ?? "") ?? defaults.warning,
    success: parseHexField(inputs.success ?? "") ?? defaults.success,
    autoFix: typeof inputs.autoFix === "boolean" ? inputs.autoFix : defaults.autoFix,
  };
  if (typeof inputs.accentEnabled === "boolean") {
    data.accentEnabled = inputs.accentEnabled;
  }
  if (isValidAccentMethod(inputs.accentMethod)) {
    data.accentMethod = inputs.accentMethod;
  }
  if (inputs.accentHex !== undefined) {
    data.accentHex = parseHexField(inputs.accentHex ?? "") ?? defaults.accentHex;
  }
  return JSON.stringify(data);
}

export function parseSavedInputs(raw: unknown): SavedInputs {
  let isRawObject = false;
  let obj: Record<string, unknown> = {};

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
        isRawObject = true;
      }
    } catch (_e) {
      // Invalid JSON string -> obj remains empty so defaults are used
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
    isRawObject = true;
  }

  const rawPrimary = typeof obj.primary === "string" ? parseHexField(obj.primary) : null;
  const defaults = getDefaultInputs(rawPrimary ?? DEFAULT_PRIMARY);

  if (!isRawObject) {
    return defaults;
  }

  const primary = rawPrimary ?? defaults.primary;
  const secondaryMethod = isValidMethod(obj.secondaryMethod) ? obj.secondaryMethod : defaults.secondaryMethod;
  const secondaryHex = typeof obj.secondaryHex === "string" ? parseHexField(obj.secondaryHex) ?? defaults.secondaryHex : defaults.secondaryHex;
  const tertiaryMethod = isValidMethod(obj.tertiaryMethod) ? obj.tertiaryMethod : defaults.tertiaryMethod;
  const tertiaryHex = typeof obj.tertiaryHex === "string" ? parseHexField(obj.tertiaryHex) ?? defaults.tertiaryHex : defaults.tertiaryHex;
  const neutral = typeof obj.neutral === "string" ? parseHexField(obj.neutral) ?? defaults.neutral : defaults.neutral;
  const neutralVariant = typeof obj.neutralVariant === "string" ? parseHexField(obj.neutralVariant) ?? defaults.neutralVariant : defaults.neutralVariant;
  const error = typeof obj.error === "string" ? parseHexField(obj.error) ?? defaults.error : defaults.error;
  const warning = typeof obj.warning === "string" ? parseHexField(obj.warning) ?? defaults.warning : defaults.warning;
  const success = typeof obj.success === "string" ? parseHexField(obj.success) ?? defaults.success : defaults.success;
  const autoFix = typeof obj.autoFix === "boolean" ? obj.autoFix : defaults.autoFix;
  const version = typeof obj.version === "number" ? obj.version : INPUTS_VERSION;

  const result: SavedInputs = {
    version,
    primary,
    secondaryMethod,
    secondaryHex,
    tertiaryMethod,
    tertiaryHex,
    neutral,
    neutralVariant,
    error,
    warning,
    success,
    autoFix,
  };

  if (typeof obj.accentEnabled === "boolean") {
    result.accentEnabled = obj.accentEnabled;
  }
  if (isValidAccentMethod(obj.accentMethod)) {
    result.accentMethod = obj.accentMethod;
  }
  if (typeof obj.accentHex === "string") {
    result.accentHex = parseHexField(obj.accentHex) ?? defaults.accentHex;
  }

  return result;
}
