import "./styles.css";
import { Hct } from "@material/material-color-utilities";
import {
  CONTRAST_PAIRS,
  ACCENT_CONTRAST_PAIRS,
  buildColorSystem,
  checkAndFixContrast,
  contrastRatio,
  harmonyKeyColor,
  materialPaletteTone40,
  resolveKeyColors,
  getCandidateCount,
  getNextCandidateIndex,
  getDefaultCandidateIndex,
  isMethodCandidateSupported,
  getCandidateHex,
  type AccentMethod,
  type ColorSystem,
  type PaletteName,
  type SecondaryTertiaryMode,
} from "../colors/index.js";
import { hexToArgb, normalizeHex } from "../colors/hex.js";
import { buildCreatePayload } from "../variables/plan.js";
import { createColorField, type ColorField } from "./colorField.js";
import {
  getActionButtonState,
  parseSavedInputs,
  serializeSavedInputs,
  type SavedInputs,
} from "./inputs.js";

type Method = SecondaryTertiaryMode;

const PALETTE_LABEL: Record<PaletteName, string> = {
  primary: "Primary",
  secondary: "Secondary",
  tertiary: "Tertiary",
  neutral: "Neutral",
  neutralVariant: "Neutral Variant",
  error: "Error",
  warning: "Warning",
  success: "Success",
  accent: "Accent",
};

const PALETTE_ORDER: PaletteName[] = [
  "primary",
  "secondary",
  "tertiary",
  "neutral",
  "neutralVariant",
  "error",
  "warning",
  "success",
];

const STANDARD_TONES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100];
const NEUTRAL_EXTRA_TONES = [4, 6, 12, 17, 22, 24, 87, 92, 94, 96];

const DEBOUNCE_MS = 250;

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

interface State {
  primary: string;
  secondaryMethod: Method;
  secondaryOption: number;
  tertiaryMethod: Method;
  tertiaryOption: number;
  accentEnabled: boolean;
  accentMethod: AccentMethod;
  accentOption: number;
  hex: Record<Exclude<PaletteName, "primary">, string>;
  touched: Set<Exclude<PaletteName, "primary">>;
  autoFix: boolean;
}

const state: State = {
  primary: "#6750A4",
  secondaryMethod: "material",
  secondaryOption: 0,
  tertiaryMethod: "material",
  tertiaryOption: 1,
  accentEnabled: false,
  accentMethod: "complementary",
  accentOption: 0,
  hex: {
    secondary: "",
    tertiary: "",
    accent: "",
    neutral: "",
    neutralVariant: "",
    error: "",
    warning: "",
    success: "",
  },
  touched: new Set(),
  autoFix: true,
};

const FIELD_ID: Record<Exclude<PaletteName, "primary">, string> = {
  secondary: "f-secondary-hex",
  tertiary: "f-tertiary-hex",
  accent: "f-accent-hex",
  neutral: "f-neutral",
  neutralVariant: "f-neutral-variant",
  error: "f-error",
  warning: "f-warning",
  success: "f-success",
};

const MOUNT_ID: Record<PaletteName, string> = {
  primary: "cf-primary",
  secondary: "cf-secondary",
  tertiary: "cf-tertiary",
  accent: "cf-accent",
  neutral: "cf-neutral",
  neutralVariant: "cf-neutral-variant",
  error: "cf-error",
  warning: "cf-warning",
  success: "cf-success",
};

const colorFields: Record<PaletteName, ColorField> = {} as Record<PaletteName, ColorField>;

let renderTimer = 0;

function scheduleRender(): void {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, DEBOUNCE_MS);
}

function setHexField(name: Exclude<PaletteName, "primary">, hex: string): void {
  state.hex[name] = hex;
  colorFields[name]?.setValue(hex);
}

function materialDefaults(primary: string): Record<PaletteName, string> {
  const kc = resolveKeyColors({ primary }, {});
  return {
    primary,
    secondary: kc.secondary,
    tertiary: kc.tertiary,
    accent: harmonyKeyColor(primary, "complementary"),
    neutral: kc.neutral,
    neutralVariant: kc.neutralVariant,
    error: kc.error,
    warning: kc.warning,
    success: kc.success,
  };
}

/** Recompute every derived field from the primary, keeping manual edits. */
function refreshDerived(): void {
  const d = materialDefaults(state.primary);
  if (state.secondaryMethod === "material") {
    setHexField("secondary", materialPaletteTone40(state.primary, "secondary"));
  } else if (state.secondaryMethod !== "custom") {
    setHexField(
      "secondary",
      harmonyKeyColor(state.primary, state.secondaryMethod, "secondary", state.secondaryOption),
    );
  }
  if (state.tertiaryMethod === "material") {
    setHexField("tertiary", materialPaletteTone40(state.primary, "tertiary"));
  } else if (state.tertiaryMethod !== "custom") {
    setHexField(
      "tertiary",
      harmonyKeyColor(state.primary, state.tertiaryMethod, "tertiary", state.tertiaryOption),
    );
  }
  if (state.accentMethod !== "custom") {
    setHexField(
      "accent",
      harmonyKeyColor(state.primary, state.accentMethod, "accent", state.accentOption),
    );
  }
  (["neutral", "neutralVariant", "error", "warning", "success"] as const).forEach(
    (name) => {
      if (!state.touched.has(name)) setHexField(name, d[name]);
    },
  );
  if (colorFields.primary) {
    colorFields.primary.pickerInput.value = state.primary.toLowerCase();
  }
  updateSwitchUI("secondary");
  updateSwitchUI("tertiary");
  updateSwitchUI("accent");
}

function currentInputs(): {
  primary: string;
  secondary?: string;
  tertiary?: string;
  neutral?: string;
  neutralVariant?: string;
  error?: string;
  warning?: string;
  success?: string;
  accent?: string;
} {
  return {
    primary: state.primary,
    secondary: state.secondaryMethod === "custom" ? state.hex.secondary : undefined,
    tertiary: state.tertiaryMethod === "custom" ? state.hex.tertiary : undefined,
    neutral: state.hex.neutral,
    neutralVariant: state.hex.neutralVariant,
    error: state.hex.error,
    warning: state.hex.warning,
    success: state.hex.success,
    accent: state.accentEnabled ? state.hex.accent : undefined,
  };
}

function render(): void {
  const status = el("status");
  status.textContent = "";
  let sys: ColorSystem;
  try {
    sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      secondaryOption: state.secondaryOption,
      tertiary: state.tertiaryMethod,
      tertiaryOption: state.tertiaryOption,
      accent: state.accentMethod,
      accentOption: state.accentOption,
      accentEnabled: state.accentEnabled,
      autoFixContrast: state.autoFix,
    });
  } catch (err) {
    status.textContent =
      "Could not update preview: " + (err instanceof Error ? err.message : String(err));
    return;
  }
  renderTone();
  renderLockNotes(sys);
  renderPalettes(sys);
  renderRoles(sys);
  renderContrast(sys);
  renderChanges(sys);
}

function measuredTone(hex: string): number {
  return Hct.fromInt(hexToArgb(hex)).tone;
}

function renderTone(): void {
  const tone = measuredTone(state.primary);
  el("primary-tone").textContent = `Measured tone: ${tone.toFixed(1)}`;
  const note = el("primary-note");
  if (Math.abs(tone - 40) > 10) {
    const n = Math.round(tone);
    note.hidden = false;
    note.textContent =
      `Your color sits near tone ${n}. It will still be Primary 40, ` +
      `so text on top may be adjusted for readability.`;
  } else {
    note.hidden = true;
    note.textContent = "";
  }
}

function showLockNote(inputId: string, warning: string | null): void {
  const note = el(`${inputId}-note`);
  if (warning === null) {
    note.hidden = true;
    note.textContent = "";
  } else {
    note.hidden = false;
    note.textContent = warning;
  }
}

/** Lock notes for secondary (null in Material mode or within 10 of tone 40). */
function renderLockNotes(sys: ColorSystem): void {
  showLockNote(FIELD_ID.secondary, sys.secondaryWarning);
}

function swatchButton(
  label: string,
  palette: string,
  tone: number,
  hex: string,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sw";
  btn.style.background = hex;
  btn.style.color = tone >= 55 ? "#111111" : "#ffffff";
  btn.textContent = label;
  btn.title = `${palette}/${tone} · ${hex} (click to show hex)`;
  btn.setAttribute("aria-label", `Show hex for ${palette} tone ${tone}`);
  btn.addEventListener("click", () => {
    el("swatch-detail").textContent = `${palette}/${tone} · ${hex}`;
  });
  return btn;
}

function renderPalettes(sys: ColorSystem): void {
  const root = el("palettes");
  root.textContent = "";
  const paletteOrder: PaletteName[] = sys.palettes.accent
    ? [...PALETTE_ORDER, "accent"]
    : PALETTE_ORDER;
  for (const name of paletteOrder) {
    const pal = sys.palettes[name];
    if (!pal) continue;
    const section = document.createElement("div");
    section.className = "palette";
    const h3 = document.createElement("h3");
    h3.textContent = PALETTE_LABEL[name] + " ";
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = pal.keyHex;
    h3.appendChild(key);
    section.appendChild(h3);

    const addStrip = (tones: number[]): void => {
      const strip = document.createElement("div");
      strip.className = "strip";
      for (const t of tones) {
        const lockedAccent =
          (name === "primary" || name === "secondary") && t === 40;
        strip.appendChild(
          swatchButton(
            lockedAccent ? `${t} · your color` : String(t),
            PALETTE_LABEL[name],
            t,
            pal.hex[t],
          ),
        );
      }
      section.appendChild(strip);
    };

    if (name === "neutral") {
      addStrip(STANDARD_TONES);
      const extra = document.createElement("div");
      extra.className = "strip-label";
      extra.textContent = "Extra tones (for surface roles)";
      section.appendChild(extra);
      addStrip(NEUTRAL_EXTRA_TONES);
    } else {
      addStrip(pal.tones);
    }
    root.appendChild(section);
  }
}

function modeCell(sys: ColorSystem, role: string, mode: "light" | "dark"): HTMLElement {
  const ref = sys.roleRefs[role];
  const tone = mode === "light" ? ref.lightTone : ref.darkTone;
  const hex = mode === "light" ? sys.roles.light[role] : sys.roles.dark[role];
  const cell = document.createElement("span");
  const sw = document.createElement("span");
  sw.className = "cell-swatch";
  sw.style.background = hex;
  cell.appendChild(sw);
  const text = document.createElement("span");
  text.className = "mono";
  text.textContent = `${PALETTE_LABEL[ref.palette]}/${tone} · ${hex}`;
  cell.appendChild(text);
  return cell;
}

function renderRoles(sys: ColorSystem): void {
  const body = el("roles-body");
  body.textContent = "";
  for (const role of Object.keys(sys.roleRefs)) {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.className = "mono";
    name.textContent = `color/${kebab(role)}`;
    const light = document.createElement("td");
    light.appendChild(modeCell(sys, role, "light"));
    const dark = document.createElement("td");
    dark.appendChild(modeCell(sys, role, "dark"));
    tr.append(name, light, dark);
    body.appendChild(tr);
  }
}

function ratioCell(ratio: number): HTMLElement {
  const cell = document.createElement("span");
  cell.className = "mono";
  cell.textContent = ratio.toFixed(1);
  if (ratio < 4.5) {
    const badge = document.createElement("span");
    badge.className = "badge-low";
    badge.title = "Contrast below 4.5";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⚠ ";
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode("low"));
    cell.appendChild(badge);
  }
  return cell;
}

function renderContrast(sys: ColorSystem): void {
  const body = el("contrast-body");
  body.textContent = "";
  const pairs = sys.palettes.accent ? [...CONTRAST_PAIRS, ...ACCENT_CONTRAST_PAIRS] : CONTRAST_PAIRS;
  for (const pair of pairs) {
    const tr = document.createElement("tr");
    const text = document.createElement("td");
    text.className = "mono";
    text.textContent = `color/${kebab(pair.fg)}`;
    const bg = document.createElement("td");
    bg.className = "mono";
    bg.textContent = `color/${kebab(pair.bg)}`;
    const light = document.createElement("td");
    light.appendChild(
      ratioCell(contrastRatio(sys.roles.light[pair.fg], sys.roles.light[pair.bg])),
    );
    const dark = document.createElement("td");
    dark.appendChild(
      ratioCell(contrastRatio(sys.roles.dark[pair.fg], sys.roles.dark[pair.bg])),
    );
    tr.append(text, bg, light, dark);
    body.appendChild(tr);
  }
}

function fixLine(
  sys: ColorSystem,
  role: string,
  mode: "light" | "dark",
  oldTone: number,
  newTone: number,
  before: number,
  after: number,
): string {
  const ref = sys.roleRefs[role];
  const palette = PALETTE_LABEL[ref.palette];
  const modeLabel = mode === "light" ? "Light" : "Dark";
  return (
    `color/${kebab(role)} (${modeLabel}): ${palette}/${oldTone} changed to ` +
    `${palette}/${newTone}, contrast ${before.toFixed(1)} to ${after.toFixed(1)}`
  );
}

function renderChanges(sys: ColorSystem): void {
  const heading = el("changes-heading");
  const list = el("changes");
  list.textContent = "";
  const addLine = (text: string): void => {
    const li = document.createElement("li");
    li.className = "mono";
    li.textContent = text;
    list.appendChild(li);
  };
  if (state.autoFix) {
    heading.textContent = "Text changes";
    if (sys.fixes.length === 0) {
      addLine("No text changes needed");
      return;
    }
    for (const f of sys.fixes) {
      addLine(
        fixLine(sys, f.role, f.mode, f.oldTone, f.newTone, f.contrastBefore, f.contrastAfter),
      );
    }
    return;
  }
  heading.textContent = "Warnings (not applied)";
  const wouldBeRes = checkAndFixContrast(sys.palettes, { enabled: true });
  if (wouldBeRes.fixes.length === 0) {
    addLine("No text changes needed");
    return;
  }
  for (const f of wouldBeRes.fixes) {
    const ref = wouldBeRes.roleRefs[f.role];
    const palette = PALETTE_LABEL[ref.palette];
    const modeLabel = f.mode === "light" ? "Light" : "Dark";
    addLine(
      `color/${kebab(f.role)} (${modeLabel}): ${palette}/${f.oldTone} changed to ` +
      `${palette}/${f.newTone}, contrast ${f.contrastBefore.toFixed(1)} to ${f.contrastAfter.toFixed(1)}`
    );
  }
}

function processPrimary(hex: string): void {
  state.primary = hex;
  refreshDerived();
  scheduleRender();
}

function updateSwitchUI(which: "secondary" | "tertiary" | "accent"): void {
  const field = colorFields[which];
  if (!field) return;

  const method =
    which === "secondary"
      ? state.secondaryMethod
      : which === "tertiary"
        ? state.tertiaryMethod
        : state.accentMethod;

  const isSupported = isMethodCandidateSupported(method, which);
  if (!isSupported) {
    field.setSwitchDisabled?.(true);
    field.setOptionText?.("");
    return;
  }

  const count = getCandidateCount(method, which);
  const opt =
    which === "secondary"
      ? state.secondaryOption
      : which === "tertiary"
        ? state.tertiaryOption
        : state.accentOption;

  const displayOpt = (((opt % count) + count) % count) + 1;
  field.setSwitchDisabled?.(false);
  field.setOptionText?.(`option ${displayOpt} of ${count}`);
}

function onSwitchCandidate(which: "secondary" | "tertiary" | "accent"): void {
  const method =
    which === "secondary"
      ? state.secondaryMethod
      : which === "tertiary"
        ? state.tertiaryMethod
        : state.accentMethod;

  if (!isMethodCandidateSupported(method, which)) return;

  const currentIdx =
    which === "secondary"
      ? state.secondaryOption
      : which === "tertiary"
        ? state.tertiaryOption
        : state.accentOption;

  const otherHex =
    which === "secondary"
      ? state.hex.tertiary
      : which === "tertiary"
        ? state.hex.secondary
        : undefined;

  const nextIdx = getNextCandidateIndex(
    state.primary,
    method,
    which,
    currentIdx,
    otherHex,
  );

  if (which === "secondary") state.secondaryOption = nextIdx;
  else if (which === "tertiary") state.tertiaryOption = nextIdx;
  else state.accentOption = nextIdx;

  const nextHex = getCandidateHex(state.primary, method, nextIdx, which);
  if (nextHex) {
    setHexField(which, nextHex);
  }

  updateSwitchUI(which);
  scheduleRender();
}

function processAccentHex(
  which: "secondary" | "tertiary",
  hex: string,
): void {
  state.hex[which] = hex;
  state[which === "secondary" ? "secondaryMethod" : "tertiaryMethod"] = "custom";
  el<HTMLSelectElement>(which === "secondary" ? "f-secondary-method" : "f-tertiary-method").value =
    "custom";
  updateSwitchUI(which);
  scheduleRender();
}

function processFreeHex(
  name: Exclude<PaletteName, "primary" | "secondary" | "tertiary">,
  hex: string,
): void {
  state.hex[name] = hex;
  state.touched.add(name);
  scheduleRender();
}

function onMethodChange(which: "secondary" | "tertiary"): void {
  const sel = el<HTMLSelectElement>(
    which === "secondary" ? "f-secondary-method" : "f-tertiary-method",
  );
  const method = sel.value as Method;
  if (which === "secondary") {
    state.secondaryMethod = method;
    const otherHex = state.hex.tertiary;
    state.secondaryOption = getDefaultCandidateIndex(state.primary, method, "secondary", otherHex);
  } else {
    state.tertiaryMethod = method;
    const otherHex = state.hex.secondary;
    state.tertiaryOption = getDefaultCandidateIndex(state.primary, method, "tertiary", otherHex);
  }
  if (method !== "custom") {
    const opt = which === "secondary" ? state.secondaryOption : state.tertiaryOption;
    const hex =
      method === "material"
        ? materialPaletteTone40(state.primary, which)
        : harmonyKeyColor(state.primary, method, which, opt);
    setHexField(which, hex);
  }
  updateSwitchUI(which);
  scheduleRender();
}

function processAccentColorHex(hex: string): void {
  state.hex.accent = hex;
  state.accentMethod = "custom";
  el<HTMLSelectElement>("f-accent-method").value = "custom";
  updateSwitchUI("accent");
  scheduleRender();
}

function onAccentMethodChange(): void {
  const sel = el<HTMLSelectElement>("f-accent-method");
  const method = sel.value as AccentMethod;
  state.accentMethod = method;
  state.accentOption = 0;
  if (method !== "custom") {
    const hex = harmonyKeyColor(state.primary, method, "accent", 0);
    setHexField("accent", hex);
  }
  updateSwitchUI("accent");
  scheduleRender();
}

function resetAll(): void {
  state.touched.clear();
  state.secondaryMethod = "material";
  state.secondaryOption = 0;
  state.tertiaryMethod = "material";
  state.tertiaryOption = 1;
  state.accentEnabled = false;
  state.accentMethod = "complementary";
  state.accentOption = 0;
  el<HTMLSelectElement>("f-secondary-method").value = "material";
  el<HTMLSelectElement>("f-tertiary-method").value = "material";
  el<HTMLInputElement>("f-accent-enabled").checked = false;
  el("accent-fields").hidden = true;
  el<HTMLSelectElement>("f-accent-method").value = "complementary";
  refreshDerived();
  updateSwitchUI("secondary");
  updateSwitchUI("tertiary");
  updateSwitchUI("accent");
  render();
}

function currentSavedInputs(): SavedInputs {
  return {
    version: 1,
    primary: state.primary,
    secondaryMethod: state.secondaryMethod,
    secondaryHex: state.hex.secondary,
    secondaryOption: state.secondaryOption,
    tertiaryMethod: state.tertiaryMethod,
    tertiaryHex: state.hex.tertiary,
    tertiaryOption: state.tertiaryOption,
    neutral: state.hex.neutral,
    neutralVariant: state.hex.neutralVariant,
    error: state.hex.error,
    warning: state.hex.warning,
    success: state.hex.success,
    autoFix: state.autoFix,
    accentEnabled: state.accentEnabled,
    accentMethod: state.accentMethod,
    accentHex: state.hex.accent,
    accentOption: state.accentOption,
  };
}

function restoreSavedInputs(saved: SavedInputs): void {
  state.primary = saved.primary;
  colorFields.primary?.setValue(saved.primary);

  setHexField("secondary", saved.secondaryHex);
  const secOpt = saved.secondaryOption ?? 0;
  state.secondaryOption = secOpt;
  if (saved.secondaryMethod === "custom") {
    state.secondaryMethod = "custom";
  } else if (saved.secondaryMethod === "material") {
    const expected = materialPaletteTone40(saved.primary, "secondary");
    if (normalizeHex(saved.secondaryHex).toUpperCase() === normalizeHex(expected).toUpperCase()) {
      state.secondaryMethod = "material";
    } else {
      state.secondaryMethod = "custom";
    }
  } else {
    const expected = getCandidateHex(saved.primary, saved.secondaryMethod, secOpt, "secondary");
    if (expected && normalizeHex(saved.secondaryHex).toUpperCase() === normalizeHex(expected).toUpperCase()) {
      state.secondaryMethod = saved.secondaryMethod;
    } else {
      state.secondaryMethod = "custom";
    }
  }
  el<HTMLSelectElement>("f-secondary-method").value = state.secondaryMethod;

  setHexField("tertiary", saved.tertiaryHex);
  const tertOpt =
    saved.tertiaryOption ??
    getDefaultCandidateIndex(saved.primary, saved.tertiaryMethod, "tertiary", saved.secondaryHex);
  state.tertiaryOption = tertOpt;
  if (saved.tertiaryMethod === "custom") {
    state.tertiaryMethod = "custom";
  } else if (saved.tertiaryMethod === "material") {
    const expected = materialPaletteTone40(saved.primary, "tertiary");
    if (normalizeHex(saved.tertiaryHex).toUpperCase() === normalizeHex(expected).toUpperCase()) {
      state.tertiaryMethod = "material";
    } else {
      state.tertiaryMethod = "custom";
    }
  } else {
    const expected = getCandidateHex(saved.primary, saved.tertiaryMethod, tertOpt, "tertiary");
    if (expected && normalizeHex(saved.tertiaryHex).toUpperCase() === normalizeHex(expected).toUpperCase()) {
      state.tertiaryMethod = saved.tertiaryMethod;
    } else {
      state.tertiaryMethod = "custom";
    }
  }
  el<HTMLSelectElement>("f-tertiary-method").value = state.tertiaryMethod;

  state.accentEnabled = saved.accentEnabled ?? false;
  el<HTMLInputElement>("f-accent-enabled").checked = state.accentEnabled;
  el("accent-fields").hidden = !state.accentEnabled;

  const defaultAccentHex = harmonyKeyColor(saved.primary, "complementary", "accent", 0);
  const accentHex = saved.accentHex ?? defaultAccentHex;
  setHexField("accent", accentHex);
  const accMethod = saved.accentMethod ?? "complementary";
  const accOpt = saved.accentOption ?? 0;
  state.accentOption = accOpt;
  if (accMethod === "custom") {
    state.accentMethod = "custom";
  } else {
    const expected = getCandidateHex(saved.primary, accMethod, accOpt, "accent");
    if (expected && normalizeHex(accentHex).toUpperCase() === normalizeHex(expected).toUpperCase()) {
      state.accentMethod = accMethod;
    } else {
      state.accentMethod = "custom";
    }
  }
  el<HTMLSelectElement>("f-accent-method").value = state.accentMethod;

  state.touched.clear();
  (["neutral", "neutralVariant", "error", "warning", "success"] as const).forEach((key) => {
    setHexField(key, saved[key]);
    state.touched.add(key);
  });

  state.autoFix = saved.autoFix;
  el<HTMLInputElement>("f-autofix").checked = saved.autoFix;

  updateSwitchUI("secondary");
  updateSwitchUI("tertiary");
  updateSwitchUI("accent");
  render();
}

let currentMode: "create" | "update" = "create";

function setSystemExistsUI(exists: boolean, isOldLayout: boolean = false): void {
  const actionState = getActionButtonState(exists, isOldLayout);
  currentMode = actionState.mode;

  const actionBtn = el<HTMLButtonElement>("f-action");
  const helperText = el<HTMLElement>("system-exists-text");
  const applyBtn = el<HTMLButtonElement>("f-apply");
  const exportBtn = el<HTMLButtonElement>("f-export");

  actionBtn.textContent = actionState.label;
  actionBtn.disabled = actionState.disabled ?? false;

  if (actionState.showHelper) {
    helperText.textContent = actionState.helperText;
    helperText.hidden = false;
  } else {
    helperText.textContent = "";
    helperText.hidden = true;
  }

  if (isOldLayout) {
    exportBtn.disabled = true;
    exportBtn.title =
      "This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create.";
    applyBtn.disabled = true;
  } else if (exists) {
    exportBtn.disabled = false;
    exportBtn.title = "";
  } else {
    exportBtn.disabled = true;
    exportBtn.title = "No M3 color system found in file. Please create system first.";
    applyBtn.disabled = true;
  }
}

function onActionClick(): void {
  const actionBtn = el<HTMLButtonElement>("f-action");
  actionBtn.disabled = true;

  if (currentMode === "create") {
    onCreateClick();
  } else {
    onUpdateClick();
  }
}

function onCreateClick(): void {
  const actionBtn = el<HTMLButtonElement>("f-action");
  actionBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Creating variables in Figma...";

  try {
    const sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      secondaryOption: state.secondaryOption,
      tertiary: state.tertiaryMethod,
      tertiaryOption: state.tertiaryOption,
      accent: state.accentMethod,
      accentOption: state.accentOption,
      accentEnabled: state.accentEnabled,
      autoFixContrast: state.autoFix,
    });

    const payload = buildCreatePayload(sys);

    parent.postMessage(
      {
        pluginMessage: {
          type: "create-system",
          payload,
          inputs: serializeSavedInputs(currentSavedInputs()),
        },
      },
      "*",
    );
  } catch (err) {
    actionBtn.disabled = false;
    status.style.color = "var(--danger)";
    status.textContent =
      "Could not create system: " + (err instanceof Error ? err.message : String(err));
  }
}

function onUpdateClick(): void {
  const actionBtn = el<HTMLButtonElement>("f-action");
  const applyBtn = el<HTMLButtonElement>("f-apply");

  actionBtn.disabled = true;
  applyBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Calculating update preview...";

  try {
    const sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      secondaryOption: state.secondaryOption,
      tertiary: state.tertiaryMethod,
      tertiaryOption: state.tertiaryOption,
      accent: state.accentMethod,
      accentOption: state.accentOption,
      accentEnabled: state.accentEnabled,
      autoFixContrast: state.autoFix,
    });

    const payload = buildCreatePayload(sys);

    parent.postMessage(
      {
        pluginMessage: {
          type: "preview-update",
          payload,
          inputs: serializeSavedInputs(currentSavedInputs()),
        },
      },
      "*",
    );
  } catch (err) {
    actionBtn.disabled = false;
    status.style.color = "var(--danger)";
    status.textContent =
      "Could not preview update: " + (err instanceof Error ? err.message : String(err));
  }
}

function onApplyClick(): void {
  const actionBtn = el<HTMLButtonElement>("f-action");
  const applyBtn = el<HTMLButtonElement>("f-apply");

  actionBtn.disabled = true;
  applyBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Applying updates in Figma...";

  try {
    const sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      secondaryOption: state.secondaryOption,
      tertiary: state.tertiaryMethod,
      tertiaryOption: state.tertiaryOption,
      accent: state.accentMethod,
      accentOption: state.accentOption,
      accentEnabled: state.accentEnabled,
      autoFixContrast: state.autoFix,
    });

    const payload = buildCreatePayload(sys);

    parent.postMessage(
      {
        pluginMessage: {
          type: "apply-update",
          payload,
          inputs: serializeSavedInputs(currentSavedInputs()),
        },
      },
      "*",
    );
  } catch (err) {
    actionBtn.disabled = false;
    applyBtn.disabled = false;
    status.style.color = "var(--danger)";
    status.textContent =
      "Could not apply update: " + (err instanceof Error ? err.message : String(err));
  }
}

function onExportClick(): void {
  const exportBtn = el<HTMLButtonElement>("f-export");
  exportBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Exporting JSON tokens from Figma file...";

  parent.postMessage(
    {
      pluginMessage: {
        type: "export-json",
      },
    },
    "*",
  );
}

function init(): void {
  colorFields.primary = createColorField({
    id: "f-primary",
    pickerId: "f-primary-picker",
    label: "Primary",
    initialValue: state.primary,
    placeholder: "#6750A4",
    onValidChange: (hex) => processPrimary(hex),
  });
  el("cf-primary").replaceWith(colorFields.primary.row);

  colorFields.secondary = createColorField({
    id: "f-secondary-hex",
    pickerId: "f-secondary-hex-picker",
    label: "Secondary",
    initialValue: "#000000",
    placeholder: "#000000",
    onValidChange: (hex) => processAccentHex("secondary", hex),
    hasSwitch: true,
    onSwitch: () => onSwitchCandidate("secondary"),
    switchLabel: "Next color for Secondary",
  });
  el("cf-secondary").replaceWith(colorFields.secondary.row);

  colorFields.tertiary = createColorField({
    id: "f-tertiary-hex",
    pickerId: "f-tertiary-hex-picker",
    label: "Tertiary",
    initialValue: "#000000",
    placeholder: "#000000",
    onValidChange: (hex) => processAccentHex("tertiary", hex),
    hasSwitch: true,
    onSwitch: () => onSwitchCandidate("tertiary"),
    switchLabel: "Next color for Tertiary",
  });
  el("cf-tertiary").replaceWith(colorFields.tertiary.row);

  colorFields.accent = createColorField({
    id: "f-accent-hex",
    pickerId: "f-accent-hex-picker",
    label: "Accent",
    initialValue: "#000000",
    placeholder: "#000000",
    onValidChange: (hex) => processAccentColorHex(hex),
    hasSwitch: true,
    onSwitch: () => onSwitchCandidate("accent"),
    switchLabel: "Next color for Accent",
  });
  el("cf-accent").replaceWith(colorFields.accent.row);

  (["neutral", "neutralVariant", "error", "warning", "success"] as const).forEach((name) => {
    colorFields[name] = createColorField({
      id: FIELD_ID[name],
      pickerId: `${FIELD_ID[name]}-picker`,
      label: PALETTE_LABEL[name],
      initialValue: "#000000",
      onValidChange: (hex) => processFreeHex(name, hex),
    });
    el(MOUNT_ID[name]).replaceWith(colorFields[name].row);
  });

  refreshDerived();
  render();

  el<HTMLInputElement>("f-accent-enabled").addEventListener("change", (e) => {
    state.accentEnabled = (e.target as HTMLInputElement).checked;
    el("accent-fields").hidden = !state.accentEnabled;
    scheduleRender();
  });
  el<HTMLSelectElement>("f-accent-method").addEventListener("change", onAccentMethodChange);

  el<HTMLSelectElement>("f-secondary-method").addEventListener("change", () =>
    onMethodChange("secondary"),
  );
  el<HTMLSelectElement>("f-tertiary-method").addEventListener("change", () =>
    onMethodChange("tertiary"),
  );
  el<HTMLInputElement>("f-autofix").addEventListener("change", (e) => {
    state.autoFix = (e.target as HTMLInputElement).checked;
    render();
  });
  el<HTMLButtonElement>("f-reset").addEventListener("click", resetAll);
  el<HTMLButtonElement>("f-action").addEventListener("click", onActionClick);
  el<HTMLButtonElement>("f-apply").addEventListener("click", onApplyClick);
  el<HTMLButtonElement>("f-export").addEventListener("click", onExportClick);
  el<HTMLButtonElement>("close").addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "close" } }, "*");
  });

  window.addEventListener("message", (event) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    if (msg.type === "init-status") {
      setSystemExistsUI(msg.systemExists, msg.isOldLayout ?? false);
      if (msg.isOldLayout) {
        const status = el("status");
        status.style.color = "var(--danger)";
        status.textContent =
          msg.message ||
          "This file uses an older layout. Delete the primitives and color roles collections (or the older palette and color collections, in any capitalization), then click Create.";
      } else {
        const saved = parseSavedInputs(msg.savedInputs);
        restoreSavedInputs(saved);
      }
      return;
    }

    if (msg.type === "create-result") {
      const res = msg.result;
      const status = el("status");
      const actionBtn = el<HTMLButtonElement>("f-action");

      status.textContent = res.message;
      if (res.success) {
        actionBtn.disabled = false;
        setSystemExistsUI(true, false);
        status.style.color = "var(--text)";
      } else {
        const isOld = typeof res.message === "string" && (res.message.includes("older layout") || res.message.includes("old layout"));
        setSystemExistsUI(false, isOld);
        actionBtn.disabled = isOld;
        status.style.color = "var(--danger)";
      }
      return;
    }

    if (msg.type === "preview-update-result") {
      const res = msg.result;
      const status = el("status");
      const previewBox = el<HTMLElement>("update-preview-box");
      const summary = el("update-summary");
      const diffList = el("update-diff-list");
      const applyBtn = el<HTMLButtonElement>("f-apply");
      const actionBtn = el<HTMLButtonElement>("f-action");

      actionBtn.disabled = false;

      if (!res.success) {
        status.style.color = "var(--danger)";
        status.textContent = res.message;
        previewBox.hidden = true;
        applyBtn.disabled = true;
        return;
      }

      status.textContent = "";
      previewBox.hidden = false;
      const diff = res.diff;
      summary.textContent = diff.summaryText;
      diffList.textContent = "";

      const accentUntouchedNote = el("accent-untouched-note");
      const hasUntouchedAccent = diff.changes.some(
        (c: { type: string; id: string; varName: string }) =>
          c.type === "VARIABLE_UNTOUCHED" && (c.id.includes("accent") || c.varName.includes("accent")),
      );
      accentUntouchedNote.hidden = !hasUntouchedAccent;

      if (diff.changes.length === 0) {
        const li = document.createElement("li");
        li.className = "mono";
        li.textContent = "Nothing to update.";
        diffList.appendChild(li);
      } else {
        for (const c of diff.changes) {
          const li = document.createElement("li");
          li.className = "mono";
          li.textContent = c.formatted;
          diffList.appendChild(li);
        }
      }

      applyBtn.disabled = !diff.hasChanges;
      return;
    }

    if (msg.type === "apply-update-result") {
      const res = msg.result;
      const status = el("status");
      const actionBtn = el<HTMLButtonElement>("f-action");
      const applyBtn = el<HTMLButtonElement>("f-apply");
      const previewBox = el<HTMLElement>("update-preview-box");

      actionBtn.disabled = false;
      applyBtn.disabled = true;
      previewBox.hidden = true;

      status.textContent = res.message;
      if (res.success) {
        setSystemExistsUI(true);
        status.style.color = "var(--text)";
      } else {
        status.style.color = "var(--danger)";
      }
      return;
    }

    if (msg.type === "export-json-result") {
      const exportBtn = el<HTMLButtonElement>("f-export");
      exportBtn.disabled = false;

      const status = el("status");

      if (!msg.success || !msg.result) {
        status.style.color = "var(--danger)";
        status.textContent = msg.message || "Export failed.";
        return;
      }

      const res = msg.result;

      const blob = new Blob([res.jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tokens.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      status.style.color = "var(--text)";
      status.textContent = `Exported ${res.counts.keyColorTokens} key colors, ${res.counts.paletteTokens} palette tokens and ${res.counts.totalRoleTokens} role tokens (${res.counts.roleTokensLight} light, ${res.counts.roleTokensDark} dark).`;
      return;
    }
  });
}

init();
