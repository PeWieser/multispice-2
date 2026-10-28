/**
 * S5.3: Tastatur-Definitionen — reine Funktionen (in sprint5test prüfbar).
 */

/** Ebenen der Esc-Kette (Priorität von oben nach unten). */
export type EscapeLevels = {
  /** Kontextmenü/Overlay offen */
  overlay: boolean;
  /** Messleitung aufgenommen */
  lead: boolean;
  /** Auswahl vorhanden */
  selection: boolean;
  /** Werkzeug aktiv (≠ Auswahl), Platzieren läuft oder Entwurf/Geste offen */
  tool: boolean;
};

export type EscapeAction = "close-overlay" | "disarm-lead" | "clear-selection" | "reset-tool" | "none";

/**
 * Definierte Esc-Kette: Overlay → Messleitung → Auswahl → Werkzeug.
 * Jeder Tastendruck löst genau die oberste aktive Ebene (W66-Nuke abgelöst).
 */
export function resolveEscape(s: EscapeLevels): EscapeAction {
  if (s.overlay) return "close-overlay";
  if (s.lead) return "disarm-lead";
  if (s.selection) return "clear-selection";
  if (s.tool) return "reset-tool";
  return "none";
}

/** Pfeiltasten beim Platzieren: ein Raster, mit ⇧ das 5-fache. */
export const PLACE_ARROW_SHIFT_FACTOR = 5;
