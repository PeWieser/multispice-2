
import { PART_MAP, PartDef } from "@/lib/library/catalog";
import { Instance, NetlistBuildResult, Rotation, SchematicDoc, attachWireEnd, cleanWirePoints, instanceBounds, pinPosition } from "@/lib/schematic/model";
import { nearestWireFoot } from "@/lib/schematic/netdraw";

/**
 * W72: Die Dateileiste zeigt die geöffneten Entwürfe als Reiter. Jeder Reiter
 * ist ein unabhängiger Entwurf (Sprint-1-Entscheid, keine Blätter); hier steht
 * die Liste der geöffneten Entwürfe; die
 * Verweise auf die Simulations-Objekte (`engine.doc`, Geräte, Netzprüfung)
 * werden beim Wechsel über `applyDoc` aktualisiert – sonst würde eine
 * umgestellte `useEditor.getState().doc` nicht neu vernetzt.
 */

export const sheets: SheetEntry[] = [];

export function nextLabel(doc: SchematicDoc, part: PartDef): string {
  let n = 1;
  const used = new Set(doc.instances.map((i) => i.label));
  while (used.has(`${part.ref}${n}`)) n++;
  return `${part.ref}${n}`;
}

/** W81: Findet den nächstgelegenen Netzpunkt (auch mitten auf einem Leitungssegment). */
export function resolveNearestNetPoint(
  doc: SchematicDoc,
  nr: NetlistBuildResult,
  x: number,
  y: number,
  maxDist = 30,
): { net: string; x: number; y: number } | null {
  let bestNet: string | undefined;
  let bestD = maxDist;
  let bestPt: { x: number; y: number } | null = null;

  for (const net of nr.nets) {
    for (const pt of net.points) {
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d < bestD) {
        bestD = d;
        bestNet = net.name;
        bestPt = pt;
      }
    }
  }

  const wf = nearestWireFoot(doc, { x, y }, maxDist);
  if (wf && wf.dist <= bestD + 1) {
    const w = doc.wires.find((item) => item.id === wf.wireId);
    if (w && w.points.length) {
      const p0 = w.points[0];
      const key0 = `${Math.round(p0.x)},${Math.round(p0.y)}`;
      const netFromMap = nr.pointNets[key0];
      const netFromList =
        netFromMap ??
        nr.nets.find((n) => n.points.some((pt) => Math.hypot(pt.x - p0.x, pt.y - p0.y) < 1))?.name;
      if (netFromList) {
        bestNet = netFromList;
        bestPt = { x: wf.x, y: wf.y };
        bestD = wf.dist;
      }
    }
  }

  if (bestNet && bestPt) return { net: bestNet, x: bestPt.x, y: bestPt.y };
  return null;
}

/** W99: Erkennt die Leitungsrichtung (0° waagerecht, 90° senkrecht) an einem Messpunkt. */
export function inferWireAngleAt(doc: SchematicDoc, x: number, y: number): Rotation {
  const wf = nearestWireFoot(doc, { x, y }, 18);
  if (wf) {
    const w = doc.wires.find((item) => item.id === wf.wireId);
    const a = w?.points[wf.segIdx];
    const b = w?.points[wf.segIdx + 1];
    if (a && b && Math.abs(a.x - b.x) < Math.abs(a.y - b.y)) return 90;
  }
  return 0;
}

/* --------------------------------------------------------------------------
 * W52 (Runde 23): Drehen/Spiegeln darf keine Verdrahtung abreißen.
 * Vor der Transformation werden die Pin-Positionen der betroffenen Bauteile
 * festgehalten; Leitungsenden, die auf einem dieser Pins saßen, wandern exakt
 * auf die neue Pin-Position (orthogonal nachgezogen, wie beim Verschieben).
 * ------------------------------------------------------------------------ */

/**
 * W61: Punkte, an denen zwei verschiedene Leitungen sich treffen – echte
 * Kreuzungen (nicht nur ein Knick der eigenen Leitung) und T-Kontakte. Nur an
 * solchen Stellen ist ein Verbindungspunkt sinnvoll; der Editor bietet ihn dort
 * an und setzt ihn automatisch, wenn eine Leitung auf einer anderen endet.
 */
export function wireJunctionCandidates(doc: SchematicDoc): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const j of doc.junctions ?? []) out.push({ x: j.x, y: j.y });
  const segs: Array<[number, number, number, number, string]> = [];
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const seen = new Set<string>();
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) segs.push([a.x, a.y, b.x, b.y, w.id]);
    }
  }
  for (let i = 0; i < segs.length; i++) {
    for (let k = i + 1; k < segs.length; k++) {
      const [ax, ay, bx, by, wa] = segs[i];
      const [cx, cy, dx, dy, wb] = segs[k];
      if (wa === wb) continue;
      const r = segmentHit(ax, ay, bx, by, cx, cy, dx, dy);
      if (!r) continue;
      const kk = key(r.x, r.y);
      if (seen.has(kk)) continue;
      seen.add(kk);
      out.push(r);
    }
  }
  return out;
}

/** Schnittpunkt zweier Strecken (auch Endpunkt-Treffer); null bei parallel/verfehlt. */
export function segmentHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): { x: number; y: number } | null {
  const r1 = bx - ax;
  const r2 = by - ay;
  const s1 = dx - cx;
  const s2 = dy - cy;
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null; // parallel oder kollinear
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: ax + t * r1, y: ay + t * r2 };
}

export function collectPins(doc: SchematicDoc, ids: Set<string>): PinRef[] {
  const out: PinRef[] = [];
  for (const inst of doc.instances) {
    if (!ids.has(inst.id)) continue;
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < part.pins.length; idx++) {
      const p = pinPosition(inst, idx);
      out.push({ instId: inst.id, pinIndex: idx, x: p.x, y: p.y });
    }
  }
  return out;
}

/** Leitungsenden auf die neuen Pin-Positionen setzen; liefert die Anzahl. */
export function reattachWiresToPins(doc: SchematicDoc, before: PinRef[], skipWires: Set<string>): number {
  if (!before.length) return 0;
  const find = (p: { x: number; y: number }) =>
    before.find((b) => Math.abs(b.x - p.x) <= 2 && Math.abs(b.y - p.y) <= 2);
  let moved = 0;
  for (const w of doc.wires) {
    if (skipWires.has(w.id) || w.points.length < 2) continue;
    let touched = false;
    const attach = (idx: number) => {
      const b = find(w.points[idx]);
      if (!b) return;
      const inst = doc.instances.find((i) => i.id === b.instId);
      if (!inst) return;
      const np = pinPosition(inst, b.pinIndex);
      if (Math.abs(np.x - w.points[idx].x) < 0.01 && Math.abs(np.y - w.points[idx].y) < 0.01) return;
      attachWireEnd(w.points, idx, np);
      moved++;
      touched = true;
    };
    attach(0);
    attach(w.points.length - 1);
    if (touched) w.points = cleanWirePoints(w.points);
  }
  return moved;
}

export function hitTestInstance(doc: SchematicDoc, x: number, y: number): Instance | null {
  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i];
    const b = instanceBounds(inst);
    if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return inst;
  }
  return null;
}

import type { PinRef, SheetEntry } from "./types";
