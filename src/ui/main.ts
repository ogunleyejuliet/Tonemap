import "./styles.css";
import { Hct } from "@material/material-color-utilities";
import {
  CONTRAST_PAIRS,
  ROLE_DEFINITIONS,
  buildColorSystem,
  checkAndFixContrast,
  contrastRatio,
  harmonyKeyColor,
  materialPaletteTone40,
  resolveKeyColors,
  type ColorSystem,
  type PaletteName,
  type RoleName,
  type SecondaryTertiaryMode,
} from "../colors/index.js";
import { hexToArgb } from "../colors/hex.js";
import { buildCreatePayload } from "../variables/plan.js";
import { parseHexField } from "./validate.js";

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

const HEX_HINT = "Enter 6 hex digits, e.g. #6750A4.";
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
  tertiaryMethod: Method;
  hex: Record<Exclude<PaletteName, "primary">, string>;
  touched: Set<Exclude<PaletteName, "primary">>;
  autoFix: boolean;
}

const state: State = {
  primary: "#6750A4",
  secondaryMethod: "material",
  tertiaryMethod: "material",
  hex: {
    secondary: "",
    tertiary: "",
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
  neutral: "f-neutral",
  neutralVariant: "f-neutral-variant",
  error: "f-error",
  warning: "f-warning",
  success: "f-success",
};

let renderTimer = 0;

function scheduleRender(): void {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, DEBOUNCE_MS);
}

function setFieldError(inputId: string, message: string): void {
  el(`${inputId}-error`).textContent = message;
}

function setHexField(name: Exclude<PaletteName, "primary">, hex: string): void {
  state.hex[name] = hex;
  el<HTMLInputElement>(FIELD_ID[name]).value = hex;
  setFieldError(FIELD_ID[name], "");
}

function materialDefaults(primary: string): Record<PaletteName, string> {
  const kc = resolveKeyColors({ primary }, {});
  return {
    primary,
    secondary: kc.secondary,
    tertiary: kc.tertiary,
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
    setHexField("secondary", harmonyKeyColor(state.primary, state.secondaryMethod, "secondary"));
  }
  if (state.tertiaryMethod === "material") {
    setHexField("tertiary", materialPaletteTone40(state.primary, "tertiary"));
  } else if (state.tertiaryMethod !== "custom") {
    setHexField("tertiary", harmonyKeyColor(state.primary, state.tertiaryMethod, "tertiary"));
  }
  (["neutral", "neutralVariant", "error", "warning", "success"] as const).forEach(
    (name) => {
      if (!state.touched.has(name)) setHexField(name, d[name]);
    },
  );
  el<HTMLInputElement>("f-primary-picker").value = state.primary.toLowerCase();
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
  };
}

function render(): void {
  const status = el("status");
  status.textContent = "";
  let sys: ColorSystem;
  try {
    sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      tertiary: state.tertiaryMethod,
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

/** Lock notes for harmony/custom secondary/tertiary (null in Material mode). */
function renderLockNotes(sys: ColorSystem): void {
  showLockNote(FIELD_ID.secondary, sys.secondaryWarning);
  showLockNote(FIELD_ID.tertiary, sys.tertiaryWarning);
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
  for (const name of PALETTE_ORDER) {
    const pal = sys.palettes[name];
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
          (name === "primary" || name === "secondary" || name === "tertiary") &&
          t === 40;
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

function modeCell(sys: ColorSystem, role: RoleName, mode: "light" | "dark"): HTMLElement {
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
  for (const role of Object.keys(ROLE_DEFINITIONS) as RoleName[]) {
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
  for (const pair of CONTRAST_PAIRS) {
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
  role: RoleName,
  mode: "light" | "dark",
  oldTone: number,
  newTone: number,
  before: number,
  after: number,
): string {
  const palette = PALETTE_LABEL[ROLE_DEFINITIONS[role].palette];
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
        fixLine(f.role, f.mode, f.oldTone, f.newTone, f.contrastBefore, f.contrastAfter),
      );
    }
    return;
  }
  heading.textContent = "Warnings (not applied)";
  const wouldBe = checkAndFixContrast(sys.palettes, { enabled: true }).fixes;
  if (wouldBe.length === 0) {
    addLine("No text changes needed");
    return;
  }
  for (const f of wouldBe) {
    addLine(
      fixLine(f.role, f.mode, f.oldTone, f.newTone, f.contrastBefore, f.contrastAfter),
    );
  }
}

function processPrimary(raw: string): void {
  const hex = parseHexField(raw);
  if (hex === null) {
    setFieldError("f-primary", HEX_HINT);
    return;
  }
  setFieldError("f-primary", "");
  state.primary = hex;
  refreshDerived();
  scheduleRender();
}

function processAccentHex(
  which: "secondary" | "tertiary",
  raw: string,
): void {
  const inputId = FIELD_ID[which];
  const hex = parseHexField(raw);
  if (hex === null) {
    setFieldError(inputId, HEX_HINT);
    return;
  }
  setFieldError(inputId, "");
  state.hex[which] = hex;
  state[which === "secondary" ? "secondaryMethod" : "tertiaryMethod"] = "custom";
  el<HTMLSelectElement>(which === "secondary" ? "f-secondary-method" : "f-tertiary-method").value =
    "custom";
  scheduleRender();
}

function processFreeHex(name: Exclude<PaletteName, "primary" | "secondary" | "tertiary">, raw: string): void {
  const inputId = FIELD_ID[name];
  const hex = parseHexField(raw);
  if (hex === null) {
    setFieldError(inputId, HEX_HINT);
    return;
  }
  setFieldError(inputId, "");
  state.hex[name] = hex;
  state.touched.add(name);
  scheduleRender();
}

function onMethodChange(which: "secondary" | "tertiary"): void {
  const sel = el<HTMLSelectElement>(
    which === "secondary" ? "f-secondary-method" : "f-tertiary-method",
  );
  const method = sel.value as Method;
  if (which === "secondary") state.secondaryMethod = method;
  else state.tertiaryMethod = method;
  if (method !== "custom") {
    const hex =
      method === "material"
        ? materialPaletteTone40(state.primary, which)
        : harmonyKeyColor(state.primary, method, which);
    setHexField(which, hex);
  }
  scheduleRender();
}

function resetAll(): void {
  state.touched.clear();
  state.secondaryMethod = "material";
  state.tertiaryMethod = "material";
  el<HTMLSelectElement>("f-secondary-method").value = "material";
  el<HTMLSelectElement>("f-tertiary-method").value = "material";
  refreshDerived();
  render();
}

function currentInputsState(): Record<string, unknown> {
  return {
    primary: state.primary,
    secondaryMethod: state.secondaryMethod,
    tertiaryMethod: state.tertiaryMethod,
    secondaryHex: state.hex.secondary,
    tertiaryHex: state.hex.tertiary,
    neutral: state.hex.neutral,
    neutralVariant: state.hex.neutralVariant,
    error: state.hex.error,
    warning: state.hex.warning,
    success: state.hex.success,
    autoFix: state.autoFix,
  };
}

function restoreSavedInputs(inputs: Record<string, unknown>): void {
  if (typeof inputs.primary === "string" && inputs.primary) {
    state.primary = inputs.primary;
    el<HTMLInputElement>("f-primary").value = inputs.primary;
  }
  if (typeof inputs.secondaryMethod === "string") {
    state.secondaryMethod = inputs.secondaryMethod as Method;
    el<HTMLSelectElement>("f-secondary-method").value = inputs.secondaryMethod;
  }
  if (typeof inputs.tertiaryMethod === "string") {
    state.tertiaryMethod = inputs.tertiaryMethod as Method;
    el<HTMLSelectElement>("f-tertiary-method").value = inputs.tertiaryMethod;
  }
  if (typeof inputs.secondaryHex === "string" && inputs.secondaryHex) {
    state.hex.secondary = inputs.secondaryHex;
  }
  if (typeof inputs.tertiaryHex === "string" && inputs.tertiaryHex) {
    state.hex.tertiary = inputs.tertiaryHex;
  }
  (["neutral", "neutralVariant", "error", "warning", "success"] as const).forEach((key) => {
    if (typeof inputs[key] === "string" && inputs[key]) {
      state.hex[key] = inputs[key] as string;
      state.touched.add(key);
    }
  });
  if (typeof inputs.autoFix === "boolean") {
    state.autoFix = inputs.autoFix;
    el<HTMLInputElement>("f-autofix").checked = inputs.autoFix;
  }
  refreshDerived();
  render();
}

function setSystemExistsUI(exists: boolean): void {
  const createBtn = el<HTMLButtonElement>("f-create");
  const updateBtn = el<HTMLButtonElement>("f-update");
  const applyBtn = el<HTMLButtonElement>("f-apply");
  const exportBtn = el<HTMLButtonElement>("f-export");

  if (exists) {
    createBtn.disabled = true;
    createBtn.textContent = "A system already exists. Use Update.";
    updateBtn.disabled = false;
    applyBtn.disabled = true;
    exportBtn.disabled = false;
    exportBtn.title = "";
  } else {
    createBtn.disabled = false;
    createBtn.textContent = "Create variables in Figma";
    updateBtn.disabled = true;
    applyBtn.disabled = true;
    exportBtn.disabled = true;
    exportBtn.title = "No M3 color system found in file. Please create system first.";
  }
}

function onCreateClick(): void {
  const createBtn = el<HTMLButtonElement>("f-create");
  const updateBtn = el<HTMLButtonElement>("f-update");
  createBtn.disabled = true;
  updateBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Creating variables in Figma...";

  try {
    const sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      tertiary: state.tertiaryMethod,
      autoFixContrast: state.autoFix,
    });

    const payload = buildCreatePayload(sys);

    parent.postMessage(
      {
        pluginMessage: {
          type: "create-system",
          payload,
          inputs: currentInputsState(),
        },
      },
      "*",
    );
  } catch (err) {
    createBtn.disabled = false;
    status.style.color = "var(--danger)";
    status.textContent =
      "Could not create system: " + (err instanceof Error ? err.message : String(err));
  }
}

function onUpdateClick(): void {
  const updateBtn = el<HTMLButtonElement>("f-update");
  const createBtn = el<HTMLButtonElement>("f-create");
  const applyBtn = el<HTMLButtonElement>("f-apply");

  updateBtn.disabled = true;
  createBtn.disabled = true;
  applyBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Calculating update preview...";

  try {
    const sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      tertiary: state.tertiaryMethod,
      autoFixContrast: state.autoFix,
    });

    const payload = buildCreatePayload(sys);

    parent.postMessage(
      {
        pluginMessage: {
          type: "preview-update",
          payload,
          inputs: currentInputsState(),
        },
      },
      "*",
    );
  } catch (err) {
    updateBtn.disabled = false;
    status.style.color = "var(--danger)";
    status.textContent =
      "Could not preview update: " + (err instanceof Error ? err.message : String(err));
  }
}

function onApplyClick(): void {
  const updateBtn = el<HTMLButtonElement>("f-update");
  const createBtn = el<HTMLButtonElement>("f-create");
  const applyBtn = el<HTMLButtonElement>("f-apply");

  updateBtn.disabled = true;
  createBtn.disabled = true;
  applyBtn.disabled = true;

  const status = el("status");
  status.style.color = "var(--text)";
  status.textContent = "Applying updates in Figma...";

  try {
    const sys = buildColorSystem(currentInputs(), {
      secondary: state.secondaryMethod,
      tertiary: state.tertiaryMethod,
      autoFixContrast: state.autoFix,
    });

    const payload = buildCreatePayload(sys);

    parent.postMessage(
      {
        pluginMessage: {
          type: "apply-update",
          payload,
          inputs: currentInputsState(),
        },
      },
      "*",
    );
  } catch (err) {
    updateBtn.disabled = false;
    applyBtn.disabled = false;
    status.style.color = "var(--danger)";
    status.textContent =
      "Could not apply update: " + (err instanceof Error ? err.message : String(err));
  }
}

function onExportClick(): void {
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

function onCopyJsonClick(): void {
  const textArea = el<HTMLTextAreaElement>("export-json-text");
  const exportStatus = el("export-status");
  try {
    textArea.select();
    textArea.setSelectionRange(0, 999999);
    const copied = document.execCommand("copy");
    if (copied) {
      exportStatus.style.color = "var(--text)";
      exportStatus.textContent = "Copied JSON to clipboard!";
      return;
    }
  } catch (_e) { /* fallback */ }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textArea.value).then(() => {
      exportStatus.style.color = "var(--text)";
      exportStatus.textContent = "Copied JSON to clipboard!";
    }).catch((err) => {
      exportStatus.style.color = "var(--danger)";
      exportStatus.textContent = `Copy failed: ${err instanceof Error ? err.message : String(err)}`;
    });
  } else {
    exportStatus.style.color = "var(--danger)";
    exportStatus.textContent = "Copy failed. Please select text manually.";
  }
}

function onDownloadJsonClick(): void {
  const textArea = el<HTMLTextAreaElement>("export-json-text");
  const exportStatus = el("export-status");

  try {
    const blob = new Blob([textArea.value], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tokens.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    exportStatus.style.color = "var(--text)";
    exportStatus.textContent = "Downloaded tokens.json!";
  } catch (_err) {
    el<HTMLButtonElement>("f-download-json").hidden = true;
    exportStatus.style.color = "var(--text)";
    exportStatus.textContent = "Download is restricted inside Figma plugin window. Use Copy JSON instead.";
  }
}

function init(): void {
  el<HTMLInputElement>("f-primary").value = state.primary;
  refreshDerived();
  render();

  el<HTMLInputElement>("f-primary").addEventListener("input", (e) => {
    processPrimary((e.target as HTMLInputElement).value);
  });
  el<HTMLInputElement>("f-primary-picker").addEventListener("input", (e) => {
    const picker = (e.target as HTMLInputElement).value.toUpperCase();
    el<HTMLInputElement>("f-primary").value = picker;
    processPrimary(picker);
  });
  el<HTMLSelectElement>("f-secondary-method").addEventListener("change", () =>
    onMethodChange("secondary"),
  );
  el<HTMLSelectElement>("f-tertiary-method").addEventListener("change", () =>
    onMethodChange("tertiary"),
  );
  el<HTMLInputElement>("f-secondary-hex").addEventListener("input", (e) => {
    processAccentHex("secondary", (e.target as HTMLInputElement).value);
  });
  el<HTMLInputElement>("f-tertiary-hex").addEventListener("input", (e) => {
    processAccentHex("tertiary", (e.target as HTMLInputElement).value);
  });
  (
    ["neutral", "neutralVariant", "error", "warning", "success"] as const
  ).forEach((name) => {
    el<HTMLInputElement>(FIELD_ID[name]).addEventListener("input", (e) => {
      processFreeHex(name, (e.target as HTMLInputElement).value);
    });
  });
  el<HTMLInputElement>("f-autofix").addEventListener("change", (e) => {
    state.autoFix = (e.target as HTMLInputElement).checked;
    render();
  });
  el<HTMLButtonElement>("f-reset").addEventListener("click", resetAll);
  el<HTMLButtonElement>("f-create").addEventListener("click", onCreateClick);
  el<HTMLButtonElement>("f-update").addEventListener("click", onUpdateClick);
  el<HTMLButtonElement>("f-apply").addEventListener("click", onApplyClick);
  el<HTMLButtonElement>("f-export").addEventListener("click", onExportClick);
  el<HTMLButtonElement>("f-copy-json").addEventListener("click", onCopyJsonClick);
  el<HTMLButtonElement>("f-download-json").addEventListener("click", onDownloadJsonClick);
  el<HTMLButtonElement>("close").addEventListener("click", () => {
    parent.postMessage({ pluginMessage: { type: "close" } }, "*");
  });

  window.addEventListener("message", (event) => {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    if (msg.type === "init-status") {
      setSystemExistsUI(msg.systemExists);
      if (msg.savedInputs) {
        restoreSavedInputs(msg.savedInputs);
      }
      return;
    }

    if (msg.type === "create-result") {
      const res = msg.result;
      const status = el("status");
      status.textContent = res.message;
      if (res.success) {
        setSystemExistsUI(true);
        status.style.color = "var(--text)";
      } else {
        setSystemExistsUI(false);
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
      const updateBtn = el<HTMLButtonElement>("f-update");

      updateBtn.disabled = false;

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
      const updateBtn = el<HTMLButtonElement>("f-update");
      const applyBtn = el<HTMLButtonElement>("f-apply");
      const previewBox = el<HTMLElement>("update-preview-box");

      updateBtn.disabled = false;
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
      const status = el("status");
      const exportBox = el<HTMLElement>("export-box");
      const exportCount = el("export-count");
      const exportText = el<HTMLTextAreaElement>("export-json-text");
      const exportStatus = el("export-status");

      if (!msg.success || !msg.result) {
        status.style.color = "var(--danger)";
        status.textContent = msg.message || "Export failed.";
        exportBox.hidden = true;
        return;
      }

      const res = msg.result;
      status.textContent = "";
      exportBox.hidden = false;
      exportCount.textContent = `Exported ${res.counts.paletteTokens} palette tokens and ${res.counts.totalRoleTokens} role tokens (${res.counts.roleTokensLight} Light, ${res.counts.roleTokensDark} Dark).`;
      exportText.value = res.jsonString;
      exportStatus.textContent = "";

      // Check if downloading works inside current window environment
      const isFigmaIframe = window.parent !== window;
      if (isFigmaIframe) {
        const downloadBtn = el<HTMLButtonElement>("f-download-json");
        downloadBtn.hidden = true;
        exportStatus.textContent = "Note: Download is restricted in Figma plugin windows. Use Copy JSON instead.";
      }
      return;
    }
  });
}

init();
