/**
 * Runde 25–27 (W62–W64, W70, W76–W80): Netz zeichnen & bearbeiten wie in Multisim.
 *
 * Enthält (ohne DOM, direkt testbar):
 *  · `normalizeDocGeometry` – Bauteile aufs Raster, Leitungsenden auf Pins,
 *    rechte Winkel.
 *  · `findNetTarget` / `buildNetPath` / `finishNetDraft` – Anschluss-Magnet,
 *    Hindernis-Ausweichen, Pin-Abgangsrichtung und Abschluss im freien Raum.
 *  · `dragWireSegmentOrtho` / `dragWireCornerOrtho` – streng orthogonales
 *    Ziehen an Leitungssegmenten und Ecken ohne Pin-Abriss.
 *  · `insertComponentIntoWires` – Bauteil in eine bestehende Leitung einsetzen
 *    trennt das überbrückte Segment auf (Reihenschaltung statt Kurzschluss).
 *  · `cleanOrphanJunctions` – verwaiste Verbindungspunkte nach dem Löschen oder
 *    Umbauen von Leitungen aufräumen.
 */
import { PART_MAP } from "@/lib/library/catalog";
import {
  GRID,
  type SchematicDoc,
  attachWireEnd,
  cleanWirePoints,
  orthogonalizeWirePoints,
  pinPosition,
  snapWiresToPins,
  straightenWirePoints,
  pointOnSegment,
} from "@/lib/schematic/model";
import { routeOrthogonal, type Rect } from "@/lib/schematic/tools";

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
  if (Array.isArray(doc.labels)) {
    for (const l of doc.labels) {
      l.x = Math.round(l.x / grid) * grid;
      l.y = Math.round(l.y / grid) * grid;
    }
  }
  if (Array.isArray(doc.junctions)) {
    for (const j of doc.junctions) {
      j.x = Math.round(j.x / grid) * grid;
      j.y = Math.round(j.y / grid) * grid;
    }
  }
  if (Array.isArray(doc.probes)) {
    for (const pr of doc.probes) {
      pr.x = Math.round(pr.x / grid) * grid;
      pr.y = Math.round(pr.y / grid) * grid;
      if (typeof pr.anchorX === "number") pr.anchorX = Math.round(pr.anchorX / grid) * grid;
      if (typeof pr.anchorY === "number") pr.anchorY = Math.round(pr.anchorY / grid) * grid;
    }
  }
  const snap1 = snapWiresToPins(doc, pinTol);
  let wires = 0;
  for (const w of doc.wires) {
    const before = w.points;
    const after = orthogonalizeWirePoints(before, grid, contactKeep(doc, w.id));
    const changed =
      after.length !== before.length ||
      after.some((p, i) => p.x !== before[i].x || p.y !== before[i].y);
    if (changed) wires++;
    w.points = after;
  }
  const snap2 = snapWiresToPins(doc, pinTol);
  return { instances, ends: snap1.moved + snap2.moved, wires };
}

/**
 * W70: Punkte, die beim Begradigen nicht verschwinden dürfen – dort hängt eine
 * andere Leitung, ein Pin, ein Netzlabel oder ein Verbindungspunkt.
 */
export function contactKeep(doc: SchematicDoc, wireId: string): (p: Pt) => boolean {
  const anchors = new Set<string>();
  const kk = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < part.pins.length; idx++) {
      const q = pinPosition(inst, idx);
      anchors.add(kk(q.x, q.y));
    }
  }
  for (const l of doc.labels) anchors.add(kk(l.x, l.y));
  for (const j of doc.junctions ?? []) anchors.add(kk(j.x, j.y));
  const others = doc.wires.filter((w) => w.id !== wireId);
  return (p: Pt) => {
    if (anchors.has(kk(p.x, p.y))) return true;
    for (const o of others) {
      for (const q of o.points) if (Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) return true;
      for (let i = 0; i + 1 < o.points.length; i++) {
        const a = o.points[i];
        const b = o.points[i + 1];
        if (pointOnSegment(p.x, p.y, a.x, a.y, b.x, b.y)) return true;
      }
    }
    return false;
  };
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
  /** Bei `kind === "pin"`: Bauteil-ID und Pin-Index. */
  instanceId?: string;
  pinIndex?: number;
  /** Kurztext für die Anzeige während des Zeichnens. */
  label: string;
}

/**
 * W64: Bester Anschlusspunkt in der Nähe des Zeigers. Reihenfolge wie in
 * Multisim: Pin vor Verbindungspunkt vor Leitung (Fußpunkt).
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
        best = {
          kind: "pin",
          x: q.x,
          y: q.y,
          instanceId: inst.id,
          pinIndex: idx,
          label: `${inst.label} · ${part.pins[idx]?.name ?? `Pin ${idx + 1}`}`,
        };
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

export function footOfPoint(a: Pt, b: Pt, p: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * W81: Nächster Fußpunkt auf irgendeinem Leitungssegment im Dokument (für
 * Probes, die mitten auf einer langen Leitung platziert oder verschoben werden).
 */
export function nearestWireFoot(
  doc: SchematicDoc,
  p: Pt,
  maxDist = 28,
): { x: number; y: number; wireId: string; segIdx: number; dist: number } | null {
  let best: { x: number; y: number; wireId: string; segIdx: number; dist: number } | null = null;
  let bestD = maxDist;
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const foot = footOfPoint(w.points[i], w.points[i + 1], p);
      const d = Math.hypot(foot.x - p.x, foot.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { x: foot.x, y: foot.y, wireId: w.id, segIdx: i, dist: d };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* W63 / W77 · Leitungsverlauf mit Hindernis-Ausweichen & Pin-Richtung */
/* ------------------------------------------------------------------ */

export interface NetPathOptions {
  /** Bevorzugte Richtung des ersten Segments ab dem letzten Punkt ("h" | "v"). */
  preferDir?: "h" | "v";
  /** Vom Nutzer per Leertaste umgeschaltete Knickrichtung. */
  flipBend?: boolean;
  /** Bauteil-BBoxen, die beim Zeichnen nicht geschnitten werden sollen. */
  obstacles?: Rect[];
  /** Fremde Pin-Punkte, die nicht gekreuzt werden sollen (Kurzschluss-Gefahr). */
  pinPoints?: Pt[];
}

function segHitsObstacle(a: Pt, b: Pt, boxes: Rect[]): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  if (dist < 1) return false;
  const steps = Math.max(2, Math.ceil(dist / 4));
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    for (const r of boxes) {
      if (x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1) return true;
    }
  }
  return false;
}

/**
 * W63/W77: Verlauf eines Netzes aus Anker, gesetzten Ecken und Ziel bauen.
 * Berücksichtigt optional die Abgangsrichtung vom Pin, ein manuelles Wenden
 * des Knicks (`flipBend`) sowie Bauteil-Hindernisse (`obstacles`).
 */
export function buildNetPath(anchor: Pt, corners: Pt[], target: Pt, opts?: NetPathOptions): Pt[] {
  const pts: Pt[] = [{ x: anchor.x, y: anchor.y }, ...corners.map((c) => ({ x: c.x, y: c.y }))];
  const last = pts[pts.length - 1];
  if (last.x !== target.x && last.y !== target.y) {
    let horizontalFirst = Math.abs(target.x - last.x) >= Math.abs(target.y - last.y);
    if (opts?.preferDir) {
      horizontalFirst = opts.preferDir === "h";
    } else if (corners.length > 0) {
      const prev = pts[pts.length - 2];
      if (prev.y === last.y && prev.x !== last.x) horizontalFirst = false;
      else if (prev.x === last.x && prev.y !== last.y) horizontalFirst = true;
    }
    if (opts?.flipBend) horizontalFirst = !horizontalFirst;

    const bendH = { x: target.x, y: last.y };
    const bendV = { x: last.x, y: target.y };
    // Start-/Zielpin sind ausgenommen (dort beginnt/endet die Leitung legal).
    // 8 px: das 4-px-Raster der Trefferprobe trifft das 6-px-Innere garantiert
    // (bei 6 px fielen Proben exakt auf die Kante und wurden übersehen).
    const pinRects: Rect[] = (opts?.pinPoints ?? [])
      .filter((q) => Math.hypot(q.x - last.x, q.y - last.y) > 6 && Math.hypot(q.x - target.x, q.y - target.y) > 6)
      .map((q) => ({ x: q.x - 4, y: q.y - 4, w: 8, h: 8 }));
    const boxes = [...(opts?.obstacles ?? []), ...pinRects];
    if (boxes.length > 0) {
      const pref = horizontalFirst ? bendH : bendV;
      const alt = horizontalFirst ? bendV : bendH;
      const hitPref = segHitsObstacle(last, pref, boxes) || segHitsObstacle(pref, target, boxes);
      const hitAlt = segHitsObstacle(last, alt, boxes) || segHitsObstacle(alt, target, boxes);
      if (hitPref && !hitAlt) {
        pts.push(alt, { x: target.x, y: target.y });
        return cleanWirePoints(pts);
      }
      // Kürzeste freie Route (A*) — auch nach manuell gesetzten Ecken, dann ab
      // der letzten Ecke. Manuelle Ecken bleiben stehen (Fixpunkte).
      if (hitPref && hitAlt) {
        const routed = routeOrthogonal(last, target, opts?.obstacles ?? [], GRID, opts?.pinPoints ?? []);
        if (routed.length >= 2) {
          return cleanWirePoints([...pts.slice(0, -1), ...routed]);
        }
      }
    }
    pts.push(horizontalFirst ? bendH : bendV);
  }
  pts.push({ x: target.x, y: target.y });
  return cleanWirePoints(pts);
}

/** W63/W77: Vorschau (Anker → gesetzte Ecken → Zeiger) mit mitlaufendem Knick. */
export function previewNetPath(anchor: Pt, corners: Pt[], cursor: Pt, opts?: NetPathOptions): Pt[] {
  return buildNetPath(anchor, corners, cursor, opts);
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
/* W63 / W77 · Klickfolge im Netzmodus                                 */
/* ------------------------------------------------------------------ */

export interface NetDraft {
  /** Anschlusspunkt, an dem das Netz beginnt (Pin, Leitung, Verbindungspunkt oder freie Stelle). */
  anchor: Pt;
  /** Bereits gesetzte Eckpunkte. */
  corners: Pt[];
  /** Bevorzugte Abgangsrichtung vom Start-Pin ("h" | "v"). */
  preferDir?: "h" | "v";
  /** Per Leertaste gewendete Knick-Orientierung für das aktuelle Segment. */
  flipBend?: boolean;
}

export type NetClickResult =
  | { kind: "start"; draft: NetDraft }
  | { kind: "corner"; draft: NetDraft }
  | { kind: "finish"; points: Pt[]; target: NetTarget };

function inferPinOutDir(doc: SchematicDoc, target: NetTarget): "h" | "v" | undefined {
  if (target.kind !== "pin" || !target.instanceId) return undefined;
  const inst = doc.instances.find((i) => i.id === target.instanceId);
  if (!inst) return undefined;
  const dx = target.x - inst.x;
  const dy = target.y - inst.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return undefined;
  return Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
}

/**
 * W63/W77: Ein Klick im Netzmodus.
 *
 *  · ohne laufendes Netz: Klick auf Pin (oder mit `allowStartOnEmpty` ins Leere)
 *    startet das Netz,
 *  · mit laufendem Netz: Klick auf Pin/Verbindungspunkt/Leitung schließt an,
 *    jeder andere Klick setzt einen Eckpunkt (inkl. Zwischenknick, damit
 *    gesetzte Segmente streng orthogonal bleiben).
 */
export function netClick(
  doc: SchematicDoc,
  draft: NetDraft | null,
  world: Pt,
  snapPt: Pt,
  opts: { magnet: number; allowStartOnEmpty: boolean; startOnWire?: boolean; obstacles?: Rect[]; pinPoints?: Pt[] },
): NetClickResult | null {
  if (!draft) {
    const target = findNetTarget(doc, world, opts.magnet);
    const startTarget = target && (target.kind === "pin" || opts.startOnWire) ? target : null;
    if (startTarget) {
      return {
        kind: "start",
        draft: {
          anchor: { x: startTarget.x, y: startTarget.y },
          corners: [],
          preferDir: inferPinOutDir(doc, startTarget),
          flipBend: false,
        },
      };
    }
    if (opts.allowStartOnEmpty) {
      return { kind: "start", draft: { anchor: { x: snapPt.x, y: snapPt.y }, corners: [], flipBend: false } };
    }
    return null;
  }
  const ref = draft.corners.length ? draft.corners[draft.corners.length - 1] : draft.anchor;
  const target = findNetTarget(doc, world, opts.magnet);
  const pathOpts: NetPathOptions = {
    preferDir: draft.corners.length === 0 ? draft.preferDir : undefined,
    flipBend: draft.flipBend,
    obstacles: opts.obstacles,
    pinPoints: opts.pinPoints,
  };
  if (target && Math.hypot(target.x - ref.x, target.y - ref.y) > 0.01) {
    return {
      kind: "finish",
      points: buildNetPath(draft.anchor, draft.corners, { x: target.x, y: target.y }, pathOpts),
      target,
    };
  }
  const same = Math.abs(ref.x - snapPt.x) < 0.01 && Math.abs(ref.y - snapPt.y) < 0.01;
  if (same) return { kind: "corner", draft };

  // Liegt der neue Eckpunkt nicht achsenparallel zum letzten Punkt, wird der
  // Vorschau-Knick mit übernommen, damit gesetzte Segmente immer 90° bleiben.
  const nextCorners = [...draft.corners];
  if (ref.x !== snapPt.x && ref.y !== snapPt.y) {
    const stepPts = buildNetPath(draft.anchor, draft.corners, snapPt, pathOpts);
    for (let i = 1; i < stepPts.length - 1; i++) {
      nextCorners.push({ x: stepPts[i].x, y: stepPts[i].y });
    }
  }
  nextCorners.push({ x: snapPt.x, y: snapPt.y });
  return {
    kind: "corner",
    draft: {
      anchor: draft.anchor,
      corners: nextCorners,
      preferDir: draft.preferDir,
      flipBend: false,
    },
  };
}

/**
 * W77: Angefangenes Netz im freien Raum abschließen (per Doppelklick).
 * Liefert die bereinigten Punkte oder `null`, wenn noch keine Strecke existiert.
 */
export function finishNetDraft(draft: NetDraft, cursorSnap?: Pt, opts?: NetPathOptions): Pt[] | null {
  const end = cursorSnap ?? (draft.corners.length ? draft.corners[draft.corners.length - 1] : draft.anchor);
  const pts = buildNetPath(draft.anchor, draft.corners, end, opts);
  if (pts.length < 2) return null;
  const len = pts.reduce((acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)), 0);
  return len >= 1 ? pts : null;
}

/* ------------------------------------------------------------------ */
/* W78 · Streng orthogonale Leitungs-Bearbeitung ohne Pin-Abriss       */
/* ------------------------------------------------------------------ */

/**
 * Prüft, ob ein Punkt auf einem Bauteil-Pin oder einem fremden Leitungskontakt
 * sitzt (und deshalb beim Ziehen eines Segments nicht abgerissen werden darf).
 */
export function isPinnedWireEnd(doc: SchematicDoc, wireId: string): (p: Pt) => boolean {
  return contactKeep(doc, wireId);
}

/**
 * W54/W78: Ein Leitungssegment `segIdx` senkrecht zu seiner Richtung um
 * `(dx, dy)` verschieben. Sitzt ein Ende des verschobenen Segments auf einem
 * Bauteil-Pin oder T-Kontakt (`isPinned`), bleibt der Anschlusspunkt fest am
 * Pin und es entsteht automatisch eine orthogonale 90°-Stufe.
 */
export function dragWireSegmentOrtho(
  orig: Pt[],
  segIdx: number,
  dx: number,
  dy: number,
  isPinned?: (p: Pt) => boolean,
): Pt[] {
  if (segIdx < 0 || segIdx + 1 >= orig.length) return orig.map((p) => ({ ...p }));
  const a = orig[segIdx];
  const b = orig[segIdx + 1];
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const moveX = horizontal ? 0 : dx;
  const moveY = horizontal ? dy : 0;
  if (moveX === 0 && moveY === 0) return orig.map((p) => ({ ...p }));

  const na = { x: a.x + moveX, y: a.y + moveY };
  const nb = { x: b.x + moveX, y: b.y + moveY };

  const pinStart = segIdx === 0 && Boolean(isPinned?.(a));
  const pinEnd = segIdx + 1 === orig.length - 1 && Boolean(isPinned?.(b));

  const out: Pt[] = [];
  for (let i = 0; i < orig.length; i++) {
    if (i === segIdx) {
      if (pinStart) {
        out.push({ x: a.x, y: a.y });
      }
      out.push(na);
    } else if (i === segIdx + 1) {
      out.push(nb);
      if (pinEnd) {
        out.push({ x: b.x, y: b.y });
      }
    } else {
      out.push({ x: orig[i].x, y: orig[i].y });
    }
  }
  return cleanWirePoints(out);
}

/**
 * W78: Einen Eck- oder Endpunkt `pointIdx` einer Leitung streng orthogonal auf
 * `target` ziehen. Anliegende Segmente gleiten im 90°-Winkel mit; angepinnte
 * Leitungsenden bleiben am Bauteil-Pin verankert.
 */
export function dragWireCornerOrtho(
  orig: Pt[],
  pointIdx: number,
  target: Pt,
  isPinned?: (p: Pt) => boolean,
): Pt[] {
  if (orig.length < 2 || pointIdx < 0 || pointIdx >= orig.length) {
    return orig.map((p) => ({ ...p }));
  }
  const pts = orig.map((p) => ({ ...p }));

  // Endpunkt wird gezogen -> attachWireEnd hält die Nachbarverbindung orthogonal
  if (pointIdx === 0 || pointIdx === pts.length - 1) {
    attachWireEnd(pts, pointIdx, target);
    return cleanWirePoints(pts);
  }

  // Innerer Eckpunkt: Nachbarpunkte orthogonal mitführen
  const oldP = orig[pointIdx];
  const prev = orig[pointIdx - 1];
  const next = orig[pointIdx + 1];
  pts[pointIdx] = { x: target.x, y: target.y };

  const prevHoriz = Math.abs(prev.y - oldP.y) <= Math.abs(prev.x - oldP.x);
  const nextHoriz = Math.abs(next.y - oldP.y) <= Math.abs(next.x - oldP.x);

  const pinFirst = pointIdx - 1 === 0 && Boolean(isPinned?.(prev));
  const pinLast = pointIdx + 1 === orig.length - 1 && Boolean(isPinned?.(next));

  if (prevHoriz) {
    pts[pointIdx - 1] = { x: prev.x, y: target.y };
  } else {
    pts[pointIdx - 1] = { x: target.x, y: prev.y };
  }

  if (nextHoriz) {
    pts[pointIdx + 1] = { x: next.x, y: target.y };
  } else {
    pts[pointIdx + 1] = { x: target.x, y: next.y };
  }

  // Falls der erste oder letzte Punkt auf einem Pin saß, Pin-Punkt davor/dahinter festhalten
  if (pinFirst && ( Math.abs(pts[0].x - prev.x) > 0.01 || Math.abs(pts[0].y - prev.y) > 0.01 )) {
    pts.unshift({ x: prev.x, y: prev.y });
  }
  if (pinLast) {
    const lastNow = pts[pts.length - 1];
    if (Math.abs(lastNow.x - next.x) > 0.01 || Math.abs(lastNow.y - next.y) > 0.01) {
      pts.push({ x: next.x, y: next.y });
    }
  }

  return cleanWirePoints(pts);
}

/* ------------------------------------------------------------------ */
/* W76 · Bauteil in Leitung einsetzen (In-Line-Split wie in Multisim)  */
/* ------------------------------------------------------------------ */

let splitUid = 1;
const nextWireId = () => `w_${Date.now().toString(36)}_${(splitUid++).toString(36)}`;
const nextJncId = () => `jnc_${Date.now().toString(36)}_${(splitUid++).toString(36)}`;

/**
 * W76: Platziert man ein Bauteil direkt auf eine durchgehende Leitung, sodass
 * zwei seiner Pins auf demselben Leitungssegment liegen, wird das Segment
 * zwischen diesen beiden Pins aufgetrennt (das Bauteil liegt dann in Reihe
 * statt kurzgeschlossen). Einzelne Pins nahe einer Leitung (≤ `connectTol`)
 * werden orthogonal angeschlossen.
 */
export function insertComponentIntoWires(
  doc: SchematicDoc,
  instanceId: string,
  connectTol = 20,
): { split: number; connected: number } {
  const inst = doc.instances.find((i) => i.id === instanceId);
  if (!inst) return { split: 0, connected: 0 };
  const part = PART_MAP[inst.partId];
  if (!part || !part.pins.length) return { split: 0, connected: 0 };

  const pins = part.pins.map((_, idx) => ({ idx, pos: pinPosition(inst, idx) }));
  const handledPins = new Set<number>();
  let split = 0;
  let connected = 0;

  // 1. In-Line-Split: Liegen ≥ 2 Pins desselben Bauteils auf demselben Leitungssegment?
  if (pins.length >= 2) {
    for (let wi = 0; wi < doc.wires.length; wi++) {
      const w = doc.wires[wi];
      let didSplit = false;
      for (let si = 0; si + 1 < w.points.length; si++) {
        const a = w.points[si];
        const b = w.points[si + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (segLen < 4) continue;

        const onSeg = pins
          .map((p) => {
            const foot = footOfPoint(a, b, p.pos);
            const dist = Math.hypot(foot.x - p.pos.x, foot.y - p.pos.y);
            const t = ((p.pos.x - a.x) * (b.x - a.x) + (p.pos.y - a.y) * (b.y - a.y)) / (segLen * segLen);
            return { ...p, dist, t };
          })
          .filter((p) => p.dist <= 2.5 && p.t >= -0.02 && p.t <= 1.02)
          .sort((x, y) => x.t - y.t);

        if (onSeg.length >= 2) {
          const pFirst = onSeg[0];
          const pLast = onSeg[onSeg.length - 1];
          if (Math.hypot(pLast.pos.x - pFirst.pos.x, pLast.pos.y - pFirst.pos.y) >= 4) {
            const leftPts = cleanWirePoints([...w.points.slice(0, si + 1), { x: pFirst.pos.x, y: pFirst.pos.y }]);
            const rightPts = cleanWirePoints([{ x: pLast.pos.x, y: pLast.pos.y }, ...w.points.slice(si + 1)]);
            const replacement: SchematicDoc["wires"] = [];
            if (leftPts.length >= 2 && Math.hypot(leftPts[leftPts.length - 1].x - leftPts[0].x, leftPts[leftPts.length - 1].y - leftPts[0].y) > 0.5) {
              replacement.push({ ...w, id: w.id, points: leftPts });
            }
            if (rightPts.length >= 2 && Math.hypot(rightPts[rightPts.length - 1].x - rightPts[0].x, rightPts[rightPts.length - 1].y - rightPts[0].y) > 0.5) {
              replacement.push({ ...w, id: replacement.length ? nextWireId() : w.id, points: rightPts });
            }
            doc.wires.splice(wi, 1, ...replacement);
            handledPins.add(pFirst.idx);
            handledPins.add(pLast.idx);
            split++;
            didSplit = true;
            break;
          }
        }
      }
      if (didSplit) break;
    }
  }

  // 2. Auto-Connect für verbleibende Pins nahe bestehenden Leitungen (orthogonal, kein Kurzschluss)
  const usedWiresForInstance = new Set<string>();
  for (const p of pins) {
    if (handledPins.has(p.idx)) continue;
    // Wenn der Pin bereits exakt auf einem Leitungsende oder Segment sitzt, nichts doppelt anlegen
    let alreadyTouching = false;
    for (const w of doc.wires) {
      for (let si = 0; si + 1 < w.points.length; si++) {
        if (pointOnSegment(p.pos.x, p.pos.y, w.points[si].x, w.points[si].y, w.points[si + 1].x, w.points[si + 1].y)) {
          alreadyTouching = true;
          usedWiresForInstance.add(w.id);
          break;
        }
      }
      if (alreadyTouching) break;
    }
    if (alreadyTouching) continue;

    let bestProj: { x: number; y: number; wireId: string; dist: number; isEnd: boolean } | null = null;
    for (const w of doc.wires) {
      if (usedWiresForInstance.has(w.id)) continue; // verhindert Kurzschluss zweier Pins an derselben Leitung
      for (let si = 0; si + 1 < w.points.length; si++) {
        const a = w.points[si];
        const b = w.points[si + 1];
        const proj = footOfPoint(a, b, p.pos);
        const dist = Math.hypot(p.pos.x - proj.x, p.pos.y - proj.y);
        if (dist > 0.5 && dist < connectTol && (!bestProj || dist < bestProj.dist)) {
          const isEnd =
            (si === 0 && Math.hypot(proj.x - a.x, proj.y - a.y) < 0.5) ||
            (si + 1 === w.points.length - 1 && Math.hypot(proj.x - b.x, proj.y - b.y) < 0.5);
          bestProj = { x: Math.round(proj.x / GRID) * GRID, y: Math.round(proj.y / GRID) * GRID, wireId: w.id, dist, isEnd };
        }
      }
    }
    if (bestProj) {
      const stub = buildNetPath(p.pos, [], { x: bestProj.x, y: bestProj.y });
      if (stub.length >= 2) {
        doc.wires.push({ id: nextWireId(), points: stub });
        usedWiresForInstance.add(bestProj.wireId);
        if (!bestProj.isEnd) {
          if (!Array.isArray(doc.junctions)) doc.junctions = [];
          const jx = bestProj.x;
          const jy = bestProj.y;
          if (!doc.junctions.some((j) => Math.hypot(j.x - jx, j.y - jy) < 0.5)) {
            doc.junctions.push({ id: nextJncId(), x: jx, y: jy });
          }
        }
        connected++;
      }
    }
  }

  return { split, connected };
}

/* ------------------------------------------------------------------ */
/* W80 · Verwaiste Verbindungspunkte (Junctions) bereinigen            */
/* ------------------------------------------------------------------ */

/**
 * W80: Entfernt Verbindungspunkte aus `doc.junctions`, die nach dem Löschen
 * oder Verschieben von Leitungen nicht mehr auf einem Treffpunkt mindestens
 * zweier Leitungen sitzen.
 */
export function cleanOrphanJunctions(doc: SchematicDoc): number {
  if (!doc.junctions?.length) return 0;
  const before = doc.junctions.length;
  doc.junctions = doc.junctions.filter((j) => {
    let wiresTouching = 0;
    for (const w of doc.wires) {
      let touchesThisWire = false;
      for (let i = 0; i + 1 < w.points.length; i++) {
        if (pointOnSegment(j.x, j.y, w.points[i].x, w.points[i].y, w.points[i + 1].x, w.points[i + 1].y)) {
          touchesThisWire = true;
          break;
        }
      }
      if (touchesThisWire) wiresTouching++;
      if (wiresTouching >= 2) return true;
    }
    return false;
  });
  return before - doc.junctions.length;
}
