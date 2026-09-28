/* Runde 13 (W26): Orthogonales Mitführen von Leitungen.
 * Wenn ein Leitungsende an einem verschobenen Bauteil-Pin hängt, wird die
 * Verbindung im 90°-Winkel nachgezogen: vorhandene Knickpunkte werden neu
 * positioniert (statt neue aufzustapeln), neue L-Knicke wählen die Variante,
 * die keine fremden Bauteil-BBoxen schneidet. */

export type OPt = { x: number; y: number };
export type OBox = { x: number; y: number; w: number; h: number };

function segHitsBox(a: OPt, b: OPt, boxes: OBox[]): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(dist / 5));
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    for (const r of boxes) {
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
    }
  }
  return false;
}

const aligned = (a: OPt, b: OPt) => a.x === b.x || a.y === b.y;

function pickBend(end: OPt, a: OPt, boxes: OBox[]): OPt {
  const b1 = { x: a.x, y: end.y }; // erst horizontal, dann vertikal
  const b2 = { x: end.x, y: a.y }; // erst vertikal, dann horizontal
  const hit1 = segHitsBox(end, b1, boxes) || segHitsBox(b1, a, boxes);
  const hit2 = segHitsBox(end, b2, boxes) || segHitsBox(b2, a, boxes);
  return hit1 && !hit2 ? b2 : b1;
}

/**
 * pts: Leitungspunkte (Kopien), idx: Index des gerade bewegten Endes (0 oder
 * pts.length-1). boxes: BBoxen fremder Bauteile (Hindernisse).
 */
export function orthoFollow(pts: OPt[], idx: number, boxes: OBox[]): void {
  if (pts.length < 2) return;
  const inner = idx === 0 ? 1 : pts.length - 2;
  const end = pts[idx];
  const a = pts[inner];

  if (pts.length === 2) {
    if (aligned(end, a)) return;
    pts.splice(inner, 0, pickBend(end, a, boxes));
    return;
  }

  // 3+ Punkte: Liegt am inneren Punkt bereits ein Knick (achsenhaft zu seinem
  // Nachfolger), wird er neu positioniert statt einen weiteren einzufügen.
  const next = idx === 0 ? pts[inner + 1] : pts[inner - 1];
  if (aligned(a, next)) {
    const c1 = { x: next.x, y: end.y }; // end→c1 horizontal, c1→next vertikal
    const c2 = { x: end.x, y: next.y }; // end→c2 vertikal, c2→next horizontal
    const pref = a.x === next.x ? c1 : c2; // alte Orientierung behalten
    const alt = pref === c1 ? c2 : c1;
    const hitPref = segHitsBox(end, pref, boxes) || segHitsBox(pref, next, boxes);
    const hitAlt = segHitsBox(end, alt, boxes) || segHitsBox(alt, next, boxes);
    pts[inner] = hitPref && !hitAlt ? alt : pref;
    return;
  }

  if (aligned(end, a)) return;
  pts.splice(inner, 0, pickBend(end, a, boxes));
}
