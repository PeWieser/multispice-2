/**
 * Dense linear algebra kernels for the MNA solver.
 * Real and complex LU decomposition with partial pivoting.
 * Matrices are stored row-major in flat Float64Arrays for cache friendliness.
 */

export class RealMatrix {
  readonly n: number;
  readonly a: Float64Array;
  readonly b: Float64Array;
  private readonly piv: Int32Array;

  constructor(n: number) {
    this.n = n;
    this.a = new Float64Array(n * n);
    this.b = new Float64Array(n);
    this.piv = new Int32Array(n);
  }

  clear(): void {
    this.a.fill(0);
    this.b.fill(0);
  }

  add(i: number, j: number, v: number): void {
    if (i < 0 || j < 0 || !Number.isFinite(v)) return;
    this.a[i * this.n + j] += v;
  }

  addRhs(i: number, v: number): void {
    if (i < 0 || !Number.isFinite(v)) return;
    this.b[i] += v;
  }

  /** Solves A x = b in place. Returns the solution vector or null when singular. */
  solve(): Float64Array | null {
    const { n, a, b, piv } = this;
    for (let i = 0; i < n; i++) piv[i] = i;

    for (let k = 0; k < n; k++) {
      // pivot search
      let max = 0;
      let row = -1;
      for (let i = k; i < n; i++) {
        const v = Math.abs(a[i * n + k]);
        if (v > max) {
          max = v;
          row = i;
        }
      }
      if (row < 0 || max < 1e-18) return null;
      if (row !== k) {
        for (let j = 0; j < n; j++) {
          const t = a[k * n + j];
          a[k * n + j] = a[row * n + j];
          a[row * n + j] = t;
        }
        const tb = b[k];
        b[k] = b[row];
        b[row] = tb;
      }
      const pivVal = a[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = a[i * n + k] / pivVal;
        if (f === 0) continue;
        a[i * n + k] = 0;
        for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
        b[i] -= f * b[k];
      }
    }

    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j];
      x[i] = s / a[i * n + i];
      if (!Number.isFinite(x[i])) return null;
    }
    return x;
  }
}

export class ComplexMatrix {
  readonly n: number;
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly bRe: Float64Array;
  readonly bIm: Float64Array;

  constructor(n: number) {
    this.n = n;
    this.re = new Float64Array(n * n);
    this.im = new Float64Array(n * n);
    this.bRe = new Float64Array(n);
    this.bIm = new Float64Array(n);
  }

  clear(): void {
    this.re.fill(0);
    this.im.fill(0);
    this.bRe.fill(0);
    this.bIm.fill(0);
  }

  add(i: number, j: number, vr: number, vi: number): void {
    if (i < 0 || j < 0) return;
    this.re[i * this.n + j] += vr;
    this.im[i * this.n + j] += vi;
  }

  addRhs(i: number, vr: number, vi: number): void {
    if (i < 0) return;
    this.bRe[i] += vr;
    this.bIm[i] += vi;
  }

  solve(): { re: Float64Array; im: Float64Array } | null {
    const { n, re, im, bRe, bIm } = this;
    for (let k = 0; k < n; k++) {
      let max = 0;
      let row = -1;
      for (let i = k; i < n; i++) {
        const m = Math.hypot(re[i * n + k], im[i * n + k]);
        if (m > max) {
          max = m;
          row = i;
        }
      }
      if (row < 0 || max < 1e-20) return null;
      if (row !== k) {
        for (let j = 0; j < n; j++) {
          let t = re[k * n + j];
          re[k * n + j] = re[row * n + j];
          re[row * n + j] = t;
          t = im[k * n + j];
          im[k * n + j] = im[row * n + j];
          im[row * n + j] = t;
        }
        let t = bRe[k];
        bRe[k] = bRe[row];
        bRe[row] = t;
        t = bIm[k];
        bIm[k] = bIm[row];
        bIm[row] = t;
      }
      const pr = re[k * n + k];
      const pi = im[k * n + k];
      const den = pr * pr + pi * pi;
      for (let i = k + 1; i < n; i++) {
        const ar = re[i * n + k];
        const ai = im[i * n + k];
        const fr = (ar * pr + ai * pi) / den;
        const fi = (ai * pr - ar * pi) / den;
        if (fr === 0 && fi === 0) continue;
        re[i * n + k] = 0;
        im[i * n + k] = 0;
        for (let j = k + 1; j < n; j++) {
          const xr = re[k * n + j];
          const xi = im[k * n + j];
          re[i * n + j] -= fr * xr - fi * xi;
          im[i * n + j] -= fr * xi + fi * xr;
        }
        bRe[i] -= fr * bRe[k] - fi * bIm[k];
        bIm[i] -= fr * bIm[k] + fi * bRe[k];
      }
    }

    const xr = new Float64Array(n);
    const xi = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sr = bRe[i];
      let si = bIm[i];
      for (let j = i + 1; j < n; j++) {
        sr -= re[i * n + j] * xr[j] - im[i * n + j] * xi[j];
        si -= re[i * n + j] * xi[j] + im[i * n + j] * xr[j];
      }
      const pr = re[i * n + i];
      const pi = im[i * n + i];
      const den = pr * pr + pi * pi;
      xr[i] = (sr * pr + si * pi) / den;
      xi[i] = (si * pr - sr * pi) / den;
      if (!Number.isFinite(xr[i]) || !Number.isFinite(xi[i])) return null;
    }
    return { re: xr, im: xi };
  }
}

/** Backward-differentiation (Gear) coefficients for fixed step size, orders 1..6. */
export const GEAR_COEFFS: number[][] = [
  [1, -1],
  [3 / 2, -2, 1 / 2],
  [11 / 6, -3, 3 / 2, -1 / 3],
  [25 / 12, -4, 3, -4 / 3, 1 / 4],
  [137 / 60, -5, 5, -10 / 3, 5 / 4, -1 / 5],
  [49 / 20, -6, 15 / 2, -20 / 3, 15 / 4, -6 / 5, 1 / 6],
];
