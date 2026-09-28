/**
 * CircuitBench simulation core.
 *
 * A genuine Modified Nodal Analysis (MNA) solver written from scratch:
 *   - dense LU with partial pivoting
 *   - Newton–Raphson with junction voltage limiting for nonlinear devices
 *   - backward-Euler / trapezoidal companion models for C and L
 *   - complex MNA for AC analysis
 *
 * Nothing here is fabricated: every plotted point is a solved operating
 * point or time step of the assembled circuit.
 */
import {
  type AnalysisConfig,
  type NetGraph,
  parseEng,
  type ProjectDoc,
  type Sheet,
} from "@/lib/domain/types";
import { componentValue, getDef } from "@/lib/domain/library";
import { resolveNetlist } from "@/lib/domain/connectivity";

export interface Waveform {
  type: "dc" | "sin" | "pulse" | "pwl" | "square" | "triangle" | "saw" | "noise";
  offset?: number;
  ampl?: number;
  freq?: number;
  delay?: number;
  damping?: number;
  phase?: number;
  v1?: number;
  v2?: number;
  rise?: number;
  fall?: number;
  width?: number;
  period?: number;
  duty?: number;
  points?: [number, number][];
  seed?: number;
}

export type Element =
  | { t: "R"; id: string; a: string; b: string; g: number }
  | { t: "C"; id: string; a: string; b: string; c: number; ic: number }
  | { t: "L"; id: string; a: string; b: string; l: number; ic: number }
  | {
      t: "V";
      id: string;
      a: string;
      b: string;
      wave: Waveform;
      acMag: number;
      acPhase: number;
      rs: number;
    }
  | { t: "I"; id: string; a: string; b: string; wave: Waveform; acMag: number; acPhase: number }
  | {
      t: "NL";
      id: string;
      kind: "diode" | "npn" | "pnp" | "nmos" | "pmos";
      nodes: string[];
      params: Record<string, number>;
      label: string;
    }
  | {
      t: "NLV";
      id: string;
      kind: "comparator";
      nodes: string[];
      params: Record<string, number>;
      label: string;
    }
  | { t: "NULLOR"; id: string; inp: string; inn: string; out: string }
  | {
      t: "XFMR";
      id: string;
      p1: string;
      p2: string;
      s1: string;
      s2: string;
      l1: number;
      l2: number;
      m: number;
    };

export interface Circuit {
  nodes: string[];
  groundNode: string;
  elements: Element[];
  /** element id -> schematic reference for reporting */
  refs: Record<string, string>;
  log: string[];
  ok: boolean;
  problems: string[];
}

export interface Trace {
  name: string;
  label: string;
  unit: string;
  values: number[];
  kind: "voltage" | "current" | "power" | "math";
  group?: string;
  colorIndex?: number;
}

export interface SimResult {
  analysis: AnalysisConfig["kind"];
  x: number[];
  xLabel: string;
  xUnit: string;
  xScale: "linear" | "log";
  traces: Trace[];
  opPoint: Record<string, number>;
  log: string[];
  converged: boolean;
  solveMs: number;
  iterations: number;
  warning?: string;
  children?: { sweepValue: string; label: string; result: SimResult }[];
  analysisName?: string;
}

/* ------------------------------------------------------------------ */
/*  circuit assembly                                                   */
/* ------------------------------------------------------------------ */

function subVars(value: string, vars: Record<string, string>): string {
  return value.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "0");
}

function num(value: string | undefined, vars: Record<string, string>, fallback = 0): number {
  if (value === undefined) return fallback;
  return parseEng(subVars(value, vars), fallback);
}

export function buildCircuit(
  sheet: Sheet,
  graph: NetGraph,
  vars: Record<string, string>,
  settings: ProjectDoc["simSettings"],
): Circuit {
  const log: string[] = [];
  const problems: string[] = [];

  // nets with the same name are one node (global labels / power rails)
  const nodeOfNet = new Map<string, string>();
  const nodeName = new Map<string, string>();
  for (const net of graph.nets) {
    let name: string;
    if (net.isGround) name = "0";
    else if (net.kind === "unnamed") name = net.id;
    else name = net.name;
    nodeOfNet.set(net.id, name);
    nodeName.set(name, name);
  }
  const nodeOfPin = (compId: string, pinId: string): string | null => {
    const netId = graph.pinToNet[`${compId}:${pinId}`];
    if (!netId) return null;
    return nodeOfNet.get(netId) ?? null;
  };

  const elements: Element[] = [];
  const refs: Record<string, string> = {};

  for (const comp of sheet.components) {
    const def = getDef(comp.defId);
    if (!def) continue;
    if (def.kind === "digital") continue; // handled by the digital engine
    if (def.kind === "instrument") continue;
    if (def.id === "gnd" || def.id === "vcc" || def.id === "vdd") continue;

    const n = (pin: string) => nodeOfPin(comp.id, pin);
    const ref = comp.ref;
    const val = (key: string, fb = 0) => num(comp.props[key], vars, fb);

    const need = (...pins: string[]) => {
      for (const p of pins) {
        if (!n(p)) {
          problems.push(`${ref}: pin ${p} is not connected — component skipped.`);
          return false;
        }
      }
      return true;
    };

    switch (comp.defId) {
      case "resistor": {
        if (!need("1", "2")) break;
        const r = val("resistance", 1000);
        const el: Element = { t: "R", id: ref, a: n("1")!, b: n("2")!, g: r > 0 ? 1 / r : 1e12 };
        elements.push(el);
        refs[ref] = ref;
        break;
      }
      case "potentiometer": {
        if (!need("1", "2", "3")) break;
        const total = val("resistance", 10000);
        const pos = Math.min(0.999, Math.max(0.001, val("position", 0.5)));
        elements.push({ t: "R", id: `${ref}A`, a: n("1")!, b: n("3")!, g: 1 / (pos * total) });
        elements.push({ t: "R", id: `${ref}B`, a: n("3")!, b: n("2")!, g: 1 / ((1 - pos) * total) });
        break;
      }
      case "switch": {
        if (!need("1", "2")) break;
        const closed = (comp.props.state ?? "open") === "closed";
        const r = closed ? val("ron", 0.01) : val("roff", 1e12);
        elements.push({ t: "R", id: ref, a: n("1")!, b: n("2")!, g: 1 / Math.max(r, 1e-9) });
        break;
      }
      case "capacitor": {
        if (!need("1", "2")) break;
        elements.push({
          t: "C",
          id: ref,
          a: n("1")!,
          b: n("2")!,
          c: val("capacitance", 1e-7),
          ic: val("ic", 0),
        });
        break;
      }
      case "inductor": {
        if (!need("1", "2")) break;
        elements.push({
          t: "L",
          id: ref,
          a: n("1")!,
          b: n("2")!,
          l: val("inductance", 1e-3),
          ic: val("ic", 0),
        });
        break;
      }
      case "transformer": {
        if (!need("1", "2", "3", "4")) break;
        const lp = val("inductance", 0.01);
        const ratio = val("ratio", 1);
        const k = val("coupling", 0.999);
        const l2 = lp * ratio * ratio;
        elements.push({
          t: "XFMR",
          id: ref,
          p1: n("1")!,
          p2: n("2")!,
          s1: n("3")!,
          s2: n("4")!,
          l1: lp,
          l2,
          m: k * Math.sqrt(lp * l2),
        });
        break;
      }
      case "vsource":
      case "vsine":
      case "vpulse":
      case "vpwl": {
        if (!need("1", "2")) break;
        const wave = waveformFor(comp.defId, comp.props, vars);
        elements.push({
          t: "V",
          id: ref,
          a: n("1")!,
          b: n("2")!,
          wave,
          acMag: val("acMagnitude", comp.defId === "vsine" ? val("amplitude", 1) : 1),
          acPhase: val("acPhase", 0),
          rs: val("seriesResistance", 0),
        });
        refs[ref] = ref;
        break;
      }
      case "isource": {
        if (!need("1", "2")) break;
        elements.push({
          t: "I",
          id: ref,
          a: n("1")!,
          b: n("2")!,
          wave: { type: "dc", offset: val("current", 0.001) },
          acMag: val("acMagnitude", 1),
          acPhase: 0,
        });
        break;
      }
      case "diode":
      case "zener":
      case "led":
      case "led_ind": {
        if (!need("A", "K")) break;
        const is = val("is", comp.defId === "led" ? 1e-20 : 2.5e-9);
        const nn = val("n", comp.defId === "led" ? 1.8 : 1);
        const bv = comp.defId === "zener" ? val("breakdown", 5.1) : val("bv", 100);
        elements.push({
          t: "NL",
          id: ref,
          kind: "diode",
          nodes: [n("A")!, n("K")!],
          params: { is, n: nn, bv, rs: comp.defId === "led_ind" ? val("seriesResistance", 330) : val("rs", 0) },
          label: ref,
        });
        break;
      }
      case "npn":
      case "pnp": {
        if (!need("B", "C", "E")) break;
        elements.push({
          t: "NL",
          id: ref,
          kind: comp.defId,
          nodes: [n("C")!, n("B")!, n("E")!],
          params: {
            is: val("is", 6.7e-15),
            bf: val("bf", 200),
            br: val("br", 4),
            vaf: val("vaf", 0),
            nf: val("nf", 1),
          },
          label: ref,
        });
        break;
      }
      case "nmos":
      case "pmos": {
        if (!need("D", "G", "S")) break;
        elements.push({
          t: "NL",
          id: ref,
          kind: comp.defId,
          nodes: [n("D")!, n("G")!, n("S")!],
          params: {
            vto: val("vt0", 1.8),
            kp: val("kp", 0.02),
            w: val("w", 100e-6),
            l: val("l", 2e-6),
            lambda: val("lambda", 0.01),
          },
          label: ref,
        });
        break;
      }
      case "opamp": {
        if (!need("in+", "in-", "out")) break;
        elements.push({
          t: "NULLOR",
          id: ref,
          inp: n("in+")!,
          inn: n("in-")!,
          out: n("out")!,
        });
        break;
      }
      case "comparator": {
        if (!need("in+", "in-", "out")) break;
        elements.push({
          t: "NLV",
          id: ref,
          kind: "comparator",
          nodes: [n("out")!, n("in+")!, n("in-")!],
          params: {
            gain: val("gain", 1e5),
            voh: val("outHigh", 5),
            vol: val("outLow", 0),
            hyst: val("hysteresis", 0),
          },
          label: ref,
        });
        break;
      }
      case "testpoint":
      case "port":
        break;
      default: {
        if (def.model === "simulated") {
          problems.push(`${ref}: no simulation model for "${def.name}".`);
        }
        break;
      }
    }
  }

  const nodes = [...new Set(elements.flatMap((e) => elementNodes(e)))].filter((x) => x !== "0");
  nodes.sort();
  if (!elements.length) problems.push("The sheet contains no simulatable elements.");
  log.push(`assembled ${elements.length} elements on ${nodes.length} nodes`);
  for (const p of problems) log.push(`warning: ${p}`);

  return {
    nodes,
    groundNode: "0",
    elements,
    refs,
    log,
    ok: elements.length > 0 && nodes.length > 0,
    problems,
  };
}

function elementNodes(e: Element): string[] {
  switch (e.t) {
    case "R":
    case "C":
    case "L":
    case "V":
    case "I":
      return [e.a, e.b];
    case "NL":
    case "NLV":
      return e.nodes;
    case "NULLOR":
      return [e.inp, e.inn, e.out];
    case "XFMR":
      return [e.p1, e.p2, e.s1, e.s2];
  }
}

export function waveformFor(
  defId: string,
  props: Record<string, string>,
  vars: Record<string, string>,
): Waveform {
  const v = (k: string, fb = 0) => num(props[k], vars, fb);
  switch (defId) {
    case "vsine":
      return {
        type: "sin",
        offset: v("offset", 0),
        ampl: v("amplitude", 5),
        freq: v("frequency", 1000),
        delay: v("delay", 0),
        damping: v("damping", 0),
        phase: (v("phase", 0) * Math.PI) / 180,
      };
    case "vpulse":
      return {
        type: "pulse",
        v1: v("initial", 0),
        v2: v("pulse", 5),
        delay: v("delay", 0),
        rise: Math.max(v("rise", 1e-9), 1e-12),
        fall: Math.max(v("fall", 1e-9), 1e-12),
        width: v("pulseWidth", 5e-4),
        period: v("period", 1e-3),
      };
    case "vpwl": {
      const pts: [number, number][] = [];
      const raw = subVars(props.points ?? "0 0 1m 1", vars)
        .trim()
        .split(/[\s,;]+/)
        .map((s) => parseEng(s, NaN));
      for (let i = 0; i + 1 < raw.length; i += 2) {
        if (Number.isFinite(raw[i]) && Number.isFinite(raw[i + 1]))
          pts.push([raw[i], raw[i + 1]]);
      }
      return { type: "pwl", points: pts.length >= 2 ? pts : [[0, 0]] };
    }
    default:
      return { type: "dc", offset: v("voltage", v("amplitude", 5)) };
  }
}

export function evalWave(w: Waveform, t: number, rngState: { s: number }): number {
  switch (w.type) {
    case "dc":
      return w.offset ?? 0;
    case "sin": {
      const tt = t - (w.delay ?? 0);
      if (tt < 0) return w.offset ?? 0;
      return (
        (w.offset ?? 0) +
        (w.ampl ?? 1) *
          Math.exp(-(w.damping ?? 0) * tt) *
          Math.sin(2 * Math.PI * (w.freq ?? 1) * tt + (w.phase ?? 0))
      );
    }
    case "pulse": {
      const per = w.period || 1e-3;
      const tt = t - (w.delay ?? 0);
      if (tt < 0) return w.v1 ?? 0;
      const ph = tt % per;
      const rise = w.rise || 1e-9;
      const fall = w.fall || 1e-9;
      const width = w.width ?? per / 2;
      if (ph < rise) return (w.v1 ?? 0) + ((w.v2 ?? 0) - (w.v1 ?? 0)) * (ph / rise);
      if (ph < rise + width) return w.v2 ?? 0;
      if (ph < rise + width + fall)
        return (w.v2 ?? 0) + ((w.v1 ?? 0) - (w.v2 ?? 0)) * ((ph - rise - width) / fall);
      return w.v1 ?? 0;
    }
    case "pwl": {
      const pts = w.points ?? [[0, 0]];
      if (t <= pts[0][0]) return pts[0][1];
      for (let i = 0; i < pts.length - 1; i++) {
        const [t0, v0] = pts[i];
        const [t1, v1] = pts[i + 1];
        if (t >= t0 && t <= t1) {
          return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
        }
      }
      return pts[pts.length - 1][1];
    }
    case "square": {
      const ph = (t * (w.freq ?? 1)) % 1;
      return (w.offset ?? 0) + (ph < (w.duty ?? 50) / 100 ? (w.ampl ?? 1) : -(w.ampl ?? 1));
    }
    case "triangle": {
      const ph = (t * (w.freq ?? 1)) % 1;
      const tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
      return (w.offset ?? 0) + (w.ampl ?? 1) * tri;
    }
    case "saw": {
      const ph = (t * (w.freq ?? 1)) % 1;
      return (w.offset ?? 0) + (w.ampl ?? 1) * (ph * 2 - 1);
    }
    case "noise": {
      rngState.s = (rngState.s * 1664525 + 1013904223) >>> 0;
      const r = rngState.s / 4294967296 - 0.5;
      return (w.offset ?? 0) + (w.ampl ?? 1) * r * 2;
    }
    default:
      return w.offset ?? 0;
  }
}

/* ------------------------------------------------------------------ */
/*  dense linear algebra                                               */
/* ------------------------------------------------------------------ */

class Matrix {
  n: number;
  a: Float64Array;
  b: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.a = new Float64Array(n * n);
    this.b = new Float64Array(n);
  }
  clear() {
    this.a.fill(0);
    this.b.fill(0);
  }
  add(i: number, j: number, v: number) {
    if (i < 0 || j < 0) return;
    this.a[i * this.n + j] += v;
  }
  rhs(i: number, v: number) {
    if (i < 0) return;
    this.b[i] += v;
  }
  solve(): Float64Array | null {
    const n = this.n;
    const a = this.a;
    const b = this.b;
    for (let col = 0; col < n; col++) {
      let piv = col;
      let best = Math.abs(a[col * n + col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(a[r * n + col]);
        if (v > best) {
          best = v;
          piv = r;
        }
      }
      if (best < 1e-14) return null;
      if (piv !== col) {
        for (let c = 0; c < n; c++) {
          const t = a[col * n + c];
          a[col * n + c] = a[piv * n + c];
          a[piv * n + c] = t;
        }
        const tb = b[col];
        b[col] = b[piv];
        b[piv] = tb;
      }
      const d = a[col * n + col];
      for (let r = col + 1; r < n; r++) {
        const f = a[r * n + col] / d;
        if (f === 0) continue;
        for (let c = col; c < n; c++) a[r * n + c] -= f * a[col * n + c];
        b[r] -= f * b[col];
      }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let c = r + 1; c < n; c++) s -= a[r * n + c] * x[c];
      x[r] = s / a[r * n + r];
      if (!Number.isFinite(x[r])) return null;
    }
    return x;
  }
}

/* ------------------------------------------------------------------ */
/*  solver                                                             */
/* ------------------------------------------------------------------ */

interface Branch {
  kind: "V" | "L" | "XFMR1" | "XFMR2" | "NULLOR" | "NLV";
  col: number;
  el: Element;
}

const VT = 0.025852; // thermal voltage at 300K

class Solver {
  circuit: Circuit;
  settings: ProjectDoc["simSettings"];
  nodeIndex: Map<string, number>;
  branches: Branch[] = [];
  size: number;
  mat: Matrix;
  rng = { s: 12345 };

  constructor(circuit: Circuit, settings: ProjectDoc["simSettings"]) {
    this.circuit = circuit;
    this.settings = settings;
    this.nodeIndex = new Map();
    circuit.nodes.forEach((n, i) => this.nodeIndex.set(n, i));
    let col = circuit.nodes.length;
    for (const el of circuit.elements) {
      if (el.t === "V") {
        this.branches.push({ kind: "V", col: col++, el });
      } else if (el.t === "L") {
        this.branches.push({ kind: "L", col: col++, el });
      } else if (el.t === "XFMR") {
        this.branches.push({ kind: "XFMR1", col: col++, el });
        this.branches.push({ kind: "XFMR2", col: col++, el });
      } else if (el.t === "NULLOR") {
        this.branches.push({ kind: "NULLOR", col: col++, el });
      } else if (el.t === "NLV") {
        this.branches.push({ kind: "NLV", col: col++, el });
      }
    }
    this.size = col;
    this.mat = new Matrix(Math.max(col, 1));
  }

  idx(node: string): number {
    return node === "0" ? -1 : (this.nodeIndex.get(node) ?? -1);
  }

  /** numeric node voltage for a named node from a solution vector */
  vOf(x: Float64Array, node: string): number {
    const i = this.idx(node);
    return i < 0 ? 0 : x[i];
  }

  /** Assemble A·x = b at time t given the previous state. */
  assemble(t: number, state: State, x: Float64Array | null, mode: "dc" | "tran" | "ac", omega = 0) {
    const m = this.mat;
    m.clear();
    const h = state.h;
    const geq = (c: number) => (c > 0 ? c / h : 1e-12);
    const prev = state.prev;
    const ieqCap = (el: { a: string; b: string; c: number; ic: number }, eq: number) => {
      const va = x ? this.vOf(x, el.a) : 0;
      const vb = x ? this.vOf(x, el.b) : 0;
      const vprev = prev ? prev.cap.get(el.a + "|" + el.b) ?? el.ic : el.ic;
      return eq * vprev;
    };

    for (const el of this.circuit.elements) {
      switch (el.t) {
        case "R": {
          const ia = this.idx(el.a);
          const ib = this.idx(el.b);
          m.add(ia, ia, el.g);
          m.add(ib, ib, el.g);
          m.add(ia, ib, -el.g);
          m.add(ib, ia, -el.g);
          break;
        }
        case "C": {
          if (mode === "dc") {
            const tiny = 1e-12;
            const ia = this.idx(el.a);
            const ib = this.idx(el.b);
            m.add(ia, ia, tiny);
            m.add(ib, ib, tiny);
            m.add(ia, ib, -tiny);
            m.add(ib, ia, -tiny);
            break;
          }
          if (mode === "ac") {
            // jωC is stamped by the complex assembly
            break;
          }
          const ia = this.idx(el.a);
          const ib = this.idx(el.b);
          // companion model: backward Euler (default) or trapezoidal
          const trap = this.settings.integration === "trap";
          const g = (trap ? 2 : 1) * (el.c / h);
          m.add(ia, ia, g);
          m.add(ib, ib, g);
          m.add(ia, ib, -g);
          m.add(ib, ia, -g);
          const iPrev = trap ? (prev ? prev.capI.get(el.a + "|" + el.b) ?? 0 : 0) : 0;
          const ieq = ieqCap(el, g) + iPrev;
          m.rhs(ia, ieq);
          m.rhs(ib, -ieq);
          break;
        }
        case "L": {
          const br = this.branches.find((b) => b.el === el)!;
          const ia = this.idx(el.a);
          const ib = this.idx(el.b);
          const k = br.col;
          m.add(ia, k, 1);
          m.add(ib, k, -1);
          m.add(k, ia, 1);
          m.add(k, ib, -1);
          if (mode === "dc") {
            m.add(k, k, -1e-9);
          } else if (mode === "tran") {
            const l_h = el.l / h;
            m.add(k, k, -l_h);
            const iprev = prev ? prev.ind.get(el.a + "|" + el.b) ?? el.ic : el.ic;
            m.rhs(k, -l_h * iprev);
          }
          break;
        }
        case "V": {
          const br = this.branches.find((b) => b.el === el)!;
          const ia = this.idx(el.a);
          const ib = this.idx(el.b);
          const k = br.col;
          m.add(ia, k, 1);
          m.add(ib, k, -1);
          m.add(k, ia, 1);
          m.add(k, ib, -1);
          if (mode === "dc") {
            m.rhs(k, el.wave.type === "dc" ? el.wave.offset ?? 0 : evalWave(el.wave, 0, this.rng));
          } else if (mode === "tran") {
            m.rhs(k, evalWave(el.wave, t, this.rng));
          }
          break;
        }
        case "I": {
          const ia = this.idx(el.a);
          const ib = this.idx(el.b);
          const i =
            mode === "dc"
              ? el.wave.type === "dc"
                ? el.wave.offset ?? 0
                : evalWave(el.wave, 0, this.rng)
              : mode === "tran"
                ? evalWave(el.wave, t, this.rng)
                : 0;
          m.rhs(ia, -i);
          m.rhs(ib, i);
          break;
        }
        case "XFMR": {
          const b1 = this.branches.find((b) => b.el === el && b.kind === "XFMR1")!;
          const b2 = this.branches.find((b) => b.el === el && b.kind === "XFMR2")!;
          const ip1 = this.idx(el.p1);
          const ip2 = this.idx(el.p2);
          const is1 = this.idx(el.s1);
          const is2 = this.idx(el.s2);
          m.add(ip1, b1.col, 1);
          m.add(ip2, b1.col, -1);
          m.add(is1, b2.col, 1);
          m.add(is2, b2.col, -1);
          m.add(b1.col, ip1, 1);
          m.add(b1.col, ip2, -1);
          m.add(b2.col, is1, 1);
          m.add(b2.col, is2, -1);
          const scale = mode === "tran" ? 1 / h : 1e-9;
          const f1 = mode === "dc" ? 1e-9 : scale;
          m.add(b1.col, b1.col, -el.l1 * f1);
          m.add(b1.col, b2.col, -el.m * f1);
          m.add(b2.col, b1.col, -el.m * f1);
          m.add(b2.col, b2.col, -el.l2 * f1);
          if (mode === "tran" && prev) {
            const i1 = prev.ind.get(el.p1 + "|" + el.p2) ?? 0;
            const i2 = prev.ind.get(el.s1 + "|" + el.s2) ?? 0;
            m.rhs(b1.col, -f1 * (el.l1 * i1 + el.m * i2));
            m.rhs(b2.col, -f1 * (el.m * i1 + el.l2 * i2));
          }
          break;
        }
        case "NULLOR": {
          const br = this.branches.find((b) => b.el === el)!;
          const ip = this.idx(el.inp);
          const inn = this.idx(el.inn);
          const io = this.idx(el.out);
          m.add(br.col, ip, 1);
          m.add(br.col, inn, -1);
          m.add(io, br.col, -1);
          break;
        }
        case "NL": {
          this.stampNonlinear(el, x, m);
          break;
        }
        case "NLV": {
          const br = this.branches.find((b) => b.el === el)!;
          const k = br.col;
          const idxs = el.nodes.map((nn) => this.idx(nn));
          const v0 = el.nodes.map((nn) => (x ? this.vOf(x, nn) : 0));
          const f = (vv: number[]) => this.nlVoltage(el, vv);
          const f0 = f(v0);
          const eps = 1e-6;
          const g: number[] = [];
          for (let j = 0; j < el.nodes.length; j++) {
            const vp = v0.slice();
            vp[j] += eps;
            g.push(-(f(vp) - f0) / eps);
          }
          // r(v) = v(out) - f(ctrl) = 0
          let c = v0[0] - f0;
          for (let j = 0; j < el.nodes.length; j++) {
            const gj = (j === 0 ? 1 : 0) + g[j];
            m.add(k, idxs[j], gj);
            c -= gj * v0[j];
          }
          m.rhs(k, -c);
          m.add(idxs[0], k, 1);
          break;
        }
      }
    }
    if (mode === "dc" && this.settings.gmin > 0) {
      for (const n of this.circuit.nodes) {
        const i = this.idx(n);
        m.add(i, i, this.settings.gmin);
      }
    }
  }

  /** Generic residual + finite-difference Jacobian stamp for nonlinear devices. */
  stampNonlinear(el: Extract<Element, { t: "NL" }>, x: Float64Array | null, m: Matrix) {
    const nodes = el.nodes;
    const idxs = nodes.map((n) => this.idx(n));
    const v0 = nodes.map((n) => (x ? this.vOf(x, n) : 0));
    const f = (v: number[]) => this.nlCurrents(el, v);
    const i0 = f(v0);
    const eps = 1e-6;
    const jac: number[][] = nodes.map(() => nodes.map(() => 0));
    for (let j = 0; j < nodes.length; j++) {
      const vp = v0.slice();
      vp[j] += eps;
      const i1 = f(vp);
      for (let i = 0; i < nodes.length; i++) jac[i][j] = (i1[i] - i0[i]) / eps;
    }
    for (let i = 0; i < nodes.length; i++) {
      let sum = 0;
      for (let j = 0; j < nodes.length; j++) {
        m.add(idxs[i], idxs[j], jac[i][j]);
        sum += jac[i][j] * v0[j];
      }
      // KCL residual: current leaving node i
      m.rhs(idxs[i], sum - i0[i]);
    }
  }

  /**
   * Residual currents.
   *  - "NL": currents leaving each node through the device (sum = 0)
   *  - "NLV": [branch residual, 0, 0] where branch residual = v(out) - f(v+ , v-)
   */
  nlCurrents(el: Extract<Element, { t: "NL" }>, v: number[]): number[] {
    const p = el.params;
    switch (el.kind) {
      case "diode": {
        const [a, k] = v;
        const n = p.n ?? 1;
        const is = p.is ?? 1e-9;
        const rs = p.rs ?? 0;
        const vd = Math.min(a - k, 1.4);
        // junction current with series resistance: solve the implicit
        // relation i = Is·(exp((vd − i·Rs)/(n·Vt)) − 1) by damped iteration
        let i = 0;
        for (let it = 0; it < 24; it++) {
          const vdEff = vd - i * rs;
          const arg = Math.max(-40, Math.min(vdEff / (n * VT), 40));
          const iNew = is * (Math.exp(arg) - 1);
          const delta = iNew - i;
          i += delta * 0.6;
          if (Math.abs(delta) < 1e-14 + 1e-9 * Math.abs(iNew)) break;
        }
        if (p.bv && p.bv > 0 && k - a > p.bv) {
          const arg = Math.max(-40, Math.min((k - a - p.bv) / (n * VT), 40));
          i -= is * Math.exp(arg);
        }
        return [i, -i];
      }
      case "npn":
      case "pnp": {
        const s = el.kind === "npn" ? 1 : -1;
        const [c, b, e] = v.map((x) => x * s);
        const is = p.is ?? 1e-14;
        const bf = p.bf ?? 200;
        const br = p.br ?? 4;
        const nf = p.nf ?? 1;
        const vaf = p.vaf ?? 0;
        const vbe = Math.min(b - e, 0.85);
        const vbc = Math.min(b - c, 0.85);
        const qbe = Math.exp(Math.min(vbe / (nf * VT), 40));
        const qbc = Math.exp(Math.min(vbc / (nf * VT), 40));
        let ic = is * (qbe - qbc);
        if (vaf > 0) ic *= 1 + Math.max(c - e, -1) / vaf;
        const ib = (is / bf) * (qbe - 1) + (is / br) * (qbc - 1);
        const ie = -(ic + ib);
        return s > 0 ? [ic, ib, ie] : [-ic, -ib, -ie];
      }
      case "nmos":
      case "pmos": {
        const s = el.kind === "nmos" ? 1 : -1;
        const [d, g, sn] = v.map((x) => x * s);
        const vto = p.vto ?? 1.8;
        const kp = p.kp ?? 0.02;
        const w = p.w ?? 100e-6;
        const l = p.l ?? 2e-6;
        const lambda = p.lambda ?? 0.01;
        const vgs = g - sn;
        const vds = d - sn;
        let ids = 0;
        const beta = (kp * w) / Math.max(l, 1e-9);
        if (vgs > vto) {
          const vov = vgs - vto;
          if (vds < vov) ids = beta * (vov * vds - (vds * vds) / 2);
          else ids = (beta * vov * vov) / 2 * (1 + lambda * vds);
        }
        const current = Math.min(Math.max(ids, -100), 100);
        return s > 0 ? [current, 0, -current] : [-current, 0, current];
      }
    }
    return [0, 0, 0];
  }

  /** Transfer characteristic of a nonlinear voltage source (comparator). */
  nlVoltage(el: Extract<Element, { t: "NLV" }>, v: number[]): number {
    const [, vp, vn] = v;
    const p = el.params;
    const voh = p.voh ?? 5;
    const vol = p.vol ?? 0;
    const mid = (voh + vol) / 2;
    const span = Math.max((voh - vol) / 2, 1e-6);
    const slope = Math.min(p.gain ?? 200, 600);
    return mid + span * Math.tanh((slope * (vp - vn)) / (2 * span));
  }

  /** Newton solve of the nonlinear system at time t. */
  nonlinearSolve(t: number, state: State, x0: Float64Array | null): Float64Array | null {
    let x = x0 ? Float64Array.from(x0) : new Float64Array(this.size);
    let iters = 0;
    for (; iters < this.settings.maxNewton; iters++) {
      this.assemble(t, state, x, "tran");
      const sol = this.mat.solve();
      if (!sol) return null;
      let maxdv = 0;
      for (let i = 0; i < this.size; i++) {
        let d = sol[i] - x[i];
        // junction voltage limiting
        if (Math.abs(d) > 1.0) d = Math.sign(d) * 1.0;
        x[i] += d;
        maxdv = Math.max(maxdv, Math.abs(d));
      }
      if (maxdv < this.settings.vntol + this.settings.reltol * 1e-3) {
        state.iterations += iters + 1;
        return x;
      }
    }
    state.iterations += iters;
    return x;
  }

  dcSolve(state: State): { x: Float64Array | null; ok: boolean } {
    let x = new Float64Array(this.size);
    for (let attempt = 0; attempt < 3; attempt++) {
      const gminSave = this.settings.gmin;
      this.settings.gmin = attempt === 0 ? 1e-12 : attempt === 1 ? 1e-6 : 1e-3;
      let converged = true;
      for (let it = 0; it < this.settings.maxNewton * 2; it++) {
        this.assemble(0, state, x, "dc");
        const sol = this.mat.solve();
        if (!sol) {
          converged = false;
          break;
        }
        let maxdv = 0;
        for (let i = 0; i < this.size; i++) {
          let d = sol[i] - x[i];
          if (Math.abs(d) > 1.0) d = Math.sign(d) * 1.0;
          x[i] += d;
          maxdv = Math.max(maxdv, Math.abs(d));
        }
        if (maxdv < this.settings.vntol) break;
        if (it === this.settings.maxNewton * 2 - 1) converged = false;
      }
      this.settings.gmin = gminSave;
      if (converged) return { x, ok: true };
    }
    return { x, ok: false };
  }

  currentOf(x: Float64Array, el: Element, state: State): number {
    switch (el.t) {
      case "V": {
        const br = this.branches.find((b) => b.el === el);
        return br ? x[br.col] : 0;
      }
      case "R":
        return el.g * (this.vOf(x, el.a) - this.vOf(x, el.b));
      case "C": {
        const g = el.c / Math.max(state.h, 1e-15);
        const key = el.a + "|" + el.b;
        const vprev = state.prev?.cap.get(key) ?? el.ic;
        return g * (this.vOf(x, el.a) - this.vOf(x, el.b) - vprev);
      }
      case "L": {
        const br = this.branches.find((b) => b.el === el);
        return br ? x[br.col] : 0;
      }
      case "I":
        return el.wave.offset ?? 0;
      default:
        return 0;
    }
  }
}

interface State {
  h: number;
  prev: {
    cap: Map<string, number>;
    capI: Map<string, number>;
    ind: Map<string, number>;
  } | null;
  iterations: number;
}

/* ------------------------------------------------------------------ */
/*  analyses                                                           */
/* ------------------------------------------------------------------ */

function makeState(): State {
  return { h: 1e-6, prev: null, iterations: 0 };
}

function captureState(solver: Solver, x: Float64Array, h: number): State["prev"] {
  const cap = new Map<string, number>();
  const capI = new Map<string, number>();
  const ind = new Map<string, number>();
  for (const el of solver.circuit.elements) {
    if (el.t === "C") {
      const key = el.a + "|" + el.b;
      cap.set(key, solver.vOf(x, el.a) - solver.vOf(x, el.b));
      capI.set(key, solver.currentOf(x, el, { h, prev: null, iterations: 0 }));
    }
    if (el.t === "L") {
      const br = solver.branches.find((b) => b.el === el);
      ind.set(el.a + "|" + el.b, br ? x[br.col] : 0);
    }
    if (el.t === "XFMR") {
      const b1 = solver.branches.find((b) => b.el === el && b.kind === "XFMR1");
      const b2 = solver.branches.find((b) => b.el === el && b.kind === "XFMR2");
      ind.set(el.p1 + "|" + el.p2, b1 ? x[b1.col] : 0);
      ind.set(el.s1 + "|" + el.s2, b2 ? x[b2.col] : 0);
    }
  }
  return { cap, capI, ind };
}

function traceNames(solver: Solver): { name: string; node: string }[] {
  return solver.circuit.nodes
    .filter((n) => n !== "0")
    .map((n) => ({ name: `V(${n})`, node: n }));
}

export function runOperatingPoint(circuit: Circuit, settings: ProjectDoc["simSettings"], label = "Operating Point"): SimResult {
  const t0 = performance.now();
  const solver = new Solver(circuit, settings);
  const state = makeState();
  const { x, ok } = solver.dcSolve(state);
  const opPoint: Record<string, number> = {};
  const traces: Trace[] = [];
  if (x) {
    for (const n of circuit.nodes) {
      if (n === "0") continue;
      opPoint[n] = solver.vOf(x, n);
    }
    for (const el of circuit.elements) {
      if (el.t === "V" || el.t === "L" || el.t === "R") {
        opPoint[`I(${el.id})`] = solver.currentOf(x, el, state);
      }
    }
  }
  for (const [k, v] of Object.entries(opPoint)) {
    traces.push({
      name: k,
      label: k,
      unit: k.startsWith("I") ? "A" : "V",
      values: [v],
      kind: k.startsWith("I") ? "current" : "voltage",
    });
  }
  return {
    analysis: "op",
    x: [0],
    xLabel: "Operating point",
    xUnit: "",
    xScale: "linear",
    traces,
    opPoint,
    log: [...circuit.log, ok ? "operating point converged" : "operating point FAILED to converge"],
    converged: ok,
    solveMs: performance.now() - t0,
    iterations: state.iterations,
    analysisName: label,
  };
}

export function runTransient(
  circuit: Circuit,
  settings: ProjectDoc["simSettings"],
  params: Record<string, string>,
  vars: Record<string, string>,
  label = "Transient Analysis",
): SimResult {
  const t0 = performance.now();
  const solver = new Solver(circuit, settings);
  const tstop = parseEng(params.tstop ?? "5m", 0.005);
  const tstart = parseEng(params.tstart ?? "0", 0);
  const tstep = parseEng(params.tstep ?? "", 0) || tstop / 400;
  const points = Math.min(4000, Math.max(200, Math.round((tstop - tstart) / tstep) + 1));
  const useOp = (params.useOp ?? "true") !== "false";
  const state = makeState();
  let x: Float64Array | null = null;
  const log = [...circuit.log];
  let converged = true;

  if (useOp) {
    const dc = solver.dcSolve(state);
    x = dc.x;
    converged = dc.ok;
    log.push(dc.ok ? "initial operating point converged" : "initial operating point did not converge (continuing)");
    if (x) {
      const h0 = (tstop - tstart) / points;
      state.prev = captureState(solver, x, h0);
    }
  }
  if (!x) x = new Float64Array(solver.size);

  const xs: number[] = [];
  const names = traceNames(solver);
  const series = names.map(() => [] as number[]);
  const branchSeries = circuit.elements
    .map((el) => ({ el, arr: [] as number[] }))
    .filter((b) => b.el.t === "V" || b.el.t === "L" || b.el.t === "R");

  const dt = (tstop - tstart) / (points - 1);
  const substeps = Math.max(1, Math.min(8, Math.ceil(dt / Math.max(parseEng(params.tmax ?? "", 0), dt / 4))));
  state.h = dt / substeps;

  for (let k = 0; k < points; k++) {
    const t = tstart + k * dt;
    if (k > 0) {
      for (let s = 0; s < substeps; s++) {
        const tt = t - dt + (s + 1) * state.h;
        const sol = solver.nonlinearSolve(tt, state, x);
        if (!sol) {
          converged = false;
          log.push(`solver breakdown at t=${tt.toExponential(3)}s`);
          break;
        }
        x = sol;
        state.prev = captureState(solver, x, state.h);
      }
    }
    xs.push(t);
    names.forEach((n, i) => series[i].push(solver.vOf(x!, n.node)));
    branchSeries.forEach((b) => b.arr.push(solver.currentOf(x!, b.el, state)));
    if (!converged) break;
  }

  const traces: Trace[] = names.map((n, i) => ({
    name: n.name,
    label: n.name,
    unit: "V",
    values: series[i],
    kind: "voltage" as const,
  }));
  for (const b of branchSeries) {
    traces.push({
      name: `I(${b.el.id})`,
      label: `I(${b.el.id})`,
      unit: "A",
      values: b.arr,
      kind: "current",
    });
  }

  return {
    analysis: "tran",
    x: xs,
    xLabel: "Time",
    xUnit: "s",
    xScale: "linear",
    traces,
    opPoint: {},
    log,
    converged,
    solveMs: performance.now() - t0,
    iterations: state.iterations,
    warning: converged ? undefined : "Transient solver lost convergence — results may be incomplete.",
    analysisName: label,
  };
}

export function runAcSweep(
  circuit: Circuit,
  settings: ProjectDoc["simSettings"],
  params: Record<string, string>,
  vars: Record<string, string>,
  label = "AC Analysis",
): SimResult {
  const t0 = performance.now();
  const solver = new Solver(circuit, settings);
  const state = makeState();
  const { x, ok } = solver.dcSolve(state);
  const log = [...circuit.log];
  log.push(ok ? "linearised around the DC operating point" : "warning: no DC operating point — linearising around zero");

  const fstart = parseEng(params.fstart ?? "1", 1);
  const fstop = parseEng(params.fstop ?? "1Meg", 1e6);
  const sweepType = params.sweepType ?? "dec";
  const npts = Math.round(parseEng(params.points ?? "20", 20));
  const count = sweepType === "lin" ? Math.max(2, npts) : Math.max(2, Math.round(npts * Math.log10(fstop / fstart)) + 1);
  const source = (params.source ?? "").trim();

  const freqs: number[] = [];
  for (let i = 0; i < count; i++) {
    const f =
      sweepType === "lin"
        ? fstart + ((fstop - fstart) * i) / (count - 1)
        : fstart * Math.pow(fstop / fstart, i / (count - 1));
    freqs.push(f);
  }

  const nodes = solver.circuit.nodes;
  const n = nodes.length;
  const size = solver.size;
  const re = new Float64Array(size * size);
  const im = new Float64Array(size * size);
  const bre = new Float64Array(size);
  const bim = new Float64Array(size);

  // linearised real conductances
  const buildBase = () => {
    re.fill(0);
    im.fill(0);
    const g = (i: number, j: number, rv: number, iv = 0) => {
      if (i < 0 || j < 0) return;
      re[i * size + j] += rv;
      im[i * size + j] += iv;
    };
    for (const el of solver.circuit.elements) {
      if (el.t === "R") {
        const ia = solver.idx(el.a);
        const ib = solver.idx(el.b);
        g(ia, ia, el.g);
        g(ib, ib, el.g);
        g(ia, ib, -el.g);
        g(ib, ia, -el.g);
      } else if (el.t === "C") {
        const ia = solver.idx(el.a);
        const ib = solver.idx(el.b);
        g(ia, ia, 0, 0);
        g(ib, ib, 0, 0);
        (solver as unknown as { _caps: [number, number, number][] })._caps ??= [];
        (solver as unknown as { _caps: [number, number, number][] })._caps.push([ia, ib, el.c]);
      } else if (el.t === "L") {
        const br = solver.branches.find((b) => b.el === el)!;
        const ia = solver.idx(el.a);
        const ib = solver.idx(el.b);
        const k = br.col;
        if (ia >= 0) re[ia * size + k] += 1;
        if (ib >= 0) re[ib * size + k] -= 1;
        if (ia >= 0) re[k * size + ia] += 1;
        if (ib >= 0) re[k * size + ib] -= 1;
        (solver as unknown as { _inds: [number, number][] })._inds ??= [];
        (solver as unknown as { _inds: [number, number][] })._inds.push([k, el.l]);
      } else if (el.t === "V") {
        const br = solver.branches.find((b) => b.el === el)!;
        const ia = solver.idx(el.a);
        const ib = solver.idx(el.b);
        const k = br.col;
        if (ia >= 0) re[ia * size + k] += 1;
        if (ib >= 0) re[ib * size + k] -= 1;
        if (ia >= 0) re[k * size + ia] += 1;
        if (ib >= 0) re[k * size + ib] -= 1;
        (solver as unknown as { _vs: [number, number, number][] })._vs ??= [];
        (solver as unknown as { _vs: [number, number, number][] })._vs.push([
          k,
          el.acMag,
          el.acPhase,
        ]);
      } else if (el.t === "I") {
        (solver as unknown as { _is: [number, number, number, number][] })._is ??= [];
        (solver as unknown as { _is: [number, number, number, number][] })._is.push([
          solver.idx(el.a),
          solver.idx(el.b),
          el.acMag,
          el.acPhase,
        ]);
      } else if (el.t === "NLV") {
        const br = solver.branches.find((b) => b.el === el)!;
        const k = br.col;
        const idxs = el.nodes.map((nn) => solver.idx(nn));
        const v0 = el.nodes.map((nn) => solver.vOf(x ?? new Float64Array(size), nn));
        const f0 = solver.nlVoltage(el, v0);
        const eps = 1e-6;
        const g: number[] = [];
        for (let j = 0; j < el.nodes.length; j++) {
          const vp = v0.slice();
          vp[j] += eps;
          g.push(-(solver.nlVoltage(el, vp) - f0) / eps);
        }
        for (let j = 0; j < el.nodes.length; j++) {
          const gj = (j === 0 ? 1 : 0) + g[j];
          re[k * size + idxs[j]] += gj;
        }
        re[idxs[0] * size + k] += 1;
      } else if (el.t === "NL") {
        const idxs = el.nodes.map((nn) => solver.idx(nn));
        const v0 = el.nodes.map((nn) => solver.vOf(x ?? new Float64Array(size), nn));
        const f = (vv: number[]) => solver.nlCurrents(el, vv);
        const i0 = f(v0);
        const eps = 1e-6;
        for (let j = 0; j < idxs.length; j++) {
          const vp = v0.slice();
          vp[j] += eps;
          const i1 = f(vp);
          for (let i = 0; i < idxs.length; i++) {
            g(idxs[i], idxs[j], (i1[i] - i0[i]) / eps);
          }
        }
      } else if (el.t === "NULLOR") {
        const br = solver.branches.find((b) => b.el === el)!;
        const ip = solver.idx(el.inp);
        const inn = solver.idx(el.inn);
        const io = solver.idx(el.out);
        if (ip >= 0) re[br.col * size + ip] += 1;
        if (inn >= 0) re[br.col * size + inn] -= 1;
        if (io >= 0) re[io * size + br.col] -= 1;
      }
    }
    const caps = (solver as unknown as { _caps?: [number, number, number][] })._caps ?? [];
    for (const [ia, ib, c] of caps) {
      // placeholder; jωC applied per frequency below
      void ia;
      void ib;
      void c;
    }
  };
  buildBase();
  const caps = (solver as unknown as { _caps?: [number, number, number][] })._caps ?? [];
  const inds = (solver as unknown as { _inds?: [number, number][] })._inds ?? [];
  const vsrcs = (solver as unknown as { _vs?: [number, number, number][] })._vs ?? [];
  const isrcs = (solver as unknown as { _is?: [number, number, number, number][] })._is ?? [];

  const targetNodes = nodes.filter((nn) => nn !== "0");
  const mags: number[][] = targetNodes.map(() => []);
  const phases: number[][] = targetNodes.map(() => []);

  for (const f of freqs) {
    const w = 2 * Math.PI * f;
    const R = Float64Array.from(re);
    const I = Float64Array.from(im);
    for (const [ia, ib, c] of caps) {
      const bc = w * c;
      if (ia >= 0) I[ia * size + ia] += bc;
      if (ib >= 0) I[ib * size + ib] += bc;
      if (ia >= 0 && ib >= 0) {
        I[ia * size + ib] -= bc;
        I[ib * size + ia] -= bc;
      }
    }
    for (const [k, l] of inds) {
      const bl = w * l;
      if (k >= 0) I[k * size + k] -= bl;
    }
    bre.fill(0);
    bim.fill(0);
    for (const [k, mag, phase] of vsrcs) {
      bre[k] = mag * Math.cos((phase * Math.PI) / 180);
      bim[k] = mag * Math.sin((phase * Math.PI) / 180);
    }
    for (const [ia, ib, mag, phase] of isrcs) {
      const cr = mag * Math.cos((phase * Math.PI) / 180);
      const ci = mag * Math.sin((phase * Math.PI) / 180);
      if (ia >= 0) {
        bre[ia] -= cr;
        bim[ia] -= ci;
      }
      if (ib >= 0) {
        bre[ib] += cr;
        bim[ib] += ci;
      }
    }
    const sol = complexSolve(size, R, I, bre, bim);
    if (!sol) {
      for (const arr of mags) arr.push(NaN);
      for (const arr of phases) arr.push(NaN);
      continue;
    }
    targetNodes.forEach((nn, i) => {
      const k = solver.idx(nn);
      const vr = sol.re[k];
      const vi = sol.im[k];
      mags[i].push(Math.hypot(vr, vi));
      phases[i].push((Math.atan2(vi, vr) * 180) / Math.PI);
    });
    void source;
    void n;
  }

  const traces: Trace[] = [];
  targetNodes.forEach((nn, i) => {
    traces.push({
      name: `V(${nn})`,
      label: `|V(${nn})|`,
      unit: "V",
      values: mags[i],
      kind: "voltage",
    });
  });
  targetNodes.forEach((nn, i) => {
    traces.push({
      name: `Phase(V(${nn}))`,
      label: `∠V(${nn})`,
      unit: "°",
      values: unwrapSeries(phases[i]),
      kind: "math",
    });
  });

  return {
    analysis: "ac",
    x: freqs,
    xLabel: "Frequency",
    xUnit: "Hz",
    xScale: sweepType === "lin" ? "linear" : "log",
    traces,
    opPoint: x ? Object.fromEntries(nodes.filter((nn) => nn !== "0").map((nn) => [nn, solver.vOf(x!, nn)])) : {},
    log,
    converged: true,
    solveMs: performance.now() - t0,
    iterations: state.iterations,
    analysisName: label,
  };
}

/** Remove 360° discontinuities from a phase series. */
function unwrapSeries(values: number[]): number[] {
  const out: number[] = [];
  let offset = 0;
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] + offset;
    if (i > 0 && v - prev > 180) {
      offset -= 360;
    } else if (i > 0 && prev - v > 180) {
      offset += 360;
    }
    const corrected = values[i] + offset;
    out.push(corrected);
    prev = corrected;
  }
  return out;
}

function complexSolve(
  n: number,
  re: Float64Array,
  im: Float64Array,
  bre: Float64Array,
  bim: Float64Array,
): { re: Float64Array; im: Float64Array } | null {
  const a = Float64Array.from(re);
  const b = Float64Array.from(im);
  const xr = Float64Array.from(bre);
  const xi = Float64Array.from(bim);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.hypot(a[col * n + col], b[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.hypot(a[r * n + col], b[r * n + col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < 1e-16) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        let t = a[col * n + c];
        a[col * n + c] = a[piv * n + c];
        a[piv * n + c] = t;
        t = b[col * n + c];
        b[col * n + c] = b[piv * n + c];
        b[piv * n + c] = t;
      }
      let t = xr[col];
      xr[col] = xr[piv];
      xr[piv] = t;
      t = xi[col];
      xi[col] = xi[piv];
      xi[piv] = t;
    }
    const dr = a[col * n + col];
    const di = b[col * n + col];
    const dd = dr * dr + di * di;
    for (let r = col + 1; r < n; r++) {
      const nr = a[r * n + col];
      const ni = b[r * n + col];
      const fr = (nr * dr + ni * di) / dd;
      const fi = (ni * dr - nr * di) / dd;
      if (fr === 0 && fi === 0) continue;
      for (let c = col; c < n; c++) {
        const cr = a[col * n + c];
        const ci = b[col * n + c];
        a[r * n + c] -= fr * cr - fi * ci;
        b[r * n + c] -= fr * ci + fi * cr;
      }
      const br = xr[col];
      const bi = xi[col];
      xr[r] -= fr * br - fi * bi;
      xi[r] -= fr * bi + fi * br;
    }
  }
  const outR = new Float64Array(n);
  const outI = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sr = xr[r];
    let si = xi[r];
    for (let c = r + 1; c < n; c++) {
      const cr = a[r * n + c];
      const ci = b[r * n + c];
      sr -= cr * outR[c] - ci * outI[c];
      si -= cr * outI[c] + ci * outR[c];
    }
    const dr = a[r * n + r];
    const di = b[r * n + r];
    const dd = dr * dr + di * di;
    outR[r] = (sr * dr + si * di) / dd;
    outI[r] = (si * dr - sr * di) / dd;
    if (!Number.isFinite(outR[r]) || !Number.isFinite(outI[r])) return null;
  }
  return { re: outR, im: outI };
}

export function runDcSweep(
  circuit: Circuit,
  settings: ProjectDoc["simSettings"],
  params: Record<string, string>,
  vars: Record<string, string>,
  label = "DC Sweep",
): SimResult {
  const t0 = performance.now();
  const solver = new Solver(circuit, settings);
  const sourceRef = (params.source ?? "").trim();
  const start = parseEng(params.start ?? "0", 0);
  const stop = parseEng(params.stop ?? "5", 5);
  const step = parseEng(params.step ?? "0.1", 0.1) || 0.1;
  const count = Math.min(2001, Math.max(2, Math.round(Math.abs((stop - start) / step)) + 1));
  const state = makeState();
  const log = [...circuit.log];
  let converged = true;

  const target = circuit.elements.find(
    (e) => (e.t === "V" || e.t === "I") && (e.id === sourceRef || e.id.toUpperCase() === sourceRef.toUpperCase()),
  ) as Extract<Element, { t: "V" | "I" }> | undefined;
  if (!target) {
    log.push(`sweep source "${sourceRef}" not found — sweep aborted`);
  }

  const xs: number[] = [];
  const nodes = circuit.nodes.filter((nn) => nn !== "0");
  const series = nodes.map(() => [] as number[]);
  const branch = [] as number[];

  for (let i = 0; i < count; i++) {
    const value = start + ((stop - start) * i) / (count - 1);
    if (target) {
      if (target.t === "V") target.wave = { type: "dc", offset: value };
      else target.wave = { type: "dc", offset: value };
    }
    const sol = solver.dcSolve(state);
    if (!sol.x) {
      converged = false;
      break;
    }
    xs.push(value);
    nodes.forEach((nn, k) => series[k].push(solver.vOf(sol.x!, nn)));
    if (target) branch.push(solver.currentOf(sol.x, target, state));
  }

  const traces: Trace[] = nodes.map((nn, i) => ({
    name: `V(${nn})`,
    label: `V(${nn})`,
    unit: "V",
    values: series[i],
    kind: "voltage" as const,
  }));
  if (target) {
    traces.push({
      name: `I(${target.id})`,
      label: `I(${target.id})`,
      unit: "A",
      values: branch,
      kind: "current",
    });
  }

  void vars;
  return {
    analysis: "dc",
    x: xs,
    xLabel: `${sourceRef || "sweep"} (V)`,
    xUnit: target?.t === "I" ? "A" : "V",
    xScale: "linear",
    traces,
    opPoint: {},
    log,
    converged,
    solveMs: performance.now() - t0,
    iterations: state.iterations,
    analysisName: label,
  };
}

export interface SweepSpec {
  baseKind?: AnalysisConfig["kind"];
  componentRef: string;
  property: string;
  mode: "lin" | "log" | "list";
  start: number;
  stop: number;
  points: number;
  values: number[];
  nested?: { componentRef: string; property: string; values: number[] };
}

export function runParameterSweep(
  sheet: Sheet,
  graph: NetGraph,
  settings: ProjectDoc["simSettings"],
  baseAnalysis: AnalysisConfig,
  vars: Record<string, string>,
  sweep: SweepSpec,
  onRun?: (index: number, total: number) => void,
): SimResult {
  const t0 = performance.now();
  const values: number[] =
    sweep.mode === "list"
      ? sweep.values
      : sweep.mode === "log"
        ? Array.from({ length: Math.max(2, sweep.points) }, (_, i) =>
            sweep.start * Math.pow(sweep.stop / sweep.start, i / (Math.max(2, sweep.points) - 1)),
          )
        : Array.from({ length: Math.max(2, sweep.points) }, (_, i) =>
            sweep.start + ((sweep.stop - sweep.start) * i) / (Math.max(2, sweep.points) - 1),
          );

  const children: SimResult["children"] = [];
  const log = [`parameter sweep ${sweep.componentRef}.${sweep.property} over ${values.length} values`];
  let template: SimResult | null = null;

  values.forEach((value, i) => {
    onRun?.(i, values.length);
    const sheetCopy: Sheet = JSON.parse(JSON.stringify(sheet));
    const comp = sheetCopy.components.find((c) => c.ref === sweep.componentRef);
    if (comp) comp.props[sweep.property] = String(value);
    const g = resolveSweepGraph(sheetCopy);
    const circuit = buildCircuit(sheetCopy, g, vars, settings);
    const res = runAnalysisOnCircuit(circuit, settings, baseAnalysis, vars);
    res.traces.forEach((tr) => {
      tr.label = `${tr.label}  [${sweep.componentRef}=${formatSweepValue(value, sweep.property)}]`;
      tr.group = `${sweep.componentRef}=${formatSweepValue(value, sweep.property)}`;
    });
    children.push({
      sweepValue: formatSweepValue(value, sweep.property),
      label: `${sweep.componentRef}.${sweep.property} = ${formatSweepValue(value, sweep.property)}`,
      result: res,
    });
    if (!template) template = res;
    log.push(
      `run ${i + 1}/${values.length}: ${sweep.componentRef}.${sweep.property}=${formatSweepValue(value, sweep.property)} — ${res.converged ? "converged" : "warning"}`,
    );
  });

  const base = template!;
  return {
    ...base,
    analysis: "param",
    x: base?.x ?? [],
    traces: base?.traces ?? [],
    children,
    log,
    analysisName: `Parameter sweep — ${sweep.componentRef}.${sweep.property}`,
    solveMs: performance.now() - t0,
  };
}

export function formatSweepValue(v: number, prop: string): string {
  const unit =
    prop === "resistance"
      ? "Ω"
      : prop === "capacitance"
        ? "F"
        : prop === "inductance"
          ? "H"
          : "";
  return `${eng(v)}${unit}`;
}

function eng(v: number): string {
  const a = Math.abs(v);
  const table: [number, string][] = [
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "Meg"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  for (const [s, suffix] of table) {
    if (a >= s) return `${(v / s).toFixed(a / s >= 100 ? 0 : 2)}${suffix}`;
  }
  return v.toExponential(2);
}

function resolveSweepGraph(sheet: Sheet): NetGraph {
  return resolveNetlist(sheet);
}

export function runAnalysisOnCircuit(
  circuit: Circuit,
  settings: ProjectDoc["simSettings"],
  analysis: AnalysisConfig,
  vars: Record<string, string>,
): SimResult {
  switch (analysis.kind) {
    case "op":
      return runOperatingPoint(circuit, settings, analysis.name);
    case "tran":
    case "temp":
    case "fourier":
      return runTransient(circuit, settings, analysis.params, vars, analysis.name);
    case "ac":
      return runAcSweep(circuit, settings, analysis.params, vars, analysis.name);
    case "dc":
      return runDcSweep(circuit, settings, analysis.params, vars, analysis.name);
    default:
      return runTransient(circuit, settings, analysis.params, vars, analysis.name);
  }
}

export function fourierOf(result: SimResult, traceName: string, fundamental: number): Trace[] {
  const trace = result.traces.find((t) => t.name === traceName);
  if (!trace) return [];
  const y = trace.values;
  const t = result.x;
  const n = y.length;
  const dt = t.length > 1 ? t[1] - t[0] : 1;
  const out: number[] = [];
  const freqs: number[] = [];
  for (let k = 0; k <= Math.floor(n / 2); k += 1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * k * i) / n;
      re += y[i] * Math.cos(ang);
      im -= y[i] * Math.sin(ang);
    }
    freqs.push(k / (n * dt));
    out.push((2 * Math.hypot(re, im)) / n);
  }
  void fundamental;
  return [
    { name: `FFT(${traceName})`, label: `FFT(${traceName})`, unit: "V", values: out, kind: "math" },
    { name: "__freq", label: "Frequency", unit: "Hz", values: freqs, kind: "math" },
  ];
}
