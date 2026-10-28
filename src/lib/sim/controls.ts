/**
 * S5.14: Live-Steuerung — Tastenbelegung für Schalter/Taster/Poti.
 *
 * Reine Helfer (node-testbar); das Canvas-Handling (Keydown/Maus) nutzt sie.
 * Regel: Eine belegte Taste gewinnt bei laufender Simulation gegen
 * Editor-Kürzel; bei gestoppter Simulation gilt der Editor.
 * Reserviert (nicht belegbar): Leertaste (Start/Stopp) und „?" (Hilfe).
 */

/** Normalisiert eine Tastenbelegung auf einen Kleinbuchstaben bzw. null. */
export function normalizeControlKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t.length !== 1) return null;
  if (t === "?") return null; // Hilfe-Overlay
  return t;
}

/**
 * Editor-Einzeltasten (lib/shortcuts): Wer eine davon belegt, überstimmt das
 * Editor-Kürzel während der laufenden Simulation. Dient nur dem Warnhinweis
 * im Inspector — technisch gewinnt immer die belegte Taste.
 */
export const EDITOR_SINGLE_KEYS = [
  "w", "e", "j", "l", "t", "h", "v", "a", "r", "m", "f", "g", "?",
] as const;

export function isEditorSingleKey(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const t = String(raw).trim().toLowerCase();
  return (EDITOR_SINGLE_KEYS as readonly string[]).includes(t);
}

export type KeyedInstance = {
  id: string;
  params: Record<string, number | string | boolean | undefined>;
};

/** Liefert die Instanz-IDs, deren params.key auf das Tastatur-Event passt. */
export function resolveBoundControls(
  instances: KeyedInstance[],
  key: string,
): string[] {
  const want = normalizeControlKey(key);
  if (!want) return [];
  return instances
    .filter((i) => normalizeControlKey(i.params.key) === want)
    .map((i) => i.id);
}
