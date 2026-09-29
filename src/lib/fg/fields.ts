import type { Channel, FieldId, GenState, Kind } from './types';
import { MAXF } from './waveforms';
import { formatString, formatValue, tidy } from './format';

export interface Field {
  id: FieldId;
  /** Langer Name für die große Anzeige */
  name: string;
  /** Kurzname für Softkey-Menü */
  short: string;
  kind: Kind;
  get: (c: Channel) => number;
  set: (c: Channel, v: number) => void;
  range: (c: Channel) => [number, number];
  wrap?: number;
}

/** Maximale Spitzenspannung (Vpk): 20 Vpp an High-Z, 10 Vpp an 50 Ω */
export const vmax = (c: Channel) => (c.load === '50' ? 5 : 10);
const maxF = (c: Channel) => MAXF[c.wave];
const MIN_W = 20e-9;

const list: Field[] = [
  { id: 'freq', name: 'Frequency', short: 'Freq', kind: 'freq', get: (c) => c.freq, set: (c, v) => (c.freq = v), range: (c) => [1e-6, maxF(c)] },
  { id: 'period', name: 'Period', short: 'Period', kind: 'time', get: (c) => 1 / c.freq, set: (c, v) => (c.freq = 1 / v), range: (c) => [1 / maxF(c), 1e6] },
  { id: 'amp', name: 'Amplitude', short: 'Ampl', kind: 'vpp', get: (c) => c.amp, set: (c, v) => (c.amp = v), range: (c) => [1e-3, 2 * (vmax(c) - Math.abs(c.offset))] },
  {
    id: 'high', name: 'High Level', short: 'Hi_Level', kind: 'volt', get: (c) => c.offset + c.amp / 2,
    set: (c, v) => { const lo = c.offset - c.amp / 2; c.amp = tidy(v - lo); c.offset = tidy((v + lo) / 2); },
    range: (c) => [c.offset - c.amp / 2 + 1e-3, vmax(c)],
  },
  { id: 'offset', name: 'Offset', short: 'Offset', kind: 'volt', get: (c) => c.offset, set: (c, v) => (c.offset = v), range: (c) => [-(vmax(c) - c.amp / 2), vmax(c) - c.amp / 2] },
  {
    id: 'low', name: 'Low Level', short: 'Lo_Level', kind: 'volt', get: (c) => c.offset - c.amp / 2,
    set: (c, v) => { const hi = c.offset + c.amp / 2; c.amp = tidy(hi - v); c.offset = tidy((v + hi) / 2); },
    range: (c) => [-vmax(c), c.offset + c.amp / 2 - 1e-3],
  },
  { id: 'phase', name: 'Phase', short: 'Phase', kind: 'phase', get: (c) => c.phase, set: (c, v) => (c.phase = v), range: () => [0, 360], wrap: 360 },
  { id: 'duty', name: 'Duty Cycle', short: 'Duty', kind: 'pct', get: (c) => c.duty, set: (c, v) => (c.duty = v), range: () => [0.1, 99.9] },
  { id: 'symmetry', name: 'Symmetry', short: 'Symmetry', kind: 'pct', get: (c) => c.symmetry, set: (c, v) => (c.symmetry = v), range: () => [0, 100] },
  { id: 'width', name: 'Pulse Width', short: 'Width', kind: 'time', get: (c) => c.width, set: (c, v) => (c.width = v), range: (c) => [MIN_W, Math.max(MIN_W, 1 / c.freq - MIN_W)] },
  { id: 'delay', name: 'Pulse Delay', short: 'Delay', kind: 'time', get: (c) => c.delay, set: (c, v) => (c.delay = v), range: (c) => [0, 1 / c.freq] },
  { id: 'modFreq', name: 'Mod Frequency', short: 'Freq', kind: 'freq', get: (c) => c.mod.freq, set: (c, v) => (c.mod.freq = v), range: () => [2e-3, 50e3] },
  { id: 'depth', name: 'AM Depth', short: 'Depth', kind: 'pct', get: (c) => c.mod.depth, set: (c, v) => (c.mod.depth = v), range: () => [0, 100] },
  { id: 'devFreq', name: 'Freq Deviation', short: 'Dev', kind: 'freq', get: (c) => c.mod.devFreq, set: (c, v) => (c.mod.devFreq = v), range: (c) => [0, maxF(c)] },
  { id: 'devPhase', name: 'Phase Deviation', short: 'PhDev', kind: 'phase', get: (c) => c.mod.devPhase, set: (c, v) => (c.mod.devPhase = v), range: () => [0, 360] },
  { id: 'hopFreq', name: 'Hop Frequency', short: 'Hop', kind: 'freq', get: (c) => c.mod.hopFreq, set: (c, v) => (c.mod.hopFreq = v), range: (c) => [1e-6, maxF(c)] },
  { id: 'rate', name: 'FSK Rate', short: 'Rate', kind: 'freq', get: (c) => c.mod.rate, set: (c, v) => (c.mod.rate = v), range: () => [2e-3, 50e3] },
  { id: 'sweepStart', name: 'Start Frequency', short: 'Start', kind: 'freq', get: (c) => c.sweep.start, set: (c, v) => (c.sweep.start = v), range: (c) => [1e-3, maxF(c)] },
  { id: 'sweepStop', name: 'Stop Frequency', short: 'Stop', kind: 'freq', get: (c) => c.sweep.stop, set: (c, v) => (c.sweep.stop = v), range: (c) => [1e-3, maxF(c)] },
  { id: 'sweepTime', name: 'Sweep Time', short: 'Time', kind: 'time', get: (c) => c.sweep.time, set: (c, v) => (c.sweep.time = v), range: () => [1e-3, 500] },
  { id: 'burstCycles', name: 'Burst Cycles', short: 'Cycles', kind: 'count', get: (c) => c.burst.cycles, set: (c, v) => (c.burst.cycles = Math.round(v)), range: () => [1, 1e6] },
  { id: 'burstPeriod', name: 'Burst Period', short: 'Period', kind: 'time', get: (c) => c.burst.period, set: (c, v) => (c.burst.period = v), range: () => [1e-6, 500] },
];

export const FIELDS = Object.fromEntries(list.map((f) => [f.id, f])) as Record<FieldId, Field>;

/** Crest-Faktor: Vpp pro Vrms */
export function ppPerRms(c: Channel): number {
  switch (c.wave) {
    case 'sine': return 2 * Math.SQRT2;
    case 'ramp': return 2 * Math.sqrt(3);
    case 'noise': return 2 * Math.sqrt(3);
    default: return c.wave === 'square' || c.wave === 'pulse' ? 2 : 2 * Math.SQRT2;
  }
}

export interface EditUnit { label: string; mult: (c: Channel) => number }
export const EDIT_UNITS: Record<Kind, { units: EditUnit[]; def: number }> = {
  freq: { units: [{ label: 'MHz', mult: () => 1e6 }, { label: 'kHz', mult: () => 1e3 }, { label: 'Hz', mult: () => 1 }, { label: 'mHz', mult: () => 1e-3 }], def: 2 },
  time: { units: [{ label: 's', mult: () => 1 }, { label: 'ms', mult: () => 1e-3 }, { label: 'µs', mult: () => 1e-6 }, { label: 'ns', mult: () => 1e-9 }], def: 0 },
  vpp: {
    units: [
      { label: 'Vpp', mult: () => 1 }, { label: 'mVpp', mult: () => 1e-3 },
      { label: 'Vrms', mult: (c) => ppPerRms(c) }, { label: 'mVrms', mult: (c) => ppPerRms(c) * 1e-3 },
    ],
    def: 0,
  },
  volt: { units: [{ label: 'V', mult: () => 1 }, { label: 'mV', mult: () => 1e-3 }], def: 0 },
  phase: { units: [{ label: '°', mult: () => 1 }], def: 0 },
  pct: { units: [{ label: '%', mult: () => 1 }], def: 0 },
  count: { units: [{ label: 'Cyc', mult: () => 1 }], def: 0 },
};

/** Begrenzt Kanalwerte nach Änderung von Welle/Last/Frequenz */
export function sanitize(c: Channel): void {
  const mf = maxF(c);
  const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  c.freq = cl(c.freq, 1e-6, mf);
  c.sweep.start = cl(c.sweep.start, 1e-3, mf);
  c.sweep.stop = cl(c.sweep.stop, 1e-3, mf);
  c.mod.hopFreq = cl(c.mod.hopFreq, 1e-6, mf);
  c.mod.devFreq = cl(c.mod.devFreq, 0, mf);
  c.width = cl(c.width, MIN_W, Math.max(MIN_W, 1 / c.freq - MIN_W));
  c.delay = cl(c.delay, 0, 1 / c.freq);
  const vm = vmax(c);
  c.amp = cl(c.amp, 1e-3, 2 * vm);
  const lim = vm - c.amp / 2;
  c.offset = cl(c.offset, -lim, lim);
}

/** Setzt einen Parameter (mit Begrenzung, Kopplung und Meldung) */
export function setField(s: GenState, idx: 0 | 1, id: FieldId, v: number): void {
  if (!Number.isFinite(v)) return;
  const c = s.ch[idx];
  const f = FIELDS[id];
  let val = v;
  let clamped = false;
  if (f.wrap) {
    val = ((v % f.wrap) + f.wrap) % f.wrap;
  } else {
    const [lo, hi] = f.range(c);
    if (val < lo) { val = lo; clamped = true; }
    if (val > hi) { val = hi; clamped = true; }
  }
  val = tidy(val);
  f.set(c, val);
  sanitize(c);
  const o = s.ch[1 - idx];
  if (s.sys.coupleFreq && (id === 'freq' || id === 'period')) {
    o.freq = Math.min(c.freq, MAXF[o.wave]);
    sanitize(o);
  }
  if (s.sys.coupleAmp && (id === 'amp' || id === 'high' || id === 'low' || id === 'offset')) {
    o.amp = c.amp;
    o.offset = c.offset;
    sanitize(o);
  }
  if (clamped) {
    s.ui.msg = `${f.name} limited to ${formatString(f.get(c), f.kind)}`;
    s.ui.msgId++;
  }
}

/** Setzt den Cursor auf die höchstwertige Stelle des Feldes */
export function cursorToTop(s: GenState): void {
  const f = FIELDS[s.ui.focus];
  s.ui.cursorExp = formatValue(f.get(s.ch[s.active]), f.kind).topExp;
}

export function clampCursor(s: GenState): void {
  const f = FIELDS[s.ui.focus];
  const fm = formatValue(f.get(s.ch[s.active]), f.kind);
  s.ui.cursorExp = Math.min(fm.topExp, Math.max(fm.bottomExp, s.ui.cursorExp));
}
