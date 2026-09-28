import type { CircuitState, Env, GenState } from './types';

export const SOURCES: { id: string; label: string; desc: string }[] = [
  { id: 'tp1', label: 'TP1', desc: 'Kollektor T1' },
  { id: 'tp2', label: 'TP2', desc: 'Basis T1' },
  { id: 'tp3', label: 'TP3', desc: 'Kollektor T2' },
  { id: 'tp4', label: 'TP4', desc: 'Basis T2' },
  { id: 'gen', label: 'GEN', desc: 'Funktionsgenerator' },
  { id: 'comp', label: 'COMP', desc: 'Tastkopf-Abgleich 5V/1kHz' },
  { id: 'gnd', label: 'GND', desc: 'Masse' },
];

export const sourceLabel = (id: string | null) => (id ? SOURCES.find((s) => s.id === id)?.label ?? id : '—');

// ---------- deterministic noise ----------
export function hash32(x: number): number {
  x = x | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}
/** approx. gaussian N(0,1) from integer key */
export function gauss(k: number): number {
  const a = hash32(k) / 4294967296;
  const b = hash32(k + 0x51ed27) / 4294967296;
  const c = hash32(k ^ 0x2c1b3c6d) / 4294967296;
  return (a + b + c - 1.5) * 2;
}
export function noiseAt(t: number, salt: number, res = 1e-9): number {
  const k = Math.floor(t / res);
  const lo = k % 4294967296;
  const hi = Math.floor(k / 4294967296);
  return gauss((lo ^ Math.imul(hi, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) | 0);
}

// ---------- astable multivibrator ----------
const VSAT = 0.08;
const VBE = 0.68;
const TSW = 25e-9; // switching time constant

export interface AstableParams {
  TA: number; // Q1 on
  TB: number; // Q2 on
  T: number;
  vbStart1: number;
  vbStart2: number;
  vcEnd1: number;
  vcEnd2: number;
}

let cacheKey = '';
let cacheVal: AstableParams | null = null;

let cacheObj: CircuitState | null = null;
export function astableParams(c: CircuitState): AstableParams {
  if (c === cacheObj && cacheVal) return cacheVal;
  cacheObj = c;
  const key = `${c.vcc}|${c.c1}|${c.c2}|${c.rb1}|${c.rb2}|${c.rc}`;
  if (key === cacheKey && cacheVal) return cacheVal;
  const V = c.vcc;
  // first estimate with vcEnd = V, iterate twice for consistency
  let vcEnd1 = V, vcEnd2 = V, TA = 0, TB = 0, vbStart1 = 0, vbStart2 = 0;
  for (let it = 0; it < 3; it++) {
    vbStart2 = VBE - (vcEnd1 - VSAT); // Q1 switches on -> Vb2 kicked negative via C1
    vbStart1 = VBE - (vcEnd2 - VSAT);
    TA = c.rb2 * c.c1 * Math.log((V - vbStart2) / (V - VBE));
    TB = c.rb1 * c.c2 * Math.log((V - vbStart1) / (V - VBE));
    vcEnd1 = V - (V - VSAT) * Math.exp(-TB / (c.rc * c.c1));
    vcEnd2 = V - (V - VSAT) * Math.exp(-TA / (c.rc * c.c2));
  }
  cacheKey = key;
  cacheVal = { TA, TB, T: TA + TB, vbStart1, vbStart2, vcEnd1, vcEnd2 };
  return cacheVal;
}

function astable(which: number, t: number, c: CircuitState): number {
  if (!c.power || t < c.powerOnT) return 0;
  const p = astableParams(c);
  const V = c.vcc;
  let tau = (t - c.powerOnT) % p.T;
  // Phase A: Q1 on / Q2 off ; Phase B: Q2 on / Q1 off
  const phaseA = tau < p.TA;
  if (!phaseA) tau -= p.TA;
  const s = 1 - Math.exp(-tau / TSW);
  // map: which 0=Vc1 1=Vb1 2=Vc2 3=Vb2
  // "on" transistor = X, "off" transistor = Y
  const onIsQ1 = phaseA;
  const isQ1 = which === 0 || which === 1;
  const isCollector = which === 0 || which === 2;
  const onSide = onIsQ1 === isQ1;
  const cCharge = onIsQ1 ? c.c2 : c.c1; // capacitor charged by the rising collector of the OFF transistor
  const cBase = onIsQ1 ? c.c1 : c.c2; // capacitor discharged through RB of the OFF transistor
  const rbOff = onIsQ1 ? c.rb2 : c.rb1;
  const vcEndOn = onIsQ1 ? p.vcEnd1 : p.vcEnd2;
  const vbStartOff = onIsQ1 ? p.vbStart2 : p.vbStart1;
  if (isCollector) {
    if (onSide) {
      // falling edge towards Vsat
      return VSAT + (vcEndOn - VSAT) * (1 - s);
    }
    // rising via RC charging coupling cap
    return V - (V - VSAT) * Math.exp(-tau / (c.rc * cCharge));
  } else {
    if (onSide) {
      // base clamped to Vbe with small overshoot from charging current
      return VBE + 0.1 * (V / 9) * Math.exp(-tau / (c.rc * cCharge)) * s;
    }
    const charge = V - (V - vbStartOff) * Math.exp(-tau / (rbOff * cBase));
    return VBE * (1 - s) + charge * s;
  }
}

export function astableLedState(t: number, c: CircuitState): [number, number] {
  if (!c.power) return [0, 0];
  const p = astableParams(c);
  if (p.T < 0.03) {
    const d = p.TA / p.T;
    return [d, 1 - d];
  }
  const tau = (t - c.powerOnT) % p.T;
  return tau < p.TA ? [1, 0] : [0, 1];
}

// ---------- function generator ----------
function generator(t: number, g: GenState): number {
  if (!g.on) return 0;
  const ph = ((t * g.freq) % 1 + 1) % 1;
  const A = g.amp / 2;
  let v = 0;
  const edge = Math.min(0.02, 8e-9 * g.freq); // finite rise time (8ns)
  switch (g.wave) {
    case 'sine':
      v = Math.sin(2 * Math.PI * ph);
      break;
    case 'square':
      if (ph < edge) v = -1 + (2 * ph) / edge;
      else if (ph < 0.5) v = 1;
      else if (ph < 0.5 + edge) v = 1 - (2 * (ph - 0.5)) / edge;
      else v = -1;
      break;
    case 'triangle':
      v = ph < 0.5 ? -1 + 4 * ph : 3 - 4 * ph;
      break;
    case 'saw':
      v = ph < 1 - edge ? -1 + (2 * ph) / (1 - edge) : 1 - (2 * (ph - (1 - edge))) / edge;
      break;
    case 'pulse':
      if (ph < edge) v = -1 + (2 * ph) / edge;
      else if (ph < 0.1) v = 1;
      else if (ph < 0.1 + edge) v = 1 - (2 * (ph - 0.1)) / edge;
      else v = -1;
      break;
  }
  let out = g.offset + A * v;
  if (g.noise > 0) out += g.noise * noiseAt(t, 77, 2e-9);
  return out;
}

function probeComp(t: number): number {
  const ph = ((t * 1000) % 1 + 1) % 1;
  const tr = 2e-4; // 200ns in phase units (1ms period)
  if (ph < tr) return (5 * ph) / tr;
  if (ph < 0.5) return 5;
  if (ph < 0.5 + tr) return 5 - (5 * (ph - 0.5)) / tr;
  return 0;
}

/** voltage at a test point (at the probe tip) */
export function sourceValue(id: string | null, t: number, env: Env): number {
  switch (id) {
    case 'tp1': return astable(0, t, env.circuit);
    case 'tp2': return astable(1, t, env.circuit);
    case 'tp3': return astable(2, t, env.circuit);
    case 'tp4': return astable(3, t, env.circuit);
    case 'gen': return generator(t, env.gen);
    case 'comp': return probeComp(t);
    default: return 0;
  }
}

export function lineValue(t: number): number {
  return Math.sin(2 * Math.PI * 50 * t);
}
