/**
 * S5.7: Postprozessor (A+B/A−B/A·B/A/B-dB, Hüllkurven, FFT) — rein.
 */
import { spectrum } from "./sim/fft";

export type BinaryOp = "add" | "sub" | "mul" | "divDb";

/**
 * Punktweise Verknüpfung (Länge = kürzeres Ende).
 * divDb = 20·log10(|a/b|); an Nullstellen von b ehrlich NaN (Plotter spart aus).
 */
export function combineSeries(a: number[], b: number[], op: BinaryOp): number[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    out[i] =
      op === "add" ? x + y
      : op === "sub" ? x - y
      : op === "mul" ? x * y
      : y === 0 ? NaN : 20 * Math.log10(Math.abs(x / y));
  }
  return out;
}

/** Gleitende Hüllkurve (rückblickendes Fenster, RMS oder Mittelwert). */
export function movingEnvelope(y: number[], window: number, mode: "rms" | "avg"): number[] {
  const n = y.length;
  const w = Math.max(1, Math.min(n, Math.round(window)));
  const out = new Array<number>(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const v = mode === "rms" ? y[i] * y[i] : y[i];
    acc += v;
    if (i >= w) acc -= mode === "rms" ? y[i - w] * y[i - w] : y[i - w];
    const m = acc / Math.min(i + 1, w);
    out[i] = mode === "rms" ? Math.sqrt(Math.max(m, 0)) : m;
  }
  return out;
}

/** Sinnvolle Fensterbreite: ~1 % der Punkte, 4 … 4096. */
export function envelopeWindow(n: number): number {
  return Math.max(4, Math.min(4096, Math.round(n / 100)));
}

/** Linear auf n äquidistante Stützstellen umtasten (für die FFT). */
export function resampleUniform(t: number[], y: number[], n: number): { t: number[]; y: number[] } {
  const m = Math.min(t.length, y.length);
  const count = Math.max(2, Math.min(Math.round(n), 65536));
  if (m < 2) return { t: [], y: [] };
  const t0 = t[0], t1 = t[m - 1];
  if (!(t1 > t0)) return { t: [], y: [] };
  const rt: number[] = new Array(count);
  const ry: number[] = new Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const tt = t0 + ((t1 - t0) * i) / (count - 1);
    while (j + 1 < m - 1 && t[j + 1] < tt) j++;
    const tA = t[j], tB = t[Math.min(j + 1, m - 1)];
    const frac = tB > tA ? (tt - tA) / (tB - tA) : 0;
    rt[i] = tt;
    ry[i] = y[j] + frac * (y[Math.min(j + 1, m - 1)] - y[j]);
  }
  return { t: rt, y: ry };
}

export interface PostFFT {
  freq: number[];
  magDb: number[];
  sampleRate: number;
}

/** FFT einer (ggf. ungleichmäßig abgetasteten) Transientenkurve. */
export function postFFT(t: number[], y: number[]): PostFFT {
  const n = Math.max(64, Math.min(8192, Math.min(t.length, y.length)));
  const u = resampleUniform(t, y, n);
  if (u.t.length < 8) return { freq: [], magDb: [], sampleRate: NaN };
  const sr = (u.t.length - 1) / (u.t[u.t.length - 1] - u.t[0]);
  const sp = spectrum(u.y, sr, "hann");
  return { freq: sp.freq, magDb: sp.magDb, sampleRate: sr };
}
