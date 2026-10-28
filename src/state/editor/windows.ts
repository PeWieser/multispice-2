
import { BENCH_PAD } from "@/lib/windows/geometry";

/** Runde 17 (W32a): Rückholhilfe – zieht ein Fenster wieder in den sichtbaren
 *  Bereich, wenn es (fast) vollständig außerhalb liegt. Fenster-Koordinaten sind
 *  Layer-relativ (Canvas-Ebene ≈ Viewport minus Menü-/Werkzeugleisten). */
/* Runde 19 (W33): Die Gerätefenster liegen jetzt in einer Ebene über der ganzen
 * App (Portal) – Positionen sind damit Viewport-Koordinaten, nicht mehr relativ
 * zum Canvas. */
export function recallPos(w: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
  const grab = Math.min(220, Math.max(80, w.w));
  const visX = Math.min(w.x + w.w, vw) - Math.max(w.x, 0);
  const visY = Math.min(w.y + w.h, vh) - Math.max(w.y, 0);
  if (visX >= 120 && visY >= 80) return { x: w.x, y: w.y }; // noch griffig
  return {
    x: Math.max(grab - w.w, Math.min(w.x, vw - grab)),
    y: Math.max(0, Math.min(w.y, vh - 40)),
  };
}

/* Runde 20 (W38): Fenster-Chrome = 2 px Rahmen (1 px je Seite) + 36 px
 * Titelzeile. Nur noch der Startwert fürs erste Bild – danach misst
 * `useWindowFit` das echte Chrome und setzt die Größe exakt auf Gerät + Chrome
 * (kein Leerraum, kein brauner Rand). */
export const CHROME_W = 2;
export const CHROME_H = 38;
export const SCOPE_CHASSIS = { w: 1420, h: 688 };
export const FG_STAGE = { w: 1160, h: 545 };

/** W18/R19: FG-2500 – Bühne 1160×545 + Chrome, viewport-geclampt. */
export function fgDefaultSize(): { w: number; h: number } {
  const vw = (typeof window !== "undefined" ? window.innerWidth : 1600) - 8;
  const vh = (typeof window !== "undefined" ? window.innerHeight : 1000) - 8;
  // Runde 21 (W44): + Werkbank-Rahmen (2× BENCH_PAD), wie im Fenster-Fit.
  return {
    w: Math.max(320, Math.min(FG_STAGE.w + 2 * BENCH_PAD + CHROME_W, vw)),
    h: Math.max(240, Math.min(FG_STAGE.h + 2 * BENCH_PAD + CHROME_H, vh)),
  };
}

/** Runde 21 (W43): Untergrenzen des Fenster-Griffs. Runde 20 hatte 640×480 –
 *  auf knappen Bildschirmen war das bereits die Startgröße, sodass sich Geräte
 *  überhaupt nicht mehr verkleinern ließen („bleiben riesig"). Jetzt darf ein
 *  Gerät maßstäblich bis 320×240 herunter (Skalierung bis ≈ 0,23), Panels bis
 *  240×180 – die Obergrenze bleibt jeweils die Startgröße am Inhalt. */
export const DEVICE_MIN = { w: 320, h: 240 };
export const PANEL_MIN = { w: 240, h: 180 };

export const WINDOW_SPECS: Record<InstrumentKind, WindowSpec> = {
  scope: SCOPE_CHASSIS,
  funcgen: FG_STAGE,
  bode: { w: 560, h: 320 },
  logic: { w: 600, h: 300 },
  logicconv: { w: 460, h: 420 },
  iv: { w: 560, h: 320 },
  spectrum: { w: 560, h: 300 },
  dmm: { w: 320, h: 280 },
  watt: { w: 360, h: 300 },
  pattern: { w: 400, h: 260 },
  distortion: { w: 360, h: 250 },
  network: { w: 560, h: 300 },
  counter: { w: 300, h: 250 },
  inspector: { w: 320, h: 480 },
};

/** Runde 16/19/21 (W31a/W35/W44): Startgröße des Oszi-Fensters – Chassis
 *  (1420×688) + Werkbank-Rahmen + Chrome, nie größer als der Viewport; bei
 *  Platzmangel skaliert DeviceFit das Gerät herunter und der Fenster-Fit zieht
 *  die Breite nach. */
export function scopeDefaultSize(): { w: number; h: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
  return {
    w: Math.max(320, Math.min(SCOPE_CHASSIS.w + 2 * BENCH_PAD + CHROME_W, vw - 8)),
    h: Math.max(240, Math.min(SCOPE_CHASSIS.h + 2 * BENCH_PAD + CHROME_H, vh - 8)),
  };
}

import type { InstrumentKind, WindowSpec } from "./types";
