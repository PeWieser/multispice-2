const SUFFIX: [string, number][] = [
  ["meg", 1e6], ["mil", 25.4e-6], ["t", 1e12], ["g", 1e9], ["k", 1e3], ["m", 1e-3],
  ["u", 1e-6], ["µ", 1e-6], ["n", 1e-9], ["p", 1e-12], ["f", 1e-15],
];

/** Parse SPICE-style numbers: 10k, 4.7u, 1meg, 2.2nF. Returns NaN if invalid. */
export function parseValue(s: string | number | undefined, vars?: Record<string, string>): number {
  if (typeof s === "number") return s;
  if (s == null) return NaN;
  let str = String(s).trim();
  if (!str) return NaN;
  if (vars && /^\{?[A-Za-z_]\w*\}?$/.test(str)) {
    const key = str.replace(/[{}]/g, "");
    if (key in vars) return parseValue(vars[key]);
  }
  str = str.toLowerCase();
  const m = str.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-zµ]*)/);
  if (!m) return NaN;
  const num = parseFloat(m[1]);
  const suf = m[2];
  if (!suf) return num;
  for (const [k, f] of SUFFIX) if (suf.startsWith(k)) return num * f;
  // unit letters only (V, A, F, H, Ohm, Hz, s)
  if (/^(v|a|f|h|ohm|hz|s|w|°)/.test(suf)) return num;
  return NaN;
}

const PREF: [number, string][] = [
  [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"],
];

export function fmt(v: number, unit = "", digits = 4): string {
  if (v == null || !isFinite(v)) return "—";
  if (v === 0) return "0 " + unit;
  const a = Math.abs(v);
  for (const [f, p] of PREF) {
    if (a >= f * 0.9999) return `${parseFloat((v / f).toPrecision(digits))} ${p}${unit}`.trim();
  }
  return `${v.toExponential(digits - 1)} ${unit}`;
}
