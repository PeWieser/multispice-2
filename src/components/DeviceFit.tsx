"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Natürliche (Layout-)Größe eines Geräts bzw. Inhaltsbedarf eines Panels. */
export interface NaturalSize {
  w: number;
  h: number;
}

/**
 * Runde 21 (W42): Meldung des Inhalts an den Fenstermanager. Neben dem Naturmaß
 * geht die **tatsächlich angezeigte** Größe mit (Naturmaß × Skalierung) – nur so
 * kann das Fenster auf knappen Bildschirmen in der Breite mitgehen, statt links
 * und rechts Lücken neben dem Gerät zu lassen.
 */
export interface NaturalMeasure extends NaturalSize {
  dispW: number;
  dispH: number;
}

/** Runde 20 (W38): Toleranz, ab der nicht mehr heruntergerechnet wird –
 *  verhindert Subpixel-Zittern (0,9998-Skalierung) bei passenden Fenstern. */
const EPS = 1;

/**
 * Runde 20 (W40): Der Fenstermanager (`Window`) reicht hierüber einen Melder
 * nach unten. Geräte melden ihr natürliches Maß per `DeviceFit`, Panels ihren
 * Höhenbedarf per `PanelProbe`; der Manager setzt daraus die Fenstergröße.
 */
export const WindowFitContext = createContext<((size: NaturalMeasure) => void) | null>(null);

/** Meldet das natürliche Inhaltsmaß an den umgebenden Fenstermanager. */
export function useReportNatural(): (size: NaturalMeasure) => void {
  const ctx = useContext(WindowFitContext);
  const fb = useCallback(() => {
    /* ohne Fenstermanager (z. B. Vorschau) nichts zu melden */
  }, []);
  return ctx ?? fb;
}

interface DeviceFitProps {
  /** Startwert für das erste Bild; gemessen wird danach echt. */
  natural?: NaturalSize;
  /** Meldet Gerätemaß und Anzeigegröße (Fenstergröße, Seitenverhältnis). */
  onMeasure?: (size: NaturalMeasure) => void;
  children: ReactNode;
}

/**
 * Runde 19/20/21 (W35/W38/W42): skaliert ein Gerät 1:1 in den verfügbaren Platz
 * („contain", nie hoch, nie verzerrt) – **ohne** künstlichen Rand, damit das
 * Fenster kantenbündig am Gehäuse sitzt.
 *
 * Das Layoutmaß bleibt messbar, die Skalierung sitzt als Transform auf dem
 * inneren Kasten (die 1:1-Kopie des Geräts bleibt unangetastet). Gemeldet wird
 * beides: Naturmaß und Anzeigegröße.
 */
export function DeviceFit({ natural, onMeasure, children }: DeviceFitProps) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, natW: natural?.w ?? 0, natH: natural?.h ?? 0 });
  const measure = useRef(onMeasure);
  useEffect(() => {
    measure.current = onMeasure;
  });

  useLayoutEffect(() => {
    const upd = () => {
      const o = outer.current;
      const i = inner.current;
      if (!o || !i) return;
      const natW = i.offsetWidth;
      const natH = i.offsetHeight;
      if (!natW || !natH) return;
      const availW = o.clientWidth;
      const availH = o.clientHeight;
      // W38: ohne Fit-Rand rechnen; bei exakt sitzendem Fenster ist die
      // Skalierung damit genau 1.
      const scale = Math.min(
        1,
        availW + EPS >= natW ? 1 : availW / Math.max(natW, 1),
        availH + EPS >= natH ? 1 : availH / Math.max(natH, 1),
      );
      setFit((f) => (f.scale === scale && f.natW === natW && f.natH === natH ? f : { scale, natW, natH }));
      measure.current?.({
        w: natW,
        h: natH,
        dispW: natW * scale,
        dispH: natH * scale,
      });
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: fit.natW * fit.scale || undefined, height: fit.natH * fit.scale || undefined }}>
        <div
          ref={inner}
          style={{ width: natural?.w ?? fit.natW, transform: `scale(${fit.scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Runde 20 (W40): Inhalts-Probe für Panel-Fenster. Rendert den Inhalt einmal
 * offscreen (Breite = Entwurfsbreite des Fensters, Layout wie im Fenster) und
 * meldet, wie viel Höhe er wirklich braucht. Plot-Panels liefern dabei nur ihre
 * Bedienzeilen (der Canvas füllt) – dafür gibt es eine Höhen-Untergrenze je Art
 * in `WINDOW_SPECS`. Panels skalieren nicht, deshalb ist die Anzeigegröße gleich
 * dem Naturmaß.
 */
export function PanelProbe({
  width,
  onMeasure,
  children,
}: {
  width: number;
  onMeasure: (size: NaturalMeasure) => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const inner = (el.firstElementChild as HTMLElement | null) ?? el;
    const r = inner.getBoundingClientRect();
    const w = Math.ceil(r.width || el.scrollWidth);
    const h = Math.ceil(r.height || el.scrollHeight);
    if (w > 0 && h > 0) onMeasure({ w, h, dispW: w, dispH: h });
    // Nach der Messung verschwindet die Kopie wieder (kein doppeltes Panel).
    setDone(true);
  }, [width, onMeasure]);
  if (done) return null;
  return (
    <div
      ref={box}
      aria-hidden
      data-no-drag
      style={{
        position: "fixed",
        left: -20000,
        top: 0,
        width,
        visibility: "hidden",
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      {children}
    </div>
  );
}
