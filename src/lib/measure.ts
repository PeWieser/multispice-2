/**
 * S5.7: Kennwerte pro Kurve (Mess-Panel) — rein (Tests in sprint5test).
 */

/** Leere Kurve → NaN (ehrlich „—", kein 0). */
export interface CurveStats {
  min: number;
  max: number;
  mean: number;
  rms: number;
}

export function curveStats(y: number[]): CurveStats {
  if (y.length === 0) return { min: NaN, max: NaN, mean: NaN, rms: NaN };
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, cnt = 0;
  for (const v of y) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
    cnt++;
  }
  if (cnt === 0) return { min: NaN, max: NaN, mean: NaN, rms: NaN };
  return { min, max, mean: sum / cnt, rms: Math.sqrt(sumSq / cnt) };
}

/**
 * f−3dB: erste fallende Kreuzung von (Maximum − 3 dB) nach dem Peak
 * (linear interpoliert). null = kein Abfall im Band (ehrlich „—").
 */
export function fMinus3dB(freq: number[], magDb: number[]): number | null {
  const n = Math.min(freq.length, magDb.length);
  if (n < 2) return null;
  let peak = 0;
  for (let i = 1; i < n; i++) if (magDb[i] > magDb[peak]) peak = i;
  const target = magDb[peak] - 3;
  for (let i = peak + 1; i < n; i++) {
    if (magDb[i] <= target && magDb[i - 1] > target) {
      const t = (target - magDb[i - 1]) / (magDb[i] - magDb[i - 1]);
      return freq[i - 1] + t * (freq[i] - freq[i - 1]);
    }
  }
  return null;
}
