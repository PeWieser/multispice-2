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
  type RefObject,
} from "react";
import type { InstrumentWindow } from "@/state/editor";
import { useEditor } from "@/state/editor";

/** Natürliche (Layout-)Größe eines Geräts bzw. Inhaltsbedarf eines Panels. */
export interface NaturalSize {
  w: number;
  h: number;
}

/** Runde 20 (W38): Toleranz, ab der nicht mehr heruntergerechnet wird –
 *  verhindert Subpixel-Zittern (0,9998-Skalierung) bei passenden Fenstern. */
const EPS = 1;

/**
 * Runde 20 (W40): Der Fenstermanager (`Window`) reicht hierüber einen Melder
 * nach unten. Geräte melden ihr natürliches Maß per `DeviceFit`, Panels ihren
 * Höhenbedarf per `PanelProbe`; der Manager setzt daraus die Fenstergröße.
 */
const WindowFitContext = createContext<((size: NaturalSize) => void) | null>(null);

/** Meldet das natürliche Inhaltsmaß an den umgebenden Fenstermanager. */
export function useReportNatural(): (size: NaturalSize) => void {
  const ctx = useContext(WindowFitContext);
  const fallback = useRef<NaturalSize | null>(null);
  const fb = useCallback((size: NaturalSize) => {
    fallback.current = size;
  }, []);
  return ctx ?? fb;
}

export { WindowFitContext };

interface DeviceFitProps {
  /** Startwert für das erste Bild; gemessen wird danach echt. */
  natural?: NaturalSize;
  /** Meldet die gemessene Gerätegröße (Fenstergröße, Seitenverhältnis). */
  onMeasure?: (size: NaturalSize) => void;
  children: ReactNode;
}

/**
 * Runde 19/20 (W35/W38): skaliert ein Gerät 1:1 in den verfügbaren Platz
 * („contain", nie hoch, nie verzerrt) – **ohne** künstlichen Rand, damit das
 * Fenster kantenbündig am Gehäuse sitzt. Vorher (Runde 19) blieb durch einen
 * 8-px-Fit-Rand plus zu klein gerechnetem Fenster-Chrome links/rechts der
 * braune Werkbank-Hintergrund des Oszis stehen.
 *
 * Das Layoutmaß bleibt messbar, die Skalierung sitzt als Transform auf dem
 * inneren Kasten (1:1-Kopie des Geräts bleibt unangetastet).
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
      measure.current?.({ w: natW, h: natH });
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
 * Runde 19/20 (W35/W38/W40): Fenster einmalig exakt an seinen Inhalt legen.
 *
 * Gemessen wird das **echte** Fenster-Chrome (Rahmen + Titelzeile) als Differenz
 * der Außenmaße von Fenster und Inhaltsteil – keine Pauschalwerte. Danach bleibt
 * der Nutzer-Resize unangetastet (`deviceFit`-Flag in der Fenster-Config). Das
 * natürliche Maß wandert als `fitW`/`fitH` in die Config: daran hängen Maximum
 * und Seitenverhältnis beim Skalieren (W39).
 */
export function useWindowFit(win: InstrumentWindow): {
  winRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  onMeasure: (size: NaturalSize) => void;
} {
  const winRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dev = useRef<NaturalSize | null>(null);
  const onMeasure = useCallback((size: NaturalSize) => {
    if (size.w > 0 && size.h > 0) dev.current = size;
  }, []);

  useLayoutEffect(() => {
    const st = useEditor.getState();
    const w = st.instruments.find((i) => i.id === win.id);
    const el = winRef.current;
    const body = bodyRef.current;
    const nat = dev.current;
    if (!w || !el || !body || w.config.deviceFit === 1 || !nat) return;
    const er = el.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const slackW = Math.max(0, er.width - br.width); // 2 px Fensterrahmen
    const slackH = Math.max(0, er.height - br.height); // 2 px Rahmen + Titelzeile
    const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
    const minW = Number(w.config.minW ?? 320);
    const minH = Number(w.config.minH ?? 220);
    st.updateInstrument(win.id, {
      w: Math.max(minW, Math.min(Math.round(nat.w + slackW), vw - 8)),
      h: Math.max(minH, Math.min(Math.round(nat.h + slackH), vh - 8)),
      config: { ...w.config, deviceFit: 1, fitW: nat.w, fitH: nat.h },
    });
  });

  return { winRef, bodyRef, onMeasure };
}

/**
 * Runde 20 (W40): Inhalts-Probe für Panel-Fenster. Rendert den Inhalt einmal
 * offscreen (Breite = Entwurfsbreite des Fensters, Layout wie im Fenster) und
 * meldet, wie viel Höhe er wirklich braucht. Plot-Panels liefern dabei nur ihre
 * Bedienzeilen (der Canvas füllt) – dafür gibt es eine Höhen-Untergrenze je Art
 * in `WINDOW_SPECS`.
 */
export function PanelProbe({
  width,
  onMeasure,
  children,
}: {
  width: number;
  onMeasure: (size: NaturalSize) => void;
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
    if (w > 0 && h > 0) onMeasure({ w, h });
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
