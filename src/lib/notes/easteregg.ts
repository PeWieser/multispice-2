import type { SchematicDoc } from "../schematic/model";

/* S5.30: Spannungsteiler-Easter-Egg. Ein Spannungsteiler braucht ZWEI
   Widerstände — wer Quelle + genau EINEN Widerstand aufbaut, dazu eine
   Notiz „Spannungsteiler" schreibt und die Simulation startet, bekommt auf
   der Notiz (nur zur Laufzeit, der Text bleibt unangetastet) die Quittung. */

/** Stempel-Spruch (wörtlich, Kleinschreibung inklusive). */
export const DIVIDER_JOKE = "r u serious?";

/** Stichwort in der Notiz (Groß-/Kleinschreibung egal). */
const DIVIDER_WORD = "spannungsteiler";

/** Einfache Zweipol-Spannungsquellen (keine Stromquellen, kein Funktionsgen). */
const VOLTAGE_SOURCES = new Set(["vdc", "vac", "vpulse"]);

/**
 * IDs aller Notizen, die gerade den Stempel tragen: genau ein schlichter
 * Widerstand + mindestens eine Spannungsquelle + Stichwort in der Notiz.
 */
export function dividerJokeNoteIds(doc: SchematicDoc): string[] {
  let sources = 0;
  let resistors = 0;
  for (const i of doc.instances) {
    if (i.partId === "resistor") resistors++;
    else if (VOLTAGE_SOURCES.has(i.partId)) sources++;
  }
  if (sources < 1 || resistors !== 1) return [];
  return doc.notes
    .filter((n) => n.text.toLowerCase().includes(DIVIDER_WORD))
    .map((n) => n.id);
}
