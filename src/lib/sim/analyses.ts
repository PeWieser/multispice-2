/**
 * High level SPICE analyses built on top of the MNA kernel.
 *  .OP  .DC  .TRAN  .AC  .NOISE  .FOUR/THD  Monte-Carlo, Worst-Case, Temp-Sweep
 */

import { ComplexMatrix } from "./linalg";
import {
  Device,
  Netlist,
  SimOptions,
  Simulator,
  sourceValue,
} from "./engine";
import { fourier, spectrum } from "./fft";

export interface SweepSpec {
  start: number;
  stop: number;
  points: number;
  type: "dec" | "oct" | "lin";
}

export function sweepValues(s: SweepSpec): number[] {
  const out: number[] = [];
  if (s.type === "lin") {
    const n = Math.max(2, Math.floor(s.points));
    for (let i = 0; i < n; i++) out.push(s.start + ((s.stop - s.start) * i) / (n - 1));
    return out;
  }
  const perDecade = Math.max(2, Math.floor(s.points));
  const mult = s.type === "dec" ? Math.pow(10, 1 / perDecade) : Math.pow(2, 1 / perDecade);
  let f = Math.max(s.start, 1e-12);
  while (f <= s.stop * 1.0000001) {
    out.push(f);
    f *= mult;
  }
  return out;
}

const par = (d: Device, k: string, def: number) =>
  typeof d.params?.[k] === "number" && Number.isFinite(d.params[k]) ? d.params[k] : def;

/* ------------------------------------------------------------------ */
/* transient                                                           */
/* ------------------------------------------------------------------ */

export interface TransientOptions {
  stopTime: number;
  stepTime: number;
  startTime?: number;
  maxStep?: number;
  uic?: boolean;
  maxPoints?: number;
}

export interface TransientResult {
  time: number[];
  signals: Record<string, number[]>;
  ok: boolean;
  message?: string;
  steps: number;
  rejected: number;
}

export function runTransient(
  netlist: Netlist,
  options: Partial<SimOptions>,
  tran: TransientOptions,
  outputs: string[],
): TransientResult {
  const sim = new Simulator(netlist, options);
  const res: TransientResult = { time: [], signals: {}, ok: true, steps: 0, rejected: 0 };
  for (const o of outputs) res.signals[o] = [];
  if (!tran.uic) {
    const op = sim.operatingPoint();
    if (!op.ok) {
      res.ok = false;
      res.message = "DC-Arbeitspunkt: " + (op.message ?? "Fehler");
    }
  }
  sim.time = 0;
  const dtBase = Math.max(tran.stepTime, 1e-15);
  const maxPoints = tran.maxPoints ?? 20000;
  const startT = tran.startTime ?? 0;
  const decim = Math.max(1, Math.ceil(tran.stopTime / dtBase / maxPoints));
  let count = 0;
  let dt = dtBase;
  let guard = 0;
  while (sim.time < tran.stopTime && guard < maxPoints * decim * 4) {
    guard++;
    const r = sim.step(dt);
    if (!r.ok) {
      res.rejected++;
      dt = dt / 2;
      if (dt < dtBase / 1024) {
        res.ok = false;
        res.message = r.message ?? "Transiente Analyse konvergiert nicht";
        break;
      }
      continue;
    }
    dt = Math.min(dtBase, dt * 1.3);
    res.steps++;
    if (count % decim === 0 && sim.time >= startT) {
      res.time.push(sim.time);
      recordOutputs(sim, outputs, res.signals);
    }
    count++;
  }
  return res;
}

export function recordOutputs(
  sim: Simulator,
  outputs: string[],
  store: Record<string, number[]>,
): void {
  const snap = sim.snapshot();
  for (const o of outputs) {
    let v = 0;
    if (o.startsWith("I(")) {
      const id = o.slice(2, -1);
      v = sim.branchCurrent(id);
      if (v === 0 && snap[o] !== undefined) v = snap[o];
    } else {
      v = snap[o] ?? 0;
    }
    (store[o] ??= []).push(v);
  }
}

/* ------------------------------------------------------------------ */
/* DC operating point + DC sweep                                       */
/* ------------------------------------------------------------------ */

export interface OpResult {
  ok: boolean;
  message?: string;
  nodes: Record<string, number>;
  currents: Record<string, number>;
  power: Record<string, number>;
}

export function runOperatingPoint(netlist: Netlist, options: Partial<SimOptions>): OpResult {
  const sim = new Simulator(netlist, options);
  const r = sim.operatingPoint();
  const nodes: Record<string, number> = {};
  const currents: Record<string, number> = {};
  const power: Record<string, number> = {};
  const snap = sim.snapshot();
  for (const [k, v] of Object.entries(snap)) {
    if (k.startsWith("I(")) currents[k] = v;
    else nodes[k] = v;
  }
  for (const d of sim.netlist.devices) {
    const i = sim.deviceCurrent(d);
    const va = sim.nodeVoltage(d.nodes[0] ?? "0");
    const vb = sim.nodeVoltage(d.nodes[1] ?? "0");
    currents["I(" + d.id + ")"] = i;
    power["P(" + d.id + ")"] = (va - vb) * i;
  }
  return { ok: r.ok, message: r.message, nodes, currents, power };
}

export interface DcSweepResult {
  values: number[];
  signals: Record<string, number[]>;
  ok: boolean;
  message?: string;
}

export function runDcSweep(
  netlist: Netlist,
  options: Partial<SimOptions>,
  sourceId: string,
  sweep: SweepSpec,
  outputs: string[],
): DcSweepResult {
  const values = sweepValues(sweep);
  const out: DcSweepResult = { values: [], signals: {}, ok: true };
  for (const o of outputs) out.signals[o] = [];
  const sim = new Simulator(netlist, options);
  const target = sim.netlist.devices.find((d) => d.id === sourceId);
  if (!target) return { ...out, ok: false, message: `Quelle ${sourceId} nicht gefunden` };
  const original = target.source ? { ...target.source } : undefined;
  for (const v of values) {
    target.source = { ...(original ?? { kind: "dc" }), kind: "dc", dc: v };
    const r = sim.operatingPoint();
    if (!r.ok) {
      out.ok = false;
      out.message = r.message;
      break;
    }
    out.values.push(v);
    recordOutputs(sim, outputs, out.signals);
  }
  if (original) target.source = original;
  return out;
}

/* ------------------------------------------------------------------ */
/* AC small signal analysis                                            */
/* ------------------------------------------------------------------ */

function nodeIdx(sim: Simulator, name: string | undefined): number {
  if (sim.isGround(name)) return -1;
  return sim.nodeIndex.get((name ?? "").trim()) ?? -1;
}

function acStampG(cm: ComplexMatrix, a: number, b: number, gr: number, gi: number): void {
  if (a >= 0) cm.add(a, a, gr, gi);
  if (b >= 0) cm.add(b, b, gr, gi);
  if (a >= 0 && b >= 0) {
    cm.add(a, b, -gr, -gi);
    cm.add(b, a, -gr, -gi);
  }
}

/** Builds the complex MNA system linearised around the current operating point. */
export function buildAcMatrix(sim: Simulator, omega: number, inject?: { a: number; b: number }): ComplexMatrix {
  const cm = new ComplexMatrix(sim.size);
  const vt = (1.380649e-23 * (sim.options.temperature + 273.15)) / 1.602176634e-19;
  for (const d of sim.netlist.devices) {
    const st = d.state!;
    const n0 = nodeIdx(sim, d.nodes[0]);
    const n1 = nodeIdx(sim, d.nodes[1]);
    switch (d.type) {
      case "R":
      case "FUSE":
      case "LAMP":
        acStampG(cm, n0, n1, 1 / sim.resistance(d), 0);
        break;
      case "POT": {
        const nw = nodeIdx(sim, d.nodes[1]);
        const nb = nodeIdx(sim, d.nodes[2]);
        const total = Math.max(par(d, "r", 10000), 1e-6);
        const pos = Math.min(0.9999, Math.max(0.0001, sim.controls[d.id] ?? par(d, "pos", 0.5)));
        acStampG(cm, n0, nw, 1 / (total * pos), 0);
        acStampG(cm, nw, nb, 1 / (total * (1 - pos)), 0);
        break;
      }
      case "C":
        acStampG(cm, n0, n1, 0, omega * Math.max(par(d, "c", 1e-6), 1e-18));
        break;
      case "L": {
        const br = st.br;
        const l = Math.max(par(d, "l", 1e-3), 1e-15);
        if (n0 >= 0) {
          cm.add(n0, br, 1, 0);
          cm.add(br, n0, 1, 0);
        }
        if (n1 >= 0) {
          cm.add(n1, br, -1, 0);
          cm.add(br, n1, -1, 0);
        }
        cm.add(br, br, -par(d, "rser", 1e-6), -omega * l);
        break;
      }
      case "TRANSFORMER": {
        const np = nodeIdx(sim, d.nodes[0]);
        const nm = nodeIdx(sim, d.nodes[1]);
        const sp = nodeIdx(sim, d.nodes[2]);
        const sm = nodeIdx(sim, d.nodes[3]);
        const lp = Math.max(par(d, "lp", 1), 1e-9);
        const ratio = Math.max(par(d, "ratio", 1), 1e-6);
        const ls = lp / (ratio * ratio);
        const mut = Math.min(0.9999, par(d, "k", 0.999)) * Math.sqrt(lp * ls);
        const b1 = st.br;
        const b2 = st.br2;
        if (np >= 0) {
          cm.add(np, b1, 1, 0);
          cm.add(b1, np, 1, 0);
        }
        if (nm >= 0) {
          cm.add(nm, b1, -1, 0);
          cm.add(b1, nm, -1, 0);
        }
        if (sp >= 0) {
          cm.add(sp, b2, 1, 0);
          cm.add(b2, sp, 1, 0);
        }
        if (sm >= 0) {
          cm.add(sm, b2, -1, 0);
          cm.add(b2, sm, -1, 0);
        }
        cm.add(b1, b1, 0, -omega * lp);
        cm.add(b1, b2, 0, -omega * mut);
        cm.add(b2, b2, 0, -omega * ls);
        cm.add(b2, b1, 0, -omega * mut);
        break;
      }
      case "V":
      case "AMMETER": {
        const br = st.br;
        if (n0 >= 0) {
          cm.add(n0, br, 1, 0);
          cm.add(br, n0, 1, 0);
        }
        if (n1 >= 0) {
          cm.add(n1, br, -1, 0);
          cm.add(br, n1, -1, 0);
        }
        cm.add(br, br, -par(d, "rser", 1e-9), 0);
        if (!inject && d.type === "V") {
          const mag = d.source?.acMag ?? 0;
          const ph = ((d.source?.acPhase ?? 0) * Math.PI) / 180;
          cm.addRhs(br, mag * Math.cos(ph), mag * Math.sin(ph));
        }
        break;
      }
      case "I": {
        if (!inject) {
          const mag = d.source?.acMag ?? 0;
          const ph = ((d.source?.acPhase ?? 0) * Math.PI) / 180;
          if (n0 >= 0) cm.addRhs(n0, -mag * Math.cos(ph), -mag * Math.sin(ph));
          if (n1 >= 0) cm.addRhs(n1, mag * Math.cos(ph), mag * Math.sin(ph));
        }
        break;
      }
      case "E": {
        const br = st.br;
        const cp = nodeIdx(sim, d.nodes[2]);
        const cmn = nodeIdx(sim, d.nodes[3]);
        const gain = par(d, "gain", 1);
        if (n0 >= 0) {
          cm.add(n0, br, 1, 0);
          cm.add(br, n0, 1, 0);
        }
        if (n1 >= 0) {
          cm.add(n1, br, -1, 0);
          cm.add(br, n1, -1, 0);
        }
        if (cp >= 0) cm.add(br, cp, -gain, 0);
        if (cmn >= 0) cm.add(br, cmn, gain, 0);
        break;
      }
      case "G": {
        const cp = nodeIdx(sim, d.nodes[2]);
        const cmn = nodeIdx(sim, d.nodes[3]);
        const gm = par(d, "gain", 1e-3);
        if (n0 >= 0 && cp >= 0) cm.add(n0, cp, gm, 0);
        if (n0 >= 0 && cmn >= 0) cm.add(n0, cmn, -gm, 0);
        if (n1 >= 0 && cp >= 0) cm.add(n1, cp, -gm, 0);
        if (n1 >= 0 && cmn >= 0) cm.add(n1, cmn, gm, 0);
        break;
      }
      case "SWITCH":
      case "PUSHBUTTON":
      case "DIPSWITCH":
      case "RELAY_CONTACT": {
        const closed = (sim.controls[d.id] ?? par(d, "closed", 0)) > 0.5;
        acStampG(cm, n0, n1, closed ? 1 / Math.max(par(d, "ron", 0.01), 1e-6) : 1e-12, 0);
        break;
      }
      case "D":
      case "LED":
      case "ZENER":
      case "SCHOTTKY": {
        const is = par(d, "is", 1e-14);
        const n = par(d, "n", d.type === "LED" ? 2 : 1);
        const vd = st.vprev[0];
        const gd = (is * Math.exp(Math.min(vd / (n * vt), 60))) / (n * vt) + 1e-12;
        acStampG(cm, n0, n1, gd, 0);
        acStampG(cm, n0, n1, 0, omega * (par(d, "cjo", 1e-12) + par(d, "tt", 0) * gd));
        break;
      }
      case "Q": {
        const nc = nodeIdx(sim, d.nodes[0]);
        const nb = nodeIdx(sim, d.nodes[1]);
        const ne = nodeIdx(sim, d.nodes[2]);
        const is = par(d, "is", 1e-15);
        const bf = Math.max(par(d, "bf", 200), 1e-3);
        const vaf = par(d, "vaf", 100);
        const vbe = st.vprev[0];
        const evbe = Math.exp(Math.min(vbe / vt, 60));
        const gpi = (is * evbe) / (bf * vt) + 1e-12;
        const gm = (is * evbe) / vt;
        const ic = Math.abs(st.extra?.ic ?? 0);
        const go = ic / vaf + 1e-9;
        acStampG(cm, nb, ne, gpi, 0);
        acStampG(cm, nc, ne, go, 0);
        if (nc >= 0 && nb >= 0) cm.add(nc, nb, gm, 0);
        if (nc >= 0 && ne >= 0) cm.add(nc, ne, -gm, 0);
        if (ne >= 0 && nb >= 0) cm.add(ne, nb, -gm, 0);
        if (ne >= 0) cm.add(ne, ne, gm, 0);
        acStampG(cm, nb, ne, 0, omega * par(d, "cje", 5e-12));
        acStampG(cm, nb, nc, 0, omega * par(d, "cjc", 2e-12));
        break;
      }
      case "M": {
        const nd = nodeIdx(sim, d.nodes[0]);
        const ng = nodeIdx(sim, d.nodes[1]);
        const ns = nodeIdx(sim, d.nodes[2]);
        const kp = par(d, "kp", 2e-5);
        const w = par(d, "w", 1e-4);
        const l = par(d, "l", 1e-5);
        const beta = (kp * w) / l;
        const vgs = st.vprev[0];
        const vth = Math.abs(par(d, "vto", 2));
        const vov = Math.max(vgs - vth, 0);
        const gm = beta * vov;
        const gds = Math.max(0.5 * beta * vov * vov * par(d, "lambda", 0.02), 1e-9);
        if (nd >= 0 && ng >= 0) cm.add(nd, ng, gm, 0);
        if (nd >= 0 && ns >= 0) cm.add(nd, ns, -gm, 0);
        if (ns >= 0 && ng >= 0) cm.add(ns, ng, -gm, 0);
        if (ns >= 0) cm.add(ns, ns, gm, 0);
        acStampG(cm, nd, ns, gds, 0);
        acStampG(cm, ng, ns, 0, omega * par(d, "cgs", 5e-12));
        acStampG(cm, ng, nd, 0, omega * par(d, "cgd", 2e-12));
        break;
      }
      case "OPAMP":
      case "COMPARATOR": {
        const np = nodeIdx(sim, d.nodes[0]);
        const nn = nodeIdx(sim, d.nodes[1]);
        const no = nodeIdx(sim, d.nodes[2]);
        const br = st.br;
        const a0 = par(d, "gain", 2e5);
        const gbw = par(d, "gbw", 1e6);
        const wp = (2 * Math.PI * gbw) / a0;
        // A(jw) = A0 / (1 + jw/wp)
        const den = 1 + (omega / wp) * (omega / wp);
        const ar = a0 / den;
        const ai = (-a0 * (omega / wp)) / den;
        const rout = par(d, "rout", 75);
        if (no >= 0) {
          cm.add(no, br, 1, 0);
          cm.add(br, no, 1, 0);
        }
        cm.add(br, br, -rout, 0);
        if (np >= 0) cm.add(br, np, -ar, -ai);
        if (nn >= 0) cm.add(br, nn, ar, ai);
        acStampG(cm, np, nn, 1 / Math.max(par(d, "rin", 2e6), 1), 0);
        break;
      }
      case "VREG": {
        acStampG(cm, nodeIdx(sim, d.nodes[1]), nodeIdx(sim, d.nodes[2]), 1 / Math.max(par(d, "rout", 0.05), 1e-6), 0);
        break;
      }
      case "GATE":
      case "DIGITAL":
      case "MCU":
      case "TIMER555": {
        for (let i = 0; i < d.nodes.length; i++) {
          acStampG(cm, nodeIdx(sim, d.nodes[i]), -1, 1e-9, 0);
        }
        break;
      }
      case "VOLTMETER":
        acStampG(cm, n0, n1, 1 / Math.max(par(d, "rin", 10e6), 1), 0);
        break;
      default:
        break;
    }
  }
  for (let i = 0; i < sim.nodeNames.length; i++) cm.add(i, i, 1e-12, 0);
  if (inject) {
    if (inject.a >= 0) cm.addRhs(inject.a, -1, 0);
    if (inject.b >= 0) cm.addRhs(inject.b, 1, 0);
  }
  return cm;
}

export interface AcResult {
  freq: number[];
  magDb: Record<string, number[]>;
  phase: Record<string, number[]>;
  mag: Record<string, number[]>;
  ok: boolean;
  message?: string;
}

export function runAcSweep(
  netlist: Netlist,
  options: Partial<SimOptions>,
  sweep: SweepSpec,
  outputs: string[],
): AcResult {
  const sim = new Simulator(netlist, options);
  const op = sim.operatingPoint();
  const result: AcResult = { freq: [], magDb: {}, phase: {}, mag: {}, ok: op.ok, message: op.message };
  for (const o of outputs) {
    result.magDb[o] = [];
    result.phase[o] = [];
    result.mag[o] = [];
  }
  for (const f of sweepValues(sweep)) {
    const cm = buildAcMatrix(sim, 2 * Math.PI * f);
    const sol = cm.solve();
    if (!sol) {
      result.ok = false;
      result.message = `AC: singulaere Matrix bei ${f.toPrecision(4)} Hz`;
      break;
    }
    result.freq.push(f);
    for (const o of outputs) {
      const i = sim.nodeIndex.get(o);
      const re = i === undefined ? 0 : sol.re[i];
      const im = i === undefined ? 0 : sol.im[i];
      const m = Math.hypot(re, im);
      result.mag[o].push(m);
      result.magDb[o].push(20 * Math.log10(Math.max(m, 1e-18)));
      result.phase[o].push((Math.atan2(im, re) * 180) / Math.PI);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* noise                                                               */
/* ------------------------------------------------------------------ */

export interface NoiseResult {
  freq: number[];
  outputNoise: number[];
  inputNoise: number[];
  totalRms: number;
  contributors: Array<{ id: string; contribution: number }>;
  ok: boolean;
  message?: string;
}

export function runNoise(
  netlist: Netlist,
  options: Partial<SimOptions>,
  sweep: SweepSpec,
  outNode: string,
  inputSourceId: string,
): NoiseResult {
  const sim = new Simulator(netlist, options);
  const op = sim.operatingPoint();
  const kT4 = 4 * 1.380649e-23 * ((options.temperature ?? 27) + 273.15);
  const out: NoiseResult = {
    freq: [],
    outputNoise: [],
    inputNoise: [],
    totalRms: 0,
    contributors: [],
    ok: op.ok,
    message: op.message,
  };
  const outIdx = sim.nodeIndex.get(outNode);
  if (outIdx === undefined) return { ...out, ok: false, message: `Ausgangsknoten ${outNode} unbekannt` };

  const sources: Array<{ id: string; a: number; b: number; psd: number }> = [];
  for (const d of sim.netlist.devices) {
    const a = nodeIdx(sim, d.nodes[0]);
    const b = nodeIdx(sim, d.nodes[1]);
    if (d.type === "R") sources.push({ id: d.id, a, b, psd: kT4 / sim.resistance(d) });
    else if (d.type === "D" || d.type === "LED" || d.type === "ZENER")
      sources.push({ id: d.id, a, b, psd: 2 * 1.602176634e-19 * Math.abs(d.state?.extra?.id ?? 0) });
    else if (d.type === "Q")
      sources.push({
        id: d.id,
        a: nodeIdx(sim, d.nodes[0]),
        b: nodeIdx(sim, d.nodes[2]),
        psd: 2 * 1.602176634e-19 * Math.abs(d.state?.extra?.ic ?? 0),
      });
  }
  const contrib = new Map<string, number>();
  const freqs = sweepValues(sweep);
  let gainRef = 1;
  for (const f of freqs) {
    const w = 2 * Math.PI * f;
    let total = 0;
    for (const s of sources) {
      const cm = buildAcMatrix(sim, w, { a: s.a, b: s.b });
      const sol = cm.solve();
      if (!sol) continue;
      const z = Math.hypot(sol.re[outIdx], sol.im[outIdx]);
      const c = z * z * s.psd;
      total += c;
      contrib.set(s.id, (contrib.get(s.id) ?? 0) + c);
    }
    // transfer gain from input source to output for input referred noise
    const cmS = buildAcMatrix(sim, w);
    const solS = cmS.solve();
    if (solS) {
      const src = sim.netlist.devices.find((d) => d.id === inputSourceId);
      const mag = src?.source?.acMag ?? 1;
      gainRef = Math.max(Math.hypot(solS.re[outIdx], solS.im[outIdx]) / Math.max(mag, 1e-18), 1e-18);
    }
    out.freq.push(f);
    out.outputNoise.push(Math.sqrt(total));
    out.inputNoise.push(Math.sqrt(total) / gainRef);
  }
  // integrate (trapezoid over frequency) for total RMS
  let acc = 0;
  for (let i = 1; i < out.freq.length; i++) {
    const df = out.freq[i] - out.freq[i - 1];
    const a = out.outputNoise[i - 1] ** 2;
    const b = out.outputNoise[i] ** 2;
    acc += 0.5 * (a + b) * df;
  }
  out.totalRms = Math.sqrt(acc);
  out.contributors = [...contrib.entries()]
    .map(([id, contribution]) => ({ id, contribution }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 12);
  return out;
}

/* ------------------------------------------------------------------ */
/* statistical analyses                                                */
/* ------------------------------------------------------------------ */

export interface MonteCarloOptions {
  runs: number;
  tolerance: number;
  measure: "vout-peak" | "vout-rms" | "vout-dc" | "gain-db";
  outNode: string;
  seed?: number;
}

export interface MonteCarloResult {
  samples: number[];
  mean: number;
  sigma: number;
  min: number;
  max: number;
  histogram: Array<{ x: number; count: number }>;
  yieldPct: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneNetlist(n: Netlist): Netlist {
  return {
    title: n.title,
    devices: n.devices.map((d) => ({
      ...d,
      nodes: [...d.nodes],
      params: { ...d.params },
      source: d.source ? { ...d.source } : undefined,
      state: undefined,
    })),
  };
}

function measureValue(
  netlist: Netlist,
  options: Partial<SimOptions>,
  mc: MonteCarloOptions,
  tran: TransientOptions,
): number {
  if (mc.measure === "vout-dc") {
    const op = runOperatingPoint(netlist, options);
    return op.nodes[mc.outNode] ?? 0;
  }
  if (mc.measure === "gain-db") {
    const ac = runAcSweep(netlist, options, { start: 10, stop: 100000, points: 5, type: "dec" }, [mc.outNode]);
    const arr = ac.magDb[mc.outNode] ?? [];
    return arr.length ? Math.max(...arr) : 0;
  }
  const tr = runTransient(netlist, options, tran, [mc.outNode]);
  const sig = tr.signals[mc.outNode] ?? [];
  if (!sig.length) return 0;
  if (mc.measure === "vout-rms") {
    const s = sig.reduce((acc, v) => acc + v * v, 0) / sig.length;
    return Math.sqrt(s);
  }
  return Math.max(...sig);
}

export function runMonteCarlo(
  netlist: Netlist,
  options: Partial<SimOptions>,
  mc: MonteCarloOptions,
  tran: TransientOptions,
): MonteCarloResult {
  const rand = mulberry32(mc.seed ?? 12345);
  const samples: number[] = [];
  for (let i = 0; i < Math.max(1, Math.min(mc.runs, 400)); i++) {
    const nl = cloneNetlist(netlist);
    for (const d of nl.devices) {
      const tol = (d.params.tol ?? mc.tolerance) / 100;
      const gauss = (rand() + rand() + rand() + rand() - 2) / 2;
      const f = 1 + gauss * tol;
      if (d.type === "R" && d.params.r) d.params.r *= f;
      if (d.type === "C" && d.params.c) d.params.c *= f;
      if (d.type === "L" && d.params.l) d.params.l *= f;
      if (d.type === "Q" && d.params.bf) d.params.bf *= f;
    }
    samples.push(measureValue(nl, options, mc, tran));
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const sigma = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(samples.length - 1, 1));
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const bins = 16;
  const histogram: Array<{ x: number; count: number }> = [];
  const span = Math.max(max - min, 1e-12);
  for (let i = 0; i < bins; i++) histogram.push({ x: min + (span * (i + 0.5)) / bins, count: 0 });
  for (const s of samples) {
    const b = Math.min(bins - 1, Math.floor(((s - min) / span) * bins));
    histogram[b].count++;
  }
  const within = samples.filter((s) => Math.abs(s - mean) <= 3 * sigma).length;
  return { samples, mean, sigma, min, max, histogram, yieldPct: (100 * within) / samples.length };
}

export interface WorstCaseResult {
  nominal: number;
  low: number;
  high: number;
  sensitivities: Array<{ id: string; param: string; sensitivity: number }>;
}

export function runWorstCase(
  netlist: Netlist,
  options: Partial<SimOptions>,
  mc: MonteCarloOptions,
  tran: TransientOptions,
): WorstCaseResult {
  const nominal = measureValue(netlist, options, mc, tran);
  const sens: WorstCaseResult["sensitivities"] = [];
  const tol = mc.tolerance / 100;
  for (const d of netlist.devices) {
    const key = d.type === "R" ? "r" : d.type === "C" ? "c" : d.type === "L" ? "l" : null;
    if (!key || !d.params[key]) continue;
    const nl = cloneNetlist(netlist);
    const target = nl.devices.find((x) => x.id === d.id)!;
    target.params[key] *= 1 + tol;
    const v = measureValue(nl, options, mc, tran);
    sens.push({ id: d.id, param: key, sensitivity: (v - nominal) / Math.max(Math.abs(nominal), 1e-12) / tol });
  }
  const mkCorner = (sign: number) => {
    const nl = cloneNetlist(netlist);
    for (const s of sens) {
      const target = nl.devices.find((x) => x.id === s.id);
      if (!target) continue;
      target.params[s.param] *= 1 + sign * Math.sign(s.sensitivity || 1) * tol;
    }
    return measureValue(nl, options, mc, tran);
  };
  return { nominal, low: mkCorner(-1), high: mkCorner(1), sensitivities: sens.sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity)).slice(0, 12) };
}

export interface TempSweepResult {
  temps: number[];
  values: number[];
}

export function runTempSweep(
  netlist: Netlist,
  options: Partial<SimOptions>,
  temps: number[],
  mc: MonteCarloOptions,
  tran: TransientOptions,
): TempSweepResult {
  const values = temps.map((t) => measureValue(netlist, { ...options, temperature: t }, mc, tran));
  return { temps, values };
}

/* ------------------------------------------------------------------ */
/* distortion                                                          */
/* ------------------------------------------------------------------ */

export interface ThdResult {
  thdPercent: number;
  thdDb: number;
  harmonics: Array<{ n: number; freq: number; mag: number; relative: number; phase: number }>;
  spectrumFreq: number[];
  spectrumDb: number[];
}

export function runThd(
  netlist: Netlist,
  options: Partial<SimOptions>,
  fundamental: number,
  outNode: string,
  periods = 12,
): ThdResult {
  const stop = periods / fundamental;
  const step = 1 / (fundamental * 2048);
  const tr = runTransient(netlist, options, { stopTime: stop, stepTime: step, maxPoints: 40000 }, [outNode]);
  const sig = tr.signals[outNode] ?? [];
  const f = fourier(tr.time, sig, fundamental, 10);
  const sr = sig.length > 1 ? (sig.length - 1) / Math.max(tr.time[tr.time.length - 1] - tr.time[0], 1e-12) : 1;
  const sp = spectrum(sig, sr, "blackman");
  return {
    thdPercent: f.thd * 100,
    thdDb: f.thdDb,
    harmonics: f.harmonics,
    spectrumFreq: sp.freq,
    spectrumDb: sp.magDb,
  };
}

/** Utility for the IV curve tracer instrument. */
export function runIvCurve(
  netlist: Netlist,
  options: Partial<SimOptions>,
  sweepSourceId: string,
  sweep: SweepSpec,
  stepSourceId: string | null,
  stepValues: number[],
  measureDeviceId: string,
): Array<{ label: string; x: number[]; y: number[] }> {
  const curves: Array<{ label: string; x: number[]; y: number[] }> = [];
  const steps = stepSourceId ? stepValues : [0];
  for (const sv of steps) {
    const nl = cloneNetlist(netlist);
    if (stepSourceId) {
      const s = nl.devices.find((d) => d.id === stepSourceId);
      if (s) s.source = { kind: "dc", dc: sv };
    }
    const sim = new Simulator(nl, options);
    const target = sim.netlist.devices.find((d) => d.id === sweepSourceId);
    const meas = sim.netlist.devices.find((d) => d.id === measureDeviceId);
    const x: number[] = [];
    const y: number[] = [];
    if (target && meas) {
      for (const v of sweepValues(sweep)) {
        target.source = { kind: "dc", dc: v };
        const r = sim.operatingPoint();
        if (!r.ok) continue;
        x.push(v);
        y.push(sim.deviceCurrent(meas));
      }
    }
    curves.push({ label: stepSourceId ? `${sv.toPrecision(3)}` : "IV", x, y });
  }
  return curves;
}

export { sourceValue };
