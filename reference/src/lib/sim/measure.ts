/** Measurement helpers used by the Grapher and by the bench instruments. */

export interface Measurement {
  key: string;
  label: string;
  value: number;
  unit: string;
  text: string;
}

export function fmt(v: number, unit = "", digits = 4): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const table: [number, string][] = [
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "Meg"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  for (const [s, suffix] of table) {
    if (a >= s) {
      const t = a / s;
      return `${(v / s).toFixed(t >= 100 ? 1 : t >= 10 ? 2 : digits - 2)}${suffix}${unit}`;
    }
  }
  return `${v.toExponential(2)}${unit}`;
}

export function measure(x: number[], y: number[]): Measurement[] {
  const n = y.length;
  if (!n) return [];
  const finite = y.filter((v) => Number.isFinite(v));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const avg = finite.reduce((a, b) => a + b, 0) / finite.length;
  const rms = Math.sqrt(finite.reduce((a, b) => a + b * b, 0) / finite.length);
  const pp = max - min;

  // frequency from rising zero crossings around the mean
  let crossings = 0;
  const mid = avg;
  for (let i = 1; i < n; i++) {
    if (y[i - 1] < mid && y[i] >= mid) crossings++;
  }
  const span = x[n - 1] - x[0] || 1;
  const freq = crossings > 1 ? (crossings - 1) / span : 0;
  const period = freq > 0 ? 1 / freq : NaN;

  // duty cycle: fraction above the mean
  let above = 0;
  for (const v of y) if (v >= mid) above++;
  const duty = (above / n) * 100;

  // rise / fall time (10% -> 90% of the first full swing)
  const lo = min + 0.1 * pp;
  const hi = min + 0.9 * pp;
  let rise = NaN;
  let fall = NaN;
  for (let i = 1; i < n; i++) {
    if (Number.isNaN(rise) && y[i - 1] < lo && y[i] >= hi) rise = x[i] - x[i - 1];
    if (Number.isNaN(fall) && y[i - 1] > hi && y[i] <= lo) fall = x[i] - x[i - 1];
  }

  return [
    { key: "min", label: "Minimum", value: min, unit: "", text: fmt(min) },
    { key: "max", label: "Maximum", value: max, unit: "", text: fmt(max) },
    { key: "pp", label: "Peak to Peak", value: pp, unit: "", text: fmt(pp) },
    { key: "avg", label: "Average", value: avg, unit: "", text: fmt(avg) },
    { key: "rms", label: "RMS", value: rms, unit: "", text: fmt(rms) },
    { key: "freq", label: "Frequency", value: freq, unit: "Hz", text: fmt(freq, "Hz") },
    { key: "period", label: "Period", value: period, unit: "s", text: fmt(period, "s") },
    { key: "duty", label: "Duty Cycle", value: duty, unit: "%", text: `${duty.toFixed(1)}%` },
    { key: "rise", label: "Rise Time", value: rise, unit: "s", text: fmt(rise, "s") },
    { key: "fall", label: "Fall Time", value: fall, unit: "s", text: fmt(fall, "s") },
  ];
}

export function measureAt(x: number[], y: number[], index: number): { x: number; y: number } {
  return { x: x[index] ?? NaN, y: y[index] ?? NaN };
}

/** Phase difference in degrees between two sampled signals. */
export function phaseBetween(x: number[], a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length, x.length);
  if (n < 8) return NaN;
  const dt = x[1] - x[0];
  const span = dt * n;
  let best = 0;
  let bestScore = -Infinity;
  for (let shift = -Math.floor(n / 4); shift <= Math.floor(n / 4); shift++) {
    let score = 0;
    for (let i = 0; i < n - Math.abs(shift); i += 2) {
      const j = i + shift;
      score += a[i] * (b[j] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = shift;
    }
  }
  return ((best * dt) / span) * 360;
}

export function derivative(x: number[], y: number[]): number[] {
  return y.map((v, i) => {
    if (i === 0) return (y[1] - y[0]) / ((x[1] ?? 1) - x[0]);
    if (i === y.length - 1) return (y[i] - y[i - 1]) / (x[i] - x[i - 1]);
    return (y[i + 1] - y[i - 1]) / (x[i + 1] - x[i - 1]);
  });
}

export function integral(x: number[], y: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < y.length; i++) {
    if (i > 0) acc += ((y[i] + y[i - 1]) / 2) * (x[i] - x[i - 1]);
    out.push(acc);
  }
  return out;
}

/** In-place radix-2 FFT; length must be a power of two. */
export function fft(re: number[], im: number[]): { re: number[]; im: number[] } {
  const n = re.length;
  if (n <= 1) return { re: [...re], im: [...im] };
  const R = [...re];
  const I = [...im];
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [R[i], R[j]] = [R[j], R[i]];
      [I[i], I[j]] = [I[j], I[i]];
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
        const ur = R[i + k];
        const ui = I[i + k];
        const vr = R[i + k + len / 2] * cr - I[i + k + len / 2] * ci;
        const vi = R[i + k + len / 2] * ci + I[i + k + len / 2] * cr;
        R[i + k] = ur + vr;
        I[i + k] = ui + vi;
        R[i + k + len / 2] = ur - vr;
        I[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  return { re: R, im: I };
}

export function fftSpectrum(x: number[], y: number[]): { x: number[]; y: number[] } {
  const n0 = y.length;
  if (n0 < 2) return { x: [], y: [] };
  let n = 2;
  while (n * 2 <= n0) n *= 2;
  const slice = y.slice(0, n);
  // Hann window to suppress leakage
  const win = slice.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const { re, im } = fft(win, new Array(n).fill(0));
  const dt = x[1] - x[0] || 1;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < n / 2; k++) {
    xs.push(k / (n * dt));
    ys.push((2 * Math.hypot(re[k], im[k])) / n);
  }
  return { x: xs, y: ys };
}

/** Simple expression evaluator for the math trace dialog. */
export function evalExpression(expr: string, traces: Record<string, number[]>): number[] | null {
  const keys = Object.keys(traces).sort((a, b) => b.length - a.length);
  let body = expr;
  const names: string[] = [];
  for (const k of keys) {
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(safe, "g");
    if (re.test(body)) {
      const alias = `t${names.length}`;
      names.push(alias);
      body = body.replace(re, alias);
    }
  }
  if (!/^[\w\s+\-*/().,]+$/.test(body)) return null;
  const len = Math.max(...Object.values(traces).map((v) => v.length), 0);
  if (!len) return null;
  const aliasMap = new Map<string, number[]>();
  let idx = 0;
  for (const k of keys) {
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(safe, "g").test(expr)) {
      aliasMap.set(`t${idx}`, traces[k]);
      idx++;
    }
  }
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const scope = new Map<string, number>();
    for (const [a, arr] of aliasMap) scope.set(a, arr[i] ?? 0);
    scope.set("pi", Math.PI);
    scope.set("e", Math.E);
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function(...scope.keys(), `return (${body});`);
      out.push(Number(fn(...scope.values())));
    } catch {
      return null;
    }
  }
  return out;
}
