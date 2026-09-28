"use client";
import { useMemo, useRef, useState } from "react";
import { useCB, currentRunSet } from "@/lib/cb/store";
import type { Component, SavedRun } from "@/lib/cb/types";
import { measure, phaseDiff, runAC, runDC, fft, resample, SimError } from "@/lib/cb/analyses";
import { waveform } from "@/lib/cb/engine";
import { fmt, parseValue } from "@/lib/cb/units";
import { Plot, exportPNG, exportSVG, download, valueAt, type PlotHandle } from "./Plot";
import { probeSeries } from "@/lib/cb/probes";
import { LIBMAP } from "@/lib/cb/library";

const CH_COL = ["#d4a017", "#1f9bd1", "#d1242f", "#1a7f37"];

function useInst<T extends Record<string, unknown>>(id: string, defaults: T): [T, (u: Partial<T>) => void] {
  const s = useCB();
  const st = { ...defaults, ...(s.project.instrumentState[id] ?? {}) } as T;
  const upd = (u: Partial<T>) => {
    const p = useCB.getState().project;
    useCB.getState().set({ project: { ...p, instrumentState: { ...p.instrumentState, [id]: { ...st, ...(p.instrumentState[id] ?? {}), ...u } } }, dirty: true });
  };
  return [st, upd];
}
function useTranRun(): SavedRun | undefined {
  const s = useCB();
  const r = currentRunSet(s);
  return r.find((x) => x.analysis === "tran") ?? s.project.runs.slice().reverse().find((x) => x.analysis === "tran");
}
function Num({ label, value, onChange, unit, w = 70 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; w?: number }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <label className="flex items-center justify-between gap-1 text-[11px]">
      <span style={{ color: "var(--cb-muted)" }}>{label}</span>
      <input className="cb-input font-mono" style={{ width: w }} value={txt ?? fmt(value, unit ?? "", 4)} onFocus={() => setTxt(String(value))} onChange={(e) => setTxt(e.target.value)} onBlur={() => { if (txt != null) { const v = parseValue(txt); if (!isNaN(v)) onChange(v); } setTxt(null); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}
const Empty = ({ msg }: { msg: string }) => <div className="p-3 text-[12px]" style={{ color: "var(--cb-muted)" }}>{msg}</div>;

// ======================= Oscilloscope =======================
export function Scope({ c }: { c: Component }) {
  const s = useCB();
  const run = useTranRun();
  const [st, upd] = useInst(c.id, { tdiv: 5e-4, hpos: 0, vdiv: [1, 1, 1, 1], vpos: [0, 0, 0, 0], coupling: ["DC", "DC", "DC", "DC"], en: [true, true, false, false], src: ["pin", "pin", "pin", "pin"], trigSrc: 0, trigLevel: 0, trigEdge: "rise", trigMode: "auto", running: true, sel: 0, c1: 0.2, c2: 0.6 });
  const frozen = useRef<{ t0: number; data: (number[] | null)[]; x: number[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const names = ["A", "B", "C", "D"];
  const chData = (i: number): number[] | null => {
    if (!run) return null;
    const src = (st.src as string[])[i];
    if (src !== "pin") { const pr = s.project.probes.find((q) => q.name === src); if (pr) return probeSeries(pr, s.project, s.cn, run); return run.signals[src] ?? null; }
    const net = s.cn.pinNet[c.id + ":" + names[i]];
    if (!net) return null;
    return net === "0" ? run.x.map(() => 0) : run.signals[`V(${net})`] ?? null;
  };
  const W = 10 * st.tdiv;
  let frame: { t0: number; data: (number[] | null)[]; x: number[] } | null = null;
  let trigState = "Auto";
  if (run && st.running) {
    const data = [0, 1, 2, 3].map(chData);
    const tr = data[st.trigSrc];
    const tEnd = run.x[run.x.length - 1];
    let t0: number | null = null;
    if (tr) {
      const L = st.trigLevel;
      const edges: number[] = [];
      for (let i = 1; i < tr.length; i++) {
        const up = tr[i - 1] < L && tr[i] >= L, dn = tr[i - 1] > L && tr[i] <= L;
        if ((st.trigEdge === "rise" && up) || (st.trigEdge === "fall" && dn)) edges.push(run.x[i - 1] + ((L - tr[i - 1]) / (tr[i] - tr[i - 1])) * (run.x[i] - run.x[i - 1]));
      }
      const ok = edges.filter((e) => e + st.hpos + W <= tEnd + 1e-12 && e + st.hpos >= run.x[0]);
      if (ok.length) t0 = st.trigMode === "single" ? ok[0] : ok[ok.length - 1];
    }
    if (t0 != null) { frame = { t0: t0 + st.hpos, data, x: run.x }; trigState = "Trig'd"; }
    else if (st.trigMode === "auto") { frame = { t0: Math.max(run.x[0], Math.min(st.hpos, tEnd - W)), data, x: run.x }; trigState = "Auto (untriggered)"; }
    else { frame = frozen.current; trigState = "Waiting for trigger"; }
    if (frame && st.trigMode === "single" && t0 != null && run.status !== "running") { frozen.current = frame; }
  } else frame = frozen.current;
  if (st.running && frame) frozen.current = frame;

  const Wd = 500, Hd = 320;
  const dx = Wd / 10, dy = Hd / 8;
  const visible = (i: number) => {
    if (!frame || !frame.data[i]) return null;
    const x = frame.x, y = frame.data[i]!;
    const xs: number[] = [], ys: number[] = [];
    for (let k = 0; k < x.length; k++) if (x[k] >= frame.t0 - W * 0.01 && x[k] <= frame.t0 + W * 1.01) { xs.push(x[k]); ys.push(y[k]); }
    let yy = ys;
    const cp = (st.coupling as string[])[i];
    if (cp === "AC") { const m = measure(xs, ys).avg; yy = ys.map((v) => v - m); }
    if (cp === "GND") yy = ys.map(() => 0);
    return { xs, ys: yy };
  };
  const chans = [0, 1, 2, 3].map(visible);
  const sel = chans[st.sel as number];
  const m = sel && sel.xs.length > 2 ? measure(sel.xs, sel.ys) : null;
  const ph = chans[0] && chans[1] ? phaseDiff(chans[0].xs, chans[0].ys, valueResample(chans[0].xs, chans[1].xs, chans[1].ys)) : NaN;
  const cT = (f: number) => (frame ? frame.t0 + f * W : 0);
  const exportCsv = () => {
    if (!frame) return;
    const base = chans.find((q) => q)!; if (!base) return;
    const rows = ["t," + names.filter((_, i) => chans[i]).join(",")];
    base.xs.forEach((t, k) => rows.push([t, ...chans.filter(Boolean).map((q) => valueAt(q!.xs, q!.ys, t))].join(",")));
    download(`${c.ref}.csv`, rows.join("\n"), "text/csv");
  };
  const dragC = (which: "c1" | "c2") => (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = svgRef.current!.getBoundingClientRect();
    const mv = (ev: MouseEvent) => upd({ [which]: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) } as never);
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const setArr = (k: "vdiv" | "vpos" | "coupling" | "en" | "src", i: number, v: unknown) => { const a = [...(st[k] as unknown[])]; a[i] = v; upd({ [k]: a } as never); };

  return (
    <div className="flex h-full gap-2 p-2 text-[11px]">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <svg ref={svgRef} viewBox={`0 0 ${Wd} ${Hd}`} className="w-full rounded" style={{ background: "#0d1117", aspectRatio: `${Wd}/${Hd}` }} xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 11 }, (_, i) => <line key={"v" + i} x1={i * dx} x2={i * dx} y1={0} y2={Hd} stroke={i === 5 ? "#3d4450" : "#232a33"} />)}
          {Array.from({ length: 9 }, (_, i) => <line key={"h" + i} y1={i * dy} y2={i * dy} x1={0} x2={Wd} stroke={i === 4 ? "#3d4450" : "#232a33"} />)}
          {frame && chans.map((ch, i) => {
            if (!ch || !(st.en as boolean[])[i]) return null;
            const vd = (st.vdiv as number[])[i], vp = (st.vpos as number[])[i];
            const step = Math.max(1, Math.floor(ch.xs.length / 1200));
            let d = "";
            for (let k = 0; k < ch.xs.length; k += step) { const X = ((ch.xs[k] - frame.t0) / W) * Wd, Y = Hd / 2 - ((ch.ys[k] / vd) + vp) * dy; d += (d ? "L" : "M") + X.toFixed(1) + "," + Math.max(-50, Math.min(Hd + 50, Y)).toFixed(1); }
            return <path key={i} d={d} fill="none" stroke={CH_COL[i]} strokeWidth={1.4} />;
          })}
          {(() => { const vd = (st.vdiv as number[])[st.trigSrc as number], vp = (st.vpos as number[])[st.trigSrc as number]; const Y = Hd / 2 - (st.trigLevel / vd + vp) * dy; return <path d={`M${Wd},${Y} l-8,-4 l0,8 z`} fill={CH_COL[st.trigSrc as number]} />; })()}
          {(["c1", "c2"] as const).map((k, i) => <g key={k} onMouseDown={dragC(k)} style={{ cursor: "ew-resize" }}><line x1={(st[k] as number) * Wd} x2={(st[k] as number) * Wd} y1={0} y2={Hd} stroke={i ? "#9a6700" : "#8250df"} strokeDasharray="4 3" strokeWidth={1.2} /><rect x={(st[k] as number) * Wd - 5} y={0} width={10} height={Hd} fill="transparent" /><text x={(st[k] as number) * Wd + 3} y={12} fontSize={10} fill={i ? "#d29922" : "#a371f7"}>{i + 1}</text></g>)}
          <text x={6} y={Hd - 6} fontSize={10} fill="#8b949e" fontFamily="monospace">{fmt(st.tdiv, "s", 3)}/div  {trigState}  {run ? "" : "no data"}</text>
        </svg>
        <div className="grid grid-cols-4 gap-x-2 font-mono text-[10.5px]">
          {chans.map((ch, i) => {
            if (!ch || !(st.en as boolean[])[i]) return null;
            const v1 = valueAt(ch.xs, ch.ys, cT(st.c1 as number)), v2 = valueAt(ch.xs, ch.ys, cT(st.c2 as number));
            return <div key={i} style={{ color: CH_COL[i] }}>{names[i]}: C1 {fmt(v1, "V", 4)} · C2 {fmt(v2, "V", 4)} · Δ {fmt(v2 - v1, "V", 4)}</div>;
          })}
        </div>
        <div className="font-mono text-[10.5px]" style={{ color: "var(--cb-muted)" }}>T1 {fmt(cT(st.c1 as number), "s", 4)} · T2 {fmt(cT(st.c2 as number), "s", 4)} · ΔT {fmt((((st.c2 as number) - (st.c1 as number)) * W), "s", 4)} · 1/ΔT {fmt(1 / (((st.c2 as number) - (st.c1 as number)) * W), "Hz", 4)}</div>
        {m && (
          <div className="grid grid-cols-5 gap-x-2 rounded border p-1 font-mono text-[10.5px]" style={{ borderColor: "var(--cb-border)" }}>
            <span>Ch {names[st.sel as number]}</span><span>Freq {fmt(m.freq, "Hz", 4)}</span><span>Per {fmt(m.period, "s", 4)}</span><span>RMS {fmt(m.rms, "V", 4)}</span><span>Avg {fmt(m.avg, "V", 4)}</span>
            <span>P-P {fmt(m.pp, "V", 4)}</span><span>Duty {isFinite(m.duty) ? m.duty.toFixed(1) + " %" : "—"}</span><span>Rise {fmt(m.rise, "s", 3)}</span><span>Fall {fmt(m.fall, "s", 3)}</span><span>φ(B−A) {isFinite(ph) ? ph.toFixed(1) + "°" : "—"}</span>
          </div>
        )}
        <div className="flex gap-1">
          <button className="cb-btn" onClick={() => upd({ running: !st.running })}>{st.running ? "Stop" : "Run"}</button>
          <button className="cb-btn" onClick={() => { frozen.current = null; upd({ trigMode: "single", running: true }); }}>Single</button>
          <span className="flex-1" />
          <button className="cb-btn" onClick={exportCsv}>CSV</button>
          <button className="cb-btn" onClick={() => svgRef.current && exportPNG(svgRef.current, c.ref)}>PNG</button>
          <button className="cb-btn" onClick={() => svgRef.current && exportSVG(svgRef.current, c.ref)}>SVG</button>
        </div>
      </div>
      <div className="flex w-56 shrink-0 flex-col gap-1 overflow-auto">
        <div className="cb-section">Timebase</div>
        <Num label="Time/div" value={st.tdiv} unit="s" onChange={(v) => upd({ tdiv: v })} />
        <Num label="H position" value={st.hpos} unit="s" onChange={(v) => upd({ hpos: v })} />
        <div className="cb-section">Trigger</div>
        <label className="flex justify-between">Source<select className="cb-input" value={st.trigSrc} onChange={(e) => upd({ trigSrc: Number(e.target.value) })}>{names.map((n, i) => <option key={n} value={i}>{n}</option>)}</select></label>
        <Num label="Level" value={st.trigLevel} unit="V" onChange={(v) => upd({ trigLevel: v })} />
        <label className="flex justify-between">Edge<select className="cb-input" value={st.trigEdge} onChange={(e) => upd({ trigEdge: e.target.value })}><option value="rise">Rising</option><option value="fall">Falling</option></select></label>
        <label className="flex justify-between">Mode<select className="cb-input" value={st.trigMode} onChange={(e) => { frozen.current = null; upd({ trigMode: e.target.value }); }}><option value="auto">Auto</option><option value="normal">Normal</option><option value="single">Single</option></select></label>
        {names.map((n, i) => (
          <div key={n} className="rounded border p-1" style={{ borderColor: "var(--cb-border)" }}>
            <div className="flex items-center gap-1"><input type="checkbox" checked={(st.en as boolean[])[i]} onChange={(e) => setArr("en", i, e.target.checked)} /><b style={{ color: CH_COL[i] }}>Channel {n}</b><span className="flex-1" /><input type="radio" checked={st.sel === i} onChange={() => upd({ sel: i })} title="Measure this channel" /></div>
            <label className="flex justify-between">Source<select className="cb-input w-28" value={(st.src as string[])[i]} onChange={(e) => setArr("src", i, e.target.value)}><option value="pin">Pin {n} ({s.cn.pinNet[c.id + ":" + n] ?? "nc"})</option>{s.project.probes.map((q) => <option key={q.id} value={q.name}>{q.name}</option>)}</select></label>
            <Num label="V/div" value={(st.vdiv as number[])[i]} unit="V" onChange={(v) => setArr("vdiv", i, v)} />
            <Num label="Position (div)" value={(st.vpos as number[])[i]} onChange={(v) => setArr("vpos", i, v)} />
            <div className="flex gap-1">{["AC", "DC", "GND"].map((cp) => <button key={cp} className={"cb-btn flex-1 justify-center " + ((st.coupling as string[])[i] === cp ? "cb-btn-on" : "")} onClick={() => setArr("coupling", i, cp)}>{cp}</button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function valueResample(xa: number[], xb: number[], yb: number[]) { return xa.map((t) => valueAt(xb, yb, t)); }

// ======================= Function generator =======================
export function FuncGen({ c }: { c: Component }) {
  const s = useCB();
  const set = (k: string, v: string) => s.commit(`${c.ref}.${k}`, (p) => { const x = p.components.find((q) => q.id === c.id); if (x) x.props[k] = v; });
  const P = (k: string) => parseValue(c.props[k]);
  const fn = waveform(c.props, s.project.variables, c.props.wave);
  const f = P("freq") || 1000;
  const pts = Array.from({ length: 200 }, (_, i) => { const t = (i / 199) * 2 / f; return fn(t); });
  const mx = Math.max(...pts.map(Math.abs), 1e-9);
  return (
    <div className="flex flex-col gap-2 p-2 text-[11px]">
      <div className="flex flex-wrap gap-1">{["sine", "square", "triangle", "sawtooth", "noise", "dc", "pwl"].map((w) => <button key={w} className={"cb-btn " + (c.props.wave === w ? "cb-btn-on" : "")} onClick={() => set("wave", w)}>{w}</button>)}</div>
      <svg viewBox="0 0 200 60" className="w-full rounded border" style={{ borderColor: "var(--cb-border)", background: "var(--cb-plot)" }}>
        <line x1={0} x2={200} y1={30} y2={30} stroke="var(--cb-plotgrid)" />
        <polyline points={pts.map((v, i) => `${i},${30 - (v / mx) * 26}`).join(" ")} fill="none" stroke="#1f6feb" />
      </svg>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <Num label="Frequency" value={P("freq")} unit="Hz" onChange={(v) => set("freq", String(v))} />
        <Num label="Amplitude" value={P("ampl")} unit="Vp" onChange={(v) => set("ampl", String(v))} />
        <Num label="Offset" value={P("offset")} unit="V" onChange={(v) => set("offset", String(v))} />
        <Num label="Phase" value={P("phase")} unit="°" onChange={(v) => set("phase", String(v))} />
        <Num label="Duty cycle" value={P("duty")} unit="%" onChange={(v) => set("duty", String(v))} />
        <Num label="Output Z" value={P("rout")} unit="Ω" onChange={(v) => set("rout", String(v))} />
      </div>
      {c.props.wave === "pwl" && <label className="flex flex-col">PWL points (t v, …)<input className="cb-input font-mono" value={c.props.pwl} onChange={(e) => set("pwl", e.target.value)} /></label>}
      <div style={{ color: "var(--cb-muted)" }}>Outputs: + (waveform vs COM), − (inverted). Output impedance in series. Nets: + {s.cn.pinNet[c.id + ":+"] ?? "nc"}, COM {s.cn.pinNet[c.id + ":COM"] ?? "nc"}, − {s.cn.pinNet[c.id + ":-"] ?? "nc"}</div>
    </div>
  );
}

// ======================= Multimeter =======================
export function DMM({ c }: { c: Component }) {
  const s = useCB();
  const runs = currentRunSet(s);
  const run = runs[runs.length - 1];
  const [st, upd] = useInst(c.id, { range: "auto" as string });
  const set = (k: string, v: string) => s.commit(`${c.ref}.${k}`, (p) => { const x = p.components.find((q) => q.id === c.id); if (x) x.props[k] = v; });
  const mode = c.props.mode || "V", acdc = c.props.acdc || "DC";
  const np = s.cn.pinNet[c.id + ":+"], nn = s.cn.pinNet[c.id + ":-"];
  let reading = NaN, unit = "V", extra = "";
  if (run && run.analysis !== "ac" && run.analysis !== "dc") {
    const V = (n?: string) => (n && n !== "0" ? run.signals[`V(${n})`] : run.x.map(() => 0));
    const vp = V(np), vn = V(nn);
    const diff = vp && vn ? vp.map((v, i) => v - vn[i]) : null;
    const I = run.signals[`I(${c.ref})`];
    const series = mode === "A" ? I : diff;
    if (series) {
      const m = measure(run.x, series);
      if (mode === "V" || mode === "A") { unit = mode; reading = acdc === "DC" ? (run.x.length > 1 ? m.avg : series[0]) : Math.sqrt(Math.max(m.rms ** 2 - m.avg ** 2, 0)); if (run.analysis === "tran" && isFinite(m.freq)) extra = `f = ${fmt(m.freq, "Hz", 4)}`; }
      else if (mode === "Ohm") { unit = "Ω"; reading = series[series.length - 1] / 1e-3; }
      else if (mode === "Diode") { unit = "V"; reading = series[series.length - 1]; }
      else if (mode === "Continuity") { unit = "Ω"; reading = series[series.length - 1] / 1e-3; extra = reading < 50 ? "● CONTINUITY" : "open"; }
    }
  }
  const ranges: Record<string, number[]> = { V: [0.2, 2, 20, 200, 1000], A: [2e-3, 20e-3, 0.2, 2, 10], "Ω": [200, 2e3, 20e3, 200e3, 2e6, 20e6] };
  let disp = isFinite(reading) ? fmt(reading, unit, 5) : "- - - -";
  if (st.range !== "auto" && isFinite(reading)) { const r = Number(st.range); disp = Math.abs(reading) > r ? "OL" : reading.toFixed(Math.max(0, 4 - Math.ceil(Math.log10(r)))) + " " + unit; }
  if ((mode === "Ohm" || mode === "Continuity") && reading > 1e8) disp = "OL";
  return (
    <div className="flex flex-col gap-2 p-2 text-[11px]">
      <div className="rounded border px-3 py-2 text-right font-mono text-[26px]" style={{ borderColor: "var(--cb-border)", background: "var(--cb-plot)" }}>{disp}</div>
      <div className="font-mono" style={{ color: "var(--cb-muted)" }}>{extra || " "} {run ? `(${run.analysis})` : "Run a simulation (OP or transient)"}</div>
      <div className="flex gap-1">{["V", "A", "Ohm", "Diode", "Continuity"].map((m) => <button key={m} className={"cb-btn flex-1 justify-center " + (mode === m ? "cb-btn-on" : "")} onClick={() => set("mode", m)}>{m === "Ohm" ? "Ω" : m === "Diode" ? "→|" : m === "Continuity" ? "·))" : m}</button>)}</div>
      <div className="flex gap-1">{["DC", "AC"].map((m) => <button key={m} className={"cb-btn flex-1 justify-center " + (acdc === m ? "cb-btn-on" : "")} disabled={mode !== "V" && mode !== "A"} onClick={() => set("acdc", m)}>{m}</button>)}</div>
      <label className="flex items-center justify-between">Range<select className="cb-input" value={st.range} onChange={(e) => upd({ range: e.target.value })}><option value="auto">Auto</option>{(ranges[mode === "Ohm" || mode === "Continuity" ? "Ω" : mode === "A" ? "A" : "V"] ?? []).map((r) => <option key={r} value={r}>{fmt(r, unit)}</option>)}</select></label>
      <div style={{ color: "var(--cb-muted)" }}>V: 10 MΩ input · A: 0 Ω shunt (insert in series) · Ω/Diode: 1 mA test current (use on unpowered circuit)</div>
    </div>
  );
}

// ======================= Bode plotter =======================
export function Bode({ c }: { c: Component }) {
  const s = useCB();
  const [st, upd] = useInst(c.id, { fstart: 1, fstop: 1e6, points: 40, scale: "dec", source: "", result: null as null | { f: number[]; mag: number[]; ph: number[] }, err: "" });
  const [cur, setCur] = useState<[number, number] | null>(null);
  const pr = useRef<PlotHandle>(null);
  const sources = s.project.components.filter((x) => ["V", "I", "FGEN"].includes(LIBMAP[x.type]?.model ?? ""));
  const run = () => {
    try {
      const r = runAC(s.project, { fstart: st.fstart, fstop: st.fstop, points: st.points, scale: st.scale as "dec", source: st.source || sources.find((x) => parseValue(x.props.ac) > 0)?.ref || sources[0]?.ref || "" });
      const net = (pn: string) => s.cn.pinNet[c.id + ":" + pn];
      const cx = (n?: string) => (n && n !== "0" ? [r.signals[`Vre(${n})`], r.signals[`Vim(${n})`]] : [r.x.map(() => 0), r.x.map(() => 0)]);
      const [ipr, ipi] = cx(net("IN+")), [inr, ini] = cx(net("IN-")), [opr, opi] = cx(net("OUT+")), [onr, oni] = cx(net("OUT-"));
      if (!ipr || !opr) throw new Error("Connect IN+ and OUT+ of the Bode plotter");
      const mag: number[] = [], ph: number[] = [];
      r.x.forEach((_, i) => { const ar = ipr[i] - inr[i], ai = ipi[i] - ini[i], br = opr[i] - onr[i], bi = opi[i] - oni[i]; const d = ar * ar + ai * ai || 1e-30; const hr = (br * ar + bi * ai) / d, hi = (bi * ar - br * ai) / d; mag.push(20 * Math.log10(Math.max(Math.hypot(hr, hi), 1e-30))); ph.push((Math.atan2(hi, hr) * 180) / Math.PI); });
      for (let i = 1; i < ph.length; i++) { while (ph[i] - ph[i - 1] > 180) ph[i] -= 360; while (ph[i] - ph[i - 1] < -180) ph[i] += 360; }
      upd({ result: { f: r.x, mag, ph }, err: "" });
    } catch (e) { upd({ err: (e as Error).message + (e instanceof SimError ? "" : "") }); }
  };
  const R = st.result;
  let pm = NaN, gm = NaN, fc = NaN, f180 = NaN;
  if (R) {
    for (let i = 1; i < R.f.length; i++) {
      if (isNaN(fc) && R.mag[i - 1] >= 0 && R.mag[i] < 0) { const t = R.mag[i - 1] / (R.mag[i - 1] - R.mag[i]); fc = R.f[i - 1] * (R.f[i] / R.f[i - 1]) ** t; pm = 180 + R.ph[i - 1] + (R.ph[i] - R.ph[i - 1]) * t; }
      const a = R.ph[i - 1] + 180, b = R.ph[i] + 180;
      if (isNaN(f180) && a > 0 && b <= 0) { const t = a / (a - b); f180 = R.f[i - 1] * (R.f[i] / R.f[i - 1]) ** t; gm = -(R.mag[i - 1] + (R.mag[i] - R.mag[i - 1]) * t); }
    }
  }
  return (
    <div className="flex h-full flex-col gap-1 p-2 text-[11px]">
      <div className="flex flex-wrap items-end gap-2">
        <Num label="Start" value={st.fstart} unit="Hz" onChange={(v) => upd({ fstart: v })} />
        <Num label="Stop" value={st.fstop} unit="Hz" onChange={(v) => upd({ fstop: v })} />
        <Num label="Pts/dec" value={st.points} onChange={(v) => upd({ points: Math.max(2, Math.round(v)) })} w={45} />
        <select className="cb-input" value={st.scale} onChange={(e) => upd({ scale: e.target.value })}><option value="dec">Log</option><option value="lin">Linear</option></select>
        <select className="cb-input" value={st.source} onChange={(e) => upd({ source: e.target.value })}><option value="">Auto source</option>{sources.map((x) => <option key={x.id} value={x.ref}>{x.ref}</option>)}</select>
        <button className="cb-btn cb-btn-on" onClick={run}>Run AC</button>
      </div>
      {st.err && <div style={{ color: "var(--cb-err)" }}>{st.err}</div>}
      {R ? (
        <>
          <div className="min-h-0 flex-1"><Plot ref={pr} traces={[{ name: "Magnitude", color: "#1f6feb", x: R.f, y: R.mag }]} xLog={st.scale !== "lin"} xUnit="Hz" yUnit="dB" cursors onCursor={setCur} title="Gain (dB)" /></div>
          <div className="min-h-0 flex-1"><Plot traces={[{ name: "Phase", color: "#d1242f", x: R.f, y: R.ph }]} xLog={st.scale !== "lin"} xUnit="Hz" yUnit="°" title="Phase (°)" /></div>
          <div className="font-mono">
            {cur && <>C1 {fmt(cur[0], "Hz", 4)}: {valueAt(R.f, R.mag, cur[0]).toFixed(2)} dB, {valueAt(R.f, R.ph, cur[0]).toFixed(1)}° · C2 {fmt(cur[1], "Hz", 4)}: {valueAt(R.f, R.mag, cur[1]).toFixed(2)} dB · </>}
            f(0 dB) {fmt(fc, "Hz", 4)} · Phase margin {isFinite(pm) ? pm.toFixed(1) + "°" : "—"} · Gain margin {isFinite(gm) ? gm.toFixed(1) + " dB" : "—"}
          </div>
        </>
      ) : <Empty msg="Connect IN+/IN− to the stimulus and OUT+/OUT− to the output, then press Run AC." />}
    </div>
  );
}

// ======================= Logic analyzer =======================
export function LogicAnalyzer({ c }: { c: Component }) {
  const s = useCB();
  const run = useTranRun();
  const n = Number(c.props.channels || 8);
  const [st, upd] = useInst(c.id, { rate: 100e3, threshold: 2.5, trig: -1, edge: "rise", pre: 10, fmt: "hex", names: [] as string[], cursor: 0.5 });
  const svg = useRef<SVGSVGElement>(null);
  const data = useMemo(() => {
    if (!run || run.x.length < 2) return null;
    const T = run.x[run.x.length - 1] - run.x[0];
    const N = Math.max(8, Math.min(20000, Math.round(T * st.rate)));
    const ch = Array.from({ length: n }, (_, i) => { const net = s.cn.pinNet[c.id + ":D" + i]; if (!net) return null; const y = net === "0" ? run.x.map(() => 0) : run.signals[`V(${net})`]; if (!y) return null; return resample(run.x, y, N).y.map((v) => (v > st.threshold ? 1 : 0)); });
    let start = 0;
    if (st.trig >= 0 && ch[st.trig]) { const t = ch[st.trig]!; for (let k = 1; k < N; k++) if ((st.edge === "rise" && !t[k - 1] && t[k]) || (st.edge === "fall" && t[k - 1] && !t[k])) { start = Math.max(0, k - Math.round((N * st.pre) / 100)); break; } }
    return { ch: ch.map((a) => a?.slice(start) ?? null), N: N - start, dt: T / (N - 1), t0: run.x[0] + start * (T / (N - 1)) };
  }, [run, st.rate, st.threshold, st.trig, st.edge, st.pre, n, c.id, s.cn]);
  if (!data) return <Empty msg="Run a transient simulation. Connect channels D0…Dn to digital nets." />;
  const W = 600, rowH = 18, H = n * rowH + 20;
  const k = Math.min(data.N - 1, Math.max(0, Math.round(st.cursor * (data.N - 1))));
  const word = data.ch.reduce((acc, ch, i) => acc + ((ch?.[k] ?? 0) << i), 0);
  const wstr = st.fmt === "hex" ? "0x" + word.toString(16).toUpperCase() : st.fmt === "bin" ? word.toString(2).padStart(n, "0") : String(word);
  const names = st.names as string[];
  return (
    <div className="flex h-full flex-col gap-1 p-2 text-[11px]">
      <div className="flex flex-wrap items-end gap-2">
        <Num label="Sample rate" value={st.rate} unit="S/s" onChange={(v) => upd({ rate: v })} />
        <Num label="Threshold" value={st.threshold} unit="V" onChange={(v) => upd({ threshold: v })} w={55} />
        <label>Trigger <select className="cb-input" value={st.trig} onChange={(e) => upd({ trig: Number(e.target.value) })}><option value={-1}>None</option>{Array.from({ length: n }, (_, i) => <option key={i} value={i}>D{i}</option>)}</select></label>
        <select className="cb-input" value={st.edge} onChange={(e) => upd({ edge: e.target.value })}><option value="rise">↑</option><option value="fall">↓</option></select>
        <Num label="Pre-trig %" value={st.pre} onChange={(v) => upd({ pre: v })} w={40} />
        <label>Channels <select className="cb-input" value={n} onChange={(e) => s.commit(`${c.ref} channels`, (p) => { p.components.find((q) => q.id === c.id)!.props.channels = e.target.value; })}>{[8, 16, 32].map((x) => <option key={x}>{x}</option>)}</select></label>
        <select className="cb-input" value={st.fmt} onChange={(e) => upd({ fmt: e.target.value })}><option value="bin">Binary</option><option value="dec">Decimal</option><option value="hex">Hex</option></select>
        <button className="cb-btn" onClick={() => svg.current && exportPNG(svg.current, c.ref)}>PNG</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <svg ref={svg} width="100%" viewBox={`0 0 ${W + 90} ${H}`} style={{ background: "var(--cb-plot)" }} fontFamily="monospace" xmlns="http://www.w3.org/2000/svg"
          onMouseDown={(e) => { const r = svg.current!.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * (W + 90) - 90; upd({ cursor: Math.min(1, Math.max(0, x / W)) }); }}>
          {data.ch.map((ch, i) => {
            const y0 = 10 + i * rowH;
            let d = "";
            if (ch) { const step = Math.max(1, Math.floor(ch.length / (W * 2))); for (let q = 0; q < ch.length; q += step) { const X = 90 + (q / (data.N - 1)) * W, Y = y0 + (ch[q] ? 2 : rowH - 4); d += (d ? "L" : "M") + X.toFixed(1) + "," + Y; } }
            return <g key={i}><text x={2} y={y0 + 11} fontSize={9} fill="var(--cb-muted)" onDoubleClick={() => { const nm = window.prompt("Channel name", names[i] ?? ""); if (nm != null) { const a = [...names]; a[i] = nm; upd({ names: a }); } }}>{names[i] || "D" + i} {s.cn.pinNet[c.id + ":D" + i] ? "(" + s.cn.pinNet[c.id + ":D" + i] + ")" : ""}</text><line x1={90} x2={90 + W} y1={y0 + rowH - 1} y2={y0 + rowH - 1} stroke="var(--cb-plotgrid)" />{ch && <path d={d} fill="none" stroke="#1a7f37" strokeWidth={1.2} />}</g>;
          })}
          <line x1={90 + st.cursor * W} x2={90 + st.cursor * W} y1={0} y2={H} stroke="#8250df" strokeDasharray="3 2" />
        </svg>
      </div>
      <div className="font-mono">Cursor t = {fmt(data.t0 + k * data.dt, "s", 5)} · word = {wstr} · {data.N} samples</div>
    </div>
  );
}

// ======================= Others =======================
export function Wattmeter({ c }: { c: Component }) {
  const s = useCB(); const runs = currentRunSet(s); const run = runs[runs.length - 1];
  if (!run || run.analysis === "ac") return <Empty msg="Run OP or transient." />;
  const V = (pn: string) => { const n = s.cn.pinNet[c.id + ":" + pn]; return n && n !== "0" ? run.signals[`V(${n})`] : run.x.map(() => 0); };
  const vp = V("V+"), vn = V("V-"), I = run.signals[`I(${c.ref}.I)`];
  if (!vp || !vn || !I) return <Empty msg="Connect V+/V− across the load and I+/I− in series." />;
  const v = vp.map((x, i) => x - vn[i]), p = v.map((x, i) => x * I[i]);
  const P = measure(run.x, p).avg, Vr = measure(run.x, v).rms, Ir = measure(run.x, I).rms;
  return <div className="p-3 font-mono text-[12px]"><div className="text-[24px]">{fmt(P, "W", 5)}</div><div>Vrms {fmt(Vr, "V", 4)} · Irms {fmt(Ir, "A", 4)} · PF {(P / (Vr * Ir || 1)).toFixed(3)}</div></div>;
}
export function FreqCounter({ c }: { c: Component }) {
  const s = useCB(); const run = useTranRun();
  const n = s.cn.pinNet[c.id + ":IN"];
  if (!run || !n) return <Empty msg="Connect IN and run a transient simulation." />;
  const m = measure(run.x, run.signals[`V(${n})`] ?? []);
  return <div className="p-3 font-mono text-[12px]"><div className="text-[24px]">{fmt(m.freq, "Hz", 6)}</div><div>Period {fmt(m.period, "s", 5)} · Duty {isFinite(m.duty) ? m.duty.toFixed(2) + " %" : "—"} · Rise {fmt(m.rise, "s", 3)} · Fall {fmt(m.fall, "s", 3)}</div></div>;
}
export function Spectrum({ c }: { c: Component }) {
  const s = useCB(); const run = useTranRun();
  const n = s.cn.pinNet[c.id + ":IN"];
  if (!run || !n || !run.signals[`V(${n})`]) return <Empty msg="Connect IN and run a transient simulation." />;
  const r = fft(run.x, run.signals[`V(${n})`]);
  const db = r.mag.map((v) => 20 * Math.log10(Math.max(v, 1e-12)));
  const peaks = r.f.map((f, i) => ({ f, v: r.mag[i] })).slice(1).filter((q, i, a) => i > 0 && i < a.length - 1 && q.v > a[i - 1].v && q.v > a[i + 1].v).sort((a, b) => b.v - a.v).slice(0, 5);
  return <div className="flex h-full flex-col p-2 text-[11px]"><div className="min-h-0 flex-1"><Plot traces={[{ name: "Spectrum", color: "#1f6feb", x: r.f.slice(1), y: db.slice(1) }]} xLog xUnit="Hz" yUnit="dBV" /></div><div className="font-mono">Peaks: {peaks.map((q) => `${fmt(q.f, "Hz", 4)} (${fmt(q.v, "V", 3)})`).join(" · ")}</div></div>;
}
export function WordGen({ c }: { c: Component }) {
  const s = useCB();
  const set = (k: string, v: string) => s.commit(`${c.ref}.${k}`, (p) => { p.components.find((q) => q.id === c.id)!.props[k] = v; });
  return <div className="flex flex-col gap-2 p-2 text-[11px]"><label className="flex flex-col">Words (hex, space separated)<textarea className="cb-input h-20 font-mono" value={c.props.words} onChange={(e) => set("words", e.target.value)} /></label><Num label="Word rate" value={parseValue(c.props.freq)} unit="Hz" onChange={(v) => set("freq", String(v))} /><Num label="Logic high" value={parseValue(c.props.vdd)} unit="V" onChange={(v) => set("vdd", String(v))} /><div style={{ color: "var(--cb-muted)" }}>Outputs B0…B7 drive bit i of the current word; words cycle at the word rate.</div></div>;
}
export function IVAnalyzer({ c }: { c: Component }) {
  const s = useCB();
  const [res, setRes] = useState<{ v: number[]; i: number[] } | null>(null);
  const [err, setErr] = useState("");
  const go = () => {
    try {
      const a = parseValue(c.props.vstart), b = parseValue(c.props.vstop), n = Math.max(2, parseValue(c.props.points));
      const [r] = runDC(s.project, { source: c.ref, start: a, stop: b, step: (b - a) / (n - 1) }, { ivActive: c.id });
      setRes({ v: r.x, i: r.signals[`I(${c.ref})`].map((x) => -x) }); setErr("");
    } catch (e) { setErr((e as Error).message); }
  };
  const set = (k: string, v: string) => s.commit(`${c.ref}.${k}`, (p) => { p.components.find((q) => q.id === c.id)!.props[k] = v; });
  return <div className="flex h-full flex-col gap-1 p-2 text-[11px]"><div className="flex items-end gap-2"><Num label="V start" value={parseValue(c.props.vstart)} unit="V" onChange={(v) => set("vstart", String(v))} /><Num label="V stop" value={parseValue(c.props.vstop)} unit="V" onChange={(v) => set("vstop", String(v))} /><Num label="Points" value={parseValue(c.props.points)} onChange={(v) => set("points", String(Math.round(v)))} w={45} /><button className="cb-btn cb-btn-on" onClick={go}>Sweep</button></div>{err && <div style={{ color: "var(--cb-err)" }}>{err}</div>}<div className="min-h-0 flex-1">{res ? <Plot traces={[{ name: "I", color: "#1a7f37", x: res.v, y: res.i }]} xUnit="V" yUnit="A" cursors /> : <Empty msg="Connect + and − across a two-terminal device (e.g. a diode) and press Sweep." />}</div></div>;
}

export function InstrumentBody({ c }: { c: Component }) {
  switch (c.type) {
    case "SCOPE": return <Scope c={c} />;
    case "FGEN": return <FuncGen c={c} />;
    case "DMM": return <DMM c={c} />;
    case "BODE": return <Bode c={c} />;
    case "LA": return <LogicAnalyzer c={c} />;
    case "WATT": return <Wattmeter c={c} />;
    case "FCNT": return <FreqCounter c={c} />;
    case "SPEC": return <Spectrum c={c} />;
    case "WGEN": return <WordGen c={c} />;
    case "IV": return <IVAnalyzer c={c} />;
  }
  return null;
}
export const INSTR_SIZE: Record<string, [number, number]> = { SCOPE: [820, 560], FGEN: [380, 330], DMM: [300, 300], BODE: [640, 520], LA: [720, 420], WATT: [320, 160], FCNT: [360, 160], SPEC: [560, 360], WGEN: [340, 260], IV: [520, 380] };
