/* Runde 12 (W23): Gemeinsame, ruhige Probe-Farben (Ref-Stil statt Neon).
 * DOM-Komponenten nutzen die CSS-Varianten (Theme-adaptiv), Canvas-Zeichencode
 * die Hex-Fallbacks. Gespeicherte Projekte mit den alten Neon-Farben werden
 * als „automatisch" behandelt und auf die neue Palette gemappt. */

/** Alte Neon-Farben (Runde ≤ 11) – gelten heute als „Auto". */
export const LEGACY_PROBE_COLORS = new Set([
  "#fbbf24", "#22d3ee", "#f59e0b", "#a78bfa", "#f472b6", "#94a3b8", "#4ade80",
]);

/** Probe-Art → CSS-Variable (für DOM/style). */
export const PROBE_TOKEN: Record<string, string> = {
  voltage: "var(--warn)",
  current: "var(--teal)",
  voltage_current: "var(--warn)",
  power: "var(--violet)",
  diff: "var(--err)",
  ref: "var(--ink-3)",
  digital: "var(--ok)",
};

/** Probe-Art → Token-Name (für css()-Auflösung im Canvas). */
export const PROBE_CSSVAR: Record<string, string> = {
  voltage: "--warn",
  current: "--teal",
  voltage_current: "--warn",
  power: "--violet",
  diff: "--err",
  ref: "--ink-3",
  digital: "--ok",
};

/** Probe-Art → Hex-Fallback (Canvas / <input type="color">). */
export const PROBE_HEX: Record<string, string> = {
  voltage: "#a87a12",
  current: "#2c7a7b",
  voltage_current: "#a87a12",
  power: "#7a4fa3",
  diff: "#b3372c",
  ref: "#6a7076",
  digital: "#2e7a4f",
};

/** Farbe für DOM-Kontexte (var()-fähig). */
export function probeCssColor(kind: string, color?: string | null): string {
  if (color && !LEGACY_PROBE_COLORS.has(color)) return color;
  return PROBE_TOKEN[kind] ?? PROBE_TOKEN.voltage;
}

/** Farbe als Hex (input type=color, SVG-Attribute ohne var-Unterstützung). */
export function probeHexColor(kind: string, color?: string | null): string {
  if (color && !LEGACY_PROBE_COLORS.has(color)) return color;
  return PROBE_HEX[kind] ?? PROBE_HEX.voltage;
}
