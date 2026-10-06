import { PART_MAP, partPins } from "@/lib/library/catalog";
import { GRID, Instance, Rotation, SchematicDoc, instanceBounds, pinPosition, rotatePoint, MeasurementProbe } from "@/lib/schematic/model";
import { POT_SLIDER } from "@/lib/interactive/switches";
import { nearestWireFoot } from "@/lib/schematic/netdraw";
import { useEditor } from "@/state/editor";
import { type Pt } from "./geometry";
import { NOTE_H, NOTE_W } from "@/lib/notes/markup";

export function getNetObstacles(doc: SchematicDoc): Array<{ x: number; y: number; w: number; h: number }> {
  return doc.instances.map((inst) => {
    const b = instanceBounds(inst);
    return { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 };
  });
}

/** Alle Pin-Positionen aller Bauteile — das Routing kreuzt keinen davon. */
export function getNetPinPoints(doc: SchematicDoc): Pt[] {
  const out: Pt[] = [];
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    const pins = partPins(part, inst.params);
    for (let i = 0; i < pins.length; i++) {
      const p = pinPosition(inst, i);
      out.push({ x: p.x, y: p.y });
    }
  }
  return out;
}

export function hitTestLabel(doc: SchematicDoc, p: Pt): import("@/lib/schematic/model").NetLabel | null {
  for (let i = doc.labels.length - 1; i >= 0; i--) {
    const l = doc.labels[i];
    const w = Math.max(28, (l.name?.length ?? 3) * 7 + 14);
    if (
      (Math.hypot(p.x - l.x, p.y - l.y) <= 8) ||
      (p.x >= l.x + 6 && p.x <= l.x + 8 + w && p.y >= l.y - 22 && p.y <= l.y - 2)
    ) {
      return l;
    }
  }
  return null;
}

export function getNoteBounds(n: import("@/lib/schematic/model").TextNote): { x: number; y: number; w: number; h: number } {
  // S5.23: Einheitskarte — der Zettel ist immer gleich groß, Text scrollt innen.
  return { x: n.x, y: n.y - 18, w: NOTE_W, h: NOTE_H };
}

export function hitTestNote(doc: SchematicDoc, p: Pt): import("@/lib/schematic/model").TextNote | null {
  for (let i = doc.notes.length - 1; i >= 0; i--) {
    const n = doc.notes[i];
    const b = getNoteBounds(n);
    if (p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) {
      return n;
    }
  }
  return null;
}

export function hitTestInstanceValueLabel(inst: Instance, p: Pt): boolean {
  const b = instanceBounds(inst);
  const cx = inst.x;
  const topY = b.y + b.h + 4;
  const botY = b.y + b.h + 34;
  return Math.abs(p.x - cx) <= Math.max(28, b.w * 0.55) && p.y >= topY && p.y <= botY;
}

export function findInstanceByValueLabel(doc: SchematicDoc, p: Pt): Instance | null {
  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i];
    if (hitTestInstanceValueLabel(inst, p)) return inst;
  }
  return null;
}

/* S5.26: Welt→Lokal (Inverse von drawInstance: Translate⁻¹ · Rotate⁻¹ · Mirror⁻¹). */
export function instanceLocalPoint(inst: Instance, p: Pt): Pt {
  const dx = p.x - inst.x;
  const dy = p.y - inst.y;
  const inv = ((360 - (inst.rot ?? 0)) % 360) as Rotation;
  const u = rotatePoint(dx, dy, inv, false);
  return inst.mirror ? { x: -u.x, y: u.y } : u;
}

/** S5.26: Poti-Schieber unter dem Zeiger (liegt bewusst außerhalb der Symbol-Bbox). */
export function findPotSliderAt(doc: SchematicDoc, p: Pt): Instance | null {
  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i];
    if (PART_MAP[inst.partId]?.interactive !== "pot") continue;
    const l = instanceLocalPoint(inst, p);
    if (
      Math.abs(l.x - POT_SLIDER.x) <= POT_SLIDER.hitHalfW
      && l.y >= POT_SLIDER.yTop - POT_SLIDER.hitPad
      && l.y <= POT_SLIDER.yBot + POT_SLIDER.hitPad
    ) return inst;
  }
  return null;
}

/** S5.26: DIP-Hebel (1-basiert) unter dem Zeiger — nächstgelegene Reihe gewinnt. */
export function dipLeverAt(partId: string, inst: Instance, p: Pt): number | null {
  const part = PART_MAP[partId];
  if (!part) return null;
  const rows = partPins(part, inst.params).filter((q) => q.x < 0).sort((a, b) => a.y - b.y);
  if (!rows.length) return null;
  const l = instanceLocalPoint(inst, p);
  let best = 1;
  let bestD = Infinity;
  rows.forEach((row, i) => {
    const d = Math.abs(l.y - row.y);
    if (d < bestD) { bestD = d; best = i + 1; }
  });
  return best;
}

/** W54: nächstes Leitungssegment unter dem Zeiger (für das Segment-Ziehen). */
export function hitWireSegment(doc: SchematicDoc, x: number, y: number, tol = 8): { wireId: string; segIdx: number; dist: number } | null {
  let best: { wireId: string; segIdx: number; dist: number } | null = null;
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
      if (d <= tol && (!best || d < best.dist)) best = { wireId: w.id, segIdx: i, dist: d };
    }
  }
  return best;
}

export function hitWire(doc: SchematicDoc, p: Pt, tol = 6): string | null {
  const tol2 = tol * tol;
  for (const w of doc.wires) for (let i=0;i+1<w.points.length;i++) {
    const a=w.points[i], b=w.points[i+1]; const dx=b.x-a.x, dy=b.y-a.y; const len2=dx*dx+dy*dy||1;
    let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t));
    const cx=a.x+t*dx, cy=a.y+t*dy;
    if ((cx-p.x)**2+(cy-p.y)**2 < tol2) return w.id;
  }
  return null;
}
/** Runde 17 (W32c): Anschlusspunkt für die Messleitung – Bauteil-Pin zuerst,
 *  sonst Leitungsende (verbindet sicheres Raster) bzw. Projektion aufs Segment. */
export function probeTarget(doc: SchematicDoc, p: Pt): Pt | null {
  let best: Pt | null = null;
  let bestD = 144; // 12 px
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < partPins(part, inst.params).length; idx++) {
      const pos = pinPosition(inst, idx);
      const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = pos; }
    }
  }
  if (best) return best;
  let segBest: { x: number; y: number; d: number } | null = null;
  let endBest: { x: number; y: number; d: number } | null = null;
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx, cy = a.y + t * dy;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (d < 6 && (!segBest || d < segBest.d)) segBest = { x: cx, y: cy, d };
    }
    for (const pt of w.points) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < 10 && (!endBest || d < endBest.d)) endBest = { x: pt.x, y: pt.y, d };
    }
  }
  if (endBest) return { x: endBest.x, y: endBest.y };
  return segBest ? { x: segBest.x, y: segBest.y } : null;
}
export function hitWireHandle(doc: SchematicDoc, p: Pt, zoom: number, onlySelected = true, baseRadius = 12): { wireId: string; pointIdx: number; isMid?: boolean; segIdx?: number; dist: number } | null {
  const st = useEditor.getState();
  const sel = onlySelected ? st.selection : doc.wires.map(w=>w.id);
  const hitRadius = baseRadius / Math.max(zoom, 0.3); // generous hit for delightful grabbing
  const midBase = Math.max(10, baseRadius - 2);
  let best: any = null;
  let bestDist = Infinity;
  for (const wireId of sel) {
    const wire = doc.wires.find(w=>w.id===wireId);
    if (!wire) continue;
    // point handles
    for (let idx=0; idx<wire.points.length; idx++) {
      const pt = wire.points[idx];
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < hitRadius && d < bestDist) {
        bestDist = d;
        best = { wireId, pointIdx: idx, dist: d };
      }
    }
    // mid handles
    for (let s=0; s<wire.points.length-1; s++) {
      const a = wire.points[s];
      const b = wire.points[s+1];
      const mx = Math.round(((a.x + b.x)/2) / GRID) * GRID;
      const my = Math.round(((a.y + b.y)/2) / GRID) * GRID;
      const d = Math.hypot(mx - p.x, my - p.y);
      const midRadius = midBase / Math.max(zoom, 0.3);
      if (d < midRadius && d < bestDist) {
        bestDist = d;
        best = { wireId, pointIdx: s+1, isMid: true, segIdx: s, dist: d };
      }
    }
  }
  // If no selected hit, try all wires for mid handles when hovered (for discoverability)
  if (!best && !onlySelected) {
    for (const wire of doc.wires) {
      for (let s=0; s<wire.points.length-1; s++) {
        const a = wire.points[s];
        const b = wire.points[s+1];
        const mx = Math.round(((a.x + b.x)/2) / GRID) * GRID;
        const my = Math.round(((a.y + b.y)/2) / GRID) * GRID;
        const d = Math.hypot(mx - p.x, my - p.y);
        const midRadius = midBase / Math.max(zoom, 0.3);
        if (d < midRadius && d < bestDist) {
          bestDist = d;
          best = { wireId: wire.id, pointIdx: s+1, isMid: true, segIdx: s, dist: d };
        }
      }
    }
  }
  return best;
}
export function nearestNetName(p: Pt, radius=14): string | null {
  const st=useEditor.getState(); let best:string|null=null, bestD=radius*radius;
  for (const net of st.netResult.nets) for (const pt of net.points) {
    const d=(pt.x-p.x)**2+(pt.y-p.y)**2; if (d<bestD){ bestD=d; best=net.name; }
  }
  const foot = nearestWireFoot(st.doc, p, radius);
  if (foot && foot.dist * foot.dist <= bestD) {
    const w = st.doc.wires.find((x) => x.id === foot.wireId);
    const a = w?.points[foot.segIdx];
    if (a) {
      const segNet = st.netResult.pointNets[`${Math.round(a.x)},${Math.round(a.y)}`];
      if (segNet) return segNet;
    }
  }
  if (best) return best;
  const wireId=hitWire(st.doc,p);
  if (wireId) {
    const wire=st.doc.wires.find(w=>w.id===wireId);
    if (wire?.points.length) return st.netResult.pointNets[`${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`] ?? null;
  }
  return null;
}


export function findPinInfo(doc: SchematicDoc, p: Pt, r = 12) {
  const st = useEditor.getState();
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < partPins(part, inst.params).length; idx++) {
      const pos = pinPosition(inst, idx);
      if (Math.hypot(pos.x - p.x, pos.y - p.y) < r) {
        const pinName = partPins(part, inst.params)[idx].name ?? `Pin ${idx}`;
        const net = st.netResult.pinNets[`${inst.id}:${idx}`];
        return { inst, pinIdx: idx, pos, pinName, net };
      }
    }
  }
  return null;
}

export function hitTestProbe(doc: SchematicDoc, p: Pt, radius?: number) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const zoom = useEditor.getState().view.zoom;
  const iz = 1 / Math.max(zoom, 0.25);
  const r = (radius ?? (isMobile ? 24 : 14)) * iz;
  for (let i = doc.probes.length - 1; i >= 0; i--) {
    const pr = doc.probes[i];
    // W87/W93: Trifft das gesamte vergrößerte Multisim-Anzeigekästchen (ab pr.x nach rechts,
    // vertikal zentriert um pr.y) sowie den Bereich direkt um (pr.x, pr.y).
    const boxW = 158 * iz;
    const boxH = 58 * iz;
    if (
      p.x >= pr.x - 8 * iz &&
      p.x <= pr.x + boxW + 6 * iz &&
      p.y >= pr.y - boxH / 2 - 6 * iz &&
      p.y <= pr.y + boxH / 2 + 6 * iz
    ) {
      return pr;
    }
    if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= r * r) {
      return pr;
    }
  }
  return null;
}

export function hitTestProbeAnchor(doc: SchematicDoc, p: Pt, touchExpand = false) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const zoom = useEditor.getState().view.zoom;
  const iz = 1 / Math.max(zoom, 0.25);
  const hitR = (touchExpand || isMobile ? 18 : 11) * iz;
  for (let i = doc.probes.length - 1; i >= 0; i--) {
    const pr = doc.probes[i];
    const ax = pr.anchorX ?? pr.x;
    const ay = pr.anchorY ?? pr.y;
    if (Math.hypot(ax - p.x, ay - p.y) <= hitR) {
      return pr;
    }
  }
  return null;
}
