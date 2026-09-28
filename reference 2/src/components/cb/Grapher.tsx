"use client";
import { useMemo, useRef, useState } from "react";
import { useCB, currentRunSet } from "@/lib/cb/store";
import { Plot, type PlotHandle, type Trace, valueAt, exportSVG, exportPNG, exportPDF, download } from "./Plot";
import { probeSeries, probeUnit } from "@/lib/cb/probes";
import { evalExpr, derivative, integral } from "@/lib/cb/expr";
import { fft, measure } from "@/lib/cb/analyses";
import { fmt } from "@/lib/cb/units";
import type { SavedRun } from "@/lib/cb/types";

const PAL = ["#1f6feb", "#d1242f", "#1a7f37", "#9a6700", "#8250df", "#bf3989", "#0a7ea4", "#cf222e", "#57606a", "#116329"];
type Mode = "normal" | "fft" | "deriv" | "integral";
interface Panel { id: string; sigs: string[]; xLog: boolean; yLog: boolean; mode: Mode }

export default function Grapher() {
  const s = useCB();
  const { project: p, cn } = s;
  const live = currentRunSet(s);
  const [compare, setCompare] = useState<string[]>([]);
  const runs: SavedRun[] = useMemo(() => [...live, ...p.runs.filter((r) => compare.includes(r.id) && !live.some((l) => l.id === r.id))], [live, p.runs, compare]);
  const first = runs[0];
  const isAC = first?.analysis === "ac";
  const available = useMemo(() => {
    const keys = first ? Object.keys(first.signals).filter((k) => !k.startsWith("Vre(") && !k.startsWith("Vim(")) : [];
    return [...p.probes.filter((q) => q.visible).map((q) => q.name), ...keys];
  }, [first, p.probes]);
  const defaultSigs = () => {
    const pr = p.probes.filter((q) => q.visible).map((q) => q.name);
    if (pr.length) return pr;
    if (!first) return [];
    const named = cn.nets.filter((n) => n.named && n.name !== "0").map((n) => (isAC ? `VDB(${n.name})` : `V(${n.name})`));
    return named.slice(0, 4);
  };
  const [panels, setPanels] = useState<Panel[]>([]);
  const effPanels: Panel[] = panels.length ? panels : [{ id: "p1", sigs: defaultSigs(), xLog: isAC, yLog: false, mode: "normal" }];
  const [active, setActive] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [colors, setColors] = useState<Record<string, string>>({});
  const [expr, setExpr] = useState("");
  const [err, setErr] = useState("");
  const [cursors, setCursors] = useState<Record<string, [number, number]>>({});
  const plotRefs = useRef<Record<string, PlotHandle | null>>({});
  const upd = (i: number, f: (pl: Panel) => Panel) => setPanels(effPanels.map((pl, k) => (k === i ? f(pl) : pl)));

  const series = (sig: string, run: SavedRun): number[] | null => {
    const pr = p.probes.find((q) => q.name === sig);
    if (pr) return probeSeries(pr, p, cn, run);
    if (run.signals[sig]) return run.signals[sig];
    try {
      return evalExpr(sig, (nm) => { const q = p.probes.find((x) => x.name === nm); if (q) return probeSeries(q, p, cn, run); return run.signals[nm] ?? null; }, run.x.length);
    } catch { return null; }
  };
  const tracesFor = (pl: Panel): (Trace & { key: string })[] => {
    const out: (Trace & { key: string })[] = [];
    let ci = 0;
    for (const sig of pl.sigs) {
      runs.forEach((run, ri) => {
        const y = series(sig, run); ci++;
        if (!y) return;
        let x = run.x, yy = y;
        if (pl.mode === "fft" && run.analysis === "tran") { const r = fft(run.x, y); x = r.f; yy = r.mag; }
        if (pl.mode === "deriv") yy = derivative(x, y);
        if (pl.mode === "integral") yy = integral(x, y);
        const key = `${sig}#${run.id}`;
        const pr = p.probes.find((q) => q.name === sig);
        const color = colors[key] ?? (runs.length > 1 ? PAL[(ri + (pl.sigs.indexOf(sig) * 3)) % PAL.length] : pr?.color ?? PAL[(ci - 1) % PAL.length]);
        const name = runs.length > 1 ? `${sig} [${run.label}]` : sig;
        out.push({ key, name, color, x, y: yy, dashed: ri >= live.length, unit: pr ? probeUnit(pr) : sig.startsWith("I(") ? "A" : sig.startsWith("VP(") ? "°" : sig.startsWith("VDB(") ? "dB" : "V" });
      });
    }
    return out;
  };

  const addExpr = () => {
    if (!expr.trim()) return;
    if (first && !series(expr.trim(), first)) { setErr(`Cannot evaluate "${expr}"`); return; }
    setErr(""); upd(active, (pl) => ({ ...pl, sigs: [...pl.sigs, expr.trim()] })); setExpr("");
  };
  const exportCSV = (pl: Panel) => {
    const tr = tracesFor(pl).filter((t) => !hidden.has(t.key));
    if (!tr.length) return;
    const base = tr[0];
    const rows = [["x", ...tr.map((t) => t.name)].join(",")];
    base.x.forEach((xv, i) => rows.push([xv, ...tr.map((t) => (t.x === base.x ? t.y[i] : valueAt(t.x, t.y, xv)))].join(",")));
    download("circuitbench-graph.csv", rows.join("\n"), "text/csv");
  };

  if (!first) return <div className="p-4 text-[12px]" style={{ color: "var(--cb-muted)" }}>No simulation results yet. Run a simulation (F5) — probes and net voltages appear here.</div>;

  return (
    <div className="flex h-full text-[12px]">
      <div className="flex w-52 shrink-0 flex-col border-r" style={{ borderColor: "var(--cb-border)" }}>
        <div className="cb-section">Signals → panel {active + 1}</div>
        <div className="min-h-0 flex-1 overflow-auto px-1">
          {available.map((k) => {
            const on = effPanels[active]?.sigs.includes(k);
            return <label key={k} className="flex cursor-pointer items-center gap-1 rounded px-1 py-[1px] font-mono text-[11px] hover:bg-[var(--cb-hover)]"><input type="checkbox" checked={!!on} onChange={() => upd(active, (pl) => ({ ...pl, sigs: on ? pl.sigs.filter((x) => x !== k) : [...pl.sigs, k] }))} />{k}</label>;
          })}
        </div>
        <div className="border-t p-1" style={{ borderColor: "var(--cb-border)" }}>
          <div className="mb-1 text-[11px]" style={{ color: "var(--cb-muted)" }}>Math expression</div>
          <div className="flex gap-1"><input className="cb-input flex-1 font-mono" placeholder="V(OUT)-V(IN)" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExpr()} /><button className="cb-btn" onClick={addExpr}>Add</button></div>
          {err && <div className="text-[11px]" style={{ color: "var(--cb-err)" }}>{err}</div>}
        </div>
        <div className="max-h-32 overflow-auto border-t p-1" style={{ borderColor: "var(--cb-border)" }}>
          <div className="text-[11px]" style={{ color: "var(--cb-muted)" }}>Compare saved runs (dashed)</div>
          {p.runs.slice().reverse().map((r) => <label key={r.id} className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={compare.includes(r.id)} onChange={() => setCompare(compare.includes(r.id) ? compare.filter((x) => x !== r.id) : [...compare, r.id])} /><span className="truncate">{r.analysis} · {r.label} · {new Date(r.timestamp).toLocaleTimeString()}</span></label>)}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b px-1 py-1" style={{ borderColor: "var(--cb-border)" }}>
          <button className="cb-btn" onClick={() => setPanels([...effPanels, { id: "p" + Date.now(), sigs: [], xLog: isAC, yLog: false, mode: "normal" }])}>+ Panel</button>
          {effPanels.length > 1 && <button className="cb-btn" onClick={() => { setPanels(effPanels.filter((_, i) => i !== active)); setActive(0); }}>− Panel</button>}
          <span className="mx-1 h-4 w-px" style={{ background: "var(--cb-border)" }} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={effPanels[active]?.xLog} onChange={(e) => upd(active, (pl) => ({ ...pl, xLog: e.target.checked }))} />X log</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={effPanels[active]?.yLog} onChange={(e) => upd(active, (pl) => ({ ...pl, yLog: e.target.checked }))} />Y log</label>
          <select className="cb-input" value={effPanels[active]?.mode} onChange={(e) => upd(active, (pl) => ({ ...pl, mode: e.target.value as Mode, xLog: e.target.value === "fft" ? true : pl.xLog }))}>
            <option value="normal">Signal</option><option value="fft" disabled={first.analysis !== "tran"}>FFT</option><option value="deriv">Derivative</option><option value="integral">Integral</option>
          </select>
          <button className="cb-btn" onClick={() => plotRefs.current[effPanels[active].id]?.autoscale()}>Auto Scale</button>
          <span className="flex-1" />
          <button className="cb-btn" onClick={() => exportCSV(effPanels[active])}>CSV</button>
          <button className="cb-btn" onClick={() => { const el = plotRefs.current[effPanels[active].id]?.svg(); if (el) exportSVG(el, "graph"); }}>SVG</button>
          <button className="cb-btn" onClick={() => { const el = plotRefs.current[effPanels[active].id]?.svg(); if (el) exportPNG(el, "graph"); }}>PNG</button>
          <button className="cb-btn" onClick={() => { const el = plotRefs.current[effPanels[active].id]?.svg(); if (el) exportPDF(el, "CircuitBench Graph — " + p.meta.name); }}>PDF</button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {effPanels.map((pl, i) => {
            const tr = tracesFor(pl);
            const vis = tr.filter((t) => !hidden.has(t.key));
            const c = cursors[pl.id];
            return (
              <div key={pl.id} onMouseDown={() => setActive(i)} className="border-b" style={{ borderColor: i === active ? "var(--cb-sel)" : "var(--cb-border)", borderLeft: i === active ? "2px solid var(--cb-sel)" : "2px solid transparent" }}>
                <div style={{ height: Math.max(180, 420 / effPanels.length) }}>
                  <Plot ref={(r) => { plotRefs.current[pl.id] = r; }} traces={vis} xLog={pl.xLog} yLog={pl.yLog} cursors xUnit={pl.mode === "fft" ? "Hz" : first.analysis === "tran" ? "s" : first.analysis === "ac" ? "Hz" : ""} onCursor={(cc) => setCursors((o) => ({ ...o, [pl.id]: cc }))} />
                </div>
                <table className="w-full font-mono text-[10.5px]">
                  <thead><tr style={{ color: "var(--cb-muted)" }} className="text-left"><th className="px-1">Trace</th><th>y@C1</th><th>y@C2</th><th>ΔY</th><th>Min</th><th>Max</th><th>P-P</th><th>Avg</th><th>RMS</th><th>Freq</th></tr></thead>
                  <tbody>
                    {tr.map((t) => {
                      const m = measure(t.x, t.y);
                      const y1 = c ? valueAt(t.x, t.y, c[0]) : NaN, y2 = c ? valueAt(t.x, t.y, c[1]) : NaN;
                      return (
                        <tr key={t.key} className={hidden.has(t.key) ? "opacity-40" : ""}>
                          <td className="px-1"><span className="inline-flex items-center gap-1"><input type="checkbox" checked={!hidden.has(t.key)} onChange={() => { const h = new Set(hidden); if (h.has(t.key)) h.delete(t.key); else h.add(t.key); setHidden(h); }} /><input type="color" value={t.color} onChange={(e) => setColors({ ...colors, [t.key]: e.target.value })} className="h-3 w-4 border-0 p-0" />{t.name}{pl.sigs.includes(t.name) || tr.length ? <button className="ml-1 opacity-60 hover:opacity-100" title="Remove from panel" onClick={() => upd(i, (q) => ({ ...q, sigs: q.sigs.filter((x) => x !== t.key.split("#")[0]) }))}>×</button> : null}</span></td>
                          <td>{fmt(y1, t.unit, 4)}</td><td>{fmt(y2, t.unit, 4)}</td><td>{fmt(y2 - y1, t.unit, 4)}</td><td>{fmt(m.min, t.unit, 4)}</td><td>{fmt(m.max, t.unit, 4)}</td><td>{fmt(m.pp, t.unit, 4)}</td><td>{fmt(m.avg, t.unit, 4)}</td><td>{fmt(m.rms, t.unit, 4)}</td><td>{first.analysis === "tran" && pl.mode === "normal" ? fmt(m.freq, "Hz", 4) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {c && <div className="px-1 pb-1 font-mono text-[10.5px]" style={{ color: "var(--cb-muted)" }}>X1={fmt(c[0], "", 4)} X2={fmt(c[1], "", 4)} ΔX={fmt(c[1] - c[0], "", 4)} 1/ΔX={fmt(1 / (c[1] - c[0]), "", 4)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
