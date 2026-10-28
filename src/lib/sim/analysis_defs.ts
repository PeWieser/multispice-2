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
  {
    kind: "param",
    title: "Parameter-Sweep",
    spice: ".step param",
    hint: "Sweep Bauteilwert (z.B. R 1k-10k) – Was wenn? – Unabdingbar für Lehre.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "param", kind: "text", label: "Bauteil.Parameter (z.B. R1.resistance)", def: "R1.resistance", placeholder: "R1.resistance oder C1.capacitance" },
      { key: "start", kind: "number", label: "Startwert", def: 1000 },
      { key: "stop", kind: "number", label: "Stoppwert", def: 10000 },
      { key: "points", kind: "int", label: "Punkte", def: 5, min: 2, max: 50 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      param: str(v.param),
      sweep: { start: num(v.start, 1000), stop: num(v.stop, 10000), points: Math.round(num(v.points, 5)), type: "lin" as const },
    }),
    validate: (v, ctx) => needNet(v, ctx) ?? (str(v.param) ? null : "Parameter angeben (z.B. R1.resistance)"),
  },
  {
    kind: "fourier",
    title: "Fourier-Analyse",
    spice: ".four",
    hint: "Harmonische Zerlegung – Spektrum bei Grundfrequenz.",
    fields: [
      { key: "out", kind: "net", label: "Ausgangsknoten" },
      { key: "fundamental", kind: "number", label: "Grundfrequenz", unit: "Hz", def: 1000 },
      { key: "harmonics", kind: "int", label: "Harmonische", def: 9, min: 2, max: 50 },
    ],
    build: (v) => ({ outNode: str(v.out), outputs: [str(v.out)], fundamental: num(v.fundamental, 1000), harmonics: Math.round(num(v.harmonics, 9)) }),
    validate: (v, ctx) => needNet(v, ctx) ?? positive(v, "fundamental", "Grundfrequenz"),
  },
  {
    kind: "sensitivity",
    title: "Sensitivitätsanalyse",
    spice: ".sens",
    hint: "Welche Bauteile beeinflussen den Ausgang am meisten? DC: Arbeitspunkt; AC: |H(f)|.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "mode", kind: "select", label: "Modus", def: "dc", options: [{ value: "dc", label: "DC" }, { value: "ac", label: "AC" }] },
      { key: "freq", kind: "number", label: "Frequenz (nur AC-Modus)", unit: "Hz", def: 1000 },
    ],
    build: (v) => ({ outNode: str(v.out), outputs: [str(v.out)], mode: str(v.mode) || "dc", frequency: num(v.freq, 1000) }),
    validate: (v, ctx) => needNet(v, ctx) ?? ((str(v.mode) || "dc") === "ac" ? positive(v, "freq", "Frequenz") : null),
  },
  {
    kind: "tf",
    title: "Transferfunktion",
    spice: ".tf",
    hint: "Kleinsignal-Kennwerte am DC-Arbeitspunkt: Verstärkung, Ein-/Ausgangswiderstand.",
    fields: [
      { key: "out", kind: "net", label: "Ausgangsknoten" },
      { key: "source", kind: "source", label: "Eingangsquelle" },
    ],
    build: (v) => ({ outNode: str(v.out), outputs: [str(v.out)], sourceId: str(v.source) }),
    validate: (v, ctx) => needNet(v, ctx) ?? needSource(v, ctx),
  },
  {
    kind: "pz",
    title: "Pol-Nullstellen",
    spice: ".pz",
    hint: "Pole/Nullstellen aus Anpassung an den AC-Frequenzgang — inkl. Anpassungsgüte.",
    fields: [
      { key: "out", kind: "net", label: "Ausgangsknoten" },
      { key: "source", kind: "source", label: "Eingangsquelle" },
      { key: "fmin", kind: "number", label: "Startfrequenz", unit: "Hz", def: 10 },
      { key: "fmax", kind: "number", label: "Stoppfrequenz", unit: "Hz", def: 1e6 },
      { key: "order", kind: "int", label: "Ordnung", def: 2, min: 1, max: 6 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      sourceId: str(v.source),
      order: Math.round(num(v.order, 2)),
      sweep: { start: num(v.fmin, 10), stop: num(v.fmax, 1e6), points: 20, type: "dec" as const },
    }),
    validate: (v, ctx) => needNet(v, ctx) ?? needSource(v, ctx) ?? positive(v, "fmin", "Startfrequenz") ?? positive(v, "fmax", "Stoppfrequenz"),
  },
  {
    kind: "sparams",
    title: "S-Parameter",
    spice: ".sparam",
    hint: "Streuparameter S11/S21 am Zweitor — Port 1 angeregt, Port 2 mit Z₀ abgeschlossen.",
    fields: [
      { key: "in", kind: "net", label: "Eingangsnetz (Port 1)" },
      { key: "out", kind: "net", label: "Ausgangsnetz (Port 2)" },
      { key: "fmin", kind: "number", label: "Startfrequenz", unit: "Hz", def: 10 },
      { key: "fmax", kind: "number", label: "Stoppfrequenz", unit: "Hz", def: 1e6 },
      { key: "z0", kind: "number", label: "Bezugswiderstand Z₀", unit: "Ω", def: 50 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      inNode: str(v.in),
      z0: num(v.z0, 50),
      sweep: { start: num(v.fmin, 10), stop: num(v.fmax, 1e6), points: 20, type: "dec" as const },
    }),
    validate: (v, ctx) => {
      const i = str(v.in);
      if (!i) return "Ein Eingangsnetz wählen.";
      if (!ctx.nets.includes(i)) return `Netz „${i}“ gibt es nicht mehr.`;
      return needNet(v, ctx) ?? positive(v, "fmin", "Startfrequenz") ?? positive(v, "fmax", "Stoppfrequenz") ?? positive(v, "z0", "Bezugswiderstand Z₀");
    },
  },
  {
    kind: "noisefigure",
    title: "Rauschzahl",
    spice: ".noise",
    hint: "Rauschzahl (Noise Figure) – RF.",
    fields: [
      { key: "out", kind: "net", label: "Ausgangsknoten" },
      { key: "source", kind: "source", label: "Eingangsquelle" },
      { key: "fmin", kind: "number", label: "Startfrequenz", unit: "Hz", def: 10 },
      { key: "fmax", kind: "number", label: "Stoppfrequenz", unit: "Hz", def: 1e6 },
    ],
    build: (v) => ({ outNode: str(v.out), outputs: [str(v.out)], sourceId: str(v.source), sweep: { start: num(v.fmin, 10), stop: num(v.fmax, 1e6), points: 20, type: "dec" as const } }),
    validate: (v, ctx) => needNet(v, ctx) ?? needSource(v, ctx),
  },
  {
    // S5.8: 2 Parameter, Kurvenschar (Punkte je Achse klein halten: Läufe = n1 × n2).
    kind: "nested",
    title: "Geschachtelter Sweep",
    spice: ".step param × .step param",
    hint: "Zwei Bauteilwerte gleichzeitig variieren – Kurvenschar am Messknoten.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "param1", kind: "text", label: "Parameter 1 (z.B. R1.r)", def: "R1.r", placeholder: "R1.r" },
      { key: "start1", kind: "number", label: "Start 1", def: 1000 },
      { key: "stop1", kind: "number", label: "Stopp 1", def: 10000 },
      { key: "points1", kind: "int", label: "Punkte 1", def: 3, min: 2, max: 8 },
      { key: "param2", kind: "text", label: "Parameter 2 (z.B. R2.r)", def: "R2.r", placeholder: "R2.r" },
      { key: "start2", kind: "number", label: "Start 2", def: 1000 },
      { key: "stop2", kind: "number", label: "Stopp 2", def: 10000 },
      { key: "points2", kind: "int", label: "Punkte 2", def: 3, min: 2, max: 8 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      param: str(v.param1),
      sweep: { start: num(v.start1, 1000), stop: num(v.stop1, 10000), points: Math.round(num(v.points1, 3)), type: "lin" as const },
      param2: str(v.param2),
      sweep2: { start: num(v.start2, 1000), stop: num(v.stop2, 10000), points: Math.round(num(v.points2, 3)), type: "lin" as const },
    }),
    validate: (v, ctx) => needNet(v, ctx) ?? (str(v.param1) && str(v.param2) ? null : "Beide Parameter angeben (z.B. R1.r)"),
  },
  {
    // S5.8: DC+AC+TRAN in einem Lauf, ein Report.
    kind: "batched",
    title: "Gebündelte Analyse (DC+AC+TRAN)",
    spice: ".dc + .ac + .tran",
    hint: "Arbeitspunkt-Sweep, Frequenzgang und Zeitverhalten in einem Durchgang.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "source", kind: "source", label: "DC-Sweep-Quelle" },
      { key: "dcStart", kind: "number", label: "DC-Start", unit: "V", def: 0 },
      { key: "dcStop", kind: "number", label: "DC-Stopp", unit: "V", def: 5 },
      { key: "dcPoints", kind: "int", label: "DC-Punkte", def: 25, min: 2, max: 200 },
      { key: "acFmin", kind: "number", label: "AC-Start", unit: "Hz", def: 10 },
      { key: "acFmax", kind: "number", label: "AC-Stopp", unit: "Hz", def: 1e6 },
      { key: "acPoints", kind: "int", label: "AC-Punkte/Dekade", def: 10, min: 2, max: 100 },
      { key: "tranStop", kind: "number", label: "TRAN-Dauer", unit: "s", def: 0.02 },
      { key: "tranStep", kind: "number", label: "TRAN-Schritt", unit: "s", def: 1e-5 },
    ],
    build: (v) => ({
      outNode: str(v.out),
      outputs: [str(v.out)],
      sourceId: str(v.source),
      sweep: { start: num(v.dcStart, 0), stop: num(v.dcStop, 5), points: Math.round(num(v.dcPoints, 25)), type: "lin" as const },
      sweep2: { start: num(v.acFmin, 10), stop: num(v.acFmax, 1e6), points: Math.round(num(v.acPoints, 10)), type: "dec" as const },
      tran: { stopTime: num(v.tranStop, 0.02), stepTime: num(v.tranStep, 1e-5) },
    }),
    validate: (v, ctx) => needNet(v, ctx) ?? needSource(v, ctx),
  },
  {
    // S5.8: Klirrfaktor vs. Aussteuerpegel (ein runThd je Stufe).
    kind: "thdsweep",
    title: "THD-Sweep (Klirr vs. Pegel)",
    spice: ".four × .step",
    hint: "Klirrfaktor über der Eingangsamplitude – Aussteuerungsreserve finden.",
    fields: [
      { key: "out", kind: "net", label: "Messknoten" },
      { key: "fundamental", kind: "number", label: "Grundfrequenz", unit: "Hz", def: 1000 },
      { key: "param", kind: "text", label: "Pegel-Parameter (z.B. V1.amplitude)", def: "V1.amplitude", placeholder: "V1.amplitude" },
      { key: "levelStart", kind: "number", label: "Pegel-Start", unit: "V", def: 0.5 },
      { key: "levelStop", kind: "number", label: "Pegel-Stopp", unit: "V", def: 4 },
      { key: "levelPoints", kind: "int", label: "Pegel-Stufen", def: 4, min: 2, max: 12 },
    ],
    build: (v) => {
      const pts = Math.max(2, Math.min(12, Math.round(num(v.levelPoints, 4))));
      const a = num(v.levelStart, 0.5), b = num(v.levelStop, 4);
      const levels = Array.from({ length: pts }, (_, i) => a + ((b - a) * i) / (pts - 1));
      return { outNode: str(v.out), outputs: [str(v.out)], fundamental: num(v.fundamental, 1000), param: str(v.param), levels };
    },
    validate: (v, ctx) => needNet(v, ctx) ?? (str(v.param) ? null : "Pegel-Parameter angeben (z.B. V1.amplitude)"),
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
