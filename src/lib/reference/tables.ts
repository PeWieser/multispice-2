/**
 * S5.24: Referenz-Tabellen (Farbcode, Bauteil-Codes, Eingabe-Suffixe).
 * Reine Daten + Decoder — das Referenz-Fenster und die Tests teilen sie sich.
 */

export interface ColorRow {
  name: string;
  hex: string;
  digit: number | null;
  mult: string;
  tol: string;
  tc: string;
}

/** IEC-60062-Farbcode (4-/5-Band: Ziffern/Multiplikator/Toleranz, 6-Band: +TK). */
export const RESISTOR_COLORS: ColorRow[] = [
  { name: "Schwarz", hex: "#232323", digit: 0, mult: "×1", tol: "—", tc: "—" },
  { name: "Braun", hex: "#6b3f1d", digit: 1, mult: "×10", tol: "±1 %", tc: "100" },
  { name: "Rot", hex: "#c62828", digit: 2, mult: "×100", tol: "±2 %", tc: "50" },
  { name: "Orange", hex: "#ef6c00", digit: 3, mult: "×1 k", tol: "—", tc: "15" },
  { name: "Gelb", hex: "#f9c513", digit: 4, mult: "×10 k", tol: "—", tc: "25" },
  { name: "Grün", hex: "#2e7d32", digit: 5, mult: "×100 k", tol: "±0,5 %", tc: "—" },
  { name: "Blau", hex: "#1565c0", digit: 6, mult: "×1 M", tol: "±0,25 %", tc: "10" },
  { name: "Violett", hex: "#6a1b9a", digit: 7, mult: "×10 M", tol: "±0,1 %", tc: "5" },
  { name: "Grau", hex: "#757575", digit: 8, mult: "—", tol: "±0,05 %", tc: "—" },
  { name: "Weiß", hex: "#f2f2f2", digit: 9, mult: "—", tol: "—", tc: "—" },
  { name: "Gold", hex: "#c9a227", digit: null, mult: "×0,1", tol: "±5 %", tc: "—" },
  { name: "Silber", hex: "#b9b9b9", digit: null, mult: "×0,01", tol: "±10 %", tc: "—" },
];

/**
 * Kerko-Zahlencode → Farad. Regel: letzte Ziffer = Nullen, Rest = Ziffern,
 * Ergebnis in pF („104“ → 10·10⁴ pF = 100 nF). Null bei unlesbar.
 */
export function decodeCapacitorCode(code: string): number | null {
  const c = code.trim().toUpperCase();
  if (!/^\d{2,4}$/.test(c)) return null;
  if (c.length === 2) return Number(c) * 1e-12; // zweistellig = direkt pF
  const digits = Number(c.slice(0, -1));
  const zeros = Number(c.slice(-1));
  if (!Number.isFinite(digits) || !Number.isFinite(zeros)) return null;
  return digits * Math.pow(10, zeros) * 1e-12;
}

/**
 * SMD-Widerstandscode → Ohm. 3 Stellen („103“ → 10 kΩ), 4 Stellen
 * („1002“ → 10 kΩ), R als Komma („4R7“ → 4,7 Ω, „R10“ → 0,1 Ω),
 * „0“/„000“/„0000“ = 0-Ω-Brücke. EIA-96 („01C“) bewusst nicht dabei
 * (eigene Tabelle, folgt bei Bedarf). Null bei unlesbar.
 */
export function decodeSmdResistor(code: string): number | null {
  const c = code.trim().toUpperCase().replace(/Ω/g, "");
  if (/^0{1,4}$/.test(c)) return 0;
  const rPos = c.indexOf("R");
  if (rPos >= 0) {
    const whole = c.slice(0, rPos) || "0";
    const frac = c.slice(rPos + 1);
    if (!/^\d*$/.test(whole) || !/^\d+$/.test(frac)) return null;
    return Number(`${whole}.${frac}`);
  }
  if (!/^\d{3,4}$/.test(c)) return null;
  const digits = Number(c.slice(0, -1));
  const zeros = Number(c.slice(-1));
  if (!Number.isFinite(digits) || !Number.isFinite(zeros)) return null;
  return digits * Math.pow(10, zeros);
}

/**
 * Eingabe-Suffixe, wie der Parser (`lib/format`) sie versteht.
 * Der Test spiegelt jede Zeile gegen `parseValue` (kein Doku-Drift).
 */
export const VALUE_SUFFIX_ROWS: Array<{ suffix: string; factor: number; label: string }> = [
  { suffix: "T", factor: 1e12, label: "Tera" },
  { suffix: "G", factor: 1e9, label: "Giga" },
  { suffix: "M", factor: 1e6, label: "Mega (groß!)" },
  { suffix: "k", factor: 1e3, label: "Kilo" },
  { suffix: "—", factor: 1, label: "ohne (auch: R)" },
  { suffix: "m", factor: 1e-3, label: "Milli (klein!)" },
  { suffix: "u/µ", factor: 1e-6, label: "Mikro" },
  { suffix: "n", factor: 1e-9, label: "Nano" },
  { suffix: "p", factor: 1e-12, label: "Piko" },
];

export const VALUE_SUFFIX_NOTES = [
  "„MEG“ geht auch für Mega.",
  "Das Suffix ersetzt das Komma: „4k7“ = 4,7 kΩ, „2µ2“ = 2,2 µF.",
  "Einheiten (Ω, V, F, Hz …) dürfen dahinter stehen und werden ignoriert.",
  "„f“ allein heißt Farad (Einheit) — Femto geht nur mitten im Wert („1f5“).",
];
