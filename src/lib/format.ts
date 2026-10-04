/**
 * S5.2: Zentrale Zahlenformate (Eingabe + Anzeige).
 * Umzug aus `lib/library/catalog.ts` (dort Re-Export) + ein Bugfix:
 * großes „M" heißt Mega (vorher: Milli — „1M" ergab 0.001 statt 1e6).
 */

/** Parst „4k7", „2µ2", „10n", „1M5", „0.1", „-5m" … (Einheiten-Suffixe ok). */
export function parseValue(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().replace(/[Ω]/g, "").replace(/(F|H|V|A|Hz|ohm)$/i, "");
  const m = /^(-?\d*\.?\d*)\s*(meg|k|m|u|µ|n|p|f|t|g|r)?(\d*)$/i.exec(s);
  if (!m) return Number(s);
  const suf = m[2] ?? "";
  const low = suf.toLowerCase();
  // S5.2: M ≠ m — Mega bei großem M (oder MEG); sonst alte Tabelle.
  const mult =
    low === "meg" || suf === "M"
      ? 1e6
      : ((
        {
          t: 1e12,
          g: 1e9,
          k: 1e3,
          "": 1,
          r: 1,
          m: 1e-3,
          u: 1e-6,
          "µ": 1e-6,
          n: 1e-9,
          p: 1e-12,
          f: 1e-15,
        } as Record<string, number>
      )[low] ?? 1);
  let base = parseFloat(m[1] || "0");
  if (m[3]) base = parseFloat(`${m[1]}.${m[3]}`);
  return base * mult;
}

/** Formats a value with SI prefix. */
export function formatValue(v: number, unit = "", digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return `0 ${unit}`.trim();
  const prefixes: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
    [1e-15, "f"],
  ];
  for (const [f, p] of prefixes) {
    if (a >= f) return `${(v / f).toPrecision(digits).replace(/\.?0+$/, "")} ${p}${unit}`.trim();
  }
  return `${v.toExponential(2)} ${unit}`.trim();
}
