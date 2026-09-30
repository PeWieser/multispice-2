/**
 * Runde 25 (W62/W64): Netz zeichnen wie in Multisim.
 *
 * Zwei Dinge stecken hier drin, beide ohne DOM und damit testbar:
 *  · `normalizeDocGeometry` – Bauteile aufs Raster, Leitungsenden auf Pins,
 *    rechte Winkel. Damit verschwinden „leicht verschobene" Bauteile, schräge
 *    Leiterbahnen und Pins, die am Anfang nicht verbunden sind.
 *  · `findNetTarget` / `buildNetPath` – der Anschluss-Magnet: beim Zeichnen
 *    wird der beste Anschlusspunkt (Pin → Verbindungspunkt → Leitung) gesucht
 *    und der Leitungsverlauf exakt dorthin geführt.
 */
import { PART_MAP } from "@/lib/library/catalog";
import {
  GRID,
  type SchematicDoc,
  cleanWirePoints,
  pinPosition,
  snapWiresToPins,
  straightenWirePoints,
  pointOnSegment,
} from "@/lib/schematic/model";

export interface Pt {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/* W62 · Geometrie in Ordnung bringen                                  */
/* ------------------------------------------------------------------ */

export interface NormalizeReport {
  /** Bauteile, die aufs Raster gerückt wurden. */
  instances: number;
  /** Leitungsenden, die auf einen Pin gerastet wurden. */
  ends: number;
  /** Leitungen, deren Verlauf rechtwinklig/auf Raster gebracht wurde. */
  wires: number;
}

/**
 * W62: Alles, was der Editor zum Zeichnen braucht, in eine saubere Form
 * bringen: Bauteile aufs Raster (Pins liegen dann garantiert auf dem Raster),
 * Leitungsenden auf die Pins, Segmente rechtwinklig, doppelte Punkte weg.
 *
 * Wird auf Beispiele, Importe und über „Leitungen prüfen & reparieren" auf
 * gewachsene Pläne angewendet. Ohne diesen Schritt bleiben Bauteile „leicht
 * verschoben" stehen und Leitungen laufen schräg neben dem Pin.
 */
export function normalizeDocGeometry(
  doc: SchematicDoc,
  opts: { grid?: number; pinTol?: number } = {},
): NormalizeReport {
  const grid = opts.grid ?? GRID;
  const pinTol = opts.pinTol ?? 15;
  let instances = 0;
  for (const inst of doc.instances) {
    const gx = Math.round(inst.x / grid) * grid;
    const gy = Math.round(inst.y / grid) * grid;
    if (gx !== inst.x || gy !== inst.y) {
      inst.x = gx;
      inst.y = gy;
      instances++;
    }
  }
  const snap = snapWiresToPins(doc, pinTol);
  let wires = 0;
  for (const w of doc.wires) {
    const before = w.points;
    const after = straightenWirePoints(before, grid);
    const changed =
      after.length !== before.length ||
      after.some((p, i) => p.x !== before[i].x || p.y !== before[i].y);
    if (changed) wires++;
    w.points = after;
  }
  return { instances, ends: snap.moved, wires };
}

/* ------------------------------------------------------------------ */
/* W64 · Anschluss-Magnet                                              */
/* ------------------------------------------------------------------ */

export type NetTargetKind = "pin" | "junction" | "wire";

export interface NetTarget {
  kind: NetTargetKind;
  /** Exakter Anschlusspunkt, auf den die Leitung geführt wird. */
  x: number;
  y: number;
  /** Bei `kind === "wire"`: die getroffene Leitung. */
  wireId?: string;
  /** Kurztext für die Anzeige während des Zeichnens. */
  label: string;
}

/**
 * W64: Bester Anschlusspunkt in der Nähe des Zeigers. Reihenfolge wie in
 * Multisim: Pin vor Verbindungspunkt vor Leitung (Fußpunkt). Der Radius wird in
 * Weltkoordinaten übergeben und von der Oberfläche zoom-unabhängig berechnet.
 */
export function findNetTarget(doc: SchematicDoc, p: Pt, radius: number): NetTarget | null {
  let best: NetTarget | null = null;
  let bestD = radius;

  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < part.pins.length; idx++) {
      const q = pinPosition(inst, idx);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: "pin", x: q.x, y: q.y, label: `${inst.label} · ${part.pins[idx]?.name ?? `Pin ${idx + 1}`}` };
      }
    }
  }
  if (best) return best;

  bestD = radius;
  for (const j of doc.junctions ?? []) {
    const d = Math.hypot(j.x - p.x, j.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = { kind: "junction", x: j.x, y: j.y, label: "Verbindungspunkt" };
    }
  }
  if (best) return best;

  bestD = radius;
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const foot = footOfPoint(a, b, p);
      const d = Math.hypot(foot.x - p.x, foot.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: "wire", x: foot.x, y: foot.y, wireId: w.id, label: "Leitung" };
      }
    }
  }
  return best;
}

function footOfPoint(a: Pt, b: Pt, p: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/* ------------------------------------------------------------------ */
/* W63 · Leitungsverlauf                                               */
/* ------------------------------------------------------------------ */

/**
 * W63: Verlauf eines Netzes aus Anker, gesetzten Ecken und Ziel bauen.
 * Der letzte Weg zum Ziel bekommt einen rechtwinkligen Knick (längere Achse
 * zuerst), damit niemals ein schräges Segment entsteht.
 */
export function buildNetPath(anchor: Pt, corners: Pt[], target: Pt): Pt[] {
  const pts: Pt[] = [{ x: anchor.x, y: anchor.y }, ...corners.map((c) => ({ x: c.x, y: c.y }))];
  const last = pts[pts.length - 1];
  if (last.x !== target.x && last.y !== target.y) {
    const horizontalFirst = Math.abs(target.x - last.x) >= Math.abs(target.y - last.y);
    pts.push(horizontalFirst ? { x: target.x, y: last.y } : { x: last.x, y: target.y });
  }
  pts.push({ x: target.x, y: target.y });
  return cleanWirePoints(pts);
}

/** W63: Vorschau (Anker → gesetzte Ecken → Zeiger) mit mitlaufendem Knick. */
export function previewNetPath(anchor: Pt, corners: Pt[], cursor: Pt): Pt[] {
  return buildNetPath(anchor, corners, cursor);
}

/**
 * W64: Liegt der Punkt auf einer fremden Leitung, muss dort ein
 * Verbindungspunkt hin (W61: nur mit Punkt ist die Kreuzung leitend).
 */
export function needsJunction(doc: SchematicDoc, p: Pt, excludeWireId?: string): boolean {
  for (const w of doc.wires) {
    if (excludeWireId && w.id === excludeWireId) continue;
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      if (pointOnSegment(p.x, p.y, a.x, a.y, b.x, b.y)) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* W63 · Klickfolge im Netzmodus                                       */
/* ------------------------------------------------------------------ */

export interface NetDraft {
  /** Anschlusspunkt, an dem das Netz beginnt (Pin, Leitung, Verbindungspunkt oder freie Stelle). */
  anchor: Pt;
  /** Bereits gesetzte Eckpunkte. */
  corners: Pt[];
}

export type NetClickResult =
  | { kind: "start"; draft: NetDraft }
  | { kind: "corner"; draft: NetDraft }
  | { kind: "finish"; points: Pt[]; target: NetTarget };

/**
 * W63: Ein Klick im Netzmodus – die komplette Regel an einer Stelle, damit sie
 * ohne Oberfläche geprüft werden kann.
 *
 *  · ohne laufendes Netz: Klick auf Pin (oder mit `allowStartOnEmpty` ins Leere)
 *    startet das Netz,
 *  · mit laufendem Netz: Klick auf Pin/Verbindungspunkt/Leitung schließt an
 *    (auch in der Mitte einer Leitung – der Fußpunkt wird exakt getroffen),
 *    jeder andere Klick setzt einen Eckpunkt.
 */
export function netClick(
  doc: SchematicDoc,
  draft: NetDraft | null,
  world: Pt,
  snapPt: Pt,
  opts: { magnet: number; allowStartOnEmpty: boolean; startOnWire?: boolean },
): NetClickResult | null {
  if (!draft) {
    const target = findNetTarget(doc, world, opts.magnet);
    // Im Auswahlmodus öffnet nur ein **Pin** den Netzmodus. Sonst würde ein
    // Klick auf einen Leitungsgriff (W54) das Zeichnen starten und das
    // Verschieben von Leitungspunkten wäre kaputt. Mit dem Leitungswerkzeug
    // (`startOnWire`) darf ein Netz auch auf einer bestehenden Leitung beginnen.
    const startTarget = target && (target.kind === "pin" || opts.startOnWire) ? target : null;
    if (startTarget) return { kind: "start", draft: { anchor: { x: startTarget.x, y: startTarget.y }, corners: [] } };
    if (opts.allowStartOnEmpty) return { kind: "start", draft: { anchor: { x: snapPt.x, y: snapPt.y }, corners: [] } };
    return null;
  }
  const ref = draft.corners.length ? draft.corners[draft.corners.length - 1] : draft.anchor;
  const target = findNetTarget(doc, world, opts.magnet);
  if (target && Math.hypot(target.x - ref.x, target.y - ref.y) > 0.01) {
    return { kind: "finish", points: buildNetPath(draft.anchor, draft.corners, { x: target.x, y: target.y }), target };
  }
  const same =
    Math.abs(ref.x - snapPt.x) < 0.01 && Math.abs(ref.y - snapPt.y) < 0.01;
  if (same) return { kind: "corner", draft };
  return { kind: "corner", draft: { anchor: draft.anchor, corners: [...draft.corners, { x: snapPt.x, y: snapPt.y }] } };
}
