"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImageDown } from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { ANALYSIS_MAP } from "@/lib/sim/analysis_defs";
import { useEditor } from "@/state/editor";
import { downloadBlob, downloadText, safeName } from "./ui";

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

      const grid = cssVar("--grid", "rgba(128,140,165,.15)");
      const mute = cssVar("--text-mute", "#64708c");
      ctx.fillStyle = cssVar("--canvas", "#0d1017");
      ctx.fillRect(0, 0, w, h);

      const padL = 58;
      const padR = 10;
      const padT = 8;
      const padB = 24;
      const plotW = w - padL - padR;
      const panelH = (h - padT - padB) / panels.length;
      ctx.font = "9.5px ui-monospace, monospace";

      // Gemeinsame X-Domäne über alle Panels.
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const p of panels) for (const s of p.series) for (const v of s.x) {
        if (v < x0) x0 = v;
        if (v > x1) x1 = v;
      }
      if (!(x1 > x0)) {
        x0 = 0;
        x1 = 1;
      }
      const lx0 = logX ? Math.log10(Math.max(x0, 1e-30)) : x0;
      const lx1 = logX ? Math.log10(Math.max(x1, 1e-29)) : x1;
      const xOf = (v: number) => padL + (((logX ? Math.log10(Math.max(v, 1e-30)) : v) - lx0) / (lx1 - lx0 || 1)) * plotW;

      const panelGeom: Array<{ top: number; yOf: (v: number) => number; series: PlotSeries[] }> = [];
      panels.forEach((panel, pi) => {
        const top = padT + pi * panelH;
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
        const ly0 = logY ? Math.log10(Math.max(y0, 1e-30)) : y0;
        const ly1 = logY ? Math.log10(Math.max(y1, 1e-29)) : y1;
        const yOf = (v: number) => top + panelH - 4 - (((logY ? Math.log10(Math.max(v, 1e-30)) : v) - ly0) / (ly1 - ly0 || 1)) * (panelH - 8);
        panelGeom.push({ top, yOf, series: panel.series });

        // Y-Grid + Labels.
        const ticks = logY ? logTicks(y0, y1) : niceTicks(y0, y1);
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
      const xticks = logX ? logTicks(x0, x1) : niceTicks(x0, x1, 8);
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

      // Serien.
      panels.forEach((panel, pi) => {
        const { yOf } = panelGeom[pi];
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
      });

      // Hover-Fadenkreuz mit Werten (hover ist Dep des Effekts, also immer frisch).
      const hv = hover;
      if (hv && hv.px >= padL && hv.px <= w - padR) {
        ctx.strokeStyle = cssVar("--border-strong", "rgba(128,140,165,.4)");
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
        ctx.fillStyle = cssVar("--elev", "#1a2030");
        ctx.strokeStyle = cssVar("--border-strong", "rgba(128,140,165,.4)");
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
  }, [panels, xLabel, logX, logY, hover]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full"
      onMouseMove={(e) => {
        const r = canvasRef.current?.getBoundingClientRect();
        if (r) setHover({ px: e.clientX - r.left, py: e.clientY - r.top });
      }}
      onMouseLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 pb-1 text-[10.5px] text-mute">
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
/* Grapher: Ergebnisse der letzten Analyse                              */
/* ------------------------------------------------------------------ */

export default function Grapher() {
  const analysis = useEditor((s) => s.analysis);
  const docName = useEditor((s) => s.doc.name);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (analysis.running) return <div className="p-4 text-[12px] text-mute">Analyse „{ANALYSIS_MAP[analysis.kind]?.title ?? analysis.kind}“ läuft …</div>;
  if (analysis.error)
    return (
      <div className="p-4 text-[12px]" style={{ color: "var(--err)" }}>
        ✕ {analysis.error}
      </div>
    );
  if (!analysis.data)
    return <div className="p-4 text-[12px] text-mute">Noch keine Analyse ausgeführt — Menü „Analysen“ wählen.</div>;

  const def = ANALYSIS_MAP[analysis.kind];
  const d = analysis.data as Record<string, unknown>;
  const meta = analysis.meta ?? {};
  const base = safeName(docName);

  const exportPng = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) downloadBlob(`${base}_${analysis.kind}.png`, blob);
    }, "image/png");
  };

  const head = (extra: string, csv?: () => void, png = true) => (
    <div className="flex shrink-0 items-center gap-2 px-3 pb-1.5 pt-2">
      <span className="text-[12px] font-medium">{def?.title ?? analysis.kind}</span>
      <span className="mono text-[10.5px] text-mute">
        {analysis.durationMs} ms · {extra}
      </span>
      <div className="flex-1" />
      {png && (
        <button className="btn py-1 text-[11.5px]" onClick={exportPng} title="Diagramm als PNG exportieren">
          <ImageDown size={13} /> PNG
        </button>
      )}
      {csv && (
        <button className="btn py-1 text-[11.5px]" onClick={csv} title="Daten als CSV exportieren">
          <Download size={13} /> CSV
        </button>
      )}
    </div>
  );

  if (analysis.kind === "tran") {
    const time = (d.time as number[]) ?? [];
    const signals = (d.signals as Record<string, number[]>) ?? {};
    const names = Object.keys(signals);
    return (
      <div className="flex h-full flex-col">
        {head(`${time.length} Punkte · ${names.length} Kurven`, () =>
          downloadText(`${base}_tran.csv`, toCsv(["t_s", ...names], [time, ...names.map((n) => signals[n])]), "text/csv"),
        )}
        <div className="px-3"><Legend names={names} /></div>
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot panels={[{ series: names.map((n) => ({ name: n, x: time, y: signals[n] })), yLabel: "V" }]} xLabel="t (s)" onCanvas={(c) => (canvasRef.current = c)} />
        </div>
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
        <div className="min-h-0 flex-1 px-2 pb-2">
          <LinePlot
            panels={[
              { series: names.map((n) => ({ name: n, x: freq, y: magDb[n] })), yLabel: "dB" },
              { series: names.map((n) => ({ name: n, x: freq, y: phase[n] })), yLabel: "°" },
            ]}
            xLabel="f (Hz)"
            logX
            onCanvas={(c) => (canvasRef.current = c)}
          />
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
          <div className="mono overflow-y-auto text-[11px]">
            <div className="mb-1 text-[10px] uppercase text-mute">Hauptverursacher</div>
            {contributors.slice(0, 12).map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <span className="text-mute">{c.id}</span>
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
            <div className="px-1 pb-1 text-[10.5px] text-mute">Oberwellen</div>
            <div className="flex min-h-0 flex-1 items-end gap-1.5">
              {harmonics.map((h) => (
                <div key={h.n} className="flex h-full min-h-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="w-full rounded-t" style={{ height: `${Math.max((h.relative / maxRel) * 100, 1.5)}%`, background: h.n === 1 ? "var(--accent)" : "var(--ch3)" }} title={`${formatValue(h.freq, "Hz")}: ${formatValue(h.mag, "V")}`} />
                  <span className="mono shrink-0 text-[9px] text-mute">{h.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="px-1 pb-1 text-[10.5px] text-mute">Spektrum</div>
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
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto px-3 pb-2 text-[11.5px] mono">
          <div>
            <div className="mb-1 text-[10px] uppercase text-mute">Knotenspannungen</div>
            {names.map((k) => (
              <div key={k} className="flex justify-between">
                <span className="text-mute">V({k})</span>
                <span>{formatValue(nodes[k], "V")}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase text-mute">Zweigströme</div>
            {Object.keys(currents).slice(0, 60).map((k) => (
              <div key={k} className="flex justify-between">
                <span className="text-mute">{k}</span>
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
          <div className="mono shrink-0 space-y-0.5 text-[11.5px]">
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
        <div className="flex min-h-0 flex-1 gap-6 overflow-auto px-3 pb-2 text-[11.5px] mono">
          <div className="shrink-0 space-y-0.5">
            <div style={{ color: "var(--err)" }}>Min: {formatValue(Number(d.low), "V")}</div>
            <div style={{ color: "var(--ok)" }}>Max: {formatValue(Number(d.high), "V")}</div>
          </div>
          <div className="min-w-[280px] flex-1">
            <div className="mb-1 text-[10px] uppercase text-mute">Empfindlichkeiten</div>
            {sens.map((s) => (
              <div key={s.id + s.param} className="flex justify-between">
                <span className="text-mute">{s.id}.{s.param}</span>
                <span>{s.sensitivity.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <pre className="mono h-full overflow-auto p-3 text-[10.5px] leading-relaxed text-dim">{JSON.stringify(analysis.data, null, 2).slice(0, 8000)}</pre>
  );
}
