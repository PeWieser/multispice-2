/**
 * SPICE-class simulation kernel.
 *
 *  - Modified Nodal Analysis (MNA) assembly with extra branch currents
 *  - Newton-Raphson with junction limiting, adaptive damping, gmin + source stepping
 *  - Companion models for reactive elements (Backward Euler, Trapezoidal, Gear/BDF 1..6)
 *  - Nonlinear device library: diode, BJT (Ebers-Moll + Early), MOSFET L1, JFET
 *  - Behavioural macro models: op-amp, comparator, 555, regulators, logic, MCU pins
 */

import { GEAR_COEFFS, RealMatrix } from "./linalg";
import {
  createMcuState,
  DEFAULT_MCU_SKETCH,
  DigitalDeviceLike,
  evalDigital,
  McuProgram,
  McuState,
  parseMcuProgram,
  runMcu,
} from "./digital";

export const GND = "0";
export const BOLTZMANN = 1.380649e-23;
export const CHARGE = 1.602176634e-19;
export const KELVIN = 273.15;

export type IntegrationMethod =
  | "trap"
  | "euler"
  | "gear1"
  | "gear2"
  | "gear3"
  | "gear4"
  | "gear5"
  | "gear6";

export type SourceKind =
  | "dc"
  | "sine"
  | "square"
  | "triangle"
  | "sawtooth"
  | "pulse"
  | "exp"
  | "pwl"
  | "am"
  | "fm"
  | "noise";

export interface SourceSpec {
  kind: SourceKind;
  dc?: number;
  amplitude?: number;
  freq?: number;
  phase?: number;
  offset?: number;
  delay?: number;
  rise?: number;
  fall?: number;
  width?: number;
  period?: number;
  duty?: number;
  damping?: number;
  modIndex?: number;
  modFreq?: number;
  pwl?: Array<[number, number]>;
  acMag?: number;
  acPhase?: number;
}

export interface Device {
  id: string;
  type: string;
  nodes: string[];
  params: Record<string, number>;
  source?: SourceSpec;
  model?: string;
  text?: string;
  /** runtime scratch, created by the simulator */
  state?: DeviceState;
}

export interface DeviceState {
  hist: number[];
  histI: number[];
  br: number;
  br2: number;
  vprev: number[];
  digital?: Record<string, number>;
  outputs?: number[];
  extra?: Record<string, number>;
}

export interface Netlist {
  devices: Device[];
  title?: string;
}

export interface SimOptions {
  gmin: number;
  abstol: number;
  vntol: number;
  reltol: number;
  maxIter: number;
  temperature: number;
  method: IntegrationMethod;
  order: number;
}

export const DEFAULT_OPTIONS: SimOptions = {
  gmin: 1e-12,
  abstol: 1e-12,
  vntol: 1e-6,
  reltol: 1e-3,
  maxIter: 120,
  temperature: 27,
  method: "trap",
  order: 2,
};

export interface SolveResult {
  ok: boolean;
  iterations: number;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* source waveforms                                                    */
/* ------------------------------------------------------------------ */

export function sourceValue(s: SourceSpec | undefined, t: number): number {
  if (!s) return 0;
  const dc = s.dc ?? 0;
  const a = s.amplitude ?? 0;
  const f = s.freq ?? 1000;
  const off = s.offset ?? 0;
  const ph = ((s.phase ?? 0) * Math.PI) / 180;
  const delay = s.delay ?? 0;
  const tt = Math.max(0, t - delay);
  switch (s.kind) {
    case "dc":
      return dc;
    case "sine": {
      const damp = s.damping ? Math.exp(-tt * s.damping) : 1;
      return off + dc + a * damp * Math.sin(2 * Math.PI * f * tt + ph);
    }
    case "square": {
      const duty = (s.duty ?? 50) / 100;
      const phase = (f * tt + ph / (2 * Math.PI)) % 1;
      return off + dc + (phase < duty ? a : -a);
    }
    case "triangle": {
      const p = (f * tt + ph / (2 * Math.PI)) % 1;
      return off + dc + a * (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
    }
    case "sawtooth": {
      const p = (f * tt + ph / (2 * Math.PI)) % 1;
      return off + dc + a * (2 * p - 1);
    }
    case "pulse": {
      const v1 = s.offset ?? 0;
      const v2 = s.amplitude ?? 5;
      const per = s.period ?? 1 / f;
      const tr = s.rise ?? per * 1e-3;
      const tf = s.fall ?? per * 1e-3;
      const pw = s.width ?? per * 0.5;
      if (t < delay) return v1;
      const p = (t - delay) % per;
      if (p < tr) return v1 + ((v2 - v1) * p) / Math.max(tr, 1e-18);
      if (p < tr + pw) return v2;
      if (p < tr + pw + tf) return v2 + ((v1 - v2) * (p - tr - pw)) / Math.max(tf, 1e-18);
      return v1;
    }
    case "exp": {
      const v1 = s.offset ?? 0;
      const v2 = s.amplitude ?? 1;
      const td1 = s.delay ?? 0;
      const tau1 = s.rise ?? 1e-3;
      const td2 = s.width ?? 1e-2;
      const tau2 = s.fall ?? 1e-3;
      if (t < td1) return v1;
      if (t < td2) return v1 + (v2 - v1) * (1 - Math.exp(-(t - td1) / tau1));
      return (
        v1 +
        (v2 - v1) * (1 - Math.exp(-(t - td1) / tau1)) +
        (v1 - v2) * (1 - Math.exp(-(t - td2) / tau2))
      );
    }
    case "pwl": {
      const pts = s.pwl ?? [];
      if (!pts.length) return 0;
      if (t <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        if (t <= pts[i][0]) {
          const [t0, v0] = pts[i - 1];
          const [t1, v1] = pts[i];
          return v0 + ((v1 - v0) * (t - t0)) / Math.max(t1 - t0, 1e-18);
        }
      }
      return pts[pts.length - 1][1];
    }
    case "am": {
      const m = s.modIndex ?? 0.5;
      const fm = s.modFreq ?? 100;
      return (
        off + dc + a * (1 + m * Math.sin(2 * Math.PI * fm * tt)) * Math.sin(2 * Math.PI * f * tt + ph)
      );
    }
    case "fm": {
      const m = s.modIndex ?? 5;
      const fm = s.modFreq ?? 100;
      return off + dc + a * Math.sin(2 * Math.PI * f * tt + m * Math.sin(2 * Math.PI * fm * tt) + ph);
    }
    case "noise": {
      return off + dc + a * (Math.random() * 2 - 1);
    }
    default:
      return dc;
  }
}

/* ------------------------------------------------------------------ */
/* junction limiting helpers                                           */
/* ------------------------------------------------------------------ */

function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      if (arg > 0) return vold + vt * Math.log(arg);
      return vcrit;
    }
    return vt * Math.log(Math.max(vnew / vt, 1e-9));
  }
  return vnew;
}

function fetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = vtsthi / 2 + 2;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        if (vnew >= vtox) {
          if (-delv > vtstlo) return vold - vtstlo;
        } else return Math.max(vnew, vto + 2);
      } else if (delv > vtsthi) return vold + vtsthi;
    } else if (delv > 0 && vnew > vtox) return vtox;
  } else if (delv > 0) {
    if (vnew > vto + 2) return vto + 2;
  } else if (-delv > vtsthi) return vold - vtsthi;
  return vnew;
}

const p = (d: Device, key: string, def: number): number => {
  const v = d.params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
};

/* ------------------------------------------------------------------ */
/* simulator                                                           */
/* ------------------------------------------------------------------ */

export interface StampContext {
  time: number;
  dt: number;
  transient: boolean;
  gmin: number;
  srcFactor: number;
  vt: number;
  temp: number;
}

export class Simulator {
  netlist: Netlist;
  options: SimOptions;
  nodeIndex = new Map<string, number>();
  nodeNames: string[] = [];
  branchNames: string[] = [];
  size = 0;
  x: Float64Array = new Float64Array(0);
  xPrev: Float64Array = new Float64Array(0);
  matrix: RealMatrix = new RealMatrix(0);
  time = 0;
  lastDt = 0;
  historyDepth = 7;
  log: string[] = [];
  /** interactive overrides (switch positions, potentiometer wipers, ...) */
  controls: Record<string, number> = {};
  /** set when a junction limiter clamped a device voltage during the iteration */
  limited = false;
  /** digital/behavioural devices only change state between timesteps */
  digitalDirty = false;
  mcuStates = new Map<string, McuState>();
  mcuPrograms = new Map<string, McuProgram>();

  constructor(netlist: Netlist, options?: Partial<SimOptions>) {
    this.netlist = netlist;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.build();
  }

  private nodeId(name: string): number {
    const n = (name ?? GND).trim();
    if (!n || n === GND || n.toLowerCase() === "gnd" || n.toLowerCase() === "ground") return -1;
    let idx = this.nodeIndex.get(n);
    if (idx === undefined) {
      idx = this.nodeNames.length;
      this.nodeIndex.set(n, idx);
      this.nodeNames.push(n);
    }
    return idx;
  }

  build(): void {
    this.nodeIndex.clear();
    this.nodeNames = [];
    this.branchNames = [];
    for (const d of this.netlist.devices) {
      for (const n of d.nodes) this.nodeId(n);
    }
    const nNodes = this.nodeNames.length;
    let branch = 0;
    for (const d of this.netlist.devices) {
      const st: DeviceState = {
        hist: [0, 0, 0, 0, 0, 0, 0],
        histI: [0, 0, 0, 0, 0, 0, 0],
        br: -1,
        br2: -1,
        vprev: [0, 0, 0, 0],
        extra: {},
      };
      d.state = st;
      switch (d.type) {
        case "V":
        case "L":
        case "E":
        case "H":
        case "AMMETER":
          st.br = nNodes + branch++;
          this.branchNames.push(d.id);
          break;
        case "F":
          // current controlled current source needs the controlling branch (a 0V source)
          st.br = nNodes + branch++;
          this.branchNames.push(d.id + ":ctrl");
          break;
        case "OPAMP":
        case "COMPARATOR":
          st.br = nNodes + branch++;
          this.branchNames.push(d.id + ":out");
          break;
        case "TRANSFORMER":
          st.br = nNodes + branch++;
          st.br2 = nNodes + branch++;
          this.branchNames.push(d.id + ":p", d.id + ":s");
          break;
        default:
          break;
      }
    }
    this.size = nNodes + branch;
    this.matrix = new RealMatrix(this.size);
    this.x = new Float64Array(this.size);
    this.xPrev = new Float64Array(this.size);
  }

  nodeVoltage(name: string): number {
    const i = this.nodeIndex.get(name);
    if (i === undefined) return 0;
    return this.x[i] ?? 0;
  }

  vOf(idx: number): number {
    return idx < 0 ? 0 : this.x[idx] ?? 0;
  }

  branchCurrent(deviceId: string): number {
    const d = this.netlist.devices.find((dd) => dd.id === deviceId);
    if (!d || !d.state) return 0;
    return this.deviceCurrent(d);
  }

  /** Current flowing from node[0] into the device. */
  deviceCurrent(d: Device): number {
    const st = d.state;
    if (!st) return 0;
    const a = this.nodeIndex.get(d.nodes[0] ?? GND) ?? -1;
    const b = this.nodeIndex.get(d.nodes[1] ?? GND) ?? -1;
    const va = this.vOf(this.isGround(d.nodes[0]) ? -1 : a);
    const vb = this.vOf(this.isGround(d.nodes[1]) ? -1 : b);
    switch (d.type) {
      case "R":
      case "LAMP":
      case "FUSE":
        return (va - vb) / Math.max(this.resistance(d), 1e-12);
      case "C": {
        const geq = st.extra?.geq ?? 0;
        const ieq = st.extra?.ieq ?? 0;
        return geq * (va - vb) - ieq;
      }
      case "V":
      case "L":
      case "E":
      case "H":
      case "AMMETER":
        return st.br >= 0 ? this.x[st.br] : 0;
      case "I":
        return sourceValue(d.source, this.time) * (d.source ? 1 : 1);
      case "D":
      case "LED":
      case "ZENER":
      case "SCHOTTKY": {
        const geff = st.extra?.geff ?? 0;
        const ieqEff = st.extra?.ieqEff ?? 0;
        const icap = (st.extra?.geqC ?? 0) * (va - vb) - (st.extra?.ieqC ?? 0);
        return geff * (va - vb) + ieqEff + icap;
      }
      case "TIMER555": {
        // Return total supply current + output current estimate
        // Output branch current stored in extra.iout, discharge in extra.idis, supply in extra.isupply
        const iout = st.extra?.iout ?? 0;
        const idis = st.extra?.idis ?? 0;
        const isup = st.extra?.isupply ?? 0;
        return iout + idis + isup;
      }
      case "OPAMP":
      case "COMPARATOR": {
        // Output current via branch
        return st.br >= 0 ? this.x[st.br] : (st.extra?.id ?? 0);
      }
      case "Q":
      case "M":
      case "J": {
        return st.extra?.id ?? st.extra?.ic ?? 0;
      }
      case "GATE":
      case "DIGITAL": {
        // Sum of output currents
        const outs = st.outputs ?? [];
        let sum = 0;
        for (let i = 0; i < outs.length; i += 2) {
          const lvl = outs[i + 1];
          if (lvl < 0) continue;
          // rough estimate: output current proportional to load, not tracked; use 0
        }
        return sum;
      }
      default:
        return st.extra?.id ?? st.extra?.ic ?? 0;
    }
  }

  /** Per-pin current for a device – used for probe display and diagnostics. */
  pinCurrent(d: Device, pinIdx: number): number {
    const st = d.state;
    if (!st) return 0;
    const nodes = d.nodes;
    const idx = this.idx(nodes[pinIdx]);
    if (idx < 0) return 0;
    // For TIMER555 provide plausible bias currents
    if (d.type === "TIMER555") {
      // Pin mapping: 0 GND,1 TRIG,2 OUT,3 RST,4 CTRL,5 THR,6 DIS,7 VCC
      const extra = st.extra ?? {};
      switch (pinIdx) {
        case 0: // GND – return negative sum of others (KCL)
          return -((extra.iout ?? 0) + (extra.idis ?? 0) + (extra.isupply ?? 0) + (extra.ibias ?? 0));
        case 1: // TRIG – input bias ~0.5uA
          return extra.itrig ?? 0.5e-6;
        case 2: // OUT
          return extra.iout ?? 0;
        case 3: // RST – ~0.1mA when low
          return extra.irst ?? 0.1e-3;
        case 4: // CTRL – divider current
          return extra.ictrl ?? 0.2e-3;
        case 5: // THR – bias ~0.25uA
          return extra.ithr ?? 0.25e-6;
        case 6: // DIS – discharge transistor
          return extra.idis ?? 0;
        case 7: // VCC – supply
          return extra.isupply ?? 5e-3;
        default:
          return 0;
      }
    }
    // Generic fallback: for first pin return deviceCurrent, others 0
    if (pinIdx === 0) return this.deviceCurrent(d);
    return 0;
  }

  isGround(n: string | undefined): boolean {
    if (!n) return true;
    const s = n.trim().toLowerCase();
    return s === "0" || s === "gnd" || s === "ground";
  }

  resistance(d: Device): number {
    const base = p(d, "r", 1000);
    const tc1 = p(d, "tc1", 0);
    const tc2 = p(d, "tc2", 0);
    const tnom = p(d, "tnom", 27);
    const dT = this.options.temperature - tnom;
    const scale = this.controls[d.id + ":scale"];
    const r = base * (1 + tc1 * dT + tc2 * dT * dT) * (scale === undefined ? 1 : scale);
    return Math.max(r, 1e-9);
  }

  /* --------------------------- stamping --------------------------- */

  private stampConductance(m: RealMatrix, a: number, b: number, g: number): void {
    if (a >= 0) m.add(a, a, g);
    if (b >= 0) m.add(b, b, g);
    if (a >= 0 && b >= 0) {
      m.add(a, b, -g);
      m.add(b, a, -g);
    }
  }

  private stampCurrent(m: RealMatrix, a: number, b: number, i: number): void {
    if (a >= 0) m.addRhs(a, -i);
    if (b >= 0) m.addRhs(b, i);
  }

  /** Norton style behavioural output: pushes node `a` towards `v` with output resistance `rout`. */
  private stampVoltageSoft(m: RealMatrix, a: number, b: number, v: number, rout: number): void {
    const g = 1 / Math.max(rout, 1e-6);
    this.stampConductance(m, a, b, g);
    this.stampCurrent(m, a, b, -v * g);
  }

  private idx(name: string | undefined): number {
    if (this.isGround(name)) return -1;
    return this.nodeIndex.get((name ?? "").trim()) ?? -1;
  }

  private integrationCoeffs(dt: number): { a0: number; hist: number[] } {
    const { method, order } = this.options;
    if (method === "trap") return { a0: 2 / dt, hist: [] };
    if (method === "euler" || method === "gear1") return { a0: 1 / dt, hist: GEAR_COEFFS[0] };
    const o = Math.min(6, Math.max(1, method.startsWith("gear") ? Number(method.slice(4)) : order));
    const c = GEAR_COEFFS[o - 1];
    return { a0: c[0] / dt, hist: c };
  }

  loadDevices(ctx: StampContext): void {
    const m = this.matrix;
    const vt = ctx.vt;
    for (const d of this.netlist.devices) {
      const st = d.state!;
      const n0 = this.idx(d.nodes[0]);
      const n1 = this.idx(d.nodes[1]);
      switch (d.type) {
        /* ---------------- passive ---------------- */
        case "R":
        case "FUSE":
          this.stampConductance(m, n0, n1, 1 / this.resistance(d));
          break;
        case "LAMP": {
          const rated = p(d, "v", 12);
          const pw = p(d, "p", 1);
          const rCold = (rated * rated) / Math.max(pw, 1e-6);
          this.stampConductance(m, n0, n1, 1 / Math.max(rCold, 1e-3));
          break;
        }
        case "POT": {
          // nodes: A, wiper, B
          const nw = this.idx(d.nodes[1]);
          const nb = this.idx(d.nodes[2]);
          const total = Math.max(p(d, "r", 10000), 1e-6);
          const pos = Math.min(0.9999, Math.max(0.0001, this.controls[d.id] ?? p(d, "pos", 0.5)));
          this.stampConductance(m, n0, nw, 1 / (total * pos));
          this.stampConductance(m, nw, nb, 1 / (total * (1 - pos)));
          break;
        }
        case "C": {
          const c = Math.max(p(d, "c", 1e-6), 1e-18);
          const va = this.vOf(n0) - this.vOf(n1);
          if (!ctx.transient) {
            // DC: open circuit (tiny conductance for stability)
            this.stampConductance(m, n0, n1, ctx.gmin);
            st.extra!.geq = 0;
            st.extra!.ieq = 0;
            st.hist[0] = va;
            break;
          }
          const { a0, hist } = this.integrationCoeffs(ctx.dt);
          let geq: number;
          let ieq: number;
          if (this.options.method === "trap") {
            geq = a0 * c;
            ieq = geq * st.hist[0] + (st.extra!.ilast ?? 0);
          } else {
            geq = a0 * c;
            let sum = 0;
            for (let k = 1; k < hist.length; k++) sum += hist[k] * st.hist[k - 1];
            ieq = (-c / ctx.dt) * sum;
          }
          st.extra!.geq = geq;
          st.extra!.ieq = ieq;
          this.stampConductance(m, n0, n1, geq);
          this.stampCurrent(m, n0, n1, -ieq);
          break;
        }
        case "L": {
          const l = Math.max(p(d, "l", 1e-3), 1e-15);
          const br = st.br;
          if (n0 >= 0) {
            m.add(n0, br, 1);
            m.add(br, n0, 1);
          }
          if (n1 >= 0) {
            m.add(n1, br, -1);
            m.add(br, n1, -1);
          }
          if (!ctx.transient) {
            m.add(br, br, -p(d, "rser", 1e-6));
          } else {
            const { a0, hist } = this.integrationCoeffs(ctx.dt);
            const req = a0 * l;
            m.add(br, br, -(req + p(d, "rser", 1e-6)));
            let veq: number;
            if (this.options.method === "trap") {
              veq = -(req * st.histI[0] + (st.extra!.vlast ?? 0));
            } else {
              let sum = 0;
              for (let k = 1; k < hist.length; k++) sum += hist[k] * st.histI[k - 1];
              veq = (l / ctx.dt) * sum;
            }
            m.addRhs(br, veq);
          }
          break;
        }
        case "TRANSFORMER": {
          // nodes: p+, p-, s+, s-  (ideal-ish coupled inductor pair)
          const np = this.idx(d.nodes[0]);
          const nm = this.idx(d.nodes[1]);
          const sp = this.idx(d.nodes[2]);
          const sm = this.idx(d.nodes[3]);
          const lp = Math.max(p(d, "lp", 1), 1e-9);
          const ratio = Math.max(p(d, "ratio", 1), 1e-6);
          const ls = lp / (ratio * ratio);
          const k = Math.min(0.9999, p(d, "k", 0.999));
          const mut = k * Math.sqrt(lp * ls);
          const b1 = st.br;
          const b2 = st.br2;
          if (np >= 0) {
            m.add(np, b1, 1);
            m.add(b1, np, 1);
          }
          if (nm >= 0) {
            m.add(nm, b1, -1);
            m.add(b1, nm, -1);
          }
          if (sp >= 0) {
            m.add(sp, b2, 1);
            m.add(b2, sp, 1);
          }
          if (sm >= 0) {
            m.add(sm, b2, -1);
            m.add(b2, sm, -1);
          }
          if (!ctx.transient) {
            m.add(b1, b1, -1e-3);
            m.add(b2, b2, -1e-3);
          } else {
            const { a0 } = this.integrationCoeffs(ctx.dt);
            m.add(b1, b1, -a0 * lp);
            m.add(b1, b2, -a0 * mut);
            m.add(b2, b2, -a0 * ls);
            m.add(b2, b1, -a0 * mut);
            m.addRhs(b1, -(a0 * lp * st.histI[0] + a0 * mut * (st.extra!.i2 ?? 0)));
            m.addRhs(b2, -(a0 * ls * (st.extra!.i2 ?? 0) + a0 * mut * st.histI[0]));
          }
          break;
        }
        /* ---------------- sources ---------------- */
        case "V":
        case "AMMETER": {
          const br = st.br;
          const v = d.type === "AMMETER" ? 0 : sourceValue(d.source, ctx.time) * ctx.srcFactor;
          if (n0 >= 0) {
            m.add(n0, br, 1);
            m.add(br, n0, 1);
          }
          if (n1 >= 0) {
            m.add(n1, br, -1);
            m.add(br, n1, -1);
          }
          m.add(br, br, -p(d, "rser", 1e-9));
          m.addRhs(br, v);
          break;
        }
        case "I": {
          const i = sourceValue(d.source, ctx.time) * ctx.srcFactor;
          this.stampCurrent(m, n0, n1, i);
          break;
        }
        case "E": {
          // VCVS: n+, n-, cp, cm
          const br = st.br;
          const cp = this.idx(d.nodes[2]);
          const cm = this.idx(d.nodes[3]);
          const gain = p(d, "gain", 1);
          if (n0 >= 0) {
            m.add(n0, br, 1);
            m.add(br, n0, 1);
          }
          if (n1 >= 0) {
            m.add(n1, br, -1);
            m.add(br, n1, -1);
          }
          if (cp >= 0) m.add(br, cp, -gain);
          if (cm >= 0) m.add(br, cm, gain);
          break;
        }
        case "G": {
          // VCCS
          const cp = this.idx(d.nodes[2]);
          const cm = this.idx(d.nodes[3]);
          const gm = p(d, "gain", 1e-3);
          if (n0 >= 0 && cp >= 0) m.add(n0, cp, gm);
          if (n0 >= 0 && cm >= 0) m.add(n0, cm, -gm);
          if (n1 >= 0 && cp >= 0) m.add(n1, cp, -gm);
          if (n1 >= 0 && cm >= 0) m.add(n1, cm, gm);
          break;
        }
        case "H": {
          // CCVS: n+, n-, controlling nodes (series 0V source is inside)
          const br = st.br;
          const cp = this.idx(d.nodes[2]);
          const cm = this.idx(d.nodes[3]);
          const rm = p(d, "gain", 1);
          const gsense = 1e6;
          if (n0 >= 0) {
            m.add(n0, br, 1);
            m.add(br, n0, 1);
          }
          if (n1 >= 0) {
            m.add(n1, br, -1);
            m.add(br, n1, -1);
          }
          this.stampConductance(m, cp, cm, gsense);
          const ic = (this.vOf(cp) - this.vOf(cm)) * gsense;
          m.addRhs(br, rm * ic);
          break;
        }
        case "F": {
          // CCCS with internal sense resistor on control branch
          const cp = this.idx(d.nodes[2]);
          const cm = this.idx(d.nodes[3]);
          const beta = p(d, "gain", 1);
          const gsense = 1e6;
          this.stampConductance(m, cp, cm, gsense);
          const ic = (this.vOf(cp) - this.vOf(cm)) * gsense;
          this.stampCurrent(m, n0, n1, beta * ic);
          break;
        }
        /* ---------------- switches ---------------- */
        case "SWITCH":
        case "PUSHBUTTON":
        case "RELAY_CONTACT":
        case "DIPSWITCH": {
          const closed = (this.controls[d.id] ?? p(d, "closed", 0)) > 0.5;
          const g = closed ? 1 / Math.max(p(d, "ron", 0.01), 1e-6) : 1 / Math.max(p(d, "roff", 1e9), 1);
          this.stampConductance(m, n0, n1, g);
          break;
        }
        case "VSWITCH": {
          const on = st.extra!.on ?? 0;
          const g = on ? 1 / Math.max(p(d, "ron", 1), 1e-6) : 1 / Math.max(p(d, "roff", 1e9), 1);
          this.stampConductance(m, n0, n1, g);
          break;
        }
        /* ---------------- semiconductors ---------------- */
        case "D":
        case "LED":
        case "ZENER":
        case "SCHOTTKY": {
          const is = p(d, "is", d.type === "SCHOTTKY" ? 1e-8 : 1e-14);
          const n = p(d, "n", d.type === "LED" ? 2.0 : 1.0);
          const rs = p(d, "rs", d.type === "LED" ? 8 : 0.01);
          const bv = p(d, "bv", d.type === "ZENER" ? 5.1 : 1e3);
          const nvt = n * vt;
          const vdRaw = this.vOf(n0) - this.vOf(n1);
          const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * is));
          const vd = pnjlim(vdRaw, st.vprev[0], nvt, vcrit);
          if (Math.abs(vd - vdRaw) > 1e-9) this.limited = true;
          st.vprev[0] = vd;
          let id: number;
          let gd: number;
          if (vd >= -3 * nvt) {
            const e = Math.exp(Math.min(vd / nvt, 60));
            id = is * (e - 1) + vd * ctx.gmin;
            gd = (is * e) / nvt + ctx.gmin;
          } else if (vd > -bv) {
            const arg = (3 * nvt) / (vd * Math.E);
            const a3 = arg * arg * arg;
            id = -is * (1 + a3) + vd * ctx.gmin;
            gd = (is * 3 * a3) / vd + ctx.gmin;
          } else {
            const e = Math.exp(Math.min(-(bv + vd) / nvt, 60));
            id = -is * e;
            gd = (is * e) / nvt + ctx.gmin;
          }
          // series resistance folded in via conductance limiting
          const geff = rs > 0 ? 1 / (1 / Math.max(gd, 1e-15) + rs) : gd;
          const ieq = id - gd * vd;
          const ieqEff = ieq * (geff / Math.max(gd, 1e-15));
          st.extra!.id = geff * vd + ieqEff;
          st.extra!.geff = geff;
          st.extra!.ieqEff = ieqEff;
          st.extra!.vd = vd;
          this.stampConductance(m, n0, n1, geff);
          this.stampCurrent(m, n0, n1, ieqEff);
          if (ctx.transient) {
            const cj = p(d, "cjo", 1e-12) + p(d, "tt", 0) * gd;
            if (cj > 0) {
              const { a0 } = this.integrationCoeffs(ctx.dt);
              const geqC = a0 * cj;
              const ieqC = geqC * st.hist[0] + (st.extra!.icap ?? 0);
              this.stampConductance(m, n0, n1, geqC);
              this.stampCurrent(m, n0, n1, -ieqC);
              st.extra!.geqC = geqC;
              st.extra!.ieqC = ieqC;
            }
          }
          break;
        }
        case "Q": {
          // BJT Ebers-Moll with Early effect. nodes: C, B, E
          const nc = this.idx(d.nodes[0]);
          const nb = this.idx(d.nodes[1]);
          const ne = this.idx(d.nodes[2]);
          const isat = p(d, "is", 1e-15);
          const bf = Math.max(p(d, "bf", 200), 1e-3);
          const br2 = Math.max(p(d, "br", 2), 1e-3);
          const vaf = p(d, "vaf", 100);
          const pnp = p(d, "pnp", 0) > 0.5 ? -1 : 1;
          const vbeRaw = pnp * (this.vOf(nb) - this.vOf(ne));
          const vbcRaw = pnp * (this.vOf(nb) - this.vOf(nc));
          const vcrit = vt * Math.log(vt / (Math.SQRT2 * isat));
          const vbe = pnjlim(vbeRaw, st.vprev[0], vt, vcrit);
          const vbc = pnjlim(vbcRaw, st.vprev[1], vt, vcrit);
          if (Math.abs(vbe - vbeRaw) > 1e-9 || Math.abs(vbc - vbcRaw) > 1e-9) this.limited = true;
          st.vprev[0] = vbe;
          st.vprev[1] = vbc;
          const evbe = Math.exp(Math.min(vbe / vt, 60));
          const evbc = Math.exp(Math.min(vbc / vt, 60));
          const ifwd = isat * (evbe - 1);
          const irev = isat * (evbc - 1);
          const q1 = 1 / Math.max(1 - vbc / vaf, 0.1);
          const ibe = ifwd / bf;
          const ibc = irev / br2;
          const ib = ibe + ibc;
          const ic = (ifwd - irev) * q1 - ibc;
          const gpi = (isat * evbe) / (bf * vt) + ctx.gmin;
          const gmu = (isat * evbc) / (br2 * vt) + ctx.gmin;
          const gm = (isat * evbe * q1) / vt;
          const go = (isat * evbc * q1) / vt + Math.abs(ic) / vaf + ctx.gmin;
          // stamp linearised model (currents referenced with pnp sign)
          const ieqB = ib - gpi * vbe - gmu * vbc;
          const ieqC = ic - gm * vbe + go * vbc;
          // base-emitter
          this.stampConductance(m, nb, ne, gpi);
          this.stampConductance(m, nb, nc, gmu);
          // transconductance: ic depends on vbe
          if (nc >= 0 && nb >= 0) m.add(nc, nb, gm);
          if (nc >= 0 && ne >= 0) m.add(nc, ne, -gm);
          if (ne >= 0 && nb >= 0) m.add(ne, nb, -gm);
          if (ne >= 0) m.add(ne, ne, gm);
          this.stampConductance(m, nc, ne, go);
          this.stampCurrent(m, nb, ne, pnp * ieqB);
          this.stampCurrent(m, nc, ne, pnp * ieqC);
          st.extra!.ic = pnp * ic;
          st.extra!.ib = pnp * ib;
          st.extra!.id = pnp * ic;
          if (ctx.transient) {
            const cje = p(d, "cje", 5e-12);
            const cjc = p(d, "cjc", 2e-12);
            const { a0 } = this.integrationCoeffs(ctx.dt);
            const gbe = a0 * cje;
            const gbc = a0 * cjc;
            this.stampConductance(m, nb, ne, gbe);
            this.stampCurrent(m, nb, ne, -gbe * st.hist[0]);
            this.stampConductance(m, nb, nc, gbc);
            this.stampCurrent(m, nb, nc, -gbc * st.hist[1]);
          }
          break;
        }
        case "M": {
          // MOSFET level 1: nodes D, G, S
          const nd = this.idx(d.nodes[0]);
          const ng = this.idx(d.nodes[1]);
          const ns = this.idx(d.nodes[2]);
          const pmos = p(d, "pmos", 0) > 0.5 ? -1 : 1;
          const kp = p(d, "kp", 2e-5);
          const w = p(d, "w", 1e-4);
          const l = p(d, "l", 1e-5);
          const beta = (kp * w) / l;
          const vto = p(d, "vto", 2) * pmos;
          const lambda = p(d, "lambda", 0.02);
          const vgsRaw = pmos * (this.vOf(ng) - this.vOf(ns));
          const vds = pmos * (this.vOf(nd) - this.vOf(ns));
          const vgs = fetlim(vgsRaw, st.vprev[0], Math.abs(vto));
          if (Math.abs(vgs - vgsRaw) > 1e-9) this.limited = true;
          st.vprev[0] = vgs;
          st.vprev[1] = vds;
          const vth = Math.abs(vto);
          let id = 0;
          let gm = 0;
          let gds = 0;
          const reverse = vds < 0;
          const vdsA = Math.abs(vds);
          const vov = vgs - vth;
          if (vov <= 0) {
            // subthreshold, small leakage
            id = 0;
            gm = 0;
            gds = ctx.gmin;
          } else if (vdsA < vov) {
            id = beta * (vov * vdsA - 0.5 * vdsA * vdsA) * (1 + lambda * vdsA);
            gm = beta * vdsA * (1 + lambda * vdsA);
            gds = beta * (vov - vdsA) * (1 + lambda * vdsA) + beta * lambda * (vov * vdsA - 0.5 * vdsA * vdsA);
          } else {
            id = 0.5 * beta * vov * vov * (1 + lambda * vdsA);
            gm = beta * vov * (1 + lambda * vdsA);
            gds = 0.5 * beta * vov * vov * lambda + ctx.gmin;
          }
          if (reverse) id = -id;
          const sgn = reverse ? -1 : 1;
          const ieq = id - gm * vgs * sgn - gds * vds;
          if (nd >= 0 && ng >= 0) m.add(nd, ng, gm * sgn);
          if (nd >= 0 && ns >= 0) m.add(nd, ns, -gm * sgn);
          if (ns >= 0 && ng >= 0) m.add(ns, ng, -gm * sgn);
          if (ns >= 0) m.add(ns, ns, gm * sgn);
          this.stampConductance(m, nd, ns, gds);
          this.stampCurrent(m, nd, ns, pmos * ieq);
          st.extra!.id = pmos * id;
          if (ctx.transient) {
            const cgs = p(d, "cgs", 5e-12);
            const cgd = p(d, "cgd", 2e-12);
            const { a0 } = this.integrationCoeffs(ctx.dt);
            const g1 = a0 * cgs;
            const g2 = a0 * cgd;
            this.stampConductance(m, ng, ns, g1);
            this.stampCurrent(m, ng, ns, -g1 * st.hist[0]);
            this.stampConductance(m, ng, nd, g2);
            this.stampCurrent(m, ng, nd, -g2 * st.hist[1]);
          }
          break;
        }
        case "J": {
          // JFET: D, G, S
          const nd = this.idx(d.nodes[0]);
          const ng = this.idx(d.nodes[1]);
          const ns = this.idx(d.nodes[2]);
          const pch = p(d, "pjf", 0) > 0.5 ? -1 : 1;
          const beta = p(d, "beta", 1e-4);
          const vto = -Math.abs(p(d, "vto", 2));
          const lambda = p(d, "lambda", 0.01);
          const vgs = pch * (this.vOf(ng) - this.vOf(ns));
          const vds = pch * (this.vOf(nd) - this.vOf(ns));
          let id = 0;
          let gm = 0;
          let gds = ctx.gmin;
          const vov = vgs - vto;
          if (vov > 0) {
            if (vds < vov) {
              id = beta * vds * (2 * vov - vds) * (1 + lambda * vds);
              gm = 2 * beta * vds * (1 + lambda * vds);
              gds = 2 * beta * (vov - vds) * (1 + lambda * vds);
            } else {
              id = beta * vov * vov * (1 + lambda * vds);
              gm = 2 * beta * vov * (1 + lambda * vds);
              gds = beta * vov * vov * lambda + ctx.gmin;
            }
          }
          const ieq = id - gm * vgs - gds * vds;
          if (nd >= 0 && ng >= 0) m.add(nd, ng, gm);
          if (nd >= 0 && ns >= 0) m.add(nd, ns, -gm);
          if (ns >= 0 && ng >= 0) m.add(ns, ng, -gm);
          if (ns >= 0) m.add(ns, ns, gm);
          this.stampConductance(m, nd, ns, gds);
          this.stampCurrent(m, nd, ns, pch * ieq);
          st.extra!.id = pch * id;
          break;
        }
        case "SCR":
        case "TRIAC": {
          const on = st.extra!.on ?? 0;
          const g = on ? 1 / Math.max(p(d, "ron", 0.1), 1e-6) : 1e-9;
          this.stampConductance(m, n0, n1, g);
          st.extra!.id = (this.vOf(n0) - this.vOf(n1)) * g;
          break;
        }
        /* ---------------- behavioural macro models ---------------- */
        case "OPAMP":
        case "COMPARATOR": {
          // nodes: in+, in-, out  (+ optional v+, v-)
          const np = this.idx(d.nodes[0]);
          const nn = this.idx(d.nodes[1]);
          const no = this.idx(d.nodes[2]);
          const br = st.br;
          const gain = p(d, "gain", d.type === "COMPARATOR" ? 2e5 : 2e5);
          const vpos = d.nodes[3] !== undefined ? this.vOf(this.idx(d.nodes[3])) : p(d, "vcc", 15);
          const vneg = d.nodes[4] !== undefined ? this.vOf(this.idx(d.nodes[4])) : p(d, "vee", -15);
          const vsatH = vpos - p(d, "vdrop", 1.2);
          const vsatL = vneg + p(d, "vdrop", 1.2);
          const vd = this.vOf(np) - this.vOf(nn);
          const mid = (vsatH + vsatL) / 2;
          const span = Math.max((vsatH - vsatL) / 2, 0.1);
          const arg = (gain * vd) / span;
          const tanh = Math.tanh(Math.max(-40, Math.min(40, arg)));
          const vout = mid + span * tanh;
          const dv = (gain * (1 - tanh * tanh)) / 1;
          const rout = p(d, "rout", d.type === "COMPARATOR" ? 100 : 75);
          // branch: v(out) - rout*i = vout_lin  => linearised around vd
          if (no >= 0) {
            m.add(no, br, 1);
            m.add(br, no, 1);
          }
          m.add(br, br, -rout);
          if (np >= 0) m.add(br, np, -dv);
          if (nn >= 0) m.add(br, nn, dv);
          m.addRhs(br, vout - dv * vd);
          // differential input resistance
          this.stampConductance(m, np, nn, 1 / Math.max(p(d, "rin", 2e6), 1));
          st.extra!.vout = vout;
          break;
        }
        case "VREG": {
          // nodes: in, out, gnd(ref)
          const nin = this.idx(d.nodes[0]);
          const nout = this.idx(d.nodes[1]);
          const nref = this.idx(d.nodes[2]);
          const vset = p(d, "vout", 5);
          const dropout = p(d, "dropout", 2);
          const vin = this.vOf(nin) - this.vOf(nref);
          const target = Math.min(vset, Math.max(vin - dropout, 0)) * Math.sign(vset || 1);
          this.stampVoltageSoft(m, nout, nref, target + this.vOf(nref), p(d, "rout", 0.05));
          // input current path (rough): mirror output current
          this.stampConductance(m, nin, nref, 1e-4);
          st.extra!.vout = target;
          break;
        }
        case "GATE":
        case "DIGITAL":
        case "MCU":
        case "TIMER555":
        case "SEVENSEG": {
          this.stampBehavioural(d, ctx);
          break;
        }
        case "VOLTMETER":
          this.stampConductance(m, n0, n1, 1 / Math.max(p(d, "rin", 10e6), 1));
          break;
        case "PROBE":
        case "GROUND":
        default:
          break;
      }
      // gmin to ground on every node for numerical robustness
    }
    if (ctx.gmin > 0) {
      for (let i = 0; i < this.nodeNames.length; i++) m.add(i, i, ctx.gmin);
    }
  }

  /** Digital / behavioural devices drive their outputs with a Norton source. */
  private stampBehavioural(d: Device, ctx: StampContext): void {
    const m = this.matrix;
    const st = d.state!;
    const outs = st.outputs ?? [];
    const vdd = p(d, "vdd", 5);
    const rout = p(d, "rout", 100);
    switch (d.type) {
      case "GATE":
      case "DIGITAL":
      case "MCU": {
        // Special handling for DAC: analog output from mem.vout
        const model = (d.model ?? "").toLowerCase();
        if (model === "dac8") {
          const vout = (st.digital as any)?.vout ?? 0;
          // Assume last node is analog output
          const outNode = this.idx(d.nodes[d.nodes.length - 1] ?? d.nodes[0]);
          if (outNode >= 0) this.stampVoltageSoft(m, outNode, -1, vout, rout);
          break;
        }
        const outPins: number[] = (st.extra!.outPins as unknown as number[]) ?? [];
        void outPins;
        const pinList = (st.digital?.outCount ?? 0) | 0;
        void pinList;
        for (let i = 0; i < outs.length; i += 2) {
          const pinIdx = outs[i];
          const level = outs[i + 1];
          if (pinIdx < 0) continue;
          const node = this.idx(d.nodes[pinIdx]);
          if (level < 0) continue; // hi-Z
          this.stampVoltageSoft(m, node, -1, level * vdd, rout);
        }
        break;
      }
      case "TIMER555": {
        // nodes: GND, TRIG, OUT, RESET, CTRL, THRES, DISCH, VCC
        const nGnd = this.idx(d.nodes[0]);
        const nTrig = this.idx(d.nodes[1]);
        const nOut = this.idx(d.nodes[2]);
        const nRst = this.idx(d.nodes[3]);
        const nCtrl = this.idx(d.nodes[4]);
        const nThr = this.idx(d.nodes[5]);
        const nDis = this.idx(d.nodes[6]);
        const nVcc = this.idx(d.nodes[7]);
        const vcc = this.vOf(nVcc);
        const vGnd = this.vOf(nGnd);
        const q = st.extra!.q ?? 0;
        const vOutIdeal = q ? Math.max(vcc - 1.7, 0.1) : 0.1;
        // Output stage – Norton source with 10 ohm rout, track current
        this.stampVoltageSoft(m, nOut, nGnd, vOutIdeal, 10);
        const vOut = this.vOf(nOut);
        const iout = (vOutIdeal - (vOut - vGnd)) / 10;
        st.extra!.iout = iout;
        // Discharge transistor – open when q=1, closed (10 ohm to GND) when q=0
        const gd = q ? 1e-9 : 1 / 10;
        this.stampConductance(m, nDis, nGnd, gd);
        const vDis = this.vOf(nDis);
        st.extra!.idis = (vDis - vGnd) * gd;
        // Internal divider: 3x 5k between VCC and GND, CTRL is 2/3 VCC
        const rDiv = 5000;
        const gDiv = 1 / rDiv;
        // VCC - CTRL (5k)
        this.stampConductance(m, nVcc, nCtrl, gDiv);
        // CTRL - THR node? Actually divider: VCC-5k-CTRL-5k-THR? Simplified: CTRL to GND via 10k equivalent
        // Model as CTRL to GND via 10k (two 5k in series to GND) + TRIG divider reference
        this.stampConductance(m, nCtrl, nGnd, 1 / 10000);
        // Input bias conductances for TRIG, THR, RST to GND (high impedance ~1M) to allow small bias currents
        const gBias = 1e-6; // 1 Mohm
        this.stampConductance(m, nTrig, nGnd, gBias);
        this.stampConductance(m, nThr, nGnd, gBias);
        this.stampConductance(m, nRst, nGnd, gBias);
        // Bias currents (approx from datasheet: 0.25uA for THR/TRIG, 0.1mA for RST)
        const itrig = 0.5e-6;
        const ithr = 0.25e-6;
        const irst = nRst >= 0 ? 0.1e-3 : 0;
        const ictrl = (vcc - this.vOf(nCtrl)) * gDiv;
        st.extra!.itrig = itrig;
        st.extra!.ithr = ithr;
        st.extra!.irst = irst;
        st.extra!.ictrl = ictrl;
        // Supply current: divider + output + bias
        const iDiv = (vcc - vGnd) / 15000;
        st.extra!.isupply = iDiv + Math.abs(iout) * 0.1 + 0.003; // ~3mA quiescent + load
        st.extra!.ibias = itrig + ithr + irst;
        // Internal divider currents for stability
        this.stampConductance(m, nVcc, nGnd, 1 / 15000);
        break;
      }
      case "SEVENSEG": {
        for (let i = 0; i < d.nodes.length; i++) {
          const n = this.idx(d.nodes[i]);
          this.stampConductance(m, n, -1, 1 / 1e6);
        }
        break;
      }
      default:
        break;
    }
    void ctx;
  }

  /* --------------------------- solving --------------------------- */

  private converged(xNew: Float64Array): boolean {
    const { abstol, reltol, vntol } = this.options;
    const nNodes = this.nodeNames.length;
    if (this.limited) return false;
    for (let i = 0; i < this.size; i++) {
      const a = xNew[i];
      const b = this.x[i];
      if (!Number.isFinite(a)) return false;
      const tol = i < nNodes ? vntol + reltol * Math.max(Math.abs(a), Math.abs(b)) : abstol + reltol * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;
      if (Math.abs(a - b) > tol) return false;
    }
    return true;
  }

  iterate(ctx: StampContext): SolveResult {
    const maxIter = this.options.maxIter;
    let damping = 1;
    for (let iter = 0; iter < maxIter; iter++) {
      this.matrix.clear();
      this.limited = false;
      this.loadDevices(ctx);
      const sol = this.matrix.solve();
      if (!sol) return { ok: false, iterations: iter, message: "Singulaere Matrix (Knoten ohne DC-Pfad zur Masse?)" };
      if (iter > 20) damping = 0.6;
      if (iter > 50) damping = 0.3;
      const next = new Float64Array(this.size);
      for (let i = 0; i < this.size; i++) next[i] = this.x[i] + damping * (sol[i] - this.x[i]);
      const done = this.converged(next) && iter > 0;
      this.x = next;
      if (done) return { ok: true, iterations: iter + 1 };
    }
    return { ok: false, iterations: maxIter, message: "Keine Konvergenz (Newton-Raphson Grenze erreicht)" };
  }

  makeCtx(time: number, dt: number, transient: boolean, gmin = this.options.gmin, srcFactor = 1): StampContext {
    const tempK = this.options.temperature + KELVIN;
    return {
      time,
      dt,
      transient,
      gmin,
      srcFactor,
      vt: (BOLTZMANN * tempK) / CHARGE,
      temp: this.options.temperature,
    };
  }

  /** DC operating point with gmin stepping and source stepping fallbacks. */
  operatingPoint(): SolveResult {
    this.time = 0;
    this.x.fill(0);
    let res = this.iterate(this.makeCtx(0, 0, false));
    // settle digital / latch state at the operating point
    for (let pass = 0; pass < 12 && res.ok; pass++) {
      if (!this.updateEvents(0)) break;
      res = this.iterate(this.makeCtx(0, 0, false));
    }
    if (res.ok) return res;
    this.log.push("OP: Fallback auf Gmin-Stepping");
    for (const g of [1e-3, 1e-4, 1e-6, 1e-8, 1e-10, 1e-12]) {
      res = this.iterate(this.makeCtx(0, 0, false, g));
      if (!res.ok) break;
    }
    if (res.ok) return res;
    this.log.push("OP: Fallback auf Source-Stepping");
    this.x.fill(0);
    for (const f of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      res = this.iterate(this.makeCtx(0, 0, false, 1e-9, f));
      if (!res.ok) return res;
    }
    return res;
  }

  /**
   * Event phase: digital primitives, MCU code, latches and hysteresis switches
   * only change state between timesteps. This keeps Newton-Raphson continuous.
   */
  updateEvents(dt: number): boolean {
    let changed = false;
    for (const d of this.netlist.devices) {
      const st = d.state!;
      switch (d.type) {
        case "VSWITCH": {
          const vc = this.vOf(this.idx(d.nodes[2])) - this.vOf(this.idx(d.nodes[3]));
          const prev = st.extra!.on ?? 0;
          const on = vc > p(d, "von", 2.5) ? 1 : vc < p(d, "voff", 2.0) ? 0 : prev;
          if (on !== prev) changed = true;
          st.extra!.on = on;
          break;
        }
        case "SCR":
        case "TRIAC": {
          const vg = this.vOf(this.idx(d.nodes[2])) - this.vOf(this.idx(d.nodes[1]));
          const vak = this.vOf(this.idx(d.nodes[0])) - this.vOf(this.idx(d.nodes[1]));
          const prev = st.extra!.on ?? 0;
          let on = prev;
          const trig = vg > p(d, "vgt", 0.7);
          const ih = p(d, "ih", 1e-3);
          const iNow = Math.abs(st.extra!.id ?? 0);
          if (trig) on = 1;
          else if (d.type === "SCR" && (vak <= 0 || iNow < ih)) on = 0;
          else if (d.type === "TRIAC" && iNow < ih) on = 0;
          if (on !== prev) changed = true;
          st.extra!.on = on;
          break;
        }
        case "TIMER555": {
          const vcc = this.vOf(this.idx(d.nodes[7]));
          const vtrig = this.vOf(this.idx(d.nodes[1]));
          const vthres = this.vOf(this.idx(d.nodes[5]));
          const vreset = d.nodes[3] && this.idx(d.nodes[3]) >= 0 ? this.vOf(this.idx(d.nodes[3])) : vcc;
          const ctrl = d.nodes[4] && this.idx(d.nodes[4]) >= 0 ? this.vOf(this.idx(d.nodes[4])) : (2 / 3) * vcc;
          const prev = st.extra!.q ?? 0;
          let q = prev;
          if (vreset < 0.7) q = 0;
          else if (vtrig < ctrl / 2) q = 1;
          else if (vthres > ctrl) q = 0;
          if (q !== prev) changed = true;
          st.extra!.q = q;
          break;
        }
        case "GATE":
        case "DIGITAL": {
          const pins = d.nodes.map((n) => this.vOf(this.idx(n)));
          st.digital ??= {};
          const ports = evalDigital(d as DigitalDeviceLike, {
            time: this.time,
            dt,
            pinVoltages: pins,
            vdd: p(d, "vdd", 5),
            vth: p(d, "vth", p(d, "vdd", 5) / 2),
            mem: st.digital,
          });
          const outs: number[] = [];
          for (const port of ports) outs.push(port.pin, port.level);
          if (!st.outputs || st.outputs.join() !== outs.join()) changed = true;
          st.outputs = outs;
          break;
        }
        case "MCU": {
          const pins = d.nodes.map((n) => this.vOf(this.idx(n)));
          const key = d.id;
          let mcu = this.mcuStates.get(key);
          if (!mcu) {
            mcu = createMcuState();
            this.mcuStates.set(key, mcu);
          }
          let prog = this.mcuPrograms.get(key);
          if (!prog) {
            try {
              prog = parseMcuProgram(d.text ?? DEFAULT_MCU_SKETCH);
            } catch (e) {
              this.log.push(`MCU ${d.id}: ${(e as Error).message}`);
              prog = { setup: [], loop: [], functions: {} };
            }
            this.mcuPrograms.set(key, prog);
          }
          runMcu(mcu, prog, {
            time: this.time,
            pinVoltages: pins,
            vdd: p(d, "vdd", 5),
            analogPins: pins,
          });
          const outs: number[] = [];
          for (const [pin, level] of Object.entries(mcu.pinOut)) {
            const idx = Number(pin);
            if (idx >= 0 && idx < d.nodes.length) outs.push(idx, Number(level));
          }
          if (!st.outputs || st.outputs.join() !== outs.join()) changed = true;
          st.outputs = outs;
          break;
        }
        default:
          break;
      }
    }
    return changed;
  }

  /** Push accepted state into history buffers (called after a converged timestep). */
  acceptTimestep(dt: number): void {
    for (const d of this.netlist.devices) {
      const st = d.state!;
      const n0 = this.idx(d.nodes[0]);
      const n1 = this.idx(d.nodes[1]);
      switch (d.type) {
        case "C": {
          const v = this.vOf(n0) - this.vOf(n1);
          const geq = st.extra!.geq ?? 0;
          const ieq = st.extra!.ieq ?? 0;
          st.extra!.ilast = geq * v - ieq;
          for (let k = this.historyDepth - 1; k > 0; k--) st.hist[k] = st.hist[k - 1];
          st.hist[0] = v;
          break;
        }
        case "L": {
          const i = st.br >= 0 ? this.x[st.br] : 0;
          const v = this.vOf(n0) - this.vOf(n1);
          st.extra!.vlast = v;
          for (let k = this.historyDepth - 1; k > 0; k--) st.histI[k] = st.histI[k - 1];
          st.histI[0] = i;
          break;
        }
        case "TRANSFORMER": {
          st.histI[0] = st.br >= 0 ? this.x[st.br] : 0;
          st.extra!.i2 = st.br2 >= 0 ? this.x[st.br2] : 0;
          break;
        }
        case "D":
        case "LED":
        case "ZENER":
        case "SCHOTTKY": {
          const v = this.vOf(n0) - this.vOf(n1);
          st.extra!.icap = (st.extra!.geqC ?? 0) * v - (st.extra!.ieqC ?? 0);
          st.hist[0] = v;
          break;
        }
        case "Q": {
          st.hist[0] = this.vOf(this.idx(d.nodes[1])) - this.vOf(this.idx(d.nodes[2]));
          st.hist[1] = this.vOf(this.idx(d.nodes[1])) - this.vOf(this.idx(d.nodes[0]));
          break;
        }
        case "M": {
          st.hist[0] = this.vOf(this.idx(d.nodes[1])) - this.vOf(this.idx(d.nodes[2]));
          st.hist[1] = this.vOf(this.idx(d.nodes[1])) - this.vOf(this.idx(d.nodes[0]));
          break;
        }
        default:
          break;
      }
    }
    this.lastDt = dt;
  }

  /** Advance one transient step. Returns false when the step failed to converge. */
  step(dt: number): SolveResult {
    const t0 = this.time;
    const t = t0 + dt;
    this.time = t;
    this.updateEvents(dt);
    const res = this.iterate(this.makeCtx(t, dt, true));
    if (res.ok) {
      this.acceptTimestep(dt);
    } else {
      this.time = t0;
    }
    return res;
  }

  /** Snapshot of all node voltages. */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = { [GND]: 0 };
    for (let i = 0; i < this.nodeNames.length; i++) out[this.nodeNames[i]] = this.x[i];
    for (let i = 0; i < this.branchNames.length; i++) {
      out["I(" + this.branchNames[i] + ")"] = this.x[this.nodeNames.length + i];
    }
    return out;
  }
}
