import { Circuit } from "./engine";
import { resolve, runERC, type Connectivity, type Diagnostic } from "./connectivity";
import type { Project, SavedRun, TranSettings, AcSettings, DcSettings, SweepDim } from "./types";
import { uid } from "./types";
import { parseValue, fmt } from "./units";
import { LIBMAP } from "./library";

export class SimError extends Error {
  constructor(msg: string, public diags: Diagnostic[] = []) { super(msg); }
}

export function prepare(p: Project): { cn: Connectivity; diags: Diagnostic[] } {
  const cn = resolve(p);
  const diags = runERC(p, cn);
  return { cn, diags };
}
function assertValid(p: Project) {
  const { cn, diags } = prepare(p);
  const errs = diags.filter((d) => d.severity === "error");
  if (errs.length) throw new SimError(`Validation failed: ${errs.length} error(s). ${errs[0].message}`, diags);
  return cn;
}

function mkRun(label: string, analysis: string, xLabel: string, x: number[], signals: Record<string, number[]>, status = "completed", param?: Record<string, number>): SavedRun {
  return { id: uid("run"), label, analysis, xLabel, x, signals, status, timestamp: Date.now(), param };
}

// ---------------- operating point ----------------
export function operatingPoint(p: Project, temp?: number): SavedRun {
  const cn = assertValid(p);
  const c = new Circuit(p, cn, { temp });
  const r = c.op(0);
  const sig: Record<string, number[]> = {};
  c.sample(r.x, sig);
  return mkRun("Operating Point", "op", "", [0], sig, r.ok ? "completed" : "convergence warning");
}

// ---------------- transient ----------------
function fastestPeriod(p: Project): number {
  let per = Infinity;
  for (const c of p.components) {
    const def = LIBMAP[c.type]; if (!def || c.enabled === false) continue;
    const f = parseValue(c.props.freq, p.variables);
    if (!isNaN(f) && f > 0 && (def.model === "V" || def.model === "FGEN" || def.model === "WGEN")) per = Math.min(per, 1 / f);
    if (c.props.wave === "pulse") { const pr = parseValue(c.props.period, p.variables); const rt = parseValue(c.props.rise, p.variables); if (pr > 0) per = Math.min(per, pr); if (rt > 0) per = Math.min(per, rt * 40); }
  }
  return per;
}
export function tranStep(p: Project, s: TranSettings) {
  let h = s.tmax > 0 ? s.tmax : s.tstep > 0 ? s.tstep : s.tstop / 2000;
  const per = fastestPeriod(p);
  if (isFinite(per) && s.tmax <= 0) h = Math.min(h, per / 60);
  return Math.max(h, s.tstop / 2e5);
}

export interface TranProgress { t: number; progress: number; run: SavedRun }

export function* transient(p: Project, s: TranSettings, opts: { temp?: number; infinite?: boolean; maxPoints?: number; label?: string; param?: Record<string, number> } = {}): Generator<TranProgress, SavedRun> {
  const cn = assertValid(p);
  const c = new Circuit(p, cn, { temp: opts.temp });
  let warn = false;
  let x: Float64Array;
  if (s.uic) x = new Float64Array(c.size);
  else { const r = c.op(0); x = r.x; if (!r.ok) warn = true; }
  for (const e of c.elems) e.init?.(x, s.uic);
  const h0 = tranStep(p, s);
  const run = mkRun(opts.label ?? "Transient", "tran", "Time (s)", [], {}, "running", opts.param);
  const rec = (t: number, xx: Float64Array) => { if (t + 1e-15 >= s.tstart) { run.x.push(t); c.sample(xx, run.signals); } };
  rec(0, x);
  let t = 0, steps = 0;
  const maxP = opts.maxPoints ?? 40000;
  while (opts.infinite || t < s.tstop - h0 * 1e-6) {
    const h = opts.infinite ? h0 : Math.min(h0, s.tstop - t);
    let r = c.newton("tran", x, t + h, h, 1, 60);
    if (!r.ok) {
      // sub-stepping fallback
      let sub = 4, xs = x, ok = false;
      while (sub <= 64 && !ok) {
        xs = x; ok = true;
        const hh = h / sub;
        const saved = xs;
        for (let k = 1; k <= sub; k++) { const rr = c.newton("tran", xs, t + hh * k, hh, 1, 80); xs = rr.x; if (!rr.ok) { ok = false; break; } if (k < sub) for (const e of c.elems) if (!c.digital.includes(e)) e.accept?.(xs, t + hh * k); }
        if (!ok) { xs = saved; sub *= 4; }
      }
      if (!ok) warn = true;
      r = { x: xs, ok, iters: 0 };
    }
    x = r.x;
    t += h;
    for (const e of c.elems) e.accept?.(x, t);
    rec(t, x);
    if (opts.infinite && run.x.length > maxP) { const cut = run.x.length - maxP; run.x.splice(0, cut); for (const k in run.signals) run.signals[k].splice(0, cut); }
    if (++steps % 250 === 0) yield { t, progress: opts.infinite ? 0 : t / s.tstop, run };
  }
  run.status = warn ? "convergence warning" : "completed";
  return run;
}
export function runTransient(p: Project, s: TranSettings, opts: Parameters<typeof transient>[2] = {}): SavedRun {
  const g = transient(p, s, opts);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

// ---------------- AC ----------------
export function acFrequencies(s: AcSettings): number[] {
  const out: number[] = [];
  const f1 = Math.max(s.fstart, 1e-6), f2 = Math.max(s.fstop, f1);
  if (s.scale === "lin") { const n = Math.max(2, s.points); for (let i = 0; i < n; i++) out.push(f1 + ((f2 - f1) * i) / (n - 1)); }
  else {
    const base = s.scale === "dec" ? 10 : 2;
    const n = Math.max(1, Math.ceil((Math.log(f2 / f1) / Math.log(base)) * s.points));
    for (let i = 0; i <= n; i++) out.push(f1 * Math.pow(f2 / f1, i / n));
  }
  return out;
}
export function runAC(p: Project, s: AcSettings, opts: { temp?: number; label?: string; param?: Record<string, number> } = {}): SavedRun {
  let q = p;
  if (s.source) {
    // only the selected input source gets AC magnitude 1, others 0
    q = { ...p, components: p.components.map((c) => { const d = LIBMAP[c.type]; if (!d || !(d.model === "V" || d.model === "I" || d.model === "FGEN")) return c; return { ...c, props: { ...c.props, ac: c.ref === s.source ? (c.props.ac && parseValue(c.props.ac) !== 0 ? c.props.ac : "1") : "0" } }; }) };
  }
  const cn = assertValid(q);
  const c = new Circuit(q, cn, { temp: opts.temp });
  const op = c.op(0);
  const f = acFrequencies(s);
  return mkRun(opts.label ?? "AC Analysis", "ac", "Frequency (Hz)", f, c.ac(f, op.x), op.ok ? "completed" : "convergence warning", opts.param);
}

// ---------------- DC sweep ----------------
function range(a: number, b: number, st: number) {
  const out: number[] = [];
  if (!st || !isFinite(st)) return [a, b];
  const n = Math.min(Math.floor(Math.abs((b - a) / st) + 1e-9), 100000);
  for (let i = 0; i <= n; i++) out.push(a + Math.sign(b - a || 1) * Math.abs(st) * i);
  return out;
}
export function runDC(p: Project, s: DcSettings, opts: { temp?: number; label?: string; param?: Record<string, number>; ivActive?: string } = {}): SavedRun[] {
  const cn = assertValid(p);
  const outer = s.source2 ? range(s.start2 ?? 0, s.stop2 ?? 0, s.step2 ?? 1) : [NaN];
  const runs: SavedRun[] = [];
  for (const v2 of outer) {
    const c = new Circuit(p, cn, { temp: opts.temp, ivActive: opts.ivActive });
    const src = c.elems.find((e) => e.isSource === s.source);
    if (!src?.setDC) throw new SimError(`DC sweep source "${s.source}" not found (select a V/I source)`);
    if (s.source2) { const s2 = c.elems.find((e) => e.isSource === s.source2); if (!s2?.setDC) throw new SimError(`Second sweep source "${s.source2}" not found`); s2.setDC(v2); }
    const xs = range(s.start, s.stop, s.step);
    const sig: Record<string, number[]> = {};
    let ok = true;
    let x: Float64Array | null = null;
    for (const v of xs) {
      src.setDC(v);
      const r: { x: Float64Array; ok: boolean } = x ? c.newton("dc", x, 0, 1) : c.op(0);
      const rr: { x: Float64Array; ok: boolean } = r.ok ? r : c.op(0);
      if (!rr.ok) ok = false;
      x = rr.x; c.sample(rr.x, sig);
    }
    const lab = (opts.label ?? `DC Sweep ${s.source}`) + (s.source2 ? ` ${s.source2}=${fmt(v2)}` : "");
    runs.push(mkRun(lab, "dc", `${s.source} (V/A)`, xs, sig, ok ? "completed" : "convergence warning", s.source2 ? { ...(opts.param ?? {}), [s.source2]: v2 } : opts.param));
  }
  return runs;
}

// ---------------- parameter sweep ----------------
export function sweepValues(d: SweepDim): number[] {
  if (d.mode === "list") return d.list.split(/[,;\s]+/).filter(Boolean).map((s) => parseValue(s)).filter((v) => !isNaN(v));
  const n = Math.max(1, Math.round(d.points));
  if (n === 1) return [d.start];
  if (d.mode === "log") { const a = Math.max(d.start, 1e-30), b = Math.max(d.stop, 1e-30); return Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1))); }
  return Array.from({ length: n }, (_, i) => d.start + ((d.stop - d.start) * i) / (n - 1));
}
export function applyOverride(p: Project, target: string, value: number): Project {
  if (target.startsWith("var:")) return { ...p, variables: { ...p.variables, [target.slice(4)]: String(value) } };
  const [ref, key] = target.split(".");
  let found = false;
  const comps = p.components.map((c) => { if (c.ref !== ref) return c; found = true; return { ...c, props: { ...c.props, [key || "value"]: String(value) } }; });
  if (!found) throw new SimError(`Sweep target ${target} not found`);
  return { ...p, components: comps };
}
export function sweepCombos(dims: SweepDim[]): Record<string, number>[] {
  let combos: Record<string, number>[] = [{}];
  for (const d of dims.filter((d) => d.target)) { const vals = sweepValues(d); combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [d.target]: v }))); }
  return combos;
}
export function paramLabel(param: Record<string, number>) {
  return Object.entries(param).map(([k, v]) => `${k.replace(/^var:/, "")}=${fmt(v)}`).join(", ");
}
export function runSingle(p: Project, analysis: "tran" | "ac" | "dc" | "op", opts: { temp?: number; label?: string; param?: Record<string, number> } = {}): SavedRun[] {
  if (analysis === "tran") return [runTransient(p, p.sim.tran, opts)];
  if (analysis === "ac") return [runAC(p, p.sim.ac, opts)];
  if (analysis === "dc") return runDC(p, p.sim.dc, opts);
  const r = operatingPoint(p, opts.temp); r.label = opts.label ?? r.label; r.param = opts.param; return [r];
}
export function runParamSweep(p: Project): SavedRun[] {
  const combos = sweepCombos(p.sim.param.dims);
  if (!combos.length || !Object.keys(combos[0]).length) throw new SimError("Parameter sweep: no sweep parameter selected");
  const out: SavedRun[] = [];
  for (const combo of combos) {
    let q = p;
    for (const [k, v] of Object.entries(combo)) q = applyOverride(q, k, v);
    out.push(...runSingle(q, p.sim.param.analysis, { label: paramLabel(combo), param: combo }));
  }
  return out;
}
export function runTempSweep(p: Project): SavedRun[] {
  const temps = p.sim.tempList.split(/[,;\s]+/).map(Number).filter((v) => !isNaN(v));
  return temps.flatMap((T) => runSingle(p, p.sim.param.analysis, { temp: T, label: `T=${T}°C`, param: { temp: T } }));
}
export function runMonteCarlo(p: Project, n: number, analysis: "tran" | "ac" | "dc" | "op"): SavedRun[] {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out: SavedRun[] = [];
  for (let i = 0; i < n; i++) {
    const q = { ...p, components: p.components.map((c) => { const d = LIBMAP[c.type]; if (!d || !["R", "C", "L"].includes(d.model)) return c; const v = parseValue(c.props.value, p.variables); const tol = (parseValue(c.props.tol) || 0) / 100; return { ...c, props: { ...c.props, value: String(v * (1 + tol * (2 * rnd() - 1))) } }; }) };
    out.push(...runSingle(q, analysis, { label: `MC #${i + 1}`, param: { run: i + 1 } }));
  }
  return out;
}
export function sensitivity(p: Project, net: string): { ref: string; value: number; sens: number; normalized: number }[] {
  const base = operatingPoint(p).signals[`V(${net})`]?.[0];
  if (base == null) throw new SimError(`Net ${net} not found`);
  const out: { ref: string; value: number; sens: number; normalized: number }[] = [];
  for (const c of p.components) {
    const d = LIBMAP[c.type]; if (!d) continue;
    const key = ["R", "C", "L"].includes(d.model) ? "value" : d.key === "VDC" || d.key === "IDC" ? "dc" : null;
    if (!key) continue;
    const v = parseValue(c.props[key], p.variables); if (!v) continue;
    const q = applyOverride(p, `${c.ref}.${key}`, v * 1.001);
    const nv = operatingPoint(q).signals[`V(${net})`][0];
    const s = (nv - base) / (v * 0.001);
    out.push({ ref: `${c.ref}.${key}`, value: v, sens: s, normalized: base ? (s * v) / base : 0 });
  }
  return out;
}

// ---------------- DSP / measurements ----------------
export function resample(x: number[], y: number[], n: number) {
  const t0 = x[0], t1 = x[x.length - 1], dt = (t1 - t0) / (n - 1), out = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt;
    while (j < x.length - 2 && x[j + 1] < t) j++;
    const f = (t - x[j]) / Math.max(x[j + 1] - x[j], 1e-30);
    out[i] = y[j] + (y[j + 1] - y[j]) * Math.min(Math.max(f, 0), 1);
  }
  return { y: out as number[], dt };
}
export function fft(x: number[], y: number[]) {
  let n = 1; while (n < Math.min(y.length, 65536)) n <<= 1;
  const { y: s, dt } = resample(x, y, n);
  const re = s.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)))), im = new Array(n).fill(0);
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
    }
  }
  const f: number[] = [], mag: number[] = [];
  for (let k = 0; k <= n / 2; k++) { f.push(k / (n * dt)); mag.push((Math.hypot(re[k], im[k]) * (k === 0 ? 1 : 2) * 2) / n); }
  return { f, mag };
}
export function fourier(x: number[], y: number[], f0: number, harmonics = 9) {
  const T = 1 / f0, tEnd = x[x.length - 1], tStart = Math.max(x[0], tEnd - T * Math.max(1, Math.floor((tEnd - x[0]) / T)));
  const { y: s, dt } = resample(x.filter((t) => t >= tStart), y.filter((_, i) => x[i] >= tStart), 4096);
  const rows: { h: number; f: number; mag: number; phase: number }[] = [];
  const dc = s.reduce((a, b) => a + b, 0) / s.length;
  for (let h = 1; h <= harmonics; h++) {
    let a = 0, b = 0;
    s.forEach((v, i) => { const w = 2 * Math.PI * h * f0 * i * dt; a += v * Math.cos(w); b += v * Math.sin(w); });
    a = (2 * a) / s.length; b = (2 * b) / s.length;
    rows.push({ h, f: h * f0, mag: Math.hypot(a, b), phase: (Math.atan2(a, b) * 180) / Math.PI });
  }
  const thd = rows.length > 1 ? Math.sqrt(rows.slice(1).reduce((q, r) => q + r.mag ** 2, 0)) / Math.max(rows[0].mag, 1e-30) : 0;
  return { dc, rows, thd };
}

export interface Measures { min: number; max: number; pp: number; avg: number; rms: number; freq: number; period: number; duty: number; rise: number; fall: number }
export function measure(x: number[], y: number[]): Measures {
  const n = y.length;
  if (n < 2) return { min: y[0] ?? NaN, max: y[0] ?? NaN, pp: 0, avg: y[0] ?? NaN, rms: Math.abs(y[0] ?? NaN), freq: NaN, period: NaN, duty: NaN, rise: NaN, fall: NaN };
  let min = Infinity, max = -Infinity, area = 0, sq = 0;
  for (let i = 0; i < n; i++) { min = Math.min(min, y[i]); max = Math.max(max, y[i]); if (i) { const dt = x[i] - x[i - 1]; area += ((y[i] + y[i - 1]) / 2) * dt; sq += ((y[i] ** 2 + y[i - 1] ** 2) / 2) * dt; } }
  const T = x[n - 1] - x[0] || 1;
  const avg = area / T, rms = Math.sqrt(sq / T), mid = (min + max) / 2;
  const rising: number[] = [], falling: number[] = [];
  const cross = (i: number, lvl: number) => x[i - 1] + ((lvl - y[i - 1]) / (y[i] - y[i - 1])) * (x[i] - x[i - 1]);
  if (max - min > 1e-9) for (let i = 1; i < n; i++) { if (y[i - 1] < mid && y[i] >= mid) rising.push(cross(i, mid)); if (y[i - 1] >= mid && y[i] < mid) falling.push(cross(i, mid)); }
  const period = rising.length >= 2 ? (rising[rising.length - 1] - rising[0]) / (rising.length - 1) : NaN;
  let duty = NaN;
  if (rising.length >= 2 && falling.length) { const r0 = rising[rising.length - 2]; const f = falling.find((t) => t > r0); if (f != null) duty = ((f - r0) / period) * 100; }
  const edgeTime = (dir: 1 | -1) => {
    const lo = min + 0.1 * (max - min), hi = min + 0.9 * (max - min);
    for (let i = 1; i < n; i++) {
      if (dir === 1 && y[i - 1] < lo && y[i] >= lo) { const t0 = cross(i, lo); for (let j = i; j < n; j++) if (y[j - 1] < hi && y[j] >= hi) return cross(j, hi) - t0; }
      if (dir === -1 && y[i - 1] > hi && y[i] <= hi) { const t0 = cross(i, hi); for (let j = i; j < n; j++) if (y[j - 1] > lo && y[j] <= lo) return cross(j, lo) - t0; }
    }
    return NaN;
  };
  return { min, max, pp: max - min, avg, rms, freq: 1 / period, period, duty, rise: edgeTime(1), fall: edgeTime(-1) };
}
export function phaseDiff(x: number[], a: number[], b: number[]) {
  const ra = risingEdges(x, a), rb = risingEdges(x, b);
  if (ra.length < 2 || !rb.length) return NaN;
  const per = ra[1] - ra[0];
  const tb = rb.find((t) => t >= ra[0]) ?? rb[0];
  let ph = ((tb - ra[0]) / per) * 360; ph = ((ph + 180) % 360) - 180; return ph;
}
function risingEdges(x: number[], y: number[]) {
  let min = Infinity, max = -Infinity; for (const v of y) { min = Math.min(min, v); max = Math.max(max, v); }
  const mid = (min + max) / 2, out: number[] = [];
  for (let i = 1; i < y.length; i++) if (y[i - 1] < mid && y[i] >= mid) out.push(x[i - 1] + ((mid - y[i - 1]) / (y[i] - y[i - 1])) * (x[i] - x[i - 1]));
  return out;
}
