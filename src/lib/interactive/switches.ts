/* S5.26: Eine Wahrheit für alle Schalter-Interaktionen (Canvas-Klick, Taste,
   Inspektor-Live, Overlay-Anzeige). Mehrgeräte-Bauteile (SPDT/DPST/DPDT/Dreh/DIP)
   werden hier exakt so auf ihre Geräte-Controls aufgefächert, wie toDevices sie
   anlegt (`<instanz>_<suffix>`). Wer hier ändert, ändert überall konsistent. */
import type { Instance } from "../schematic/model";
import type { PartDef, SymbolPrim } from "../library/catalog";

export type ControlMap = Record<string, number>;

/**
 * Param-Änderung → Geräte-Controls. `key` ist der Param-Schlüssel ("closed",
 * "pos", "closedK"), `value` der neue Wert (0/1 bzw. Stellung). Gibt null für
 * Bauteile ohne Schalter-Fan-out (z. B. Poti — dort 1:1).
 */
export function switchControlTargets(
  partId: string, instId: string, key: string, value: number,
): ControlMap | null {
  const b = value > 0.5 ? 1 : 0;
  if (key === "closed") {
    switch (partId) {
      case "switch_spst":
      case "pushbutton":
        return { [instId]: b };
      case "switch_spdt":
        return { [instId]: b, [`${instId}_nc`]: 1 - b };
      case "switch_dpst":
        return { [instId]: b, [`${instId}_p2`]: b };
      case "switch_dpdt":
        return { [instId]: b, [`${instId}_p1nc`]: 1 - b, [`${instId}_p2`]: b, [`${instId}_p2nc`]: 1 - b };
      default:
        break;
    }
  }
  if (partId.startsWith("switch_rotary_") && key === "pos") {
    const n = Number(partId.split("_").pop()) || 0;
    if (!n) return null;
    const out: ControlMap = {};
    for (let k = 1; k <= n; k++) out[`${instId}_t${k}`] = Math.round(value) === k ? 1 : 0;
    return out;
  }
  if (partId.startsWith("switch_dip_")) {
    const m = /^closed(\d+)$/.exec(key);
    if (!m) return null;
    return { [`${instId}_sw${m[1]}`]: b };
  }
  return null;
}

/** Haupt-`closed` inkl. Legacy-Label-Fallback (exakt die alte Lesart). */
export function switchReadClosed(inst: Instance, controls: ControlMap): boolean {
  return (controls[inst.id] ?? controls[inst.label] ?? (inst.params.closed ? 1 : 0)) > 0.5;
}

/** Drehschalter-Stellung 1..N (aus den Geräte-Controls, sonst Param). */
export function switchReadPos(partId: string, inst: Instance, controls: ControlMap): number {
  const n = Number(partId.split("_").pop()) || 1;
  const paramPos = Math.min(n, Math.max(1, Math.round(Number(inst.params.pos ?? 1))));
  // Live-Controls (falls vorhanden) schlagen den Param als Ganzes — kein
  // Mischen pro Abgriff, sonst gewänne Stellung 1 immer (Param-Fallback).
  let anyControl = false;
  for (let k = 1; k <= n; k++) {
    if (controls[`${inst.id}_t${k}`] !== undefined) { anyControl = true; break; }
  }
  if (!anyControl) return paramPos;
  for (let k = 1; k <= n; k++) {
    if ((controls[`${inst.id}_t${k}`] ?? 0) > 0.5) return k;
  }
  return paramPos;
}

/** DIP-Hebel k (1-basiert). */
export function switchReadDip(inst: Instance, controls: ControlMap, k: number): boolean {
  return (controls[`${inst.id}_sw${k}`] ?? (inst.params[`closed${k}`] ? 1 : 0)) > 0.5;
}

export interface SwitchToggle {
  targets: ControlMap;
  /** Log-Text im Stil „geschlossen" / „Stellung 3" (ohne Label). */
  log: string;
}

/**
 * Ein Klick/Tastendruck auf einen Schalter (nur bei laufender Sim).
 * DIP ohne Hebel-Index (Taste) schaltet alle Hebel gemeinsam.
 */
export function switchToggle(
  partId: string, inst: Instance, controls: ControlMap, dipIndex?: number,
): SwitchToggle | null {
  if (
    partId === "switch_spst" || partId === "pushbutton"
    || partId === "switch_spdt" || partId === "switch_dpst" || partId === "switch_dpdt"
  ) {
    const next = switchReadClosed(inst, controls) ? 0 : 1;
    const targets = switchControlTargets(partId, inst.id, "closed", next)!;
    const changeover = partId === "switch_spdt" || partId === "switch_dpdt";
    const log = changeover
      ? (next ? "auf NO umgelegt" : "auf NC umgelegt")
      : (next ? "geschlossen" : "geöffnet");
    return { targets, log };
  }
  if (partId.startsWith("switch_rotary_")) {
    const n = Number(partId.split("_").pop()) || 0;
    if (!n) return null;
    const next = (switchReadPos(partId, inst, controls) % n) + 1;
    return { targets: switchControlTargets(partId, inst.id, "pos", next)!, log: `Stellung ${next}` };
  }
  if (partId.startsWith("switch_dip_")) {
    const n = Number(partId.split("_").pop()) || 0;
    if (!n) return null;
    if (!dipIndex) {
      // Taste ohne Position: alle Hebel gemeinsam (an — außer alle-an, dann alle-aus).
      const allClosed = Array.from({ length: n }, (_, i) => switchReadDip(inst, controls, i + 1)).every(Boolean);
      const next = allClosed ? 0 : 1;
      const targets: ControlMap = {};
      for (let k = 1; k <= n; k++) targets[`${inst.id}_sw${k}`] = next;
      return { targets, log: next ? "alle geschlossen" : "alle geöffnet" };
    }
    const next = switchReadDip(inst, controls, dipIndex) ? 0 : 1;
    return {
      targets: switchControlTargets(partId, inst.id, `closed${dipIndex}`, next)!,
      log: `Schalter ${dipIndex} ${next ? "geschlossen" : "geöffnet"}`,
    };
  }
  return null;
}

/* ------------------------- Vorschau-Hebel (Bibliothek) ------------------------- */

/**
 * S5.29: Hebel/Zeiger für die Bibliotheks-Vorschau in Ruhe-Stellung (offen
 * bzw. NC, Dreh auf 1, DIP alle offen). Die Vorschau zeichnet nur
 * Katalog-Statik — ohne diese Prims sähen Schalter wie bloße
 * Leitungsstummel aus. Geometrie = Overlay-Ruhelage aus render.ts
 * (ohne gestrichelte Wirkverbindungen — die Vorschau kennt keinen Strich).
 * Für Nicht-Schalter leer.
 */
export function switchPreviewPrims(part: PartDef): SymbolPrim[] {
  const id = part.id;
  const line = (pts: number[]): SymbolPrim => ({ t: "line", pts });
  const ring = (x: number, y: number, r: number): SymbolPrim => ({ t: "circle", x, y, r, fill: false });
  if (id === "switch_spst") return [line([-14, 0, 12, -12])];
  if (id === "pushbutton") return [line([-14, 0, 12, -12]), line([12, -12, 12, -17]), ring(12, -20, 3)];
  if (id === "switch_spdt") return [line([-14, 0, 14, 20])];
  if (id === "switch_dpst") return [line([-14, -20, 12, -32]), line([-14, 20, 12, 8])];
  if (id === "switch_dpdt") return [line([-14, -20, 14, -10]), line([-14, 20, 14, 10])];
  if (id.startsWith("switch_rotary_")) {
    const tap1 = part.pins[1]; // pins[0] = COM, danach Abgriffe 1..N
    if (!tap1) return [];
    return [line([-14, 0, tap1.x - 14, tap1.y])];
  }
  if (id.startsWith("switch_dip_")) {
    return part.pins
      .filter((p) => p.x < 0)
      .sort((a, b) => a.y - b.y)
      .map((row) => line([-8, row.y, 6, row.y - 5]));
  }
  if (id === "relay" || id.startsWith("relay_")) {
    if (id.includes("dpdt")) return [line([10, -20, 26, -10]), line([10, 20, 26, 10])];
    if (id.includes("spst")) return [line([10, 20, 26, -14])];
    return [line([10, 20, 26, 0])]; // Wechsler-Ruhelage: an NC
  }
  return [];
}

/* ------------------------- Poti-Schieberegler ------------------------- */

/**
 * S5.26: Großer Schieberegler direkt neben dem Poti (Ersatz für das unsichtbare
 * ±5-%-Klicken). Alle Maße in lokalen Symbol-Koordinaten; Rotation/Spiegelung
 * löst der Hit-Test per Invers-Transformation auf.
 */
export const POT_SLIDER = {
  /** Spur-Mitte (rechts neben dem Symbol, das bis x=30 reicht). */
  x: 43,
  /** Spur-Ober/Unterkante. */
  yTop: -26,
  yBot: 26,
  /** Knopf-Ausdehnung. */
  knobW: 14,
  knobH: 9,
  /** Treffer-Toleranz: halbe Breite um die Spurmitte + Längs-Puffer. */
  hitHalfW: 11,
  hitPad: 5,
} as const;

export function potSliderYFromPos(pos: number): number {
  const c = Math.min(1, Math.max(0, pos));
  return POT_SLIDER.yBot - c * (POT_SLIDER.yBot - POT_SLIDER.yTop);
}

export function potSliderPosFromLocalY(ly: number): number {
  const raw = (POT_SLIDER.yBot - ly) / (POT_SLIDER.yBot - POT_SLIDER.yTop);
  return Math.min(0.99, Math.max(0.01, raw));
}
