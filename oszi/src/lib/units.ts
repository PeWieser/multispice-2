// Engineering unit helpers for the oscilloscope

// Build a 1-2-5 sequence of values between min and max (inclusive-ish)
export function build125(min: number, max: number): number[] {
  const out: number[] = [];
  let exp = Math.floor(Math.log10(min));
  const mant = [1, 2, 5];
  while (true) {
    for (const m of mant) {
      const v = m * Math.pow(10, exp);
      if (v >= min * 0.999 && v <= max * 1.001) out.push(round(v));
      if (v > max * 1.001) return out;
    }
    exp++;
    if (exp > 12) return out;
  }
}

function round(v: number): number {
  return parseFloat(v.toPrecision(6));
}

// Volts/div choices from 1 mV to 10 V
export const VOLT_DIV = build125(0.001, 10);

// Seconds/div choices from 5 ns to 5 s
export const TIME_DIV = build125(5e-9, 5);

export function formatVolt(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0 V";
  if (a < 1e-3) return `${sig(v * 1e6)} µV`;
  if (a < 1) return `${sig(v * 1e3)} mV`;
  return `${sig(v)} V`;
}

export function formatTime(t: number): string {
  const a = Math.abs(t);
  if (a === 0) return "0 s";
  if (a < 1e-6) return `${sig(t * 1e9)} ns`;
  if (a < 1e-3) return `${sig(t * 1e6)} µs`;
  if (a < 1) return `${sig(t * 1e3)} ms`;
  return `${sig(t)} s`;
}

export function formatFreq(f: number): string {
  const a = Math.abs(f);
  if (!isFinite(f) || f === 0) return "-- Hz";
  if (a >= 1e6) return `${sig(f / 1e6)} MHz`;
  if (a >= 1e3) return `${sig(f / 1e3)} kHz`;
  return `${sig(f)} Hz`;
}

function sig(v: number): string {
  const a = Math.abs(v);
  let s: string;
  if (a >= 100) s = v.toFixed(0);
  else if (a >= 10) s = v.toFixed(1);
  else s = v.toFixed(2);
  // trim trailing zeros
  return s.replace(/\.?0+$/, "");
}
