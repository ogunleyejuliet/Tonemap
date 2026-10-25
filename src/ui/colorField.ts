import {
  parseHexInput,
  pickerToCanonicalHex,
  toPickerValue,
} from "./colorFieldLogic.js";

export const HEX_HINT = "Enter 6 hex digits, e.g. #6750A4.";

export interface ColorFieldOptions {
  /** ID for the text input, e.g. "f-primary" or "f-secondary-hex" */
  id: string;
  /** Optional ID for the color picker input; defaults to `${id}-picker` */
  pickerId?: string;
  /** Visible label or descriptive name for accessibility */
  label: string;
  /** Initial hex color value, e.g. "#6750A4" */
  initialValue: string;
  /** Placeholder text for the text input */
  placeholder?: string;
  /** Optional error element reference; defaults to `#${id}-error` */
  errorEl?: HTMLElement | null;
  /** Callback fired whenever the field resolves to a new valid canonical hex */
  onValidChange?: (canonicalHex: string) => void;
}

export interface ColorField {
  row: HTMLDivElement;
  container: HTMLDivElement;
  textInput: HTMLInputElement;
  pickerInput: HTMLInputElement;
  getValue: () => string;
  setValue: (hex: string) => void;
  setError: (msg: string) => void;
  clearError: () => void;
}

/**
 * Creates a reusable color field component combining:
 * - A 6-digit hex text input (supports with/without "#", any casing, whitespace trimming)
 * - An HTML5 color picker input acting as swatch and interactive picker
 * - Automatic error display and keeping the last valid swatch/picker color on invalid input
 */
export function createColorField(options: ColorFieldOptions): ColorField {
  const row = document.createElement("div");
  row.className = "row";

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.id = options.id;
  textInput.spellcheck = false;
  textInput.autocomplete = "off";
  if (options.placeholder !== undefined) {
    textInput.placeholder = options.placeholder;
  }

  const pickerId = options.pickerId ?? `${options.id}-picker`;
  const pickerInput = document.createElement("input");
  pickerInput.type = "color";
  pickerInput.id = pickerId;
  pickerInput.setAttribute("aria-label", `${options.label} color picker`);
  pickerInput.title = `${options.label} color picker`;

  let lastValid = parseHexInput(options.initialValue) ?? "#000000";
  textInput.value = lastValid;
  pickerInput.value = toPickerValue(lastValid);

  const getErrorEl = (): HTMLElement | null => {
    return options.errorEl ?? document.getElementById(`${options.id}-error`);
  };

  const setError = (msg: string): void => {
    const err = getErrorEl();
    if (err) err.textContent = msg;
  };

  const clearError = (): void => {
    const err = getErrorEl();
    if (err) err.textContent = "";
  };

  textInput.addEventListener("input", () => {
    const parsed = parseHexInput(textInput.value);
    if (parsed !== null) {
      lastValid = parsed;
      pickerInput.value = toPickerValue(parsed);
      clearError();
      options.onValidChange?.(parsed);
    } else {
      setError(HEX_HINT);
      // Swatch and picker keep the last valid color
      pickerInput.value = toPickerValue(lastValid);
    }
  });

  pickerInput.addEventListener("input", () => {
    const canonical = pickerToCanonicalHex(pickerInput.value);
    textInput.value = canonical;
    lastValid = canonical;
    clearError();
    options.onValidChange?.(canonical);
  });

  const setValue = (hex: string): void => {
    const parsed = parseHexInput(hex);
    if (parsed !== null) {
      lastValid = parsed;
      textInput.value = parsed;
      pickerInput.value = toPickerValue(parsed);
      clearError();
    } else {
      textInput.value = hex;
      pickerInput.value = toPickerValue(lastValid);
    }
  };

  const getValue = (): string => lastValid;

  row.appendChild(textInput);
  row.appendChild(pickerInput);

  return {
    row,
    container: row,
    textInput,
    pickerInput,
    getValue,
    setValue,
    setError,
    clearError,
  };
}
