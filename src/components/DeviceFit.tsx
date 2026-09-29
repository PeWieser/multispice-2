"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { InstrumentWindow } from "@/state/editor";
import { useEditor } from "@/state/editor";

/** Runde 19 (W35): Rand, den DeviceFit zum verfügbaren Platz freihält; dieselbe
 *  Zahl nutzt die Fenster-Anpassung, damit die Skalierung exakt 1 ergibt. */
export const FIT_MARGIN = 8;

interface DeviceFitProps {
  /** Natürliche (Layout-)Breite des Geräts – nur so bleibt die Skalierung
   *  messbar; die Höhe wird am Inhalt gemessen. */
  naturalWidth?: number;
  /** Meldet die natürliche Gerätegröße (für die Fenstergröße beim Öffnen). */
  onMeasure?: (size: { w: number; h: number }) => void;
  children: ReactNode;
}

/** Runde 19 (W35): skaliert ein Gerät 1:1 in den verfügbaren Platz („contain",
 *  nie hoch, nie verzerrt). Das Gerät bleibt unverändert – die Skalierung sitzt
 *  als Transform auf dem inneren Kasten, dessen Layoutgröße messbar bleibt. */
export function DeviceFit({ naturalWidth, onMeasure, children }: DeviceFitProps) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, h: 0 });
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
      const availW = Math.max(0, o.clientWidth - FIT_MARGIN);
      const availH = Math.max(0, o.clientHeight - FIT_MARGIN);
      const scale = Math.min(1, availW > 0 ? availW / Math.max(natW, 1) : 1, availH > 0 ? availH / Math.max(natH, 1) : 1);
      setFit({ scale, h: natH * scale });
      measure.current?.({ w: natW, h: natH });
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="flex h-full w-full items-center justify-center">
      <div style={{ width: naturalWidth ? naturalWidth * fit.scale : undefined, height: fit.h || undefined }}>
        <div ref={inner} style={{ width: naturalWidth, transform: `scale(${fit.scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Runde 19 (W35): Fenster beim Öffnen exakt an das Gerät legen.
 *
 * Der Adapter hängt `bodyRef` an den Fensterinhalt (alles unter der Titelzeile)
 * und `onMeasure` an `<DeviceFit>`; gemessen wird die natürliche Gerätegröße
 * plus der Rahmen/Titelzeilen-Anteil – das Fenster ist danach genau so groß,
 * dass das Gerät 1:1 passt (kein Leerraum, keine Skalierung). Bei kleinem
 * Bildschirm bleibt es im Viewport; dann skaliert DeviceFit herunter.
 * Läuft einmal je Fenster (`deviceFit`-Flag in der Geräte-Config), danach
 * bleiben Nutzer-Resizes unangetastet.
 */
export function useDeviceWindowFit(win: InstrumentWindow): {
  bodyRef: RefObject<HTMLDivElement | null>;
  onMeasure: (size: { w: number; h: number }) => void;
} {
  const bodyRef = useRef<HTMLDivElement>(null);
  const dev = useRef({ w: 0, h: 0 });
  const onMeasure = useCallback((size: { w: number; h: number }) => {
    dev.current = size;
  }, []);

  useLayoutEffect(() => {
    const st = useEditor.getState();
    const w = st.instruments.find((i) => i.id === win.id);
    const body = bodyRef.current;
    const nat = dev.current;
    if (!w || !body || w.config.deviceFit === 1 || !nat.w || !nat.h) return;
    const slackW = Math.max(0, w.w - body.clientWidth); // Fensterrahmen
    const slackH = Math.max(0, w.h - body.clientHeight); // Titelzeile + Rahmen
    const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
    st.updateInstrument(win.id, {
      w: Math.max(320, Math.min(nat.w + slackW + FIT_MARGIN, vw - 8)),
      h: Math.max(220, Math.min(nat.h + slackH + FIT_MARGIN, vh - 8)),
      config: { ...w.config, deviceFit: 1 },
    });
  });

  return { bodyRef, onMeasure };
}
