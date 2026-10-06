/**
 * Schematic document model: instances, wires, net extraction (union-find),
 * SPICE netlist generation and import.
 */

import { PART_MAP, PartDef, PartInstanceLike, PinElectrical, formatValue, partPins, partSymbol, pinElectrical, splitterWidth } from "@/lib/library/catalog";
import { Device, Netlist } from "@/lib/sim/engine";
import { POT_SLIDER } from "@/lib/interactive/switches";

export const GRID = 10;

export type Rotation = 0 | 90 | 180 | 270;

export interface Instance {
  id: string;
  partId: string;
  x: number;
  y: number;
  rot: Rotation;
  mirror?: boolean;
  label: string;
  params: Record<string, number | string | boolean>;
  /** MCU source code / free text */
  text?: string;
  fault?: "none" | "open" | "short" | "leakage";
}

export interface Wire {
  id: string;
  points: Array<{ x: number; y: number }>;
  color?: string;
  isBus?: boolean;
  busName?: string;
  busWidth?: number;
}

export interface NetLabel {
  id: string;
  x: number;
  y: number;
  name: string;
}

/**
 * Runde 24 (W61): Verbindungspunkt (Multisim-Verhalten).
 * Zwei Leitungen, die sich nur kreuzen, sind elektrisch NICHT verbunden; eine
 * Verbindung entsteht nur an echten Anschlussstellen (Leitungsende auf einer
 * Leitung, Pin, Netzlabel) oder an einem ausdrücklich gesetzten
 * Verbindungspunkt. Genau so verhält sich Multisim, und genau das ist der
 * Unterschied zwischen „sieht aus wie verbunden" und „ist verbunden".
 */
export interface Junction {
  id: string;
  x: number;
  y: number;
}

export interface TextNote {
  id: string;
  x: number;
  y: number;
  text: string;
  size?: number;
  /** S5.28: Blattgröße s/m/l (Standard m = bisheriger Zettel). */
  card?: "s" | "m" | "l";
}

export type ProbeKind = "voltage" | "current" | "power" | "diff" | "ref" | "digital" | "voltage_current";

export interface ProbeShow {
  vdc?: boolean;
  vrms?: boolean;
  vpp?: boolean;
  vavg?: boolean;
  freq?: boolean;
  idc?: boolean;
  irms?: boolean;
  ipp?: boolean;
  power?: boolean;
}

export interface MeasurementProbe {
  id: string;
  kind: ProbeKind;
  x: number;
  y: number;
  net?: string;
  ref?: string; // net name or REF probe id
  color?: string;
  name?: string;
  direction?: number; // 0 = forward, 1 = reverse for current
  rotation?: number;
  periodic?: boolean;
  show?: ProbeShow;
  thresholds?: {
    low?: number;
    high?: number;
  };
  // For diff probes, second point
  x2?: number;
  y2?: number;
  // V2: Leader from anchor (on wire) to body (offset)
  anchorX?: number;
  anchorY?: number;
  offsetX?: number;
  offsetY?: number;
  leader?: "arrow" | "line" | "magnifier";
}

export interface SchematicDoc {
  id: string;
  name: string;
  instances: Instance[];
  wires: Wire[];
  labels: NetLabel[];
  notes: TextNote[];
  probes: MeasurementProbe[];
  /** W61: ausdrücklich gesetzte Verbindungspunkte (Kreuzungen verbinden). */
  junctions?: Junction[];
}

// Der allererste Entwurf bekommt eine feste ID, damit Server-HTML (statischer
// Export) und Client-Hydration übereinstimmen. Alle weiteren sind zufällig.
let firstDoc = true;

export function emptyDoc(name = "Neue Schaltung"): SchematicDoc {
  const id = firstDoc ? "sch_initial" : "sch_" + Math.random().toString(36).slice(2, 9);
  firstDoc = false;
  return { id, name, instances: [], wires: [], labels: [], notes: [], probes: [], junctions: [] };
}

/* ----------------------------- geometry ----------------------------- */

export function rotatePoint(x: number, y: number, rot: Rotation, mirror = false): { x: number; y: number } {
  const mx = mirror ? -x : x;
  switch (rot) {
    case 90:
      return { x: -y, y: mx };
    case 180:
      return { x: -mx, y: -y };
    case 270:
      return { x: y, y: -mx };
    default:
      return { x: mx, y };
  }
}

export function pinPosition(inst: Instance, pinIndex: number): { x: number; y: number } {
  const part = PART_MAP[inst.partId];
  const pin = part ? partPins(part, inst.params)[pinIndex] : undefined;
  if (!pin) return { x: inst.x, y: inst.y };
  const r = rotatePoint(pin.x, pin.y, inst.rot, inst.mirror);
  return { x: inst.x + r.x, y: inst.y + r.y };
}

/* --------------------- Leitungshygiene (Runde 23) --------------------- */

type WPt = { x: number; y: number };
const samePt = (a: WPt, b: WPt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** Punkte entdoppeln und Zwischenpunkte in gerader Linie entfernen. */
export function cleanWirePoints(pts: WPt[]): WPt[] {
  const out: WPt[] = [];
  for (const p of pts) if (!out.length || !samePt(out[out.length - 1], p)) out.push({ x: p.x, y: p.y });
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

/**
 * W49: Ein Leitungsende exakt auf einen Zielpunkt (Pin) setzen und die
 * Verbindung dabei orthogonal halten – vorhandener Nachbarpunkt wird
 * mitgezogen, sonst wird ein Knick eingefügt.
 */
export function attachWireEnd(pts: WPt[], idx: number, target: WPt): void {
  if (pts.length < 2) return;
  pts[idx] = { x: target.x, y: target.y };
  const inner = idx === 0 ? 1 : pts.length - 2;
  const a = pts[inner];
  if (a.x === target.x || a.y === target.y) return; // schon achsenparallel
  if (pts.length === 2) {
    // Knick zwischen beide Punkte (Position 1, egal welches Ende bewegt wurde)
    pts.splice(1, 0, Math.abs(a.x - target.x) <= Math.abs(a.y - target.y) ? { x: target.x, y: a.y } : { x: a.x, y: target.y });
    return;
  }
  const other = idx === 0 ? pts[2] : pts[pts.length - 3];
  const moveX = { x: target.x, y: a.y };
  const moveY = { x: a.x, y: target.y };
  const okX = other ? moveX.x === other.x || moveX.y === other.y : false;
  const okY = other ? moveY.x === other.x || moveY.y === other.y : false;
  if (okX && !okY) { pts[inner] = moveX; return; }
  if (okY && !okX) { pts[inner] = moveY; return; }
  if (okX && okY) {
    pts[inner] = Math.abs(target.x - a.x) <= Math.abs(target.y - a.y) ? moveX : moveY;
    return;
  }
  // Nachbar kann nicht mitwandern → Knick direkt am bewegten Ende einfügen
  pts.splice(idx === 0 ? 1 : pts.length - 1, 0, Math.abs(a.x - target.x) <= Math.abs(a.y - target.y) ? { x: target.x, y: a.y } : { x: a.x, y: target.y });
}

/**
 * W55: Leitung begradigen – Stützpunkte aufs Raster, diagonale Segmente in
 * rechte Winkel auflösen, Zwischenpunkte entfernen. Anschließend rastet
 * `snapWiresToPins` die Enden wieder auf die Pins.
 */
/**
 * W55/W70: Leitung begradigen – Stützpunkte aufs Raster und rechte Winkel.
 *
 * W70: Ein zusätzlich gesetzter Eckpunkt („aus einer geraden Leitung eine mit
 * Ecke machen") verschwindet beim Begradigen wieder, wenn es die Geometrie
 * zulässt: liegen Anfang und Ende auf einer Achse, wird die Leitung **eine
 * Gerade**; sonst bleibt genau **ein** Knick. Vorher blieb jeder Stützpunkt als
 * Zacke stehen.
 */
/**
 * W98: Bringt alle Punkte einer Leitung aufs Raster und macht schräge Segmente
 * rechtwinklig, OHNE bestehende orthogonale Umwege/Ecken zu löschen oder L-Knicke
 * umzudrehen (damit Umleitungen um Bauteil-Pins in Beispielen und Projekten
 * niemals Nachbar-Pins kurzschließen!).
 */
export function orthogonalizeWirePoints(pts: WPt[], grid = GRID, keepPoint?: (p: WPt) => boolean): WPt[] {
  const snap = (v: number) => Math.round(v / grid) * grid;
  let out = cleanProtected(pts.map((p) => ({ x: snap(p.x), y: snap(p.y) })), keepPoint);
  if (out.length < 2) return out;
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (a.x === b.x || a.y === b.y) continue;
    const prev = out[i - 1];
    const bend = prev && prev.x === a.x ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    out.splice(i + 1, 0, bend);
    out = cleanProtected(out, keepPoint);
  }
  return out;
}

export function straightenWirePoints(pts: WPt[], grid = GRID, keepPoint?: (p: WPt) => boolean): WPt[] {
  const snap = (v: number) => Math.round(v / grid) * grid;
  let out = cleanProtected(pts.map((p) => ({ x: snap(p.x), y: snap(p.y) })), keepPoint);
  if (out.length < 2) return out;
  // Bei mehr als zwei Punkten reduzieren: gleiche Achse → eine Gerade, sonst ein
  // einziger Knick (längere Achse zuerst). Punkte, an denen eine andere Leitung,
  // ein Pin oder ein Verbindungspunkt hängt, bleiben erhalten (`keepPoint`) –
  // sonst würde das Begradigen einen T-Kontakt unterbrechen.
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    const inner = out.slice(1, -1).filter((p) => keepPoint?.(p));
    if (!inner.length) {
      if (a.x === b.x || a.y === b.y) out = [{ ...a }, { ...b }];
      else {
        const bend = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
        out = [{ ...a }, bend, { ...b }];
      }
    } else {
      out = cleanProtected([{ ...a }, ...inner, { ...b }], keepPoint);
    }
  }
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (a.x === b.x || a.y === b.y) continue;
    const prev = out[i - 1];
    const bend = prev && prev.x === a.x ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    out.splice(i + 1, 0, bend);
    out = cleanProtected(out, keepPoint);
  }
  return out;
}

/** W70: wie `cleanWirePoints`, aber geschützte Punkte (T-Kontakte) bleiben. */
function cleanProtected(pts: WPt[], keepPoint?: (p: WPt) => boolean): WPt[] {
  if (!keepPoint) return cleanWirePoints(pts);
  const out: WPt[] = [];
  for (const p of pts) if (!out.length || !samePt(out[out.length - 1], p)) out.push({ x: p.x, y: p.y });
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (collinear && !keepPoint(b)) out.splice(i, 1);
  }
  return out;
}

export interface SnapReport {
  /** Anzahl der Enden, die auf einen Pin gerastet wurden. */
  moved: number;
  /** Leitungen, die dadurch geometrisch verändert wurden. */
  wires: number;
}

/**
 * W49: Alle Leitungsenden, die ≤ tol neben einem Pin liegen, exakt auf den
 * Pin setzen (Importe und Beispiele kamen mit gerundeten Koordinaten an und
 * waren dadurch elektrisch getrennt). Danach bleiben nur echte offene Enden.
 */
export function snapWiresToPins(doc: SchematicDoc, tol = 15): SnapReport {
  const pinPts: Array<{ x: number; y: number }> = [];
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let i = 0; i < partPins(part, inst.params).length; i++) pinPts.push(pinPosition(inst, i));
  }
  const nearestPin = (p: WPt) => {
    let best: WPt | null = null;
    let bestD = tol;
    for (const q of pinPts) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  };
  const onPin = (p: WPt) => pinPts.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01);

  let moved = 0;
  const changedWires = new Set<string>();
  for (const w of doc.wires) {
    if (w.points.length < 2) continue;
    for (const idx of [0, w.points.length - 1]) {
      const end = w.points[idx];
      if (onPin(end)) continue;
      const pin = nearestPin(end);
      if (!pin) continue;
      attachWireEnd(w.points, idx, pin);
      moved++;
      changedWires.add(w.id);
    }
    if (changedWires.has(w.id)) w.points = cleanWirePoints(w.points);
  }
  return { moved, wires: changedWires.size };
}

export function instanceBounds(inst: Instance): { x: number; y: number; w: number; h: number } {
  const part = PART_MAP[inst.partId];
  if (!part) return { x: inst.x - 20, y: inst.y - 20, w: 40, h: 40 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consider = (px: number, py: number) => {
    const r = rotatePoint(px, py, inst.rot, inst.mirror);
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y);
  };
  for (const prim of partSymbol(part, inst.params)) {
    if (prim.t === "line") for (let i = 0; i < prim.pts.length; i += 2) consider(prim.pts[i], prim.pts[i + 1]);
    else if (prim.t === "rect") {
      consider(prim.x, prim.y);
      consider(prim.x + prim.w, prim.y + prim.h);
    } else if (prim.t === "circle" || prim.t === "arc") {
      consider(prim.x - prim.r, prim.y - prim.r);
      consider(prim.x + prim.r, prim.y + prim.r);
    } else consider(prim.x, prim.y);
  }
  for (const pin of partPins(part, inst.params)) consider(pin.x, pin.y);
  // S5.26: Der Poti-Schieber liegt neben dem Symbol und gehört zur Greifzone
  // (Selektion, Routing-Hindernis, Fit-View) — Rotation löst consider auf.
  if (part.interactive === "pot") {
    consider(POT_SLIDER.x - POT_SLIDER.knobW / 2, POT_SLIDER.yTop);
    consider(POT_SLIDER.x + POT_SLIDER.knobW / 2, POT_SLIDER.yBot);
  }
  if (!Number.isFinite(minX)) return { x: inst.x - 20, y: inst.y - 20, w: 40, h: 40 };
  return { x: inst.x + minX, y: inst.y + minY, w: maxX - minX, h: maxY - minY };
}

/* ----------------------------- nets ----------------------------- */

class UnionFind {
  parent = new Map<string, string>();
  find(a: string): string {
    let r = this.parent.get(a);
    if (r === undefined) {
      this.parent.set(a, a);
      return a;
    }
    if (r !== a) {
      r = this.find(r);
      this.parent.set(a, r);
    }
    return r;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const key = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

export function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  if (ax === bx && ay === by) return px === ax && py === ay;
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 1) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  return dot <= len;
}

export interface NetInfo {
  name: string;
  points: Array<{ x: number; y: number }>;
  pins: Array<{ instanceId: string; pinIndex: number; pinName: string }>;
}

export interface NetlistBuildResult {
  netlist: Netlist;
  nets: NetInfo[];
  /** map "instanceId:pinIndex" -> net name */
  pinNets: Record<string, string>;
  /** map point key -> net name */
  pointNets: Record<string, string>;
  errors: string[];
  warnings: string[];
  /** W51: Leitungsenden ohne Anschluss (Pin, Label, anderes Ende, Segment). */
  openEnds: Array<{ x: number; y: number }>;
  /** W53: Punkte, an denen ≥ 3 Anschlüsse zusammenkommen (Verbindungspunkte). */
  junctions: Array<{ x: number; y: number }>;
}

/**
 * S3.3: Re-Annotate — nummeriert alle Schema-Labels (`R5`, `C12`, …) pro
 * Bauteil-Präfix in Leserichtung (oben→unten, links→rechts) neu ab 1.
 * Freie Namen (`R_SENSE`) bleiben unangetastet. Mutiert das Draft-Dokument.
 */
export function reannotateLabels(doc: SchematicDoc): { renumbered: number; kept: string[] } {
  const SCHEME = /^[A-Z]{1,3}\d+$/;
  const kept: string[] = [];
  const groups = new Map<string, Instance[]>();
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part || !SCHEME.test(inst.label || "")) {
      if (inst.label) kept.push(inst.label);
      continue;
    }
    const arr = groups.get(part.ref) ?? [];
    arr.push(inst);
    groups.set(part.ref, arr);
  }
  let renumbered = 0;
  for (const [prefix, arr] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    arr.sort((a, b) => a.y - b.y || a.x - b.x);
    arr.forEach((inst, k) => {
      const next = `${prefix}${k + 1}`;
      if (inst.label !== next) {
        inst.label = next;
        renumbered++;
      }
    });
  }
  return { renumbered, kept };
}

export function buildNets(doc: SchematicDoc): NetlistBuildResult {
  const uf = new UnionFind();
  const errors: string[] = [];
  const warnings: string[] = [];

  // wire segments (S3.1: Bus-Drähte leiten NICHT — sie sind Bündel + Deklaration)
  const segments: Array<[number, number, number, number]> = [];
  const segOwner: string[] = [];
  const busSegments: Array<[number, number, number, number]> = [];
  // S5.9 (W61-Fix): jede Leitung genau EIN Schlüssel — keine Ketten-Union mehr.
  const wireKey = new Map<string, string>();
  const docJunctions = doc.junctions ?? [];
  const junctionKeys = new Set(docJunctions.map((j) => key(j.x, j.y)));
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      if (w.isBus) {
        busSegments.push([a.x, a.y, b.x, b.y]);
        continue;
      }
      segments.push([a.x, a.y, b.x, b.y]);
      segOwner.push(w.id);
    }
    if (!w.isBus) {
      const wk = `W:${w.id}`;
      wireKey.set(w.id, wk);
      uf.find(wk);
    }
  }

  // pins snap onto wires (also mid-segment T connections) + fault handling
  const pinPoints: Array<{ instanceId: string; pinIndex: number; pinName: string; x: number; y: number }> = [];
  const pinKey = (instanceId: string, pinIndex: number) => `P:${instanceId}:${pinIndex}`;
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) {
      errors.push(`Unbekanntes Bauteil "${inst.partId}" (${inst.label})`);
      continue;
    }
    const fault = (inst as any).fault as string | undefined;
    if (fault === "open") {
      warnings.push(`${inst.label}: Fault OPEN – Bauteil wird als unterbrochen simuliert`);
      continue; // don't add pins, so device will be NC and not affect circuit, but we still need to handle device creation later
    }
    if (fault === "short") {
      warnings.push(`${inst.label}: Fault SHORT – Pins werden kurzgeschlossen`);
      // Collect pin keys to short together
      const keys: string[] = [];
      partPins(part, inst.params).forEach((pin, idx) => {
        const pos = pinPosition(inst, idx);
        keys.push(pinKey(inst.id, idx));
        pinPoints.push({ instanceId: inst.id, pinIndex: idx, pinName: pin.name, x: pos.x, y: pos.y });
        uf.find(pinKey(inst.id, idx));
      });
      if (keys.length > 1) {
        for (let i=1; i<keys.length; i++) uf.union(keys[0], keys[i]);
      }
      continue;
    }
    if (fault === "leakage") {
      warnings.push(`${inst.label}: Fault LEAKAGE – 10k Leckwiderstand wird hinzugefügt (vereinfacht)`);
    }
    partPins(part, inst.params).forEach((pin, idx) => {
      const pos = pinPosition(inst, idx);
      pinPoints.push({ instanceId: inst.id, pinIndex: idx, pinName: pin.name, x: pos.x, y: pos.y });
      uf.find(pinKey(inst.id, idx));
    });
  }

  /* S5.9 (W61-Fix): Verbunden wird nur noch an echten Anschlussstellen —
   * Leitungsende auf fremdem Segment, Pin auf Segment, gesetzter Punkt auf
   * Segment. Geteilte Knicke (Stützpunkt auf Stützpunkt, beidseitig mitten in
   * der Leitung) verbinden NICHTS mehr; vorher waren sie über den globalen
   * Ketten-Schlüssel unbemerkt leitend. Altbestände bleiben erhalten:
   * migrateDoc trägt an solchen Stellen Dots nach. */
  const pinsAtCoord = new Map<string, string[]>();
  for (const p of pinPoints) {
    const k = key(p.x, p.y);
    const arr = pinsAtCoord.get(k) ?? [];
    arr.push(pinKey(p.instanceId, p.pinIndex));
    pinsAtCoord.set(k, arr);
  }
  for (const arr of pinsAtCoord.values()) {
    for (let i = 1; i < arr.length; i++) uf.union(arr[0], arr[i]);
  }
  const wiresAt = (x: number, y: number, exclude?: string): string[] => {
    const out: string[] = [];
    for (let si = 0; si < segments.length; si++) {
      if (exclude !== undefined && segOwner[si] === exclude) continue;
      const [ax, ay, bx, by] = segments[si];
      if (!pointOnSegment(x, y, ax, ay, bx, by)) continue;
      const wk = wireKey.get(segOwner[si]);
      if (wk && !out.includes(wk)) out.push(wk);
    }
    return out;
  };
  // Pins auf Leitungen (auch T-Kontakte mitten im Segment)
  for (const p of pinPoints) {
    for (const wk of wiresAt(p.x, p.y)) uf.union(pinKey(p.instanceId, p.pinIndex), wk);
  }
  // Leitungsenden auf fremden Segmenten (T-Kontakt/Stoß)
  for (const w of doc.wires) {
    if (w.isBus || w.points.length < 2) continue;
    const wk = wireKey.get(w.id);
    if (!wk) continue;
    for (const e of [w.points[0], w.points[w.points.length - 1]]) {
      for (const fk of wiresAt(e.x, e.y, w.id)) uf.union(wk, fk);
    }
  }
  // Ausdrückliche Verbindungspunkte
  for (const j of docJunctions) {
    const jk = `J:${key(j.x, j.y)}`;
    uf.find(jk);
    for (const wk of wiresAt(j.x, j.y)) uf.union(jk, wk);
    for (const pk of pinsAtCoord.get(key(j.x, j.y)) ?? []) uf.union(jk, pk);
  }
  const allPoints = new Set<string>(junctionKeys);
  for (const w of doc.wires) {
    if (w.points.length < 2 || w.isBus) continue;
    const a = w.points[0];
    const b = w.points[w.points.length - 1];
    allPoints.add(key(a.x, a.y));
    allPoints.add(key(b.x, b.y));
  }
  for (const p of pinPoints) allPoints.add(key(p.x, p.y));
  for (const l of doc.labels) allPoints.add(key(l.x, l.y));

  // Koordinate -> Union-Schlüssel (Pin zuerst, dann Leitung, dann Punkt,
  // sonst eigener Freipunkt). An echten Kreuzungen unverbundener Leitungen ist
  // die Koordinate mehrdeutig — gemeldet wird die erste Leitung (nur Anzeige).
  const freePoint = new Map<string, string>();
  const coordKey = (x: number, y: number): string => {
    const k = key(x, y);
    const pins = pinsAtCoord.get(k);
    if (pins?.length) return pins[0];
    const wk = wiresAt(x, y)[0];
    if (wk) return wk;
    if (junctionKeys.has(k)) return `J:${k}`;
    let q = freePoint.get(k);
    if (!q) { q = `Q:${k}`; uf.find(q); freePoint.set(k, q); }
    return q;
  };
  const rootOf = (pk: string): string => {
    const [px, py] = pk.split(",").map(Number);
    return uf.find(coordKey(px, py));
  };

  // group
  const groups = new Map<string, string[]>();
  const regroup = () => {
    groups.clear();
    for (const pk of allPoints) {
      const root = rootOf(pk);
      const arr = groups.get(root) ?? [];
      arr.push(pk);
      groups.set(root, arr);
    }
  };
  regroup();

  // On-Page-Verbinder + Netzlabels: gleicher Name = gleiches Netz (virtuelle
  // Verbindung wie in Multisim, pro Entwurf — keine Blätter, kein Off-Page).
  // S5.22: Labels nehmen am selben Mechanismus teil; der Vergleich ist
  // groß-/klein-unabhängig (SPICE-Knotennamen sind es auch), angezeigt wird
  // die zuerst vorkommende Schreibweise (Verbinder- vor Label-Schreibung).
  const connectorGroups = new Map<string, string[]>(); // UPPER(name) -> root[]
  const displayName = new Map<string, string>(); // UPPER(name) -> erste Schreibweise
  const bindName = (name: string, x: number, y: number) => {
    const t = name.trim();
    if (!t) return;
    const k = t.toUpperCase();
    const arr = connectorGroups.get(k) ?? [];
    arr.push(uf.find(coordKey(x, y)));
    connectorGroups.set(k, arr);
    if (!displayName.has(k)) displayName.set(k, t);
  };
  for (const inst of doc.instances) {
    if (inst.partId === "onpage_connector") {
      const name = String(inst.params.name ?? "NET_A").trim() || "NET_A";
      const pos = pinPosition(inst, 0);
      bindName(name, pos.x, pos.y);
    } else if (inst.partId === "bus_tap") {
      // S3.1: Tap bindet Pin 0 an BUS[bit] (Namensbindung, kein Geometrie-Raten).
      const bus = String(inst.params.bus ?? "D").trim() || "D";
      const bit = Math.max(0, Math.floor(Number(inst.params.bit ?? 0)));
      const pos = pinPosition(inst, 0);
      bindName(`${bus}[${bit}]`, pos.x, pos.y);
    } else if (inst.partId === "bus_splitter") {
      // S3.1: Splitter bindet Bit-Pin i (Pin 0 = BUS-Anker/NC) an BUS[i].
      const bus = String(inst.params.bus ?? "D").trim() || "D";
      const width = splitterWidth(inst.params);
      for (let i = 0; i < width; i++) {
        const pos = pinPosition(inst, 1 + i);
        bindName(`${bus}[${i}]`, pos.x, pos.y);
      }
    }
  }
  // S5.22: Netzlabels verbinden virtuell (Multisim) — auch untereinander
  // und mit gleichnamigen Verbindern (der Mechanismus ist einer).
  for (const l of doc.labels) bindName(l.name, l.x, l.y);
  for (const roots of connectorGroups.values()) {
    if (roots.length > 1) {
      const first = roots[0];
      for (let i=1; i<roots.length; i++) {
        uf.union(first, roots[i]);
      }
    }
  }
  // S3.1: Bus-Deklarationen validieren (Bus-Leitung = Bündel + Deklaration;
  // ohne Deklaration funktionieren Taps trotzdem — dann ohne Prüfung).
  const busDecl = new Map<string, number[]>();
  for (const w of doc.wires) {
    if (!w.isBus || !w.busName?.trim()) continue;
    const arr = busDecl.get(w.busName.trim()) ?? [];
    arr.push(w.busWidth ?? 0);
    busDecl.set(w.busName.trim(), arr);
  }
  for (const [name, widths] of busDecl) {
    const distinct = [...new Set(widths.filter((v) => v > 0))];
    if (distinct.length > 1) warnings.push(`Bus ${name}: widersprüchliche Breiten deklariert (${distinct.join(" vs ")})`);
  }
  const bitUse = new Map<string, Set<number>>();
  const markBit = (bus: string, bit: number) => {
    const set = bitUse.get(bus) ?? new Set<number>();
    set.add(bit);
    bitUse.set(bus, set);
  };
  for (const inst of doc.instances) {
    if (inst.partId === "bus_tap") {
      markBit(String(inst.params.bus ?? "D").trim() || "D", Math.max(0, Math.floor(Number(inst.params.bit ?? 0))));
    } else if (inst.partId === "bus_splitter") {
      const bus = String(inst.params.bus ?? "D").trim() || "D";
      for (let i = 0; i < splitterWidth(inst.params); i++) markBit(bus, i);
    }
  }
  for (const [bus, bits] of bitUse) {
    const decl = busDecl.get(bus)?.find((v) => v > 0);
    if (!decl) continue;
    for (const b of [...bits].sort((a, z) => a - z)) {
      if (b >= decl) warnings.push(`Bus ${bus}[${b}]: Bit übersteigt die deklarierte Breite ${decl}`);
    }
  }
  // Rebuild groups after connector union
  regroup();

  // naming: ground first, then labels, then auto, then connector names
  const rootName = new Map<string, string>();
  for (const inst of doc.instances) {
    if (inst.partId === "gnd") {
      rootName.set(uf.find(pinKey(inst.id, 0)), "0");
    }
  }
  for (const l of doc.labels) {
    const root = uf.find(coordKey(l.x, l.y));
    // S5.22: erste Schreibweise gewinnt (virtuell vereinte Labels teilen ein Netz).
    if (rootName.get(root) !== "0" && !rootName.get(root)) rootName.set(root, l.name.trim());
  }
  // connector names have priority over auto (und über Label-Schreibweisen)
  for (const [upper, roots] of connectorGroups) {
    if (roots.length) {
      const root = uf.find(roots[0]);
      if (rootName.get(root) !== "0") rootName.set(root, displayName.get(upper) ?? upper);
    }
  }
  let counter = 1;
  for (const root of groups.keys()) {
    if (!rootName.get(root)) rootName.set(root, `N${String(counter++).padStart(3, "0")}`);
  }

  // pins that touch nothing at all get a dedicated "not connected" name so that
  // macro models (op-amp supplies, 555 CTRL, ...) can fall back to their defaults
  const pinsPerRoot = new Map<string, number>();
  for (const p of pinPoints) {
    const r = uf.find(pinKey(p.instanceId, p.pinIndex));
    pinsPerRoot.set(r, (pinsPerRoot.get(r) ?? 0) + 1);
  }
  // S3.1: Namensgebundene Netze (On-Page/Tap/Splitter) behalten ihren Namen —
  // der Name IST die Verbindung, auch solo (nc gilt nur echten Freiläufern).
  const connectorRoots = new Set<string>();
  for (const roots of connectorGroups.values()) {
    for (const r of roots) connectorRoots.add(uf.find(r));
  }
  for (const p of pinPoints) {
    const r = uf.find(pinKey(p.instanceId, p.pinIndex));
    const group = groups.get(r) ?? [];
    if ((pinsPerRoot.get(r) ?? 0) === 1 && group.length === 1 && rootName.get(r) !== "0" && !connectorRoots.has(r)) {
      rootName.set(r, `${p.instanceId}_nc${p.pinIndex}`);
    }
  }

  const pinNets: Record<string, string> = {};
  for (const p of pinPoints) pinNets[`${p.instanceId}:${p.pinIndex}`] = rootName.get(uf.find(pinKey(p.instanceId, p.pinIndex))) ?? "0";

  const pointNets: Record<string, string> = {};
  for (const pk of allPoints) pointNets[pk] = rootName.get(rootOf(pk)) ?? "";

  const nets: NetInfo[] = [];
  for (const [root, pts] of groups) {
    const name = rootName.get(root) ?? "?";
    nets.push({
      name,
      points: pts.map((pk) => {
        const [x, y] = pk.split(",").map(Number);
        return { x, y };
      }),
      pins: pinPoints.filter((p) => uf.find(pinKey(p.instanceId, p.pinIndex)) === root).map((p) => ({ instanceId: p.instanceId, pinIndex: p.pinIndex, pinName: p.pinName })),
    });
  }

  // devices + fault handling
  const devices: Device[] = [];
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    const fault = (inst as any).fault as string | undefined;
    if (fault === "open") {
      // Skip device – open circuit
      continue;
    }
    const nodes = partPins(part, inst.params).map((_, idx) => pinNets[`${inst.id}:${idx}`] ?? `${inst.id}_nc${idx}`);
    const like: PartInstanceLike = { id: inst.label || inst.id, partId: inst.partId, params: inst.params, text: inst.text };
    try {
      const devs = part.toDevices(like, nodes);
      if (fault === "short") {
        // For short fault, replace with wire (0 ohm) between first two nodes if possible
        if (nodes.length >= 2) {
          devices.push({ id: inst.label + "_short", type: "R", nodes: [nodes[0], nodes[1]], params: { r: 0.001 } });
        }
      } else if (fault === "leakage") {
        devices.push(...devs);
        // Add 10k leakage between pins
        if (nodes.length >= 2) {
          devices.push({ id: inst.label + "_leak", type: "R", nodes: [nodes[0], nodes[1]], params: { r: 10000 } });
        }
      } else {
        devices.push(...devs);
      }
    } catch (e) {
      errors.push(`${inst.label}: ${(e as Error).message}`);
    }
  }

  if (!devices.length) warnings.push("Keine simulierbaren Bauteile platziert.");
  if (!doc.instances.some((i) => i.partId === "gnd")) warnings.push("Kein Massebezug (GND) im Schaltplan — Simulation kann singulär werden.");

  /* ---------------- W51 · Leitungs-Hygiene / W53 · Verbindungspunkte ----------------
   * Rein informativ: die Netzbildung oben bleibt unverändert. Gemeldet wird nur,
   * was optisch nicht auffällt, aber elektrisch entscheidet. */
  const MAX_WIRE_WARNINGS = 12;
  const wireWarn: string[] = [];
  let hiddenWireWarnings = 0;
  const warnWire = (msg: string) => {
    if (wireWarn.length < MAX_WIRE_WARNINGS) wireWarn.push(msg);
    else hiddenWireWarnings++;
  };

  // alle Pin-Punkte (auch Fault-Bauteile) – ein Ende darauf ist angeschlossen
  const pinKeys = new Set<string>();
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let i = 0; i < partPins(part, inst.params).length; i++) {
      const pos = pinPosition(inst, i);
      pinKeys.add(key(pos.x, pos.y));
    }
  }
  const labelKeys = new Set(doc.labels.map((l) => key(l.x, l.y)));

  const endCount = new Map<string, number>();
  const wireEnds: Array<{ x: number; y: number }> = [];
  for (const w of doc.wires) {
    if (w.points.length < 2 || w.isBus) continue;
    for (const p of [w.points[0], w.points[w.points.length - 1]]) {
      wireEnds.push({ x: p.x, y: p.y });
      endCount.set(key(p.x, p.y), (endCount.get(key(p.x, p.y)) ?? 0) + 1);
    }
  }

  const openEnds: Array<{ x: number; y: number }> = [];
  for (const w of doc.wires) {
    if (w.points.length < 2) {
      warnWire(`Leitung ohne Länge (kein Punkt) – löschen oder verlegen`);
      continue;
    }
    const allSame = w.points.every((p) => Math.abs(p.x - w.points[0].x) < 0.01 && Math.abs(p.y - w.points[0].y) < 0.01);
    if (allSame) {
      warnWire(`Leitung ohne Länge bei (${Math.round(w.points[0].x)}, ${Math.round(w.points[0].y)}) – doppelter Stützpunkt`);
      continue;
    }
    // S3.1: Bus-Enden hängen per Design in der Luft (kein offenes Ende).
    if (w.isBus) continue;
    for (const idx of [0, w.points.length - 1]) {
      const p = w.points[idx];
      const k = key(p.x, p.y);
      if (pinKeys.has(k) || labelKeys.has(k)) continue;
      if ((endCount.get(k) ?? 0) > 1) continue; // anderes Leitungsende liegt hier
      let onForeignSegment = false;
      for (let si = 0; si < segments.length; si++) {
        if (segOwner[si] === w.id) continue;
        const [ax, ay, bx, by] = segments[si];
        if (pointOnSegment(p.x, p.y, ax, ay, bx, by)) { onForeignSegment = true; break; }
      }
      if (onForeignSegment) continue;
      openEnds.push({ x: p.x, y: p.y });
      warnWire(`Leitungsende ohne Anschluss bei (${Math.round(p.x)}, ${Math.round(p.y)}) – hängt in der Luft`);
    }
  }

  // S5.9: Geteilte Knicke verbinden nichts mehr (W61-Fix, siehe oben) — die
  // S3.5-Warnung ist damit obsolet. (Absichtlich keine Still-Meldung: Eine
  // Kreuzung an Knicks ist jetzt so harmlos wie jede andere Kreuzung.)

  // S3.1: Geometrisches Antippen eines Busses verbindet nichts — nur Tap/Splitter.
  if (busSegments.length) {
    const onBus = (x: number, y: number) => busSegments.some(([ax, ay, bx, by]) => pointOnSegment(x, y, ax, ay, bx, by));
    for (const w of doc.wires) {
      if (w.isBus || w.points.length < 2) continue;
      for (const idx of [0, w.points.length - 1]) {
        const p = w.points[idx];
        const k = key(p.x, p.y);
        if (pinKeys.has(k) || labelKeys.has(k)) continue;
        if (onBus(p.x, p.y)) warnWire(`Leitungsende auf Bus-Leitung bei (${Math.round(p.x)}, ${Math.round(p.y)}) – Busse verbinden nur per Bus-Tap/Splitter`);
      }
    }
    for (const j of docJunctions) {
      if (onBus(j.x, j.y)) warnWire(`Verbindungspunkt auf Bus-Leitung bei (${Math.round(j.x)}, ${Math.round(j.y)}) – wirkungslos, Busse verbinden nur per Bus-Tap/Splitter`);
    }
  }

  // doppelt verlegte Leitungen (gleiche Geometrie, auch rückwärts)
  const geomSeen = new Map<string, number>();
  for (const w of doc.wires) {
    if (w.points.length < 2) continue;
    const fwd = w.points.map((p) => key(p.x, p.y)).join(">");
    const rev = [...w.points].reverse().map((p) => key(p.x, p.y)).join(">");
    const geom = fwd < rev ? fwd : rev;
    const n = geomSeen.get(geom) ?? 0;
    geomSeen.set(geom, n + 1);
    if (n === 1) {
      const a = w.points[0];
      const b = w.points[w.points.length - 1];
      warnWire(`Leitung doppelt vorhanden: (${Math.round(a.x)}, ${Math.round(a.y)}) → (${Math.round(b.x)}, ${Math.round(b.y)}) – eine davon löschen`);
    }
  }

  // W56: Bauteile, die praktisch deckungsgleich übereinander liegen, sieht man
  // im Plan nicht – hier einmal pro Paar melden.
  const instBoxes = doc.instances.map((i) => ({ i, b: instanceBounds(i) }));
  let overlapWarned = 0;
  for (let a = 0; a < instBoxes.length && overlapWarned < 4; a++) {
    for (let b = a + 1; b < instBoxes.length && overlapWarned < 4; b++) {
      const x = instBoxes[a].b;
      const y = instBoxes[b].b;
      const ox = Math.min(x.x + x.w, y.x + y.w) - Math.max(x.x, y.x);
      const oy = Math.min(x.y + x.h, y.y + y.h) - Math.max(x.y, y.y);
      if (ox <= 0 || oy <= 0) continue;
      const smaller = Math.min(x.w * x.h, y.w * y.h) || 1;
      // Schwelle 90 %: angrenzende Symbole (Masse an der Quelle) sind normal,
      // wirklich deckungsgleiche Bauteile sind unsichtbar und damit gefährlich.
      if ((ox * oy) / smaller >= 0.9) {
        warnWire(`${instBoxes[a].i.label} und ${instBoxes[b].i.label} überlagern sich fast vollständig – eines verschieben`);
        overlapWarned++;
      }
    }
  }

  if (hiddenWireWarnings > 0) wireWarn.push(`… und ${hiddenWireWarnings} weitere Leitungs-Warnungen`);
  warnings.push(...wireWarn);

  // Verbindungspunkte: automatische T-Kontakte (≥ 3 Anschlüsse) plus alle
  // ausdrücklich gesetzten Punkte.
  const autoCandidates = new Set<string>([...pinKeys, ...labelKeys, ...wireEnds.map((p) => key(p.x, p.y))]);
  const junctions: Array<{ x: number; y: number }> = [];
  const junctionDegree = (c: string) => {
    const [jx, jy] = c.split(",").map(Number);
    let degree = (endCount.get(c) ?? 0) + (pinKeys.has(c) ? 1 : 0) + (labelKeys.has(c) ? 1 : 0);
    for (let si = 0; si < segments.length; si++) {
      const [ax, ay, bx, by] = segments[si];
      if (Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01) continue;
      // Endpunkte sind schon über endCount/Pins gezählt
      if (jx === ax && jy === ay) continue;
      if (jx === bx && jy === by) continue;
      if (pointOnSegment(jx, jy, ax, ay, bx, by)) degree += 2;
    }
    return degree;
  };
  for (const c of autoCandidates) {
    if (junctionDegree(c) >= 3) {
      const [jx, jy] = c.split(",").map(Number);
      junctions.push({ x: jx, y: jy });
    }
  }
  for (const j of docJunctions) {
    const k = key(j.x, j.y);
    // Ein gesetzter Punkt ohne Leitung verbindet nichts – sagen statt schweigen.
    if (junctionDegree(k) < 2) warnWire(`Verbindungspunkt ohne Leitung bei (${Math.round(j.x)}, ${Math.round(j.y)}) – sitzt auf keiner Leitung`);
    if (!junctions.some((q) => Math.abs(q.x - j.x) < 0.01 && Math.abs(q.y - j.y) < 0.01)) junctions.push({ x: j.x, y: j.y });
  }

  // S3.4: ERC — elektrische Pin-Typen prüfen (Regeln E1–E4, siehe DESIGN.md).
  const ercWarn: string[] = [];
  let hiddenErc = 0;
  const warnErc = (msg: string) => {
    if (ercWarn.length < 12) ercWarn.push(msg);
    else hiddenErc++;
  };
  const instById = new Map(doc.instances.map((i) => [i.id, i]));
  interface ErcPin { inst: string; label: string; pin: string; type: PinElectrical; custom: boolean; solo: boolean }
  const ercByRoot = new Map<string, ErcPin[]>();
  for (const p of pinPoints) {
    const inst = instById.get(p.instanceId);
    const part = inst ? PART_MAP[inst.partId] : undefined;
    const r = uf.find(pinKey(p.instanceId, p.pinIndex));
    const arr = ercByRoot.get(r) ?? [];
    arr.push({
      inst: p.instanceId,
      label: inst?.label || p.instanceId,
      pin: p.pinName,
      type: part && inst ? pinElectrical(part, inst.params, p.pinIndex) : "passive",
      custom: !!part?.tags?.includes("custom"),
      solo: (pinsPerRoot.get(r) ?? 0) === 1 && (groups.get(r) ?? []).length === 1,
    });
    ercByRoot.set(r, arr);
  }
  for (const [root, pins] of ercByRoot) {
    const net = rootName.get(root) ?? "?";
    const tag = (e: ErcPin) => `${e.label}:${e.pin}`;
    const drivers = pins.filter((e) => e.type === "output" || e.type === "power_out");
    // E1: Treiberausgänge verschiedener Instanzen auf einem Netz.
    // Gleiche Instanz = erlaubt (herstellerseitig verbundene Pins/Brücken).
    if (new Set(drivers.map((e) => e.inst)).size > 1) {
      warnErc(`ERC E1: Netz „${net}“ – Ausgänge kurzgeschlossen (${drivers.slice(0, 4).map(tag).join(", ")})`);
      continue;
    }
    const types = new Set(pins.map((e) => e.type));
    // E2: Netz nur an Eingängen – kein Treiber.
    if (pins.length > 1 && types.size === 1 && types.has("input")) {
      warnErc(`ERC E2: Netz „${net}“ hängt nur an Eingängen, kein Treiber (${pins.slice(0, 4).map(tag).join(", ")})`);
      continue;
    }
    // E3: Versorgungseingang ohne Quelle (passiv = mögliche RC-Speisung, still).
    if (pins.length > 1 && types.has("power_in") && !types.has("power_out") && !types.has("output") && !types.has("passive")) {
      warnErc(`ERC E3: Netz „${net}“ versorgt ohne Quelle (${pins.slice(0, 4).map(tag).join(", ")})`);
      continue;
    }
    // E4: Unverbundene Eingänge; Versorgung nur bei eigenen Bauteilen
    // (eingebaute Makros haben dokumentierte Standardwerte).
    if (pins.length === 1 && pins[0].solo && pins[0].type === "input") {
      warnErc(`ERC E4: ${tag(pins[0])} (Eingang) ist unverbunden`);
    } else if (pins.length === 1 && pins[0].solo && pins[0].type === "power_in" && pins[0].custom) {
      warnErc(`ERC E4: ${tag(pins[0])} (Versorgung, eigenes Bauteil) ist unverbunden`);
    }
  }
  if (hiddenErc > 0) ercWarn.push(`… und ${hiddenErc} weitere ERC-Hinweise`);
  warnings.push(...ercWarn);

  return { netlist: { devices, title: doc.name }, nets, pinNets, pointNets, errors, warnings, openEnds, junctions };
}

/* ----------------------------- SPICE I/O ----------------------------- */

const sp = (v: number) => {
  if (!Number.isFinite(v)) return "0";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6) return `${v / 1e6}Meg`;
  if (a >= 1e3) return `${v / 1e3}k`;
  if (a >= 1) return `${v}`;
  if (a >= 1e-3) return `${v * 1e3}m`;
  if (a >= 1e-6) return `${v * 1e6}u`;
  if (a >= 1e-9) return `${v * 1e9}n`;
  return `${v * 1e12}p`;
};

export function toSpiceNetlist(doc: SchematicDoc, analysis?: string): string {
  const { netlist, errors } = buildNets(doc);
  const lines: string[] = [`* ${doc.name} — exportiert aus Multispice`, "* SPICE3/ngspice kompatible Netzliste", ""];
  const models = new Set<string>();
  for (const d of netlist.devices) {
    const n = d.nodes.map((x) => x || "0");
    switch (d.type) {
      case "R":
      case "FUSE":
      case "LAMP":
        lines.push(`R${d.id} ${n[0]} ${n[1]} ${sp(d.params.r ?? 1000)}`);
        break;
      case "POT":
        lines.push(`R${d.id}A ${n[0]} ${n[1]} ${sp((d.params.r ?? 1e4) * (d.params.pos ?? 0.5))}`);
        lines.push(`R${d.id}B ${n[1]} ${n[2]} ${sp((d.params.r ?? 1e4) * (1 - (d.params.pos ?? 0.5)))}`);
        break;
      case "C":
        lines.push(`C${d.id} ${n[0]} ${n[1]} ${sp(d.params.c ?? 1e-6)}`);
        break;
      case "L":
        lines.push(`L${d.id} ${n[0]} ${n[1]} ${sp(d.params.l ?? 1e-3)}`);
        break;
      case "V": {
        const s = d.source;
        let spec = `DC ${sp(s?.dc ?? 0)}`;
        if (s?.kind === "sine") spec = `DC ${sp(s.offset ?? 0)} AC ${s.acMag ?? 1} SIN(${sp(s.offset ?? 0)} ${sp(s.amplitude ?? 1)} ${sp(s.freq ?? 1000)} 0 0 ${s.phase ?? 0})`;
        else if (s?.kind === "pulse") spec = `PULSE(${sp(s.offset ?? 0)} ${sp(s.amplitude ?? 5)} ${sp(s.delay ?? 0)} ${sp(s.rise ?? 1e-9)} ${sp(s.fall ?? 1e-9)} ${sp(s.width ?? 1e-4)} ${sp(s.period ?? 1e-3)})`;
        else if (s?.acMag) spec += ` AC ${s.acMag}`;
        lines.push(`V${d.id} ${n[0]} ${n[1]} ${spec}`);
        break;
      }
      case "I":
        lines.push(`I${d.id} ${n[0]} ${n[1]} DC ${sp(d.source?.dc ?? 0)}`);
        break;
      case "D":
      case "LED":
      case "ZENER":
      case "SCHOTTKY": {
        const mdl = `DMOD_${d.id}`;
        models.add(`.model ${mdl} D(IS=${d.params.is ?? 1e-14} N=${d.params.n ?? 1} RS=${d.params.rs ?? 0.1} BV=${d.params.bv ?? 100} CJO=${d.params.cjo ?? 1e-12})`);
        lines.push(`D${d.id} ${n[0]} ${n[1]} ${mdl}`);
        break;
      }
      case "Q": {
        const mdl = `QMOD_${d.id}`;
        models.add(`.model ${mdl} ${d.params.pnp ? "PNP" : "NPN"}(IS=${d.params.is ?? 1e-15} BF=${d.params.bf ?? 200} VAF=${d.params.vaf ?? 100} CJE=${d.params.cje ?? 5e-12} CJC=${d.params.cjc ?? 2e-12})`);
        lines.push(`Q${d.id} ${n[0]} ${n[1]} ${n[2]} ${mdl}`);
        break;
      }
      case "M": {
        const mdl = `MMOD_${d.id}`;
        models.add(`.model ${mdl} ${d.params.pmos ? "PMOS" : "NMOS"}(VTO=${d.params.vto ?? 2} KP=${d.params.kp ?? 2e-5} LAMBDA=${d.params.lambda ?? 0.02})`);
        lines.push(`M${d.id} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${mdl} W=${d.params.w ?? 1e-4} L=${d.params.l ?? 1e-5}`);
        break;
      }
      case "J": {
        const mdl = `JMOD_${d.id}`;
        models.add(`.model ${mdl} NJF(VTO=${d.params.vto ?? -3} BETA=${d.params.beta ?? 1e-3} LAMBDA=${d.params.lambda ?? 0.01})`);
        lines.push(`J${d.id} ${n[0]} ${n[1]} ${n[2]} ${mdl}`);
        break;
      }
      case "E":
      case "G":
      case "H":
      case "F":
        lines.push(`${d.type}${d.id} ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${d.params.gain ?? 1}`);
        break;
      case "OPAMP":
      case "COMPARATOR":
        lines.push(`X${d.id} ${n[0]} ${n[1]} ${n[2]} OPAMP_MACRO ; A0=${d.params.gain} GBW=${d.params.gbw ?? 1e6}`);
        break;
      case "TIMER555":
        lines.push(`X${d.id} ${n.join(" ")} NE555`);
        break;
      case "VREG":
        lines.push(`X${d.id} ${n[0]} ${n[1]} ${n[2]} VREG ; Vout=${d.params.vout}`);
        break;
      case "SWITCH":
      case "PUSHBUTTON":
      case "DIPSWITCH":
        lines.push(`R${d.id} ${n[0]} ${n[1]} ${d.params.closed ? sp(d.params.ron ?? 0.01) : "1G"} ; Schalter`);
        break;
      case "VSWITCH":
        lines.push(`S${d.id} ${n[0]} ${n[1]} ${n[2]} ${n[3]} SWMOD`);
        models.add(`.model SWMOD SW(VT=${d.params.von ?? 2.5} VH=0.2 RON=${d.params.ron ?? 1} ROFF=${d.params.roff ?? 1e9})`);
        break;
      case "TRANSFORMER":
        lines.push(`L${d.id}P ${n[0]} ${n[1]} ${sp(d.params.lp ?? 1)}`);
        lines.push(`L${d.id}S ${n[2]} ${n[3]} ${sp((d.params.lp ?? 1) / (d.params.ratio ?? 1) ** 2)}`);
        lines.push(`K${d.id} L${d.id}P L${d.id}S ${d.params.k ?? 0.999}`);
        break;
      case "GATE":
      case "DIGITAL":
      case "MCU":
        lines.push(`* ${d.type} ${d.id} (${d.model ?? ""}) Knoten: ${n.join(" ")} — XSPICE/digitale Co-Simulation`);
        break;
      default:
        break;
    }
  }
  lines.push("", ...[...models]);
  lines.push("", analysis ?? ".op", ".end");
  if (errors.length) lines.unshift(...errors.map((e) => `* FEHLER: ${e}`));
  return lines.join("\n");
}

/** Bill of materials */
export interface BomRow {
  ref: string;
  part: string;
  value: string;
  footprint: string;
  mount: string;
  qty: number;
}

export function buildBom(doc: SchematicDoc): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const inst of doc.instances) {
    const part: PartDef | undefined = PART_MAP[inst.partId];
    if (!part || part.mount === "virtual") continue;
    const main = part.params[0];
    const value = main ? formatValue(Number(inst.params[main.key] ?? main.def), main.unit ?? "") : "";
    const k = `${part.id}|${value}`;
    const existing = rows.get(k);
    if (existing) {
      existing.qty++;
      existing.ref += ", " + inst.label;
    } else {
      rows.set(k, { ref: inst.label, part: part.name, value, footprint: part.footprint ?? "—", mount: part.mount, qty: 1 });
    }
  }
  return [...rows.values()];
}
