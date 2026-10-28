/**
 * S5.24: E-Reihen (Normwerte) + Schritt-Logik fürs Rad in Zahlenfeldern.
 * Rein + DOM-frei — Canvas, Inspector und Referenz-Fenster nutzen dieselbe Quelle.
 */

/** E6 (20 %), E12 (10 %), E24 (5 %) — Grundwerte einer Dekade. */
export const E6 = [10, 15, 22, 33, 47, 68];
export const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
export const E24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];

export type ESeries = "E6" | "E12" | "E24";
export const E_SERIES_VALUES: Record<ESeries, number[]> = { E6, E12, E24 };

const EPS = 1e-9;

/** Nächster Reihenwert über alle Dekaden (Abstand im Log-Maß). */
export function nearestEValue(value: number, series: ESeries): number {
  const table = E_SERIES_VALUES[series];
  if (!Number.isFinite(value) || value <= 0) return table[0];
  const decade = Math.floor(Math.log10(value));
  let best = (table[0] * Math.pow(10, decade)) / 10;
  let bestDist = Infinity;
  for (let d = decade - 1; d <= decade + 1; d++) {
    const p = Math.pow(10, d);
    for (const t of table) {
      const cand = (t * p) / 10;
      const dist = Math.abs(Math.log(cand / value));
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return best;
}

/**
 * Ein Schritt in der Reihe: hoch = kleinster Reihenwert echt über dem
 * aktuellen, runter = größter echt darunter (ggf. über die Dekade hinaus).
 * Nicht-positive/kranke Werte starten bei 10.
 */
export function stepEValue(value: number, series: ESeries, dir: 1 | -1): number {
  const table = E_SERIES_VALUES[series];
  if (!Number.isFinite(value) || value <= 0) return table[0];
  const decade = Math.floor(Math.log10(value));
  const p = Math.pow(10, decade);
  const t = (value / p) * 10; // 10 … <100
  // Tabellenwerte sind Mantisse × 10 (10…91 je Dekade).
  if (dir > 0) {
    for (const step of table) {
      if (step > t * (1 + EPS)) return (step * p) / 10;
    }
    return table[0] * p; // Dekadenwechsel hoch (10 × p)
  }
  for (let i = table.length - 1; i >= 0; i--) {
    if (table[i] < t * (1 - EPS)) return (table[i] * p) / 10;
  }
  return (table[table.length - 1] * p) / 100; // Dekadenwechsel runter
}

/** Prozent-Schritt für alle anderen Zahlenfelder (0 → ±1). */
export function stepPercent(value: number, dir: 1 | -1, pct = 0.05): number {
  if (!Number.isFinite(value)) return 0;
  const dv = Math.abs(value) * pct || 1;
  return value + dir * dv;
}
