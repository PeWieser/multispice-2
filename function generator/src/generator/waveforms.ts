import type { Channel, GenState, ModShape, WaveId } from './types';

/**
 * Signalmodell – zustandslos: Spannung = f(Kanal-Parameter, Zeit t).
 * Dadurch kann jede Simulation (beliebige Zeitschritte) den Generator direkt abfragen.
 */

const TAU = Math.PI * 2;
export const NOISE_FS = 120e6; // Abtastrate des Rauschgenerators (wie Gerät: 120 MSa/s)

export const MAXF: Record<WaveId, number> = {
  sine: 25e6, square: 10e6, ramp: 300e3, pulse: 5e6, noise: 25e6, arb: 5e6,
};

export const WAVE_NAMES: Record<WaveId, string> = {
  sine: 'Sine', square: 'Square', ramp: 'Ramp', pulse: 'Pulse', noise: 'Noise', arb: 'Arb',
};

const frac = (x: number) => x - Math.floor(x);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const gauss = (x: number, m: number, w: number) => Math.exp(-0.5 * ((x - m) / w) ** 2);

export interface ArbDef { name: string; fn: (x: number) => number }
/** Eingebaute Arbiträr-Kurven, x = Phase 0..1, Rückgabe -1..1 */
export const ARB_WAVES: ArbDef[] = [
  { name: 'Exp Rise', fn: (x) => ((Math.exp(5 * x) - 1) / (Math.exp(5) - 1)) * 2 - 1 },
  { name: 'Exp Fall', fn: (x) => ((Math.exp(5 * (1 - x)) - 1) / (Math.exp(5) - 1)) * 2 - 1 },
  {
    name: 'Sinc',
    fn: (x) => {
      const u = (x - 0.5) * 14;
      const y = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
      return ((y + 0.2172) / 1.2172) * 2 - 1;
    },
  },
  { name: 'Gauss', fn: (x) => gauss(x, 0.5, 0.12) * 2 - 1 },
  { name: 'Lorentz', fn: (x) => (1 / (1 + ((x - 0.5) / 0.06) ** 2)) * 2 - 1 },
  {
    name: 'Cardiac',
    fn: (x) => {
      const y = 0.12 * gauss(x, 0.18, 0.04) - 0.15 * gauss(x, 0.38, 0.012) + gauss(x, 0.42, 0.014)
        - 0.25 * gauss(x, 0.46, 0.012) + 0.3 * gauss(x, 0.7, 0.06);
      return ((y + 0.25) / 1.25) * 2 - 1;
    },
  },
  { name: 'Rectified', fn: (x) => Math.abs(Math.sin(TAU * x)) * 2 - 1 },
  { name: 'Staircase', fn: (x) => (Math.floor(x * 8) / 7) * 2 - 1 },
  {
    name: 'Trapezoid',
    fn: (x) => (x < 0.2 ? -1 + (x / 0.2) * 2 : x < 0.5 ? 1 : x < 0.7 ? 1 - ((x - 0.5) / 0.2) * 2 : -1),
  },
  { name: 'Damped', fn: (x) => Math.exp(-4 * x) * Math.sin(TAU * 6 * x) },
];

export function modShape(shape: ModShape, x: number): number {
  const f = frac(x);
  if (shape === 'sine') return Math.sin(TAU * x);
  if (shape === 'square') return f < 0.5 ? 1 : -1;
  return 2 * f - 1;
}
/** Integral von modShape über eine Periodeneinheit (für FM) */
function modIntegral(shape: ModShape, x: number): number {
  const f = frac(x);
  if (shape === 'sine') return (1 - Math.cos(TAU * x)) / TAU;
  if (shape === 'square') return f < 0.5 ? f : 1 - f;
  return f * f - f;
}

/** Deterministisches weißes Rauschen (gleichverteilt −1..1), indexiert über Zeit */
export function noiseAt(t: number): number {
  const n = Math.floor(t * NOISE_FS);
  let h = (n >>> 0) ^ Math.imul(Math.floor(n / 4294967296) | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Trägerfunktion, p = Phase in Perioden */
export function carrierAt(c: Channel, p: number): number {
  const f = frac(p);
  switch (c.wave) {
    case 'sine': return Math.sin(TAU * p);
    case 'square': return f < c.duty / 100 ? 1 : -1;
    case 'ramp': {
      const s = c.symmetry / 100;
      return f < s ? -1 + (2 * f) / s : 1 - (2 * (f - s)) / (1 - s);
    }
    case 'pulse': {
      const d = clamp(c.width * c.freq, 0, 1);
      return frac(p - c.delay * c.freq) < d ? 1 : -1;
    }
    case 'arb': return ARB_WAVES[c.arb]?.fn(f) ?? 0;
    default: return 0;
  }
}

/** Normierter Ausgangswert −1..1 (vor Amplitude/Offset) */
export function normalized(c: Channel, t: number): number {
  if (c.wave === 'noise') return noiseAt(t);
  const ph = c.phase / 360;
  switch (c.mode) {
    case 'AM': {
      const d = c.mod.depth / 100;
      const m = modShape(c.mod.shape, c.mod.freq * t);
      return (carrierAt(c, c.freq * t + ph) * (1 + d * m)) / (1 + d);
    }
    case 'FM': {
      const beta = c.mod.devFreq / c.mod.freq;
      return carrierAt(c, c.freq * t + ph + beta * modIntegral(c.mod.shape, c.mod.freq * t));
    }
    case 'PM':
      return carrierAt(c, c.freq * t + ph + (c.mod.devPhase / 360) * modShape(c.mod.shape, c.mod.freq * t));
    case 'FSK': {
      const Tr = 1 / c.mod.rate;
      const half = Tr / 2;
      const k = Math.floor(t / Tr);
      const r = t - k * Tr;
      const f0 = c.freq;
      const f1 = c.mod.hopFreq;
      const p = k * (f0 + f1) * half + (r < half ? f0 * r : f0 * half + f1 * (r - half));
      return carrierAt(c, p + ph);
    }
    case 'sweep': {
      const T = c.sweep.time;
      const tp = t - Math.floor(t / T) * T;
      const f0 = c.sweep.start;
      const f1 = c.sweep.stop;
      let p: number;
      if (c.sweep.type === 'lin') p = f0 * tp + ((f1 - f0) * tp * tp) / (2 * T);
      else {
        const r = f1 / f0;
        p = Math.abs(r - 1) < 1e-9 ? f0 * tp : ((f0 * T) / Math.log(r)) * (Math.pow(r, tp / T) - 1);
      }
      return carrierAt(c, p + ph);
    }
    case 'burst': {
      const Tb = c.burst.period;
      const tb = t - Math.floor(t / Tb) * Tb;
      if (tb * c.freq >= c.burst.cycles) return 0;
      return carrierAt(c, c.freq * tb + ph);
    }
    default:
      return carrierAt(c, c.freq * t + ph);
  }
}

/** Leerlaufspannung, wie sie an der eingestellten Last angezeigt wird (ohne Ausgangs-Schalter) */
export function rawVoltage(c: Channel, t: number): number {
  return (c.amp / 2) * normalized(c, t) + c.offset;
}

/**
 * Spannung am BNC-Ausgang.
 * loadOhms = Infinity → Leerlauf. Innenwiderstand 50 Ω.
 * Stellung "50 Ω": das Gerät geht von 50 Ω Last aus → Leerlaufspannung = 2 × Anzeige.
 */
export function outputVoltage(s: GenState, idx: 0 | 1, t: number, loadOhms = Infinity): number {
  const c = s.ch[idx];
  if (!s.sys.power || !c.output) return 0;
  const open = rawVoltage(c, t) * (c.load === '50' ? 2 : 1);
  return Number.isFinite(loadOhms) ? (open * loadOhms) / (loadOhms + 50) : open;
}

/** TTL-Sync-Signal (0 / 5 V): folgt der Trägerphase, bei Burst nur während des Bursts */
export function syncVoltage(s: GenState, idx: 0 | 1, t: number): number {
  const c = s.ch[idx];
  if (!s.sys.power || !s.sys.sync) return 0;
  if (c.mode === 'burst') {
    const Tb = c.burst.period;
    const tb = t - Math.floor(t / Tb) * Tb;
    return tb * c.freq < c.burst.cycles ? 5 : 0;
  }
  if (c.mode === 'sweep') {
    const T = c.sweep.time;
    return t - Math.floor(t / T) * T < T / 2 ? 5 : 0;
  }
  return frac(c.freq * t + c.phase / 360) < 0.5 ? 5 : 0;
}

/**
 * Vorschau für das LCD: skaliert Modulation/Sweep/Burst so, dass die Kurve sichtbar bleibt.
 * Liefert eine Kanal-Kopie und das Zeitfenster.
 */
export function previewSpec(c: Channel): { ch: Channel; window: number } {
  const r = previewSpec0(c);
  if (r.ch.freq !== c.freq && c.wave === 'pulse') {
    r.ch.width = (c.width * c.freq) / r.ch.freq;
    r.ch.delay = (c.delay * c.freq) / r.ch.freq;
  }
  return r;
}

function previewSpec0(c: Channel): { ch: Channel; window: number } {
  const p: Channel = structuredClone(c);
  if (c.wave === 'noise') return { ch: p, window: 400 / NOISE_FS };
  const T = 1 / c.freq;
  switch (c.mode) {
    case 'AM':
    case 'PM':
    case 'FM': {
      const r = Math.max(0.5, Math.min(c.freq / c.mod.freq, 10));
      p.mod.freq = 1;
      p.freq = r;
      if (c.mode === 'FM') p.mod.devFreq = Math.min(c.mod.devFreq / c.mod.freq, r * 0.7);
      return { ch: p, window: 1 };
    }
    case 'FSK': {
      const Tr = 1 / c.mod.rate;
      const cycles = Math.max(c.freq, c.mod.hopFreq) * Tr;
      const k = cycles > 8 ? 8 / cycles : 1;
      p.mod.rate = 1;
      p.freq = c.freq * Tr * k;
      p.mod.hopFreq = c.mod.hopFreq * Tr * k;
      return { ch: p, window: 1 };
    }
    case 'sweep': {
      const k = 10 / Math.max(c.sweep.start, c.sweep.stop);
      p.sweep.time = 1;
      p.sweep.start = c.sweep.start * k;
      p.sweep.stop = c.sweep.stop * k;
      return { ch: p, window: 1 };
    }
    case 'burst': {
      const a = c.burst.period * c.freq;
      const a2 = Math.min(a, 20);
      p.burst.period = 1;
      p.freq = a2;
      p.burst.cycles = a > 20 ? Math.max(1, Math.round((c.burst.cycles * 20) / a)) : c.burst.cycles;
      return { ch: p, window: 1 };
    }
    default:
      return { ch: p, window: 2 * T };
  }
}

export function previewPoints(c: Channel, n = 400): number[] {
  const { ch, window } = previewSpec(c);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = normalized(ch, (window * i) / (n - 1));
  return out;
}
