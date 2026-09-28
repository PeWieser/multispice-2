import type { Env } from './types';

/* Multispice-Port (W30): Die Demo-Signalquellen der Testbench (Kippstufe,
 * Funktionsgenerator) entfallen – sourceValue() liefert die Netzspannung aus
 * der laufenden Simulation (env.sampler), 'comp'/'gnd' bedienen weiterhin die
 * Probe-Comp-Klemmen am Gerät. Rauschen/Hash-Funktionen 1:1 aus oszi v2. */

export const sourceLabel = (id: string | null) =>
  id === 'comp' ? 'COMP' : id === 'gnd' ? 'GND' : id ? id : 'offen';

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

// ---------- probe comp output (front terminal, 5 V / 1 kHz) ----------
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
    case 'comp':
      return probeComp(t);
    case 'gnd':
      return 0;
    case null:
    case '':
      return 0;
    default: {
      const v = env.sampler(id, t);
      // GND-Pin auf einem Netz ≠ 0 → Differenzmessung (Runde 14)
      return env.gndRef && env.gndRef !== id ? v - env.sampler(env.gndRef, t) : v;
    }
  }
}

export function lineValue(t: number): number {
  return Math.sin(2 * Math.PI * 50 * t);
}
