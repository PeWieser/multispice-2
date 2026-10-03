/**
 * Schematic document model: instances, wires, net extraction (union-find),
 * SPICE netlist generation and import.
 */

import { PART_MAP, PartDef, PartInstanceLike, formatValue } from "@/lib/library/catalog";
import { Device, Netlist } from "@/lib/sim/engine";

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

// Das allererste Blatt bekommt eine feste ID, damit Server-HTML (statischer
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
  const pin = part?.pins[pinIndex];
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
    for (let i = 0; i < part.pins.length; i++) pinPts.push(pinPosition(inst, i));
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
  for (const prim of part.symbol) {
    if (prim.t === "line") for (let i = 0; i < prim.pts.length; i += 2) consider(prim.pts[i], prim.pts[i + 1]);
    else if (prim.t === "rect") {
      consider(prim.x, prim.y);
      consider(prim.x + prim.w, prim.y + prim.h);
    } else if (prim.t === "circle" || prim.t === "arc") {
      consider(prim.x - prim.r, prim.y - prim.r);
      consider(prim.x + prim.r, prim.y + prim.r);
    } else consider(prim.x, prim.y);
  }
  for (const pin of part.pins) consider(pin.x, pin.y);
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

export function buildNets(doc: SchematicDoc): NetlistBuildResult {
  const uf = new UnionFind();
  const errors: string[] = [];
  const warnings: string[] = [];

  // wire segments
  const segments: Array<[number, number, number, number]> = [];
  const segOwner: string[] = [];
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      segments.push([a.x, a.y, b.x, b.y]);
      segOwner.push(w.id);
      uf.union(key(a.x, a.y), key(b.x, b.y));
    }
  }

  // pins snap onto wires (also mid-segment T connections) + fault handling
  const pinPoints: Array<{ instanceId: string; pinIndex: number; pinName: string; x: number; y: number }> = [];
  const faultShortGroups: Array<string[]> = [];
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
      part.pins.forEach((pin, idx) => {
        const pos = pinPosition(inst, idx);
        keys.push(key(pos.x, pos.y));
        pinPoints.push({ instanceId: inst.id, pinIndex: idx, pinName: pin.name, x: pos.x, y: pos.y });
        uf.find(key(pos.x, pos.y));
      });
      if (keys.length > 1) {
        for (let i=1; i<keys.length; i++) uf.union(keys[0], keys[i]);
      }
      continue;
    }
    if (fault === "leakage") {
      warnings.push(`${inst.label}: Fault LEAKAGE – 10k Leckwiderstand wird hinzugefügt (vereinfacht)`);
    }
    part.pins.forEach((pin, idx) => {
      const pos = pinPosition(inst, idx);
      pinPoints.push({ instanceId: inst.id, pinIndex: idx, pinName: pin.name, x: pos.x, y: pos.y });
      uf.find(key(pos.x, pos.y));
    });
  }

  /* W61: Multisim-Regel – nur echte Anschlussstellen verbinden.
   * Kandidaten sind Leitungsenden, Pins, Netzlabels und gesetzte
   * Verbindungspunkte. Ein Knick mitten in einer Leitung ist KEINE
   * Anschlussstelle: kreuzen sich zwei Leitungen dort, bleiben die Netze
   * getrennt (im Bild auch kein Punkt), bis der Nutzer einen Verbindungspunkt
   * setzt. Vorher zählte jeder Leitungs-Stützpunkt, dadurch waren Kreuzungen an
   * Knicks unbemerkt leitend. */
  const docJunctions = doc.junctions ?? [];
  const junctionKeys = new Set(docJunctions.map((j) => key(j.x, j.y)));
  const allPoints = new Set<string>(junctionKeys);
  for (const w of doc.wires) {
    if (w.points.length < 2) continue;
    const a = w.points[0];
    const b = w.points[w.points.length - 1];
    allPoints.add(key(a.x, a.y));
    allPoints.add(key(b.x, b.y));
  }
  for (const p of pinPoints) allPoints.add(key(p.x, p.y));
  for (const l of doc.labels) allPoints.add(key(l.x, l.y));

  // connect points that lie on a wire segment
  for (const pk of allPoints) {
    const [px, py] = pk.split(",").map(Number);
    for (const [ax, ay, bx, by] of segments) {
      if (pointOnSegment(px, py, ax, ay, bx, by)) uf.union(pk, key(ax, ay));
    }
  }

  // group
  const groups = new Map<string, string[]>();
  for (const pk of allPoints) {
    const root = uf.find(pk);
    const arr = groups.get(root) ?? [];
    arr.push(pk);
    groups.set(root, arr);
  }

  // on-page / off-page connectors: same name = same net (virtual connection)
  const connectorGroups = new Map<string, string[]>(); // name -> root[]
  for (const inst of doc.instances) {
    if (inst.partId === "onpage_connector" || inst.partId === "offpage_connector") {
      const name = String(inst.params.name ?? "NET_A").trim() || "NET_A";
      const pos = pinPosition(inst, 0);
      const root = uf.find(key(pos.x, pos.y));
      const arr = connectorGroups.get(name) ?? [];
      arr.push(root);
      connectorGroups.set(name, arr);
    }
  }
  for (const [name, roots] of connectorGroups) {
    if (roots.length > 1) {
      const first = roots[0];
      for (let i=1; i<roots.length; i++) {
        uf.union(first, roots[i]);
      }
    }
  }
  // Rebuild groups after connector union
  groups.clear();
  for (const pk of allPoints) {
    const root = uf.find(pk);
    const arr = groups.get(root) ?? [];
    arr.push(pk);
    groups.set(root, arr);
  }

  // naming: ground first, then labels, then auto, then onpage/offpage names
  const rootName = new Map<string, string>();
  for (const inst of doc.instances) {
    if (inst.partId === "gnd") {
      const pos = pinPosition(inst, 0);
      rootName.set(uf.find(key(pos.x, pos.y)), "0");
    }
  }
  for (const l of doc.labels) {
    const root = uf.find(key(l.x, l.y));
    if (rootName.get(root) !== "0") rootName.set(root, l.name.trim() || rootName.get(root) || "");
  }
  // onpage/offpage names have priority over auto
  for (const [name, roots] of connectorGroups) {
    if (roots.length) {
      const root = uf.find(roots[0]);
      if (rootName.get(root) !== "0") rootName.set(root, name);
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
    const r = uf.find(key(p.x, p.y));
    pinsPerRoot.set(r, (pinsPerRoot.get(r) ?? 0) + 1);
  }
  for (const p of pinPoints) {
    const r = uf.find(key(p.x, p.y));
    const group = groups.get(r) ?? [];
    if ((pinsPerRoot.get(r) ?? 0) === 1 && group.length === 1 && rootName.get(r) !== "0") {
      rootName.set(r, `${p.instanceId}_nc${p.pinIndex}`);
    }
  }

  const pinNets: Record<string, string> = {};
  for (const p of pinPoints) pinNets[`${p.instanceId}:${p.pinIndex}`] = rootName.get(uf.find(key(p.x, p.y))) ?? "0";

  const pointNets: Record<string, string> = {};
  for (const pk of allPoints) pointNets[pk] = rootName.get(uf.find(pk)) ?? "";

  const nets: NetInfo[] = [];
  for (const [root, pts] of groups) {
    const name = rootName.get(root) ?? "?";
    nets.push({
      name,
      points: pts.map((pk) => {
        const [x, y] = pk.split(",").map(Number);
        return { x, y };
      }),
      pins: pinPoints.filter((p) => uf.find(key(p.x, p.y)) === root).map((p) => ({ instanceId: p.instanceId, pinIndex: p.pinIndex, pinName: p.pinName })),
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
    const nodes = part.pins.map((_, idx) => pinNets[`${inst.id}:${idx}`] ?? `${inst.id}_nc${idx}`);
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
    for (let i = 0; i < part.pins.length; i++) {
      const pos = pinPosition(inst, i);
      pinKeys.add(key(pos.x, pos.y));
    }
  }
  const labelKeys = new Set(doc.labels.map((l) => key(l.x, l.y)));

  const endCount = new Map<string, number>();
  const wireEnds: Array<{ x: number; y: number }> = [];
  for (const w of doc.wires) {
    if (w.points.length < 2) continue;
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
