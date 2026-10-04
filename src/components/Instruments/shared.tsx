"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { formatValue } from "@/lib/library/catalog";
import { useEditor } from "@/state/editor";

export const CH_COLORS = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"];

/* W24: SkeuoTek-Oszi (1:1-Port aus oszi/) – eigenes Chunk, kein SSR */
export const OsziScopeLazy = dynamic(() => import("../OsziScope"), { ssr: false });
export const FgScopeLazy = dynamic(() => import("../FgScope"), { ssr: false });
/** Runde 11: Trace-Farben folgen der Theme-Palette (--ch1…--ch4). */

export const cssVar = (n: string, f: string) => {
  if (typeof window === "undefined") return f;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;
};

/* ------------------------------------------------------------------ */
/* generic animated plot surface                                       */
/* ------------------------------------------------------------------ */
export function Plot({ render, className }: { render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = ref.current;
      const wrap = wrapRef.current;
      if (c && wrap) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        if (c.width !== w * dpr || c.height !== h * dpr) {
          c.width = w * dpr;
          c.height = h * dpr;
          c.style.width = w + "px";
          c.style.height = h + "px";
        }
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          render(ctx, w, h);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);
  return (
    <div ref={wrapRef} className={className ?? "relative h-full w-full"}>
      <canvas ref={ref} className="block h-full w-full" />
    </div>
  );
}

export function grid(ctx: CanvasRenderingContext2D, w: number, h: number, cols = 10, rows = 8) {
  ctx.save();
  ctx.fillStyle = cssVar("--canvas", "#0d1017");
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = cssVar("--grid-minor", "rgba(255,255,255,.06)");
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    ctx.moveTo((w * i) / cols, 0);
    ctx.lineTo((w * i) / cols, h);
  }
  for (let i = 1; i < rows; i++) {
    ctx.moveTo(0, (h * i) / rows);
    ctx.lineTo(w, (h * i) / rows);
  }
  ctx.stroke();
  ctx.strokeStyle = cssVar("--grid-major", "rgba(255,255,255,.12)");
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.restore();
}

export function NetSelect({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  return (
    <select className="input py-0.5 text-2xs" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">—</option>}
      {nets.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* oscilloscope – SKEUOMORPHIC CRT + METAL + KNOBS                     */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* digital multimeter                                                  */
/* ------------------------------------------------------------------ */

export function Knob({ label, unit, value, min, max, log, onChange }: { label: string; unit: string; value: number; min: number; max: number; log?: boolean; onChange: (v: number) => void }) {
  const toSlider = (v: number) => (log ? Math.log10(Math.max(v, min || 1e-6)) : v);
  const fromSlider = (v: number) => (log ? Math.pow(10, v) : v);
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-2xs">
        <span className="text-ink-2">{label}</span>
        <span className="mono text-ink-3">{formatValue(value, unit)}</span>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={toSlider(min || 0.1)}
        max={toSlider(max)}
        step={log ? 0.01 : (max - min) / 400}
        value={toSlider(value)}
        onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* bode plotter                                                        */
/* ------------------------------------------------------------------ */

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2 bg-surface-2">
      <div className="text-2xs text-ink-3">{label}</div>
      <div className="mono text-base font-semibold" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* IV analyzer                                                         */
/* ------------------------------------------------------------------ */

/** W10: Der Inspector lebt als Fenster – lazy geladen, damit die Geräte-Bar
 *  den Erststart nicht verteuert. */
export const InspectorBody = dynamic(() => import("../Inspector"), { ssr: false });
