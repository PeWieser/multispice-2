/* Runde 13 (W26) & Runde 28 (W82): Orthogonales Mitführen von Leitungen.
 * Wenn ein Leitungsende an einem verschobenen Bauteil-Pin hängt, wird die
 * Verbindung im 90°-Winkel nachgezogen: vorhandene Knickpunkte werden neu
 * positioniert (statt neue aufzustapeln), neue L-Knicke wählen die Variante,
 * die keine fremden Bauteil-BBoxen schneidet, und das gegenüberliegende
 * Leitungsende bleibt unverrückbar am Ziel-Pin verankert. */

export type OPt = { x: number; y: number };
export type OBox = { x: number; y: number; w: number; h: number };

const ptInBox = (p: OPt, r: OBox) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

function segHitsBox(a: OPt, b: OPt, boxes: OBox[]): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  if (dist < 1e-3) return false;
  const steps = Math.max(2, Math.ceil(dist / 5));
  for (const r of boxes) {
    // Liegt ein Pin-Endpunkt bereits im aufgeblasenen Rand (Padding) seines
    // eigenen Bauteils, zählt nur ein Segment als Kollision, das tiefer in das
    // Bauteil-Innere (ohne das 6-px-Padding) hineinläuft oder entlang der
    // Gehäusekante verläuft.
    const core: OBox = {
      x: r.x + 5,
      y: r.y + 5,
      w: Math.max(2, r.w - 10),
      h: Math.max(2, r.h - 10),
    };
    const aInPad = ptInBox(a, r);
    const bInPad = ptInBox(b, r);
    const boxToTest = aInPad || bInPad ? core : r;
    for (let i = 1; i < steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      if (x > boxToTest.x && x < boxToTest.x + boxToTest.w && y > boxToTest.y && y < boxToTest.y + boxToTest.h) {
        return true;
      }
    }
    // Wenn das Segment direkt auf der Kante eines gepaddeten Bauteils entlangläuft
    // (z. B. senkrecht am Pin eines IC-Gehäuses), ebenfalls als Hindernis werten:
    if (aInPad && ptInBox(b, r)) return true;
  }
  return false;
}

const samePt = (a: OPt, b: OPt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
const aligned = (a: OPt, b: OPt) => Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;

function pickBend(end: OPt, fixed: OPt, boxes: OBox[]): OPt {
  // b2 führt vom festen Pin zunächst entlang der längeren/bisherigen Achse weg
  // und knickt erst am bewegten Ende ab; b1 knickt direkt am festen Pin ab.
  const b1 = { x: fixed.x, y: end.y };
  const b2 = { x: end.x, y: fixed.y };
  const hit1 = segHitsBox(end, b1, boxes) || segHitsBox(b1, fixed, boxes);
  const hit2 = segHitsBox(end, b2, boxes) || segHitsBox(b2, fixed, boxes);
  if (hit1 && !hit2) return b2;
  if (hit2 && !hit1) return b1;
  // Beide frei: bevorzuge den Knick, der zuerst entlang der längeren Distanz
  // vom festen Pin wegführt (verhindert Abknicken quer über den festen Pin).
  return Math.abs(end.x - fixed.x) >= Math.abs(end.y - fixed.y) ? b2 : b1;
}

/** Entfernt doppelte Punkte und kollineare Zwischenpunkte in-place, lässt aber
 *  den ersten und letzten Punkt (die beiden Leitungsenden) garantiert stehen. */
function cleanInPlace(pts: OPt[]): void {
  for (let i = pts.length - 1; i >= 1; i--) {
    if (samePt(pts[i], pts[i - 1])) pts.splice(i, 1);
  }
  for (let i = pts.length - 2; i >= 1; i--) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    if (
      (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) ||
      (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)
    ) {
      pts.splice(i, 1);
    }
  }
}

/**
 * pts: Leitungspunkte (Kopien), idx: Index des gerade bewegten Endes (0 oder
 * pts.length-1). boxes: BBoxen fremder Bauteile (Hindernisse).
 */
export function orthoFollow(pts: OPt[], idx: number, boxes: OBox[]): void {
  if (pts.length < 2) return;
  const isStart = idx === 0;
  const endIdx = isStart ? 0 : pts.length - 1;
  const inner = isStart ? 1 : pts.length - 2;
  const end = pts[endIdx];
  const a = pts[inner];

  if (pts.length === 2) {
    if (aligned(end, a)) {
      cleanInPlace(pts);
      return;
    }
    // W82: Zwischen Punkt 0 und Punkt 1 liegt IMMER Index 1 (niemals Index 0,
    // sonst würde das feste Leitungsende pts[0] vom Pin verdrängt!).
    pts.splice(1, 0, pickBend(end, a, boxes));
    cleanInPlace(pts);
    return;
  }

  // 3+ Punkte: Liegt am inneren Punkt bereits ein Knick (achsenparallel zu seinem
  // Nachfolger), wird er neu positioniert statt einen weiteren einzufügen.
  const next = isStart ? pts[inner + 1] : pts[inner - 1];
  if (next && aligned(a, next)) {
    const c1 = { x: next.x, y: end.y }; // end→c1 horizontal, c1→next vertikal
    const c2 = { x: end.x, y: next.y }; // end→c2 vertikal, c2→next horizontal
    const pref = Math.abs(a.x - next.x) < 0.01 ? c1 : c2; // alte Orientierung behalten
    const alt = pref === c1 ? c2 : c1;
    const hitPref = segHitsBox(end, pref, boxes) || segHitsBox(pref, next, boxes);
    const hitAlt = segHitsBox(end, alt, boxes) || segHitsBox(alt, next, boxes);
    pts[inner] = hitPref && !hitAlt ? alt : pref;
    cleanInPlace(pts);
    return;
  }

  if (aligned(end, a)) {
    cleanInPlace(pts);
    return;
  }
  const insertAt = isStart ? 1 : pts.length - 1;
  pts.splice(insertAt, 0, pickBend(end, a, boxes));
  cleanInPlace(pts);
}
