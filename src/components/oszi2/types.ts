export type Coupling = 'DC' | 'AC' | 'GND';
export type Slope = 'rise' | 'fall' | 'both';
export type AcqMode = 'sample' | 'peak' | 'average' | 'hires';
export type MenuId =
  | 'ch0' | 'ch1' | 'ch2' | 'ch3'
  | 'trigger' | 'acquire' | 'measure' | 'cursor' | 'math' | 'fft' | 'ref'
  | 'save' | 'display' | 'utility' | 'zoom' | 'search';

export type MeasType =
  | 'freq' | 'period' | 'pkpk' | 'amp' | 'max' | 'min' | 'high' | 'low'
  | 'mean' | 'rms' | 'rise' | 'fall' | 'pwidth' | 'nwidth' | 'pduty' | 'nduty';

export const MEAS_TYPES: { id: MeasType; label: string; short: string }[] = [
  { id: 'freq', label: 'Frequenz', short: 'Freq' },
  { id: 'period', label: 'Periode', short: 'Periode' },
  { id: 'pkpk', label: 'Spitze-Spitze', short: 'Ss' },
  { id: 'amp', label: 'Amplitude', short: 'Ampl' },
  { id: 'max', label: 'Maximum', short: 'Max' },
  { id: 'min', label: 'Minimum', short: 'Min' },
  { id: 'high', label: 'High-Pegel', short: 'High' },
  { id: 'low', label: 'Low-Pegel', short: 'Low' },
  { id: 'mean', label: 'Mittelwert', short: 'Mittel' },
  { id: 'rms', label: 'Effektivwert', short: 'Eff' },
  { id: 'rise', label: 'Anstiegszeit', short: 'Anstieg' },
  { id: 'fall', label: 'Abfallzeit', short: 'Abfall' },
  { id: 'pwidth', label: 'Pos. Breite', short: '+Breite' },
  { id: 'nwidth', label: 'Neg. Breite', short: '-Breite' },
  { id: 'pduty', label: 'Pos. Tastgrad', short: '+Tastgr' },
  { id: 'nduty', label: 'Neg. Tastgrad', short: '-Tastgr' },
];

export interface ChannelSettings {
  on: boolean;
  vdiv: number;
  pos: number;
  coupling: Coupling;
  invert: boolean;
  bwLimit: boolean;
  probe: 1 | 10;
  fine: boolean;
}

export interface RefWave {
  divs: Float32Array; // stored in screen divisions
  label: string;
  vdiv: number;
  tdiv: number;
}

export type CursorSel = 'a' | 'b' | 'ab' | 'ta' | 'tb' | 'va' | 'vb';

export interface Settings {
  ch: ChannelSettings[];
  tdiv: number;
  hDelay: number;
  hFine: boolean;
  trig: { source: number; slope: Slope; mode: 'auto' | 'normal'; level: number; holdoff: number };
  acq: { mode: AcqMode; avgCount: number; xy: boolean; roll: boolean };
  math: { on: boolean; op: '+' | '-' | '*'; a: number; b: number; vdiv: number; pos: number };
  fft: { on: boolean; source: number; window: 'hann' | 'rect' | 'hamming' | 'blackman'; dbdiv: number; level: number; zoom: number; showSource: boolean };
  refSource: number;
  refShow: boolean[];
  meas: { list: { type: MeasType; src: number }[]; selType: number; selSrc: number; stats: boolean };
  cursor: { mode: 'off' | 'time' | 'amp' | 'both'; src: number; ta: number; tb: number; va: number; vb: number; sel: CursorSel };
  zoom: { on: boolean; factor: number; pos: number };
  search: { on: boolean; src: number; slope: 'rise' | 'fall'; level: number; marks: number[] };
  display: { persistence: number; intensity: number; graticule: 'full' | 'grid' | 'cross' | 'frame'; dots: boolean; backlight: number; showClock: boolean };
  saveAssign: 'png' | 'csv' | 'setup';
  menu: MenuId | null;
  lastMenu: MenuId | null;
  knobTarget: string | null;
  fineMode: boolean;
  run: 'run' | 'stop' | 'single';
}

export const CH_COLORS = ['#f4e53c', '#3fd4f4', '#ef4f9a', '#5fe36a'];
export const MATH_COLOR = '#ff7a3a';
export const REF_COLORS = ['#f2f2f2', '#b9a4ff'];
export const TRIG_COLOR = '#ff9a2e';

export const defaultChannel = (on: boolean): ChannelSettings => ({
  on, vdiv: 1, pos: 0, coupling: 'DC', invert: false, bwLimit: false, probe: 10, fine: false,
});

export function defaultSettings(): Settings {
  return {
    ch: [defaultChannel(true), defaultChannel(false), defaultChannel(false), defaultChannel(false)],
    tdiv: 500e-6,
    hDelay: 0,
    hFine: false,
    trig: { source: 0, slope: 'rise', mode: 'auto', level: 0, holdoff: 20e-9 },
    acq: { mode: 'sample', avgCount: 16, xy: false, roll: true },
    math: { on: false, op: '+', a: 0, b: 1, vdiv: 2, pos: 0 },
    fft: { on: false, source: 0, window: 'hann', dbdiv: 20, level: 20, zoom: 1, showSource: true },
    refSource: 0,
    refShow: [false, false],
    meas: { list: [], selType: 0, selSrc: 0, stats: false },
    cursor: { mode: 'off', src: 0, ta: -3, tb: 3, va: 2, vb: -2, sel: 'a' },
    zoom: { on: false, factor: 5, pos: 0 },
    search: { on: false, src: 0, slope: 'rise', level: 0, marks: [] },
    display: { persistence: 0, intensity: 75, graticule: 'full', dots: false, backlight: 1, showClock: true },
    saveAssign: 'png',
    menu: null,
    lastMenu: null,
    knobTarget: null,
    fineMode: false,
    run: 'run',
  };
}



// ---------- probes & environment ----------
export interface ProbeState {
  target: string | null; // Multispice: Netzname aus der Verdrahtung, 'comp'/'gnd' (Front-Klemmen) oder null (offen/in der Hand)
  atten: 1 | 10;
  comp: number; // compensation error (-0.5..0.5), 0 = perfect
}

/** Multispice-Umgebung: statt Demo-Kippstufe/Funktionsgenerator liefert der
 *  Sampler die Netzspannungen der laufenden Simulation. gndRef = Netz am
 *  GND-Pin (≠ 0) → alle Kanäle messen differenziell dagegen. */
export interface Env {
  probes: ProbeState[];
  gndRef: string;
  sampler: (net: string, t: number) => number;
}

// ---------- number helpers ----------
export const SEQ125: number[] = (() => {
  const a: number[] = [];
  for (let e = -10; e <= 3; e++) for (const m of [1, 2, 5]) a.push(+(m * Math.pow(10, e)).toPrecision(3));
  return a;
})();

export function step125(v: number, dir: number, min: number, max: number): number {
  if (dir === 0) return v;
  const exactIdx = SEQ125.findIndex((x) => Math.abs(x - v) / v < 0.001);
  let n: number;
  if (exactIdx >= 0) n = exactIdx + dir;
  else {
    let up = SEQ125.findIndex((x) => x > v);
    if (up < 0) up = SEQ125.length;
    n = dir > 0 ? up + dir - 1 : up + dir;
  }
  n = Math.min(SEQ125.length - 1, Math.max(0, n));
  return clamp(SEQ125[n], min, max);
}

export function ceil125(v: number): number {
  for (const x of SEQ125) if (x >= v * 0.999) return x;
  return SEQ125[SEQ125.length - 1];
}

const PREFIX: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

export function fmt(v: number, unit: string, digits = 3): string {
  if (!isFinite(v)) return '?';
  if (v === 0) return '0.00' + unit;
  const a = Math.abs(v);
  for (const [f, p] of PREFIX) {
    if (a >= f * 0.9995) {
      const x = v / f;
      const ax = Math.abs(x);
      const dec = Math.max(0, digits - (ax >= 100 ? 3 : ax >= 10 ? 2 : 1));
      return x.toFixed(dec) + p + unit;
    }
  }
  return (v / 1e-12).toFixed(1) + 'p' + unit;
}

export function fmtShort(v: number, unit: string): string {
  // compact for scale readouts, e.g. 2.00V, 500mV, 10.0ms
  return fmt(v, unit, 3);
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Wall-Time Helper for Single-Trigger Timeout */
let _wallNow = () => performance.now() / 1000;
export const setWallNow = (fn: () => number) => { _wallNow = fn; };
export const wallNow = () => _wallNow();
