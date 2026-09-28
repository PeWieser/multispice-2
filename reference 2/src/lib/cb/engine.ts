// CircuitBench native MNA simulation engine.
// Supports R, C, L, V/I sources (DC, SIN, PULSE, PWL, clock, function generator), diode (Shockley + breakdown),
// BJT (Ebers-Moll), MOSFET (level 1), ideal/rail op amp, comparator, ideal transformer, switch, potentiometer,
// behavioral digital gates / DFF / counter, instrument loads (DMM, wattmeter, IV analyzer).
import { LIBMAP } from "./library";
import type { Connectivity } from "./connectivity";
import { worldPins } from "./connectivity";
import type { Component, Project } from "./types";
import { parseValue } from "./units";

const KB = 1.380649e-23, Q = 1.602176634e-19;
const lexp = (x: number) => (x > 40 ? Math.exp(40) * (1 + x - 40) : Math.exp(x));

export interface StampCtx {
  mode: "dc" | "tran" | "ac";
  x: Float64Array;
  h: number;
  t: number;
  omega: number;
  srcScale: number;
  G(i: number, j: number, v: number): void;
  B(i: number, v: number): void;
  Gc(i: number, j: number, re: number, im: number): void;
  Bc(i: number, re: number, im: number): void;
}

export interface Elem {
  ref: string;
  compId: string;
  nodes: number[];
  pinNames: string[];
  branches: number[];
  nonlinear?: boolean;
  isSource?: string; // ref for DC sweep
  setDC?(v: number): void;
  stamp(c: StampCtx): void;
  stampAC?(c: StampCtx): void;
  current?(x: Float64Array): number; // pin1 -> pin2 through device
  termCurrents?(x: Float64Array): number[];
  init?(x: Float64Array, uic: boolean): void;
  accept?(x: Float64Array, t: number): boolean | void; // returns true if digital state changed
}

// ---------- waveforms ----------
function hashNoise(k: number) {
  const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
export function waveform(p: Record<string, string>, vars: Record<string, string>, fallbackWave = "dc") {
  const n = (k: string, d = 0) => { const v = parseValue(p[k], vars); return isNaN(v) ? d : v; };
  const wave = p.wave || fallbackWave;
  const ampl = n("ampl", 1), f = n("freq", 1000), off = n("offset", 0), ph = (n("phase", 0) * Math.PI) / 180, duty = n("duty", 50) / 100;
  switch (wave) {
    case "sine": return (t: number) => off + ampl * Math.sin(2 * Math.PI * f * t + ph);
    case "square": return (t: number) => { const u = ((t * f + ph / (2 * Math.PI)) % 1 + 1) % 1; return off + (u < duty ? ampl : -ampl); };
    case "triangle": return (t: number) => { const u = ((t * f + ph / (2 * Math.PI)) % 1 + 1) % 1; return off + ampl * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u); };
    case "sawtooth": return (t: number) => { const u = ((t * f + ph / (2 * Math.PI)) % 1 + 1) % 1; return off + ampl * (2 * u - 1); };
    case "noise": return (t: number) => off + ampl * hashNoise(Math.floor(t * f * 20));
    case "clock": { const vdd = n("vdd", 5); return (t: number) => (((t * f) % 1) < duty ? vdd : 0); }
    case "pulse": {
      const v1 = n("v1"), v2 = n("v2", 5), td = n("delay"), tr = Math.max(n("rise", 1e-9), 1e-12), tf = Math.max(n("fall", 1e-9), 1e-12), pw = n("width", 1e-3), per = n("period", 2e-3);
      return (t: number) => {
        if (t < td) return v1;
        let u = t - td; if (per > 0) u = u % per;
        if (u < tr) return v1 + ((v2 - v1) * u) / tr;
        if (u < tr + pw) return v2;
        if (u < tr + pw + tf) return v2 + ((v1 - v2) * (u - tr - pw)) / tf;
        return v1;
      };
    }
    case "pwl": {
      const pts = (p.pwl || "").split(",").map((s) => s.trim().split(/\s+/).map((z) => parseValue(z, vars))).filter((a) => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1]));
      return (t: number) => {
        if (!pts.length) return 0;
        if (t <= pts[0][0]) return pts[0][1];
        for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return v0 + ((v1 - v0) * (t - t0)) / Math.max(t1 - t0, 1e-30); }
        return pts[pts.length - 1][1];
      };
    }
    default: { const dc = p.dc != null ? n("dc") : off; return () => dc; }
  }
}

// ---------- linear solvers ----------
export function solveReal(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const M = A.slice(), x = b.slice();
  for (let k = 0; k < n; k++) {
    let piv = k, mx = Math.abs(M[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(M[i * n + k]); if (v > mx) { mx = v; piv = i; } }
    if (mx < 1e-300) return null;
    if (piv !== k) { for (let j = 0; j < n; j++) { const t = M[k * n + j]; M[k * n + j] = M[piv * n + j]; M[piv * n + j] = t; } const t = x[k]; x[k] = x[piv]; x[piv] = t; }
    const d = M[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k] / d; if (f === 0) continue;
      for (let j = k; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j]; x[i] = s / M[i * n + i]; }
  return x;
}
export function solveComplex(Ar: Float64Array, Ai: Float64Array, br: Float64Array, bi: Float64Array, n: number) {
  const R = Ar.slice(), I = Ai.slice(), xr = br.slice(), xi = bi.slice();
  for (let k = 0; k < n; k++) {
    let piv = k, mx = Math.hypot(R[k * n + k], I[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.hypot(R[i * n + k], I[i * n + k]); if (v > mx) { mx = v; piv = i; } }
    if (mx < 1e-300) return null;
    if (piv !== k) {
      for (let j = 0; j < n; j++) { let t = R[k * n + j]; R[k * n + j] = R[piv * n + j]; R[piv * n + j] = t; t = I[k * n + j]; I[k * n + j] = I[piv * n + j]; I[piv * n + j] = t; }
      let t = xr[k]; xr[k] = xr[piv]; xr[piv] = t; t = xi[k]; xi[k] = xi[piv]; xi[piv] = t;
    }
    const dr = R[k * n + k], di = I[k * n + k], dd = dr * dr + di * di;
    for (let i = k + 1; i < n; i++) {
      const ar = R[i * n + k], ai = I[i * n + k]; if (ar === 0 && ai === 0) continue;
      const fr = (ar * dr + ai * di) / dd, fi = (ai * dr - ar * di) / dd;
      for (let j = k; j < n; j++) { const cr = R[k * n + j], ci = I[k * n + j]; R[i * n + j] -= fr * cr - fi * ci; I[i * n + j] -= fr * ci + fi * cr; }
      xr[i] -= fr * xr[k] - fi * xi[k]; xi[i] -= fr * xi[k] + fi * xr[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sr = xr[i], si = xi[i];
    for (let j = i + 1; j < n; j++) { const ar = R[i * n + j], ai = I[i * n + j]; sr -= ar * xr[j] - ai * xi[j]; si -= ar * xi[j] + ai * xr[j]; }
    const dr = R[i * n + i], di = I[i * n + i], dd = dr * dr + di * di;
    xr[i] = (sr * dr + si * di) / dd; xi[i] = (si * dr - sr * di) / dd;
  }
  return { re: xr, im: xi };
}

// ---------- element factories ----------
const V = (x: Float64Array, i: number) => (i < 0 ? 0 : x[i]);

function resistor(ref: string, compId: string, a: number, b: number, r: number, pins = ["1", "2"]): Elem {
  const g = 1 / Math.max(r, 1e-9);
  return {
    ref, compId, nodes: [a, b], pinNames: pins, branches: [],
    stamp(c) { c.G(a, a, g); c.G(b, b, g); c.G(a, b, -g); c.G(b, a, -g); },
    stampAC(c) { c.Gc(a, a, g, 0); c.Gc(b, b, g, 0); c.Gc(a, b, -g, 0); c.Gc(b, a, -g, 0); },
    current: (x) => (V(x, a) - V(x, b)) * g,
  };
}
function capacitor(ref: string, compId: string, a: number, b: number, C: number, ic: number | null): Elem {
  let v0 = 0;
  let h = 1;
  return {
    ref, compId, nodes: [a, b], pinNames: ["1", "2"], branches: [],
    init(x, uic) { v0 = uic && ic != null ? ic : V(x, a) - V(x, b); },
    stamp(c) {
      if (c.mode === "dc") { const g = 1e-12; c.G(a, a, g); c.G(b, b, g); c.G(a, b, -g); c.G(b, a, -g); return; }
      h = c.h; const g = C / c.h;
      c.G(a, a, g); c.G(b, b, g); c.G(a, b, -g); c.G(b, a, -g); c.B(a, g * v0); c.B(b, -g * v0);
    },
    stampAC(c) { const y = c.omega * C; c.Gc(a, a, 0, y); c.Gc(b, b, 0, y); c.Gc(a, b, 0, -y); c.Gc(b, a, 0, -y); },
    current: (x) => (C / h) * (V(x, a) - V(x, b) - v0),
    accept(x) { v0 = V(x, a) - V(x, b); },
  };
}
function inductor(ref: string, compId: string, a: number, b: number, L: number, k: number, ic: number | null): Elem {
  let i0 = 0;
  return {
    ref, compId, nodes: [a, b], pinNames: ["1", "2"], branches: [k],
    init(x, uic) { i0 = uic && ic != null ? ic : x[k]; },
    stamp(c) {
      c.G(a, k, 1); c.G(b, k, -1); c.G(k, a, 1); c.G(k, b, -1);
      if (c.mode === "tran") { c.G(k, k, -L / c.h); c.B(k, (-L / c.h) * i0); }
    },
    stampAC(c) { c.Gc(a, k, 1, 0); c.Gc(b, k, -1, 0); c.Gc(k, a, 1, 0); c.Gc(k, b, -1, 0); c.Gc(k, k, 0, -c.omega * L); },
    current: (x) => x[k],
    accept(x) { i0 = x[k]; },
  };
}
function vsource(ref: string, compId: string, p: number, n: number, k: number, fn: (t: number) => number, ac: number, pins = ["+", "-"]): Elem {
  let dcOverride: number | null = null;
  return {
    ref, compId, nodes: [p, n], pinNames: pins, branches: [k], isSource: ref,
    setDC(v) { dcOverride = v; },
    stamp(c) { c.G(p, k, 1); c.G(n, k, -1); c.G(k, p, 1); c.G(k, n, -1); c.B(k, (dcOverride ?? fn(c.t)) * c.srcScale); },
    stampAC(c) { c.Gc(p, k, 1, 0); c.Gc(n, k, -1, 0); c.Gc(k, p, 1, 0); c.Gc(k, n, -1, 0); c.Bc(k, ac, 0); },
    current: (x) => x[k], // passive convention: current into + pin
  };
}
function isource(ref: string, compId: string, p: number, n: number, fn: (t: number) => number, ac: number, gout = 0): Elem {
  let dcOverride: number | null = null;
  return {
    ref, compId, nodes: [p, n], pinNames: ["+", "-"], branches: [], isSource: ref,
    setDC(v) { dcOverride = v; },
    stamp(c) { const I = (dcOverride ?? fn(c.t)) * c.srcScale; c.B(p, I); c.B(n, -I); if (gout) { c.G(p, p, gout); c.G(n, n, gout); c.G(p, n, -gout); c.G(n, p, -gout); } },
    stampAC(c) { c.Bc(p, ac, 0); c.Bc(n, -ac, 0); if (gout) { c.Gc(p, p, gout, 0); c.Gc(n, n, gout, 0); c.Gc(p, n, -gout, 0); c.Gc(n, p, -gout, 0); } },
    current: (x) => -(dcOverride ?? 0) + 0 * V(x, p), // placeholder refined below
  };
}

// Generic nonlinear current device: f(v) -> currents INTO device at each terminal.
function nonlinear(ref: string, compId: string, nodes: number[], pins: string[], f: (v: number[]) => number[]): Elem {
  const jac = (x: Float64Array) => {
    const v = nodes.map((nd) => V(x, nd));
    const I0 = f(v);
    const J = nodes.map(() => nodes.map(() => 0));
    for (let j = 0; j < nodes.length; j++) {
      const d = 1e-6 * Math.max(1, Math.abs(v[j]));
      const vp = v.slice(); vp[j] += d; const Ip = f(vp);
      const vm = v.slice(); vm[j] -= d; const Im = f(vm);
      for (let i = 0; i < nodes.length; i++) J[i][j] = (Ip[i] - Im[i]) / (2 * d);
    }
    return { v, I0, J };
  };
  return {
    ref, compId, nodes, pinNames: pins, branches: [], nonlinear: true,
    stamp(c) {
      const { v, I0, J } = jac(c.x);
      for (let i = 0; i < nodes.length; i++) {
        let rhs = -I0[i];
        for (let j = 0; j < nodes.length; j++) { c.G(nodes[i], nodes[j], J[i][j]); rhs += J[i][j] * v[j]; }
        c.B(nodes[i], rhs);
      }
    },
    stampAC(c) { const { J } = jac(c.x); for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) c.Gc(nodes[i], nodes[j], J[i][j], 0); },
    termCurrents: (x) => f(nodes.map((nd) => V(x, nd))),
    current: (x) => f(nodes.map((nd) => V(x, nd)))[0],
  };
}
// Nonlinear VCVS: V(out) = g(v(controls)), branch k.
function vcvs(ref: string, compId: string, out: number, ctrl: number[], pins: string[], k: number, g: (v: number[]) => number): Elem {
  const lin = (x: Float64Array) => {
    const v = ctrl.map((nd) => V(x, nd)); const g0 = g(v);
    const d = ctrl.map((_, j) => { const h = 1e-7 * Math.max(1, Math.abs(v[j])); const vp = v.slice(); vp[j] += h; const vm = v.slice(); vm[j] -= h; return (g(vp) - g(vm)) / (2 * h); });
    return { v, g0, d };
  };
  return {
    ref, compId, nodes: [...ctrl, out], pinNames: pins, branches: [k], nonlinear: true,
    stamp(c) {
      const { v, g0, d } = lin(c.x);
      c.G(out, k, 1); c.G(k, out, 1);
      let rhs = g0;
      ctrl.forEach((nd, j) => { c.G(k, nd, -d[j]); rhs -= d[j] * v[j]; });
      c.B(k, rhs);
    },
    stampAC(c) { const { d } = lin(c.x); c.Gc(out, k, 1, 0); c.Gc(k, out, 1, 0); ctrl.forEach((nd, j) => c.Gc(k, nd, -d[j], 0)); },
    current: (x) => x[k],
  };
}
// Digital output driver (Norton): state-driven
function driver(ref: string, compId: string, out: number, getV: () => number, pin: string): Elem {
  const g = 1 / 50;
  return {
    ref, compId, nodes: [out], pinNames: [pin], branches: [],
    stamp(c) { c.G(out, out, g); c.B(out, getV() * g * c.srcScale); },
    stampAC(c) { c.Gc(out, out, g, 0); },
    current: (x) => (V(x, out) - getV()) * g,
  };
}

export interface BuildOptions { temp?: number; ivActive?: string; }

export class Circuit {
  nodeNames: string[] = [];
  nodeIndex: Record<string, number> = {};
  elems: Elem[] = [];
  size = 0;
  nNodes = 0;
  gmin = 1e-12;
  digital: Elem[] = [];
  warnings: string[] = [];
  observers: { ref: string; compId: string; type: string }[] = [];
  constructor(public project: Project, public cn: Connectivity, public opts: BuildOptions = {}) {
    const vars = project.variables || {};
    const T = (opts.temp ?? project.sim.temp) + 273.15, Tn = 300.15;
    const Vt = (KB * T) / Q;
    for (const net of cn.nets) if (net.name !== "0") { this.nodeIndex[net.name] = this.nodeNames.length; this.nodeNames.push(net.name); }
    let extra = 0;
    const newNode = (nm: string) => { const i = this.nodeNames.length; this.nodeNames.push(nm); this.nodeIndex[nm] = i; extra++; return i; };
    const branchQueue: ((base: number) => void)[] = [];
    let nb = 0;
    const br = () => nb++;
    const pending: { make: (bOff: number) => Elem }[] = [];
    const seenPwr = new Set<string>();
    const node = (c: Component, pin: string) => { const nm = this.cn.pinNet[c.id + ":" + pin]; if (!nm || nm === "0") return -1; return this.nodeIndex[nm] ?? -1; };
    for (const c of project.components) {
      const def = LIBMAP[c.type];
      if (!def || !def.model || c.enabled === false) continue;
      const P = (k: string, d = 0) => { const v = parseValue(c.props[k], vars); return isNaN(v) ? d : v; };
      const pins = worldPins(c).map((p) => p.name);
      const nd = pins.map((pn) => node(c, pn));
      const tcf = 1 + (P("tc1") * 1e-6) * (T - Tn);
      switch (def.model) {
        case "R": pending.push({ make: () => resistor(c.ref, c.id, nd[0], nd[1], P("value", 1e3) * tcf) }); break;
        case "POT": {
          const R = P("value", 1e4), pos = Math.min(Math.max(P("pos", 50) / 100, 0.001), 0.999);
          pending.push({ make: () => resistor(c.ref + "a", c.id, nd[0], nd[2], R * pos, ["1", "W"]) });
          pending.push({ make: () => resistor(c.ref + "b", c.id, nd[2], nd[1], R * (1 - pos), ["W", "3"]) });
          break;
        }
        case "SW": pending.push({ make: () => resistor(c.ref, c.id, nd[0], nd[1], c.props.state === "closed" ? P("ron", 1e-3) : P("roff", 1e9)) }); break;
        case "C": { const icv = parseValue(c.props.ic, vars); pending.push({ make: () => capacitor(c.ref, c.id, nd[0], nd[1], P("value", 1e-6) * tcf, isNaN(icv) ? null : icv) }); break; }
        case "L": { const k = br(); const icv = parseValue(c.props.ic, vars); pending.push({ make: (o) => inductor(c.ref, c.id, nd[0], nd[1], P("value", 1e-3), o + k, isNaN(icv) ? null : icv) }); break; }
        case "V": {
          const k = br(); const fn = waveform(c.props, vars, c.props.wave || "dc");
          if (def.key === "CLOCK") pending.push({ make: (o) => vsource(c.ref, c.id, nd[0], -1, o + k, waveform({ ...c.props, wave: "clock" }, vars), 0, ["Y"]) });
          else pending.push({ make: (o) => vsource(c.ref, c.id, nd[0], nd[1], o + k, fn, P("ac")) });
          break;
        }
        case "I": { const fn = waveform(c.props, vars, "dc"); pending.push({ make: () => { const e = isource(c.ref, c.id, nd[0], nd[1], fn, P("ac")); e.current = () => -fn(0); return e; } }); break; }
        case "PWR": {
          const net = c.props.net || c.type; if (seenPwr.has(net)) break; seenPwr.add(net);
          const k = br(); const v = P("voltage", 5);
          pending.push({ make: (o) => vsource(c.ref || net, c.id, nd[0], -1, o + k, () => v, 0, [pins[0]]) }); break;
        }
        case "D": {
          const Is0 = P("is", 1e-14), n = P("n", 1), rs = P("rs", 0), bv = P("bv", 100);
          const Is = Is0 * Math.pow(T / Tn, 3 / n) * Math.exp(((T / Tn - 1) * 1.11) / (n * Vt));
          let a = nd[0];
          if (rs > 0) { const inner = newNode(`${c.ref}#int`); const ext = a; pending.push({ make: () => resistor(c.ref + "#rs", c.id, ext, inner, rs, ["A", "int"]) }); a = inner; }
          const f = (v: number[]) => { const vd = v[0] - v[1]; const i = Is * (lexp(vd / (n * Vt)) - 1) - 1e-3 * lexp(-(bv + vd) / (n * Vt)) + 1e-12 * vd; return [i, -i]; };
          pending.push({ make: () => { const e = nonlinear(c.ref, c.id, [a, nd[1]], ["A", "K"], f); return e; } });
          break;
        }
        case "BJT": {
          const Is = P("is", 1e-15), bf = P("bf", 100), brr = P("br", 1), s = def.key === "PNP" ? -1 : 1;
          const f = (v: number[]) => {
            const vbe = s * (v[0] - v[2]), vbc = s * (v[0] - v[1]);
            const If = Is * (lexp(vbe / Vt) - 1), Ir = Is * (lexp(vbc / Vt) - 1);
            const ic = If - Ir - Ir / brr, ib = If / bf + Ir / brr;
            const gm = 1e-12;
            return [s * ib + gm * (v[0] - v[2]), s * ic + gm * (v[1] - v[2]), -s * (ic + ib) - gm * (v[0] - v[2]) - gm * (v[1] - v[2])];
          };
          pending.push({ make: () => nonlinear(c.ref, c.id, nd, ["B", "C", "E"], f) });
          break;
        }
        case "MOS": {
          const s = def.key === "PMOS" ? -1 : 1, vto = Math.abs(P("vto", 2)), kp = P("kp", 0.1), lam = P("lambda", 0.01);
          const f = (v: number[]) => {
            let vd = s * v[1], vs = s * v[2]; const vg = s * v[0]; let sw = 1;
            if (vd < vs) { [vd, vs] = [vs, vd]; sw = -1; }
            const vgs = vg - vs, vds = vd - vs; let id = 0;
            if (vgs > vto) id = vds < vgs - vto ? kp * ((vgs - vto) * vds - (vds * vds) / 2) * (1 + lam * vds) : (kp / 2) * (vgs - vto) ** 2 * (1 + lam * vds);
            id = s * sw * id + 1e-12 * (v[1] - v[2]);
            return [0, id, -id];
          };
          pending.push({ make: () => nonlinear(c.ref, c.id, nd, ["G", "D", "S"], f) });
          break;
        }
        case "OPAMP": {
          const A = P("gain", 1e5); const k = br();
          if (def.key === "OPAMP5") {
            pending.push({ make: (o) => vcvs(c.ref, c.id, nd[2], [nd[0], nd[1], nd[3], nd[4]], ["IN-", "IN+", "V+", "V-", "OUT"], o + k, (v) => {
              const mid = (v[2] + v[3]) / 2, half = (v[2] - v[3]) / 2;
              if (half < 0.01) return mid;
              return mid + half * Math.tanh((A * (v[1] - v[0])) / half);
            }) });
          } else {
            const vs = P("vsat", 15);
            pending.push({ make: (o) => vcvs(c.ref, c.id, nd[2], [nd[0], nd[1]], ["IN-", "IN+", "OUT"], o + k, (v) => vs * Math.tanh((A * (v[1] - v[0])) / vs)) });
          }
          break;
        }
        case "COMP": {
          const voh = P("voh", 5), vol = P("vol", 0); const k = br();
          pending.push({ make: (o) => vcvs(c.ref, c.id, nd[2], [nd[0], nd[1]], ["IN-", "IN+", "OUT"], o + k, (v) => vol + (voh - vol) * (0.5 + 0.5 * Math.tanh((2e3 * (v[1] - v[0])) / Math.max(voh - vol, 1e-3)))) });
          break;
        }
        case "XFMR": {
          const n = P("ratio", 1); const k = br();
          pending.push({ make: (o) => {
            const kk = o + k; const [p1, p2, s1, s2] = nd;
            return {
              ref: c.ref, compId: c.id, nodes: nd, pinNames: ["P1", "P2", "S1", "S2"], branches: [kk],
              stamp(cx) { cx.G(s1, kk, 1); cx.G(s2, kk, -1); cx.G(p1, kk, -n); cx.G(p2, kk, n); cx.G(kk, s1, 1); cx.G(kk, s2, -1); cx.G(kk, p1, -n); cx.G(kk, p2, n); },
              stampAC(cx) { cx.Gc(s1, kk, 1, 0); cx.Gc(s2, kk, -1, 0); cx.Gc(p1, kk, -n, 0); cx.Gc(p2, kk, n, 0); cx.Gc(kk, s1, 1, 0); cx.Gc(kk, s2, -1, 0); cx.Gc(kk, p1, -n, 0); cx.Gc(kk, p2, n, 0); },
              current: (x) => -n * x[kk],
            } as Elem;
          } });
          break;
        }
        case "GATE": case "DFF": case "CNT4": case "LOGIC_IN": case "WGEN": {
          const vdd = P("vdd", 5), delay = P("delay", 0);
          const kind = def.key;
          const inputs: number[] = [], outputs: { n: number; pin: string }[] = [];
          if (def.model === "GATE") { pins.forEach((pn, i) => (pn === "Y" ? outputs.push({ n: nd[i], pin: pn }) : inputs.push(nd[i]))); }
          else if (def.model === "DFF") { inputs.push(nd[0], nd[1]); outputs.push({ n: nd[2], pin: "Q" }, { n: nd[3], pin: "~Q" }); }
          else if (def.model === "CNT4") { inputs.push(nd[0]); for (let i = 1; i < 5; i++) outputs.push({ n: nd[i], pin: pins[i] }); }
          else if (def.model === "LOGIC_IN") outputs.push({ n: nd[0], pin: "Y" });
          else outputs.push(...pins.map((pn, i) => ({ n: nd[i], pin: pn })));
          const state = outputs.map(() => 0);
          const pend: { t: number; s: number[] } = { t: -1, s: [] };
          let prevClk = 0, count = 0, q = 0;
          const words = (c.props.words || "").split(/[\s,]+/).filter(Boolean).map((w) => parseInt(w, 16) || 0);
          const wf = P("freq", 1000);
          const logic = (x: Float64Array, t: number, edge: boolean): number[] => {
            const L = (nd2: number) => (V(x, nd2) > vdd / 2 ? 1 : 0);
            const inp = inputs.map(L);
            switch (kind) {
              case "AND": return [inp[0] & inp[1]];
              case "OR": return [inp[0] | inp[1]];
              case "NAND": return [1 - (inp[0] & inp[1])];
              case "NOR": return [1 - (inp[0] | inp[1])];
              case "XOR": return [inp[0] ^ inp[1]];
              case "NOT": return [1 - inp[0]];
              case "BUF": return [inp[0]];
              case "LOGIC_IN": return [c.props.level === "1" ? 1 : 0];
              case "WGEN": { const w = words.length ? words[Math.floor(t * wf) % words.length] : 0; return outputs.map((_, i) => (w >> i) & 1); }
              case "DFF": { if (edge && inp[1] && !prevClk) q = inp[0]; if (edge) prevClk = inp[1]; return [q, 1 - q]; }
              case "CNT4": { if (edge && inp[0] && !prevClk) count = (count + 1) & 15; if (edge) prevClk = inp[0]; return [count & 1, (count >> 1) & 1, (count >> 2) & 1, (count >> 3) & 1]; }
            }
            return state;
          };
          const holder: Elem = {
            ref: c.ref, compId: c.id, nodes: nd, pinNames: pins, branches: [],
            stamp(cx) { for (const e of drivers) e.stamp(cx); for (const i of inputs) cx.G(i, i, 1e-9); },
            stampAC(cx) { for (const e of drivers) e.stampAC!(cx); },
            init(x) {
              if (kind === "DFF" || kind === "CNT4") { prevClk = inputs.length ? (V(x, inputs[kind === "DFF" ? 1 : 0]) > vdd / 2 ? 1 : 0) : 0; }
              const s = logic(x, 0, false); s.forEach((v, i) => (state[i] = v));
            },
            accept(x, t) {
              const s = logic(x, t, true);
              let changed = false;
              if (delay > 0) {
                if (s.some((v, i) => v !== state[i]) && (pend.t < 0 || s.some((v, i) => v !== pend.s[i]))) { pend.t = t + delay; pend.s = s; }
                if (pend.t >= 0 && t >= pend.t) { pend.s.forEach((v, i) => { if (state[i] !== v) changed = true; state[i] = v; }); pend.t = -1; }
              } else s.forEach((v, i) => { if (state[i] !== v) changed = true; state[i] = v; });
              return changed;
            },
          };
          const drivers = outputs.map((o, i) => driver(c.ref + "." + o.pin, c.id, o.n, () => state[i] * vdd, o.pin));
          pending.push({ make: () => holder });
          this.digital.push(holder);
          break;
        }
        case "FGEN": {
          const fn = waveform(c.props, vars, c.props.wave || "sine"); const rout = Math.max(P("rout", 50), 1e-3); const g = 1 / rout; const ac = P("ac", 1);
          const [pp, com, mm] = nd;
          pending.push({ make: () => ({
            ref: c.ref, compId: c.id, nodes: nd, pinNames: ["+", "COM", "-"], branches: [], isSource: c.ref,
            stamp(cx) {
              const v = fn(cx.t) * cx.srcScale;
              for (const [o, s] of [[pp, 1], [mm, -1]] as const) { if (o < 0 && com < 0) continue; cx.G(o, o, g); cx.G(com, com, g); cx.G(o, com, -g); cx.G(com, o, -g); cx.B(o, s * v * g); cx.B(com, -s * v * g); }
            },
            stampAC(cx) { for (const [o, s] of [[pp, 1], [mm, -1]] as const) { cx.Gc(o, o, g, 0); cx.Gc(com, com, g, 0); cx.Gc(o, com, -g, 0); cx.Gc(com, o, -g, 0); cx.Bc(o, s * ac * g, 0); cx.Bc(com, -s * ac * g, 0); } },
            current: (x) => (fn(0) - (V(x, pp) - V(x, com))) * g,
          }) as Elem });
          break;
        }
        case "DMM": {
          const mode = c.props.mode || "V";
          if (mode === "A") { const k = br(); pending.push({ make: (o) => vsource(c.ref, c.id, nd[0], nd[1], o + k, () => 0, 0) }); }
          else if (mode === "V") pending.push({ make: () => resistor(c.ref, c.id, nd[0], nd[1], 1e7, ["+", "-"]) });
          else pending.push({ make: () => { const e = isource(c.ref, c.id, nd[1], nd[0], () => 1e-3, 0, 1e-9); e.current = () => 1e-3; return e; } });
          break;
        }
        case "WATT": {
          const k = br();
          pending.push({ make: () => resistor(c.ref + ".V", c.id, nd[0], nd[1], 1e7, ["V+", "V-"]) });
          pending.push({ make: (o) => vsource(c.ref + ".I", c.id, nd[2], nd[3], o + k, () => 0, 0, ["I+", "I-"]) });
          break;
        }
        case "IV": {
          if (opts.ivActive === c.id) { const k = br(); pending.push({ make: (o) => vsource(c.ref, c.id, nd[0], nd[1], o + k, () => 0, 0) }); }
          break;
        }
        case "HIZ": pending.push({ make: () => resistor(c.ref, c.id, nd[0], -1, 1e8, ["IN", "gnd"]) }); break;
        case "INSTR": this.observers.push({ ref: c.ref, compId: c.id, type: c.type }); break;
      }
    }
    void branchQueue; void extra;
    this.nNodes = this.nodeNames.length;
    this.size = this.nNodes + nb;
    this.elems = pending.map((p) => p.make(this.nNodes));
    this.gmin = project.sim.gmin || 1e-12;
  }

  get nonlinear() { return this.elems.some((e) => e.nonlinear); }

  private assemble(mode: "dc" | "tran", x: Float64Array, t: number, h: number, srcScale: number) {
    const n = this.size, A = new Float64Array(n * n), b = new Float64Array(n);
    const ctx: StampCtx = {
      mode, x, h, t, omega: 0, srcScale,
      G: (i, j, v) => { if (i >= 0 && j >= 0) A[i * n + j] += v; },
      B: (i, v) => { if (i >= 0) b[i] += v; },
      Gc: () => {}, Bc: () => {},
    };
    for (let i = 0; i < this.nNodes; i++) A[i * n + i] += this.gmin;
    for (const e of this.elems) e.stamp(ctx);
    return { A, b };
  }

  newton(mode: "dc" | "tran", x0: Float64Array, t: number, h: number, srcScale = 1, maxIt = 150): { x: Float64Array; ok: boolean; iters: number } {
    let x: Float64Array = x0.slice();
    const nl = this.nonlinear;
    for (let it = 0; it < maxIt; it++) {
      const { A, b } = this.assemble(mode, x, t, h, srcScale);
      const xn = solveReal(A, b, this.size);
      if (!xn) return { x, ok: false, iters: it };
      if (!nl) return { x: xn, ok: true, iters: 1 };
      let maxd = 0, conv = true;
      for (let i = 0; i < this.size; i++) {
        let d = xn[i] - x[i];
        if (i < this.nNodes && Math.abs(d) > 1) d = Math.sign(d);
        const tol = 1e-3 * Math.max(Math.abs(xn[i]), Math.abs(x[i])) + (i < this.nNodes ? 1e-6 : 1e-9);
        if (Math.abs(xn[i] - x[i]) > tol) conv = false;
        maxd = Math.max(maxd, Math.abs(d));
        xn[i] = x[i] + d;
      }
      x = xn;
      if (conv && it > 0) return { x, ok: true, iters: it + 1 };
    }
    return { x, ok: false, iters: maxIt };
  }

  /** DC operating point at time t (sources evaluated at t). Uses source stepping fallback and digital fixpoint iteration. */
  op(t = 0): { x: Float64Array; ok: boolean } {
    let x: Float64Array = new Float64Array(this.size);
    for (const d of this.digital) d.init?.(x, false);
    let res: { x: Float64Array; ok: boolean } = { x, ok: false };
    for (let pass = 0; pass < 20; pass++) {
      let r = this.newton("dc", x, t, 1);
      if (!r.ok) {
        let xs: Float64Array = new Float64Array(this.size); let ok = true;
        for (let s = 1; s <= 10; s++) { const rr = this.newton("dc", xs, t, 1, s / 10, 200); xs = rr.x; ok = rr.ok; }
        r = { x: xs, ok, iters: 0 };
      }
      x = r.x; res = { x, ok: r.ok };
      let changed = false;
      for (const d of this.digital) { d.init?.(x, false); }
      for (const d of this.digital) if (d.accept?.(x, t)) changed = true;
      if (!changed) break;
      if (pass < 19) { const r2 = this.newton("dc", x, t, 1); x = r2.x; res = { x, ok: r2.ok }; }
    }
    return res;
  }

  signalNames(): string[] {
    const s = this.cn.nets.map((n) => `V(${n.name})`);
    for (const e of this.elems) {
      if (e.termCurrents) e.pinNames.forEach((p) => s.push(`I(${e.ref}.${p})`));
      if (e.current) s.push(`I(${e.ref})`);
    }
    return s;
  }
  sample(x: Float64Array, out: Record<string, number[]>) {
    for (const n of this.cn.nets) (out[`V(${n.name})`] ??= []).push(n.name === "0" ? 0 : x[this.nodeIndex[n.name]] ?? 0);
    for (const e of this.elems) {
      if (e.termCurrents) { const ic = e.termCurrents(x); e.pinNames.forEach((p, i) => (out[`I(${e.ref}.${p})`] ??= []).push(ic[i])); }
      if (e.current) (out[`I(${e.ref})`] ??= []).push(e.current(x));
    }
  }

  ac(freqs: number[], x0: Float64Array) {
    const n = this.size;
    const res: Record<string, number[]> = {};
    for (const f of freqs) {
      const Ar = new Float64Array(n * n), Ai = new Float64Array(n * n), br = new Float64Array(n), bi = new Float64Array(n);
      const ctx: StampCtx = {
        mode: "ac", x: x0, h: 1, t: 0, omega: 2 * Math.PI * f, srcScale: 1,
        G: () => {}, B: () => {},
        Gc: (i, j, re, im) => { if (i >= 0 && j >= 0) { Ar[i * n + j] += re; Ai[i * n + j] += im; } },
        Bc: (i, re, im) => { if (i >= 0) { br[i] += re; bi[i] += im; } },
      };
      for (let i = 0; i < this.nNodes; i++) Ar[i * n + i] += this.gmin;
      for (const e of this.elems) e.stampAC?.(ctx);
      const s = solveComplex(Ar, Ai, br, bi, n);
      for (const net of this.cn.nets) {
        const idx = this.nodeIndex[net.name];
        const re = net.name === "0" || !s ? 0 : s.re[idx], im = net.name === "0" || !s ? 0 : s.im[idx];
        (res[`Vre(${net.name})`] ??= []).push(re);
        (res[`Vim(${net.name})`] ??= []).push(im);
        (res[`V(${net.name})`] ??= []).push(Math.hypot(re, im));
        (res[`VDB(${net.name})`] ??= []).push(20 * Math.log10(Math.max(Math.hypot(re, im), 1e-30)));
        (res[`VP(${net.name})`] ??= []).push((Math.atan2(im, re) * 180) / Math.PI);
      }
    }
    return res;
  }
}
