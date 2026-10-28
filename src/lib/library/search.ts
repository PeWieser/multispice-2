/**
 * S5.17: Bibliothekssuche mit Wert — „r 10k" findet den Widerstand UND setzt
 * 10 kΩ als Platzier-Vorbelegung (das hielt der Platzhalter schon immer vor).
 *
 * Regel (dokumentiert): Der Wert steht als letztes Token UND trägt eine
 * Einheit (Buchstabe am Ende oder Infix wie `4k7`). Reine Zahlen (`555`,
 * `10`) bleiben Suchbegriffe — sonst würde „555" den Timer als Wert 555
 * missverstehen. Unpassende Werte (≤ 0, NaN) werden ignoriert.
 */
import { parseSpiceValue } from "@/lib/schematic/importers";
import type { PartDef } from "./catalog";

const VALUE_TOKEN = /^(\d[\d.,]*[a-zµμΩ]+|\d+[munpkr]\d+)$/i;

export function splitValueQuery(query: string): { terms: string[]; value?: number } {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { terms: [] };
  const last = tokens[tokens.length - 1];
  if (VALUE_TOKEN.test(last)) {
    const v = parseSpiceValue(last);
    if (Number.isFinite(v) && v > 0) return { terms: tokens.slice(0, -1), value: v };
  }
  return { terms: tokens };
}

/** Hauptwert-Parameter — nur wenn der ERSTE Param eine Zahl ist (r/c/l/…).
 * Schalter & Co. (bool an erster Stelle) ignorieren Such-Werte. */
export function mainValueParamKey(part: PartDef): string | null {
  const first = part.params[0];
  return first?.type === "number" ? first.key : null;
}
