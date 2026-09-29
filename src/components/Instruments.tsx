"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, Binary, Gauge, LineChart, Minus, PanelBottom, Radio, SlidersHorizontal, SquareActivity, Timer, Waves, X, Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { formatValue } from "@/lib/library/catalog";
import { spectrum } from "@/lib/sim/fft";
import { estimateFrequency, mean, peakToPeak, rms } from "@/lib/sim/realtime";
import { InstrumentKind, InstrumentWindow, engine, useEditor } from "@/state/editor";
import { adaptShortcut, useIsApple } from "@/lib/platform";

const CH_COLORS = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"];

/** Höhe der Statusleiste (Desktop) – das Geräte-Dock sitzt darüber (Runde 19). */
const STATUS_BAR_H = 26;

/* W24: SkeuoTek-Oszi (1:1-Port aus oszi/) – eigenes Chunk, kein SSR */
const OsziScopeLazy = dynamic(() => import("./OsziScope"), { ssr: false });
const FgScopeLazy = dynamic(() => import("./FgScope"), { ssr: false });
/** Runde 11: Trace-Farben folgen der Theme-Palette (--ch1…--ch4). */

const cssVar = (n: string, f: string) => {
  if (typeof window === "undefined") return f;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;
};

/* ------------------------------------------------------------------ */
/* generic animated plot surface                                       */
/* ------------------------------------------------------------------ */
function Plot({ render, className }: { render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; className?: string }) {
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

function grid(ctx: CanvasRenderingContext2D, w: number, h: number, cols = 10, rows = 8) {
  ctx.save();
  ctx.fillStyle = cssVar("--canvas", "#0d1017");
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = cssVar("--grid", "rgba(255,255,255,.06)");
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
  ctx.strokeStyle = cssVar("--grid-strong", "rgba(255,255,255,.12)");
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.restore();
}

function NetSelect({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  return (
    <select className="input py-0.5 text-[11px]" value={value} onChange={(e) => onChange(e.target.value)}>
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
function Multimeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const running = useEditor((s) => s.sim.running);
  const tick = useEditor((s) => s.sim.tick);
  const cfg = (win.config.dmm as { a: string; b: string; mode: string; range: string }) ?? {
    a: nets.find((n) => n !== "0") ?? "",
    b: "0",
    mode: "vdc",
    range: "auto",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, dmm: { ...cfg, ...p } } });

  let value = 0;
  let unit = "V";
  const ca = engine.channel(cfg.a, 4000);
  const cb = engine.channel(cfg.b, 4000);
  const diff = ca.v.map((v, i) => v - (cb.v[i] ?? 0));
  if (cfg.mode === "vdc") value = mean(diff);
  else if (cfg.mode === "vac") {
    const m = mean(diff);
    value = rms(diff.map((v) => v - m));
  } else if (cfg.mode === "adc" || cfg.mode === "aac") {
    const currents = engine.lastState.currents;
    const first = Object.keys(currents)[0];
    value = currents[first] ?? 0;
    unit = "A";
  } else if (cfg.mode === "ohm") {
    const v = mean(diff);
    const currents = Object.values(engine.lastState.currents);
    const i = currents.length ? currents[0] : 1e-9;
    value = Math.abs(v / (i || 1e-12));
    unit = "Ω";
  } else if (cfg.mode === "db") {
    const m = mean(diff);
    value = 20 * Math.log10(Math.max(rms(diff.map((v) => v - m)) / 0.7746, 1e-12));
    unit = "dBu";
  } else if (cfg.mode === "hz") {
    value = estimateFrequency(ca.t, ca.v);
    unit = "Hz";
  }
  void tick;

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="rounded-xl p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="mono text-right text-[34px] font-semibold leading-none tabular-nums" style={{ color: running ? "var(--ok)" : "var(--text-mute)" }}>
          {running ? formatValue(value, "") : "– – –"}
        </div>
        <div className="mono mt-1 text-right text-[12px] text-mute">{unit}</div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {[
          ["vdc", "V⎓"],
          ["vac", "V~"],
          ["adc", "A⎓"],
          ["aac", "A~"],
          ["ohm", "Ω"],
          ["db", "dB"],
          ["hz", "Hz"],
        ].map(([m, label]) => (
          <button key={m} className="tab text-center" data-active={cfg.mode === m} onClick={() => set({ mode: m })}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10.5px] text-mute">
          Messpunkt +
          <NetSelect value={cfg.a} onChange={(v) => set({ a: v })} />
        </label>
        <label className="text-[10.5px] text-mute">
          Messpunkt −
          <NetSelect value={cfg.b} onChange={(v) => set({ b: v })} />
        </label>
      </div>
      <div className="flex gap-1">
        {["auto", "200m", "2", "20", "200"].map((r) => (
          <button key={r} className="tab flex-1 text-center" data-active={cfg.range === r} onClick={() => set({ range: r })}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Der FG-2500 lebt in FgScope.tsx + components/fg2/ (W18)              */
/* ------------------------------------------------------------------ */

function Knob({ label, unit, value, min, max, log, onChange }: { label: string; unit: string; value: number; min: number; max: number; log?: boolean; onChange: (v: number) => void }) {
  const toSlider = (v: number) => (log ? Math.log10(Math.max(v, min || 1e-6)) : v);
  const fromSlider = (v: number) => (log ? Math.pow(10, v) : v);
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-dim">{label}</span>
        <span className="mono text-mute">{formatValue(value, unit)}</span>
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
function BodePlotter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const runAnalysis = useEditor((s) => s.runAnalysis);
  const analysis = useEditor((s) => s.analysis);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.bode as { out: string; fmin: number; fmax: number }) ?? { out: nets.find((n) => n !== "0") ?? "", fmin: 1, fmax: 1e6 };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, bode: { ...cfg, ...p } } });
  const data = analysis.kind === "ac" ? (analysis.data as { freq: number[]; magDb: Record<string, number[]>; phase: Record<string, number[]> } | undefined) : undefined;

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 12, 8);
      if (!data || !data.freq.length) {
        ctx.fillStyle = cssVar("--text-mute", "#64708c");
        ctx.font = "11px ui-sans-serif";
        ctx.fillText("AC-Sweep starten …", 12, 20);
        return;
      }
      const mags = data.magDb[cfg.out] ?? [];
      const phases = data.phase[cfg.out] ?? [];
      const f0 = Math.log10(data.freq[0]);
      const f1 = Math.log10(data.freq[data.freq.length - 1]);
      const maxDb = Math.max(...mags, 6);
      const minDb = Math.min(...mags, -60);
      const xOf = (f: number) => ((Math.log10(f) - f0) / (f1 - f0)) * w;
      ctx.strokeStyle = cssVar("--ch1", "#38bdf8");
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      mags.forEach((m, i) => {
        const x = xOf(data.freq[i]);
        const y = h - ((m - minDb) / (maxDb - minDb)) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = cssVar("--ch2", "#f472b6");
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      phases.forEach((p, i) => {
        const x = xOf(data.freq[i]);
        const y = h / 2 - (p / 180) * (h / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${maxDb.toFixed(0)} dB`, 4, 11);
      ctx.fillText(`${minDb.toFixed(0)} dB`, 4, h - 4);
      ctx.fillText(formatValue(data.freq[0], "Hz"), 4, h - 16);
      ctx.fillText(formatValue(data.freq[data.freq.length - 1], "Hz"), w - 56, h - 16);
    },
    [data, cfg.out],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-mute">
        <span>Ausgang</span>
        <NetSelect value={cfg.out} onChange={(v) => set({ out: v })} />
        <span>f</span>
        <input className="input w-20 py-0.5 text-[11px] mono" value={cfg.fmin} onChange={(e) => set({ fmin: Number(e.target.value) })} />
        <span>…</span>
        <input className="input w-24 py-0.5 text-[11px] mono" value={cfg.fmax} onChange={(e) => set({ fmax: Number(e.target.value) })} />
        <button
          className="btn btn-primary ml-auto"
          onClick={() => runAnalysis("ac", { outputs: [cfg.out], sweep: { start: cfg.fmin, stop: cfg.fmax, points: 24, type: "dec" } })}
          disabled={analysis.running}
        >
          {analysis.running ? "läuft …" : "Sweep starten"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
      <div className="flex gap-3 text-[10.5px] text-mute">
        <span style={{ color: "var(--ch1)" }}>— Amplitude (dB)</span>
        <span style={{ color: "var(--ch2)" }}>-- Phase (°)</span>
        {data && <span className="ml-auto mono">{data.freq.length} Punkte</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* logic analyzer                                                      */
/* ------------------------------------------------------------------ */
function LogicAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name).filter((n) => n !== "0"), [netResult.nets]);
  const fallbackCfg = useMemo<{ channels: string[]; span: number; threshold: number; radix: "hex" | "bin" }>(
    () => ({
      channels: nets.slice(0, 8),
      span: 0.05,
      threshold: 2.5,
      radix: "hex",
    }),
    [nets]
  );
  const cfg = (win.config.logic as { channels: string[]; span: number; threshold: number; radix: "hex" | "bin" }) ?? fallbackCfg;
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, logic: { ...cfg, ...p } } });

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = cssVar("--canvas", "#0d1017");
      ctx.fillRect(0, 0, w, h);
      const rows = Math.max(cfg.channels.length, 1);
      const rowH = h / rows;
      const samples = Math.max(64, Math.round(cfg.span * 40000));
      cfg.channels.forEach((net, i) => {
        const ch = engine.channel(net, samples);
        const y0 = i * rowH + rowH * 0.78;
        const y1 = i * rowH + rowH * 0.22;
        ctx.strokeStyle = cssVar("--grid", "rgba(255,255,255,.06)");
        ctx.beginPath();
        ctx.moveTo(0, i * rowH);
        ctx.lineTo(w, i * rowH);
        ctx.stroke();
        if (!ch.v.length) return;
        const t0 = ch.t[0];
        const span = Math.max(ch.t[ch.t.length - 1] - t0, 1e-9);
        ctx.strokeStyle = CH_COLORS[i % 4];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let prevHigh = ch.v[0] > cfg.threshold;
        ctx.moveTo(0, prevHigh ? y1 : y0);
        for (let k = 1; k < ch.v.length; k++) {
          const x = ((ch.t[k] - t0) / span) * w;
          const high = ch.v[k] > cfg.threshold;
          if (high !== prevHigh) {
            ctx.lineTo(x, prevHigh ? y1 : y0);
            ctx.lineTo(x, high ? y1 : y0);
            prevHigh = high;
          } else ctx.lineTo(x, high ? y1 : y0);
        }
        ctx.stroke();
        ctx.fillStyle = cssVar("--text-mute", "#64708c");
        ctx.font = "9.5px ui-monospace, monospace";
        ctx.fillText(net, 4, i * rowH + 11);
      });
      // bus value
      let word = 0;
      cfg.channels.forEach((net, i) => {
        const v = engine.lastState.nets[net] ?? 0;
        if (v > cfg.threshold) word |= 1 << i;
      });
      ctx.fillStyle = cssVar("--accent-2", "#22d3ee");
      ctx.font = "600 12px ui-monospace, monospace";
      const text = cfg.radix === "hex" ? `0x${word.toString(16).toUpperCase().padStart(2, "0")}` : `0b${word.toString(2).padStart(cfg.channels.length, "0")}`;
      ctx.fillText(text, w - 90, 14);
    },
    [cfg],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-1.5 text-[10.5px] text-mute">
        <span>Kanäle</span>
        <select
          className="input w-auto py-0.5 text-[11px]"
          multiple={false}
          value=""
          onChange={(e) => {
            if (e.target.value) set({ channels: [...cfg.channels, e.target.value].slice(0, 16) });
          }}
        >
          <option value="">+ hinzufügen</option>
          {nets.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => set({ channels: [] })}>
          leeren
        </button>
        <span className="ml-2">Schwelle</span>
        <input className="input w-16 py-0.5 text-[11px] mono" value={cfg.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />
        <select className="input w-auto py-0.5 text-[11px]" value={cfg.radix} onChange={(e) => set({ radix: e.target.value as "hex" | "bin" })}>
          <option value="hex">HEX</option>
          <option value="bin">BIN</option>
        </select>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* wattmeter                                                           */
/* ------------------------------------------------------------------ */
function Wattmeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const doc = useEditor((s) => s.doc);
  const tick = useEditor((s) => s.sim.tick);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.watt as { vnet: string; gnd: string; device: string }) ?? {
    vnet: nets.find((n) => n !== "0") ?? "",
    gnd: "0",
    device: doc.instances[0]?.label ?? "",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, watt: { ...cfg, ...p } } });
  void tick;

  const vch = engine.channel(cfg.vnet, 4000);
  const gch = engine.channel(cfg.gnd, 4000);
  const v = vch.v.map((x, i) => x - (gch.v[i] ?? 0));
  const i = engine.lastState.currents[cfg.device] ?? 0;
  const vrms = rms(v);
  const irms = Math.abs(i);
  const p = mean(v.map((x) => x * i));
  const s = vrms * irms;
  const pf = s > 0 ? p / s : 0;
  const q = Math.sqrt(Math.max(s * s - p * p, 0));

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10.5px] text-mute">
          Spannung an
          <NetSelect value={cfg.vnet} onChange={(x) => set({ vnet: x })} />
        </label>
        <label className="text-[10.5px] text-mute">
          Bezug
          <NetSelect value={cfg.gnd} onChange={(x) => set({ gnd: x })} />
        </label>
      </div>
      <label className="text-[10.5px] text-mute">
        Strom durch Bauteil
        <select className="input py-0.5 text-[11px]" value={cfg.device} onChange={(e) => set({ device: e.target.value })}>
          {doc.instances.map((x) => (
            <option key={x.id} value={x.label}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Wirkleistung P" value={formatValue(p, "W")} color="var(--ok)" />
        <Stat label="Scheinleistung S" value={formatValue(s, "VA")} color="var(--accent-2)" />
        <Stat label="Blindleistung Q" value={formatValue(q, "var")} color="var(--accent-3)" />
        <Stat label="Leistungsfaktor" value={pf.toFixed(3)} color="var(--warn)" />
        <Stat label="U rms" value={formatValue(vrms, "V")} />
        <Stat label="I rms" value={formatValue(irms, "A")} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
      <div className="text-[9.5px] text-mute">{label}</div>
      <div className="mono text-[15px] font-semibold" style={{ color: color ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* IV analyzer                                                         */
/* ------------------------------------------------------------------ */
function IvAnalyzer() {
  const doc = useEditor((s) => s.doc);
  const runAnalysis = useEditor((s) => s.runAnalysis);
  const analysis = useEditor((s) => s.analysis);
  const [device, setDevice] = useState(doc.instances.find((i) => ["D", "Q", "M", "J"].includes(i.label[0]))?.label ?? "");
  const [source, setSource] = useState(doc.instances.find((i) => i.partId.startsWith("v"))?.label ?? "");
  const data = analysis.kind === "iv" ? (analysis.data as { curves: Array<{ label: string; x: number[]; y: number[] }> } | undefined) : undefined;

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 10, 8);
      if (!data?.curves?.length) {
        ctx.fillStyle = cssVar("--text-mute", "#64708c");
        ctx.font = "11px ui-sans-serif";
        ctx.fillText("Kennlinie aufnehmen …", 12, 20);
        return;
      }
      const allY = data.curves.flatMap((c) => c.y);
      const allX = data.curves.flatMap((c) => c.x);
      const maxY = Math.max(...allY.map(Math.abs), 1e-9);
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      data.curves.forEach((c, i) => {
        ctx.strokeStyle = CH_COLORS[i % 4];
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        c.x.forEach((x, k) => {
          const px = ((x - minX) / Math.max(maxX - minX, 1e-9)) * w;
          const py = h - (Math.abs(c.y[k]) / maxY) * h * 0.92;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });
      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${formatValue(maxY, "A")}`, 4, 11);
      ctx.fillText(`${formatValue(minX, "V")}`, 4, h - 4);
      ctx.fillText(`${formatValue(maxX, "V")}`, w - 50, h - 4);
    },
    [data],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-mute">
        <span>Bauteil</span>
        <select className="input w-auto py-0.5 text-[11px]" value={device} onChange={(e) => setDevice(e.target.value)}>
          {doc.instances.map((i) => (
            <option key={i.id} value={i.label}>
              {i.label}
            </option>
          ))}
        </select>
        <span>Sweep-Quelle</span>
        <select className="input w-auto py-0.5 text-[11px]" value={source} onChange={(e) => setSource(e.target.value)}>
          {doc.instances.map((i) => (
            <option key={i.id} value={i.label}>
              {i.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary ml-auto"
          disabled={analysis.running}
          onClick={() =>
            runAnalysis("iv", {
              sourceId: source,
              measureDeviceId: device,
              sweep: { start: 0, stop: 5, points: 80, type: "lin" },
            })
          }
        >
          {analysis.running ? "misst …" : "Kennlinie"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* spectrum analyzer                                                   */
/* ------------------------------------------------------------------ */
function SpectrumAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.spec as { net: string }) ?? { net: nets.find((n) => n !== "0") ?? "" };
  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 10, 6);
      const ch = engine.channel(cfg.net, 8192);
      if (ch.v.length < 64) return;
      const dt = (ch.t[ch.t.length - 1] - ch.t[0]) / Math.max(ch.t.length - 1, 1);
      const sp = spectrum(ch.v, 1 / Math.max(dt, 1e-12), "blackman");
      const n = sp.freq.length;
      const barW = w / n;
      for (let i = 0; i < n; i++) {
        const db = Math.max(sp.magDb[i], -120);
        const bh = ((db + 120) / 120) * h;
        ctx.fillStyle = `hsl(${200 - (db + 120) * 0.9}, 85%, 58%)`;
        ctx.fillRect(i * barW, h - bh, Math.max(barW - 0.4, 0.6), bh);
      }
      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`0 … ${formatValue(sp.freq[n - 1] ?? 0, "Hz")}`, 6, h - 5);
    },
    [cfg.net],
  );
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-2 text-[10.5px] text-mute">
        <span>Signal</span>
        <NetSelect value={cfg.net} onChange={(v) => update(win.id, { config: { ...win.config, spec: { net: v } } })} />
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* pattern generator                                                   */
/* ------------------------------------------------------------------ */
function PatternGenerator() {
  const doc = useEditor((s) => s.doc);
  const setParam = useEditor((s) => s.setParam);
  const clocks = doc.instances.filter((i) => i.partId === "clockgen" || i.partId === "vpulse");
  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="text-[11px] text-mute">
        Treibt digitale Taktquellen und Pulsgeneratoren. Platziere »Taktgenerator (digital)« oder »Pulsquelle« im Schaltplan.
      </div>
      {clocks.map((c) => (
        <div key={c.id} className="rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="mono" style={{ color: "var(--accent-2)" }}>
              {c.label}
            </span>
            <span className="mono text-mute">{formatValue(Number(c.params.freq ?? 1000), "Hz")}</span>
          </div>
          <input
            type="range"
            className="w-full"
            min={-1}
            max={6}
            step={0.02}
            value={Math.log10(Number(c.params.freq ?? 1000))}
            onChange={(e) => setParam(c.id, "freq", Math.pow(10, Number(e.target.value)))}
          />
          {c.partId === "vpulse" && (
            <input
              type="range"
              className="mt-1 w-full"
              min={1}
              max={99}
              value={Number(c.params.duty ?? 50)}
              onChange={(e) => setParam(c.id, "duty", Number(e.target.value))}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* frequency counter                                                   */
/* ------------------------------------------------------------------ */
function FrequencyCounter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const running = useEditor((s) => s.sim.running);
  const tick = useEditor((s) => s.sim.tick);
  void tick;
  const cfg = (win.config.counter as { net: string }) ?? { net: nets.find((n) => n !== "0") ?? "" };

  const ch = engine.channel(cfg.net, 8192);
  const f = ch.v.length > 32 ? estimateFrequency(ch.t, ch.v) : 0;
  const avg = ch.v.length ? mean(ch.v) : 0;
  const duty = ch.v.length ? (ch.v.filter((v) => v > avg).length / ch.v.length) * 100 : 0;

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="rounded-xl p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="mono text-right text-[30px] font-semibold leading-none tabular-nums" style={{ color: running && f > 0 ? "var(--text)" : "var(--text-mute)" }}>
          {running && f > 0 ? formatValue(f, "") : "– – –"}
        </div>
        <div className="mono mt-1 text-right text-[12px] text-mute">Hz</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Periode" value={f > 0 ? formatValue(1 / f, "s") : "—"} />
        <Stat label="Tastgrad" value={f > 0 ? `${duty.toFixed(1)} %` : "—"} />
      </div>
      <label className="text-[10.5px] text-mute">
        Messknoten
        <NetSelect value={cfg.net} onChange={(v) => update(win.id, { config: { ...win.config, counter: { net: v } } })} />
      </label>
      {!running && <div className="text-[11px] text-mute">Zählt, sobald die Simulation läuft.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* logic converter – Multisim iconic                                    */
/* ------------------------------------------------------------------ */
function LogicConverter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const cfg = (win.config.logicconv as { inputs: number; table: number[]; expr: string }) ?? { inputs: 3, table: Array(8).fill(0).map((_,i)=> (i%2)), expr: "" };
  const set = (patch: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, logicconv: { ...cfg, ...patch } } });

  const inputs = cfg.inputs;
  const rows = 1 << inputs;
  const table = cfg.table.length === rows ? cfg.table : Array(rows).fill(0);

  // Generate Boolean expression via Quine-McCluskey (simplified)
  const generateExpr = () => {
    // Collect minterms
    const minterms: number[] = [];
    for (let r=0; r<rows; r++) if (table[r]) minterms.push(r);
    if (!minterms.length) { set({ expr: "0" }); return; }
    if (minterms.length === rows) { set({ expr: "1" }); return; }

    // Quine-McCluskey – group by ones count
    type Imp = { bits: string; minterms: number[]; used: boolean };
    let groups: Map<number, Imp[]> = new Map();
    for (const m of minterms) {
      const bits = m.toString(2).padStart(inputs, "0");
      const ones = bits.split("").filter(b=>b==="1").length;
      const arr = groups.get(ones) ?? [];
      arr.push({ bits, minterms: [m], used: false });
      groups.set(ones, arr);
    }

    const primeImplicants: Imp[] = [];
    let hasCombined = true;
    while (hasCombined) {
      hasCombined = false;
      const nextGroups = new Map<number, Imp[]>();
      const keys = Array.from(groups.keys()).sort((a,b)=>a-b);
      for (let k=0; k<keys.length-1; k++) {
        const g1 = groups.get(keys[k]) ?? [];
        const g2 = groups.get(keys[k+1]) ?? [];
        for (const a of g1) {
          for (const b of g2) {
            let diff = 0;
            let diffPos = -1;
            for (let i=0; i<inputs; i++) {
              if (a.bits[i] !== b.bits[i]) { diff++; diffPos = i; }
            }
            if (diff === 1) {
              hasCombined = true;
              a.used = true;
              b.used = true;
              const newBits = a.bits.substring(0,diffPos) + "-" + a.bits.substring(diffPos+1);
              const newMinterms = Array.from(new Set([...a.minterms, ...b.minterms])).sort((x,y)=>x-y);
              const ones = newBits.split("").filter(ch=>ch==="1").length;
              const arr = nextGroups.get(ones) ?? [];
              if (!arr.some(x=>x.bits===newBits)) arr.push({ bits: newBits, minterms: newMinterms, used: false });
              nextGroups.set(ones, arr);
            }
          }
        }
      }
      // Collect unused as prime
      for (const [, imps] of groups) {
        for (const imp of imps) if (!imp.used) primeImplicants.push(imp);
      }
      groups = nextGroups;
    }
    for (const [, imps] of groups) for (const imp of imps) primeImplicants.push(imp);

    // Essential prime selection – simple greedy covering
    const covered = new Set<number>();
    const selected: Imp[] = [];
    // First essential
    for (const m of minterms) {
      const covering = primeImplicants.filter(pi=> pi.minterms.includes(m));
      if (covering.length === 1 && !selected.includes(covering[0])) {
        selected.push(covering[0]);
        covering[0].minterms.forEach(x=> covered.add(x));
      }
    }
    // Greedy for rest
    let remaining = minterms.filter(m=> !covered.has(m));
    while (remaining.length) {
      let best: Imp | null = null;
      let bestCover = 0;
      for (const pi of primeImplicants) {
        if (selected.includes(pi)) continue;
        const cover = pi.minterms.filter(m=> remaining.includes(m)).length;
        if (cover > bestCover) { bestCover = cover; best = pi; }
      }
      if (!best) break;
      selected.push(best);
      best.minterms.forEach(x=> covered.add(x));
      remaining = minterms.filter(m=> !covered.has(m));
    }

    // Convert to expression
    const terms = selected.map(imp=>{
      const lits: string[] = [];
      for (let i=0; i<inputs; i++) {
        const ch = imp.bits[i];
        if (ch === "-") continue;
        const varName = String.fromCharCode(65+i);
        lits.push(ch==="1" ? varName : `~${varName}`);
      }
      if (!lits.length) return "1";
      return lits.length===1 ? lits[0] : `(${lits.join(" & ")})`;
    });
    const expr = terms.length ? terms.join(" | ") : "0";
    set({ expr });
  };

  // Generate circuit – for demo, create text description
  const generateCircuit = () => {
    const doc = useEditor.getState().doc;
    // Simple: place AND/OR gates for SOP – for MVP just log
    useEditor.getState().log("ok", `Logic Converter: ${inputs} Eingänge, ${table.filter(v=>v).length} Minterme → ${cfg.expr || "kein Ausdruck"} – Schaltung würde ${table.filter(v=>v).length} ANDs + 1 OR generieren`);
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-mute">Eingänge</span>
        <select className="input w-20 py-0.5" value={inputs} onChange={e=> set({ inputs: Number(e.target.value), table: Array(1<<Number(e.target.value)).fill(0) })}>
          {[2,3,4,5,6,7,8].map(n=> <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-primary ml-auto" onClick={generateExpr}>→ Boolean</button>
        <button className="btn" onClick={generateCircuit}>→ Schaltung</button>
      </div>
      <div className="grid gap-1 overflow-auto rounded-lg p-2" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="grid text-[10px] font-medium text-mute" style={{ gridTemplateColumns: `repeat(${inputs}, 24px) 32px` }}>
          {Array.from({length: inputs}).map((_,i)=> <span key={i} className="text-center">{String.fromCharCode(65+i)}</span>)}
          <span className="text-center">F</span>
        </div>
        {Array.from({length: rows}).map((_,r)=>{
          const bits = r.toString(2).padStart(inputs,"0");
          return (
            <div key={r} className="grid items-center" style={{ gridTemplateColumns: `repeat(${inputs}, 24px) 32px` }}>
              {bits.split("").map((b,i)=> <span key={i} className="text-center mono">{b}</span>)}
              <button className="h-6 rounded text-[11px] font-bold" style={{ background: table[r] ? "var(--ok)" : "var(--panel)", color: table[r] ? "#fff" : "var(--text-mute)", border: "1px solid var(--border)" }} onClick={()=>{
                const nt = [...table];
                nt[r] = nt[r] ? 0 : 1;
                set({ table: nt });
              }}>{table[r]}</button>
            </div>
          );
        })}
      </div>
      <div>
        <div className="text-[10px] text-mute mb-1">Boolescher Ausdruck (SOP)</div>
        <div className="rounded-lg p-2 mono text-[11px]" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>{cfg.expr || "– klicke → Boolean –"}</div>
      </div>
      <div className="text-[10px] text-mute">Wahrheitstabelle ↔ Boolesch ↔ Schaltung (SOP via Quine-McCluskey).</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* distortion analyzer                                                  */
/* ------------------------------------------------------------------ */
function DistortionAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = netResult.nets.map(n=>n.name);
  const cfg = (win.config.distortion as { net: string; fund: number }) ?? { net: nets.find(n=>n!=="0") ?? "", fund: 1000 };
  const ch = engine.channel(cfg.net, 8192);
  const f = cfg.fund;
  // Simple THD calc: estimate via FFT
  let thd = 0;
  let sinad = 0;
  if (ch.v.length > 128) {
    const sp = spectrum(ch.v, 1 / (ch.t[1]-ch.t[0] || 1e-6), "blackman");
    // Find fundamental bin
    const fundIdx = sp.freq.findIndex(freq=> Math.abs(freq - f) < f*0.1);
    if (fundIdx >=0) {
      const fundMag = sp.mag[fundIdx] || 1e-12;
      let harmPower = 0;
      for (let h=2; h<=5; h++) {
        const idx = sp.freq.findIndex(freq=> Math.abs(freq - f*h) < f*0.2);
        if (idx>=0) harmPower += (sp.mag[idx]||0)**2;
      }
      thd = Math.sqrt(harmPower) / fundMag * 100;
      sinad = 20*Math.log10(fundMag / Math.sqrt(harmPower + 1e-12));
    }
  }
  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="flex items-center gap-2 text-[10.5px] text-mute">
        <span>Signal</span>
        <NetSelect value={cfg.net} onChange={v=> update(win.id, { config: { ...win.config, distortion: { ...cfg, net: v } } })} />
        <span>Grund</span>
        <input className="input w-20 py-0.5 mono" value={cfg.fund} onChange={e=> update(win.id, { config: { ...win.config, distortion: { ...cfg, fund: Number(e.target.value) } } })} />
        <span>Hz</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="THD" value={`${thd.toFixed(2)} %`} color="var(--warn)" />
        <Stat label="SINAD" value={`${sinad.toFixed(1)} dB`} color="var(--ok)" />
      </div>
      <div className="text-[10px] text-mute">Multisim Distortion Analyzer – misst THD und SINAD via FFT. Für Lehre: Klirr bei Verstärkern.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* network analyzer – RF S-Parameter (basic)                           */
/* ------------------------------------------------------------------ */
function NetworkAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = netResult.nets.map(n=>n.name);
  const cfg = (win.config.network as { inNet: string; outNet: string }) ?? { inNet: nets.find(n=>n!=="0") ?? "", outNet: nets[1] ?? "" };
  const render = (ctx: CanvasRenderingContext2D, w:number, h:number) => {
    grid(ctx,w,h,10,6);
    // Simple: show gain vs freq from AC analysis if available, else dummy
    const analysis = useEditor.getState().analysis;
    if (analysis.kind === "ac" && (analysis.data as any)?.curves) {
      const curves = (analysis.data as any).curves as Array<{ x:number[]; y:number[] }>;
      const curve = curves[0];
      if (curve) {
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        curve.x.forEach((fx,i)=>{
          const px = (Math.log10(fx) - Math.log10(curve.x[0])) / Math.log10(curve.x[curve.x.length-1]/curve.x[0]) * w;
          const py = h - (curve.y[i] + 40)/80 * h;
          if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        });
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "var(--text-mute)";
      ctx.font = "11px ui-sans-serif";
      ctx.fillText("Führe AC-Analyse aus für S11/S21", 12, 20);
    }
  };
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-2 text-[10.5px] text-mute">
        <span>In</span>
        <NetSelect value={cfg.inNet} onChange={v=> update(win.id, { config: { ...win.config, network: { ...cfg, inNet: v } } })} />
        <span>Out</span>
        <NetSelect value={cfg.outNet} onChange={v=> update(win.id, { config: { ...win.config, network: { ...cfg, outNet: v } } })} />
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
      <div className="text-[10px] text-mute">Network Analyzer – RF, S-Parameter, Gain/Phase. Für MVP zeigt AC-Kurve, voll: S11/S21.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* window chrome + dock                                                */
/* ------------------------------------------------------------------ */
const TITLE_H = 36;
/** Runde 19 (W34): Sicherheitsnetz statt freiem Verlieren – Titelzeile und eine
 *  Greifbreite bleiben immer im Bild (Nutzer-Entscheidung R19). */
function clampWindowPos(x: number, y: number, w: number): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
  const grab = Math.min(220, Math.max(80, w));
  return {
    x: Math.min(Math.max(x, grab - w), Math.max(0, vw - grab)),
    y: Math.min(Math.max(y, 0), Math.max(0, vh - TITLE_H - 4)),
  };
}

/** Flächen, an denen ein Zug das Fenster verschiebt (Rahmen/Hintergrund) –
 *  Bedienelemente und das Gerät selbst bleiben unangetastet. */
function isDragSurface(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !el.closest("[data-no-drag],button,input,select,textarea,a,canvas,svg,[role='button']");
}

/** Runde 19 (W34): Der laufende Fenster-Zug lebt modulweit – ein Zug an einem
 *  gedockten Fenster löst es (Container-Wechsel = React-Mount) und muss danach
 *  weiter am Zeiger kleben. */
let activeDrag: { id: string; x: number; y: number; wx: number; wy: number } | null = null;

function Window({ win }: { win: InstrumentWindow }) {
  const { updateInstrument, closeInstrument, focusInstrument } = useEditor();
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const resizePending = useRef<{ w: number; h: number } | null>(null);
  const winRef = useRef<HTMLDivElement>(null);

  // Runde 17 (W32a): Nach jedem Render die Resize-Größe wiederherstellen –
  // Store-Updates während des Ziehens (z. B. Oszi-Persistenz) dürfen die
  // direkten DOM-Schreibvorgänge nicht zurückschnappen lassen.
  useLayoutEffect(() => {
    const p = resizePending.current;
    if (winRef.current && p) {
      winRef.current.style.width = p.w + "px";
      winRef.current.style.height = p.h + "px";
    }
  });

  useEffect(() => {
    let raf = 0;
    let pendingPos: { x: number; y: number } | null = null;
    let pendingSize: { w: number; h: number } | null = null;
    const live = () => useEditor.getState().instruments.find((i) => i.id === win.id);
    const apply = () => {
      raf = 0;
      const el = winRef.current;
      if (!el) return;
      if (pendingPos && activeDrag) {
        // Transform = GPU, kein Layout-Recalc; die Basis (win.x/win.y) bleibt
        // unangetastet, damit Store-Updates während des Ziehens nichts springen.
        el.style.transform = `translate3d(${pendingPos.x - activeDrag.wx}px, ${pendingPos.y - activeDrag.wy}px, 0)`;
      }
      if (pendingSize) {
        el.style.width = pendingSize.w + "px";
        el.style.height = pendingSize.h + "px";
      }
    };
    const move = (e: PointerEvent) => {
      if (activeDrag && activeDrag.id === win.id) {
        // W34: kontinuierlich klemmen – das Fenster kann nicht mehr aus dem
        // Bild rutschen (Rückholhilfe bleibt als zweites Netz bestehen).
        const w = live()?.w ?? 0;
        pendingPos = clampWindowPos(
          activeDrag.wx + e.clientX - activeDrag.x,
          activeDrag.wy + e.clientY - activeDrag.y,
          w,
        );
        if (!raf) raf = requestAnimationFrame(apply);
      }
      if (resize.current) {
        pendingSize = {
          w: Math.max(300, resize.current.w + e.clientX - resize.current.x),
          h: Math.max(220, resize.current.h + e.clientY - resize.current.y),
        };
        resizePending.current = pendingSize;
        if (!raf) raf = requestAnimationFrame(apply);
      }
    };
    const up = () => {
      const el = winRef.current;
      // Nur das Fenster, das gerade gezogen wird, committet und räumt auf –
      // die Listener aller Fenster hängen am selben Pointer-Event.
      if (activeDrag?.id === win.id) {
        if (pendingPos && el) {
          // Endposition direkt setzen + Transform leeren, DANN committen – so ist
          // die Darstellung auch bei synchronem React-Flush konsistent.
          el.style.left = pendingPos.x + "px";
          el.style.top = pendingPos.y + "px";
          el.style.transform = "";
          updateInstrument(win.id, { x: pendingPos.x, y: pendingPos.y });
        }
        activeDrag = null;
      }
      if (resize.current && pendingSize) {
        updateInstrument(win.id, pendingSize);
      }
      resize.current = null;
      resizePending.current = null;
      pendingPos = null;
      pendingSize = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [updateInstrument, win.id]);

  /** W34: Zug starten – aus dem Titel, aus dem leeren Hintergrund oder aus dem Dock. */
  const beginDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (win.docked) {
      // Ein Zug an der Titelzeile löst das Fenster und zieht es gleich weiter.
      const r = winRef.current?.getBoundingClientRect();
      if (!r) return;
      activeDrag = { id: win.id, x: e.clientX, y: e.clientY, wx: r.left, wy: r.top };
      updateInstrument(win.id, { docked: false, x: r.left, y: r.top });
      return;
    }
    activeDrag = { id: win.id, x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
  };

  const body = () => {
    switch (win.kind) {
      case "scope":
        return <OsziScopeLazy win={win} />;
      case "dmm":
        return <Multimeter win={win} />;
      case "funcgen":
        return <FgScopeLazy win={win} />;
      case "bode":
        return <BodePlotter win={win} />;
      case "logic":
        return <LogicAnalyzer win={win} />;
      case "logicconv":
        return <LogicConverter win={win} />;
      case "watt":
        return <Wattmeter win={win} />;
      case "iv":
        return <IvAnalyzer />;
      case "spectrum":
        return <SpectrumAnalyzer win={win} />;
      case "pattern":
        return <PatternGenerator />;
      case "counter":
        return <FrequencyCounter win={win} />;
      case "distortion":
        return <DistortionAnalyzer win={win} />;
      case "network":
        return <NetworkAnalyzer win={win} />;
      case "inspector":
        return <InspectorBody />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={winRef}
      className={
        win.docked
          ? "rise pointer-events-auto relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl"
          : "rise pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl will-change-transform"
      }
      style={
        win.docked
          ? { background: "var(--panel-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)", height: win.minimized ? 36 : undefined, flex: win.minimized ? "0 0 auto" : undefined, minWidth: win.minimized ? 160 : 300 }
          : { left: win.x, top: win.y, width: win.w, height: win.minimized ? 36 : win.h, zIndex: win.z, background: "var(--panel-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)" }
      }
      onPointerDown={() => focusInstrument(win.id)}
    >
      <div
        className={`flex h-9 shrink-0 items-center gap-2 px-3 ${win.docked ? "" : "cursor-grab"}`}
        style={{ borderBottom: "1px solid var(--border)" }}
        title={win.docked ? "Im Dock – Ziehen löst das Fenster, der Dock-Knopf unten rechts hält es hier" : "Ziehen (auch am Fensterhintergrund) bewegt das Fenster – es bleibt immer greifbar"}
        onPointerDown={(e) => beginDrag(e)}
      >
        <span className="grid h-5 w-5 place-items-center rounded-md" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}>
          {iconFor(win.kind)}
        </span>
        <span className="flex-1 truncate text-[12px] font-medium">{win.title}</span>
        <button
          className="btn px-1 py-0.5"
          title={win.docked ? "Aus dem Dock lösen – wird wieder freies Fenster" : "Ins Dock unten einrasten – Geräte teilen sich den unteren Rand"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateInstrument(win.id, { docked: !win.docked })}
        >
          <PanelBottom size={13} />
        </button>
        <button
          className="btn px-1 py-0.5"
          title="Minimieren"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateInstrument(win.id, { minimized: !win.minimized })}
        >
          <Minus size={13} />
        </button>
        <button
          className="btn px-1 py-0.5"
          title="Schließen"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => closeInstrument(win.id)}
        >
          <X size={13} />
        </button>
      </div>
      {!win.minimized && (
        <div
          className="min-h-0 flex-1"
          onPointerDown={(e) => {
            // W34: „überall greifbar" – leere Flächen bewegen das Fenster,
            // Gerät und Bedienelemente behalten ihre eigene Bedienung.
            if (isDragSurface(e.target)) beginDrag(e);
          }}
        >
          {body()}
        </div>
      )}
      {!win.minimized && !win.docked && (
        <div
          className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize"
          onPointerDown={(e) => {
            resize.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
          }}
          style={{ background: "linear-gradient(135deg, transparent 50%, var(--border-strong) 50%)" }}
        />
      )}
    </div>
  );
}

function iconFor(kind: InstrumentKind, s = 12) {
  switch (kind) {
    case "scope":
      return <Activity size={s} />;
    case "dmm":
      return <Gauge size={s} />;
    case "funcgen":
      return <Waves size={s} />;
    case "bode":
      return <LineChart size={s} />;
    case "logic":
      return <Binary size={s} />;
    case "logicconv":
      return <Binary size={s} />;
    case "watt":
      return <Zap size={s} />;
    case "iv":
      return <SquareActivity size={s} />;
    case "spectrum":
      return <BarChart3 size={s} />;
    case "counter":
      return <Timer size={s} />;
    case "distortion":
      return <Activity size={s} />;
    case "network":
      return <Radio size={s} />;
    case "inspector":
      return <SlidersHorizontal size={s} />;
    default:
      return <Radio size={s} />;
  }
}

/** W10: Der Inspector lebt als Fenster – lazy geladen, damit die Geräte-Bar
 *  den Erststart nicht verteuert. */
const InspectorBody = dynamic(() => import("./Inspector"), { ssr: false });

/** W10: Schmale Geräte-Bar am rechten Rand – ein Klick öffnet/fokussiert das
 *  Gerät als Fenster; offene Geräte sind markiert. Unten: Inspector-Toggle. */
export function DeviceBar() {
  const apple = useIsApple();
  const open = useEditor((s) => s.openInstrument);
  const toggleInspector = useEditor((s) => s.toggleInspector);
  const instruments = useEditor((s) => s.instruments);
  // W29: Das Oszi öffnet nicht mehr als freies Fenster – der Bar-Klick
  // platziert das Oszi-Schaltzeichen auf dem Plan.
  const setPlacing = useEditor((s) => s.setPlacing);
  const placing = useEditor((s) => s.placingPartId);
  const items: Array<[InstrumentKind, string]> = [
    ["scope", "Oszilloskop"],
    ["dmm", "Multimeter"],
    ["funcgen", "Funktionsgenerator"],
    ["counter", "Frequenzzähler"],
    ["bode", "Bode-Plotter"],
    ["logic", "Logikanalysator"],
    ["logicconv", "Logic Converter"],
    ["watt", "Wattmeter"],
    ["iv", "IV-Analyzer"],
    ["spectrum", "Spektrumanalysator"],
    ["pattern", "Mustergenerator"],
    ["distortion", "Distortion Analyzer"],
    ["network", "Network Analyzer"],
  ];
  const isOpen = (k: InstrumentKind) => instruments.some((w) => w.kind === k);
  return (
    <div
      className="pointer-events-auto absolute bottom-0 right-0 top-0 z-20 flex w-11 flex-col items-center gap-0.5 overflow-y-auto py-2"
      style={{ background: "var(--panel-solid)", borderLeft: "1px solid var(--border)", scrollbarWidth: "none" }}
    >
      {items.map(([k, label]) => {
        // W29/W18: Oszi und FG-2500 starten die Symbol-Platzierung statt ein
        // freies Fenster zu öffnen; „aktiv“ = Platzierung läuft oder Fenster offen.
        const partId = k === "scope" ? "oscilloscope" : k === "funcgen" ? "funcgen" : null;
        const active = partId ? placing === partId || isOpen(k) : isOpen(k);
        return (
          <button
            key={k}
            onClick={() => (partId ? setPlacing(placing === partId ? null : partId) : open(k))}
            title={partId ? `${label} – Schaltzeichen auf dem Plan platzieren` : label}
            aria-label={label}
            aria-pressed={active}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors"
            style={
              active
                ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
                : { color: "var(--text-dim)" }
            }
          >
            {iconFor(k, 15)}
          </button>
        );
      })}
      <div className="h-2 shrink-0" />
      <div className="w-6 shrink-0 border-t" style={{ borderColor: "var(--border)" }} />
      <button
        onClick={toggleInspector}
        title={adaptShortcut("Inspector (⌘I)", apple)}
        aria-label="Inspector"
        aria-pressed={isOpen("inspector")}
        className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors"
        style={
          isOpen("inspector")
            ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
            : { color: "var(--text-dim)" }
        }
      >
        {iconFor("inspector", 15)}
      </button>
    </div>
  );
}

/** Runde 19 (W33/W34): Die Gerätefenster liegen in einer eigenen Ebene über der
 *  ganzen App (Portal auf <body>) – sie dürfen Menüband und Leisten überdecken
 *  und werden nicht mehr am Canvas abgeschnitten. Menü-Dropdowns, Dialoge und
 *  Toasts (z-50/z-100) bleiben darüber. */
export function InstrumentLayer() {
  const instruments = useEditor((s) => s.instruments);
  const floating = instruments.filter((w) => !w.docked);
  const docked = instruments.filter((w) => w.docked);

  // Runde 19 (W36): Escape legt eine aufgenommene Messleitung zurück – an einer
  // Stelle für alle Geräte (Oszi-Tastkopf wie FG-Kabel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const st = useEditor.getState();
      if (st.leadArmed) st.setLeadArmed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col">
      <div className="relative min-h-0 flex-1">
        {floating.map((w) => (
          <Window key={w.id} win={w} />
        ))}
      </div>
      {docked.length > 0 && (
        <div
          className="pointer-events-auto absolute inset-x-0 flex items-stretch gap-1 p-1"
          style={{
            bottom: STATUS_BAR_H,
            height: "min(38vh, 360px)",
            minHeight: 140,
            background: "color-mix(in srgb, var(--bg) 82%, transparent)",
            borderTop: "1px solid var(--border-strong)",
            backdropFilter: "blur(10px)",
          }}
          title="Geräte-Dock – Fenster teilen sich den unteren Rand; Ziehen an der Titelzeile löst sie wieder"
        >
          {docked.map((w) => (
            <Window key={w.id} win={w} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
