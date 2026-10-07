/**
 * Strict hex-field validation for the plugin UI.
 * Accepts exactly 6 hex digits with an optional leading "#".
 * The 3-digit shorthand is rejected (type the full 6 digits).
 * Returns the canonical "#RRGGBB" form, or null when invalid.
 */
export function parseHexField(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let h = raw.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return "#" + h.toUpperCase();
}

/** True when the field holds exactly 6 hex digits (optional "#"). */
export function isValidHexField(raw: string): boolean {
  return parseHexField(raw) !== null;
}
