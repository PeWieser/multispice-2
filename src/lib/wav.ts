/**
 * S5.13: Tran-Kurve → WAV (16-bit PCM mono). Reine Funktionen (isomorph,
 * testbar) — der Grapher liefert Zeitachse + Kurve, wir liefern Bytes.
 *
 * Ehrlichkeit: Samplerate = native Sim-Auflösung (1/median-dt, begrenzt auf
 * 1 kHz … 192 kHz), kein Hochrechnen erfundener Auflösung. Spitzennormiert
 * auf −1 dBFS (Tooltip im Grapher sagt das); DC-Anteil bleibt erhalten.
 */

export const WAV_MIN_RATE = 1000;
export const WAV_MAX_RATE = 192000;
/** Harte Längenbremse (≈ 40 s bei 48 kHz) — kein versehentlicher Riesen-Download. */
export const WAV_MAX_SAMPLES = 2_000_000;
/** Spitzenpegel nach Normierung (−1 dBFS ≈ 0,891). */
export const WAV_PEAK = 0.891250938;

export function medianDt(t: number[]): number {
  if (t.length < 2) return 0;
  const dts: number[] = [];
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (dt > 0 && Number.isFinite(dt)) dts.push(dt);
  }
  if (!dts.length) return 0;
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)];
}

/** Native Rate aus der Zeitachse (begrenzt) — 0 bei unbrauchbarer Achse. */
export function nativeRate(t: number[]): number {
  const dt = medianDt(t);
  if (!(dt > 0)) return 0;
  return Math.min(WAV_MAX_RATE, Math.max(WAV_MIN_RATE, Math.round(1 / dt)));
}

/**
 * Resamplet (t, y) linear auf ein uniformes Gitter mit `rate` Hz.
 * Gibt null zurück, wenn Achse/Kurve unbrauchbar oder zu lang sind.
 */
export function toUniformGrid(t: number[], y: number[], rate: number): number[] | null {
  if (!(rate > 0) || t.length < 2 || y.length !== t.length) return null;
  const t0 = t[0];
  const t1 = t[t.length - 1];
  if (!(t1 > t0) || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  const n = Math.floor((t1 - t0) * rate) + 1;
  if (!(n >= 2) || n > WAV_MAX_SAMPLES) return null;
  const out = new Array<number>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const tt = t0 + (i / (n - 1)) * (t1 - t0);
    while (j + 1 < t.length - 1 && t[j + 1] < tt) j++;
    const tA = t[j];
    const tB = t[Math.min(j + 1, t.length - 1)];
    const span = tB - tA;
    const f = span > 0 ? (tt - tA) / span : 0;
    const v = y[j] + (y[Math.min(j + 1, y.length - 1)] - y[j]) * f;
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

/** Spitzennormierung auf WAV_PEAK (stille Kurve → Stille, kein NaN). */
export function normalizePeak(y: number[]): number[] {
  let peak = 0;
  for (const v of y) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  if (!(peak > 0)) return y.slice();
  const g = WAV_PEAK / peak;
  return y.map((v) => v * g);
}

/** 16-bit-PCM-mono-WAV als Bytes (44-Byte-Header + Daten). */
export function encodeWavMono(samples: number[], sampleRate: number): Uint8Array {
  const rate = Math.round(sampleRate);
  const n = samples.length;
  const dataBytes = n * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // ByteRate
  v.setUint16(32, 2, true); // BlockAlign
  v.setUint16(34, 16, true); // BitsPerSample
  ascii(36, "data");
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < n; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buf);
}

/** Komplett-Pipeline: Zeitachse + Kurve → WAV-Bytes (null = unbrauchbar/zu lang). */
export function curveToWav(t: number[], y: number[]): { bytes: Uint8Array; rate: number } | null {
  const rate = nativeRate(t);
  if (!rate) return null;
  const grid = toUniformGrid(t, y, rate);
  if (!grid) return null;
  return { bytes: encodeWavMono(normalizePeak(grid), rate), rate };
}
