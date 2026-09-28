"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCB, currentRunSet } from "@/lib/cb/store";
import { PartBrowser, focusOn } from "./Panels";
import { LIBMAP } from "@/lib/cb/library";
import { parseValue, fmt } from "@/lib/cb/units";
import { sweepValues, sweepCombos, fourier, sensitivity, measure } from "@/lib/cb/analyses";
import { exportNetlist } from "@/lib/cb/netlist";
import { openProject, bom, importJSONFile, pinCount } from "@/lib/cb/actions";
import { download } from "./Plot";
import { EXAMPLES } from "@/lib/cb/examples";
import { runTests, type TestResult } from "@/lib/cb/tests";
import type { SweepDim, SimSettings } from "@/lib/cb/types";
import { compBBox } from "@/lib/cb/connectivity";
import * as store from "@/lib/cb/storage";
import { localUsage } from "@/lib/cb/storage";
import { probeSeries } from "@/lib/cb/probes";

export interface CommandDef { id: string; label: string; group: string; key?: string; run: () => void; disabled?: boolean }

function Modal({ title, children, w = 640, onClose, footer }: { title: string; children: ReactNode; w?: number; onClose: () => void; footer?: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/25 pt-16" onMouseDown={onClose}>
      <div role="dialog" aria-label={title} className="flex max-h-[80vh] flex-col rounded-md border shadow-2xl" style={{ width: w, background: "var(--cb-panel)", borderColor: "var(--cb-border)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-8 items-center border-b px-3 text-[12.5px] font-semibold" style={{ borderColor: "var(--cb-border)", background: "var(--cb-toolbar)" }}>{title}<span className="flex-1" /><button className="cb-btn h-5 w-5 justify-center p-0" onClick={onClose} aria-label="Close">×</button></div>
        <div className="min-h-0 flex-1 overflow-auto p-3 text-[12px]">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-3 py-2" style={{ borderColor: "var(--cb-border)" }}>{footer}</div>}
      </div>
    </div>
  );
}
function F({ label, value, onChange, unit, options, w }: { label: string; value: string | number; onChange: (v: string) => void; unit?: string; options?: [string, string][]; w?: number }) {
  return (
    <label className="grid grid-cols-[150px_1fr] items-center gap-2 py-[2px]">
      <span style={{ color: "var(--cb-muted)" }}>{label}{unit ? ` (${unit})` : ""}</span>
      {options ? <select className="cb-input" value={String(value)} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : <input className="cb-input font-mono" style={{ width: w }} defaultValue={String(value)} onBlur={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />}
    </label>
  );
}
const numOr = (v: string, d: number) => { const n = parseValue(v); return isNaN(n) ? d : n; };

function sources() { return useCB.getState().project.components.filter((c) => ["V", "I", "FGEN", "PWR"].includes(LIBMAP[c.type]?.model ?? "") && LIBMAP[c.type]?.model !== "PWR"); }

function AnalysisDialog({ close }: { close: () => void }) {
  const s = useCB(); const sim = s.project.sim;
  const [tab, setTab] = useState(sim.analysis);
  const upd = (f: (x: SimSettings) => void) => s.commit("Simulation settings", (p) => f(p.sim));
  const src = sources();
  return (
    <Modal title="Simulation Settings" onClose={close} footer={<><button className="cb-btn" onClick={() => { const n = window.prompt("Preset name"); if (n) s.commit("Save preset", (p) => { p.presets = [...p.presets.filter((x) => x.name !== n), { name: n, sim: structuredClone(p.sim) }]; }); }}>Save preset</button><button className="cb-btn" onClick={close}>Close</button><button className="cb-btn cb-btn-on" onClick={() => { upd((x) => { x.analysis = tab; }); close(); setTimeout(() => useCB.getState().runSim(tab), 0); }}>Run</button></>}>
      <div className="mb-2 flex gap-1">{([["op", "Operating Point"], ["tran", "Transient"], ["ac", "AC Sweep"], ["dc", "DC Sweep"]] as const).map(([k, l]) => <button key={k} className={"cb-tab " + (tab === k ? "cb-tab-on" : "")} onClick={() => { setTab(k); upd((x) => { x.analysis = k; }); }}>{l}</button>)}</div>
      {tab === "op" && <div style={{ color: "var(--cb-muted)" }}>Computes the DC operating point (capacitors open, inductors shorted). Results appear in Results and as markers on labels/probes.</div>}
      {tab === "tran" && <>
        <F label="Start time" unit="s" value={sim.tran.tstart} onChange={(v) => upd((x) => { x.tran.tstart = numOr(v, 0); })} />
        <F label="Stop time" unit="s" value={sim.tran.tstop} onChange={(v) => upd((x) => { x.tran.tstop = Math.max(1e-12, numOr(v, 1e-3)); })} />
        <F label="Maximum time step" unit="s, 0=auto" value={sim.tran.tmax} onChange={(v) => upd((x) => { x.tran.tmax = numOr(v, 0); })} />
        <F label="Initial time step" unit="s, 0=auto" value={sim.tran.tstep} onChange={(v) => upd((x) => { x.tran.tstep = numOr(v, 0); })} />
        <F label="Initial conditions" value={sim.tran.uic ? "uic" : "op"} options={[["op", "Use operating point"], ["uic", "UIC (use initial conditions, zero otherwise)"]]} onChange={(v) => upd((x) => { x.tran.uic = v === "uic"; })} />
        <label className="flex items-center gap-2 py-1"><input type="checkbox" checked={s.interactive} onChange={(e) => s.set({ interactive: e.target.checked })} />Interactive (run continuously until Stop)</label>
      </>}
      {tab === "ac" && <>
        <F label="Start frequency" unit="Hz" value={sim.ac.fstart} onChange={(v) => upd((x) => { x.ac.fstart = numOr(v, 1); })} />
        <F label="Stop frequency" unit="Hz" value={sim.ac.fstop} onChange={(v) => upd((x) => { x.ac.fstop = numOr(v, 1e6); })} />
        <F label="Sweep type" value={sim.ac.scale} options={[["dec", "Decade"], ["oct", "Octave"], ["lin", "Linear"]]} onChange={(v) => upd((x) => { x.ac.scale = v as "dec"; })} />
        <F label={sim.ac.scale === "lin" ? "Total points" : "Points per " + (sim.ac.scale === "dec" ? "decade" : "octave")} value={sim.ac.points} onChange={(v) => upd((x) => { x.ac.points = Math.max(1, Math.round(numOr(v, 20))); })} />
        <F label="Input source" value={sim.ac.source} options={[["", "All sources with AC magnitude"], ...src.map((c) => [c.ref, c.ref] as [string, string])]} onChange={(v) => upd((x) => { x.ac.source = v; })} />
      </>}
      {tab === "dc" && <>
        <F label="Sweep source" value={sim.dc.source} options={[["", "— select —"], ...src.filter((c) => c.type === "VDC" || c.type === "IDC").map((c) => [c.ref, c.ref] as [string, string])]} onChange={(v) => upd((x) => { x.dc.source = v; })} />
        <F label="Start value" value={sim.dc.start} onChange={(v) => upd((x) => { x.dc.start = numOr(v, 0); })} />
        <F label="Stop value" value={sim.dc.stop} onChange={(v) => upd((x) => { x.dc.stop = numOr(v, 5); })} />
        <F label="Step" value={sim.dc.step} onChange={(v) => upd((x) => { x.dc.step = numOr(v, 0.1); })} />
        <div className="cb-section mt-2">Optional second (nested) sweep</div>
        <F label="Source 2" value={sim.dc.source2 ?? ""} options={[["", "none"], ...src.filter((c) => c.type === "VDC" || c.type === "IDC").map((c) => [c.ref, c.ref] as [string, string])]} onChange={(v) => upd((x) => { x.dc.source2 = v || undefined; })} />
        {sim.dc.source2 && <><F label="Start 2" value={sim.dc.start2 ?? 0} onChange={(v) => upd((x) => { x.dc.start2 = numOr(v, 0); })} /><F label="Stop 2" value={sim.dc.stop2 ?? 1} onChange={(v) => upd((x) => { x.dc.stop2 = numOr(v, 1); })} /><F label="Step 2" value={sim.dc.step2 ?? 1} onChange={(v) => upd((x) => { x.dc.step2 = numOr(v, 1); })} /></>}
      </>}
      <div className="cb-section mt-3">Global</div>
      <F label="Temperature" unit="°C" value={sim.temp} onChange={(v) => upd((x) => { x.temp = numOr(v, 27); })} />
      <F label="GMIN" unit="S" value={sim.gmin} onChange={(v) => upd((x) => { x.gmin = numOr(v, 1e-12); })} />
      {s.project.presets.length > 0 && <><div className="cb-section mt-3">Presets</div>{s.project.presets.map((pr) => <div key={pr.name} className="cb-row"><span>{pr.name}</span><button className="cb-btn ml-auto h-5" onClick={() => { s.commit("Load preset", (p) => { p.sim = structuredClone(pr.sim); }); setTab(pr.sim.analysis); }}>Load</button><button className="cb-btn h-5" onClick={() => s.commit("Delete preset", (p) => { p.presets = p.presets.filter((x) => x.name !== pr.name); })}>Delete</button></div>)}</>}
    </Modal>
  );
}

function sweepTargets() {
  const p = useCB.getState().project;
  const out: [string, string][] = [["", "— select —"]];
  for (const c of p.components) { const d = LIBMAP[c.type]; if (!d || !d.model) continue; for (const pd of d.props) if (pd.unit && pd.unit !== "%" || pd.key === "pos" || pd.key === "ratio" || pd.key === "gain") out.push([`${c.ref}.${pd.key}`, `${c.ref}.${pd.key} (${pd.label}) = ${c.props[pd.key]}`]); }
  for (const k of Object.keys(p.variables)) out.push([`var:${k}`, `Design variable ${k} = ${p.variables[k]}`]);
  return out;
}
function ParamDialog({ close, mode }: { close: () => void; mode: "param" | "temp" | "mc" }) {
  const s = useCB(); const ps = s.project.sim.param;
  const upd = (f: (d: SweepDim[]) => void) => s.commit("Sweep settings", (p) => f(p.sim.param.dims));
  const targets = useMemo(sweepTargets, [s.project]);
  const combos = mode === "param" ? sweepCombos(ps.dims) : [];
  const [mcN, setMcN] = useState(10);
  return (
    <Modal title={mode === "param" ? "Parameter Sweep" : mode === "temp" ? "Temperature Sweep" : "Monte Carlo"} w={700} onClose={close} footer={<><button className="cb-btn" onClick={close}>Close</button><button className="cb-btn cb-btn-on" disabled={mode === "param" && !Object.keys(combos[0] ?? {}).length} onClick={() => { close(); if (mode === "mc") { useCB.getState().set({}); import("@/lib/cb/analyses").then(({ runMonteCarlo }) => { try { const runs = runMonteCarlo(useCB.getState().project, mcN, ps.analysis); useCB.getState().set({ results: runs, status: "Completed" }); useCB.getState().logMsg("info", `Monte Carlo: ${runs.length} runs`); useCB.getState().openWindow("grapher"); } catch (e) { useCB.getState().logMsg("error", (e as Error).message); useCB.getState().set({ status: "Error" }); } }); } else useCB.getState().runSim(mode).then(() => useCB.getState().openWindow("grapher")); }}>Run {mode === "param" ? `${combos.length} simulation(s)` : ""}</button></>}>
      <F label="Analysis per run" value={ps.analysis} options={[["tran", "Transient"], ["ac", "AC"], ["dc", "DC Sweep"], ["op", "Operating point"]]} onChange={(v) => s.commit("Sweep analysis", (p) => { p.sim.param.analysis = v as "tran"; })} />
      {mode === "temp" && <F label="Temperatures" unit="°C, list" value={s.project.sim.tempList} onChange={(v) => s.commit("Temp list", (p) => { p.sim.tempList = v; })} />}
      {mode === "mc" && <label className="grid grid-cols-[150px_1fr] items-center gap-2"><span style={{ color: "var(--cb-muted)" }}>Runs</span><input className="cb-input font-mono" type="number" min={2} max={100} value={mcN} onChange={(e) => setMcN(Number(e.target.value))} /></label>}
      {mode === "mc" && <div className="mt-1" style={{ color: "var(--cb-muted)" }}>Each R/C/L value is varied uniformly within its Tolerance property (deterministic seed).</div>}
      {mode === "param" && ps.dims.map((d, i) => {
        const vals = sweepValues(d);
        return (
          <div key={i} className="mt-2 rounded border p-2" style={{ borderColor: "var(--cb-border)" }}>
            <div className="mb-1 font-semibold">{i === 0 ? "Sweep parameter" : "Nested parameter"}</div>
            <F label="Component property / variable" value={d.target} options={targets} onChange={(v) => upd((ds) => { ds[i].target = v; const c = s.project.components.find((x) => x.ref === v.split(".")[0]); const cur = c ? parseValue(c.props[v.split(".")[1]]) : NaN; if (!isNaN(cur) && cur) { ds[i].start = cur / 10; ds[i].stop = cur * 10; } })} />
            <F label="Scale" value={d.mode} options={[["lin", "Linear"], ["log", "Logarithmic"], ["list", "Explicit list"]]} onChange={(v) => upd((ds) => { ds[i].mode = v as "lin"; })} />
            {d.mode === "list" ? <F label="Values" value={d.list} onChange={(v) => upd((ds) => { ds[i].list = v; })} /> : <>
              <F label="Start" value={d.start} onChange={(v) => upd((ds) => { ds[i].start = numOr(v, 1); })} />
              <F label="Stop" value={d.stop} onChange={(v) => upd((ds) => { ds[i].stop = numOr(v, 10); })} />
              <F label="Points" value={d.points} onChange={(v) => upd((ds) => { ds[i].points = Math.max(1, Math.min(200, Math.round(numOr(v, 5)))); })} />
            </>}
            <div className="font-mono text-[11px]" style={{ color: "var(--cb-muted)" }}>Values: {vals.map((v) => fmt(v)).join(", ") || "—"}</div>
            {i > 0 && <button className="cb-btn mt-1" onClick={() => upd((ds) => { ds.splice(i, 1); })}>Remove nested</button>}
          </div>
        );
      })}
      {mode === "param" && ps.dims.length < 2 && <button className="cb-btn mt-2" onClick={() => upd((ds) => { ds.push({ target: "", mode: "lin", start: 1, stop: 10, points: 3, list: "" }); })}>+ Nested sweep</button>}
      {mode === "param" && <div className="mt-2" style={{ color: "var(--cb-muted)" }}>Configuration is stored in the project. Each run is saved with parameter value, timestamp, status and traces; the Grapher overlays runs and shows the values in the legend.</div>}
    </Modal>
  );
}

function FourierDialog({ close }: { close: () => void }) {
  const s = useCB(); const runs = currentRunSet(s); const run = runs.find((r) => r.analysis === "tran");
  const sigs = run ? [...s.project.probes.map((q) => q.name), ...Object.keys(run.signals).filter((k) => k.startsWith("V("))] : [];
  const [sig, setSig] = useState(sigs[0] ?? "");
  const [f0, setF0] = useState("1k"); const [nh, setNh] = useState(9);
  let res: ReturnType<typeof fourier> | null = null; let err = "";
  if (run && sig) {
    const pr = s.project.probes.find((q) => q.name === sig);
    const y = pr ? probeSeries(pr, s.project, s.cn, run) : run.signals[sig];
    if (y) { const f = parseValue(f0); if (f > 0) res = fourier(run.x, y, f, nh); else err = "invalid f0"; }
  }
  return (
    <Modal title="Fourier Analysis" onClose={close} footer={<><button className="cb-btn" disabled={!res} onClick={() => res && download("fourier.csv", ["harmonic,frequency,magnitude,phase", ...res.rows.map((r) => [r.h, r.f, r.mag, r.phase].join(","))].join("\n"))}>CSV</button><button className="cb-btn" onClick={close}>Close</button></>}>
      {!run ? <div>Run a transient analysis first.</div> : <>
        <F label="Output signal" value={sig} options={sigs.map((x) => [x, x])} onChange={setSig} />
        <F label="Fundamental" unit="Hz" value={f0} onChange={setF0} />
        <F label="Harmonics" value={nh} onChange={(v) => setNh(Math.max(1, Math.min(50, Number(v) || 9)))} />
        {err && <div style={{ color: "var(--cb-err)" }}>{err}</div>}
        {res && <table className="mt-2 w-full font-mono text-[11px]"><thead><tr className="text-left" style={{ color: "var(--cb-muted)" }}><th>H</th><th>Freq</th><th>Magnitude</th><th>Phase</th><th>Norm.</th></tr></thead><tbody>{res.rows.map((r) => <tr key={r.h}><td>{r.h}</td><td>{fmt(r.f, "Hz")}</td><td>{fmt(r.mag, "V")}</td><td>{r.phase.toFixed(1)}°</td><td>{(r.mag / (res!.rows[0].mag || 1)).toFixed(4)}</td></tr>)}</tbody></table>}
        {res && <div className="mt-1 font-mono">DC = {fmt(res.dc, "V")} · THD = {(res.thd * 100).toFixed(3)} %</div>}
      </>}
    </Modal>
  );
}

function SensDialog({ close }: { close: () => void }) {
  const s = useCB(); const [net, setNet] = useState(s.cn.nets.find((n) => n.named && n.name !== "0")?.name ?? "");
  const [rows, setRows] = useState<ReturnType<typeof sensitivity> | null>(null); const [err, setErr] = useState("");
  return (
    <Modal title="DC Sensitivity" onClose={close} footer={<><button className="cb-btn" onClick={close}>Close</button><button className="cb-btn cb-btn-on" onClick={() => { try { setRows(sensitivity(s.project, net)); setErr(""); } catch (e) { setErr((e as Error).message); } }}>Compute</button></>}>
      <F label="Output net" value={net} options={s.cn.nets.filter((n) => n.name !== "0").map((n) => [n.name, n.name])} onChange={setNet} />
      {err && <div style={{ color: "var(--cb-err)" }}>{err}</div>}
      {rows && <table className="mt-2 w-full font-mono text-[11px]"><thead><tr className="text-left" style={{ color: "var(--cb-muted)" }}><th>Parameter</th><th>Value</th><th>∂V/∂p</th><th>Normalized (%/%)</th></tr></thead><tbody>{rows.map((r) => <tr key={r.ref}><td>{r.ref}</td><td>{fmt(r.value)}</td><td>{r.sens.toExponential(3)}</td><td>{r.normalized.toFixed(4)}</td></tr>)}</tbody></table>}
    </Modal>
  );
}

function OpenDialog({ close }: { close: () => void }) {
  const s = useCB();
  const [list, setList] = useState<store.ProjectMeta[] | null>(null);
  const [versions, setVersions] = useState<{ pid: number; list: store.VersionMeta[] } | null>(null);
  const [mode, setMode] = useState<"local" | "remote">("remote");
  const load = () => store.listProjects().then(setList).catch(() => setList([]));
  useEffect(() => { store.detectMode().then((m) => setMode(m)).then(load).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, []);
  return (
    <Modal title="Open Project" w={700} onClose={close} footer={<><label className="cb-btn cursor-pointer">Import .json file…<input type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { importJSONFile(f); close(); } }} /></label><button className="cb-btn" onClick={close}>Cancel</button></>}>
      <div className="cb-section">Saved projects — {mode === "local" ? "browser storage (localStorage)" : "PostgreSQL database"}</div>
      {!list ? <div>Loading…</div> : !list.length ? <div style={{ color: "var(--cb-muted)" }}>No saved projects yet.</div> : list.map((p) => (
        <div key={p.id} className="cb-row">
          <span className="font-medium">{p.name}</span><span className="font-mono text-[10px]" style={{ color: "var(--cb-muted)" }}>#{p.id} · {new Date(p.updatedAt).toLocaleString()}</span>
          <span className="flex-1" />
          <button className="cb-btn h-5" onClick={async () => { if (s.dirty && !window.confirm("Discard unsaved changes?")) return; await openProject(p.id); close(); }}>Open</button>
          <button className="cb-btn h-5" onClick={async () => { const r = await store.getProject(p.id); setVersions({ pid: p.id, list: r?.versions ?? [] }); }}>Versions</button>
          <button className="cb-btn h-5" onClick={async () => { if (window.confirm(`Delete "${p.name}"?`)) { await store.deleteProject(p.id); load(); } }}>Delete</button>
        </div>
      ))}
      {versions && <div className="mt-2 rounded border p-2" style={{ borderColor: "var(--cb-border)" }}><div className="cb-section">Version history #{versions.pid}</div>{versions.list.length ? versions.list.map((v) => <div key={v.id} className="cb-row"><span className="font-mono">{new Date(v.createdAt).toLocaleString()}</span><span style={{ color: "var(--cb-muted)" }}>{v.note}</span><button className="cb-btn ml-auto h-5" onClick={async () => { const d = await store.getVersion(versions.pid, v.id); if (!d) return; s.loadProject(d, versions.pid); s.set({ dirty: true }); s.logMsg("info", "Restored version from " + new Date(v.createdAt).toLocaleString() + " — save to keep"); close(); }}>Restore</button></div>) : <div style={{ color: "var(--cb-muted)" }}>No previous versions.</div>}</div>}
      <div className="cb-section mt-3">Example projects</div>
      {EXAMPLES.map((e) => <div key={e.key} className="cb-row"><span>{e.name}</span><button className="cb-btn ml-auto h-5" onClick={() => { if (s.dirty && !window.confirm("Discard unsaved changes?")) return; s.loadProject(e.make()); close(); setTimeout(() => import("@/lib/cb/actions").then((a) => a.zoomTo()), 50); }}>Open</button></div>)}
    </Modal>
  );
}

function Report({ kind, close }: { kind: string; close: () => void }) {
  const s = useCB(); const p = s.project;
  let head: string[] = [], rows: (string | number)[][] = [], title = "";
  if (kind === "bom") { title = "Bill of Materials"; head = ["Qty", "References", "Part", "Value", "Footprint", "Manufacturer", "Part No."]; rows = bom().map((g) => [g.refs.length, g.refs.join(" "), LIBMAP[g.type]?.name ?? g.type, g.value, g.footprint, g.mfr, g.pn]); }
  if (kind === "complist") { title = "Component List"; head = ["Ref", "Part", "Value", "Sheet", "X (mil)", "Y (mil)", "Rot", "Pins", "Model"]; rows = p.components.map((c) => [c.ref, LIBMAP[c.type]?.name ?? c.type, LIBMAP[c.type]?.valueKey ? c.props[LIBMAP[c.type].valueKey!] : "", p.sheets.find((x) => x.id === c.sheet)?.name ?? "", c.x * 10, c.y * 10, c.rot * 90, pinCount(c), LIBMAP[c.type]?.model || "—"]); }
  if (kind === "netrep") { title = "Net List"; head = ["Net", "Type", "Pins"]; rows = s.cn.nets.map((n) => [n.name, n.isGround ? "ground" : n.isPower ? "power" : "signal", n.pins.map((x) => `${x.ref}.${x.name}`).join(" ")]); }
  if (kind === "simrep") { title = "Simulation Report"; head = ["Run", "Analysis", "Parameter", "Status", "Points", "Time"]; rows = p.runs.map((r) => [r.label, r.analysis, r.param ? JSON.stringify(r.param) : "", r.status, r.x.length, new Date(r.timestamp).toLocaleString()]); }
  if (kind === "measrep") {
    title = "Measurement Report"; head = ["Run", "Signal", "Min", "Max", "P-P", "Avg", "RMS", "Freq"];
    for (const r of currentRunSet(s)) for (const q of p.probes) { const y = probeSeries(q, p, s.cn, r); if (!y) continue; const m = measure(r.x, y); rows.push([r.label, q.name, fmt(m.min), fmt(m.max), fmt(m.pp), fmt(m.avg), fmt(m.rms), r.analysis === "tran" ? fmt(m.freq, "Hz") : "—"]); }
  }
  return (
    <Modal title={title} w={820} onClose={close} footer={<><button className="cb-btn" onClick={() => download(`${kind}.csv`, [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv")}>Export CSV</button><button className="cb-btn" onClick={close}>Close</button></>}>
      <table className="w-full font-mono text-[11px]"><thead><tr className="text-left" style={{ color: "var(--cb-muted)" }}>{head.map((h) => <th key={h} className="pr-2">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t" style={{ borderColor: "var(--cb-border)" }}>{r.map((c, j) => <td key={j} className="pr-2 align-top">{c}</td>)}</tr>)}</tbody></table>
      {!rows.length && <div style={{ color: "var(--cb-muted)" }}>Nothing to report.</div>}
    </Modal>
  );
}

function Palette({ close, commands }: { close: () => void; commands: CommandDef[] }) {
  const [q, setQ] = useState(""); const [i, setI] = useState(0);
  const list = commands.filter((c) => !c.disabled && (c.group + " " + c.label).toLowerCase().includes(q.toLowerCase())).slice(0, 14);
  return (
    <Modal title="Command Palette" w={520} onClose={close}>
      <input autoFocus className="cb-input mb-2 w-full" placeholder="Type a command…" value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={(e) => { if (e.key === "ArrowDown") setI(Math.min(i + 1, list.length - 1)); if (e.key === "ArrowUp") setI(Math.max(0, i - 1)); if (e.key === "Enter" && list[i]) { close(); list[i].run(); } }} />
      {list.map((c, k) => <div key={c.id} className={"cb-row " + (k === i ? "cb-row-on" : "")} onClick={() => { close(); c.run(); }}><span style={{ color: "var(--cb-muted)" }}>{c.group}</span><span>{c.label}</span><span className="ml-auto font-mono text-[10px]" style={{ color: "var(--cb-muted)" }}>{c.key}</span></div>)}
    </Modal>
  );
}

function FindDialog({ close }: { close: () => void }) {
  const s = useCB(); const [q, setQ] = useState("");
  const hits = q ? [...s.project.components.filter((c) => (c.ref + " " + Object.values(c.props).join(" ")).toLowerCase().includes(q.toLowerCase())).map((c) => ({ id: c.id, label: `${c.ref} · ${LIBMAP[c.type]?.name}`, x: (compBBox(c)[0] + compBBox(c)[2]) / 2, y: (compBBox(c)[1] + compBBox(c)[3]) / 2, sheet: c.sheet })), ...s.project.labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).map((l) => ({ id: l.id, label: `label ${l.name}`, x: l.x, y: l.y, sheet: l.sheet }))] : [];
  return (
    <Modal title="Find" w={460} onClose={close}>
      <input autoFocus className="cb-input mb-2 w-full" placeholder="Reference, value or net label…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((h) => <div key={h.id} className="cb-row" onClick={() => { s.select([h.id]); focusOn(h.x, h.y, h.sheet); close(); }}>{h.label}</div>)}
    </Modal>
  );
}

function VarsDialog({ close }: { close: () => void }) {
  const s = useCB(); const v = s.project.variables;
  return (
    <Modal title="Design Variables" w={460} onClose={close} footer={<><button className="cb-btn" onClick={() => { const n = window.prompt("Variable name (letters/digits)"); if (n && /^[A-Za-z_]\w*$/.test(n)) s.commit("Add variable", (p) => { p.variables[n] = "1k"; }); }}>+ Variable</button><button className="cb-btn" onClick={close}>Close</button></>}>
      <div className="mb-2" style={{ color: "var(--cb-muted)" }}>Use a variable name (e.g. RLOAD or {"{RLOAD}"}) as a component value. Variables can be swept in the Parameter Sweep.</div>
      {Object.entries(v).map(([k, val]) => <div key={k} className="flex items-center gap-2 py-[2px]"><span className="w-28 font-mono">{k}</span><input className="cb-input flex-1 font-mono" defaultValue={val} onBlur={(e) => s.commit("Edit variable", (p) => { p.variables[k] = e.target.value; })} /><button className="cb-btn h-5" onClick={() => s.commit("Delete variable", (p) => { delete p.variables[k]; })}>Delete</button></div>)}
    </Modal>
  );
}

function ModelManager({ close }: { close: () => void }) {
  const s = useCB();
  const comps = s.project.components.filter((c) => LIBMAP[c.type]?.model && !LIBMAP[c.type].instrument);
  return (
    <Modal title="Model Manager" w={760} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}>
      <table className="w-full font-mono text-[11px]"><thead><tr className="text-left" style={{ color: "var(--cb-muted)" }}><th>Ref</th><th>Model type</th><th>Model name</th><th>Parameters</th><th>Status</th></tr></thead>
        <tbody>{comps.map((c) => { const d = LIBMAP[c.type]; const sp = d.props.filter((x) => x.group === "sim"); return <tr key={c.id} className="cursor-pointer border-t hover:bg-[var(--cb-hover)]" style={{ borderColor: "var(--cb-border)" }} onClick={() => { s.select([c.id]); close(); }}><td>{c.ref}</td><td>{d.model}</td><td>{c.props.modelName ?? "—"}</td><td>{sp.map((x) => `${x.key}=${c.props[x.key]}`).join(" ")}</td><td style={{ color: "var(--cb-ok)" }}>built-in ✓</td></tr>; })}</tbody></table>
      <div className="mt-2" style={{ color: "var(--cb-muted)" }}>All models are native CircuitBench engine models. Click a row to edit parameters in the Inspector.</div>
    </Modal>
  );
}

function TestsDialog({ close }: { close: () => void }) {
  const [res, setRes] = useState<TestResult[] | null>(null);
  useEffect(() => { const t = setTimeout(() => setRes(runTests()), 30); return () => clearTimeout(t); }, []);
  return (
    <Modal title="Regression Self-Tests" w={720} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}>
      {!res ? <div>Running…</div> : <>{res.map((t) => <div key={t.name} className="flex gap-2 py-[1px] font-mono text-[11px]"><span style={{ color: t.ok ? "var(--cb-ok)" : "var(--cb-err)" }}>{t.ok ? "PASS" : "FAIL"}</span><span>{t.name}</span><span className="ml-auto truncate" style={{ color: "var(--cb-muted)" }}>{t.detail}</span></div>)}<div className="mt-2 font-semibold">{res.filter((t) => t.ok).length}/{res.length} passed</div></>}
    </Modal>
  );
}

export function Dialogs({ commands }: { commands: CommandDef[] }) {
  const s = useCB();
  const close = () => s.set({ dialog: null });
  switch (s.dialog) {
    case "components": return <Modal title="Component Browser" w={860} onClose={close}><div style={{ height: 460 }}><PartBrowser onPick={close} /></div></Modal>;
    case "analysis": return <AnalysisDialog close={close} />;
    case "param": return <ParamDialog close={close} mode="param" />;
    case "temp": return <ParamDialog close={close} mode="temp" />;
    case "mc": return <ParamDialog close={close} mode="mc" />;
    case "fourier": return <FourierDialog close={close} />;
    case "sens": return <SensDialog close={close} />;
    case "open": return <OpenDialog close={close} />;
    case "palette": return <Palette close={close} commands={commands} />;
    case "find": return <FindDialog close={close} />;
    case "vars": return <VarsDialog close={close} />;
    case "models": return <ModelManager close={close} />;
    case "tests": return <TestsDialog close={close} />;
    case "bom": case "complist": case "netrep": case "simrep": case "measrep": return <Report kind={s.dialog} close={close} />;
    case "netlist": {
      const txt = exportNetlist(s.project);
      return <Modal title="Netlist Viewer" w={720} onClose={close} footer={<><button className="cb-btn" onClick={() => navigator.clipboard?.writeText(txt)}>Copy</button><button className="cb-btn" onClick={() => download(`${s.project.meta.name}.cir`, txt)}>Save .cir</button><button className="cb-btn" onClick={close}>Close</button></>}><pre className="font-mono text-[11px]">{txt}</pre></Modal>;
    }
    case "erc": return (
      <Modal title="Electrical Rules Check" w={640} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}>
        <div className="mb-2 font-semibold">{s.diags.filter((d) => d.severity === "error").length} error(s), {s.diags.filter((d) => d.severity === "warning").length} warning(s)</div>
        {s.diags.map((d) => <div key={d.id} className="font-mono text-[11px]" style={{ color: d.severity === "error" ? "var(--cb-err)" : "var(--cb-warn)" }}>{d.code}: {d.message}</div>)}
        {!s.diags.length && <div style={{ color: "var(--cb-ok)" }}>✓ Schematic passes all checks.</div>}
      </Modal>
    );
    case "prefs": {
      const L = s.project.layout;
      return (
        <Modal title="Preferences" w={440} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}>
          <F label="Snap grid" value={L.snap} options={[["1", "10 mil"], ["5", "50 mil"], ["10", "100 mil"]]} onChange={(v) => s.commit("Snap grid", (p) => { p.layout.snap = Number(v); })} />
          <F label="Theme" value={L.dark ? "dark" : "light"} options={[["light", "Light"], ["dark", "Dark"]]} onChange={(v) => s.commit("Theme", (p) => { p.layout.dark = v === "dark"; })} />
          <div className="mt-2 font-mono text-[11px]">Project storage: {store.mode === "local" ? "browser (localStorage)" : "PostgreSQL database"}{store.mode === "local" && localUsage() ? ` · ${Math.round(localUsage()!.used / 1024)} kB used (typical quota ~5 MB)` : ""}</div>
          <div className="mt-2" style={{ color: "var(--cb-muted)" }}>Autosave to local storage runs every few seconds for crash recovery. {store.mode === "local" ? "Projects are stored in this browser only — use File ▸ Export Project File (.json) to move a project to another machine." : "Each save keeps the previous state as a restorable version."}</div>
        </Modal>
      );
    }
    case "shortcuts": return (
      <Modal title="Keyboard Shortcuts" w={520} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}>
        <table className="w-full text-[12px]"><tbody>{[["W", "Wire mode"], ["B", "Bus mode"], ["L", "Net label"], ["P", "Place component (browser)"], ["G", "Ground"], ["R / Shift+R", "Rotate CW / CCW"], ["M", "Mirror"], ["E", "Properties (Inspector)"], ["Del / Backspace", "Delete"], ["Esc", "Cancel / select tool"], ["/", "Toggle wire routing H→V / V→H"], ["Ctrl+S", "Save"], ["Ctrl+Z / Ctrl+Y", "Undo / Redo"], ["Ctrl+C / X / V / D", "Copy / Cut / Paste / Duplicate"], ["Ctrl+A", "Select all"], ["Ctrl+F", "Find"], ["Ctrl+K", "Command palette"], ["F5 / F6 / Shift+F5", "Run / Pause / Stop"], ["+ / − / F", "Zoom in / out / fit"], ["Wheel", "Zoom at cursor"], ["Middle drag / Space+drag", "Pan"], ["Double-click", "Properties / open instrument"]].map(([k, d]) => <tr key={k}><td className="pr-4 font-mono">{k}</td><td>{d}</td></tr>)}</tbody></table>
      </Modal>
    );
    case "about": return <Modal title="About CircuitBench" w={440} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}><div className="font-semibold">CircuitBench 1.0</div><div className="mt-1" style={{ color: "var(--cb-muted)" }}>Schematic capture, native MNA circuit simulation (Newton–Raphson, backward-Euler transient, complex AC), virtual instruments and grapher. Project file format schemaVersion 2.<br /><br />Built with Next.js, React, Zustand, Drizzle ORM and PostgreSQL. All symbols and icons are original.</div></Modal>;
    case "docs": return (
      <Modal title="Documentation" w={720} onClose={close} footer={<button className="cb-btn" onClick={close}>Close</button>}>
        <div className="space-y-2 leading-relaxed">
          <p><b>Workflow.</b> Place parts from the Components tab or Place ▸ Component (P). Press W to draw wires: click to start, click to add corners (orthogonal, toggle with /), finishing automatically on a pin/wire; double-click or Esc ends. Place a Ground (G). Pins connect only at exact coordinates — wire ends, pins, and wire T-junctions; crossings without a junction dot do not connect.</p>
          <p><b>Simulation.</b> Simulate ▸ Run (F5) runs the active analysis from Simulation Settings. Before each run the connectivity resolver and ERC validate the schematic; errors (missing ground, unconnected pins, invalid values, duplicate references, unknown models, driver conflicts) block the run and are listed in Problems with canvas markers.</p>
          <p><b>Probes.</b> Voltage probe: click a net. Differential: click + net then − net. Current/Power probe: click a component (arrow shows positive direction pin 1 → pin 2). Probes appear in the Grapher, the Probe manager and can be routed to scope channels.</p>
          <p><b>Instruments.</b> Place from the Instruments category and double-click to open. Scope channels measure against ground; the Function Generator is a real source; the DMM loads the circuit as a real meter would (10 MΩ, 0 Ω shunt, 1 mA ohm source); the Bode plotter runs its own AC analysis.</p>
          <p><b>Sweeps.</b> Analyze ▸ Parameter Sweep varies a component property or design variable (linear, log, list, nested). Each run is stored and overlaid in the Grapher with the parameter in the legend.</p>
          <p><b>Files.</b> File ▸ Save stores the project (JSON, schemaVersion 2) in PostgreSQL; every save keeps the previous state as a version. Autosave to local storage provides crash recovery.</p>
        </div>
      </Modal>
    );
  }
  return null;
}
