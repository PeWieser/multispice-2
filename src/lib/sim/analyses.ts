/**
 * High level SPICE analyses built on top of the MNA kernel.
 *  .OP  .DC  .TRAN  .AC  .NOISE  .FOUR/THD  Monte-Carlo, Worst-Case, Temp-Sweep
 */

import { ComplexMatrix, RealMatrix } from "./linalg";
import {
  Device,
  Netlist,
  SimOptions,
  Simulator,
  depletionCap,
  sourceValue,
  tempScaledBF,
  tempScaledIS,
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

/** S2.1: Fortschritt als Bruch 0..1 (Worker → UI). */
export type ProgressFn = (frac: number) => void;

/**
 * S2.1: meldet Fortschritt höchstens in 2-%-Schritten (Worker-Nachrichten
 * sind billig, aber nicht gratis — 20 000 Schritt-Meldungen wären es nicht).
 */
export function progressReporter(progress: ProgressFn | undefined): (frac: number) => void {
  let last = -1;
  return (frac: number) => {
    if (!progress) return;
    const f = Math.min(1, Math.max(0, frac));
    if (f >= 1 || f - last >= 0.02) {
      last = f;
      progress(f);
    }
  };
}

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
  /** S2.2: Konvergenz-Diagnose (nur bei ok:false belegt). */
  failure?: "singular" | "nonconvergent";
  suspects?: string[];
  steps: number;
  rejected: number;
}

export function runTransient(
  netlist: Netlist,
  options: Partial<SimOptions>,
  tran: TransientOptions,
  outputs: string[],
  progress?: ProgressFn,
): TransientResult {
  const sim = new Simulator(netlist, options);
  const res: TransientResult = { time: [], signals: {}, ok: true, steps: 0, rejected: 0 };
  for (const o of outputs) res.signals[o] = [];
  if (!tran.uic) {
    const op = sim.operatingPoint();
    if (!op.ok) {
      res.ok = false;
      res.message = "DC-Arbeitspunkt: " + (op.message ?? "Fehler");
      res.failure = op.failure;
      res.suspects = op.suspects;
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
  const report = progressReporter(progress);
  while (sim.time < tran.stopTime && guard < maxPoints * decim * 4) {
    guard++;
    const r = sim.step(dt);
    if (!r.ok) {
      res.rejected++;
      dt = dt / 2;
      if (dt < dtBase / 1024) {
        res.ok = false;
        res.message = r.message ?? "Transiente Analyse konvergiert nicht";
        res.failure = r.failure;
        res.suspects = r.suspects;
        break;
      }
      continue;
    }
    dt = Math.min(dtBase, dt * 1.3);
    res.steps++;
    report(sim.time / Math.max(tran.stopTime, 1e-18));
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
  /** S2.2: Konvergenz-Diagnose (nur bei ok:false belegt). */
  failure?: "singular" | "nonconvergent";
  suspects?: string[];
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
  return { ok: r.ok, message: r.message, failure: r.failure, suspects: r.suspects, nodes, currents, power };
}

export interface DcSweepResult {
  values: number[];
  signals: Record<string, number[]>;
  ok: boolean;
  message?: string;
  /** S2.2: Konvergenz-Diagnose (nur bei ok:false belegt). */
  failure?: "singular" | "nonconvergent";
  suspects?: string[];
}

export function runDcSweep(
  netlist: Netlist,
  options: Partial<SimOptions>,
  sourceId: string,
  sweep: SweepSpec,
  outputs: string[],
  progress?: ProgressFn,
): DcSweepResult {
  const values = sweepValues(sweep);
  const out: DcSweepResult = { values: [], signals: {}, ok: true };
  for (const o of outputs) out.signals[o] = [];
  const sim = new Simulator(netlist, options);
  const target = sim.netlist.devices.find((d) => d.id === sourceId);
  if (!target) return { ...out, ok: false, message: `Quelle ${sourceId} nicht gefunden` };
  const original = target.source ? { ...target.source } : undefined;
  const report = progressReporter(progress);
  for (let vi = 0; vi < values.length; vi++) {
    const v = values[vi];
    target.source = { ...(original ?? { kind: "dc" }), kind: "dc", dc: v };
    const r = sim.operatingPoint();
    if (!r.ok) {
      out.ok = false;
      out.message = r.message;
      out.failure = r.failure;
      out.suspects = r.suspects;
      break;
    }
    out.values.push(v);
    recordOutputs(sim, outputs, out.signals);
    report((vi + 1) / values.length);
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
      case "F": {
        // CCCS: Der DC-Kern misst den Steuerstrom über einen Sense-Leitwert
        // (gsense, siehe engine.ts) — in AC exakt nachgebildet: Strom
        // beta·gsense·(Vcp−Vcm) von n0 nach n1 plus Sense-Leitwert.
        const cp = nodeIdx(sim, d.nodes[2]);
        const cmn = nodeIdx(sim, d.nodes[3]);
        const gsense = 1e6;
        const gm = par(d, "gain", 1) * gsense;
        acStampG(cm, cp, cmn, gsense, 0);
        if (n0 >= 0 && cp >= 0) cm.add(n0, cp, gm, 0);
        if (n0 >= 0 && cmn >= 0) cm.add(n0, cmn, -gm, 0);
        if (n1 >= 0 && cp >= 0) cm.add(n1, cp, -gm, 0);
        if (n1 >= 0 && cmn >= 0) cm.add(n1, cmn, gm, 0);
        break;
      }
      case "H": {
        // CCVS: V(n0)−V(n1) = rm·gsense·(Vcp−Vcm), wie E gestempelt.
        const br = st.br;
        const cp = nodeIdx(sim, d.nodes[2]);
        const cmn = nodeIdx(sim, d.nodes[3]);
        const gsense = 1e6;
        const gain = par(d, "gain", 1) * gsense;
        acStampG(cm, cp, cmn, gsense, 0);
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
      case "SWITCH":
      case "PUSHBUTTON":
      case "DIPSWITCH":
      case "RELAY_CONTACT": {
        const closed = (sim.controls[d.id] ?? par(d, "closed", 0)) > 0.5;
        acStampG(cm, n0, n1, closed ? 1 / Math.max(par(d, "ron", 0.01), 1e-6) : 1e-12, 0);
        break;
      }
      case "VSWITCH": {
        // Kleinsignal am OP-Schaltzustand (updateEvents läuft im operatingPoint).
        const on = (st.extra?.on ?? 0) > 0.5;
        acStampG(cm, n0, n1, on ? 1 / Math.max(par(d, "ron", 1), 1e-6) : 1 / Math.max(par(d, "roff", 1e9), 1), 0);
        break;
      }
      case "D":
      case "LED":
      case "ZENER":
      case "SCHOTTKY": {
        // S4.2: temperaturskaliert + gradiert wie im DC-Kern (Helfer teilen).
        const tempC = sim.options.temperature;
        const n = par(d, "n", d.type === "LED" ? 2 : 1);
        const is = tempScaledIS(par(d, "is", 1e-14), tempC, par(d, "tnom", 27), par(d, "xti", 3), par(d, "eg", 1.11), n);
        const vd = st.vprev[0];
        const gd = (is * Math.exp(Math.min(vd / (n * vt), 60))) / (n * vt) + 1e-12;
        acStampG(cm, n0, n1, gd, 0);
        const cj = depletionCap(par(d, "cjo", 1e-12), vd, par(d, "vj", 1), par(d, "mj", 0.5), par(d, "fc", 0.5)) + par(d, "tt", 0) * gd;
        acStampG(cm, n0, n1, 0, omega * cj);
        break;
      }
      case "Q": {
        const nc = nodeIdx(sim, d.nodes[0]);
        const nb = nodeIdx(sim, d.nodes[1]);
        const ne = nodeIdx(sim, d.nodes[2]);
        // S4.2: temperaturskaliert + gradiert wie im DC-Kern (Helfer teilen).
        const tempC = sim.options.temperature;
        const tnomQ = par(d, "tnom", 27);
        const is = tempScaledIS(par(d, "is", 1e-15), tempC, tnomQ, par(d, "xti", 3), par(d, "eg", 1.11));
        const bf = Math.max(tempScaledBF(par(d, "bf", 200), tempC, tnomQ, par(d, "xtb", 0)), 1e-3);
        const vaf = par(d, "vaf", 100);
        const vbe = st.vprev[0];
        const vbc = st.vprev[1];
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
        const fcQ = par(d, "fc", 0.5);
        const gmR = (is * Math.exp(Math.min(vbc / vt, 60))) / vt;
        const cbe = depletionCap(par(d, "cje", 5e-12), vbe, par(d, "vje", 0.75), par(d, "mje", 0.33), fcQ) + par(d, "tf", 0) * gm;
        const cbc = depletionCap(par(d, "cjc", 2e-12), vbc, par(d, "vjc", 0.75), par(d, "mjc", 0.5), fcQ) + par(d, "tr", 0) * gmR;
        acStampG(cm, nb, ne, 0, omega * cbe);
        acStampG(cm, nb, nc, 0, omega * cbc);
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
      case "J": {
        // JFET: gm/gds aus den OP-Spannungen (gleiche Bereichslogik wie im
        // DC-Kern; pch kürzt sich in der Jacobi-Matrix wie dort heraus).
        const nd = nodeIdx(sim, d.nodes[0]);
        const ng = nodeIdx(sim, d.nodes[1]);
        const ns = nodeIdx(sim, d.nodes[2]);
        const pch = par(d, "pjf", 0) > 0.5 ? -1 : 1;
        const beta = par(d, "beta", 1e-4);
        const vto = -Math.abs(par(d, "vto", 2));
        const lambda = par(d, "lambda", 0.01);
        const vgs = pch * (sim.vOf(ng) - sim.vOf(ns));
        const vds = pch * (sim.vOf(nd) - sim.vOf(ns));
        let gm = 0;
        let gds = 1e-12;
        const vov = vgs - vto;
        if (vov > 0) {
          if (vds < vov) {
            gm = 2 * beta * vds * (1 + lambda * vds);
            gds = Math.max(2 * beta * (vov - vds) * (1 + lambda * vds), 1e-12);
          } else {
            gm = 2 * beta * vov * (1 + lambda * vds);
            gds = Math.max(beta * vov * vov * lambda, 1e-12);
          }
        }
        if (nd >= 0 && ng >= 0) cm.add(nd, ng, gm, 0);
        if (nd >= 0 && ns >= 0) cm.add(nd, ns, -gm, 0);
        if (ns >= 0 && ng >= 0) cm.add(ns, ng, -gm, 0);
        if (ns >= 0) cm.add(ns, ns, gm, 0);
        acStampG(cm, nd, ns, gds, 0);
        acStampG(cm, ng, ns, 0, omega * par(d, "cgs", 2e-12));
        acStampG(cm, ng, nd, 0, omega * par(d, "cgd", 2e-12));
        break;
      }
      case "SCR":
      case "TRIAC": {
        // Kleinsignal am OP-Schaltzustand (exakt wie im DC-Kern gestempelt).
        const on = (st.extra?.on ?? 0) > 0.5;
        acStampG(cm, n0, n1, on ? 1 / Math.max(par(d, "ron", 0.1), 1e-6) : 1e-9, 0);
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
      case "TIMER555":
      case "SEVENSEG": {
        // Verhaltensmodelle haben kein Kleinsignalmodell: 1 nS gegen Masse.
        // (Siehe acLinearizationWarnings — der Nutzer erfährt davon.)
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

/**
 * Ehrliche AC-Grenzen: Verhaltensmodelle ohne Kleinsignalmodell werden als
 * 1 nS gegen Masse genähert. Der Runner hängt diese Hinweise an jede
 * AC-basierte Analyse (AC, Rauschen, TF, PZ, S-Parameter, Sensitivität-AC).
 */
export function acLinearizationWarnings(netlist: Netlist): string[] {
  const byType = new Map<string, string[]>();
  for (const d of netlist.devices) {
    if (d.type === "GATE" || d.type === "DIGITAL" || d.type === "MCU" || d.type === "TIMER555" || d.type === "SEVENSEG") {
      const arr = byType.get(d.type) ?? [];
      arr.push(d.id);
      byType.set(d.type, arr);
    }
  }
  const out: string[] = [];
  for (const [type, ids] of byType) {
    const shown = ids.slice(0, 4).join(", ");
    const more = ids.length > 4 ? ` (+${ids.length - 4} weitere)` : "";
    out.push(`AC-Näherung: ${type}-Bausteine (${shown}${more}) werden als 1 nS gegen Masse genähert — kein Kleinsignalmodell.`);
  }
  return out;
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
  progress?: ProgressFn,
): AcResult {
  const sim = new Simulator(netlist, options);
  const op = sim.operatingPoint();
  const result: AcResult = { freq: [], magDb: {}, phase: {}, mag: {}, ok: op.ok, message: op.message };
  for (const o of outputs) {
    result.magDb[o] = [];
    result.phase[o] = [];
    result.mag[o] = [];
  }
  const acFreqs = sweepValues(sweep);
  const acReport = progressReporter(progress);
  for (let fi = 0; fi < acFreqs.length; fi++) {
    const f = acFreqs[fi];
    const cm = buildAcMatrix(sim, 2 * Math.PI * f);
    const sol = cm.solve();
    if (!sol) {
      result.ok = false;
      result.message = `AC: singulaere Matrix bei ${f.toPrecision(4)} Hz`;
      break;
    }
    result.freq.push(f);
    acReport((fi + 1) / acFreqs.length);
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
  progress?: ProgressFn,
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
  const noiseReport = progressReporter(progress);
  for (let nfi = 0; nfi < freqs.length; nfi++) {
    const f = freqs[nfi];
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
    noiseReport((nfi + 1) / freqs.length);
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
  progress?: ProgressFn,
): MonteCarloResult {
  const rand = mulberry32(mc.seed ?? 12345);
  const samples: number[] = [];
  const runs = Math.max(1, Math.min(mc.runs, 400));
  const mcReport = progressReporter(progress);
  for (let i = 0; i < runs; i++) {
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
    mcReport((i + 1) / runs);
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
  progress?: ProgressFn,
): WorstCaseResult {
  const nominal = measureValue(netlist, options, mc, tran);
  const sens: WorstCaseResult["sensitivities"] = [];
  const tol = mc.tolerance / 100;
  const wcReport = progressReporter(progress);
  const wcTotal = netlist.devices.length + 2;
  let wcDone = 1;
  wcReport(wcDone / wcTotal);
  for (const d of netlist.devices) {
    const key = d.type === "R" ? "r" : d.type === "C" ? "c" : d.type === "L" ? "l" : null;
    if (!key || !d.params[key]) {
      wcDone++;
      continue;
    }
    const nl = cloneNetlist(netlist);
    const target = nl.devices.find((x) => x.id === d.id)!;
    target.params[key] *= 1 + tol;
    const v = measureValue(nl, options, mc, tran);
    sens.push({ id: d.id, param: key, sensitivity: (v - nominal) / Math.max(Math.abs(nominal), 1e-12) / tol });
    wcDone++;
    wcReport(wcDone / wcTotal);
  }
  const mkCorner = (sign: number) => {
    const nl = cloneNetlist(netlist);
    for (const s of sens) {
      const target = nl.devices.find((x) => x.id === s.id);
      if (!target) continue;
      target.params[s.param] *= 1 + sign * Math.sign(s.sensitivity || 1) * tol;
    }
    const v = measureValue(nl, options, mc, tran);
    wcDone++;
    wcReport(wcDone / wcTotal);
    return v;
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
  progress?: ProgressFn,
): TempSweepResult {
  const tmpReport = progressReporter(progress);
  const values = temps.map((t, i) => {
    const v = measureValue(netlist, { ...options, temperature: t }, mc, tran);
    tmpReport((i + 1) / Math.max(temps.length, 1));
    return v;
  });
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

/* ------------------------------------------------------------------ */
/* parameter sweep                                                     */
/* ------------------------------------------------------------------ */
export interface ParamSweepResult {
  values: number[];
  curves: Array<{ param: number; time: number[]; signals: Record<string, number[]> }>;
  ok: boolean;
}

export function runParamSweep(
  netlist: Netlist,
  options: Partial<SimOptions>,
  param: string, // e.g. "R1.resistance"
  sweep: SweepSpec,
  outputs: string[],
  tran?: TransientOptions,
  progress?: ProgressFn,
): ParamSweepResult {
  const vals = sweepValues(sweep);
  const curves: ParamSweepResult["curves"] = [];
  let ok = true;
  const parReport = progressReporter(progress);
  for (let pvi = 0; pvi < vals.length; pvi++) {
    const v = vals[pvi];
    // Clone netlist and modify param
    const cloned: Netlist = JSON.parse(JSON.stringify(netlist));
    const [devId, paramKey] = param.split(".");
    if (devId && paramKey) {
      for (const d of cloned.devices) {
        if (d.id === devId || d.id.startsWith(devId + "_") || d.id.includes(devId)) {
          if (paramKey in d.params) {
            (d.params as any)[paramKey] = v;
          } else if (paramKey === "resistance" && d.type === "R") {
            d.params.r = v;
          } else if (paramKey === "capacitance" && d.type === "C") {
            d.params.c = v;
          } else if (paramKey === "inductance" && d.type === "L") {
            d.params.l = v;
          }
        }
      }
    }
    const r = runTransient(cloned, options, tran ?? { stopTime: 0.02, stepTime: 1e-5, maxPoints: 2000 }, outputs);
    curves.push({ param: v, time: r.time, signals: r.signals });
    if (!r.ok) ok = false;
    parReport((pvi + 1) / Math.max(vals.length, 1));
  }
  return { values: vals, curves, ok };
}

/* ------------------------------------------------------------------ */
/* fourier                                                             */
/* ------------------------------------------------------------------ */
export interface FourierResult {
  freq: number[];
  mag: number[];
  phase: number[];
  thd: number;
  ok: boolean;
}

export function runFourier(
  netlist: Netlist,
  options: Partial<SimOptions>,
  fundamental: number,
  outNode: string,
  harmonics: number = 9,
): FourierResult {
  const tran = runTransient(netlist, options, { stopTime: 2 / fundamental, stepTime: 1 / (fundamental * 100), maxPoints: 8192 }, [outNode]);
  if (!tran.ok || !tran.signals[outNode]) return { freq: [], mag: [], phase: [], thd: 0, ok: false };
  const v = tran.signals[outNode];
  const dt = tran.time[1] - tran.time[0] || 1e-6;
  const sp = spectrum(v, 1/dt, "blackman");
  const freq: number[] = [];
  const mag: number[] = [];
  const phase: number[] = [];
  for (let h=1; h<=harmonics; h++) {
    const target = fundamental * h;
    let idx = 0;
    let bestDiff = Infinity;
    for (let i=0; i<sp.freq.length; i++) {
      const diff = Math.abs(sp.freq[i] - target);
      if (diff < bestDiff) { bestDiff = diff; idx = i; }
    }
    freq.push(target);
    mag.push(sp.mag[idx] ?? 0);
    phase.push(sp.phase?.[idx] ?? 0);
  }
  const fundMag = mag[0] || 1e-12;
  let harmPower = 0;
  for (let i=1; i<mag.length; i++) harmPower += mag[i]*mag[i];
  const thd = Math.sqrt(harmPower) / fundMag * 100;
  return { freq, mag, phase, thd, ok: true };
}

/* ------------------------------------------------------------------ */
/* sensitivity                                                         */
/* ------------------------------------------------------------------ */
export interface SensitivityResult {
  sensitivities: Array<{ device: string; param: string; sensitivity: number }>;
  ok: boolean;
  mode: "dc" | "ac";
  /** AC-Modus: Messfrequenz, Betrag der Basis-Übertragung, ggf. Auto-Anregung. */
  frequency?: number;
  base?: number;
  autoDrive?: string;
  message?: string;
  /** S2.2: Konvergenz-Diagnose (nur bei ok:false belegt). */
  failure?: "singular" | "nonconvergent";
  suspects?: string[];
}

export function runSensitivity(
  netlist: Netlist,
  options: Partial<SimOptions>,
  outNode: string,
  mode: "dc" | "ac" = "dc",
  frequency = 1000,
): SensitivityResult {
  if (mode === "ac") return runSensitivityAc(netlist, options, outNode, frequency);
  const op = runOperatingPoint(netlist, options);
  if (!op.ok) return { sensitivities: [], ok: false, mode, message: op.message, failure: op.failure, suspects: op.suspects };
  const base = op.nodes[outNode] ?? 0;
  const sensitivities: SensitivityResult["sensitivities"] = [];
  for (const dev of netlist.devices) {
    for (const key of Object.keys(dev.params)) {
      const orig = dev.params[key];
      if (typeof orig !== "number" || !Number.isFinite(orig) || orig === 0) continue;
      const delta = orig * 0.01;
      const cloned: Netlist = JSON.parse(JSON.stringify(netlist));
      const cd = cloned.devices.find(d=>d.id===dev.id);
      if (!cd) continue;
      cd.params[key] = orig + delta;
      const op2 = runOperatingPoint(cloned, options);
      if (!op2.ok) continue;
      const v2 = op2.nodes[outNode] ?? 0;
      const sens = (v2 - base) / delta * (orig / (base || 1));
      sensitivities.push({ device: dev.id, param: key, sensitivity: sens });
    }
  }
  sensitivities.sort((a,b)=> Math.abs(b.sensitivity) - Math.abs(a.sensitivity));
  return { sensitivities, ok: true, mode };
}

/**
 * AC-Sensitivität: normierte Empfindlichkeit von |H(f)| gegenüber jedem
 * Bauteilparameter — (d|H|/|H|)/(dp/p), finite Differenz am OP.
 * Ohne AC-Anregung in der Schaltung wird die erste unabhängige Quelle mit
 * ac=1 angeregt (als autoDrive offengelegt, nicht verschwiegen).
 */
function runSensitivityAc(
  netlist: Netlist,
  options: Partial<SimOptions>,
  outNode: string,
  frequency: number,
): SensitivityResult {
  const f = Number.isFinite(frequency) && frequency > 0 ? frequency : 1000;
  const sweep: SweepSpec = { start: f, stop: f, points: 2, type: "lin" };
  const magOf = (nl: Netlist): number => {
    const ac = runAcSweep(nl, options, sweep, [outNode]);
    if (!ac.ok) return NaN;
    return ac.mag[outNode]?.[0] ?? 0;
  };
  let work = netlist;
  let autoDrive: string | undefined;
  let base = magOf(work);
  if (!Number.isFinite(base) || Math.abs(base) < 1e-18) {
    const drv = netlist.devices.find((d) => d.type === "V") ?? netlist.devices.find((d) => d.type === "I");
    if (!drv) return { sensitivities: [], ok: false, mode: "ac", frequency: f, message: "Keine Quelle für die AC-Anregung in der Schaltung." };
    work = cloneNetlist(netlist);
    const target = work.devices.find((d) => d.id === drv.id)!;
    target.source = { ...(target.source ?? { kind: "dc", dc: 0 }), acMag: 1, acPhase: 0 };
    autoDrive = drv.id;
    base = magOf(work);
    if (!Number.isFinite(base) || Math.abs(base) < 1e-18) {
      return { sensitivities: [], ok: false, mode: "ac", frequency: f, autoDrive, message: `Keine Übertragung bei ${f} Hz (|H| ≈ 0) — Sensitivität nicht definiert.` };
    }
  }
  const sensitivities: SensitivityResult["sensitivities"] = [];
  for (const dev of work.devices) {
    for (const key of Object.keys(dev.params)) {
      // Die Anregung selbst gehört nicht zur Schaltung: acMag/acPhase von
      // der Störung ausnehmen (ihre „Sensitivität" wäre trivial 1/0).
      if (key === "acMag" || key === "acPhase") continue;
      const orig = dev.params[key];
      if (typeof orig !== "number" || !Number.isFinite(orig) || orig === 0) continue;
      const delta = orig * 0.01;
      const cloned = cloneNetlist(work);
      const cd = cloned.devices.find((d) => d.id === dev.id);
      if (!cd) continue;
      cd.params[key] = orig + delta;
      const v2 = magOf(cloned);
      if (!Number.isFinite(v2)) continue;
      const sens = ((v2 - base) / delta) * (orig / base);
      sensitivities.push({ device: dev.id, param: key, sensitivity: sens });
    }
  }
  sensitivities.sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity));
  return { sensitivities, ok: true, mode: "ac", frequency: f, base, autoDrive };
}

/* ------------------------------------------------------------------ */
/* transfer function                                                   */
/* ------------------------------------------------------------------ */
export interface TfResult {
  gain: number;
  inputResistance: number;
  outputResistance: number;
  ok: boolean;
  message?: string;
  /** S2.2: Konvergenz-Diagnose (nur bei ok:false belegt). */
  failure?: "singular" | "nonconvergent";
  suspects?: string[];
}

export function runTransferFunction(
  netlist: Netlist,
  options: Partial<SimOptions>,
  outNode: string,
  sourceId: string,
): TfResult {
  const op = runOperatingPoint(netlist, options);
  if (!op.ok)
    return { gain: 0, inputResistance: 0, outputResistance: 0, ok: false, message: op.message, failure: op.failure, suspects: op.suspects };
  const src0 = netlist.devices.find((d) => d.id === sourceId);
  if (!src0 || !src0.source) {
    return { gain: 0, inputResistance: 0, outputResistance: 0, ok: false, message: `Eingangsquelle ${sourceId || "(keine)"} nicht gefunden.` };
  }
  // Verstärkung + Eingangswiderstand: Kleinsignal am selben Arbeitspunkt
  // (quasi-DC). Die Quelle selbst regt mit ac=1 an — Vorspannung bleibt.
  const inProbe = cloneNetlist(netlist);
  for (const d of inProbe.devices) {
    if (d.source) d.source = { ...d.source, acMag: d.id === sourceId ? 1 : 0, acPhase: 0 };
  }
  const simIn = new Simulator(inProbe, options);
  const opIn = simIn.operatingPoint();
  if (!opIn.ok)
    return { gain: 0, inputResistance: 0, outputResistance: 0, ok: false, message: opIn.message, failure: opIn.failure, suspects: opIn.suspects };
  const cmIn = buildAcMatrix(simIn, 2 * Math.PI * 1e-3);
  const solIn = cmIn.solve();
  if (!solIn) {
    return { gain: 0, inputResistance: 0, outputResistance: 0, ok: false, message: "TF: singuläre Kleinsignalmatrix." };
  }
  const oIn = nodeIdx(simIn, outNode);
  const gain = oIn >= 0 ? solIn.re[oIn] : 0;
  let inputResistance = Number.POSITIVE_INFINITY;
  {
    const cm = cmIn;
    const sol = solIn;
    const srcDev = simIn.netlist.devices.find((d) => d.id === sourceId);
    if (srcDev) {
      const pa = nodeIdx(simIn, srcDev.nodes[0]);
      const pb = nodeIdx(simIn, srcDev.nodes[1]);
      const va = pa >= 0 ? { re: sol.re[pa], im: sol.im[pa] } : { re: 0, im: 0 };
      const vb = pb >= 0 ? { re: sol.re[pb], im: sol.im[pb] } : { re: 0, im: 0 };
      const dv = { re: va.re - vb.re, im: va.im - vb.im };
      if (srcDev.type === "I") {
        // Stromeinprägung 1 A: Z = U/1.
        inputResistance = dv.re;
      } else if (srcDev.state && srcDev.state.br >= 0) {
        // Spannungsquelle: Zweigstrom zeigt per MNA-Stempel in die Quelle
        // hinein — der Laststrom ist das Negative davon.
        const br = srcDev.state.br;
        const ib = { re: -sol.re[br], im: -sol.im[br] };
        const denom = ib.re * ib.re + ib.im * ib.im;
        if (denom > 1e-36) inputResistance = (dv.re * ib.re + dv.im * ib.im) / denom;
      }
    }
  }
  // Ausgangsseite: Teststrom 1 A in den Ausgang (Eingangsquelle AC-kurz,
  // Thévenin-Bedingung), alle Anregungen null.
  const outProbe = cloneNetlist(netlist);
  for (const d of outProbe.devices) {
    if (d.source) d.source = { ...d.source, acMag: 0, acPhase: 0 };
  }
  const simOut = new Simulator(outProbe, options);
  const opOut = simOut.operatingPoint();
  let outputResistance = Number.POSITIVE_INFINITY;
  if (opOut.ok) {
    const oIdx = nodeIdx(simOut, outNode);
    if (oIdx >= 0) {
      const cm = buildAcMatrix(simOut, 2 * Math.PI * 1e-3, { a: -1, b: oIdx });
      const sol = cm.solve();
      if (sol) outputResistance = sol.re[oIdx];
    }
  }
  return { gain, inputResistance, outputResistance, ok: true };
}

/* ------------------------------------------------------------------ */
/* pole-zero                                                           */
/* ------------------------------------------------------------------ */
export interface PzResult {
  poles: Array<{ real: number; imag: number }>;
  zeros: Array<{ real: number; imag: number }>;
  ok: boolean;
  /** Ordnung, RMS-Anpassungsfehler (dB), gekürzte Paare, Band, Wurzeln jenseits. */
  order: number;
  fitErrorDb: number;
  pruned: number;
  outside: number;
  fmin: number;
  fmax: number;
  message?: string;
}

export interface PoleZeroOptions {
  order?: number;
  fmin?: number;
  fmax?: number;
  /** Punkte pro Dekade für den internen AC-Sweep. */
  points?: number;
}

/**
 * Pol-/Nullstellen aus dem gemessenen AC-Frequenzgang: Levy-Anpassung einer
 * rationalen Funktion N(s)/D(s) an H(jω) + Nullstellensuche (Durand-Kerner).
 * Das ist eine Näherung — die Anpassungsgüte (fitErrorDb) steht deshalb im
 * Ergebnis und in der Anzeige, nicht im Kleingedruckten.
 */
export function runPoleZero(
  netlist: Netlist,
  options: Partial<SimOptions>,
  outNode: string,
  sourceId: string,
  pzOpts: PoleZeroOptions = {},
): PzResult {
  const order = Math.min(6, Math.max(1, Math.round(pzOpts.order ?? 2)));
  const fmin = pzOpts.fmin && pzOpts.fmin > 0 ? pzOpts.fmin : 10;
  const fmax = pzOpts.fmax && pzOpts.fmax > fmin ? pzOpts.fmax : 1e6;
  const perDec = Math.min(60, Math.max(6, Math.round(pzOpts.points ?? 20)));
  const fail = (message: string): PzResult =>
    ({ poles: [], zeros: [], ok: false, order, fitErrorDb: NaN, pruned: 0, outside: 0, fmin, fmax, message });
  // Genau eine Anregung: die gewählte Quelle (alle anderen AC-Quellen null).
  const work = cloneNetlist(netlist);
  const src = work.devices.find((d) => d.id === sourceId);
  if (!src || !src.source) return fail(`Eingangsquelle ${sourceId || "(keine)"} nicht gefunden.`);
  for (const d of work.devices) {
    if (d.source) d.source = { ...d.source, acMag: d.id === sourceId ? 1 : 0, acPhase: 0 };
  }
  const ac = runAcSweep(work, options, { start: fmin, stop: fmax, points: perDec, type: "dec" }, [outNode]);
  if (!ac.ok) return fail(ac.message ?? "AC-Sweep für die PZ-Extraktion fehlgeschlagen.");
  const mags = ac.mag[outNode] ?? [];
  const phases = ac.phase[outNode] ?? [];
  const peak = mags.reduce((m, v) => Math.max(m, v), 0);
  if (!(peak > 1e-18)) return fail(`Keine Übertragung im Band (${outNode} ≈ 0 V) — keine Pole bestimmbar.`);
  const H = mags.map((m, i) => {
    const ph = ((phases[i] ?? 0) * Math.PI) / 180;
    return { re: (m / peak) * Math.cos(ph), im: (m / peak) * Math.sin(ph) };
  });
  const fit = levyFit(ac.freq, H, order);
  if (!fit) return fail("Rationale Anpassung singulär — Ordnung verringern oder Band prüfen.");
  const w0 = 2 * Math.PI * Math.sqrt(fmin * fmax);
  let poles = polyRoots(fit.den).map((r) => ({ real: r.re * w0, imag: r.im * w0 }));
  let zeros = polyRoots(fit.num).map((r) => ({ real: r.re * w0, imag: r.im * w0 }));
  // Nahezu koinzidente Pol-/Nullstellen heben sich (Überordnung) — kürzen.
  let pruned = 0;
  const keptP: typeof poles = [];
  const usedZ = new Array(zeros.length).fill(false);
  for (const p of poles) {
    const pm = Math.hypot(p.real, p.imag);
    let best = -1;
    let bestD = 0.02 * Math.max(pm, 1e-30);
    for (let j = 0; j < zeros.length; j++) {
      if (usedZ[j]) continue;
      const z = zeros[j];
      const dd = Math.hypot(p.real - z.real, p.imag - z.imag);
      const tol = 0.02 * Math.max(pm, Math.hypot(z.real, z.imag), 1e-30);
      if (dd <= tol && dd <= bestD) { best = j; bestD = dd; }
    }
    if (best >= 0) { usedZ[best] = true; pruned++; }
    else keptP.push(p);
  }
  poles = keptP;
  zeros = zeros.filter((_, j) => !usedZ[j]);
  // Vertrauensband: Wurzeln jenseits von 100·Bandoberkante sind aus
  // In-Band-Daten nicht bestimmbar (typisch: Schein-Nullstellen bei ±∞ bei
  // Systemen ohne Durchgriff) — zählen, nicht verschweigen.
  const wMax = 2 * Math.PI * fmax * 100;
  let outside = 0;
  const inside = (r: { real: number; imag: number }) => {
    const keep = Math.hypot(r.real, r.imag) <= wMax;
    if (!keep) outside++;
    return keep;
  };
  poles = poles.filter(inside);
  zeros = zeros.filter(inside);
  const byPos = (a: { real: number; imag: number }, b: { real: number; imag: number }) =>
    a.real - b.real || Math.abs(a.imag) - Math.abs(b.imag);
  poles.sort(byPos);
  zeros.sort(byPos);
  return { poles, zeros, ok: true, order, fitErrorDb: fit.errDb, pruned, outside, fmin, fmax };
}

/** Levy-Anpassung: min Σ|D(σ)H − N(σ)|², σ = s/ω0, monisches D. */
function levyFit(
  freq: number[],
  H: Array<{ re: number; im: number }>,
  order: number,
): { num: number[]; den: number[]; errDb: number } | null {
  const n = order;
  const m = order;
  const w0 = 2 * Math.PI * Math.sqrt(Math.max(freq[0], 1e-12) * Math.max(freq[freq.length - 1], 1e-12));
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let k = 0; k < freq.length; k++) {
    const w = (2 * Math.PI * freq[k]) / w0;
    // σ^p für σ = j·w (rein imaginär): Potenzen geschlossen.
    const pw: Array<{ re: number; im: number }> = [{ re: 1, im: 0 }];
    for (let p = 1; p <= Math.max(m, n); p++) {
      const q = pw[p - 1];
      pw.push({ re: -w * q.im, im: w * q.re });
    }
    const h = H[k];
    const rowRe: number[] = [];
    const rowIm: number[] = [];
    for (let i = 0; i <= m; i++) { rowRe.push(pw[i].re); rowIm.push(pw[i].im); }
    for (let j = 0; j < n; j++) {
      // −H·σ^j
      rowRe.push(-(h.re * pw[j].re - h.im * pw[j].im));
      rowIm.push(-(h.re * pw[j].im + h.im * pw[j].re));
    }
    rows.push(rowRe, rowIm);
    rhs.push(h.re * pw[n].re - h.im * pw[n].im, h.re * pw[n].im + h.im * pw[n].re);
  }
  // Normalgleichungen (AᵀA)x = Aᵀb mit leichter Tikhonov-Dämpfung.
  const u = m + 1 + n;
  const ata = new RealMatrix(u);
  const atb = new Float64Array(u);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const b = rhs[r];
    for (let i = 0; i < u; i++) {
      atb[i] += row[i] * b;
      for (let j = i; j < u; j++) ata.add(i, j, row[i] * row[j]);
    }
  }
  // Untere Hälfte spiegeln (AᵀA ist symmetrisch), Dämpfung, rechte Seite.
  for (let i = 0; i < u; i++) {
    for (let j = 0; j < i; j++) ata.add(i, j, ata.a[j * u + i]);
  }
  for (let i = 0; i < u; i++) {
    ata.add(i, i, 1e-9 * (1 + Math.abs(ata.a[i * u + i])));
    ata.addRhs(i, atb[i]);
  }
  const sol = ata.solve();
  if (!sol) return null;
  const num = Array.from(sol.slice(0, m + 1));
  const den = [...Array.from(sol.slice(m + 1, m + 1 + n)), 1];
  // Anpassungsgüte: RMS der Betragsabweichung in dB (pro Punkt gedeckelt).
  let acc = 0;
  let cnt = 0;
  for (let k = 0; k < freq.length; k++) {
    const w = (2 * Math.PI * freq[k]) / w0;
    const ev = (c: number[]) => {
      let re = 0;
      let im = 0;
      let pr = 1;
      let pi = 0;
      for (let p = 0; p < c.length; p++) {
        re += c[p] * pr;
        im += c[p] * pi;
        const nr = -w * pi;
        const ni = w * pr;
        pr = nr;
        pi = ni;
      }
      return { re, im };
    };
    const N = ev(num);
    const D = ev(den);
    const dm = D.re * D.re + D.im * D.im;
    if (!(dm > 1e-300)) continue;
    const hm = Math.hypot(H[k].re, H[k].im);
    if (!(hm > 1e-30)) continue;
    const fm = Math.hypot(N.re, N.im) / Math.sqrt(dm);
    if (!(fm > 1e-30)) continue;
    const diff = Math.max(-60, Math.min(60, 20 * Math.log10(fm / hm)));
    acc += diff * diff;
    cnt++;
  }
  return { num, den, errDb: cnt ? Math.sqrt(acc / cnt) : NaN };
}

/** Nullstellen eines reellen Polynoms (Koeffizienten aufsteigend), Durand-Kerner. */
function polyRoots(coeffs: number[]): Array<{ re: number; im: number }> {
  let deg = coeffs.length - 1;
  while (deg > 0 && Math.abs(coeffs[deg]) < 1e-300) deg--;
  if (deg <= 0) return [];
  const c = coeffs.slice(0, deg + 1).map((v) => v / coeffs[deg]);
  const roots: Array<{ re: number; im: number }> = [];
  for (let k = 0; k < deg; k++) {
    const a = (2 * Math.PI * k) / deg + 0.4;
    roots.push({ re: 0.4 * Math.cos(a), im: 0.4 * Math.sin(a) });
  }
  const evalP = (z: { re: number; im: number }) => {
    let re = c[deg];
    let im = 0;
    for (let p = deg - 1; p >= 0; p--) {
      const nr = re * z.re - im * z.im + c[p];
      const ni = re * z.im + im * z.re;
      re = nr;
      im = ni;
    }
    return { re, im };
  };
  for (let it = 0; it < 300; it++) {
    let worst = 0;
    for (let k = 0; k < deg; k++) {
      let dr = 1;
      let di = 0;
      for (let j = 0; j < deg; j++) {
        if (j === k) continue;
        const ar = roots[k].re - roots[j].re;
        const ai = roots[k].im - roots[j].im;
        const nr = dr * ar - di * ai;
        const ni = dr * ai + di * ar;
        dr = nr;
        di = ni;
      }
      const dm = dr * dr + di * di;
      if (!(dm > 1e-300)) continue;
      const p = evalP(roots[k]);
      const cr = (p.re * dr + p.im * di) / dm;
      const ci = (p.im * dr - p.re * di) / dm;
      roots[k] = { re: roots[k].re - cr, im: roots[k].im - ci };
      worst = Math.max(worst, Math.hypot(cr, ci));
    }
    if (worst < 1e-12) break;
  }
  return roots;
}

/* ------------------------------------------------------------------ */
/* noise figure                                                        */
/* ------------------------------------------------------------------ */
export interface NoiseFigureResult {
  freq: number[];
  nf: number[];
  ok: boolean;
}

export function runNoiseFigure(
  netlist: Netlist,
  options: Partial<SimOptions>,
  outNode: string,
  sourceId: string,
  sweep: SweepSpec,
): NoiseFigureResult {
  const noise = runNoise(netlist, options, sweep, outNode, sourceId);
  if (!noise.ok) return { freq: [], nf: [], ok: false };
  // NF = 10*log10(1 + noise/noise_floor) simplified
  const nf = noise.freq.map((_,i)=> 10*Math.log10(1 + (noise.outputNoise?.[i] ?? 0) / 1e-18));
  return { freq: noise.freq, nf, ok: true };
}

/* ------------------------------------------------------------------ */
/* S-parameters (two-port, Norton drive, matched load)                  */
/* ------------------------------------------------------------------ */

export interface SParamResult {
  freq: number[];
  s11db: number[];
  s11ph: number[];
  s21db: number[];
  s21ph: number[];
  z0: number;
  ok: boolean;
  message?: string;
}

/**
 * Echte Streuparameter: Port 1 wird mit einer Norton-Quelle (1 A in den
 * Port, Z₀ parallel) angeregt, Port 2 ist mit Z₀ abgeschlossen. Die DC-
 * Vorspannung bleibt unangetastet (reine AC-Anregung, alle ac-Quellen null).
 * Mit a1 = Is·√Z₀/2, Is = 1: S11 = 2V1/Z₀ − 1, S21 = 2V2/Z₀.
 */
export function runSParams(
  netlist: Netlist,
  options: Partial<SimOptions>,
  sweep: SweepSpec,
  inNode: string,
  outNode: string,
  z0 = 50,
): SParamResult {
  const z = Number.isFinite(z0) && z0 > 0 ? z0 : 50;
  const fail = (message: string): SParamResult =>
    ({ freq: [], s11db: [], s11ph: [], s21db: [], s21ph: [], z0: z, ok: false, message });
  const work = cloneNetlist(netlist);
  for (const d of work.devices) {
    if (d.source) d.source = { ...d.source, acMag: 0, acPhase: 0 };
  }
  const sim = new Simulator(work, options);
  const op = sim.operatingPoint();
  if (!op.ok) return fail(op.message ?? "Arbeitspunkt nicht gefunden.");
  const iIdx = nodeIdx(sim, inNode);
  const oIdx = nodeIdx(sim, outNode);
  if (iIdx < 0) return fail(`Eingangsnetz ${inNode} unbekannt.`);
  if (oIdx < 0) return fail(`Ausgangsnetz ${outNode} unbekannt.`);
  const out: SParamResult = { freq: [], s11db: [], s11ph: [], s21db: [], s21ph: [], z0: z, ok: true };
  for (const f of sweepValues(sweep)) {
    const cm = buildAcMatrix(sim, 2 * Math.PI * f, { a: -1, b: iIdx });
    acStampG(cm, iIdx, -1, 1 / z, 0);
    acStampG(cm, oIdx, -1, 1 / z, 0);
    const sol = cm.solve();
    if (!sol) return { ...out, ok: false, message: `S-Parameter: singuläre Matrix bei ${f.toPrecision(4)} Hz` };
    const v1 = { re: sol.re[iIdx], im: sol.im[iIdx] };
    const v2 = { re: sol.re[oIdx], im: sol.im[oIdx] };
    const s11 = { re: (2 * v1.re) / z - 1, im: (2 * v1.im) / z };
    const s21 = { re: (2 * v2.re) / z, im: (2 * v2.im) / z };
    out.freq.push(f);
    out.s11db.push(20 * Math.log10(Math.max(Math.hypot(s11.re, s11.im), 1e-18)));
    out.s11ph.push((Math.atan2(s11.im, s11.re) * 180) / Math.PI);
    out.s21db.push(20 * Math.log10(Math.max(Math.hypot(s21.re, s21.im), 1e-18)));
    out.s21ph.push((Math.atan2(s21.im, s21.re) * 180) / Math.PI);
  }
  return out;
}
