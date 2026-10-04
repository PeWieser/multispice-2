"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatValue } from "@/lib/library/catalog";
import { spectrum } from "@/lib/sim/fft";
import { InstrumentWindow, engine, useEditor } from "@/state/editor";
import { CH_COLORS, NetSelect, Plot, Stat, cssVar, grid } from "./shared";

export function BodePlotter({ win }: { win: InstrumentWindow }) {
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
        ctx.fillStyle = cssVar("--ink-3", "#64708c");
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
      ctx.fillStyle = cssVar("--ink-3", "#64708c");
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
      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
        <span>Ausgang</span>
        <NetSelect value={cfg.out} onChange={(v) => set({ out: v })} />
        <span>f</span>
        <input className="input w-20 py-0.5 text-2xs mono" value={cfg.fmin} onChange={(e) => set({ fmin: Number(e.target.value) })} />
        <span>…</span>
        <input className="input w-24 py-0.5 text-2xs mono" value={cfg.fmax} onChange={(e) => set({ fmax: Number(e.target.value) })} />
        <button
          className="btn btn-primary ml-auto"
          onClick={() => runAnalysis("ac", { outputs: [cfg.out], sweep: { start: cfg.fmin, stop: cfg.fmax, points: 24, type: "dec" } })}
          disabled={analysis.running}
        >
          {analysis.running ? "läuft …" : "Sweep starten"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border border-hairline">
        <Plot render={render} />
      </div>
      <div className="flex gap-3 text-2xs text-ink-3">
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

export function LogicAnalyzer({ win }: { win: InstrumentWindow }) {
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
        ctx.strokeStyle = cssVar("--grid-minor", "rgba(255,255,255,.06)");
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
        ctx.fillStyle = cssVar("--ink-3", "#64708c");
        ctx.font = "9.5px ui-monospace, monospace";
        ctx.fillText(net, 4, i * rowH + 11);
      });
      // bus value
      let word = 0;
      cfg.channels.forEach((net, i) => {
        const v = engine.lastState.nets[net] ?? 0;
        if (v > cfg.threshold) word |= 1 << i;
      });
      ctx.fillStyle = cssVar("--teal", "#22d3ee");
      ctx.font = "600 12px ui-monospace, monospace";
      const text = cfg.radix === "hex" ? `0x${word.toString(16).toUpperCase().padStart(2, "0")}` : `0b${word.toString(2).padStart(cfg.channels.length, "0")}`;
      ctx.fillText(text, w - 90, 14);
    },
    [cfg],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-1.5 text-2xs text-ink-3">
        <span>Kanäle</span>
        <select
          className="input w-auto py-0.5 text-2xs"
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
        <input className="input w-16 py-0.5 text-2xs mono" value={cfg.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />
        <select className="input w-auto py-0.5 text-2xs" value={cfg.radix} onChange={(e) => set({ radix: e.target.value as "hex" | "bin" })}>
          <option value="hex">HEX</option>
          <option value="bin">BIN</option>
        </select>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border border-hairline">
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* wattmeter                                                           */
/* ------------------------------------------------------------------ */

export function IvAnalyzer() {
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
        ctx.fillStyle = cssVar("--ink-3", "#64708c");
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
      ctx.fillStyle = cssVar("--ink-3", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${formatValue(maxY, "A")}`, 4, 11);
      ctx.fillText(`${formatValue(minX, "V")}`, 4, h - 4);
      ctx.fillText(`${formatValue(maxX, "V")}`, w - 50, h - 4);
    },
    [data],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
        <span>Bauteil</span>
        <select className="input w-auto py-0.5 text-2xs" value={device} onChange={(e) => setDevice(e.target.value)}>
          {doc.instances.map((i) => (
            <option key={i.id} value={i.label}>
              {i.label}
            </option>
          ))}
        </select>
        <span>Sweep-Quelle</span>
        <select className="input w-auto py-0.5 text-2xs" value={source} onChange={(e) => setSource(e.target.value)}>
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
      <div className="flex-1 overflow-hidden rounded-lg border border-hairline">
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* spectrum analyzer                                                   */
/* ------------------------------------------------------------------ */

export function SpectrumAnalyzer({ win }: { win: InstrumentWindow }) {
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
      ctx.fillStyle = cssVar("--ink-3", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`0 … ${formatValue(sp.freq[n - 1] ?? 0, "Hz")}`, 6, h - 5);
    },
    [cfg.net],
  );
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-2 text-2xs text-ink-3">
        <span>Signal</span>
        <NetSelect value={cfg.net} onChange={(v) => update(win.id, { config: { ...win.config, spec: { net: v } } })} />
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border border-hairline">
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* pattern generator                                                   */
/* ------------------------------------------------------------------ */

export function DistortionAnalyzer({ win }: { win: InstrumentWindow }) {
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
      <div className="flex items-center gap-2 text-2xs text-ink-3">
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
      <div className="text-2xs text-ink-3">Klirrfaktor (THD) und Signal-Rausch-Verhältnis (SINAD) über FFT-Analyse.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* network analyzer – RF S-Parameter (basic)                           */
/* ------------------------------------------------------------------ */

export function NetworkAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const runAnalysis = useEditor((s) => s.runAnalysis);
  const analysis = useEditor((s) => s.analysis);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.network as { inNet: string; outNet: string; z0: number; fmin: number; fmax: number }) ?? {
    inNet: nets.find((n) => n !== "0") ?? "",
    outNet: nets[1] ?? "",
    z0: 50,
    fmin: 10,
    fmax: 1e6,
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, network: { ...cfg, ...p } } });
  const data =
    analysis.kind === "sparams"
      ? (analysis.data as { freq: number[]; s11db: number[]; s21db: number[]; z0: number } | undefined)
      : undefined;

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 12, 8);
      if (!data || !data.freq.length) {
        ctx.fillStyle = cssVar("--ink-3", "#64708c");
        ctx.font = "11px ui-sans-serif";
        ctx.fillText("Sweep starten …", 12, 20);
        return;
      }
      const f0 = Math.log10(data.freq[0]);
      const f1 = Math.log10(data.freq[data.freq.length - 1]);
      const all = [...data.s11db, ...data.s21db];
      const maxDb = Math.max(...all, 6);
      const minDb = Math.min(...all, -60);
      const xOf = (f: number) => ((Math.log10(f) - f0) / (f1 - f0)) * w;
      const yOf = (m: number) => h - ((m - minDb) / (maxDb - minDb)) * h;
      const trace = (ys: number[], style: string, dash: number[]) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = 1.8;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ys.forEach((m, i) => {
          const x = xOf(data.freq[i]);
          const y = yOf(m);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      trace(data.s11db, cssVar("--ch1", "#38bdf8"), []);
      trace(data.s21db, cssVar("--ch2", "#f472b6"), [4, 3]);
      ctx.fillStyle = cssVar("--ink-3", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${maxDb.toFixed(0)} dB`, 4, 11);
      ctx.fillText(`${minDb.toFixed(0)} dB`, 4, h - 4);
    },
    [data],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-3">
        <span>Port 1</span>
        <NetSelect value={cfg.inNet} onChange={(v) => set({ inNet: v })} />
        <span>Port 2</span>
        <NetSelect value={cfg.outNet} onChange={(v) => set({ outNet: v })} />
        <span>Z₀</span>
        <input className="input w-16 py-0.5 text-2xs mono" value={cfg.z0} onChange={(e) => set({ z0: Number(e.target.value) })} />
        <span>Ω</span>
        <span>f</span>
        <input className="input w-20 py-0.5 text-2xs mono" value={cfg.fmin} onChange={(e) => set({ fmin: Number(e.target.value) })} />
        <span>…</span>
        <input className="input w-24 py-0.5 text-2xs mono" value={cfg.fmax} onChange={(e) => set({ fmax: Number(e.target.value) })} />
        <button
          className="btn btn-primary ml-auto"
          onClick={() =>
            runAnalysis("sparams", {
              inNode: cfg.inNet,
              outNode: cfg.outNet,
              outputs: [cfg.outNet],
              z0: cfg.z0,
              sweep: { start: cfg.fmin, stop: cfg.fmax, points: 24, type: "dec" },
            })
          }
          disabled={analysis.running}
        >
          {analysis.running ? "läuft …" : "Sweep starten"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border border-hairline">
        <Plot render={render} />
      </div>
      <div className="flex gap-3 text-2xs text-ink-3">
        <span style={{ color: "var(--ch1)" }}>— S11 (dB)</span>
        <span style={{ color: "var(--ch2)" }}>-- S21 (dB)</span>
        {data && <span className="ml-auto mono">Z₀ = {data.z0} Ω · {data.freq.length} Punkte</span>}
      </div>
    </div>
  );
}
