"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, AudioLines, Crosshair, Download, ImageDown, XCircle } from "lucide-react";
import { formatValue } from "@/lib/format";
import { curveStats, fMinus3dB, type CurveStats } from "@/lib/measure";
import { combineSeries, envelopeWindow, movingEnvelope, postFFT } from "@/lib/postprocess";
import { ANALYSIS_MAP } from "@/lib/sim/analysis_defs";
import { useEditor } from "@/state/editor";
import { downloadBlob, downloadText, safeName } from "@/lib/download";
import { WAV_MAX_SAMPLES, curveToWav, nativeRate } from "@/lib/wav";
import { adaptShortcut, useIsApple } from "@/lib/platform";

const cssVar = (n: string, f: string) => {
  if (typeof window === "undefined") return f;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;
};

const SERIES_COLORS = ["--ch1", "--ch2", "--ch3", "--ch4", "--accent", "--warn", "--ok", "--err"];

/* ------------------------------------------------------------------ */
/* Liniendiagramm mit gestapelten Panels (gemeinsame X-Achse)           */
/* ------------------------------------------------------------------ */

export interface PlotSeries {
  name: string;
  x: number[];
  y: number[];
}

export interface PlotPanel {
  series: PlotSeries[];
  yLabel: string;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) {
    const c = Number.isFinite(min) ? min : 0;
    min = c - 1;
    max = c + 1;
  }
  const step0 = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let e = Math.ceil(Math.log10(Math.max(min, 1e-30))); e <= Math.floor(Math.log10(Math.max(max, 1e-29))); e++) ticks.push(Math.pow(10, e));
  return ticks;
}

function fmtTick(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(0);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(4)));
}

export function LinePlot({
  panels,
  xLabel,
  logX,
  logY,
  onCanvas,
}: {
  panels: PlotPanel[];
  xLabel: string;
  logX?: boolean;
  logY?: boolean;
  onCanvas?: (c: HTMLCanvasElement | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ px: number; py: number } | null>(null);
  const [cursors, setCursors] = useState<{ x0: number | null; x1: number | null }>({ x0: null, x1: null });
  const [dragging, setDragging] = useState<0 | 1 | null>(null);
  // R11: Zoom/Pan-Ansicht in Anzeige-Einheiten (log10, wenn logX/logY).
  // Der View gehört zu genau einer panels-Identität: neue Analyse → automatisch
  // zurück auf Auto-Scale (derived state, kein Reset-Effect nötig).
  type View = { x0: number; x1: number; ys: Array<{ lo: number; hi: number }> };
  const [viewState, setViewState] = useState<{ forPanels: PlotPanel[]; v: View } | null>(null);
  const view = viewState && viewState.forPanels === panels ? viewState.v : null;
  const setView = (v: View | null) => setViewState(v ? { forPanels: panels, v } : null);
  const [panning, setPanning] = useState(false);
  const apple = useIsApple();
  const panRef = useRef<{ px: number; py: number; base: View } | null>(null);

  const fitDomains = useCallback((): View => {
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of panels) for (const s of p.series) for (const v of s.x) {
      if (v < x0) x0 = v;
      if (v > x1) x1 = v;
    }
    if (!(x1 > x0)) { x0 = 0; x1 = 1; }
    const ys = panels.map((panel) => {
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const s of panel.series) for (const v of s.y) {
        if (!Number.isFinite(v)) continue;
        if (v < y0) y0 = v;
        if (v > y1) y1 = v;
      }
      if (!(y1 > y0)) {
        const c = Number.isFinite(y0) ? y0 : 0;
        y0 = c - 1;
        y1 = c + 1;
      }
      if (!logY) {
        const pad = (y1 - y0) * 0.08 || 1;
        y0 -= pad;
        y1 += pad;
      }
      return { lo: logY ? Math.log10(Math.max(y0, 1e-30)) : y0, hi: logY ? Math.log10(Math.max(y1, 1e-29)) : y1 };
    });
    return { x0: logX ? Math.log10(Math.max(x0, 1e-30)) : x0, x1: logX ? Math.log10(Math.max(x1, 1e-29)) : x1, ys };
  }, [panels, logX, logY]);

  // Refs für Event-Handler – Synchronisation ausschließlich in Effects.
  const viewRef = useRef<View | null>(null);
  const fitRef = useRef(fitDomains);
  const panelsRef = useRef(panels);
  useEffect(() => {
    viewRef.current = view;
    fitRef.current = fitDomains;
    panelsRef.current = panels;
  }, [view, fitDomains, panels]);

  // Rad = X-Zoom, ⇧Rad = Y-Zoom (non-passiv, damit die Seite nicht scrollt).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const padL = 58, padR = 10, padT = 8, padB = 24;
      const plotW = rect.width - padL - padR;
      const plotH = rect.height - padT - padB;
      if (plotW <= 0 || plotH <= 0) return;
      const base = viewRef.current ?? fitRef.current();
      const f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      if (e.shiftKey && base.ys.length) {
        const panelH = plotH / base.ys.length;
        const ys = base.ys.map((y, pi) => {
          const t = Math.min(1, Math.max(0, (e.clientY - rect.top - padT - pi * panelH) / panelH));
          const anchor = y.hi - t * (y.hi - y.lo);
          return { lo: anchor - (anchor - y.lo) * f, hi: anchor + (y.hi - anchor) * f };
        });
        setViewState({ forPanels: panelsRef.current, v: { ...base, ys } });
      } else {
        const t = Math.min(1, Math.max(0, (e.clientX - rect.left - padL) / plotW));
        const anchor = base.x0 + t * (base.x1 - base.x0);
        setViewState({ forPanels: panelsRef.current, v: { ...base, x0: anchor - (anchor - base.x0) * f, x1: anchor + (base.x1 - anchor) * f } });
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Cursor interaction – supports logX correctly
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getXDomain = () => {
      const d = viewRef.current ?? fitRef.current();
      return { x0: d.x0, x1: d.x1, lx0: d.x0, lx1: d.x1 };
    };
    const xFromClient = (clientX: number, rect: DOMRect) => {
      const padL = 58, padR = 10;
      const plotW = rect.width - padL - padR;
      const t = Math.min(1, Math.max(0, (clientX - rect.left - padL) / plotW));
      const { x0, x1, lx0, lx1 } = getXDomain();
      const xv = logX ? Math.pow(10, lx0 + t * (lx1 - lx0)) : x0 + t * (x1 - x0);
      return xv;
    };
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (e.clientY - rect.top < 30) {
        const xv = xFromClient(e.clientX, rect);
        if (e.shiftKey) setCursors(c=> ({ ...c, x1: xv }));
        else setCursors(c=> ({ ...c, x0: xv }));
        setDragging(e.shiftKey ? 1 : 0);
      } else {
        // R11: Ziehen im Plotbereich = Schwenken.
        panRef.current = { px: e.clientX, py: e.clientY, base: viewRef.current ?? fitRef.current() };
        setPanning(true);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (panRef.current) {
        const rect = canvas.getBoundingClientRect();
        const plotW = rect.width - 58 - 10;
        const plotH = rect.height - 8 - 24;
        const b = panRef.current.base;
        if (plotW <= 0 || plotH <= 0 || !b.ys.length) return;
        const dx = e.clientX - panRef.current.px;
        const dy = e.clientY - panRef.current.py;
        const shiftX = (dx / plotW) * (b.x1 - b.x0);
        const panelH = plotH / b.ys.length;
        setViewState({
          forPanels: panelsRef.current,
          v: {
            x0: b.x0 - shiftX,
            x1: b.x1 - shiftX,
            ys: b.ys.map((y) => {
              const k = (dy / panelH) * (y.hi - y.lo);
              return { lo: y.lo + k, hi: y.hi + k };
            }),
          },
        });
        return;
      }
      if (dragging === null) return;
      const rect = canvas.getBoundingClientRect();
      const xv = xFromClient(e.clientX, rect);
      if (dragging === 0) setCursors(c=> ({ ...c, x0: xv }));
      else setCursors(c=> ({ ...c, x1: xv }));
    };
    const onUp = () => {
      setDragging(null);
      panRef.current = null;
      setPanning(false);
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [panels, dragging, logX]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    onCanvas?.(canvas);

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const grid = cssVar("--grid-minor", "rgba(128,140,165,.15)");
      const mute = cssVar("--ink-3", "#64708c");
      ctx.fillStyle = cssVar("--canvas", "#0d1017");
      ctx.fillRect(0, 0, w, h);

      const padL = 58;
      const padR = 10;
      const padT = 8;
      const padB = 24;
      const plotW = w - padL - padR;
      const panelH = (h - padT - padB) / panels.length;
      ctx.font = "9.5px ui-monospace, monospace";

      // Gemeinsame X-Domäne über alle Panels – Zoom-Ansicht hat Vorrang (R11).
      const dom = view ?? fitDomains();
      const lx0 = dom.x0;
      const lx1 = dom.x1;
      const xOf = (v: number) => padL + (((logX ? Math.log10(Math.max(v, 1e-30)) : v) - lx0) / (lx1 - lx0 || 1)) * plotW;

      const panelGeom: Array<{ top: number; yOf: (v: number) => number; series: PlotSeries[] }> = [];
      panels.forEach((panel, pi) => {
        const top = padT + pi * panelH;
        const yd = dom.ys[pi] ?? { lo: 0, hi: 1 };
        const ly0 = yd.lo;
        const ly1 = yd.hi;
        const yOf = (v: number) => top + panelH - 4 - (((logY ? Math.log10(Math.max(v, 1e-30)) : v) - ly0) / (ly1 - ly0 || 1)) * (panelH - 8);
        panelGeom.push({ top, yOf, series: panel.series });

        // Y-Grid + Labels.
        const ticks = logY ? logTicks(Math.pow(10, ly0), Math.pow(10, ly1)) : niceTicks(ly0, ly1);
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.fillStyle = mute;
        ctx.textAlign = "right";
        for (const t of ticks) {
          const y = yOf(t);
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(w - padR, y);
          ctx.stroke();
          ctx.fillText(fmtTick(t), padL - 5, y + 3);
        }
        // Y-Achsentitel.
        ctx.save();
        ctx.translate(11, top + panelH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.fillText(panel.yLabel, 0, 0);
        ctx.restore();
      });

      // X-Grid + Labels (nur unten).
      const xticks = logX ? logTicks(Math.pow(10, lx0), Math.pow(10, lx1)) : niceTicks(lx0, lx1, 8);
      ctx.strokeStyle = grid;
      ctx.fillStyle = mute;
      ctx.textAlign = "center";
      for (const t of xticks) {
        const x = xOf(t);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, h - padB);
        ctx.stroke();
        ctx.fillText(fmtTick(t), x, h - 11);
      }
      ctx.textAlign = "right";
      ctx.fillText(xLabel, w - padR, h - 11);

      // Cursors – like Multisim Grapher, draggable ΔT/ΔV
      if (cursors.x0 !== null) {
        ctx.strokeStyle = cssVar("--violet", "#7a4fa3");
        ctx.setLineDash([6,4]);
        ctx.lineWidth = 1;
        const x = xOf(cursors.x0);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, h - padB);
        ctx.stroke();
        ctx.setLineDash([]);
        // handle
        ctx.fillStyle = cssVar("--violet", "#7a4fa3");
        ctx.fillRect(x-4, padT, 8, 12);
      }
      if (cursors.x1 !== null) {
        ctx.strokeStyle = cssVar("--warn", "#a87a12");
        ctx.setLineDash([6,4]);
        ctx.lineWidth = 1;
        const x = xOf(cursors.x1);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, h - padB);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = cssVar("--warn", "#a87a12");
        ctx.fillRect(x-4, padT, 8, 12);
      }
      if (cursors.x0 !== null && cursors.x1 !== null) {
        const x0 = xOf(cursors.x0);
        const x1 = xOf(cursors.x1);
        const mid = (x0+x1)/2;
        const dx = Math.abs(cursors.x1 - cursors.x0);
        ctx.fillStyle = "var(--surface)";
        ctx.strokeStyle = "var(--hairline-strong)";
        ctx.lineWidth = 1;
        const txt = `ΔT=${dx.toExponential(2)}s ${dx>0 ? `1/ΔT=${(1/dx).toFixed(1)}Hz` : ""}`;
        ctx.font = "10px ui-monospace, monospace";
        const tw = ctx.measureText(txt).width;
        ctx.fillRect(mid - tw/2 - 6, padT + 16, tw + 12, 16);
        ctx.strokeRect(mid - tw/2 - 6, padT + 16, tw + 12, 16);
        ctx.fillStyle = "var(--ink)";
        ctx.textAlign = "center";
        ctx.fillText(txt, mid, padT + 26);
      }

      // Serien – pro Panel geclippt, damit gezoomte Kurven nicht überlaufen.
      panels.forEach((panel, pi) => {
        const { yOf, top } = panelGeom[pi];
        ctx.save();
        ctx.beginPath();
        ctx.rect(padL, top, plotW, panelH);
        ctx.clip();
        panel.series.forEach((s, si) => {
          ctx.strokeStyle = cssVar(SERIES_COLORS[si % SERIES_COLORS.length], "#38bdf8");
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < s.x.length; i++) {
            if (!Number.isFinite(s.y[i])) {
              started = false;
              continue;
            }
            const x = xOf(s.x[i]);
            const y = yOf(s.y[i]);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });
        ctx.restore();
      });

      // Hover-Fadenkreuz mit Werten (hover ist Dep des Effekts, also immer frisch).
      const hv = hover;
      if (hv && hv.px >= padL && hv.px <= w - padR) {
        ctx.strokeStyle = cssVar("--hairline-strong", "rgba(128,140,165,.4)");
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hv.px, padT);
        ctx.lineTo(hv.px, h - padB);
        ctx.stroke();
        ctx.setLineDash([]);
        const frac = (hv.px - padL) / plotW;
        const xv = logX ? Math.pow(10, lx0 + frac * (lx1 - lx0)) : lx0 + frac * (lx1 - lx0);
        const lines: Array<{ color: string; text: string }> = [];
        for (const g of panelGeom) {
          for (let si = 0; si < g.series.length; si++) {
            const s = g.series[si];
            if (!s.x.length) continue;
            let best = 0;
            let bestD = Infinity;
            for (let i = 0; i < s.x.length; i++) {
              const d = Math.abs(xOf(s.x[i]) - hv.px);
              if (d < bestD) {
                bestD = d;
                best = i;
              }
            }
            const color = cssVar(SERIES_COLORS[si % SERIES_COLORS.length], "#38bdf8");
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(xOf(s.x[best]), g.yOf(s.y[best]), 3, 0, Math.PI * 2);
            ctx.fill();
            lines.push({ color, text: `${s.name}: ${fmtTick(s.y[best])}` });
            if (lines.length >= 5) break;
          }
          if (lines.length >= 5) break;
        }
        const label = `x = ${fmtTick(xv)}`;
        ctx.font = "10px ui-monospace, monospace";
        const tw = Math.max(ctx.measureText(label).width, ...lines.map((l) => ctx.measureText(l.text).width)) + 14;
        const th = 16 + lines.length * 13 + 6;
        let bx = hv.px + 12;
        if (bx + tw > w - 4) bx = hv.px - tw - 12;
        const by = Math.min(Math.max(hv.py - th / 2, 4), h - th - 4);
        ctx.fillStyle = cssVar("--surface-3", "#1a2030");
        ctx.strokeStyle = cssVar("--hairline-strong", "rgba(128,140,165,.4)");
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, th, 5);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = mute;
        ctx.fillText(label, bx + 7, by + 14);
        lines.forEach((l, i) => {
          ctx.fillStyle = l.color;
          ctx.fillText(l.text, bx + 7, by + 14 + (i + 1) * 13);
        });
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      onCanvas?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, xLabel, logX, logY, hover, view, fitDomains]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full"
      title={adaptShortcut("Mausrad = X-Zoom · ⇧Rad = Y-Zoom · Ziehen = Schwenken · Doppelklick = automatisch einpassen", apple)}
      onDoubleClick={() => setView(null)}
      onMouseMove={(e) => {
        const r = canvasRef.current?.getBoundingClientRect();
        if (r) setHover({ px: e.clientX - r.left, py: e.clientY - r.top });
      }}
      onMouseLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} className="block h-full w-full" style={{ cursor: panning ? "grabbing" : "default" }} />
      {view && (
        <button
          className="btn absolute right-2 top-1 z-10 px-1.5 py-0.5 text-2xs"
          title="Zoom zurücksetzen – Ansicht wieder automatisch eingepasst" aria-label="Zoom zurücksetzen – Ansicht wieder automatisch eingepasst"
          onClick={() => setView(null)}
        >
          ⤢ Auto-Scale
        </button>
      )}
    </div>
  );
}

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 pb-1 text-2xs text-ink-3">
      {names.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4 rounded" style={{ background: `var(${SERIES_COLORS[i % SERIES_COLORS.length]})` }} />
          <span className="mono">{n}</span>
        </span>
      ))}
    </div>
  );
}

function toCsv(headers: string[], cols: number[][]): string {
  const lines = [headers.join(";")];
  const n = Math.max(...cols.map((c) => c.length));
  for (let i = 0; i < n; i++) lines.push(cols.map((c) => (i < c.length ? String(c[i]) : "")).join(";"));
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* S5.7: Mess-Panel pro Kurve + Postprozessor                             */
/* ------------------------------------------------------------------ */

function CurveStatsPanel({
  items,
}: {
  items: Array<{ name: string; stats: CurveStats; unit: string; f3?: number | null }>;
}) {
  if (items.length === 0) return null;
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-2">
      <span className="text-ink-3">{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <div className="mono overflow-y-auto text-2xs">
      <div className="mb-1 text-2xs uppercase text-ink-3">Messwerte</div>
      {items.map((it, i) => (
        <div key={it.name} className="mb-2">
          <div className="flex items-center gap-1.5 text-ink-2">
            <span className="inline-block h-[2px] w-3 shrink-0 rounded" style={{ background: `var(${SERIES_COLORS[i % SERIES_COLORS.length]})` }} />
            <span className="truncate">{it.name}</span>
          </div>
          <div className="mt-0.5 space-y-px pl-4">
            {row("Min", formatValue(it.stats.min, it.unit))}
            {row("Max", formatValue(it.stats.max, it.unit))}
            {row("Mittel", formatValue(it.stats.mean, it.unit))}
            {row("RMS", formatValue(it.stats.rms, it.unit))}
            {it.f3 !== undefined && row("f−3dB", it.f3 === null ? "—" : formatValue(it.f3, "Hz"))}
          </div>
        </div>
      ))}
    </div>
  );
}

type PostOp = "add" | "sub" | "mul" | "divDb" | "envRms" | "envAvg" | "fft";

const POST_OPS: Array<{ id: PostOp; label: string }> = [
  { id: "add", label: "A+B" },
  { id: "sub", label: "A−B" },
  { id: "mul", label: "A·B" },
  { id: "divDb", label: "A/B dB" },
  { id: "envRms", label: "Hüll RMS" },
  { id: "envAvg", label: "Hüll AVG" },
  { id: "fft", label: "FFT" },
];

function PostPanel({ time, signals, names }: { time: number[]; signals: Record<string, number[]>; names: string[] }) {
  const [a, setA] = useState(names[0] ?? "");
  const [b, setB] = useState(names[1] ?? names[0] ?? "");
  const [op, setOp] = useState<PostOp>("sub");
  if (names.length === 0) return null;
  // Neue Analyse, neue Kurvennamen: still auf gültige Auswahl zurückfallen.
  const aSafe = signals[a] !== undefined ? a : names[0];
  const bSafe = signals[b] !== undefined ? b : (names[1] ?? names[0]);
  const av = signals[aSafe] ?? [];
  const bv = signals[bSafe] ?? [];
  const binary = op === "add" || op === "sub" || op === "mul" || op === "divDb";
  let rx = time;
  let ry: number[] = [];
  let rname = "";
  let yLabel = "V";
  let logX = false;
  if (op === "fft") {
    const f = postFFT(time, av);
    rx = f.freq;
    ry = f.magDb;
    rname = `FFT(${aSafe})`;
    yLabel = "dB";
    logX = true;
  } else if (op === "envRms" || op === "envAvg") {
    ry = movingEnvelope(av, envelopeWindow(av.length), op === "envRms" ? "rms" : "avg");
    rx = time.slice(0, ry.length);
    rname = `${op === "envRms" ? "RMS" : "AVG"}(${aSafe})`;
  } else {
    ry = combineSeries(av, bv, op);
    rx = time.slice(0, ry.length);
    rname = op === "add" ? `${aSafe}+${bSafe}` : op === "sub" ? `${aSafe}−${bSafe}` : op === "mul" ? `${aSafe}·${bSafe}` : `${aSafe}/${bSafe} dB`;
    yLabel = op === "divDb" ? "dB" : "V";
  }
  const sel = "input mono w-28 py-0.5 text-2xs";
  return (
    <div className="shrink-0 border-t border-hairline px-2 pb-2 pt-1.5">
      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5">
        <span className="mr-1 text-2xs uppercase text-ink-3">Postprozessor</span>
        <select className={sel} value={aSafe} onChange={(e) => setA(e.target.value)} aria-label="Kurve A">
          {names.map((n) => (<option key={n} value={n}>{n}</option>))}
        </select>
        {binary && (
          <select className={sel} value={bSafe} onChange={(e) => setB(e.target.value)} aria-label="Kurve B">
            {names.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        )}
        {POST_OPS.map((o) => (
          <button
            key={o.id}
            className={op === o.id ? "btn btn-primary py-0.5 text-2xs" : "btn py-0.5 text-2xs"}
            aria-pressed={op === o.id}
            onClick={() => setOp(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="h-44">
        <LinePlot
          panels={[{ series: [{ name: rname, x: rx, y: ry }], yLabel }]}
          xLabel={op === "fft" ? "f (Hz)" : "t (s)"}
          logX={logX}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grapher: Ergebnisse der letzten Analyse                              */
/* ------------------------------------------------------------------ */

/** S5.13: Kurven-Auswahl + WAV-Export (16-bit PCM mono, spitzennormiert). */
function WavExport({
  base,
  time,
  signals,
  names,
}: {
  base: string;
  time: number[];
  signals: Record<string, number[]>;
  names: string[];
}) {
  const [sel, setSel] = useState(names[0] ?? "");
  const name = names.includes(sel) ? sel : (names[0] ?? "");
  if (!names.length) return null;
  const rate = nativeRate(time);
  return (
    <span className="flex items-center gap-1">
      <select
        className="input h-6 max-w-[130px] truncate px-1 text-2xs"
        value={name}
        onChange={(e) => setSel(e.target.value)}
        title="Kurve für den WAV-Export"
        aria-label="Kurve für den WAV-Export"
      >
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button
        className="btn py-1 text-2xs"
        onClick={() => {
          const wav = curveToWav(time, signals[name] ?? []);
          if (!wav) {
            useEditor.getState().setToast({
              message: `WAV nicht möglich (Zeitachse unbrauchbar oder > ${WAV_MAX_SAMPLES.toLocaleString("de-DE")} Samples).`,
            });
            return;
          }
          const blob = new Blob([wav.bytes.buffer as ArrayBuffer], { type: "audio/wav" });
          downloadBlob(`${base}_tran_${safeName(name)}_${wav.rate}Hz.wav`, blob);
        }}
        title={`„${name}" als WAV exportieren (16-bit PCM mono, ${rate ? `${rate} Hz nativ` : "—"}, spitzennormiert auf −1 dBFS)`}
        aria-label={`„${name}" als WAV exportieren`}
      >
        <AudioLines size={13} /> WAV
      </button>
    </span>
  );
}

export default function Grapher() {
  const analysis = useEditor((s) => s.analysis);
  const docName = useEditor((s) => s.doc.name);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // S2.1: Fortschritt + Abbrechen (Worker); ohne Fortschrittsdaten Puls-Balken.
  if (analysis.running) {
    const frac = analysis.progress ?? 0;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <div className="text-xs text-ink-2">Analyse „{ANALYSIS_MAP[analysis.kind]?.title ?? analysis.kind}“ läuft …</div>
        <div className="h-1.5 w-56 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Analysefortschritt">
          {frac > 0 ? (
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(frac * 100)}%` }} />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
          )}
        </div>
        <div className="mono text-2xs text-ink-3">{frac > 0 ? `${Math.round(frac * 100)} %` : "rechnet …"}</div>
        <button
          className="btn py-1 text-2xs"
          onClick={() => useEditor.getState().cancelAnalysis()}
          title="Analyse abbrechen"
        >
          <XCircle size={13} /> Abbrechen
        </button>
      </div>
    );
  }
  // S2.2: gestalteter Konvergenz-Zustand statt rohem Fehlertext.
  if (analysis.error) {
    const title =
      analysis.convergence === "singular"
        ? "Singuläre Matrix"
        : analysis.convergence === "nonconvergent"
          ? "Keine Konvergenz"
          : "Analyse fehlgeschlagen";
    const hint =
      analysis.convergence === "singular"
        ? "Das Gleichungssystem ist unterbestimmt — typisch: Knoten ohne DC-Pfad zur Masse oder Schleife aus idealen Spannungsquellen."
        : analysis.convergence === "nonconvergent"
          ? "Newton-Raphson hat die Iterationsgrenze erreicht — die markierten Knoten sind die größten Widersprüche im letzten Schritt."
          : null;
    const suspects = analysis.suspects ?? [];
    const showSuspect = (s: string) => {
      const st = useEditor.getState();
      const branch = /^I\((.*)\)$/.exec(s)?.[1];
      if (branch) {
        // Stromzweig-Verdacht → Bauteil suchen und zentrieren.
        const inst = st.doc.instances.find((i) => i.label === branch || i.id === branch);
        if (inst) {
          st.setView({ x: inst.x - 200, y: inst.y - 150, zoom: 1.2 });
          st.setSelection([inst.id]);
          return;
        }
      }
      st.spotlightNet(s);
    };
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-err/10 text-err">
          <AlertTriangle size={22} />
        </div>
        <div className="text-sm font-medium">{title}</div>
        <div className="max-w-md text-xs text-ink-2">{analysis.error}</div>
        {hint && <div className="max-w-md text-2xs leading-relaxed text-ink-3">{hint}</div>}
        {suspects.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <div className="text-2xs uppercase tracking-wide text-ink-3">Verdächtige Knoten</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {suspects.map((s) => (
                <button
                  key={s}
                  className="mono rounded-md border border-err/40 bg-err/10 px-2 py-1 text-2xs text-err hover:bg-err/20"
                  onClick={() => showSuspect(s)}
                  title={`Problemknoten ${s} zeigen`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button className="btn py-1 text-2xs" onClick={() => showSuspect(suspects[0])} title="Schlimmsten Verdächtigen auf der Leinwand zeigen">
              <Crosshair size={13} /> Problemknoten zeigen
            </button>
          </div>
        )}
      </div>
    );
  }
  if (!analysis.data)
    return <div className="p-4 text-xs text-ink-3">Noch keine Analyse ausgeführt — Menü „Analysen“ wählen.</div>;

  const def = ANALYSIS_MAP[analysis.kind];
  const d = analysis.data as Record<string, unknown>;
  const meta = analysis.meta ?? {};
  const base = safeName(docName);

  const exportPng = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) downloadBlob(`${base}_${analysis.kind}.png`, blob);
    }, "image/png");
  };

  const head = (extra: string, csv?: () => void, png = true, audio?: React.ReactNode) => (
    <div className="flex shrink-0 items-center gap-2 px-3 pb-1.5 pt-2">
      <span className="text-xs font-medium">{def?.title ?? analysis.kind}</span>
      <span className="mono text-2xs text-ink-3">
        {analysis.durationMs} ms · {extra}
      </span>
      <div className="flex-1" />
      {png && (
        <button className="btn py-1 text-2xs" onClick={exportPng} title="Diagramm als PNG exportieren" aria-label="Diagramm als PNG exportieren">
          <ImageDown size={13} /> PNG
        </button>
      )}
      {csv && (
        <button className="btn py-1 text-2xs" onClick={csv} title="Daten als CSV exportieren" aria-label="Daten als CSV exportieren">
          <Download size={13} /> CSV
        </button>
      )}
      {audio}
    </div>
  );

  if (analysis.kind === "tran") {
    const time = (d.time as number[]) ?? [];
    const signals = (d.signals as Record<string, number[]>) ?? {};
    const names = Object.keys(signals);
    return (
      <div className="flex h-full flex-col">
        {head(
          `${time.length} Punkte · ${names.length} Kurven`,
          () =>
            downloadText(`${base}_tran.csv`, toCsv(["t_s", ...names], [time, ...names.map((n) => signals[n])]), "text/csv"),
          true,
          <WavExport base={base} time={time} signals={signals} names={names} />,
        )}
        <div className="px-3"><Legend names={names} /></div>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_210px] gap-2 px-2 pb-2">
          <LinePlot panels={[{ series: names.map((n) => ({ name: n, x: time, y: signals[n] })), yLabel: "V" }]} xLabel="t (s)" onCanvas={(c) => (canvasRef.current = c)} />
          <CurveStatsPanel items={names.map((n) => ({ name: n, stats: curveStats(signals[n] ?? []), unit: "V" }))} />
        </div>
        <PostPanel time={time} signals={signals} names={names} />
      </div>
    );
  }

  if (analysis.kind === "ac") {
    const freq = (d.freq as number[]) ?? [];
    const magDb = (d.magDb as Record<string, number[]>) ?? {};
    const phase = (d.phase as Record<string, number[]>) ?? {};
    const names = Object.keys(magDb);
    return (
      <div className="flex h-full flex-col">
        {head(`${freq.length} Punkte · ${names.length} Ausgänge`, () =>
          downloadText(
            `${base}_ac.csv`,
            toCsv(["f_Hz", ...names.flatMap((n) => [`${n}_dB`, `${n}_deg`])], [freq, ...names.flatMap((n) => [magDb[n], phase[n]])]),
            "text/csv",
          ),
        )}
        <div className="px-3"><Legend names={names} /></div>
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_210px] gap-2 px-2 pb-2">
          <LinePlot
            panels={[
              { series: names.map((n) => ({ name: n, x: freq, y: magDb[n] })), yLabel: "dB" },
              { series: names.map((n) => ({ name: n, x: freq, y: phase[n] })), yLabel: "°" },
            ]}
            xLabel="f (Hz)"
            logX
            onCanvas={(c) => (canvasRef.current = c)}
          />
          <CurveStatsPanel items={names.map((n) => ({ name: n, stats: curveStats((magDb[n] ?? []).map((v) => Math.pow(10, v / 20))), unit: "", f3: fMinus3dB(freq, magDb[n] ?? []) }))} />
        </div>
      </div>
    );
  }

  if (analysis.kind === "dc") {
    const values = (d.values as number[]) ?? [];
    const signals = (d.signals as Record<string, number[]>) ?? {};
    const names = Object.keys(signals);
    const src = typeof meta.sourceId === "string" && meta.sourceId ? String(meta.sourceId) : "Quelle";
    return (
      <div className="flex h-full flex-col">
        {head(`${values.length} Punkte · ${names.length} Kurven`, () =>
          downloadText(`${base}_dc.csv`, toCsv([`${src}_V`, ...names], [values, ...names.map((n) => signals[n])]), "text/csv"),
        )}
        <div className="px-3"><Legend names={names} /></div>
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot panels={[{ series: names.map((n) => ({ name: n, x: values, y: signals[n] })), yLabel: "V" }]} xLabel={`${src} (V)`} onCanvas={(c) => (canvasRef.current = c)} />
        </div>
      </div>
    );
  }

  if (analysis.kind === "noise") {
    const freq = (d.freq as number[]) ?? [];
    const out = (d.outputNoise as number[]) ?? [];
    const inp = (d.inputNoise as number[]) ?? [];
    const contributors = (d.contributors as Array<{ id: string; contribution: number }>) ?? [];
    return (
      <div className="flex h-full flex-col">
        {head(`${freq.length} Punkte · RMS ${formatValue(Number(d.totalRms), "V")}`, () =>
          downloadText(`${base}_noise.csv`, toCsv(["f_Hz", "Vout_VrtHz", "Vin_VrtHz"], [freq, out, inp]), "text/csv"),
        )}
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_220px] gap-2 px-2 pb-2">
          <LinePlot
            panels={[{ series: [{ name: "Ausgang", x: freq, y: out }, { name: "Eingang", x: freq, y: inp }], yLabel: "V/√Hz" }]}
            xLabel="f (Hz)"
            logX
            logY
            onCanvas={(c) => (canvasRef.current = c)}
          />
          <div className="mono overflow-y-auto text-2xs">
            <div className="mb-1 text-2xs uppercase text-ink-3">Hauptverursacher</div>
            {contributors.slice(0, 12).map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <span className="text-ink-3">{c.id}</span>
                <span>{formatValue(Math.sqrt(c.contribution), "")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (analysis.kind === "temp") {
    const temps = (d.temps as number[]) ?? [];
    const values = (d.values as number[]) ?? [];
    const out = typeof meta.outNode === "string" ? String(meta.outNode) : "";
    return (
      <div className="flex h-full flex-col">
        {head(`${temps.length} Punkte${out ? ` · ${out}` : ""}`, () =>
          downloadText(`${base}_temp.csv`, toCsv(["T_C", "value"], [temps, values]), "text/csv"),
        )}
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot panels={[{ series: [{ name: out || "Wert", x: temps, y: values }], yLabel: "V" }]} xLabel="T (°C)" onCanvas={(c) => (canvasRef.current = c)} />
        </div>
      </div>
    );
  }

  if (analysis.kind === "iv") {
    const curves = (d.curves as Array<{ label: string; x: number[]; y: number[] }>) ?? [];
    const dev = typeof meta.measureDeviceId === "string" ? String(meta.measureDeviceId) : "";
    const src = typeof meta.sourceId === "string" ? String(meta.sourceId) : "";
    return (
      <div className="flex h-full flex-col">
        {head(`${curves.length} Kennlinien${dev ? ` · ${dev}` : ""}`, () =>
          downloadText(
            `${base}_iv.csv`,
            toCsv(["V", ...curves.map((c) => `I_${c.label}_A`)], [curves[0]?.x ?? [], ...curves.map((c) => c.y)]),
            "text/csv",
          ),
        )}
        <div className="px-3"><Legend names={curves.map((c) => c.label)} /></div>
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot panels={[{ series: curves.map((c) => ({ name: c.label, x: c.x, y: c.y })), yLabel: "A" }]} xLabel={`${src ? `${src} ` : ""}(V)`} onCanvas={(c) => (canvasRef.current = c)} />
        </div>
      </div>
    );
  }

  if (analysis.kind === "thd") {
    const harmonics = (d.harmonics as Array<{ n: number; freq: number; mag: number; relative: number }>) ?? [];
    const sf = (d.spectrumFreq as number[]) ?? [];
    const sdb = (d.spectrumDb as number[]) ?? [];
    const out = typeof meta.outNode === "string" ? String(meta.outNode) : "";
    const maxRel = Math.max(...harmonics.map((h) => h.relative), 1);
    return (
      <div className="flex h-full flex-col">
        {head(`THD ${Number(d.thdPercent).toFixed(3)} % (${Number(d.thdDb).toFixed(1)} dB)${out ? ` · ${out}` : ""}`, () =>
          downloadText(
            `${base}_thd.csv`,
            toCsv(["n", "f_Hz", "mag_V", "rel"], [harmonics.map((h) => h.n), harmonics.map((h) => h.freq), harmonics.map((h) => h.mag), harmonics.map((h) => h.relative)]),
            "text/csv",
          ),
        )}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 px-2 pb-2">
          <div className="flex min-h-0 flex-col">
            <div className="px-1 pb-1 text-2xs text-ink-3">Oberwellen</div>
            <div className="flex min-h-0 flex-1 items-end gap-1.5">
              {harmonics.map((h) => (
                <div key={h.n} className="flex h-full min-h-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t" style={{ height: `${Math.max((h.relative / maxRel) * 100, 1.5)}%`, background: h.n === 1 ? "var(--accent)" : "var(--ch3)" }} title={`${formatValue(h.freq, "Hz")}: ${formatValue(h.mag, "V")}`} />
                  <span className="mono shrink-0 text-2xs text-ink-3">{h.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="px-1 pb-1 text-2xs text-ink-3">Spektrum</div>
            <div className="min-h-0 flex-1">
              <LinePlot panels={[{ series: [{ name: "Spektrum", x: sf, y: sdb }], yLabel: "dB" }]} xLabel="f (Hz)" logX onCanvas={(c) => (canvasRef.current = c)} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (analysis.kind === "op") {
    const nodes = (d.nodes as Record<string, number>) ?? {};
    const currents = (d.currents as Record<string, number>) ?? {};
    const names = Object.keys(nodes);
    return (
      <div className="flex h-full flex-col">
        {head(`${names.length} Knoten`, () =>
          downloadText(
            `${base}_op.csv`,
            [...names.map((k) => `V(${k});${nodes[k]}`), ...Object.keys(currents).map((k) => `${k};${currents[k]}`)].join("\n"),
            "text/csv",
          ),
          false,
        )}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto px-3 pb-2 text-2xs mono">
          <div>
            <div className="mb-1 text-2xs uppercase text-ink-3">Knotenspannungen</div>
            {names.map((k) => (
              <div key={k} className="flex justify-between">
                <span className="text-ink-3">V({k})</span>
                <span>{formatValue(nodes[k], "V")}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-2xs uppercase text-ink-3">Zweigströme</div>
            {Object.keys(currents).slice(0, 60).map((k) => (
              <div key={k} className="flex justify-between">
                <span className="text-ink-3">{k}</span>
                <span>{formatValue(currents[k], "A")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (analysis.kind === "montecarlo") {
    const hist = (d.histogram as Array<{ x: number; count: number }>) ?? [];
    const max = Math.max(...hist.map((h) => h.count), 1);
    const samples = (d.samples as number[]) ?? [];
    return (
      <div className="flex h-full flex-col">
        {head(`${samples.length} Durchläufe · Yield ${Number(d.yieldPct).toFixed(1)} %`, () =>
          downloadText(`${base}_mc.csv`, samples.map((s) => String(s)).join("\n"), "text/csv"),
          false,
        )}
        <div className="flex min-h-0 flex-1 gap-4 px-3 pb-2">
          <div className="mono shrink-0 space-y-0.5 text-2xs">
            <div>µ = {formatValue(Number(d.mean), "V")}</div>
            <div>σ = {formatValue(Number(d.sigma), "V")}</div>
            <div>min = {formatValue(Number(d.min), "V")}</div>
            <div>max = {formatValue(Number(d.max), "V")}</div>
          </div>
          <div className="flex min-h-0 flex-1 items-end gap-1">
            {hist.map((h, i) => (
              <div key={i} className="min-h-[2px] flex-1 rounded-t" style={{ height: `${(h.count / max) * 100}%`, background: "var(--accent)" }} title={`${formatValue(h.x, "V")}: ${h.count}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (analysis.kind === "worstcase") {
    const sens = (d.sensitivities as Array<{ id: string; param: string; sensitivity: number }>) ?? [];
    return (
      <div className="flex h-full flex-col">
        {head(`Nominal ${formatValue(Number(d.nominal), "V")}`, () =>
          downloadText(
            `${base}_wc.csv`,
            ["Bauteil;Parameter;Empfindlichkeit", ...sens.map((s) => `${s.id};${s.param};${s.sensitivity}`)].join("\n"),
            "text/csv",
          ),
          false,
        )}
        <div className="flex min-h-0 flex-1 gap-6 overflow-auto px-3 pb-2 text-2xs mono">
          <div className="shrink-0 space-y-0.5">
            <div style={{ color: "var(--err)" }}>Min: {formatValue(Number(d.low), "V")}</div>
            <div style={{ color: "var(--ok)" }}>Max: {formatValue(Number(d.high), "V")}</div>
          </div>
          <div className="min-w-[280px] flex-1">
            <div className="mb-1 text-2xs uppercase text-ink-3">Empfindlichkeiten</div>
            {sens.map((s) => (
              <div key={s.id + s.param} className="flex justify-between">
                <span className="text-ink-3">{s.id}.{s.param}</span>
                <span>{s.sensitivity.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (analysis.kind === "tf") {
    const gain = Number(d.gain);
    const rin = Number(d.inputResistance);
    const rout = Number(d.outputResistance);
    const fmtR = (v: number) => (Number.isFinite(v) ? formatValue(v, "Ω") : "∞");
    const gainDb = gain !== 0 ? 20 * Math.log10(Math.abs(gain)) : Number.NEGATIVE_INFINITY;
    return (
      <div className="flex h-full flex-col">
        {head("Kleinsignal am DC-Arbeitspunkt", () =>
          downloadText(`${base}_tf.csv`, ["Kennwert;Wert", `Verstaerkung;${gain}`, `Rin_Ohm;${rin}`, `Rout_Ohm;${rout}`].join("\n"), "text/csv"),
          false,
        )}
        <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-auto px-3 pb-2">
          {[
            { k: "Verstärkung", v: Number.isFinite(gain) ? `× ${gain.toPrecision(4)}` : "–", s: Number.isFinite(gainDb) ? `${gainDb.toFixed(2)} dB` : "–" },
            { k: "Eingangswiderstand", v: fmtR(rin), s: "an der Quelle" },
            { k: "Ausgangswiderstand", v: fmtR(rout), s: "Thévenin, Eingang AC-kurz" },
          ].map((c) => (
            <div key={c.k} className="rounded-panel border border-hairline bg-surface-2 p-2.5">
              <div className="text-2xs uppercase tracking-wide text-ink-3">{c.k}</div>
              <div className="mono mt-1 text-lg font-semibold">{c.v}</div>
              <div className="mono text-2xs text-ink-3">{c.s}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analysis.kind === "sensitivity") {
    const sens = (d.sensitivities as Array<{ device: string; param: string; sensitivity: number }>) ?? [];
    const mode = String(d.mode ?? (meta as Record<string, unknown>).mode ?? "dc");
    const freq = Number(d.frequency);
    return (
      <div className="flex h-full flex-col">
        {head(
          mode === "ac" ? `AC · |H| bei ${formatValue(freq, "Hz")}` : "DC · Arbeitspunkt",
          () =>
            downloadText(
              `${base}_sens.csv`,
              ["Bauteil;Parameter;Empfindlichkeit", ...sens.map((s) => `${s.device};${s.param};${s.sensitivity}`)].join("\n"),
              "text/csv",
            ),
          false,
        )}
        <div className="mono min-h-0 flex-1 overflow-auto px-3 pb-2 text-2xs">
          <div className="mb-1 text-2xs uppercase text-ink-3">Normierte Empfindlichkeiten (dU/U)/(dp/p)</div>
          {sens.slice(0, 60).map((s) => (
            <div key={s.device + s.param} className="flex justify-between gap-2">
              <span className="text-ink-3">{s.device}.{s.param}</span>
              <span>{s.sensitivity.toPrecision(4)}</span>
            </div>
          ))}
          {typeof d.autoDrive === "string" && d.autoDrive && (
            <div className="mt-2 text-ink-3">AC-Anregung: {String(d.autoDrive)} (automatisch, ac = 1).</div>
          )}
        </div>
      </div>
    );
  }

  if (analysis.kind === "pz") {
    const poles = (d.poles as Array<{ real: number; imag: number }>) ?? [];
    const zeros = (d.zeros as Array<{ real: number; imag: number }>) ?? [];
    const all = [...poles, ...zeros];
    const peak = all.reduce((m, r) => Math.max(m, Math.abs(r.real), Math.abs(r.imag)), 0);
    const R = peak > 0 ? peak * 1.15 : 1;
    const X = (v: number) => 150 + (v / R) * 130;
    const Y = (v: number) => 110 - (v / R) * 90;
    const fmtS = (r: { real: number; imag: number }) => {
      const f0 = Math.hypot(r.real, r.imag) / (2 * Math.PI);
      const s = `${r.real.toPrecision(4)}${r.imag >= 0 ? " + j" : " − j"}${Math.abs(r.imag).toPrecision(4)}`;
      return `${s}  ·  f₀ ${formatValue(f0, "Hz")}`;
    };
    return (
      <div className="flex h-full flex-col">
        {head(
          `Ordnung ${String(d.order ?? "?")} · Anpassung ±${Number(d.fitErrorDb).toPrecision(2)} dB RMS`,
          () =>
            downloadText(
              `${base}_pz.csv`,
              [
                "Typ;Real_1_s;Imag_1_s",
                ...poles.map((p) => `Pol;${p.real};${p.imag}`),
                ...zeros.map((z) => `Nullstelle;${z.real};${z.imag}`),
              ].join("\n"),
              "text/csv",
            ),
          false,
        )}
        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-3 overflow-auto px-3 pb-2">
          <svg viewBox="0 0 300 220" className="h-auto w-full shrink-0" role="img" aria-label="Pol-Nullstellen-Karte">
            <rect x="8" y="8" width="284" height="204" rx="8" fill="none" stroke="var(--hairline-strong)" />
            <line x1={X(-R)} y1={Y(0)} x2={X(R)} y2={Y(0)} stroke="var(--hairline-strong)" />
            <line x1={X(0)} y1={Y(R)} x2={X(0)} y2={Y(-R)} stroke="var(--hairline-strong)" />
            <text x={X(R) - 4} y={Y(0) - 6} textAnchor="end" fontSize="9" fill="var(--ink-3)">σ</text>
            <text x={X(0) + 6} y={Y(R) + 12} fontSize="9" fill="var(--ink-3)">jω</text>
            {zeros.map((z, i) => (
              <circle key={`z${i}`} cx={X(z.real)} cy={Y(z.imag)} r="5" fill="none" stroke="var(--ok)" strokeWidth="2" />
            ))}
            {poles.map((p, i) => (
              <g key={`p${i}`} stroke="var(--err)" strokeWidth="2">
                <line x1={X(p.real) - 5} y1={Y(p.imag) - 5} x2={X(p.real) + 5} y2={Y(p.imag) + 5} />
                <line x1={X(p.real) - 5} y1={Y(p.imag) + 5} x2={X(p.real) + 5} y2={Y(p.imag) - 5} />
              </g>
            ))}
          </svg>
          <div className="mono min-w-0 text-2xs">
            <div className="mb-1 text-2xs uppercase text-ink-3">Pole (×)</div>
            {poles.length === 0 && <div className="text-ink-3">–</div>}
            {poles.map((p, i) => (
              <div key={i} className="truncate">{fmtS(p)}</div>
            ))}
            <div className="mb-1 mt-2 text-2xs uppercase text-ink-3">Nullstellen (○)</div>
            {zeros.length === 0 && <div className="text-ink-3">–</div>}
            {zeros.map((z, i) => (
              <div key={i} className="truncate">{fmtS(z)}</div>
            ))}
            <div className="mt-2 text-ink-3">
              {Number(d.pruned) > 0 && <div>Gekürzt (koinzident): {String(d.pruned)}</div>}
              {Number(d.outside) > 0 && <div>Außerhalb des Vertrauensbands: {String(d.outside)}</div>}
              <div>Band {formatValue(Number(d.fmin), "Hz")} … {formatValue(Number(d.fmax), "Hz")}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (analysis.kind === "sparams") {
    const freq = (d.freq as number[]) ?? [];
    const s11db = (d.s11db as number[]) ?? [];
    const s11ph = (d.s11ph as number[]) ?? [];
    const s21db = (d.s21db as number[]) ?? [];
    const s21ph = (d.s21ph as number[]) ?? [];
    return (
      <div className="flex h-full flex-col">
        {head(`Z₀ = ${formatValue(Number(d.z0), "Ω")} · ${freq.length} Punkte`, () =>
          downloadText(
            `${base}_sparam.csv`,
            toCsv(["f_Hz", "S11_dB", "S11_deg", "S21_dB", "S21_deg"], [freq, s11db, s11ph, s21db, s21ph]),
            "text/csv",
          ),
        )}
        <div className="px-3"><Legend names={["S11", "S21"]} /></div>
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot
            panels={[
              { series: [{ name: "S11", x: freq, y: s11db }, { name: "S21", x: freq, y: s21db }], yLabel: "dB" },
              { series: [{ name: "S11", x: freq, y: s11ph }, { name: "S21", x: freq, y: s21ph }], yLabel: "°" },
            ]}
            xLabel="f (Hz)"
            logX
            onCanvas={(c) => (canvasRef.current = c)}
          />
        </div>
      </div>
    );
  }

  // S5.8: Kurvenschar — ein Series-Eintrag je Sweep-Kombination (max. 25).
  if (analysis.kind === "param" || analysis.kind === "nested") {
    const curves = (d.curves as Array<{ param?: number; param1?: number; param2?: number; time: number[]; signals: Record<string, number[]> }>) ?? [];
    const out = Object.keys(curves[0]?.signals ?? {})[0] ?? "";
    const p1 = typeof meta.param === "string" && meta.param ? String(meta.param) : "p1";
    const p2 = typeof meta.param2 === "string" && meta.param2 ? String(meta.param2) : "p2";
    const shown = curves.slice(0, 25);
    const names = shown.map((c) =>
      analysis.kind === "nested" ? `${p1}=${formatValue(c.param1 ?? 0, "")}, ${p2}=${formatValue(c.param2 ?? 0, "")}` : `${p1}=${formatValue(c.param ?? 0, "")}`,
    );
    return (
      <div className="flex h-full flex-col">
        {head(`${curves.length} Kurven${curves.length > shown.length ? ` (25 gezeigt)` : ""}${out ? ` · ${out}` : ""}`, () =>
          downloadText(
            `${base}_${analysis.kind}.csv`,
            toCsv(["t_s", ...names], [shown[0]?.time ?? [], ...shown.map((c) => c.signals[out] ?? [])]),
            "text/csv",
          ),
        )}
        <div className="px-3"><Legend names={names} /></div>
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot panels={[{ series: shown.map((c, i) => ({ name: names[i], x: c.time, y: c.signals[out] ?? [] })), yLabel: "V" }]} xLabel="t (s)" onCanvas={(c) => (canvasRef.current = c)} />
        </div>
      </div>
    );
  }

  // S5.8: Gebündelt — DC, AC-Betrag und TRAN untereinander.
  if (analysis.kind === "batched") {
    const dc = (d.dc as { values: number[]; signals: Record<string, number[]> }) ?? { values: [], signals: {} };
    const ac = (d.ac as { freq: number[]; magDb: Record<string, number[]> }) ?? { freq: [], magDb: {} };
    const tr = (d.tran as { time: number[]; signals: Record<string, number[]> }) ?? { time: [], signals: {} };
    const out = Object.keys(dc.signals)[0] ?? Object.keys(tr.signals)[0] ?? "";
    const src = typeof meta.sourceId === "string" && meta.sourceId ? String(meta.sourceId) : "Quelle";
    return (
      <div className="flex h-full flex-col">
        {head(`DC+AC+TRAN${out ? ` · ${out}` : ""}`, () =>
          downloadText(`${base}_batched_tran.csv`, toCsv(["t_s", out], [tr.time, tr.signals[out] ?? []]), "text/csv"),
        )}
        <div className="grid min-h-0 flex-1 grid-rows-3 gap-1 px-2 pb-2">
          <div className="flex min-h-0 flex-col">
            <div className="px-1 pb-0.5 text-2xs text-ink-3">DC-Sweep ({src})</div>
            <div className="min-h-0 flex-1"><LinePlot panels={[{ series: [{ name: out, x: dc.values, y: dc.signals[out] ?? [] }], yLabel: "V" }]} xLabel={`${src} (V)`} /></div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="px-1 pb-0.5 text-2xs text-ink-3">AC-Betrag</div>
            <div className="min-h-0 flex-1"><LinePlot panels={[{ series: [{ name: out, x: ac.freq, y: ac.magDb[out] ?? [] }], yLabel: "dB" }]} xLabel="f (Hz)" logX /></div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="px-1 pb-0.5 text-2xs text-ink-3">Transiente</div>
            <div className="min-h-0 flex-1"><LinePlot panels={[{ series: [{ name: out, x: tr.time, y: tr.signals[out] ?? [] }], yLabel: "V" }]} xLabel="t (s)" onCanvas={(c) => (canvasRef.current = c)} /></div>
          </div>
        </div>
      </div>
    );
  }

  // S5.8: THD über dem Aussteuerpegel.
  if (analysis.kind === "thdsweep") {
    const levels = (d.levels as number[]) ?? [];
    const thd = (d.thdPercent as number[]) ?? [];
    const out = typeof meta.outNode === "string" ? String(meta.outNode) : "";
    return (
      <div className="flex h-full flex-col">
        {head(`${levels.length} Stufen${out ? ` · ${out}` : ""}`, () =>
          downloadText(`${base}_thdsweep.csv`, toCsv(["pegel_V", "thd_%"], [levels, thd]), "text/csv"),
        )}
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot panels={[{ series: [{ name: "THD", x: levels, y: thd }], yLabel: "%" }]} xLabel="Pegel (V)" onCanvas={(c) => (canvasRef.current = c)} />
        </div>
      </div>
    );
  }

  return (
    <pre className="mono h-full overflow-auto p-3 text-2xs leading-relaxed text-ink-2">{JSON.stringify(analysis.data, null, 2).slice(0, 8000)}</pre>
  );
}
