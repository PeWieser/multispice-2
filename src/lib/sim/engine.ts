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
// W18: FG-2500 – Kern-Signalmodell (rein, zustandslos, analytisch).
import { outputVoltage, syncVoltage as fgSyncVoltage } from "@/lib/fg/waveforms";
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
  | "noise"
  | "fg"
  | "fgsync";

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
  /** W18: FG-2500 – reiner Signalzustand (analytisch, zustandslos auswertbar). */
  fg?: { state: import("@/lib/fg/types").GenState; idx: 0 | 1 };
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
  /** S2.2: Fehlerklasse für den gestalteten Konvergenz-Zustand. */
  failure?: "singular" | "nonconvergent";
  /** S2.2: verdächtige Knoten/Zweige, schlimmster zuerst (max. 3). Leer = keiner eingrenzbar. */
  suspects?: string[];
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
    case "fg": {
      // W18: FG-2500 – offene Thévenin-Spannung; die 50 Ω bildet das Device
      // (rser), die Last wird nicht doppelt angewendet (PORTING.md Weg B).
      return s.fg ? outputVoltage(s.fg.state, s.fg.idx, t, Infinity) : 0;
    }
    case "fgsync": {
      return s.fg ? fgSyncVoltage(s.fg.state, s.fg.idx, t) : 0;
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

/**
 * Runde 24 (W58): Standard-Begrenzung der Drain-Source-Spannung (SPICE3
 * `limvds`). Ohne sie konnte der Schaltknoten eines Wandlers zwischen zwei
 * Iterationen um hunderte Volt springen (z. B. 24 V → −257 V), weil der
 * Kanal beim Verlassen des Triodenbereichs seine Steilheit schlagartig
 * ändert; Newton pendelte dann zwischen "aus" und "voll an" und lief in die
 * Iterationsgrenze. Mit der Begrenzung wandert die Spannung in kleinen,
 * monotonen Schritten zum Arbeitspunkt.
 */
function limvds(vnew: number, vold: number): number {
  if (vold >= 3.5) {
    if (vnew > vold) vnew = Math.min(vnew, 3 * vold + 2);
    else if (vnew < 3.5) vnew = Math.max(vnew, 2);
  } else if (vnew > vold) vnew = Math.min(vnew, 4);
  else vnew = Math.max(vnew, -0.5);
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

/** Runde 24 (W59): Obergrenze für sinnvolle Knotenspannungen/Zweigströme. */
const SANE_LIMIT = 1e9;

/* ------------------------------------------------------------------ */
/* S4.2/S4.3: Temperatur-Skalierung + Sperrschichtkapazitäten (SPICE-like) */
/* Geteilte Helfer für DC-Kern (loadDevices) und AC (buildAcMatrix), damit */
/* beide Zweige exakt dieselben temperaturskalierten Werte sehen.         */
/* ------------------------------------------------------------------ */

/**
 * Sättigungsstrom bei Temperatur (°C), SPICE-2G-Form:
 * IS·(T/Tnom)^(XTI/N)·exp(−EG/N·(1/Vt−1/Vt0)).
 * Die Division durch den Emissionskoeffizienten N ist entscheidend: ohne sie
 * driftet eine 1N4148 mit −5 mV/K statt der realen −2 mV/K (S4.2 verifiziert).
 * BJT ruft mit nEm = 1 (Gummel-Poon ohne NF im IS-Term).
 */
export function tempScaledIS(is: number, tempC: number, tnomC: number, xti: number, egEV: number, nEm = 1): number {
  const t = tempC + KELVIN;
  const t0 = tnomC + KELVIN;
  if (!(t > 0) || !(t0 > 0)) return is;
  const n = nEm > 0.1 ? nEm : 1;
  const vtT = (BOLTZMANN * t) / CHARGE;
  const vt0 = (BOLTZMANN * t0) / CHARGE;
  return is * Math.pow(t / t0, xti / n) * Math.exp(Math.max(-60, Math.min(60, (-egEV / n) * (1 / vtT - 1 / vt0))));
}

/** BJT-Stromverstärkung bei Temperatur: BF·(T/Tnom)^XTB. */
export function tempScaledBF(bf: number, tempC: number, tnomC: number, xtb: number): number {
  const t = tempC + KELVIN;
  const t0 = tnomC + KELVIN;
  if (!(t > 0) || !(t0 > 0)) return bf;
  return bf * Math.pow(t / t0, xtb);
}

/** MOS-Schwellspannung bei Temperatur (lineare Näherung, dokumentiert). */
export function tempScaledVTO(vto: number, tempC: number, tnomC: number, vtoTc: number): number {
  return vto - vtoTc * (tempC - tnomC);
}

/** MOS-Transkonduktanz bei Temperatur (Beweglichkeit ∼ T^−BEX). */
export function tempScaledKP(kp: number, tempC: number, tnomC: number, bex: number): number {
  const t = tempC + KELVIN;
  const t0 = tnomC + KELVIN;
  if (!(t > 0) || !(t0 > 0)) return kp;
  return kp * Math.pow(t / t0, -bex);
}

/** S4.3: Oxidkapazität W·L·εox/TOX (TOX = 0 → Meyer aus). */
export function mosCoxWL(w: number, l: number, tox: number): number {
  return tox > 0 && w > 0 && l > 0 ? ((3.453e-11 / tox) * w * l) : 0;
}

/**
 * S4.3: Meyer-Kapazitäten [CGS, CGD] aus Arbeitspunkt-Bereich.
 * Cutoff 0/0, linear Cox/2 je, Sättigung 2Cox/3 + 0 (vertauscht bei VDS < 0).
 * Intrinsisch, addiert sich auf feste CGS/CGD-Params + CGSO/CGDO-Überlapp.
 */
export function meyerCaps(coxWL: number, vov: number, vdsA: number, reverse: boolean): [number, number] {
  let cgs = 0;
  let cgd = 0;
  if (coxWL > 0 && vov > 0) {
    if (vdsA < vov) {
      cgs = 0.5 * coxWL;
      cgd = 0.5 * coxWL;
    } else {
      cgs = (2 / 3) * coxWL;
      cgd = 0;
    }
  }
  return reverse ? [cgd, cgs] : [cgs, cgd];
}

/** SPICE-Sperrschichtkapazität mit FC-Depletion-Grenze (MJ = 0 → fix C0). */
export function depletionCap(c0: number, vd: number, vj: number, mj: number, fc: number): number {
  if (!(c0 > 0)) return 0;
  if (!(mj > 0)) return c0;
  const vjSafe = vj > 0.01 ? vj : 1;
  const fcSafe = Math.min(Math.max(fc, 0.05), 0.95);
  if (vd < fcSafe * vjSafe) {
    return c0 * Math.pow(Math.max(1 - vd / vjSafe, 1e-9), -mj);
  }
  const base = Math.pow(1 - fcSafe, -(1 + mj));
  return c0 * base * (1 - fcSafe * (1 + mj) + (mj * vd) / vjSafe);
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
        // Hinweis: "F" (CCCS) braucht keinen Zweig — der Steuerstrom wird über
        // den internen 1-µΩ-Sense-Leitwert zwischen den Steuerklemmen gemessen
        // (Steuerklemmen in Reihe schalten!). Ein ungenutzter Zweig würde die
        // Matrix singulär machen.
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
        return (va - vb) / Math.max(this.resistance(d), 1e-12);
      case "FUSE":
        return (va - vb) / Math.max(this.fuseResistance(d), 1e-12);
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
      case "TLINE": {
        // S4.6: Port-1-Strom (n0 → n1). OP: durchverbunden → Strom der 1-µΩ-Brücke.
        if (!st.outputs?.length) {
          const c = this.nodeIndex.get(d.nodes[2] ?? GND) ?? -1;
          const v2 = this.vOf(this.isGround(d.nodes[2]) ? -1 : c);
          return (va - v2) * 1e6;
        }
        const z0 = Math.max(p(d, "z0", 50), 1e-6);
        const [e1] = this.tlineExcitation(d, this.time);
        return (va - vb - e1) / z0;
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

  /** Per-pin current flowing INTO the device at `pinIdx` (positive = into pin). */
  pinCurrent(d: Device, pinIdx: number): number {
    const st = d.state;
    if (!st) return 0;
    if (d.type === "TIMER555") {
      // Pin mapping: 0 GND, 1 TRIG, 2 OUT, 3 RST, 4 CTRL, 5 THR, 6 DIS, 7 VCC
      const extra = st.extra ?? {};
      const iout = extra.iout ?? 0; // positive when sourcing OUT into external circuit
      const idis = extra.idis ?? 0; // positive when sinking into DIS from external circuit
      const isup = extra.isupply ?? 0; // positive when entering VCC
      switch (pinIdx) {
        case 0: // GND – KCL return path
          return -(isup + idis - iout);
        case 1: // TRIG – high-Z comparator input
          return 0;
        case 2: // OUT – current into pin is -iout
          return -iout;
        case 3: // RST – high-Z control input
          return 0;
        case 4: { // CTRL
          const nCtrl = this.idx(d.nodes[4]);
          if (nCtrl < 0) return 0;
          const vCtrl = this.vOf(nCtrl);
          const vVcc = this.vOf(this.idx(d.nodes[7]));
          const vGnd = this.vOf(this.idx(d.nodes[0]));
          return (vCtrl - vGnd) / 10000 - (vVcc - vCtrl) / 5000;
        }
        case 5: // THR – high-Z comparator input
          return 0;
        case 6: // DIS – discharge transistor collector
          return idis;
        case 7: // VCC – positive supply pin
          return isup;
        default:
          return 0;
      }
    }
    if (d.type === "Q") {
      // 0: C, 1: B, 2: E
      const ic = st.extra?.ic ?? 0;
      const ib = st.extra?.ib ?? 0;
      if (pinIdx === 0) return ic;
      if (pinIdx === 1) return ib;
      if (pinIdx === 2) return -(ic + ib);
      return 0;
    }
    if (d.type === "M" || d.type === "J") {
      // 0: D, 1: G, 2: S
      const id = st.extra?.id ?? 0;
      if (pinIdx === 0) return id;
      if (pinIdx === 1) return 0;
      if (pinIdx === 2) return -id;
      return 0;
    }
    if (d.type === "OPAMP" || d.type === "COMPARATOR") {
      // 0: IN+, 1: IN-, 2: OUT, 3: V+, 4: V-
      const iBr = st.br >= 0 ? (this.x[st.br] ?? 0) : 0; // positive into OUT pin
      if (pinIdx === 0 || pinIdx === 1) return 0;
      if (pinIdx === 2) return iBr;
      if (pinIdx === 3) return iBr < 0 ? -iBr : 0;
      if (pinIdx === 4) return iBr > 0 ? -iBr : 0;
      return 0;
    }
    if (d.type === "POT") {
      // 0: A, 1: Wiper, 2: B
      const va = this.vOf(this.idx(d.nodes[0]));
      const vw = this.vOf(this.idx(d.nodes[1]));
      const vb = this.vOf(this.idx(d.nodes[2]));
      const total = Math.max(p(d, "r", 10000), 1e-6);
      const pos = Math.min(0.9999, Math.max(0.0001, this.controls[d.id] ?? p(d, "pos", 0.5)));
      const ia = (va - vw) / (total * pos);
      const ib = (vb - vw) / (total * (1 - pos));
      if (pinIdx === 0) return ia;
      if (pinIdx === 2) return ib;
      if (pinIdx === 1) return -(ia + ib);
      return 0;
    }
    if (d.type === "VREG") {
      // 0: IN, 1: OUT, 2: GND
      const nout = this.idx(d.nodes[1]);
      const nref = this.idx(d.nodes[2]);
      const vout = this.vOf(nout) - this.vOf(nref);
      const target = st.extra?.vout ?? 0;
      const rout = Math.max(p(d, "rout", 0.05), 1e-6);
      const iLoad = (target - vout) / rout;
      if (pinIdx === 0) return Math.max(0, iLoad);
      if (pinIdx === 1) return -iLoad;
      if (pinIdx === 2) return iLoad - Math.max(0, iLoad);
      return 0;
    }
    if (d.nodes.length === 2) {
      const i = this.deviceCurrent(d);
      return pinIdx === 0 ? i : pinIdx === 1 ? -i : 0;
    }
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

  /** S4.5: Sicherungs-Widerstand — nach dem Durchbrennen roff (rastend). */
  fuseResistance(d: Device): number {
    const blown = (d.state?.extra?.blown ?? 0) > 0.5;
    return blown ? Math.max(p(d, "roff", 1e9), 1) : this.resistance(d);
  }

  /** S4.6: Laufzeit der Übertragungsleitung (td gewinnt, sonst len/vf/c). */
  tlineDelay(d: Device): number {
    const td = p(d, "td", 0);
    if (td > 0) return td;
    const len = p(d, "len", 0);
    if (len > 0) return len / (Math.max(p(d, "vf", 0.66), 0.05) * 299792458);
    return 0;
  }

  /**
   * S4.6: Bergeron-Anregung [E1, E2] = [s2(t−td), s1(t−td)] aus akzeptierter
   * Historie (outputs = [t, s1, s2]-Tripel, linear interpoliert; Leitung vor
   * t = 0 relaxiert). Nur Vergangenes → Newton-sicher.
   */
  tlineExcitation(d: Device, t: number): [number, number] {
    const td = this.tlineDelay(d);
    const h = d.state?.outputs ?? [];
    const tq = t - td;
    const sample = (idx: number): number => {
      if (h.length < 3 || tq <= h[0]) return 0;
      for (let k = 0; k + 3 <= h.length; k += 3) {
        const t0 = h[k];
        const hasNext = k + 6 <= h.length;
        const t1 = hasNext ? h[k + 3] : Infinity;
        if (tq >= t0 && tq < t1) {
          if (!hasNext) return h[k + idx];
          const f = (tq - t0) / Math.max(t1 - t0, 1e-18);
          return h[k + idx] + f * (h[k + 3 + idx] - h[k + idx]);
        }
      }
      return h[h.length - 3 + idx];
    };
    return [sample(2), sample(1)];
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
        case "FUSE": {
          // S4.5: durchgebrannt → roff (rastend); Integral in acceptTimestep.
          this.stampConductance(m, n0, n1, 1 / this.fuseResistance(d));
          break;
        }
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
          const lp0 = Math.max(p(d, "lp", 1), 1e-9);
          // S4.6: Sättigungsknie aus Primärstrom (Chord, Vorzeichen: Vor-Schritt).
          // Skaliert Lp/Ls/M gemeinsam (sonst k > 1!); Sekundär-Gegenkompensation
          // nicht modelliert (dokumentiert). isat = 0 → aus.
          const isat = p(d, "isat", 0);
          const satF = isat > 0 ? 1 / (1 + Math.abs(st.histI[0] ?? 0) / isat) : 1;
          const lp = lp0 * satF;
          const ratio = Math.max(p(d, "ratio", 1), 1e-6);
          const ls = (lp0 / (ratio * ratio)) * satF;
          const k = Math.min(0.9999, p(d, "k", 0.999));
          const mut = k * Math.sqrt(lp0 * (lp0 / (ratio * ratio))) * satF;
          const rp = Math.max(p(d, "rp", 0), 0);
          const rs = Math.max(p(d, "rs", 0), 0);
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
            // S4.6: DC = Wicklungswiderstände (Fallback 1 mΩ wie bisher).
            m.add(b1, b1, -(rp > 0 ? rp : 1e-3));
            m.add(b2, b2, -(rs > 0 ? rs : 1e-3));
          } else {
            const { a0 } = this.integrationCoeffs(ctx.dt);
            m.add(b1, b1, -a0 * lp - rp);
            m.add(b1, b2, -a0 * mut);
            m.add(b2, b2, -a0 * ls - rs);
            m.add(b2, b1, -a0 * mut);
            m.addRhs(b1, -(a0 * lp * st.histI[0] + a0 * mut * (st.extra!.i2 ?? 0)));
            m.addRhs(b2, -(a0 * ls * (st.extra!.i2 ?? 0) + a0 * mut * st.histI[0]));
          }
          // S4.6: Kernverluste als Parallelwiderstand primär (rcore ≤ 0 → aus).
          const rcore = p(d, "rcore", 0);
          if (rcore > 0) this.stampConductance(m, np, nm, 1 / rcore);
          break;
        }
        case "TLINE": {
          // S4.6: Bergeron-Leitung (verlustlos). OP/DC: durchverbunden.
          const n2 = this.idx(d.nodes[2]);
          const n3 = this.idx(d.nodes[3]);
          const td = this.tlineDelay(d);
          if (!ctx.transient || !(td > 0)) {
            this.stampConductance(m, n0, n2, 1e6);
            this.stampConductance(m, n1, n3, 1e6);
            break;
          }
          const z0 = Math.max(p(d, "z0", 50), 1e-6);
          const [e1, e2] = this.tlineExcitation(d, ctx.time);
          this.stampConductance(m, n0, n1, 1 / z0);
          this.stampCurrent(m, n0, n1, -e1 / z0);
          this.stampConductance(m, n2, n3, 1 / z0);
          this.stampCurrent(m, n2, n3, -e2 / z0);
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
          // (Steuerklemmen in Reihe schalten — der Sense-Leitwert IST das
          // Strommessgerät; parallel zu einem idealen Kurzschluss misst er 0).
          const cp = this.idx(d.nodes[2]);
          const cm = this.idx(d.nodes[3]);
          const beta = p(d, "gain", 1);
          const gsense = 1e6;
          this.stampConductance(m, cp, cm, gsense);
          const ic = (this.vOf(cp) - this.vOf(cm)) * gsense;
          this.stampCurrent(m, n0, n1, beta * ic);
          st.extra!.id = beta * ic;
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
          // S4.2: IS temperaturskaliert (XTI/EG, /N); Sperrschicht unten gradiert.
          const n = p(d, "n", d.type === "LED" ? 2.0 : 1.0);
          const is = tempScaledIS(
            p(d, "is", d.type === "SCHOTTKY" ? 1e-8 : 1e-14),
            ctx.temp, p(d, "tnom", 27), p(d, "xti", 3), p(d, "eg", 1.11), n,
          );
          const rs = p(d, "rs", d.type === "LED" ? 8 : 0.01);
          const bv = p(d, "bv", d.type === "ZENER" ? 5.1 : 1e3);
          const nvt = n * vt;
          const vd = this.vOf(n0) - this.vOf(n1); // Klemmenspannung (inkl. Bahnwiderstand)
          const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * is));
          /** Diodengleichung am inneren pn-Übergang (ohne Bahnwiderstand). */
          const junction = (v: number) => {
            if (v >= -3 * nvt) {
              const e = Math.exp(Math.min(v / nvt, 60));
              return { i: is * (e - 1) + v * ctx.gmin, g: (is * e) / nvt + ctx.gmin };
            }
            if (v > -bv) {
              const arg = (3 * nvt) / (v * Math.E);
              const a3 = arg * arg * arg;
              return { i: -is * (1 + a3) + v * ctx.gmin, g: (is * 3 * a3) / v + ctx.gmin };
            }
            const e = Math.exp(Math.min(-(bv + v) / nvt, 60));
            return { i: -is * e, g: (is * e) / nvt + ctx.gmin };
          };
          /*
           * Runde 24 (W57): Bahnwiderstand rs exakt statt über eine
           * Conductance-Näherung. Vorher wurde `ieq = id - gd*vd` mit
           * `geff/gd` skaliert – bei großen Strömen heben sich dabei zwei
           * riesige Zahlen auf: die Kennlinie wurde grob falsch (1N5819:
           * 5,4 V Flussspannung statt 0,4 V) und der Schaltknoten des
           * Buck-Wandlers landete bei −5 V. Jetzt wird die innere
           * Sperrschichtspannung vj so bestimmt, dass vd = vj + I(vj)·rs gilt
           * (Newton auf eine Unbekannte, danach SPICE-übliche Begrenzung).
           */
          let vj: number;
          if (rs > 0) {
            vj = st.vprev[0] ?? vd;
            const gs = 1 / rs;
            for (let k = 0; k < 50; k++) {
              const { i, g } = junction(vj);
              const step = (i + (vj - vd) * gs) / (g + gs);
              vj -= step;
              if (!Number.isFinite(vj)) { vj = vd; break; }
              if (Math.abs(step) < 1e-10) break;
            }
            const vjLim = pnjlim(vj, st.vprev[0] ?? vj, nvt, vcrit);
            if (Math.abs(vjLim - vj) > 1e-9) this.limited = true;
            vj = vjLim;
          } else {
            const vjLim = pnjlim(vd, st.vprev[0] ?? vd, nvt, vcrit);
            if (Math.abs(vjLim - vd) > 1e-9) this.limited = true;
            vj = vjLim;
          }
          st.vprev[0] = vj;
          const { i: id, g: gd } = junction(vj);
          const geff = rs > 0 ? 1 / (1 / gd + rs) : gd;
          const ieqEff = id - geff * vd;
          st.extra!.id = id;
          st.extra!.geff = geff;
          st.extra!.ieqEff = ieqEff;
          st.extra!.vd = vd;
          st.extra!.vj = vj;
          this.stampConductance(m, n0, n1, geff);
          this.stampCurrent(m, n0, n1, ieqEff);
          if (ctx.transient) {
            // S4.2: gradierte Sperrschicht (MJ = 0 → fix) + TT-Diffusion.
            // Kapazitäts-Chord statt Ladungsformulierung (dokumentiert).
            const cj = depletionCap(p(d, "cjo", 1e-12), vj, p(d, "vj", 1), p(d, "mj", 0.5), p(d, "fc", 0.5)) + p(d, "tt", 0) * gd;
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
          // S4.2: IS/BF/BR temperaturskaliert (XTB-Default 0 wie SPICE).
          const tnomQ = p(d, "tnom", 27);
          const isat = tempScaledIS(p(d, "is", 1e-15), ctx.temp, tnomQ, p(d, "xti", 3), p(d, "eg", 1.11));
          const bf = Math.max(tempScaledBF(p(d, "bf", 200), ctx.temp, tnomQ, p(d, "xtb", 0)), 1e-3);
          const br2 = Math.max(tempScaledBF(p(d, "br", 2), ctx.temp, tnomQ, p(d, "xtb", 0)), 1e-3);
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
            // S4.2: gradierte Sperrschichten + TF/TR-Diffusion (Chord, s. Diode).
            const fcQ = p(d, "fc", 0.5);
            const gmF = (isat * evbe) / vt;
            const gmR = (isat * evbc) / vt;
            const cje = depletionCap(p(d, "cje", 5e-12), vbe, p(d, "vje", 0.75), p(d, "mje", 0.33), fcQ) + p(d, "tf", 0) * gmF;
            const cjc = depletionCap(p(d, "cjc", 2e-12), vbc, p(d, "vjc", 0.75), p(d, "mjc", 0.5), fcQ) + p(d, "tr", 0) * gmR;
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
          // S4.3: KP/VTO temperaturskaliert (Engine-Defaults 0 = SPICE L1 ohne Temp).
          const tnomM = p(d, "tnom", 27);
          const kp = tempScaledKP(p(d, "kp", 2e-5), ctx.temp, tnomM, p(d, "bex", 0));
          const w = p(d, "w", 1e-4);
          const l = p(d, "l", 1e-5);
          const beta = (kp * w) / l;
          const vto = tempScaledVTO(p(d, "vto", 2), ctx.temp, tnomM, p(d, "tcv", 0)) * pmos;
          const lambda = p(d, "lambda", 0.02);
          const vgsRaw = pmos * (this.vOf(ng) - this.vOf(ns));
          const vdsRaw = pmos * (this.vOf(nd) - this.vOf(ns));
          const vgs = fetlim(vgsRaw, st.vprev[0], Math.abs(vto));
          // W58: auch vds begrenzen – sonst springt der Kanal zwischen den
          // Iterationen zwischen Sperr- und Triodenbereich hin und her.
          const vds = limvds(vdsRaw, st.vprev[1]);
          if (Math.abs(vgs - vgsRaw) > 1e-9) this.limited = true;
          if (Math.abs(vds - vdsRaw) > 1e-9) this.limited = true;
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
            // S4.3: fix + Überlapp (CGSO/CGDO·W) + Meyer intrinsisch (TOX > 0).
            const [mgs, mgd] = meyerCaps(mosCoxWL(w, l, p(d, "tox", 0)), vov, vdsA, reverse);
            const cgs = p(d, "cgs", 5e-12) + p(d, "cgso", 0) * w + mgs;
            const cgd = p(d, "cgd", 2e-12) + p(d, "cgdo", 0) * w + mgd;
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
          const vtarget = mid + span * tanh;
          const dv = (gain * (1 - tanh * tanh)) / 1;
          const rout = p(d, "rout", d.type === "COMPARATOR" ? 100 : 75);
          // S4.1: OPV im Transient mit Einpol-GBW + Slew (DC/OP und
          // COMPARATOR bleiben statisch). Boyle-Stil: Der Pol wirkt auf den
          // LINEAREN Fehler (tau·dVi/dt + Vi = A0·vd), die Sättigung danach
          // (Vi = interne Hochverstärkungs-Knotenspannung, darf Rails
          // überschreiten, geklemmt gegen Windup). Pol hinter der Sättigung
          // geht nicht: Dort ist dv = 0 und Newton erblindet (Folger fror
          // ein). Slew klemmt |ΔVe| ≤ SR·dt; Jacobian aus linearem Anteil
          // (Chord — dokumentiert). Konsistent zum AC-Einpol in buildAcMatrix.
          let veq = vtarget;
          let dveq = dv;
          if (ctx.transient && d.type === "OPAMP") {
            const gbw = Math.max(p(d, "gbw", 1e6), 1);
            const tau = gain / (2 * Math.PI * gbw);
            const k = tau > 0 ? ctx.dt / tau / (1 + ctx.dt / tau) : 1;
            let viPrev = st.extra!.vi;
            if (viPrev === undefined) {
              // Erster Transient-Schritt: Vi aus OP-Ausgang zurückgewinnen.
              const frac = Math.max(-0.999, Math.min(0.999, (this.vOf(no) - mid) / span));
              viPrev = mid + span * Math.atanh(frac);
            }
            const viNew = viPrev + k * (gain * vd + mid - viPrev);
            const viCl = mid + Math.max(-2 * span, Math.min(2 * span, viNew - mid));
            const satArg = Math.max(-40, Math.min(40, (viCl - mid) / span));
            const satTanh = Math.tanh(satArg);
            const veTarget = mid + span * satTanh;
            const vePrev = st.extra!.ve ?? this.vOf(no);
            const slew = p(d, "slew", 0);
            const veLin = veTarget;
            veq = slew > 0 ? vePrev + Math.max(-slew * ctx.dt, Math.min(slew * ctx.dt, veLin - vePrev)) : veLin;
            dveq = (1 - satTanh * satTanh) * k * gain;
            st.extra!.viNew = viCl;
            st.extra!.veNew = veq;
          } else if (!ctx.transient && d.type === "OPAMP") {
            // S4.1-Fix: OP hinterlegt akzeptierte Startwerte für TRAN-Schritt 1.
            // Vorher las Schritt 1 `vOf(no)` = laufende Newton-Iterierte, der
            // Slew-Clamp war dadurch im ersten Schritt wirkungslos (0 → 8 V
            // in 100 ns bei Kante an t = 0). UIC-Pfad: Fallback unten bleibt.
            const frac0 = Math.max(-0.999, Math.min(0.999, (vtarget - mid) / span));
            st.extra!.vi = mid + span * Math.atanh(frac0);
            st.extra!.ve = vtarget;
          }
          // branch: v(out) - rout*i = veq_lin  => linearised around vd
          if (no >= 0) {
            m.add(no, br, 1);
            m.add(br, no, 1);
          }
          m.add(br, br, -rout);
          if (np >= 0) m.add(br, np, -dveq);
          if (nn >= 0) m.add(br, nn, dveq);
          m.addRhs(br, veq - dveq * vd);
          // differential input resistance
          this.stampConductance(m, np, nn, 1 / Math.max(p(d, "rin", 2e6), 1));
          st.extra!.vout = vtarget;
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
        let iout = 0;
        if (q) {
          // High-side totem-pole output transistor sources current from VCC to OUT
          const vDrop = Math.min(1.7, Math.max(0, vcc - vGnd - 0.1));
          this.stampVoltageSoft(m, nOut, nVcc, -vDrop, 10);
          const vOut = this.vOf(nOut);
          iout = (vcc - vDrop - vOut) / 10;
        } else {
          // Low-side totem-pole output transistor sinks OUT directly to GND
          this.stampConductance(m, nOut, nGnd, 1 / 10);
          const vOut = this.vOf(nOut);
          iout = -(vOut - vGnd) / 10;
        }
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
        // Supply current: divider + high-side output current + quiescent
        const iDiv = (vcc - vGnd) / 15000;
        st.extra!.isupply = iDiv + Math.max(0, iout) + 0.003;
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
      // Runde 24 (W59): Divergenzschutz. Ohne ihn galt eine entgleiste
      // Iteration als "konvergiert", sobald die Werte nur groß genug waren
      // (die relative Toleranz wächst mit dem Betrag) – der Buck-Wandler
      // „konvergierte“ so auf 1e17 V. Absurde Beträge gelten jetzt als
      // Nicht-Konvergenz, der Schritt wird verworfen und kleiner wiederholt.
      if (!Number.isFinite(a) || Math.abs(a) > SANE_LIMIT) return false;
      const tol = i < nNodes ? vntol + reltol * Math.max(Math.abs(a), Math.abs(b)) : abstol + reltol * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;
      if (Math.abs(a - b) > tol) return false;
    }
    return true;
  }

  /** S2.2: Anzeigename für einen Lösungsvektor-Index (Knoten oder Stromzweig). */
  private suspectName(i: number): string {
    if (i < this.nodeNames.length) return this.nodeNames[i];
    const b = i - this.nodeNames.length;
    return "I(" + (this.branchNames[b] ?? `Zweig${b}`) + ")";
  }

  iterate(ctx: StampContext): SolveResult {
    const maxIter = this.options.maxIter;
    const n = this.size;
    let damping = 1;
    // S2.2: Diagonale vor dem Lösen sichern (solve() faktorisiert in place);
    // normierte Updates für die Verdächtigen-Rangliste merken.
    const diag = new Float64Array(n);
    const lastScore = new Float64Array(n);
    const { abstol, reltol, vntol } = this.options;
    const nNodes = this.nodeNames.length;
    for (let iter = 0; iter < maxIter; iter++) {
      this.matrix.clear();
      this.limited = false;
      this.loadDevices(ctx);
      for (let i = 0; i < n; i++) diag[i] = this.matrix.a[i * n + i];
      const sol = this.matrix.solve();
      if (!sol) {
        const suspects: string[] = [];
        for (let i = 0; i < n && suspects.length < 3; i++) {
          if (Math.abs(diag[i]) < 1e-18) suspects.push(this.suspectName(i));
        }
        return {
          ok: false,
          iterations: iter,
          message: "Singulaere Matrix (Knoten ohne DC-Pfad zur Masse?)",
          failure: "singular",
          suspects,
        };
      }
      if (iter > 20) damping = 0.6;
      if (iter > 50) damping = 0.3;
      const next = new Float64Array(this.size);
      for (let i = 0; i < this.size; i++) next[i] = this.x[i] + damping * (sol[i] - this.x[i]);
      for (let i = 0; i < n; i++) {
        const a = next[i];
        const b = this.x[i];
        const tol =
          i < nNodes
            ? vntol + reltol * Math.max(Math.abs(a), Math.abs(b))
            : abstol + reltol * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;
        const d = Math.abs(a - b);
        lastScore[i] = !Number.isFinite(d) ? Number.POSITIVE_INFINITY : d / tol;
      }
      const done = this.converged(next) && iter > 0;
      this.x = next;
      if (done) return { ok: true, iterations: iter + 1 };
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => lastScore[q] - lastScore[p]);
    const suspects = order.slice(0, 3).filter((i) => lastScore[i] > 0).map((i) => this.suspectName(i));
    return {
      ok: false,
      iterations: maxIter,
      message: "Keine Konvergenz (Newton-Raphson Grenze erreicht)",
      failure: "nonconvergent",
      suspects,
    };
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
        case "TLINE": {
          // S4.6: akzeptierte Wellengrößen anhängen (s = 2V − E aus I = (V−E)/Z0),
          // Historie älter als eine Laufzeit stutzen.
          const td = this.tlineDelay(d);
          if (!(td > 0)) break;
          const n2 = this.idx(d.nodes[2]);
          const n3 = this.idx(d.nodes[3]);
          const v1 = this.vOf(n0) - this.vOf(n1);
          const v2 = this.vOf(n2) - this.vOf(n3);
          const [e1, e2] = this.tlineExcitation(d, this.time);
          const h = st.outputs ?? [];
          h.push(this.time, 2 * v1 - e1, 2 * v2 - e2);
          while (h.length > 6 && h[3] < this.time - td) h.splice(0, 3);
          st.outputs = h;
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
        case "OPAMP": {
          // S4.1: akzeptierter Pol-Zustand + Ausgang für Schritt n+1.
          // (Vi geklemmt gegen Windup; Rest wie in loadDevices berechnet.)
          if (st.extra!.viNew !== undefined) st.extra!.vi = st.extra!.viNew;
          if (st.extra!.veNew !== undefined) st.extra!.ve = st.extra!.veNew;
          break;
        }
        case "FUSE": {
          // S4.5: Joule-Integral dw/dt = i² − w/τ, Schmelzen bei w ≥ I²t (rastend).
          // i2t = 0 → auto (2·IN)²·τ: hält Nennstrom dauerhaft, löst bei 10×
          // Nennstrom in ≈ 40 ms aus. Nur TRAN (DC kennt keine Zeit).
          if ((st.extra!.blown ?? 0) > 0.5) break;
          const irated = Math.max(p(d, "irated", 1), 1e-9);
          const tau = Math.max(p(d, "tau", 1), 1e-6);
          const i2t = p(d, "i2t", 0) > 0 ? p(d, "i2t", 0) : 4 * irated * irated * tau;
          const r = Math.max(this.resistance(d), 1e-12);
          const i = (this.vOf(n0) - this.vOf(n1)) / r;
          const wPrev = Math.max(st.extra!.w ?? 0, 0);
          st.extra!.w = Math.max(wPrev + (i * i - wPrev / tau) * dt, 0);
          if (st.extra!.w >= i2t) st.extra!.blown = 1;
          break;
        }
        default:
          break;
      }
    }
    this.lastDt = dt;
  }

  /**
   * Runde 24 (W59): Analoger Zustand für einen Schritt sichern. Wird ein
   * Schritt verworfen (Nicht-Konvergenz), muss der nächste Versuch exakt vom
   * letzten *akzeptierten* Zustand starten – vorher lief er aus dem entgleisten
   * Iterationsstand weiter und war damit praktisch aussichtslos.
   */
  private savePoint(): { x: Float64Array; devices: Array<{ vprev: number[]; extra: Record<string, number>; outputs: number[] | undefined }> } {
    return {
      x: Float64Array.from(this.x),
      devices: this.netlist.devices.map((d) => ({
        vprev: d.state ? Array.from(d.state.vprev) : [],
        extra: { ...(d.state?.extra ?? {}) },
        outputs: d.state?.outputs ? Array.from(d.state.outputs) : undefined,
      })),
    };
  }

  private restorePoint(sp: { x: Float64Array; devices: Array<{ vprev: number[]; extra: Record<string, number>; outputs: number[] | undefined }> }): void {
    this.x.set(sp.x);
    this.netlist.devices.forEach((d, i) => {
      const s = d.state;
      const p0 = sp.devices[i];
      if (!s || !p0) return;
      for (let k = 0; k < s.vprev.length && k < p0.vprev.length; k++) s.vprev[k] = p0.vprev[k];
      if (s.extra) for (const key of Object.keys(s.extra)) s.extra[key] = p0.extra[key];
      if (p0.outputs) s.outputs = Array.from(p0.outputs);
    });
  }

  /** Advance one transient step. Returns false when the step failed to converge. */
  step(dt: number): SolveResult {
    const t0 = this.time;
    const t = t0 + dt;
    const sp = this.savePoint();
    this.time = t;
    this.updateEvents(dt);
    const res = this.iterate(this.makeCtx(t, dt, true));
    if (res.ok) {
      this.acceptTimestep(dt);
    } else {
      this.time = t0;
      this.restorePoint(sp);
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
