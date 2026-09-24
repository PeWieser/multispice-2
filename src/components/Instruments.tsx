"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, BarChart3, Binary, Gauge, LineChart, Minus, Radio, SquareActivity, Waves, X, Zap,
} from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { spectrum } from "@/lib/sim/fft";
import { estimateFrequency, mean, peakToPeak, rms } from "@/lib/sim/realtime";
import { InstrumentKind, InstrumentWindow, engine, useEditor } from "@/state/editor";

const CH_COLORS = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"];

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
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name));
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
/* oscilloscope                                                        */
/* ------------------------------------------------------------------ */
interface ScopeConfig {
  channels: string[];
  timebase: number;
  volts: number[];
  offsets: number[];
  trigger: { source: number; level: number; edge: "rising" | "falling"; mode: "auto" | "normal" };
  mode: "yt" | "xy" | "fft" | "math";
  math: "a+b" | "a-b" | "a*b";
}

function Oscilloscope({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name));
  const cfg = (win.config.scope as ScopeConfig) ?? {
    channels: [nets.find((n) => n !== "0") ?? "", "", "", ""],
    timebase: 0.002,
    volts: [2, 2, 2, 2],
    offsets: [0, 0, 0, 0],
    trigger: { source: 0, level: 0.5, edge: "rising", mode: "auto" },
    mode: "yt",
    math: "a-b",
  };
  const set = (patch: Partial<ScopeConfig>) => update(win.id, { config: { ...win.config, scope: { ...cfg, ...patch } } });

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h);
      const span = cfg.timebase * 10;
      const samples = Math.max(64, Math.round(span * 40000));
      const chans = cfg.channels.map((net) => (net ? engine.channel(net, samples) : { t: [], v: [] }));

      if (cfg.mode === "fft") {
        const ch = chans[0];
        if (ch.v.length > 32) {
          const dt = (ch.t[ch.t.length - 1] - ch.t[0]) / Math.max(ch.t.length - 1, 1);
          const sp = spectrum(ch.v, 1 / Math.max(dt, 1e-12), "hann");
          const maxF = Math.min(sp.freq[sp.freq.length - 1] ?? 1, 1 / (cfg.timebase * 2) * 50);
          ctx.strokeStyle = cssVar("--ch1", "#38bdf8");
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          sp.freq.forEach((f, i) => {
            if (f > maxF) return;
            const x = (f / maxF) * w;
            const y = h - ((sp.magDb[i] + 120) / 120) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.fillStyle = cssVar("--text-mute", "#64708c");
          ctx.font = "10px ui-monospace, monospace";
          ctx.fillText(`0 Hz`, 4, h - 4);
          ctx.fillText(`${formatValue(maxF, "Hz")}`, w - 60, h - 4);
          ctx.fillText(`0 dB`, 4, 12);
          ctx.fillText(`-120 dB`, 4, h - 16);
        }
        return;
      }

      if (cfg.mode === "xy") {
        const a = chans[0];
        const b = chans[1];
        const n = Math.min(a.v.length, b.v.length);
        ctx.strokeStyle = cssVar("--ch3", "#4ade80");
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = w / 2 + (a.v[i] / cfg.volts[0]) * (w / 10);
          const y = h / 2 - (b.v[i] / cfg.volts[1]) * (h / 8);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      // trigger alignment
      let startIdx = 0;
      const trig = chans[cfg.trigger.source];
      if (trig && trig.v.length > 4 && cfg.trigger.mode !== "auto") {
        for (let i = trig.v.length - 2; i > 1; i--) {
          const rising = trig.v[i - 1] < cfg.trigger.level && trig.v[i] >= cfg.trigger.level;
          const falling = trig.v[i - 1] > cfg.trigger.level && trig.v[i] <= cfg.trigger.level;
          if ((cfg.trigger.edge === "rising" && rising) || (cfg.trigger.edge === "falling" && falling)) {
            startIdx = Math.max(0, i - Math.floor(trig.v.length / 2));
            break;
          }
        }
      }

      chans.forEach((ch, idx) => {
        if (!ch.v.length || !cfg.channels[idx]) return;
        ctx.strokeStyle = cssVar(`--ch${idx + 1}`, CH_COLORS[idx]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const t0 = ch.t[startIdx] ?? ch.t[0] ?? 0;
        for (let i = startIdx; i < ch.v.length; i++) {
          const x = ((ch.t[i] - t0) / span) * w;
          if (x > w) break;
          const y = h / 2 - ((ch.v[i] + cfg.offsets[idx]) / cfg.volts[idx]) * (h / 8);
          if (i === startIdx) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      if (cfg.mode === "math" && chans[0].v.length && chans[1].v.length) {
        ctx.strokeStyle = cssVar("--accent-3", "#a78bfa");
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        const n = Math.min(chans[0].v.length, chans[1].v.length);
        const t0 = chans[0].t[0] ?? 0;
        for (let i = 0; i < n; i++) {
          const val = cfg.math === "a+b" ? chans[0].v[i] + chans[1].v[i] : cfg.math === "a-b" ? chans[0].v[i] - chans[1].v[i] : chans[0].v[i] * chans[1].v[i];
          const x = ((chans[0].t[i] - t0) / span) * w;
          const y = h / 2 - (val / cfg.volts[0]) * (h / 8);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // trigger level marker
      ctx.strokeStyle = cssVar("--warn", "#fbbf24");
      ctx.setLineDash([3, 3]);
      const ty = h / 2 - (cfg.trigger.level / cfg.volts[cfg.trigger.source]) * (h / 8);
      ctx.beginPath();
      ctx.moveTo(0, ty);
      ctx.lineTo(w, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${formatValue(cfg.timebase, "s")}/DIV`, 6, h - 6);
    },
    [cfg],
  );

  const measure = (idx: number) => {
    const net = cfg.channels[idx];
    if (!net) return null;
    const ch = engine.channel(net, Math.max(64, Math.round(cfg.timebase * 10 * 40000)));
    if (!ch.v.length) return null;
    return { vpp: peakToPeak(ch.v), vrms: rms(ch.v), vavg: mean(ch.v), f: estimateFrequency(ch.t, ch.v) };
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5">
        {(["yt", "xy", "fft", "math"] as const).map((m) => (
          <button key={m} className="tab" data-active={cfg.mode === m} onClick={() => set({ mode: m })}>
            {m.toUpperCase()}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex items-center gap-1 text-[10.5px] text-mute">
          Zeitbasis
          <select className="input w-auto py-0.5 text-[11px]" value={cfg.timebase} onChange={(e) => set({ timebase: Number(e.target.value) })}>
            {[1e-6, 5e-6, 2e-5, 1e-4, 5e-4, 1e-3, 5e-3, 2e-2, 0.1, 0.5].map((t) => (
              <option key={t} value={t}>
                {formatValue(t, "s")}/div
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mx-2 flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
      <div className="grid grid-cols-4 gap-1.5 p-2">
        {[0, 1, 2, 3].map((i) => {
          const m = measure(i);
          return (
            <div key={i} className="rounded-lg p-1.5" style={{ background: "var(--panel-2)", borderTop: `2px solid ${CH_COLORS[i]}` }}>
              <div className="mb-1 flex items-center gap-1">
                <span className="mono text-[9.5px]" style={{ color: CH_COLORS[i] }}>
                  CH{i + 1}
                </span>
                <NetSelect
                  value={cfg.channels[i]}
                  allowNone
                  onChange={(v) => {
                    const ch = [...cfg.channels];
                    ch[i] = v;
                    set({ channels: ch });
                  }}
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-mute">V/div</span>
                <select
                  className="input py-0 text-[10px]"
                  value={cfg.volts[i]}
                  onChange={(e) => {
                    const v = [...cfg.volts];
                    v[i] = Number(e.target.value);
                    set({ volts: v });
                  }}
                >
                  {[0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 20].map((v) => (
                    <option key={v} value={v}>
                      {v} V
                    </option>
                  ))}
                </select>
              </div>
              {m && (
                <div className="mono mt-1 text-[9.5px] leading-tight text-mute">
                  <div>Vpp {formatValue(m.vpp, "V")}</div>
                  <div>Vrms {formatValue(m.vrms, "V")}</div>
                  <div>f {formatValue(m.f, "Hz")}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-2 pb-2 text-[10.5px] text-mute">
        <span>Trigger</span>
        <select className="input w-auto py-0.5 text-[11px]" value={cfg.trigger.source} onChange={(e) => set({ trigger: { ...cfg.trigger, source: Number(e.target.value) } })}>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              CH{i + 1}
            </option>
          ))}
        </select>
        <select className="input w-auto py-0.5 text-[11px]" value={cfg.trigger.edge} onChange={(e) => set({ trigger: { ...cfg.trigger, edge: e.target.value as "rising" | "falling" } })}>
          <option value="rising">↑ steigend</option>
          <option value="falling">↓ fallend</option>
        </select>
        <select className="input w-auto py-0.5 text-[11px]" value={cfg.trigger.mode} onChange={(e) => set({ trigger: { ...cfg.trigger, mode: e.target.value as "auto" | "normal" } })}>
          <option value="auto">Auto</option>
          <option value="normal">Normal</option>
        </select>
        <input
          type="range"
          className="flex-1"
          min={-10}
          max={10}
          step={0.1}
          value={cfg.trigger.level}
          onChange={(e) => set({ trigger: { ...cfg.trigger, level: Number(e.target.value) } })}
        />
        <span className="mono w-14 text-right">{cfg.trigger.level.toFixed(1)} V</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* digital multimeter                                                  */
/* ------------------------------------------------------------------ */
function Multimeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name));
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
      <div className="rounded-xl p-3" style={{ background: "linear-gradient(180deg, rgba(20,220,180,.08), transparent)", border: "1px solid var(--border)" }}>
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
/* function generator (controls the XFG / AC source instances)         */
/* ------------------------------------------------------------------ */
function FunctionGenerator() {
  const doc = useEditor((s) => s.doc);
  const setParam = useEditor((s) => s.setParam);
  const sources = doc.instances.filter((i) => i.partId === "funcgen" || i.partId === "vac" || i.partId === "vpulse");
  const [sel, setSel] = useState(sources[0]?.id ?? "");
  const inst = sources.find((s) => s.id === sel) ?? sources[0];
  if (!inst) {
    return <div className="p-4 text-[12px] text-mute">Keine Signalquelle im Schaltplan. Platziere »Funktionsgenerator (XFG)« oder »AC-Quelle«.</div>;
  }
  const p = inst.params;
  const num = (k: string, d: number) => Number(p[k] ?? d);
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2.5">
      <select className="input" value={inst.id} onChange={(e) => setSel(e.target.value)}>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} — {s.partId}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-4 gap-1">
        {[
          ["sine", "∿"],
          ["square", "⎍"],
          ["triangle", "△"],
          ["sawtooth", "◺"],
          ["pulse", "⊓"],
          ["am", "AM"],
          ["fm", "FM"],
          ["noise", "≋"],
        ].map(([v, label]) => (
          <button key={v} className="tab text-center text-[13px]" data-active={String(p.wave ?? "sine") === v} onClick={() => setParam(inst.id, "wave", v)}>
            {label}
          </button>
        ))}
      </div>
      <Knob label="Frequenz" unit="Hz" value={num("freq", 1000)} min={0.1} max={1e7} log onChange={(v) => setParam(inst.id, "freq", v)} />
      <Knob label="Amplitude" unit="V" value={num("amplitude", 5)} min={0} max={30} onChange={(v) => setParam(inst.id, "amplitude", v)} />
      <Knob label="DC-Offset" unit="V" value={num("offset", 0)} min={-15} max={15} onChange={(v) => setParam(inst.id, "offset", v)} />
      <Knob label="Tastgrad" unit="%" value={num("duty", 50)} min={1} max={99} onChange={(v) => setParam(inst.id, "duty", v)} />
      <Knob label="Phase" unit="°" value={num("phase", 0)} min={-180} max={180} onChange={(v) => setParam(inst.id, "phase", v)} />
      {(p.wave === "am" || p.wave === "fm") && (
        <>
          <Knob label="Mod.-Index" unit="" value={num("modIndex", 0.5)} min={0} max={10} onChange={(v) => setParam(inst.id, "modIndex", v)} />
          <Knob label="Mod.-Frequenz" unit="Hz" value={num("modFreq", 100)} min={0.1} max={1e5} log onChange={(v) => setParam(inst.id, "modFreq", v)} />
        </>
      )}
    </div>
  );
}

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
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name));
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
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name).filter((n) => n !== "0"));
  const cfg = (win.config.logic as { channels: string[]; span: number; threshold: number; radix: "hex" | "bin" }) ?? {
    channels: nets.slice(0, 8),
    span: 0.05,
    threshold: 2.5,
    radix: "hex",
  };
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
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name));
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
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name));
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
/* window chrome + dock                                                */
/* ------------------------------------------------------------------ */
function Window({ win }: { win: InstrumentWindow }) {
  const { updateInstrument, closeInstrument, focusInstrument } = useEditor();
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current) {
        updateInstrument(win.id, {
          x: Math.max(0, drag.current.wx + e.clientX - drag.current.x),
          y: Math.max(48, drag.current.wy + e.clientY - drag.current.y),
        });
      }
      if (resize.current) {
        updateInstrument(win.id, {
          w: Math.max(300, resize.current.w + e.clientX - resize.current.x),
          h: Math.max(220, resize.current.h + e.clientY - resize.current.y),
        });
      }
    };
    const up = () => {
      drag.current = null;
      resize.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [updateInstrument, win.id]);

  const body = () => {
    switch (win.kind) {
      case "scope":
        return <Oscilloscope win={win} />;
      case "dmm":
        return <Multimeter win={win} />;
      case "funcgen":
        return <FunctionGenerator />;
      case "bode":
        return <BodePlotter win={win} />;
      case "logic":
        return <LogicAnalyzer win={win} />;
      case "watt":
        return <Wattmeter win={win} />;
      case "iv":
        return <IvAnalyzer />;
      case "spectrum":
        return <SpectrumAnalyzer win={win} />;
      case "pattern":
        return <PatternGenerator />;
      default:
        return null;
    }
  };

  return (
    <div
      className="glass rise pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl"
      style={{ left: win.x, top: win.y, width: win.w, height: win.minimized ? 38 : win.h, zIndex: win.z, boxShadow: "var(--shadow)" }}
      onPointerDown={() => focusInstrument(win.id)}
    >
      <div
        className="flex h-[38px] shrink-0 cursor-grab items-center gap-2 px-3"
        style={{ borderBottom: "1px solid var(--border)" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
        }}
      >
        <span className="grid h-5 w-5 place-items-center rounded-md" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}>
          {iconFor(win.kind)}
        </span>
        <span className="flex-1 text-[12px] font-medium">{win.title}</span>
        <button className="btn px-1 py-0.5" onClick={() => updateInstrument(win.id, { minimized: !win.minimized })}>
          <Minus size={13} />
        </button>
        <button className="btn px-1 py-0.5" onClick={() => closeInstrument(win.id)}>
          <X size={13} />
        </button>
      </div>
      {!win.minimized && <div className="min-h-0 flex-1">{body()}</div>}
      {!win.minimized && (
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

function iconFor(kind: InstrumentKind) {
  const s = 12;
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
    case "watt":
      return <Zap size={s} />;
    case "iv":
      return <SquareActivity size={s} />;
    case "spectrum":
      return <BarChart3 size={s} />;
    default:
      return <Radio size={s} />;
  }
}

export function InstrumentLayer() {
  const instruments = useEditor((s) => s.instruments);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {instruments.map((w) => (
        <Window key={w.id} win={w} />
      ))}
    </div>
  );
}

export function InstrumentDock() {
  const open = useEditor((s) => s.openInstrument);
  const items: Array<[InstrumentKind, string]> = [
    ["scope", "Oszilloskop"],
    ["dmm", "Multimeter"],
    ["funcgen", "Funktionsgenerator"],
    ["bode", "Bode-Plotter"],
    ["logic", "Logikanalysator"],
    ["watt", "Wattmeter"],
    ["iv", "IV-Analyzer"],
    ["spectrum", "Spektrum"],
    ["pattern", "Mustergenerator"],
  ];
  return (
    <div className="panel flex w-[52px] shrink-0 flex-col items-center gap-1 py-2" style={{ borderWidth: "0 0 0 1px" }}>
      <div className="mb-1 text-[8.5px] uppercase tracking-wider text-mute">Geräte</div>
      {items.map(([kind, title]) => (
        <button key={kind} className="btn h-9 w-9 justify-center p-0" title={title} onClick={() => open(kind)}>
          {iconFor(kind)}
        </button>
      ))}
    </div>
  );
}
