/** Radix-2 FFT plus windowing and spectral helpers used by scope FFT, THD and Fourier analysis. */

export type WindowKind = "rect" | "hann" | "hamming" | "blackman" | "flattop";

export function windowFn(kind: WindowKind, i: number, n: number): number {
  const x = (2 * Math.PI * i) / (n - 1);
  switch (kind) {
    case "hann":
      return 0.5 * (1 - Math.cos(x));
    case "hamming":
      return 0.54 - 0.46 * Math.cos(x);
    case "blackman":
      return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
    case "flattop":
      return (
        0.21557895 -
        0.41663158 * Math.cos(x) +
        0.277263158 * Math.cos(2 * x) -
        0.083578947 * Math.cos(3 * x) +
        0.006947368 * Math.cos(4 * x)
      );
    default:
      return 1;
  }
}

/** In-place iterative radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export interface Spectrum {
  freq: number[];
  mag: number[];
  magDb: number[];
  phase: number[];
}

/** Single-sided amplitude spectrum of a uniformly sampled signal. */
export function spectrum(samples: number[], sampleRate: number, win: WindowKind = "hann"): Spectrum {
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;
  if (n < 8) return { freq: [], mag: [], magDb: [], phase: [] };
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let coherentGain = 0;
  const start = samples.length - n;
  for (let i = 0; i < n; i++) {
    const w = windowFn(win, i, n);
    coherentGain += w;
    re[i] = samples[start + i] * w;
  }
  coherentGain /= n;
  fft(re, im);
  const half = n / 2;
  const freq: number[] = [];
  const mag: number[] = [];
  const magDb: number[] = [];
  const phase: number[] = [];
  for (let k = 0; k < half; k++) {
    const m = (2 * Math.hypot(re[k], im[k])) / (n * Math.max(coherentGain, 1e-12));
    freq.push((k * sampleRate) / n);
    mag.push(m);
    magDb.push(20 * Math.log10(Math.max(m, 1e-15)));
    phase.push((Math.atan2(im[k], re[k]) * 180) / Math.PI);
  }
  return { freq, mag, magDb, phase };
}

export interface FourierResult {
  fundamental: number;
  harmonics: Array<{ n: number; freq: number; mag: number; phase: number; relative: number }>;
  thd: number;
  thdDb: number;
}

/** Discrete Fourier series around a known fundamental — the classic .FOUR command. */
export function fourier(
  time: number[],
  values: number[],
  fundamental: number,
  nHarmonics = 9,
): FourierResult {
  const period = 1 / fundamental;
  const tEnd = time[time.length - 1] ?? 0;
  const tStart = Math.max(0, tEnd - period);
  const samples = 1024;
  const resampled: number[] = [];
  let idx = 0;
  for (let i = 0; i < samples; i++) {
    const t = tStart + (period * i) / samples;
    while (idx < time.length - 2 && time[idx + 1] < t) idx++;
    const t0 = time[idx];
    const t1 = time[idx + 1] ?? t0 + 1e-12;
    const f = (t - t0) / Math.max(t1 - t0, 1e-18);
    resampled.push(values[idx] + f * ((values[idx + 1] ?? values[idx]) - values[idx]));
  }
  const harmonics: FourierResult["harmonics"] = [];
  let fundMag = 0;
  let sumSq = 0;
  for (let h = 1; h <= nHarmonics; h++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < samples; i++) {
      const ang = (2 * Math.PI * h * i) / samples;
      re += resampled[i] * Math.cos(ang);
      im -= resampled[i] * Math.sin(ang);
    }
    re = (2 * re) / samples;
    im = (2 * im) / samples;
    const mag = Math.hypot(re, im);
    const phase = (Math.atan2(im, re) * 180) / Math.PI;
    if (h === 1) fundMag = mag;
    else sumSq += mag * mag;
    harmonics.push({ n: h, freq: h * fundamental, mag, phase, relative: 0 });
  }
  for (const h of harmonics) h.relative = fundMag > 0 ? h.mag / fundMag : 0;
  const thd = fundMag > 0 ? Math.sqrt(sumSq) / fundMag : 0;
  return { fundamental, harmonics, thd, thdDb: 20 * Math.log10(Math.max(thd, 1e-15)) };
}
