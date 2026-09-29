import type { Env, MeasType, Settings } from './types';
import { ceil125, clamp } from './types';
import { hash32, lineValue, sourceValue } from './signals';

export const NPTS = 2000;
export const HDIV = 15;
export const VDIV = 8;

export interface Acq {
  t0: number;
  dt: number;
  tt: number;
  data: Float32Array[];
  min: (Float32Array | null)[];
  max: (Float32Array | null)[];
  triggered: boolean;
}

/** Wall-Time Helper para Single-Trigger Timeout */
let _wallNow = () => performance.now() / 1000;
export const setWallNow = (fn: () => number) => { _wallNow = fn; };
export const wallNow = () => _wallNow();

/** Single-Trigger Konfiguration (Wall-Time constants) */
export const SINGLE_TIMEOUT_WALL = 30; // segundos Wall-Time hasta abortar
export const SINGLE_POST_WAIT_WALL = 0.5; // segundos Wall-Time post-trigger para mostrar

// ----- filter helpers -----
class Chain {
  hp = 0; hpPrev = 0; lp1 = 0; lp2 = 0; init = false;
  constructor(
    private aHp: number, private kHp: number,
    private aLp1: number, private useLp1: boolean,
    private aLp2: number, private useLp2: boolean,
  ) {}
  run(x: number): number {
    if (!this.init) {
      this.init = true; this.hpPrev = x; this.lp1 = x; this.lp2 = x;
    }
    let y = x;
    if (this.kHp !== 0) {
      this.hp = this.aHp * (this.hp + x - this.hpPrev);
      this.hpPrev = x;
      y = x + this.kHp * this.hp;
    }
    if (this.useLp1) { this.lp1 = this.aLp1 * this.lp1 + (1 - this.aLp1) * y; y = this.lp1; }
    if (this.useLp2) { this.lp2 = this.aLp2 * this.lp2 + (1 - this.aLp2) * y; y = this.lp2; }
    return y;
  }
}

const TAU_COMP = 120e-6;
const TAU_1X = 1 / (2 * Math.PI * 6e6);
const TAU_BW = 1 / (2 * Math.PI * 20e6);
const TAU_SCOPE = 1 / (2 * Math.PI * 70e6);

/** Signal as seen by the scope input stage (displayed volts, no noise, no filters) */
export function channelRaw(ch: number, t: number, s: Settings, env: Env, acMean: number[]): number {
  const c = s.ch[ch];
  const p = env.probes[ch];
  if (c.coupling === 'GND') return 0;
  let v = p.target ? sourceValue(p.target, t, env) : 0;
  v = (v / p.atten) * c.probe;
  if (c.coupling === 'AC') v -= acMean[ch];
  return v;
}

export function computeAcMeans(now: number, s: Settings, env: Env): number[] {
  const out = [0, 0, 0, 0];
  for (let ch = 0; ch < 4; ch++) {
    const p = env.probes[ch];
    if (s.ch[ch].coupling !== 'AC' || !p.target) continue;
    let sum = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const t = now - 1.2 + (1.2 * (i + (hash32(i + 99) / 4294967296))) / N;
      sum += sourceValue(p.target, t, env);
    }
    out[ch] = ((sum / N) / p.atten) * s.ch[ch].probe;
  }
  return out;
}

export function acquire(tt: number, centerT: number, tdiv: number, s: Settings, env: Env, acMean: number[], triggered: boolean): Acq {
  const span = HDIV * tdiv;
  const dt = span / NPTS;
  const t0 = centerT - span / 2;
  const peak = s.acq.mode === 'peak';
  const data: Float32Array[] = [];
  const mins: (Float32Array | null)[] = [];
  const maxs: (Float32Array | null)[] = [];
  const seed = hash32(Math.floor(tt * 1e9) ^ Math.floor(tt * 7.3e3));
  const needed = (ch: number) =>
    s.ch[ch].on || (s.math.on && (s.math.a === ch || s.math.b === ch)) || (s.fft.on && s.fft.source === ch) ||
    s.meas.list.some((m) => m.src === ch) || (s.search.on && s.search.src === ch) || s.trig.source === ch ||
    (s.cursor.mode !== 'off' && s.cursor.src === ch) || (s.acq.xy && ch < 2);
  for (let ch = 0; ch < 4; ch++) {
    const c = s.ch[ch];
    const p = env.probes[ch];
    const d = new Float32Array(NPTS);
    if (!needed(ch)) { data.push(d); mins.push(peak ? new Float32Array(NPTS) : null); maxs.push(peak ? new Float32Array(NPTS) : null); continue; }
    const mn = peak ? new Float32Array(NPTS) : null;
    const mx = peak ? new Float32Array(NPTS) : null;
    const kHp = p.atten === 10 ? p.comp : 0;
    const useLp1 = p.atten === 1;
    const useLp2 = c.bwLimit;
    const aHp = Math.exp(-dt / TAU_COMP);
    const aLp1 = Math.exp(-dt / TAU_1X);
    const aLp2 = Math.exp(-dt / (c.bwLimit ? TAU_BW : TAU_SCOPE));
    const needPre = kHp !== 0 || useLp1 || useLp2;
    const tauMax = Math.max(kHp !== 0 ? TAU_COMP : 0, useLp1 ? TAU_1X : 0, useLp2 ? TAU_BW : 0);
    const pre = needPre ? Math.min(3000, Math.ceil((5 * tauMax) / dt)) : 0;
    const f0 = new Chain(aHp, kHp, aLp1, useLp1, aLp2, useLp2);
    const f1 = peak ? new Chain(aHp, kHp, aLp1, useLp1, aLp2, useLp2) : null;
    const f2 = peak ? new Chain(aHp, kHp, aLp1, useLp1, aLp2, useLp2) : null;
    // REAL OSCILLOSCOPE BEHAVIOR: No artificial noise on real signals (Multispice engine provides real noise).
    // Only minimal front-end noise floor (1 LSB equivalent) for display stability.
    const sigma = 0;
    const lo = (-5.2 - c.pos) * c.vdiv;
    const hi = (5.2 - c.pos) * c.vdiv;
    const inv = c.invert ? -1 : 1;
    for (let i = -pre; i < NPTS; i++) {
      const t = tt + t0 + i * dt;
      if (peak) {
        let vmin = Infinity, vmax = -Infinity, first = 0;
        for (let k = 0; k < 6; k++) {
          const v = channelRaw(ch, t + (k * dt) / 6, s, env, acMean);
          if (k === 0) first = v;
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        }
        const y0 = f0.run(first), y1 = f1!.run(vmin), y2 = f2!.run(vmax);
        if (i >= 0) {
          const a = clamp(y1, lo, hi) * inv, b = clamp(y2, lo, hi) * inv;
          mn![i] = Math.min(a, b);
          mx![i] = Math.max(a, b);
          d[i] = clamp(y0, lo, hi) * inv;
        }
      } else {
        const v = channelRaw(ch, t, s, env, acMean);
        const y = f0.run(v);
        if (i >= 0) {
          d[i] = clamp(y, lo, hi) * inv;
        }
      }
    }
    data.push(d);
    mins.push(mn);
    maxs.push(mx);
  }
  return { t0, dt, tt, data, min: mins, max: maxs, triggered };
}

// --------- trigger ----------
function trigValue(s: Settings, env: Env, acMean: number[], t: number): number {
  if (s.trig.source === 4) return lineValue(t);
  return channelRaw(s.trig.source, t, s, env, acMean);
}

export function findTrigger(a: number, b: number, s: Settings, env: Env, acMean: number[]): number | null {
  if (b <= a) return null;
  const L = s.trig.source === 4 ? 0 : s.trig.level;
  const N = 4000;
  const step = (b - a) / N;
  let prev = trigValue(s, env, acMean, a);
  const slope = s.trig.slope;
  for (let i = 1; i <= N; i++) {
    const t = a + i * step;
    const v = trigValue(s, env, acMean, t);
    const rising = prev < L && v >= L;
    const falling = prev > L && v <= L;
    if ((slope !== 'fall' && rising) || (slope !== 'rise' && falling)) {
      let lo = t - step, hi = t;
      const up = rising;
      for (let k = 0; k < 48; k++) {
        const m = (lo + hi) / 2;
        const vm = trigValue(s, env, acMean, m);
        if (up ? vm < L : vm > L) lo = m; else hi = m;
        if (hi - lo < 1e-13) break;
      }
      return (lo + hi) / 2;
    }
    prev = v;
  }
  return null;
}

// --------- engine ----------
export type AcqStatus = 'run' | 'trig?' | 'auto' | 'stop' | 'roll' | 'ready';

export interface StatEntry { n: number; sum: number; min: number; max: number }

export class Engine {
  display: Acq | null = null;
  avg: Float64Array[] | null = null;
  avgN = 0;
  key = '';
  lastTT = 0;
  searchStart = 0;
  pendingTT: number | null = null;
  pendingTriggered = true;
  lastAcqTime = -1;
  status: AcqStatus = 'run';
  forceTrig = false;
  acMean = [0, 0, 0, 0];
  frame = 0;
  stats = new Map<string, StatEntry>();
  acqCount = 0;

  // Wall-Time para Single-Trigger y Auto-Trigger timeout
  public singleStartWall: number | null = null;
  private lastWallTime = 0;

  settingsKey(s: Settings, env: Env): string {
    return JSON.stringify([s.ch, s.tdiv, s.hDelay, s.acq.mode, env.probes]);
  }

  private finish(acq: Acq, s: Settings) {
    if (s.acq.mode === 'average') {
      if (!this.avg) { this.avg = acq.data.map((d) => Float64Array.from(d)); this.avgN = 1; }
      else {
        this.avgN = Math.min(this.avgN + 1, s.acq.avgCount);
        const k = 1 / this.avgN;
        for (let ch = 0; ch < 4; ch++) {
          const A = this.avg[ch], D = acq.data[ch];
          for (let i = 0; i < NPTS; i++) A[i] += (D[i] - A[i]) * k;
        }
      }
      acq.data = this.avg.map((a) => Float32Array.from(a));
    }
    this.display = acq;
    this.lastTT = acq.tt;
    this.acqCount++;
  }

  /** returns {newAcq, singleDone}
   *  simTime = Simulationszeit (für Datenakquise, Trigger search)
   *  wallTime = Wall-Time (für Single-Trigger Timeout, Auto-Trigger timeout, post-wait)
   */
  step(simTime: number, wallTime: number, s: Settings, env: Env): { newAcq: boolean; singleDone: boolean } {
    this.frame++;
    if (this.frame % 10 === 1) this.acMean = computeAcMeans(simTime, s, env);
    const key = this.settingsKey(s, env);
    const keyChanged = key !== this.key;
    this.key = key;
    if (keyChanged) { this.avg = null; this.avgN = 0; }
    const tdiv = s.tdiv;
    const postT = (HDIV / 2) * tdiv + s.hDelay;

    // Sim-Reset erkennen (Zeit läuft rückwärts)
    if (simTime < this.lastTT) {
      this.pendingTT = null;
      this.searchStart = simTime;
      this.lastAcqTime = simTime - 1;
      this.singleStartWall = null;
    }

    if (s.run === 'stop') {
      this.status = 'stop';
      if (keyChanged && this.display) {
        const a = acquire(this.lastTT, s.hDelay, tdiv, s, env, this.acMean, this.display.triggered);
        this.display = a;
        return { newAcq: true, singleDone: false };
      }
      return { newAcq: false, singleDone: false };
    }

    const roll = s.acq.roll && tdiv >= 0.1 && s.trig.mode === 'auto' && s.run === 'run' && !s.acq.xy;
    if (roll) {
      this.status = 'roll';
      this.pendingTT = null;
      const tt = simTime - postT;
      this.finish(acquire(tt, s.hDelay, tdiv, s, env, this.acMean, false), { ...s, acq: { ...s.acq, mode: s.acq.mode === 'average' ? 'sample' : s.acq.mode } });
      this.searchStart = simTime;
      this.lastAcqTime = simTime;
      return { newAcq: true, singleDone: false };
    }

    // --- Single-Trigger & Trigger-Wartelogik nutzt WALL-TIME ---
    if (this.pendingTT !== null) {
      if (this.singleStartWall !== null) {
        // Single-Modus: Warte max SINGLE_TIMEOUT_WALL Sekunden nach Trigger
        if (wallTime >= this.singleStartWall + SINGLE_POST_WAIT_WALL) {
          const tt = this.pendingTT;
          this.pendingTT = null;
          this.singleStartWall = null;
          this.finish(acquire(tt, s.hDelay, tdiv, s, env, this.acMean, this.pendingTriggered), s);
          this.searchStart = tt + Math.max(postT, 0) + s.trig.holdoff;
          this.lastAcqTime = simTime;
          this.status = this.pendingTriggered ? 'run' : 'auto';
          return { newAcq: true, singleDone: true };
        }
        // Timeout: Single abgebrochen
        if (wallTime >= this.singleStartWall + SINGLE_TIMEOUT_WALL) {
          this.pendingTT = null;
          this.singleStartWall = null;
          this.status = 'stop';
          return { newAcq: false, singleDone: true };
        }
        return { newAcq: false, singleDone: false };
      } else {
        // Normaler Modus (run/auto): Post-Trigger in Sim-Time
        if (simTime >= this.pendingTT + postT) {
          const tt = this.pendingTT;
          this.pendingTT = null;
          this.finish(acquire(tt, s.hDelay, tdiv, s, env, this.acMean, this.pendingTriggered), s);
          this.searchStart = tt + Math.max(postT, 0) + s.trig.holdoff;
          this.lastAcqTime = simTime;
          this.status = this.pendingTriggered ? 'run' : 'auto';
          return { newAcq: true, singleDone: false };
        }
        return { newAcq: false, singleDone: false };
      }
    }

    if (this.forceTrig) {
      this.forceTrig = false;
      this.pendingTT = simTime;
      this.pendingTriggered = true;
      if (s.run === 'single') this.singleStartWall = wallTime;
      return { newAcq: false, singleDone: false };
    }

    // Trigger-Suche in Simulationszeit (Suchfenster 0.25s)
    const a = Math.max(this.searchStart, simTime - 0.25);
    const found = findTrigger(a, simTime, s, env, this.acMean);
    if (found !== null) {
      this.pendingTT = found;
      this.pendingTriggered = true;
      this.searchStart = found;
      if (s.run === 'single') this.singleStartWall = wallTime;
      // Sofortige Fertigstellung falls Post-Zeit schon vergangen (in Sim-Time)
      if (simTime >= found + postT) return this.step(simTime, wallTime, s, env);
      return { newAcq: false, singleDone: false };
    }
    this.searchStart = simTime;

    // Auto-Trigger Timeout in Wall-Time (nicht Sim-Time!)
    const timeoutVal = Math.max(0.12, HDIV * tdiv * 1.2);
    if (s.trig.mode === 'auto' && s.run === 'run' && wallTime - this.lastAcqTime > timeoutVal) {
      const tt = simTime - Math.max(postT, 0);
      this.finish(acquire(tt, s.hDelay, tdiv, s, env, this.acMean, false), s);
      this.lastAcqTime = simTime;
      this.status = 'auto';
      return { newAcq: true, singleDone: false };
    }
    if (s.run === 'single') this.status = 'ready';
    else if (wallTime - this.lastAcqTime > timeoutVal) this.status = s.trig.mode === 'auto' ? 'auto' : 'trig?';
    return { newAcq: false, singleDone: false };
  }
}

// --------- measurements ----------
export interface MeasResult { value: number; unit: string }

function histTopBase(d: ArrayLike<number>): { top: number; base: number; max: number; min: number } {
  let max = -Infinity, min = Infinity;
  for (let i = 0; i < d.length; i++) { const v = d[i]; if (v > max) max = v; if (v < min) min = v; }
  const range = max - min;
  if (range <= 0) return { top: max, base: min, max, min };
  const B = 100;
  const h = new Array(B).fill(0);
  for (let i = 0; i < d.length; i++) h[Math.min(B - 1, Math.floor(((d[i] - min) / range) * B))]++;
  let ti = B - 1, bi = 0, tc = -1, bc = -1;
  for (let i = B / 2; i < B; i++) if (h[i] > tc) { tc = h[i]; ti = i; }
  for (let i = 0; i < B / 2; i++) if (h[i] > bc) { bc = h[i]; bi = i; }
  const minCount = d.length * 0.05;
  const top = tc > minCount ? min + ((ti + 0.5) / B) * range : max;
  const base = bc > minCount ? min + ((bi + 0.5) / B) * range : min;
  return { top, base, max, min };
}

interface Crossings { rise: number[]; fall: number[] }

function crossings(d: ArrayLike<number>, lvl: number, hyst: number, dt: number): Crossings {
  const rise: number[] = [], fall: number[] = [];
  let state = d[0] > lvl ? 1 : -1;
  for (let i = 1; i < d.length; i++) {
    const v = d[i];
    if (state < 0 && v > lvl + hyst) {
      let j = i;
      while (j > 0 && d[j - 1] > lvl) j--;
      const a = d[j - 1] ?? lvl, b = d[j];
      const f = b !== a ? (lvl - a) / (b - a) : 0;
      rise.push((j - 1 + f) * dt);
      state = 1;
    } else if (state > 0 && v < lvl - hyst) {
      let j = i;
      while (j > 0 && d[j - 1] < lvl) j--;
      const a = d[j - 1] ?? lvl, b = d[j];
      const f = b !== a ? (lvl - a) / (b - a) : 0;
      fall.push((j - 1 + f) * dt);
      state = -1;
    }
  }
  return { rise, fall };
}

function edgeTime(d: ArrayLike<number>, dt: number, lo: number, hi: number, rising: boolean): number {
  const n = d.length;
  const inLow = (v: number) => (rising ? v < lo : v > hi);
  const inHigh = (v: number) => (rising ? v > hi : v < lo);
  let i = 0;
  while (i < n && !inLow(d[i])) i++;
  for (; i < n; i++) {
    if (!inLow(d[i])) {
      const start = i;
      let j = i;
      while (j < n && !inHigh(d[j]) && !inLow(d[j])) j++;
      if (j < n && inHigh(d[j])) {
        const a0 = d[start - 1], a1 = d[start];
        const l1 = rising ? lo : hi;
        const f0 = a1 !== a0 ? (l1 - a0) / (a1 - a0) : 0;
        const b0 = d[j - 1], b1 = d[j];
        const l2 = rising ? hi : lo;
        const f1 = b1 !== b0 ? (l2 - b0) / (b1 - b0) : 0;
        return (j - 1 + f1 - (start - 1 + f0)) * dt;
      }
      i = j;
      while (i < n && !inLow(d[i])) i++;
    }
  }
  return NaN;
}

export function measure(type: MeasType, d: ArrayLike<number> | null, dt: number): MeasResult {
  if (!d) return { value: NaN, unit: 'V' };
  const n = d.length;
  const V = (value: number) => ({ value, unit: 'V' });
  switch (type) {
    case 'mean': { let s = 0; for (let i = 0; i < n; i++) s += d[i]; return V(s / n); }
    case 'rms': { let s = 0; for (let i = 0; i < n; i++) s += d[i] * d[i]; return V(Math.sqrt(s / n)); }
  }
  const tb = histTopBase(d);
  const amp = tb.top - tb.base;
  switch (type) {
    case 'max': return V(tb.max);
    case 'min': return V(tb.min);
    case 'pkpk': return V(tb.max - tb.min);
    case 'high': return V(tb.top);
    case 'low': return V(tb.base);
    case 'amp': return V(amp);
  }
  const range = tb.max - tb.min;
  if (range < 1e-9) return { value: NaN, unit: type === 'freq' ? 'Hz' : type.includes('duty') ? '%' : 's' };
  const mid = (tb.top + tb.base) / 2;
  const cr = crossings(d, mid, Math.max(amp, range * 0.5) * 0.08, dt);
  const period = cr.rise.length >= 2 ? (cr.rise[cr.rise.length - 1] - cr.rise[0]) / (cr.rise.length - 1)
    : cr.fall.length >= 2 ? (cr.fall[cr.fall.length - 1] - cr.fall[0]) / (cr.fall.length - 1) : NaN;
  const pw = (() => { for (const r of cr.rise) { const f = cr.fall.find((x) => x > r); if (f !== undefined) return f - r; } return NaN; })();
  const nw = (() => { for (const f of cr.fall) { const r = cr.rise.find((x) => x > f); if (r !== undefined) return r - f; } return NaN; })();
  switch (type) {
    case 'freq': return { value: 1 / period, unit: 'Hz' };
    case 'period': return { value: period, unit: 's' };
    case 'pwidth': return { value: pw, unit: 's' };
    case 'nwidth': return { value: nw, unit: 's' };
    case 'pduty': return { value: (pw / period) * 100, unit: '%' };
    case 'nduty': return { value: (nw / period) * 100, unit: '%' };
    case 'rise': return { value: edgeTime(d, dt, tb.base + 0.1 * amp, tb.base + 0.9 * amp, true), unit: 's' };
    case 'fall': return { value: edgeTime(d, dt, tb.base + 0.1 * amp, tb.base + 0.9 * amp, false), unit: 's' };
  }
  return V(NaN);
}

export function counterFreq(d: ArrayLike<number> | null, dt: number, level: number): number {
  if (!d) return NaN;
  let max = -Infinity, min = Infinity;
  for (let i = 0; i < d.length; i++) { if (d[i] > max) max = d[i]; if (d[i] < min) min = d[i]; }
  if (level < min || level > max) return NaN;
  const cr = crossings(d, level, (max - min) * 0.05, dt);
  if (cr.rise.length < 2) return NaN;
  return (cr.rise.length - 1) / (cr.rise[cr.rise.length - 1] - cr.rise[0]);
}

// --------- math & FFT ----------
export function mathTrace(s: Settings, a: Acq): Float32Array {
  const A = a.data[s.math.a], B = a.data[s.math.b];
  const out = new Float32Array(NPTS);
  for (let i = 0; i < NPTS; i++) {
    out[i] = s.math.op === '+' ? A[i] + B[i] : s.math.op === '-' ? A[i] - B[i] : A[i] * B[i];
  }
  return out;
}

export function fftDb(d: ArrayLike<number>, win: Settings['fft']['window']): Float32Array {
  const N = 2048;
  const re = new Float64Array(N), im = new Float64Array(N);
  const n = Math.min(d.length, N);
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    let w = 1;
    if (win === 'hann') w = 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
    else if (win === 'rect') w = 1.0;
    else if (win === 'hamming') w = 0.54 - 0.46 * Math.cos(2 * Math.PI * x);
    else if (win === 'blackman') w = 0.42 - 0.5 * Math.cos(2 * Math.PI * x) + 0.08 * Math.cos(4 * Math.PI * x);
    re[i] = d[i] * w;
    wsum += w;
  }
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const out = new Float32Array(N / 2);
  for (let k = 0; k < N / 2; k++) {
    const mag = (Math.hypot(re[k], im[k]) * (k === 0 ? 1 : 2)) / wsum;
    const rms = k === 0 ? mag : mag / Math.SQRT2;
    out[k] = 20 * Math.log10(Math.max(rms, 1e-9));
  }
  return out;
}

// --------- autoset ----------
export interface SignalInfo { freq: number; max: number; min: number; mean: number }

export function analyzeSource(ch: number, s: Settings, env: Env, now: number): SignalInfo | null {
  const p = env.probes[ch];
  if (!p.target || p.target === 'gnd') return null;
  const ratio = s.ch[ch].probe / p.atten;
  const N = 20000;
  let W = 20e-6;
  let res: SignalInfo | null = null;
  while (W <= 4) {
    let max = -Infinity, min = Infinity, sum = 0;
    const vals = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = sourceValue(p.target, now - W + (i * W) / N, env) * ratio;
      vals[i] = v; sum += v;
      if (v > max) max = v; if (v < min) min = v;
    }
    const mid = (max + min) / 2;
    const cr = crossings(vals, mid, (max - min) * 0.1, W / N);
    res = { freq: NaN, max, min, mean: sum / N };
    if (max - min > 1e-3 && cr.rise.length >= 3) {
      res.freq = (cr.rise.length - 1) / (cr.rise[cr.rise.length - 1] - cr.rise[0]);
      return res;
    }
    W *= 10;
  }
  return res;
}

export function autoset(s: Settings, env: Env, now: number): { settings: Settings; msg: string } {
  const infos = [0, 1, 2, 3].map((ch) => analyzeSource(ch, s, env, now));
  const active = infos.map((inf, i) => (inf && inf.max - inf.min > 0.005 * s.ch[i].probe ? i : -1)).filter((i) => i >= 0);
  if (active.length === 0) {
    return { settings: s, msg: 'Autoset: Kein Signal gefunden' };
  }
  const ns: Settings = JSON.parse(JSON.stringify({ ...s, ch: s.ch }));
  ns.meas = s.meas;
  ns.search = s.search;
  const n = active.length;
  const band = VDIV / n;
  ns.ch = s.ch.map((c, i) => {
    const idx = active.indexOf(i);
    if (idx < 0) return { ...c, on: false };
    const inf = infos[i]!;
    const pp = inf.max - inf.min;
    const vdiv = Math.max(0.001 * c.probe, ceil125(pp / (band * 0.75)));
    const center = VDIV / 2 - band * (idx + 0.5);
    const mid = (inf.max + inf.min) / 2;
    return { ...c, on: true, coupling: 'DC' as const, vdiv, pos: +(center - mid / vdiv).toFixed(2), fine: false };
  });
  const firstActive = active[0];
  const f = infos[firstActive]!.freq;
  ns.tdiv = isFinite(f) ? clamp(ceil125(2.5 / (f * 15)), 2e-9, 10) : 1e-3;
  ns.hDelay = 0;
  ns.trig = { ...s.trig, source: firstActive, slope: 'rise', mode: 'auto', level: +(((infos[firstActive]!.max + infos[firstActive]!.min) / 2).toPrecision(3)) };
  ns.acq = { ...s.acq, xy: false };
  ns.zoom = { ...s.zoom, on: false };
  ns.run = 'run';
  return { settings: ns, msg: 'Autoset abgeschlossen' };
}