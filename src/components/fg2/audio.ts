/**
 * Prozedurale Frontpanel-Geräusche (WebAudio, keine Assets).
 * Die Klänge sind reine Oberflächen-Effekte und gehören nicht zum Simulator-Kern.
 */

export type KeyKind = 'num' | 'soft' | 'wave' | 'power' | 'toggle' | 'arrow' | 'default';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(at: number, f: number, q: number, dur: number, g: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const n = Math.max(1, Math.ceil(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, at);
  flt.Q.value = q;
  if (sweepTo) flt.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), at + dur);
  const gn = c.createGain();
  gn.gain.setValueAtTime(0.0001, at);
  gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), at + Math.min(0.0015, dur * 0.18));
  gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(flt).connect(gn).connect(master);
  src.start(at);
  src.stop(at + dur + 0.02);
}

function tone(at: number, f: number, dur: number, g: number, sweepTo?: number, type: OscillatorType = 'sine') {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + dur);
  const gn = c.createGain();
  gn.gain.setValueAtTime(0.0001, at);
  gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), at + 0.004);
  gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(gn).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Kabelschutter (niedrig gefiltertes Rauschen) */
function rustle(at: number, dur: number, g: number) {
  noiseBurst(at, 700, 0.6, dur, g, 'lowpass', 260);
}

interface KeyDef { f: number; q: number; d: number; g: number; th: number; rel: number }
const KEY_DEFS: Record<KeyKind, KeyDef> = {
  num: { f: 2600, q: 1.3, d: 0.016, g: 0.24, th: 195, rel: 1900 },
  soft: { f: 1500, q: 1.0, d: 0.024, g: 0.18, th: 150, rel: 1150 },
  wave: { f: 2100, q: 1.2, d: 0.018, g: 0.24, th: 170, rel: 1600 },
  power: { f: 1000, q: 0.9, d: 0.05, g: 0.4, th: 88, rel: 780 },
  toggle: { f: 3200, q: 1.6, d: 0.013, g: 0.28, th: 235, rel: 2400 },
  arrow: { f: 3000, q: 1.8, d: 0.01, g: 0.18, th: 250, rel: 2300 },
  default: { f: 2300, q: 1.2, d: 0.016, g: 0.22, th: 180, rel: 1800 },
};

/** Tastenklick: Anschlag + Körperton + leichtes Loslassen ~45 ms später, je Taste leicht verstimmt */
export function uiClick(kind: KeyKind = 'default', seed = 0) {
  try {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + 0.001;
    const v = 0.86 + ((seed * 53) % 9) / 20;
    const p = KEY_DEFS[kind];
    noiseBurst(t, p.f * v, p.q, p.d, p.g);
    tone(t, p.th * v, 0.055, p.g * 0.75, p.th * 0.62);
    noiseBurst(t + 0.045, p.rel * v, 1.4, 0.013, p.g * 0.42);
    if (kind === 'power') noiseBurst(t + 0.02, 620, 3, 0.07, 0.16);
  } catch { /* Audio nicht verfügbar */ }
}

/** Rastung des Drehknopfs */
export function uiTick() {
  try {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + 0.001;
    noiseBurst(t, 4200 * (0.95 + Math.random() * 0.1), 2.2, 0.006, 0.12);
    tone(t, 1700, 0.011, 0.05, 1250);
  } catch { /* Audio nicht verfügbar */ }
}

/** BNC einstecken: zwei mechanische Schläge, Metallring, Kabelschutter */
export function uiPlug() {
  try {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + 0.001;
    noiseBurst(t, 2800, 1.6, 0.012, 0.3);
    noiseBurst(t + 0.016, 700, 0.8, 0.035, 0.3);
    tone(t + 0.004, 132, 0.05, 0.28, 92);
    noiseBurst(t + 0.012, 3400, 16, 0.11, 0.11);
    rustle(t + 0.006, 0.22, 0.05);
  } catch { /* Audio nicht verfügbar */ }
}

/** BNC abziehen: steiler Schlag mit Absenkfahrt, Pop, Kabelschutter */
export function uiUnplug() {
  try {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + 0.001;
    noiseBurst(t, 3400, 1.4, 0.009, 0.3);
    noiseBurst(t + 0.004, 3000, 1.1, 0.09, 0.26, 'bandpass', 620);
    tone(t, 150, 0.07, 0.24, 72);
    rustle(t + 0.01, 0.18, 0.05);
  } catch { /* Audio nicht verfügbar */ }
}
