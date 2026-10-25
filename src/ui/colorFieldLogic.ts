/**
 * Pure functions for hex validation, normalization, and color-picker value conversion.
 */

/**
 * Strict 6-digit hex validation.
 * Accepts optional leading "#", case-insensitive, trims surrounding whitespace.
 * Rejects 3-digit shorthand, wrong lengths, non-hex characters.
 * Returns canonical "#RRGGBB" (uppercase) or null if invalid.
 */
export function parseHexInput(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let h = raw.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return "#" + h.toUpperCase();
}

/**
 * Converts a hex string into a 7-character lowercase string ("#rrggbb")
 * required by HTML5 <input type="color">.
 * If the input is invalid, returns the last valid / fallback value in picker format.
 */
export function toPickerValue(input: string, fallback: string = "#000000"): string {
  const parsed = parseHexInput(input);
  if (parsed !== null) {
    return parsed.toLowerCase();
  }
  const parsedFallback = parseHexInput(fallback);
  return (parsedFallback ?? "#000000").toLowerCase();
}

/**
 * Resolves user text input against the last valid canonical hex color.
 * If input is valid, returns the canonical uppercase hex and isValid = true.
 * If input is invalid, returns the last valid hex and isValid = false.
 */
export function resolveHexOrLastValid(
  input: string,
  lastValid: string,
): { hex: string; isValid: boolean } {
  const parsed = parseHexInput(input);
  if (parsed !== null) {
    return { hex: parsed, isValid: true };
  }
  const fallback = parseHexInput(lastValid) ?? "#000000";
  return { hex: fallback, isValid: false };
}

/**
 * Converts a picker value ("#rrggbb") into a canonical uppercase "#RRGGBB".
 */
export function pickerToCanonicalHex(pickerValue: string): string {
  const parsed = parseHexInput(pickerValue);
  return parsed ?? "#000000";
}
