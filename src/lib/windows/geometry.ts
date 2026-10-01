/**
 * Runde 21 (W42/W43): Reine Geometrie des globalen Fenstermanagers.
 *
 * Alles, was beim Öffnen, Ziehen und Skalieren gerechnet wird, lebt hier – ohne
 * DOM, damit es prüfbar bleibt (`scripts/windowtest.ts`). Die Komponenten
 * (`Instruments.tsx`, `DeviceFit.tsx`) rufen nur noch diese Funktionen auf.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Die vier Eck-Griffe (Nutzer-Entscheidung R21: „4 Ecken-Transformation“). */
export type Corner = "nw" | "ne" | "sw" | "se";

/** Rand, den Fenster zum Bildschirmrand einhalten. */
export const SCREEN_MARGIN = 8;

/**
 * Runde 21 (W44): Rahmen aus Werkbank-Hintergrund um Geräte-Fenster. Nutzerwunsch
 * („den Hintergrund möchte ich doch wieder haben, das sah schöner aus") – als
 * schmaler, symmetrischer Rahmen statt großer Lücken links und rechts.
 */
export const BENCH_PAD = 12;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const round = (v: number) => Math.round(v);

/**
 * Startgröße eines Fensters beim Öffnen: Fenster = sichtbarer Inhalt + Chrome,
 * geklemmt auf Bildschirm und Mindestmaß.
 *
 * Wichtig (Runde 21, W42): Ist der Bildschirm niedriger als das Gerät, wächst
 * die Skalierung nicht über den Platz hinaus – `dispW/dispH` sind dann kleiner
 * als das Naturmaß. Genau diese **angezeigte** Größe bestimmt die Fensterbreite,
 * sonst standen links und rechts große Lücken neben dem Oszi.
 */
export function fitWindowSize(opts: {
  /** Naturmaß des Inhalts/Geräts (Layoutgröße, unskaliert). */
  natural: Size;
  /** Tatsächlich angezeigte Größe (Naturmaß × Skalierung ≤ 1). */
  disp: Size;
  /** Chrome-Reste: Fensterbreite − Inhaltsbreite bzw. Fensterhöhe − Inhaltshöhe. */
  slack: Size;
  viewport: Size;
  min: Size;
  /** Werkbank-Rahmen je Seite (Geräte: BENCH_PAD, Panels: 0). */
  pad?: number;
}): Size {
  const { natural, disp, slack, viewport, min } = opts;
  const pad = (opts.pad ?? 0) * 2;
  const maxW = Math.min(natural.w + pad + slack.w, viewport.w - SCREEN_MARGIN);
  const maxH = Math.min(natural.h + pad + slack.h, viewport.h - SCREEN_MARGIN);
  const wantW = Math.min(disp.w + pad + slack.w, maxW);
  const wantH = Math.min(disp.h + pad + slack.h, maxH);
  return {
    w: round(clamp(wantW, Math.min(min.w, maxW), maxW)),
    h: round(clamp(wantH, Math.min(min.h, maxH), maxH)),
  };
}

/**
 * Zug an einem Eck-Griff (Runde 21, W43).
 *
 * - `aspect` gesetzt (Geräte: Oszi/FG): die Skalierung wird auf die Diagonale
 *   projiziert, das Fenster behält exakt seine Proportionen; die gegenüber-
 *   liegende Ecke bleibt stehen.
 * - `aspect` null (Panels): frei in beide Richtungen, Mindestmaß und ggf.
 *   Obergrenze werden eingehalten.
 *
 * Grenzen: Mindestmaß immer, Obergrenze (`max`, bei Geräten die Startgröße
 * „Gerät + Chrome“) und der Bildschirmrand.
 */
export function resizeRect(opts: {
  rect: Rect;
  corner: Corner;
  dx: number;
  dy: number;
  /** Seitenverhältnis für Geräte-Fenster, null = frei skalierbar. */
  aspect: number | null;
  min: Size;
  /** Obergrenze (Geräte: Gerät + Chrome); null = nur der Bildschirm begrenzt. */
  max: Size | null;
  viewport: Size;
}): Rect {
  const { rect, corner, dx, dy, aspect, min, max, viewport } = opts;
  const sx = corner === "ne" || corner === "se" ? 1 : -1; // rechte Kante zieht
  const sy = corner === "sw" || corner === "se" ? 1 : -1; // untere Kante zieht

  // Platz bis zum Bildschirmrand – die gegenüberliegende Ecke ist der Anker.
  const roomW = sx > 0 ? viewport.w - SCREEN_MARGIN - rect.x : rect.x + rect.w - SCREEN_MARGIN;
  const roomH = sy > 0 ? viewport.h - SCREEN_MARGIN - rect.y : rect.y + rect.h - SCREEN_MARGIN;
  const limitW = Math.max(min.w, Math.min(max?.w ?? Infinity, roomW));
  const limitH = Math.max(min.h, Math.min(max?.h ?? Infinity, roomH));

  let w: number;
  let h: number;
  if (aspect && aspect > 0) {
    const denom = rect.w * rect.w + rect.h * rect.h;
    const s = 1 + (sx * dx * rect.w + sy * dy * rect.h) / Math.max(denom, 1);
    const lo = Math.max(min.w / rect.w, min.h / rect.h);
    const hi = Math.max(lo, Math.min(limitW / rect.w, limitH / rect.h));
    const sClamped = clamp(s, lo, hi);
    w = round(rect.w * sClamped);
    h = round(rect.h * sClamped);
  } else {
    w = round(clamp(rect.w + sx * dx, min.w, limitW));
    h = round(clamp(rect.h + sy * dy, min.h, limitH));
  }

  return {
    x: round(sx > 0 ? rect.x : rect.x + rect.w - w),
    y: round(sy > 0 ? rect.y : rect.y + rect.h - h),
    w,
    h,
  };
}

/** Beschriftung/Cursor der vier Eck-Griffe (Nordwest/Südost = nwse). */
export const CORNER_CURSOR: Record<Corner, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
};

/** Griff-Position im Fenster (Prozentangaben fürs Layout). */
export const CORNER_STYLE: Record<Corner, { top?: number; bottom?: number; left?: number; right?: number }> = {
  nw: { top: 0, left: 0 },
  ne: { top: 0, right: 0 },
  sw: { bottom: 0, left: 0 },
  se: { bottom: 0, right: 0 },
};
