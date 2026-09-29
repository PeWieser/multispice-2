import type { Kind } from './types';

interface UnitDef { s: string; e: number }
interface KindDef {
  units: UnitDef[];
  sig?: number;
  dec?: Record<number, number>;
  fixed?: number;
  zeroExp: number;
}

export const KINDS: Record<Kind, KindDef> = {
  freq: { units: [{ s: 'MHz', e: 6 }, { s: 'kHz', e: 3 }, { s: 'Hz', e: 0 }, { s: 'mHz', e: -3 }, { s: 'µHz', e: -6 }], sig: 7, zeroExp: 0 },
  time: { units: [{ s: 's', e: 0 }, { s: 'ms', e: -3 }, { s: 'µs', e: -6 }, { s: 'ns', e: -9 }], sig: 7, zeroExp: 0 },
  vpp: { units: [{ s: 'Vpp', e: 0 }, { s: 'mVpp', e: -3 }], dec: { 0: 3, [-3]: 0 }, zeroExp: -3 },
  volt: { units: [{ s: 'V', e: 0 }, { s: 'mV', e: -3 }], dec: { 0: 3, [-3]: 0 }, zeroExp: -3 },
  phase: { units: [{ s: '°', e: 0 }], fixed: 1, zeroExp: 0 },
  pct: { units: [{ s: '%', e: 0 }], fixed: 1, zeroExp: 0 },
  count: { units: [{ s: 'Cyc', e: 0 }], fixed: 0, zeroExp: 0 },
};

export interface Part { c: string; exp?: number }
export interface Formatted {
  parts: Part[];
  unit: string;
  topExp: number;
  bottomExp: number;
}

export function formatValue(v: number, kind: Kind, group = true): Formatted {
  const def = KINDS[kind];
  const a = Math.abs(v);
  let u: UnitDef;
  if (a === 0) {
    u = def.units.find((x) => x.e === def.zeroExp) ?? def.units[0];
  } else {
    u = def.units.find((x) => a >= Math.pow(10, x.e) * (1 - 1e-9)) ?? def.units[def.units.length - 1];
  }
  const scaled = a / Math.pow(10, u.e);
  const intDigits0 = scaled < 1 ? 1 : Math.floor(Math.log10(scaled)) + 1;
  const dec = def.fixed ?? def.dec?.[u.e] ?? Math.max(0, (def.sig ?? 7) - intDigits0);
  const s = scaled.toFixed(dec);
  const [ip, fp = ''] = s.split('.');
  const parts: Part[] = [];
  if (v < 0 && parseFloat(s) !== 0) parts.push({ c: '-' });
  for (let i = 0; i < ip.length; i++) parts.push({ c: ip[i], exp: u.e + (ip.length - 1 - i) });
  if (fp.length) {
    parts.push({ c: '.' });
    for (let k = 0; k < fp.length; k++) {
      parts.push({ c: fp[k], exp: u.e - (k + 1) });
      if (group && (k + 1) % 3 === 0 && k + 1 < fp.length) parts.push({ c: ',' });
    }
  }
  return { parts, unit: u.s, topExp: u.e + ip.length - 1, bottomExp: u.e - fp.length };
}

export function formatString(v: number, kind: Kind, group = false): string {
  const f = formatValue(v, kind, group);
  return f.parts.map((p) => p.c).join('') + f.unit;
}

/** Rundet Rechenfehler weg */
export function tidy(v: number): number {
  return Number(v.toPrecision(12));
}

/** Kompakte Darstellung ohne überflüssige Nullen (z.B. "2.5kHz") */
export function formatCompact(v: number, kind: Kind): string {
  const f = formatValue(v, kind, false);
  let txt = f.parts.map((p) => p.c).join('');
  if (txt.includes('.')) txt = txt.replace(/0+$/, '').replace(/\.$/, '');
  return txt + f.unit;
}
