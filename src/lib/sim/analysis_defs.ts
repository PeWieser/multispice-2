/**
 * Analyse-Definitionen: Jedes SPICE-Analyseverfahren beschreibt hier
 *  - Titel + Kurzhilfe (für Menü und Dialog),
 *  - seine Parameter (für den Dialog),
 *  - wie daraus der Runner-Payload gebaut wird,
 *  - und was gültig ist (Fehlermeldung oder null).
 *
 * Ein Ort für alle Analyse-Metadaten — Menü, Dialog und Grapher lesen
 * alle von hier.
 */

import { AnalysisPayload } from "./runner";

export type FieldValue = string | number | string[];

export type FieldDef =
  | { key: string; kind: "nets"; label: string }
  | { key: string; kind: "net"; label: string }
  | { key: string; kind: "source"; label: string }
  | { key: string; kind: "number"; label: string; unit?: string; def: number }
  | { key: string; kind: "int"; label: string; def: number; min?: number; max?: number }
  | { key: string; kind: "select"; label: string; def: string; options: Array<{ value: string; label: string }> }
  | { key: string; kind: "text"; label: string; def: string; placeholder?: string };

export interface AnalysisContext {
  /** Alle Netznamen inkl. "0". */
  nets: string[];
  /** Labels aller Spannungsquellen (VDC, VAC, VPULSE, XFG). */
  sources: string[];
  /** Zuletzt gewählte/empfohlene Ausgangsnetze (Sonden zuerst, dann erste Netze). */
  suggestedOutputs: string[];
}

export interface AnalysisDef {
  kind: string;
  title: string;
  spice: string;
  hint: string;
  /** Arbeitspunkt braucht keinen Dialog — läuft direkt. */
  direct?: boolean;
  fields: FieldDef[];
  build: (v: Record<string, FieldValue>) => AnalysisPayload;
  validate: (v: Record<string, FieldValue>, ctx: AnalysisContext) => string | null;
}

const MEASURE_OPTIONS = [
  { value: "vout-peak", label: "Spitze (max |V|)" },
  { value: "vout-rms", label: "Effektivwert (RMS)" },
  { value: "vout-dc", label: "Mittelwert (DC)" },
  { value: "gain-db", label: "Verstärkung (dB)" },
] as const;

const num = (v: FieldValue | undefined, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: FieldValue | undefined): string => (typeof v === "string" ? v : "");

const netsOf = (v: FieldValue | undefined): string[] => (Array.isArray(v) ? v : []);

function needOutputs(v: Record<string, FieldValue>, key = "outputs"): string | null {
  return netsOf(v[key]).length ? null : "Mindestens einen Ausgangsknoten wählen.";
}

function needNet(v: Record<string, FieldValue>, ctx: AnalysisContext, key = "out"): string | null {
  const n = str(v[key]);
  if (!n) return "Einen Ausgangsknoten wählen.";
  if (!ctx.nets.includes(n)) return `Netz „${n}“ gibt es nicht mehr.`;
  return null;
}

function needSource(v: Record<string, FieldValue>, ctx: AnalysisContext, key = "source"): string | null {
  const s = str(v[key]);
  if (!ctx.sources.length) return "Keine Quelle im Schaltplan — erst VDC/VAC/VPULSE/XFG platzieren.";
  if (!s) return "Eine Sweep-Quelle wählen.";
  if (!ctx.sources.includes(s)) return `Quelle „${s}“ gibt es nicht mehr.`;
  return null;
}

function positive(v: Record<string, FieldValue>, key: string, label: string): string | null {
  return num(v[key], NaN) > 0 ? null : `${label} muss größer als 0 sein.`;
}

function parseTemps(raw: string): number[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => Number(s.replace(",", ".")))
    .filter((n) => Number.isFinite(n));
}

export const ANALYSIS_DEFS: AnalysisDef[] = [
  {
    kind: "op",
    title: "DC-Arbeitspunkt",
    spice: ".op",
    hint: "Gleichspannungslösung aller Knoten und Zweigströme.",
    direct: true,
    fields: [],
    build: () => ({}),
    validate: () => null,
  },
  {
    kind: "tran",
    title: "Transientenanalyse",
    spice: ".tran",
    hint: "Zeitverlauf der gewählten Knoten — das digitale Oszilloskop für gerechnete Signale.",
    fields: [
      { key: "stop", kind: "number", label: "Simulationsdauer", unit: "s", def: 0.02 },
      { key: "step", kind: "number", label: "Max. Zeitschritt", unit: "s", def: 1e-5 },
      { key: "outputs", kind: "nets", label: "Ausgangsknoten" },
    ],
    build: (v) => ({
      tran: { stopTime: num(v.stop, 0.02), stepTime: num(v.step, 1e-5), maxPoints: 5000 },
      outputs: netsOf(v.outputs),
      outNode: netsOf(v.outputs)[0],
    }),
    validate: (v) =>
      needOutputs(v) ?? positive(v, "stop", "Simulationsdauer") ?? positive(v, "step", "Zeitschritt"),
  },
  {
    kind: "ac",
    title: "AC-Analyse",
    spice: ".ac",
    hint: "Frequenzgang (Bode): Amplitude und Phase über der Frequenz.",
    fields: [
      { key: "fmin", kind: "number", label: "Startfrequenz", unit: "Hz", def: 10 },
      { key: "fmax", kind: "number", label: "Stoppfrequenz", unit: "Hz", def: 1e6 },
      { key: "points", kind: "int", label: "Punkte pro Dekade", def: 24, min: 2, max: 200 },
      { key: "outputs", kind: "nets", label: "Ausgangsknoten" },
    ],
    build: (v) => ({
      sweep: { start: num(v.fmin, 10), stop: num(v.fmax, 1e6), points: Math.round(num(v.points, 24)), type: "dec" },
      outputs: netsOf(v.outputs),
      outNode: netsOf(v.outputs)[0],
    }),
    validate: (v) =>
      needOutputs(v) ??
      positive(v, "fmin", "Startfrequenz") ??
      positive(v, "fmax", "Stoppfrequenz") ??
      (num(v.fmax, 0) > num(v.fmin, 0) ? null : "Stoppfrequenz muss über der Startfrequenz liegen."),
  },
  {
    kind: "dc",
    title: "DC-Sweep",
    spice: ".dc",
    hint: "Arbeitspunkt über einer durchgestimmten Quellenspannung.",
    fields: [
      { key: "source", kind: "source", label: "Sweep-Quelle" },
      { key: "start", kind: "number", label: "Startwert", unit: "V", def: 0 },
      { key: "stop", kind: "number", label: "Stoppwert", unit: "V", def: 12 },
      { key: "points", kind: "int", label: "Punkte (linear)", def: 60, min: 2, max: 500 },
      { key: "outputs", kind: "nets", label: "Ausgangsknoten" },
    ],
    build: (v) => ({
      sourceId: str(v.source),
      sweep: { start: num(v.start, 0), stop: num(v.stop, 12), points: Math.round(num(v.points, 60)), type: "lin" },
      outputs: netsOf(v.outputs),
      outNode: netsOf(v.outputs)[0],
    }),
    validate: (v, ctx) => needSource(v, ctx) ?? needOutputs(v),
  },
  {
    kind: "noise",
    title: "Rauschanalyse",
    spice: ".noise",
    hint: "Ausgangsrauschen über der Frequenz plus Hauptverursacher.",
    fields: [
      { key: "out", kind: "net", label: "Ausgangsknoten" },
      { key: "source", kind: "source", label: "Eingangsquelle (Referenz)" },
      { key: "fmin", kind: "number", label: "Startfrequenz", unit: "Hz", def: 10 },
      { key: "fmax", kind: "number", label: "Stoppfrequenz", unit: "Hz", def: 1e6 },
      { key: "points", kind: "int", label: "Punkte pro Dekade", def: 10, min: 2, max: 200 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      sourceId: str(v.source),
      sweep: { start: num(v.fmin, 10), stop: num(v.fmax, 1e6), points: Math.round(num(v.points, 10)), type: "dec" },
    }),
    validate: (v, ctx) =>
      needNet(v, ctx) ??
      needSource(v, ctx) ??
      positive(v, "fmin", "Startfrequenz") ??
      positive(v, "fmax", "Stoppfrequenz") ??
      (num(v.fmax, 0) > num(v.fmin, 0) ? null : "Stoppfrequenz muss über der Startfrequenz liegen."),
  },
  {
    kind: "thd",
    title: "THD / Fourier",
    spice: ".four",
    hint: "Klirrfaktor und Oberwellen bei gegebener Grundfrequenz.",
    fields: [
      { key: "out", kind: "net", label: "Ausgangsknoten" },
      { key: "fundamental", kind: "number", label: "Grundfrequenz", unit: "Hz", def: 1000 },
    ],
    build: (v) => ({ outNode: str(v.out), outputs: [str(v.out)], fundamental: num(v.fundamental, 1000) }),
    validate: (v, ctx) => needNet(v, ctx) ?? positive(v, "fundamental", "Grundfrequenz"),
  },
  {
    kind: "montecarlo",
    title: "Monte-Carlo",
    spice: ".mc",
    hint: "Streut Bauteiltoleranzen statistisch und misst die Verteilung.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "measure", kind: "select", label: "Messgröße", def: "vout-peak", options: [...MEASURE_OPTIONS] },
      { key: "runs", kind: "int", label: "Durchläufe", def: 40, min: 5, max: 500 },
      { key: "tolerance", kind: "number", label: "Toleranz", unit: "%", def: 5 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      measure: (["vout-peak", "vout-rms", "vout-dc", "gain-db"].includes(str(v.measure)) ? str(v.measure) : "vout-peak") as AnalysisPayload["measure"],
      runs: Math.round(num(v.runs, 40)),
      tolerance: num(v.tolerance, 5),
    }),
    validate: (v, ctx) => needNet(v, ctx) ?? positive(v, "runs", "Durchläufe") ?? positive(v, "tolerance", "Toleranz"),
  },
  {
    kind: "worstcase",
    title: "Worst-Case",
    spice: ".wc",
    hint: "Eckwerte bei ungünstigster Toleranzkombination plus Empfindlichkeiten.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "measure", kind: "select", label: "Messgröße", def: "vout-peak", options: [...MEASURE_OPTIONS] },
      { key: "tolerance", kind: "number", label: "Toleranz", unit: "%", def: 5 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      measure: (["vout-peak", "vout-rms", "vout-dc", "gain-db"].includes(str(v.measure)) ? str(v.measure) : "vout-peak") as AnalysisPayload["measure"],
      tolerance: num(v.tolerance, 5),
    }),
    validate: (v, ctx) => needNet(v, ctx) ?? positive(v, "tolerance", "Toleranz"),
  },
  {
    kind: "temp",
    title: "Temperatur-Sweep",
    spice: ".temp",
    hint: "Messwert über frei wählbaren Temperaturpunkten.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "measure", kind: "select", label: "Messgröße", def: "vout-dc", options: [...MEASURE_OPTIONS] },
      { key: "temps", kind: "text", label: "Temperaturen", def: "-40 -10 25 60 85 125", placeholder: "−40 −10 25 60 85 125" },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      measure: (["vout-peak", "vout-rms", "vout-dc", "gain-db"].includes(str(v.measure)) ? str(v.measure) : "vout-dc") as AnalysisPayload["measure"],
      temps: parseTemps(str(v.temps)),
    }),
    validate: (v, ctx) => {
      const err = needNet(v, ctx);
      if (err) return err;
      return parseTemps(str(v.temps)).length >= 2 ? null : "Mindestens zwei Temperaturen angeben (z. B. „0 25 85“).";
    },
  },
];

export const ANALYSIS_MAP: Record<string, AnalysisDef> = Object.fromEntries(ANALYSIS_DEFS.map((d) => [d.kind, d]));

/** Standardwerte eines Dialogs — mit sinnvollen Netzen/Quellen aus der aktuellen Schaltung. */
export function defaultValues(def: AnalysisDef, ctx: AnalysisContext): Record<string, FieldValue> {
  const v: Record<string, FieldValue> = {};
  for (const f of def.fields) {
    switch (f.kind) {
      case "nets":
        v[f.key] = [...ctx.suggestedOutputs];
        break;
      case "net":
        v[f.key] = ctx.suggestedOutputs[0] ?? "";
        break;
      case "source":
        v[f.key] = ctx.sources[0] ?? "";
        break;
      case "number":
      case "int":
        v[f.key] = f.def;
        break;
      case "select":
      case "text":
        v[f.key] = f.def;
        break;
    }
  }
  return v;
}
