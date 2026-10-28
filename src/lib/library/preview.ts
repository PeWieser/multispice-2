/**
 * S5.18: Vorschaubilder passen sich dem Symbol an. Zuvor nahm die Vorschau
 * starr eine 48er-Box an — ICs (z. B. 70×96) zeigten nur einen leeren
 * Mittelausschnitt. Jetzt: Bounding-Box → Fit-Skalierung, Strichstärke
 * kompensiert (optisch konstant).
 */
import type { SymbolPrim } from "./catalog";

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export function symbolBBox(prims: SymbolPrim[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pt = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const prim of prims) {
    switch (prim.t) {
      case "line":
        for (let i = 0; i + 1 < prim.pts.length; i += 2) pt(prim.pts[i], prim.pts[i + 1]);
        break;
      case "rect":
        pt(prim.x, prim.y);
        pt(prim.x + prim.w, prim.y + prim.h);
        break;
      case "circle":
      case "arc":
        pt(prim.x - prim.r, prim.y - prim.r);
        pt(prim.x + prim.r, prim.y + prim.r);
        break;
      case "text":
        pt(prim.x, prim.y);
        break;
    }
  }
  if (!Number.isFinite(minX)) return { minX: -24, minY: -24, maxX: 24, maxY: 24 };
  return { minX, minY, maxX, maxY };
}

export type PreviewFit = { scale: number; cx: number; cy: number; lineWidth: number };

/** Skalierung + Zentrum + kompensierte Strichstärke für `size`-px-Box. */
export function previewFit(prims: SymbolPrim[], size: number): PreviewFit {
  const b = symbolBBox(prims);
  const w = Math.max(b.maxX - b.minX, 1);
  const h = Math.max(b.maxY - b.minY, 1);
  const base = size / 48; // historische Norm-Skalierung (= sichtbare Stärke 1,5)
  const scale = Math.min(size / 12, (Math.min(size / w, size / h) * 0.86));
  return {
    scale,
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    lineWidth: Math.max(0.4, 1.5 * (base / scale)),
  };
}
