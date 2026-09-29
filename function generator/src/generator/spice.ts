import type { GenState } from './types';
import { rawVoltage } from './waveforms';

export interface SpiceOptions {
  /** Name des Ausgangsknotens (Standard OUT1 / OUT2) */
  node?: string;
  /** Simulationsdauer für PWL-Tabellen (Standard: 10 Perioden bzw. Sweep-/Burst-/Modulationsdauer) */
  tStop?: number;
  /** Zeitschritt der PWL-Tabelle (Standard: Periode/40, max. 200 000 Punkte) */
  dt?: number;
  forcePwl?: boolean;
}

const n = (x: number) => Number(x.toPrecision(9)).toString();

/**
 * Erzeugt eine SPICE-Quelle (Thévenin: ideale Quelle + 50 Ω in Reihe) für einen Kanal.
 * Sinus und Rechteck/Puls ohne Modulation werden als SIN/PULSE exportiert,
 * alles andere (Rampe, Arb, Rauschen, AM/FM/PM/FSK/Sweep/Burst, Phase bei Rechteck …) als PWL-Tabelle.
 * Die Spannung entspricht der Leerlaufspannung (Load-Einstellung "50 Ω" → 2 × Anzeige).
 */
export function spiceSource(s: GenState, idx: 0 | 1, o: SpiceOptions = {}): string {
  const c = s.ch[idx];
  const k = c.load === '50' ? 2 : 1;
  const id = idx + 1;
  const out = o.node ?? `OUT${id}`;
  const int = `FG${id}_INT`;
  const T = 1 / c.freq;
  const off = c.offset * k;
  const va = (c.amp / 2) * k;
  let src: string;

  if (!c.output || !s.sys.power) {
    src = `V_FG${id} ${int} 0 DC 0`;
  } else if (!o.forcePwl && c.mode === 'off' && c.wave === 'sine') {
    src = `V_FG${id} ${int} 0 SIN(${n(off)} ${n(va)} ${n(c.freq)} 0 0 ${n(c.phase)})`;
  } else if (!o.forcePwl && c.mode === 'off' && c.phase === 0 && (c.wave === 'square' || (c.wave === 'pulse' && c.delay === 0))) {
    const high = c.wave === 'square' ? (T * c.duty) / 100 : Math.min(c.width, T);
    const tr = Math.min(1e-9, high / 10, (T - high) / 10 || 1e-9);
    src = `V_FG${id} ${int} 0 PULSE(${n(off - va)} ${n(off + va)} 0 ${n(tr)} ${n(tr)} ${n(Math.max(high - tr, tr))} ${n(T)})`;
  } else {
    let span = 10 * T;
    if (c.mode === 'sweep') span = c.sweep.time;
    else if (c.mode === 'burst') span = c.burst.period * 2;
    else if (c.mode === 'AM' || c.mode === 'FM' || c.mode === 'PM') span = 2 / c.mod.freq;
    else if (c.mode === 'FSK') span = 2 / c.mod.rate;
    const tStop = o.tStop ?? span;
    let dt = o.dt ?? T / 40;
    if (c.mode === 'sweep') dt = o.dt ?? 1 / (40 * Math.max(c.sweep.start, c.sweep.stop));
    if (c.mode === 'FSK') dt = o.dt ?? 1 / (40 * Math.max(c.freq, c.mod.hopFreq));
    if (c.wave === 'noise') dt = o.dt ?? 1 / 120e6;
    dt = Math.max(dt, tStop / 200000);
    const pts: string[] = [];
    for (let t = 0; t <= tStop + dt / 2; t += dt) pts.push(`${n(t)} ${n(rawVoltage(c, t) * k)}`);
    src = `V_FG${id} ${int} 0 PWL(${pts.join(' ')})`;
  }
  return `${src}\nR_FG${id}_OUT ${int} ${out} 50`;
}
