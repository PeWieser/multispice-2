/**
 * Component library: schematic symbols, parameters, footprints and the mapping
 * to SPICE primitives. Families (logic gates, 74xx, 4000, sources...) are
 * generated to keep the catalog broad but maintainable.
 */

import { Device, SourceSpec } from "@/lib/sim/engine";
import type { GenState } from "@/lib/fg/types";
import { initialState } from "@/lib/fg/state";

export type SymbolPrim =
  | { t: "line"; pts: number[]; w?: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: boolean }
  | { t: "circle"; x: number; y: number; r: number; fill?: boolean }
  | { t: "arc"; x: number; y: number; r: number; a0: number; a1: number }
  | { t: "text"; x: number; y: number; s: string; size?: number; align?: "center" | "left" | "right" };

/**
 * S3.4: Elektrischer Pin-Typ für den ERC.
 * - passive: keine Treiber-Aussage (R/C/L/Halbleiter, Taster, Verbinder)
 * - input: braucht einen Treiber (Logik-/OPV-Eingang, Messgeräte)
 * - output: treibt (Logik-/OPV-Ausgang, Signalquelle)
 * - power_in: braucht Versorgung (VCC/VCC-Pins)
 * - power_out: liefert Versorgung/Masse (Quellen-Plus, GND-/VCC-Symbole)
 */
export type PinElectrical = "passive" | "input" | "output" | "power_in" | "power_out";

export interface PinDef {
  name: string;
  x: number;
  y: number;
  /** Fehlt der Typ, gilt passive. */
  electrical?: PinElectrical;
}

export type ParamType = "number" | "text" | "select" | "bool";

export interface ParamDef {
  key: string;
  label: string;
  unit?: string;
  type: ParamType;
  def: number | string | boolean;
  options?: Array<{ value: string | number; label: string }>;
  step?: number;
  min?: number;
  max?: number;
  group?: string;
}

export type InteractiveKind =
  | "switch"
  | "button"
  | "pot"
  | "led"
  | "lamp"
  | "sevenseg"
  | "fourteenseg"
  | "motor"
  | "buzzer"
  | "relay"
  | "dip"
  | "generator"
  | "mcu";

export interface PartInstanceLike {
  id: string;
  partId: string;
  params: Record<string, number | string | boolean>;
  text?: string;
}

export interface PartDef {
  id: string;
  name: string;
  ref: string;
  category: string;
  tags: string[];
  mount: "THT" | "SMD" | "both" | "virtual";
  pins: PinDef[];
  symbol: SymbolPrim[];
  params: ParamDef[];
  footprint?: string;
  spice?: string;
  interactive?: InteractiveKind;
  description?: string;
  toDevices: (inst: PartInstanceLike, nets: string[]) => Device[];
  /**
   * S3.1: dynamische Pins (z. B. Splitter-Breite). Default: statische `pins`.
   * Zugriff IMMER über `partPins()` — nie direkt über `.pins` bei Instanzen.
   */
  pinsFor?: (params: Record<string, number | string | boolean>) => PinDef[];
  /**
   * S3.1: dynamisches Symbol (z. B. Splitter-Box wächst mit der Breite).
   * Zugriff über `partSymbol()`; Default: statisches `symbol` (+ Stil-Regeln).
   */
  symbolFor?: (params: Record<string, number | string | boolean>) => SymbolPrim[];
}

/* -------------------------- symbol helpers -------------------------- */
const L = (...pts: number[]): SymbolPrim => ({ t: "line", pts });
const RECT = (x: number, y: number, w: number, h: number, r = 0, fill = false): SymbolPrim => ({ t: "rect", x, y, w, h, r, fill });
const CIR = (x: number, y: number, r: number, fill = false): SymbolPrim => ({ t: "circle", x, y, r, fill });
const TXT = (x: number, y: number, s: string, size = 9): SymbolPrim => ({ t: "text", x, y, s, size });

const num = (inst: PartInstanceLike, k: string, def = 0): number => {
  const v = inst.params?.[k];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseValue(v);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return def;
};
const str = (inst: PartInstanceLike, k: string, def = ""): string => {
  const v = inst.params?.[k];
  return v === undefined || v === null ? def : String(v);
};

/** Parses engineering notation: 4k7, 10n, 2.2u, 1Meg, 100m */
import { formatValue, parseValue } from "../format";
export { formatValue, parseValue };

/** Returns the net name only when the pin is really connected (not a dangling stub). */
const conn = (n: string | undefined): string => (n && !/_nc\d+$/.test(n) ? n : "");

const P = {
  tol: { key: "tol", label: "Toleranz", unit: "%", type: "number" as const, def: 5, group: "Statistik" },
  tc1: { key: "tc1", label: "TK1", unit: "1/K", type: "number" as const, def: 0, group: "Temperatur" },
  tnom: { key: "tnom", label: "T nominal", unit: "°C", type: "number" as const, def: 27, group: "Temperatur" },
};

/* -------------------------- source waveform param sets -------------------------- */
const waveParams: ParamDef[] = [
  {
    key: "wave",
    label: "Kurvenform",
    type: "select",
    def: "sine",
    options: [
      { value: "sine", label: "Sinus" },
      { value: "square", label: "Rechteck" },
      { value: "triangle", label: "Dreieck" },
      { value: "sawtooth", label: "Sägezahn" },
      { value: "pulse", label: "Puls" },
      { value: "am", label: "AM" },
      { value: "fm", label: "FM" },
      { value: "noise", label: "Rauschen" },
    ],
  },
  { key: "amplitude", label: "Amplitude", unit: "V", type: "number", def: 5 },
  { key: "freq", label: "Frequenz", unit: "Hz", type: "number", def: 1000 },
  { key: "offset", label: "Offset", unit: "V", type: "number", def: 0 },
  { key: "phase", label: "Phase", unit: "°", type: "number", def: 0 },
  { key: "duty", label: "Tastgrad", unit: "%", type: "number", def: 50 },
  { key: "modIndex", label: "Modulationsindex", type: "number", def: 0.5, group: "Modulation" },
  { key: "modFreq", label: "Modulationsfrequenz", unit: "Hz", type: "number", def: 100, group: "Modulation" },
  { key: "acMag", label: "AC Magnitude", unit: "V", type: "number", def: 1, group: "AC-Analyse" },
  { key: "acPhase", label: "AC Phase", unit: "°", type: "number", def: 0, group: "AC-Analyse" },
];

function sourceFromParams(inst: PartInstanceLike): SourceSpec {
  const kind = str(inst, "wave", "sine") as SourceSpec["kind"];
  return {
    kind,
    dc: num(inst, "dc", 0),
    amplitude: num(inst, "amplitude", 5),
    freq: num(inst, "freq", 1000),
    offset: num(inst, "offset", 0),
    phase: num(inst, "phase", 0),
    duty: num(inst, "duty", 50),
    modIndex: num(inst, "modIndex", 0.5),
    modFreq: num(inst, "modFreq", 100),
    acMag: num(inst, "acMag", 1),
    acPhase: num(inst, "acPhase", 0),
    period: num(inst, "freq", 1000) > 0 ? 1 / num(inst, "freq", 1000) : 1e-3,
    width: num(inst, "duty", 50) / 100 / Math.max(num(inst, "freq", 1000), 1e-9),
    rise: 1e-9,
    fall: 1e-9,
  };
}

/* -------------------------- symbol builders -------------------------- */
// IEC (rectangle) vs ANSI (zigzag) – Multisim allows both, default by locale
export const resSymbolIEC: SymbolPrim[] = [
  L(-30, 0, -20, 0),
  L(-20, -7, 20, -7, 20, 7, -20, 7, -20, -7),
  L(20, 0, 30, 0),
];
export const resSymbolANSI: SymbolPrim[] = [
  L(-30, 0, -20, 0),
  L(-20, 0, -16, -8, -12, 8, -8, -8, -4, 8, 0, -8, 4, 8, 8, -8, 12, 8, 16, -8, 20, 0),
  L(20, 0, 30, 0),
];
const resSymbol = resSymbolIEC; // default IEC
export const potSymbolIEC: SymbolPrim[] = [...resSymbolIEC, L(0, -30, 0, -14), L(-5, -14, 5, -14, 0, -9, -5, -14)];
export const potSymbolANSI: SymbolPrim[] = [...resSymbolANSI, L(0, -30, 0, -14), L(-5, -14, 5, -14, 0, -9, -5, -14)];

const capSymbol: SymbolPrim[] = [L(-30, 0, -5, 0), L(-5, -12, -5, 12), L(5, -12, 5, 12), L(5, 0, 30, 0)];
const indSymbolIEC: SymbolPrim[] = [
  L(-30, 0, -20, 0),
  { t: "arc", x: -15, y: 0, r: 5, a0: Math.PI, a1: 0 },
  { t: "arc", x: -5, y: 0, r: 5, a0: Math.PI, a1: 0 },
  { t: "arc", x: 5, y: 0, r: 5, a0: Math.PI, a1: 0 },
  { t: "arc", x: 15, y: 0, r: 5, a0: Math.PI, a1: 0 },
  L(20, 0, 30, 0),
];
const indSymbolANSI: SymbolPrim[] = [
  L(-30, 0, -20, 0),
  L(-20, -4, -20, 4),
  L(-20, -4, -15, -4, -15, 4, -10, 4, -10, -4, -5, -4, -5, 4, 0, 4, 0, -4, 5, -4, 5, 4, 10, 4, 10, -4, 15, -4, 15, 4, 20, 4, 20, -4),
  L(20, 0, 30, 0),
];
const indSymbol = indSymbolIEC;
const diodeSymbol: SymbolPrim[] = [L(-30, 0, -10, 0), L(-10, -10, -10, 10, 10, 0, -10, -10), L(10, -10, 10, 10), L(10, 0, 30, 0)];

export type SymbolStyle = "iec" | "ansi";
export function getResistorSymbol(style: SymbolStyle): SymbolPrim[] {
  return style === "ansi" ? resSymbolANSI : resSymbolIEC;
}
export function getPotSymbol(style: SymbolStyle): SymbolPrim[] {
  return style === "ansi" ? potSymbolANSI : potSymbolIEC;
}
export function getInductorSymbol(style: SymbolStyle): SymbolPrim[] {
  return style === "ansi" ? indSymbolANSI : indSymbolIEC;
}
export function getPartSymbol(part: PartDef, style: SymbolStyle): SymbolPrim[] {
  if (part.id === "resistor") return getResistorSymbol(style);
  if (part.id === "potentiometer" || part.id === "trimmer") return getPotSymbol(style);
  if (part.id === "inductor") return getInductorSymbol(style);
  // For other resistor-like parts (e.g. thermistor, varistor) use resistor base
  if (part.category.includes("Widerst") && part.symbol === resSymbol) return getResistorSymbol(style);
  return part.symbol;
}

/** S3.1: Pin-Funnel — dynamische Pins haben Vorrang, sonst statische. */
export function partPins(part: PartDef, params?: Record<string, number | string | boolean>): PinDef[] {
  if (part.pinsFor) {
    try {
      return part.pinsFor(params ?? {});
    } catch {
      return part.pins;
    }
  }
  return part.pins;
}

/** S3.1: Symbol-Funnel — dynamisches Symbol hat Vorrang (Stil-Regeln gelten weiter). */
export function partSymbol(part: PartDef, params?: Record<string, number | string | boolean>, style?: SymbolStyle): SymbolPrim[] {
  if (part.symbolFor) {
    try {
      return part.symbolFor(params ?? {});
    } catch {
      // fallthrough zu den Stil-Regeln
    }
  }
  return getPartSymbol(part, style ?? "iec");
}

function bjtSymbol(pnp: boolean): SymbolPrim[] {
  return [
    L(-30, 0, -6, 0),
    L(-6, -16, -6, 16),
    L(-6, -8, 12, -18, 12, -30),
    L(-6, 8, 12, 18, 12, 30),
    pnp ? L(-2, -2, -6, -8, 4, -6, -2, -2) : L(6, 14, 12, 18, 4, 22, 6, 14),
    CIR(0, 0, 24),
  ];
}

function mosSymbol(p: boolean): SymbolPrim[] {
  return [
    L(-30, 0, -8, 0),
    L(-8, -16, -8, 16),
    L(-2, -16, -2, -6),
    L(-2, -5, -2, 5),
    L(-2, 6, -2, 16),
    L(-2, -11, 14, -11, 14, -30),
    L(-2, 11, 14, 11, 14, 30),
    L(-2, 0, 14, 0, 14, 11),
    p ? L(8, -4, 2, 0, 8, 4, 8, -4) : L(4, -4, 10, 0, 4, 4, 4, -4),
    CIR(0, 0, 24),
  ];
}

const gndSymbol: SymbolPrim[] = [L(0, -14, 0, 0), L(-14, 0, 14, 0), L(-9, 5, 9, 5), L(-4, 10, 4, 10)];

function icSymbol(w: number, h: number, label: string, pins: PinDef[]): SymbolPrim[] {
  // W3: Eine Quelle der Wahrheit – Stubs und Pin-Namen entstehen AUS dem
  // pins-Array, das auch die elektrischen Anschlusspunkte definiert.
  // Stub: Body-Kante → exakt (pin.x, pin.y). Kein Versatz, keine eigene Teilung.
  const prims: SymbolPrim[] = [RECT(-w / 2, -h / 2, w, h, 4), TXT(0, -h / 2 + 12, label, 10)];
  for (const pin of pins) {
    const left = pin.x < 0;
    const edgeX = left ? -w / 2 : w / 2;
    if (pin.x !== edgeX) prims.push(L(edgeX, pin.y, pin.x, pin.y));
    prims.push({ t: "text", x: left ? edgeX + 6 : edgeX - 6, y: pin.y + 3, s: pin.name, size: 7, align: left ? "left" : "right" });
  }
  return prims;
}

/* ============================== PARTS ============================== */

const parts: PartDef[] = [];
const add = (pd: PartDef) => {
  parts.push(pd);
  return pd;
};

/* ---------------- Passive ---------------- */
add({
  id: "resistor",
  name: "Widerstand",
  ref: "R",
  category: "Passive Bauteile/Widerstände",
  tags: ["r", "widerstand", "resistor", "passiv"],
  mount: "both",
  footprint: "0805 / axial 0207",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: resSymbol,
  params: [
    { key: "r", label: "Widerstand", unit: "Ω", type: "number", def: 1000 },
    { key: "power", label: "Belastbarkeit", unit: "W", type: "number", def: 0.25 },
    P.tol, P.tc1, P.tnom,
  ],
  toDevices: (i, n) => [{ id: i.id, type: "R", nodes: n, params: { r: num(i, "r", 1000), tc1: num(i, "tc1", 0), tnom: num(i, "tnom", 27), tol: num(i, "tol", 5) } }],
});

add({
  id: "ntc",
  name: "NTC-Heißleiter",
  ref: "NTC",
  category: "Sensoren",
  tags: ["ntc", "heißleiter", "thermistor", "temperatur", "sensor"],
  mount: "both",
  footprint: "0805 / Scheibe",
  description: "Heißleiter nach Beta-Gleichung R = R25·exp(B·(1/T−1/T25)) bei der globalen Sim-Temperatur (DC-Sweep ‚Temperatur‘ möglich).",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [...resSymbol, TXT(0, 16, "-t°", 7)],
  params: [
    { key: "r25", label: "Nennwiderstand R25", unit: "Ω", type: "number", def: 10000 },
    { key: "b", label: "B-Konstante", unit: "K", type: "number", def: 3950 },
    { key: "tnom", label: "Nenntemperatur", unit: "°C", type: "number", def: 25 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "NTC", nodes: n, params: { r25: num(i, "r25", 10000), b: num(i, "b", 3950), tnom: num(i, "tnom", 25) } }],
});

add({
  id: "ldr",
  name: "Fotowiderstand (LDR)",
  ref: "LDR",
  category: "Sensoren",
  tags: ["ldr", "fotowiderstand", "helligkeit", "licht", "sensor"],
  mount: "both",
  footprint: "5 mm / 7 mm",
  description: "Fotowiderstand R = R10·(10/lux)^γ. Beleuchtungsstärke als Bauteil-Parameter (statisch — kein zeitabhängiges Lichtmodell).",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [...resSymbol,
    L(-22, -19, -10, -7), L(-10, -7, -14, -7), L(-10, -7, -10, -11),
    L(-7, -19, 5, -7), L(5, -7, 1, -7), L(5, -7, 5, -11)],
  params: [
    { key: "r10", label: "Widerstand bei 10 Lux", unit: "Ω", type: "number", def: 10000 },
    { key: "gamma", label: "Gamma", type: "number", def: 0.7 },
    { key: "lux", label: "Beleuchtungsstärke", unit: "lx", type: "number", def: 100 },
  ],
  toDevices: (i, n) => {
    const r10 = Math.max(num(i, "r10", 10000), 1e-9);
    const r = Math.min(Math.max(r10 * Math.pow(10 / Math.max(num(i, "lux", 100), 1e-3), num(i, "gamma", 0.7)), 1), 1e8);
    return [{ id: i.id, type: "R", nodes: n, params: { r } }];
  },
});

add({
  id: "potentiometer",
  name: "Potentiometer",
  ref: "RV",
  category: "Passive Bauteile/Widerstände",
  tags: ["poti", "potentiometer", "trimmer", "variabel"],
  mount: "THT",
  interactive: "pot",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "W", x: 0, y: -30 }, { name: "B", x: 30, y: 0 }],
  symbol: [...resSymbol, L(0, -30, 0, -14), L(-5, -14, 5, -14, 0, -9, -5, -14)],
  params: [
    { key: "r", label: "Gesamtwiderstand", unit: "Ω", type: "number", def: 10000 },
    { key: "pos", label: "Schleiferposition", type: "number", def: 0.5, min: 0.01, max: 0.99, step: 0.01 },
    { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
    { key: "taper", label: "Kennlinie", type: "select", def: "lin", options: [{ value: "lin", label: "linear" }, { value: "log", label: "logarithmisch" }] },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "POT", nodes: n, params: { r: num(i, "r", 10000), pos: num(i, "pos", 0.5) } }],
});

add({
  id: "capacitor",
  name: "Kondensator",
  ref: "C",
  category: "Passive Bauteile/Kondensatoren",
  tags: ["c", "kondensator", "capacitor", "keramik"],
  mount: "both",
  footprint: "0805 / RM5",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: capSymbol,
  params: [
    { key: "c", label: "Kapazität", unit: "F", type: "number", def: 1e-7 },
    { key: "vmax", label: "Spannungsfestigkeit", unit: "V", type: "number", def: 50 },
    { key: "esr", label: "ESR", unit: "Ω", type: "number", def: 0.01 },
    P.tol,
  ],
  toDevices: (i, n) => [{ id: i.id, type: "C", nodes: n, params: { c: num(i, "c", 1e-7), tol: num(i, "tol", 5) } }],
});

add({
  id: "capacitor_elko",
  name: "Elko (polarisiert)",
  ref: "C",
  category: "Passive Bauteile/Kondensatoren",
  tags: ["elko", "elektrolyt", "polarisiert"],
  mount: "THT",
  pins: [{ name: "+", x: -30, y: 0 }, { name: "-", x: 30, y: 0 }],
  symbol: [L(-30, 0, -5, 0), L(-5, -13, -5, 13), { t: "arc", x: 17, y: 0, r: 13, a0: Math.PI * 0.6, a1: Math.PI * 1.4 }, L(5, 0, 30, 0), TXT(-14, -16, "+", 10)],
  params: [
    { key: "c", label: "Kapazität", unit: "F", type: "number", def: 1e-4 },
    { key: "vmax", label: "Spannungsfestigkeit", unit: "V", type: "number", def: 25 },
    { key: "esr", label: "ESR", unit: "Ω", type: "number", def: 0.2 },
    P.tol,
  ],
  toDevices: (i, n) => [{ id: i.id, type: "C", nodes: n, params: { c: num(i, "c", 1e-4), tol: num(i, "tol", 20) } }],
});

add({
  id: "inductor",
  name: "Spule",
  ref: "L",
  category: "Passive Bauteile/Induktivitäten",
  tags: ["l", "spule", "inductor", "drossel"],
  mount: "both",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: indSymbol,
  params: [
    { key: "l", label: "Induktivität", unit: "H", type: "number", def: 1e-3 },
    { key: "rser", label: "Serienwiderstand", unit: "Ω", type: "number", def: 0.1 },
    P.tol,
  ],
  toDevices: (i, n) => [{ id: i.id, type: "L", nodes: n, params: { l: num(i, "l", 1e-3), rser: num(i, "rser", 0.1), tol: num(i, "tol", 10) } }],
});

add({
  id: "transformer",
  name: "Transformator",
  ref: "T",
  category: "Passive Bauteile/Induktivitäten",
  tags: ["trafo", "transformator", "kopplung"],
  mount: "THT",
  pins: [
    { name: "P1", x: -40, y: -20 }, { name: "P2", x: -40, y: 20 },
    { name: "S1", x: 40, y: -20 }, { name: "S2", x: 40, y: 20 },
  ],
  symbol: [
    L(-40, -20, -20, -20), L(-40, 20, -20, 20), L(-20, -20, -20, 20),
    L(40, -20, 20, -20), L(40, 20, 20, 20), L(20, -20, 20, 20),
    L(-4, -26, -4, 26), L(4, -26, 4, 26),
  ],
  params: [
    { key: "ratio", label: "Übersetzung n1:n2", type: "number", def: 10 },
    { key: "lp", label: "Primärinduktivität", unit: "H", type: "number", def: 10 },
    { key: "k", label: "Kopplungsfaktor", type: "number", def: 0.995, min: 0, max: 1, step: 0.001 },
    { key: "rp", label: "Wicklungswiderstand primär", unit: "Ω", type: "number", def: 0 },
    { key: "rs", label: "Wicklungswiderstand sekundär", unit: "Ω", type: "number", def: 0 },
    { key: "rcore", label: "Kernverlustwiderstand (0=aus)", unit: "Ω", type: "number", def: 0 },
    { key: "isat", label: "Sättigungsstrom (0=aus)", unit: "A", type: "number", def: 0 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "TRANSFORMER", nodes: n, params: { ratio: num(i, "ratio", 10), lp: num(i, "lp", 10), k: num(i, "k", 0.995), rp: num(i, "rp", 0), rs: num(i, "rs", 0), rcore: num(i, "rcore", 0), isat: num(i, "isat", 0) } }],
});

add({
  id: "tline",
  name: "Übertragungsleitung",
  ref: "T",
  category: "Passive Bauteile/Leitungen",
  tags: ["leitung", "koax", "transmission", "tline", "welle"],
  mount: "virtual",
  pins: [
    { name: "IN+", x: -40, y: -20 }, { name: "IN-", x: -40, y: 20 },
    { name: "OUT+", x: 40, y: -20 }, { name: "OUT-", x: 40, y: 20 },
  ],
  symbol: [
    L(-40, -20, -12, -20), L(-40, 20, -12, 20), L(12, -20, 40, -20), L(12, 20, 40, 20),
    L(-12, -20, -12, 20), L(12, -20, 12, 20), L(-12, -8, 12, -8), L(-12, 8, 12, 8),
  ],
  params: [
    { key: "z0", label: "Wellenwiderstand", unit: "Ω", type: "number", def: 50 },
    { key: "td", label: "Laufzeit (0 = aus Länge)", unit: "s", type: "number", def: 0 },
    { key: "len", label: "Länge", unit: "m", type: "number", def: 1 },
    { key: "vf", label: "Verkürzungsfaktor", type: "number", def: 0.66 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "TLINE", nodes: n, params: { z0: num(i, "z0", 50), td: num(i, "td", 0), len: num(i, "len", 1), vf: num(i, "vf", 0.66) } }],
});

add({
  id: "crystal",
  name: "Quarz",
  ref: "X",
  category: "Passive Bauteile/Resonatoren",
  tags: ["quarz", "crystal", "oszillator"],
  mount: "THT",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30, 0, -12, 0), L(-12, -12, -12, 12), RECT(-6, -14, 12, 28), L(12, -12, 12, 12), L(12, 0, 30, 0)],
  params: [
    { key: "freq", label: "Resonanzfrequenz", unit: "Hz", type: "number", def: 16e6 },
    { key: "q", label: "Güte", type: "number", def: 20000 },
  ],
  toDevices: (i, n): Device[] => {
    const f = num(i, "freq", 16e6);
    const cs = 1e-14;
    const l = 1 / (cs * (2 * Math.PI * f) ** 2);
    return [
      { id: i.id + "_L", type: "L", nodes: [n[0], i.id + "_int"], params: { l, rser: (2 * Math.PI * f * l) / num(i, "q", 20000) } },
      { id: i.id + "_C", type: "C", nodes: [i.id + "_int", n[1]], params: { c: cs } },
      { id: i.id + "_Cp", type: "C", nodes: [n[0], n[1]], params: { c: 5e-12 } },
    ];
  },
});

add({
  id: "fuse",
  name: "Sicherung",
  ref: "F",
  category: "Elektromechanik/Schutz",
  tags: ["sicherung", "fuse", "schutz"],
  mount: "THT",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30, 0, -18, 0), RECT(-18, -8, 36, 16, 3), L(-18, 0, 18, 0), L(18, 0, 30, 0)],
  params: [
    { key: "irated", label: "Nennstrom", unit: "A", type: "number", def: 1 },
    { key: "r", label: "Innenwiderstand", unit: "Ω", type: "number", def: 0.05 },
    { key: "i2t", label: "Schmelzintegral I²t (0=auto)", unit: "A²s", type: "number", def: 0 },
    { key: "tau", label: "Thermische Zeitkonstante", unit: "s", type: "number", def: 1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "FUSE", nodes: n, params: { r: num(i, "r", 0.05), irated: num(i, "irated", 1), i2t: num(i, "i2t", 0), tau: num(i, "tau", 1) } }],
});

/* ---------------- Sources ---------------- */
add({
  id: "gnd",
  name: "Masse (GND)",
  ref: "GND",
  category: "Stromversorgung/Bezugspotenziale",
  tags: ["masse", "gnd", "ground", "bezug"],
  mount: "virtual",
  pins: [{ name: "1", x: 0, y: -14, electrical: "power_out" }],
  symbol: gndSymbol,
  params: [],
  toDevices: () => [],
});

add({
  id: "vcc",
  name: "Versorgungsschiene VCC",
  ref: "VCC",
  category: "Stromversorgung/Bezugspotenziale",
  tags: ["vcc", "rail", "versorgung"],
  mount: "virtual",
  pins: [{ name: "1", x: 0, y: 14, electrical: "power_out" }],
  symbol: [L(0, 14, 0, -4), L(-12, -4, 12, -4), TXT(0, -12, "VCC", 9)],
  params: [{ key: "dc", label: "Spannung", unit: "V", type: "number", def: 5 }],
  toDevices: (i, n) => [{ id: i.id, type: "V", nodes: [n[0], "0"], params: {}, source: { kind: "dc", dc: num(i, "dc", 5) } }],
});

add({
  id: "vdc",
  name: "DC-Spannungsquelle",
  ref: "V",
  category: "Quellen/Unabhängig",
  tags: ["dc", "batterie", "spannungsquelle"],
  mount: "virtual",
  pins: [{ name: "+", electrical: "power_out", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
  symbol: [CIR(0, 0, 20), L(0, -30, 0, -20), L(0, 20, 0, 30), L(-8, -7, 8, -7), L(0, -15, 0, 1), L(-6, 8, 6, 8)],
  params: [
    { key: "dc", label: "Spannung", unit: "V", type: "number", def: 12 },
    { key: "rser", label: "Innenwiderstand", unit: "Ω", type: "number", def: 0.001 },
    { key: "acMag", label: "AC Magnitude", unit: "V", type: "number", def: 0, group: "AC-Analyse" },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "V", nodes: n, params: { rser: num(i, "rser", 0.001) }, source: { kind: "dc", dc: num(i, "dc", 12), acMag: num(i, "acMag", 0) } }],
});

add({
  id: "idc",
  name: "DC-Stromquelle",
  ref: "I",
  category: "Quellen/Unabhängig",
  tags: ["dc", "stromquelle"],
  mount: "virtual",
  pins: [{ name: "+", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
  symbol: [CIR(0, 0, 20), L(0, -30, 0, -20), L(0, 20, 0, 30), L(0, -12, 0, 12), L(-5, 5, 0, 12, 5, 5)],
  params: [
    { key: "dc", label: "Strom", unit: "A", type: "number", def: 0.001 },
    { key: "acMag", label: "AC Magnitude", unit: "A", type: "number", def: 0, group: "AC-Analyse" },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "I", nodes: n, params: {}, source: { kind: "dc", dc: num(i, "dc", 0.001), acMag: num(i, "acMag", 0) } }],
});

add({
  id: "vac",
  name: "AC-Quelle / Signalgenerator",
  ref: "V",
  category: "Quellen/Unabhängig",
  tags: ["ac", "sinus", "signal", "generator"],
  mount: "virtual",
  interactive: "generator",
  pins: [{ name: "+", electrical: "output", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
  symbol: [CIR(0, 0, 20), L(0, -30, 0, -20), L(0, 20, 0, 30), { t: "arc", x: -5, y: 0, r: 5, a0: Math.PI, a1: 0 }, { t: "arc", x: 5, y: 0, r: 5, a0: 0, a1: Math.PI }],
  params: waveParams,
  toDevices: (i, n) => [{ id: i.id, type: "V", nodes: n, params: { rser: 0.001 }, source: sourceFromParams(i) }],
});

// W18: FG-2500 (SimTech) – ersetzt das alte XFG-Bauteil. Platzierung/Nutzung
// wie das Oszilloskop: Symbol auf den Plan, Pins verdrahten (OUT1/OUT2 gegen
// COM, SYNC = 0–5 V TTL des aktiven Kanals), Doppelklick öffnet das Gerät.
// Der Gerätezustand (GenState) lebt als JSON in params.fgstate; die 50 Ω
// Ausgangsimpedanz bildet das Device (rser), die Spannungsquellen liefern die
// offene Thévenin-Spannung (PORTING.md Weg B – Last nie doppelt anwenden).
function fgStateOf(inst: PartInstanceLike): GenState {
  const raw = inst.params?.fgstate;
  if (typeof raw === "string" && raw) {
    try {
      const v = JSON.parse(raw) as GenState;
      if (v && Array.isArray(v.ch) && v.ch.length === 2 && v.sys && v.ui) return v;
    } catch {
      /* Fallback auf Werkseinstellung */
    }
  }
  return initialState();
}

add({
  id: "funcgen",
  name: "Funktionsgenerator (XFG)",
  ref: "XFG",
  category: "Quellen/Instrumente",
  tags: ["funktionsgenerator", "xfg", "instrument", "fg-2500", "awg", "signal"],
  mount: "virtual",
  pins: [
    { name: "OUT1", x: -40, y: -20, electrical: "output" },
    { name: "OUT2", x: -40, y: 20, electrical: "output" },
    { name: "COM", x: 0, y: 40 },
    { name: "SYNC", x: 40, y: 0, electrical: "output" },
  ],
  symbol: [
    RECT(-30, -30, 60, 60, 3),
    RECT(-20, -22, 40, 24, 2),
    L(-16, -10, -12, -18, -8, -10, -4, -18, 0, -10, 4, -18, 8, -10, 12, -10),
    TXT(0, 12, "XFG", 10),
    TXT(0, 23, "2 CH", 7),
    L(-40, -20, -30, -20),
    L(-40, 20, -30, 20),
    L(0, 30, 0, 40),
    L(30, 0, 40, 0),
  ],
  params: [],
  toDevices: (i, n) => {
    const st = fgStateOf(i);
    return [
      { id: i.id + "_o1", type: "V", nodes: [n[0], n[2]], params: { rser: 50 }, source: { kind: "fg", fg: { state: st, idx: 0 } } },
      { id: i.id + "_o2", type: "V", nodes: [n[1], n[2]], params: { rser: 50 }, source: { kind: "fg", fg: { state: st, idx: 1 } } },
      { id: i.id + "_sy", type: "V", nodes: [n[3], n[2]], params: { rser: 50 }, source: { kind: "fgsync", fg: { state: st, idx: st.active } } },
    ];
  },
});

// W29: Das Oszilloskop ist ein Schaltsymbol auf dem Plan – Messleitungen
// werden direkt an CH1…CH4/GND verdrahtet, Doppelklick öffnet das Fenster.
// Rein virtuell: erzeugt keine SPICE-Devices, misst über die Netznamen.
add({
  id: "oscilloscope",
  name: "Oszilloskop (XSC)",
  ref: "XSC",
  category: "Quellen/Instrumente",
  tags: ["oszilloskop", "oszi", "scope", "xsc", "instrument", "messung"],
  mount: "virtual",
  pins: [
    { name: "CH1", x: -40, y: -30 },
    { name: "CH2", x: -40, y: -10 },
    { name: "CH3", x: -40, y: 10 },
    { name: "CH4", x: -40, y: 30 },
    { name: "GND", x: 0, y: 40 },
  ],
  symbol: [
    RECT(-30, -36, 60, 72, 3),
    // Bildschirm mit Trace-Glyphe
    RECT(-20, -28, 40, 36, 2),
    L(-16, -6, -10, -6, -6, -18, -2, -6, 4, -14, 8, -6, 16, -6),
    TXT(0, 20, "4 CH", 8),
    // Anschluss-Stutzen (enden exakt auf den Pins)
    L(-40, -30, -30, -30),
    L(-40, -10, -30, -10),
    L(-40, 10, -30, 10),
    L(-40, 30, -30, 30),
    L(0, 36, 0, 40),
  ],
  params: [],
  toDevices: () => [],
});

add({
  id: "vpulse",
  name: "Pulsquelle",
  ref: "V",
  category: "Quellen/Unabhängig",
  tags: ["puls", "clock", "takt"],
  mount: "virtual",
  pins: [{ name: "+", electrical: "output", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
  symbol: [CIR(0, 0, 20), L(0, -30, 0, -20), L(0, 20, 0, 30), L(-12, 6, -4, 6, -4, -6, 4, -6, 4, 6, 12, 6)],
  params: [
    { key: "offset", label: "V1 (low)", unit: "V", type: "number", def: 0 },
    { key: "amplitude", label: "V2 (high)", unit: "V", type: "number", def: 5 },
    { key: "freq", label: "Frequenz", unit: "Hz", type: "number", def: 1000 },
    { key: "duty", label: "Tastgrad", unit: "%", type: "number", def: 50 },
    { key: "rise", label: "Anstiegszeit", unit: "s", type: "number", def: 1e-9 },
    { key: "fall", label: "Abfallzeit", unit: "s", type: "number", def: 1e-9 },
    { key: "delay", label: "Verzögerung", unit: "s", type: "number", def: 0 },
  ],
  toDevices: (i, n) => {
    const f = Math.max(num(i, "freq", 1000), 1e-9);
    return [{
      id: i.id, type: "V", nodes: n, params: {},
      source: {
        kind: "pulse", offset: num(i, "offset", 0), amplitude: num(i, "amplitude", 5), period: 1 / f,
        width: num(i, "duty", 50) / 100 / f, rise: num(i, "rise", 1e-9), fall: num(i, "fall", 1e-9), delay: num(i, "delay", 0), acMag: 1,
      },
    }];
  },
});

const depSources: Array<[string, string, string, string]> = [
  ["vcvs", "Spannungsgesteuerte Spannungsquelle (E)", "E", "gain"],
  ["vccs", "Spannungsgesteuerte Stromquelle (G)", "G", "gain"],
  ["ccvs", "Stromgesteuerte Spannungsquelle (H)", "H", "gain"],
  ["cccs", "Stromgesteuerte Stromquelle (F)", "F", "gain"],
];
for (const [id, name, type] of depSources) {
  add({
    id,
    name,
    ref: type,
    category: "Quellen/Abhängige Quellen",
    tags: ["abhängig", "gesteuert", type.toLowerCase()],
    mount: "virtual",
    pins: [
      { name: "OUT+", x: 40, y: -20 }, { name: "OUT-", x: 40, y: 20 },
      { name: "CTRL+", x: -40, y: -20 }, { name: "CTRL-", x: -40, y: 20 },
    ],
    symbol: [L(-40, -20, -20, -20), L(-40, 20, -20, 20), L(-20, -20, -20, 20), L(20, 0, 40, -20), L(20, 0, 40, 20), { t: "line", pts: [0, -22, 22, 0, 0, 22, -22, 0, 0, -22] }, TXT(0, 4, type, 11)],
    params: [{ key: "gain", label: type === "G" ? "Steilheit" : type === "H" ? "Transimpedanz" : "Verstärkung", type: "number", def: type === "G" ? 0.001 : 10 }],
    toDevices: (i, n) => [{ id: i.id, type, nodes: n, params: { gain: num(i, "gain", 10) } }],
  });
}

/* ---------------- Diodes ---------------- */
const diodeModels: Array<{ id: string; name: string; is: number; n: number; bv: number; type: string; tags: string[] }> = [
  { id: "diode_1n4148", name: "1N4148 Kleinsignaldiode", is: 2.52e-9, n: 1.75, bv: 100, type: "D", tags: ["1n4148", "kleinsignal"] },
  { id: "diode_1n4007", name: "1N4007 Gleichrichter", is: 7.02e-9, n: 1.8, bv: 1000, type: "D", tags: ["1n4007", "gleichrichter"] },
  { id: "diode_1n5819", name: "1N5819 Schottky", is: 3.1e-6, n: 1.05, bv: 40, type: "SCHOTTKY", tags: ["schottky", "1n5819"] },
  { id: "diode_zener", name: "Z-Diode (BZX)", is: 1e-14, n: 1, bv: 5.1, type: "ZENER", tags: ["zener", "z-diode", "referenz"] },
];
for (const dm of diodeModels) {
  add({
    id: dm.id,
    name: dm.name,
    ref: "D",
    category: "Halbleiter/Dioden",
    tags: ["diode", ...dm.tags],
    mount: "both",
    footprint: "DO-35 / SOD-123",
    pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
    symbol: dm.type === "ZENER"
      ? [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)]
      : dm.type === "SCHOTTKY"
        ? [...diodeSymbol, L(10, -10, 4, -10, 4, -6), L(10, 10, 16, 10, 16, 6)]
        : diodeSymbol,
    params: [
      { key: "is", label: "Sättigungsstrom IS", unit: "A", type: "number", def: dm.is },
      { key: "n", label: "Emissionskoeffizient N", type: "number", def: dm.n },
      { key: "bv", label: "Durchbruchspannung BV", unit: "V", type: "number", def: dm.bv },
      { key: "rs", label: "Bahnwiderstand RS", unit: "Ω", type: "number", def: 0.1 },
      { key: "cjo", label: "Sperrschichtkapazität", unit: "F", type: "number", def: 4e-12 },
      { key: "mj", label: "Gradingkoeffizient MJ", type: "number", def: 0.5 },
      { key: "vj", label: "Diffusionsspannung VJ", unit: "V", type: "number", def: 1 },
      { key: "fc", label: "Depletion-Grenze FC", type: "number", def: 0.5 },
      { key: "tt", label: "Transitzeit TT", unit: "s", type: "number", def: 0 },
      { key: "xti", label: "IS-Temperaturkoeffizient XTI", type: "number", def: 3 },
      { key: "eg", label: "Bandabstand EG", unit: "eV", type: "number", def: 1.11 },
      { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
      P.tol,
    ],
    spice: `.model ${dm.id.toUpperCase()} D(IS=${dm.is} N=${dm.n} BV=${dm.bv} RS=0.1 CJO=4p MJ=0.5 VJ=1 FC=0.5 XTI=3 EG=1.11)`,
    toDevices: (i, n) => [{ id: i.id, type: dm.type, nodes: n, params: { is: num(i, "is", dm.is), n: num(i, "n", dm.n), bv: num(i, "bv", dm.bv), rs: num(i, "rs", 0.1), cjo: num(i, "cjo", 4e-12), mj: num(i, "mj", 0.5), vj: num(i, "vj", 1), fc: num(i, "fc", 0.5), tt: num(i, "tt", 0), xti: num(i, "xti", 3), eg: num(i, "eg", 1.11), tnom: num(i, "tnom", 27), tol: num(i, "tol", 10) } }],
  });
}

add({
  id: "led",
  name: "LED",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch",
  tags: ["led", "leuchtdiode", "anzeige"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "color", label: "Farbe", type: "select", def: "red", options: [
      { value: "red", label: "Rot (1,8 V)" }, { value: "green", label: "Grün (2,1 V)" },
      { value: "blue", label: "Blau (3,0 V)" }, { value: "yellow", label: "Gelb (2,0 V)" }, { value: "white", label: "Weiß (3,2 V)" }] },
    { key: "vf", label: "Flussspannung", unit: "V", type: "number", def: 1.8 },
    { key: "imax", label: "Nennstrom", unit: "A", type: "number", def: 0.02 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 1.8);
    const nEm = 2.2;
    const vt = 0.02585;
    const is = 0.02 / Math.exp(vf / (nEm * vt));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: nEm, rs: 6, bv: 5, cjo: 15e-12 } }];
  },
});

add({
  id: "bridge",
  name: "Brückengleichrichter",
  ref: "BR",
  category: "Halbleiter/Dioden",
  tags: ["brücke", "gleichrichter", "b250"],
  mount: "THT",
  pins: [{ name: "AC1", x: -40, y: 0 }, { name: "AC2", x: 40, y: 0 }, { name: "+", x: 0, y: -40 }, { name: "-", x: 0, y: 40 }],
  symbol: [{ t: "line", pts: [0, -40, 40, 0, 0, 40, -40, 0, 0, -40] }, TXT(0, 4, "~ =", 11)],
  params: [{ key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 }],
  toDevices: (i, n) => {
    const pr = { is: num(i, "is", 7e-9), n: 1.8, rs: 0.1, bv: 600, cjo: 2e-11 };
    return [
      { id: i.id + "_D1", type: "D", nodes: [n[0], n[2]], params: pr },
      { id: i.id + "_D2", type: "D", nodes: [n[1], n[2]], params: pr },
      { id: i.id + "_D3", type: "D", nodes: [n[3], n[0]], params: pr },
      { id: i.id + "_D4", type: "D", nodes: [n[3], n[1]], params: pr },
    ];
  },
});

/* ---------------- Transistors ---------------- */
const bjts: Array<{ id: string; name: string; pnp: boolean; bf: number; is: number }> = [
  { id: "npn_2n3904", name: "2N3904 NPN", pnp: false, bf: 300, is: 6.7e-15 },
  { id: "npn_bc547", name: "BC547 NPN", pnp: false, bf: 330, is: 1.8e-14 },
  { id: "pnp_2n3906", name: "2N3906 PNP", pnp: true, bf: 200, is: 1.4e-14 },
  { id: "pnp_bc557", name: "BC557 PNP", pnp: true, bf: 250, is: 1.2e-14 },
  { id: "npn_bd139", name: "BD139 NPN Leistung", pnp: false, bf: 100, is: 1e-13 },
];
for (const b of bjts) {
  add({
    id: b.id,
    name: b.name,
    ref: "Q",
    category: "Halbleiter/Transistoren/Bipolar",
    tags: ["bjt", "transistor", b.pnp ? "pnp" : "npn", b.id],
    mount: "both",
    footprint: "TO-92 / SOT-23",
    pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
    symbol: bjtSymbol(b.pnp),
    params: [
      { key: "bf", label: "Stromverstärkung BF", type: "number", def: b.bf },
      { key: "is", label: "IS", unit: "A", type: "number", def: b.is },
      { key: "vaf", label: "Early-Spannung VAF", unit: "V", type: "number", def: 100 },
      { key: "br", label: "Inverse Verstärkung BR", type: "number", def: 4 },
      { key: "cje", label: "CJE", unit: "F", type: "number", def: 4.5e-12 },
      { key: "cjc", label: "CJC", unit: "F", type: "number", def: 3.6e-12 },
      { key: "mje", label: "Grading MJE", type: "number", def: 0.33 },
      { key: "vje", label: "Diffusionsspannung VJE", unit: "V", type: "number", def: 0.75 },
      { key: "mjc", label: "Grading MJC", type: "number", def: 0.5 },
      { key: "vjc", label: "Diffusionsspannung VJC", unit: "V", type: "number", def: 0.75 },
      { key: "fc", label: "Depletion-Grenze FC", type: "number", def: 0.5 },
      { key: "tf", label: "Transitzeit TF", unit: "s", type: "number", def: 0 },
      { key: "tr", label: "Transitzeit TR", unit: "s", type: "number", def: 0 },
      { key: "xti", label: "IS-Temperaturkoeffizient XTI", type: "number", def: 3 },
      { key: "eg", label: "Bandabstand EG", unit: "eV", type: "number", def: 1.11 },
      { key: "xtb", label: "BF-Temperaturkoeffizient XTB", type: "number", def: 1.5 },
      { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
      P.tol,
    ],
    spice: `.model ${b.id.toUpperCase()} ${b.pnp ? "PNP" : "NPN"}(IS=${b.is} BF=${b.bf} VAF=100 CJE=4.5p CJC=3.6p MJE=0.33 MJC=0.5 XTI=3 EG=1.11 XTB=1.5)`,
    toDevices: (i, n) => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i, "bf", b.bf), is: num(i, "is", b.is), vaf: num(i, "vaf", 100), br: num(i, "br", 4), cje: num(i, "cje", 4.5e-12), cjc: num(i, "cjc", 3.6e-12), mje: num(i, "mje", 0.33), vje: num(i, "vje", 0.75), mjc: num(i, "mjc", 0.5), vjc: num(i, "vjc", 0.75), fc: num(i, "fc", 0.5), tf: num(i, "tf", 0), tr: num(i, "tr", 0), xti: num(i, "xti", 3), eg: num(i, "eg", 1.11), xtb: num(i, "xtb", 1.5), tnom: num(i, "tnom", 27), pnp: b.pnp ? 1 : 0, tol: num(i, "tol", 10) } }],
  });
}

const mosfets: Array<{ id: string; name: string; p: boolean; vto: number; kp: number }> = [
  { id: "nmos", name: "N-Kanal MOSFET (allg.)", p: false, vto: 2, kp: 2e-5 },
  { id: "pmos", name: "P-Kanal MOSFET (allg.)", p: true, vto: 2, kp: 1e-5 },
  { id: "nmos_irf540", name: "IRF540 N-MOSFET (Leistung)", p: false, vto: 3.5, kp: 2e-4 },
  { id: "pmos_irf9540", name: "IRF9540 P-MOSFET", p: true, vto: 3.5, kp: 1.2e-4 },
];
for (const m of mosfets) {
  add({
    id: m.id,
    name: m.name,
    ref: "M",
    category: "Halbleiter/Transistoren/MOSFET",
    tags: ["mosfet", m.p ? "p-kanal" : "n-kanal", "fet", m.id],
    mount: "both",
    footprint: "TO-220 / SOT-23",
    pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
    symbol: mosSymbol(m.p),
    params: [
      { key: "vto", label: "Schwellspannung VTO", unit: "V", type: "number", def: m.vto },
      { key: "kp", label: "Transkonduktanz KP", unit: "A/V²", type: "number", def: m.kp },
      { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
      { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
      { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
      { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
      P.tol,
      { key: "w", label: "Kanalweite W", unit: "m", type: "number", def: 1e-3 },
      { key: "l", label: "Kanallänge L", unit: "m", type: "number", def: 1e-5 },
      { key: "lambda", label: "Kanallängenmodulation λ", type: "number", def: 0.02 },
      { key: "cgs", label: "CGS", unit: "F", type: "number", def: 1e-11 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i, "vto", m.vto), kp: num(i, "kp", m.kp), w: num(i, "w", 1e-3), l: num(i, "l", 1e-5), lambda: num(i, "lambda", 0.02), cgs: num(i, "cgs", 1e-11), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: m.p ? 1 : 0 } }],
  });
}

add({
  id: "jfet_2n3819",
  name: "2N3819 N-JFET",
  ref: "J",
  category: "Halbleiter/Transistoren/JFET",
  tags: ["jfet", "fet", "2n3819"],
  mount: "THT",
  pins: [{ name: "D", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 12, y: 30 }],
  symbol: [L(-30, 0, -6, 0), L(-6, -16, -6, 16), L(-6, -12, 12, -12, 12, -30), L(-6, 12, 12, 12, 12, 30), L(-18, -4, -12, 0, -18, 4, -18, -4), CIR(0, 0, 24)],
  params: [
    { key: "vto", label: "Pinch-Off VTO", unit: "V", type: "number", def: -3 },
    { key: "beta", label: "BETA", unit: "A/V²", type: "number", def: 1.3e-3 },
    P.tol,
    { key: "lambda", label: "λ", type: "number", def: 0.01 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i, "vto", -3), beta: num(i, "beta", 1.3e-3), lambda: num(i, "lambda", 0.01), tol: num(i, "tol", 10) } }]
});

add({
  id: "scr",
  name: "Thyristor (SCR)",
  ref: "SCR",
  category: "Halbleiter/Leistungshalbleiter",
  tags: ["thyristor", "scr", "leistung"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }, { name: "G", x: 0, y: 30 }],
  symbol: [...diodeSymbol, L(0, 30, 10, 10)],
  params: [
    { key: "vgt", label: "Zündspannung VGT", unit: "V", type: "number", def: 0.8 },
    { key: "ih", label: "Haltestrom IH", unit: "A", type: "number", def: 0.005 },
    { key: "ron", label: "Durchlasswiderstand", unit: "Ω", type: "number", def: 0.2 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "SCR", nodes: n, params: { vgt: num(i, "vgt", 0.8), ih: num(i, "ih", 0.005), ron: num(i, "ron", 0.2) } }],
});

add({
  id: "triac",
  name: "Triac",
  ref: "TR",
  category: "Halbleiter/Leistungshalbleiter",
  tags: ["triac", "dimmer", "leistung"],
  mount: "THT",
  pins: [{ name: "MT1", x: -30, y: 0 }, { name: "MT2", x: 30, y: 0 }, { name: "G", x: 0, y: 30 }],
  symbol: [L(-30, 0, -10, 0), L(-10, -12, -10, 12, 8, 0, -10, -12), L(10, -12, 10, 12, -8, 0, 10, -12), L(10, 0, 30, 0), L(0, 30, -10, 12)],
  params: [
    { key: "vgt", label: "Zündspannung VGT", unit: "V", type: "number", def: 1 },
    { key: "ih", label: "Haltestrom IH", unit: "A", type: "number", def: 0.01 },
    { key: "ron", label: "Durchlasswiderstand", unit: "Ω", type: "number", def: 0.3 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "TRIAC", nodes: n, params: { vgt: num(i, "vgt", 1), ih: num(i, "ih", 0.01), ron: num(i, "ron", 0.3) } }],
});

/* ---------------- Analog ICs ---------------- */
const opamps: Array<{ id: string; name: string; gain: number; gbw: number; slew: number; units: number; desc: string }> = [
  { id: "opamp_ideal", name: "Idealer OPV", gain: 1e6, gbw: 1e8, slew: 1e9, units: 1, desc: "OPV" },
  { id: "opamp_lm741", name: "LM741", gain: 2e5, gbw: 1e6, slew: 0.5e6, units: 1, desc: "741" },
  { id: "opamp_tl084", name: "TL084 (JFET)", gain: 2e5, gbw: 3e6, slew: 13e6, units: 4, desc: "TL084" },
  { id: "opamp_ne5532", name: "NE5532 (Audio)", gain: 5e4, gbw: 10e6, slew: 9e6, units: 2, desc: "NE5532" },
  { id: "opamp_lm358", name: "LM358 (Single Supply)", gain: 1e5, gbw: 1e6, slew: 0.6e6, units: 2, desc: "LM358" },
];
for (const o of opamps) {
  const multi = o.units > 1;
  const names: string[] = [];
  if (multi) {
    for (let u = 1; u <= o.units; u++) names.push("IN" + u + "+", "IN" + u + "-", "OUT" + u);
    names.push("V+", "V-");
  }
  const mh = Math.max(80, Math.max(o.units * 2 + 2, o.units) * 14 + 30);
  const mpins: PinDef[] = [];
  if (multi) {
    let li = 0, ri = 0;
    for (const nm of names) {
      if (nm[0] === "O") { mpins.push({ name: nm, x: 60, y: -mh / 2 + 22 + ri * 14, electrical: "output" }); ri++; }
      else { mpins.push({ name: nm, x: -60, y: -mh / 2 + 22 + li * 14, electrical: nm[0] === "V" ? "power_in" : "input" }); li++; }
    }
  }
  add({
    id: o.id,
    name: o.name,
    ref: "U",
    category: "Analoge ICs/Operationsverstärker",
    tags: ["opv", "opamp", "verstärker", o.id],
    mount: "both",
    footprint: multi ? "DIP-14 / SOIC-14" : "DIP-8 / SOIC-8",
    pins: multi ? mpins : [
      { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
      { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
    ],
    symbol: multi ? icSymbol(110, mh, o.desc, mpins) : [
      { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
      L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
      TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
    ],
    params: [
      { key: "gain", label: "Leerlaufverstärkung", type: "number", def: o.gain },
      { key: "gbw", label: "Verstärkungs-Bandbreite", unit: "Hz", type: "number", def: o.gbw },
      { key: "slew", label: "Slew-Rate", unit: "V/s", type: "number", def: o.slew },
      { key: "rin", label: "Eingangswiderstand", unit: "Ω", type: "number", def: 2e6 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 75 },
      { key: "vdrop", label: "Aussteuerungsreserve", unit: "V", type: "number", def: 1.2 },
      { key: "vcc", label: "V+ (falls unverbunden)", unit: "V", type: "number", def: 15 },
      { key: "vee", label: "V- (falls unverbunden)", unit: "V", type: "number", def: -15 },
    ],
    toDevices: (i, n): Device[] => {
      const prm = { gain: num(i, "gain", o.gain), gbw: num(i, "gbw", o.gbw), slew: num(i, "slew", o.slew), rin: num(i, "rin", 2e6), rout: num(i, "rout", 75), vdrop: num(i, "vdrop", 1.2), vcc: num(i, "vcc", 15), vee: num(i, "vee", -15) };
      if (!multi) return [{ id: i.id, type: "OPAMP", nodes: [n[0], n[1], n[2], conn(n[3]), conn(n[4])], params: prm }];
      const devs: Device[] = [];
      const sufx = ["A", "B", "C", "D"];
      for (let u = 0; u < o.units; u++)
        devs.push({ id: i.id + ":" + sufx[u], type: "OPAMP", nodes: [n[3 * u], n[3 * u + 1], n[3 * u + 2], conn(n[3 * o.units]), conn(n[3 * o.units + 1])], params: prm });
      return devs;
    },
  });
}

add({
  id: "comparator_lm393",
  name: "LM393 Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator", "lm393", "schmitt"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "GND", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30), TXT(-14, 4, "CMP", 8),
  ],
  params: [
    { key: "gain", label: "Verstärkung", type: "number", def: 2e5 },
    { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 },
    { key: "vcc", label: "V+", unit: "V", type: "number", def: 5 },
    { key: "vee", label: "V-", unit: "V", type: "number", def: 0 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "COMPARATOR", nodes: [n[0], n[1], n[2], conn(n[3]), conn(n[4])], params: { gain: num(i, "gain", 2e5), rout: num(i, "rout", 100), vcc: num(i, "vcc", 5), vee: num(i, "vee", 0), vdrop: 0.6 } }],
});

const pins_ne555: PinDef[] = [
    { name: "GND", x: -40, y: 36, electrical: "power_in" }, { name: "TRIG", x: -40, y: 12, electrical: "input" }, { name: "OUT", x: 40, y: -12, electrical: "output" },
    { name: "RST", x: -40, y: -12, electrical: "input" }, { name: "CTRL", x: 40, y: 36, electrical: "input" }, { name: "THR", x: 40, y: 12, electrical: "input" },
    { name: "DIS", x: -40, y: -36, electrical: "output" }, { name: "VCC", x: 40, y: -36, electrical: "power_in" },
  ];
add({
  id: "ne555",
  name: "NE555 Timer",
  ref: "U",
  category: "Analoge ICs/Timer",
  tags: ["555", "timer", "ne555", "astabil"],
  mount: "both",
  footprint: "DIP-8",
  pins: pins_ne555,
  symbol: icSymbol(70, 96, "555", pins_ne555),
  params: [{ key: "vdd", label: "Versorgungsspannung", unit: "V", type: "number", def: 9 }],
  toDevices: (i, n) => [{ id: i.id, type: "TIMER555", nodes: [n[0], n[1], n[2], conn(n[3]), conn(n[4]), n[5], n[6], n[7]], params: { vdd: num(i, "vdd", 9) } }],
});

const regs: Array<{ id: string; name: string; v: number; drop: number }> = [
  { id: "reg_7805", name: "7805 (+5 V)", v: 5, drop: 2 },
  { id: "reg_7812", name: "7812 (+12 V)", v: 12, drop: 2 },
  { id: "reg_7905", name: "7905 (−5 V)", v: -5, drop: 2 },
  { id: "reg_lm317", name: "LM317 (einstellbar)", v: 1.25, drop: 3 },
];
for (const r of regs) {
  add({
    id: r.id,
    name: r.name,
    ref: "U",
    category: "Stromversorgung/Spannungsregler",
    tags: ["regler", "78xx", "lm317", "versorgung"],
    mount: "THT",
    footprint: "TO-220",
    pins: [{ name: "IN", x: -40, y: 0, electrical: "power_in" }, { name: "OUT", x: 40, y: 0, electrical: "power_out" }, { name: "GND/ADJ", x: 0, y: 30, electrical: "power_in" }],
    symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, r.name.split(" ")[0], 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
    params: [
      { key: "vout", label: "Ausgangsspannung", unit: "V", type: "number", def: r.v },
      { key: "dropout", label: "Dropout", unit: "V", type: "number", def: r.drop },
      { key: "imax", label: "Max. Strom", unit: "A", type: "number", def: 1 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i, "vout", r.v), dropout: num(i, "dropout", r.drop), rout: 0.05 } }],
  });
}

/* ---------------- Digital logic ---------------- */
interface GateSpec { id: string; name: string; model: string; inputs: number; label: string; inv: boolean; tags: string[] }
const gateSpecs: GateSpec[] = [
  { id: "gate_and2", name: "AND (2 Eingänge)", model: "and2", inputs: 2, label: "&", inv: false, tags: ["und", "and", "7408"] },
  { id: "gate_and3", name: "AND (3 Eingänge)", model: "and3", inputs: 3, label: "&", inv: false, tags: ["und", "and", "7411"] },
  { id: "gate_nand2", name: "NAND (2 Eingänge)", model: "nand2", inputs: 2, label: "&", inv: true, tags: ["nand", "7400"] },
  { id: "gate_nand3", name: "NAND (3 Eingänge)", model: "nand3", inputs: 3, label: "&", inv: true, tags: ["nand", "7410"] },
  { id: "gate_or2", name: "OR (2 Eingänge)", model: "or2", inputs: 2, label: "≥1", inv: false, tags: ["oder", "or", "7432"] },
  { id: "gate_nor2", name: "NOR (2 Eingänge)", model: "nor2", inputs: 2, label: "≥1", inv: true, tags: ["nor", "7402"] },
  { id: "gate_xor2", name: "XOR (2 Eingänge)", model: "xor2", inputs: 2, label: "=1", inv: false, tags: ["xor", "7486"] },
  { id: "gate_xnor2", name: "XNOR (2 Eingänge)", model: "xnor2", inputs: 2, label: "=1", inv: true, tags: ["xnor", "74266"] },
  { id: "gate_not", name: "Inverter (NOT)", model: "not", inputs: 1, label: "1", inv: true, tags: ["not", "inverter", "7404", "4069"] },
  { id: "gate_buffer", name: "Buffer", model: "buffer", inputs: 1, label: "1", inv: false, tags: ["buffer", "treiber"] },
  { id: "gate_schmitt", name: "Schmitt-Trigger Inverter", model: "schmitt", inputs: 1, label: "⎍", inv: true, tags: ["schmitt", "40106", "7414"] },
];
for (const g of gateSpecs) {
  const h = Math.max(40, g.inputs * 20 + 20);
  const pins: PinDef[] = [];
  for (let k = 0; k < g.inputs; k++) pins.push({ name: String.fromCharCode(65 + k), x: -40, y: -((g.inputs - 1) * 10) + k * 20, electrical: "input" });
  pins.push({ name: "Y", x: 40, y: 0, electrical: "output" });
  const sym: SymbolPrim[] = [RECT(-26, -h / 2, 52, h, 3), TXT(0, 5, g.label, 12)];
  for (const pin of pins) {
    if (pin.x < 0) sym.push(L(-40, pin.y, -26, pin.y));
    else sym.push(L(g.inv ? 32 : 26, 0, 40, 0));
  }
  if (g.inv) sym.push(CIR(29, 0, 4));
  add({
    id: g.id,
    name: g.name,
    ref: "U",
    category: "Digitale Logik/Gatter",
    tags: ["logik", "gatter", ...g.tags],
    mount: "both",
    footprint: "DIP-14 / SOIC-14",
    pins,
    symbol: sym,
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 },
      { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 },
      { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC (CMOS)" }, { value: "74LS", label: "74LS (TTL)" }, { value: "4000", label: "CD4000" }] },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "GATE", nodes: n, model: g.model, params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 100) } }],
  });
}

interface SeqSpec { id: string; name: string; model: string; pins: string[]; tags: string[] }
const seqSpecs: SeqSpec[] = [
  { id: "ff_d", name: "D-Flip-Flop (7474)", model: "dff", pins: ["D", "CLK", "RST", "SET", "Q", "/Q"], tags: ["flipflop", "7474", "4013"] },
  { id: "ff_jk", name: "JK-Flip-Flop (7476)", model: "jkff", pins: ["J", "K", "CLK", "RST", "Q", "/Q"], tags: ["flipflop", "jk", "7476", "4027"] },
  { id: "ff_t", name: "T-Flip-Flop", model: "tff", pins: ["T", "CLK", "RST", "Q"], tags: ["flipflop", "toggle"] },
  { id: "latch_sr", name: "SR-Latch", model: "srlatch", pins: ["S", "R", "Q", "/Q"], tags: ["latch", "rs"] },
  { id: "counter4", name: "4-Bit Zähler (7493)", model: "counter4", pins: ["CLK", "RST", "EN", "Q0", "Q1", "Q2", "Q3"], tags: ["zähler", "counter", "7493", "4040"] },
  { id: "counter8", name: "8-Bit Zähler", model: "counter8", pins: ["CLK", "RST", "EN", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"], tags: ["zähler", "counter"] },
  { id: "shift8", name: "Schieberegister 8-Bit (74164)", model: "shift8", pins: ["CLK", "DATA", "RST", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"], tags: ["schieberegister", "74164"] },
  { id: "mux4", name: "4:1 Multiplexer (74153)", model: "mux4", pins: ["I0", "I1", "I2", "I3", "S0", "S1", "Y"], tags: ["mux", "multiplexer", "74153", "4051"] },
  { id: "demux4", name: "1:4 Demultiplexer", model: "demux4", pins: ["D", "S0", "S1", "Y0", "Y1", "Y2", "Y3"], tags: ["demux", "74139"] },
  { id: "decoder38", name: "3:8 Dekoder (74138)", model: "decoder38", pins: ["A0", "A1", "A2", "Y0", "Y1", "Y2", "Y3", "Y4", "Y5", "Y6", "Y7"], tags: ["dekoder", "74138"] },
  { id: "bcd7seg", name: "BCD → 7-Segment (4511)", model: "bcd7seg", pins: ["A", "B", "C", "D", "a", "b", "c", "d", "e", "f", "g"], tags: ["bcd", "4511", "7447", "dekoder"] },
  { id: "alu4", name: "4-Bit ALU (74181)", model: "alu4", pins: ["A0", "A1", "A2", "A3", "B0", "B1", "B2", "B3", "OP0", "OP1", "F0", "F1", "F2", "F3", "COUT"], tags: ["alu", "74181", "rechenwerk"] },
  { id: "clockgen", name: "Taktgenerator (digital)", model: "clockgen", pins: ["CLK"], tags: ["takt", "clock", "oszillator"] },
];
for (const s of seqSpecs) {
  const outStart = s.pins.findIndex((p2) => /^(Q|Y|F|a|COUT|CLK)/.test(p2) && !/^(CLK|CLR)$/.test(p2) === true);
  const inputs = s.pins.filter((_, idx) => idx < (outStart < 0 ? s.pins.length : outStart));
  const outputs = s.pins.filter((_, idx) => idx >= (outStart < 0 ? s.pins.length : outStart));
  const rows = Math.max(inputs.length, outputs.length);
  const h = Math.max(60, rows * 16 + 30);
  const w = 96;
  const pins: PinDef[] = [];
  inputs.forEach((pn, i2) => pins.push({ name: pn, x: -w / 2 - 5, y: -h / 2 + 22 + i2 * 16, electrical: s.model === "clockgen" ? "output" : "input" }));
  outputs.forEach((pn, i2) => pins.push({ name: pn, x: w / 2 + 5, y: -h / 2 + 22 + i2 * 16, electrical: "output" }));
  add({
    id: s.id,
    name: s.name,
    ref: "U",
    category: s.id.startsWith("counter") || s.id.startsWith("shift") ? "Digitale Logik/Zähler & Register" : s.id.includes("ff") || s.id.includes("latch") ? "Digitale Logik/Flip-Flops" : "Digitale Logik/Kombinatorik",
    tags: ["logik", "digital", ...s.tags],
    mount: "both",
    pins,
    symbol: icSymbol(w, h, s.name.split(" ")[0], pins),
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 },
      { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 },
      ...(s.model === "clockgen" ? [{ key: "freq", label: "Frequenz", unit: "Hz", type: "number" as const, def: 1000 }] : []),
    ],
    toDevices: (i, n) => [{ id: i.id, type: "DIGITAL", nodes: n, model: s.model, params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 100), freq: num(i, "freq", 1000) } }],
  });
}

/* ---------------- MCU ---------------- */
const mcuPinNames = [
  "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13",
  "A0", "A1", "A2", "A3", "A4", "A5", "VCC", "GND",
];
for (const [mid, mname, tag] of [
  ["mcu_atmega328p", "Arduino UNO / ATmega328P", "arduino"],
  ["mcu_pic16f84", "PIC16F84A", "pic"],
  ["mcu_8051", "8051 / AT89C51", "8051"],
] as const) {
  add({
    id: mid,
    name: mname,
    ref: "MCU",
    category: "Mikrocontroller",
    tags: ["mcu", "mikrocontroller", tag, "cosimulation"],
    mount: "THT",
    interactive: "mcu",
    pins: mcuPinNames.map((pn, i) => ({
      name: pn,
      x: i < 11 ? -70 : 70,
      y: (i < 11 ? i : i - 11) * 18 - 90,
      // S3.4: MCU-Pins sind GPIO (Richtung SW-definiert) — „passiv", kein ERC-Urteil.
      // Nur Versorgung ist power_in; ungenutzte IOs offen zu lassen ist Praxis.
      electrical: pn === "VCC" || pn === "GND" ? "power_in" : "passive",
    })),
    symbol: [
      RECT(-60, -100, 120, 200, 6),
      TXT(0, -80, mname.split(" ")[0], 11),
      TXT(0, -62, "CO-SIM", 8),
      ...mcuPinNames.map((pn, i): SymbolPrim => {
        const y = (i < 11 ? i : i - 11) * 18 - 90;
        return i < 11 ? L(-70, y, -60, y) : L(60, y, 70, y);
      }),
      ...mcuPinNames.map((pn, i): SymbolPrim => {
        const y = (i < 11 ? i : i - 11) * 18 - 90;
        return { t: "text", x: i < 11 ? -55 : 55, y: y + 3, s: pn, size: 7, align: i < 11 ? "left" : "right" };
      }),
    ],
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 },
      { key: "fcpu", label: "Taktfrequenz", unit: "Hz", type: "number", def: 16e6 },
      { key: "rout", label: "Pin-Ausgangswiderstand", unit: "Ω", type: "number", def: 40 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: num(i, "vdd", 5), rout: num(i, "rout", 40) }, text: i.text }],
  });
}

/* ---------------- Indicators / actuators ---------------- */
add({
  id: "lamp",
  name: "Glühlampe",
  ref: "X",
  category: "Anzeigen & Aktoren/Optisch",
  tags: ["lampe", "glühlampe", "licht"],
  mount: "THT",
  interactive: "lamp",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [CIR(0, 0, 16), L(-30, 0, -16, 0), L(16, 0, 30, 0), L(-11, -11, 11, 11), L(-11, 11, 11, -11)],
  params: [
    { key: "v", label: "Nennspannung", unit: "V", type: "number", def: 12 },
    { key: "p", label: "Nennleistung", unit: "W", type: "number", def: 1.2 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "LAMP", nodes: n, params: { v: num(i, "v", 12), p: num(i, "p", 1.2) } }],
});

add({
  id: "buzzer",
  name: "Piezo-Summer",
  ref: "BZ",
  category: "Anzeigen & Aktoren/Akustisch",
  tags: ["summer", "buzzer", "piezo", "ton"],
  mount: "THT",
  interactive: "buzzer",
  pins: [{ name: "+", x: -30, y: 0 }, { name: "-", x: 30, y: 0 }],
  symbol: [CIR(0, 0, 16), L(-30, 0, -16, 0), L(16, 0, 30, 0), { t: "arc", x: 0, y: 0, r: 9, a0: -Math.PI / 2, a1: Math.PI / 2 }],
  params: [
    { key: "r", label: "Impedanz", unit: "Ω", type: "number", def: 100 },
    { key: "vth", label: "Ansprechspannung", unit: "V", type: "number", def: 2 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "R", nodes: n, params: { r: num(i, "r", 100) } }],
});

add({
  id: "motor_dc",
  name: "DC-Motor",
  ref: "M",
  category: "Elektromechanik/Antriebe",
  tags: ["motor", "dc", "antrieb"],
  mount: "THT",
  interactive: "motor",
  pins: [{ name: "+", x: -30, y: 0 }, { name: "-", x: 30, y: 0 }],
  symbol: [CIR(0, 0, 18), L(-30, 0, -18, 0), L(18, 0, 30, 0), TXT(0, 5, "M", 13)],
  params: [
    { key: "r", label: "Wicklungswiderstand", unit: "Ω", type: "number", def: 8 },
    { key: "l", label: "Wicklungsinduktivität", unit: "H", type: "number", def: 0.002 },
    { key: "kv", label: "Drehzahlkonstante", unit: "rpm/V", type: "number", def: 1000 },
  ],
  toDevices: (i, n): Device[] => [
    { id: i.id, type: "R", nodes: [n[0], i.id + "_m"], params: { r: num(i, "r", 8) } },
    { id: i.id + "_L", type: "L", nodes: [i.id + "_m", n[1]], params: { l: num(i, "l", 0.002), rser: 0.01 } },
  ],
});

add({
  id: "relay",
  name: "Relais (SPDT)",
  ref: "K",
  category: "Elektromechanik/Schalter",
  tags: ["relais", "relay", "spdt"],
  mount: "THT",
  interactive: "relay",
  pins: [
    { name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 },
    { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }, { name: "NC", x: 40, y: 0 },
  ],
  // S5.26: echter Wechsler (COM/NO/NC) statt SPST mit SPDT-Etikett; Hebel und
  // gestrichelte Wirkverbindung malt zustandsabhängig das Canvas-Overlay.
  symbol: [RECT(-30, -14, 24, 28, 2), L(-40, -20, -30, -20), L(-40, 20, -30, 20), L(-30, -20, -30, 20), L(10, 20, 40, 20), L(40, -20, 26, -20), L(40, 0, 26, 0), CIR(10, 20, 2.2, true), CIR(26, -20, 2, true), CIR(26, 0, 2, true)],
  params: [
    { key: "rcoil", label: "Spulenwiderstand", unit: "Ω", type: "number", def: 120 },
    { key: "vpull", label: "Anzugsspannung", unit: "V", type: "number", def: 4 },
  ],
  toDevices: (i, n): Device[] => [
    { id: i.id + "_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i, "rcoil", 120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i, "vpull", 4), voff: num(i, "vpull", 4) * 0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id + "_nc", type: "VSWITCH", nodes: [n[2], n[4], n[0], n[1]], params: { von: num(i, "vpull", 4), voff: num(i, "vpull", 4) * 0.5, ron: 0.05, roff: 1e9, invert: 1 } },
  ],
});

add({
  id: "switch_spst",
  name: "Schalter (SPST)",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter", "switch", "spst"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30, 0, -14, 0), L(14, 0, 30, 0), CIR(-14, 0, 2, true), CIR(14, 0, 2, true)], // S5.26: Lagerpunkte statisch im Symbol; nur der Hebel kommt aus dem Overlay
  params: [
    { key: "closed", label: "Geschlossen", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
    { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i, "closed", 0), ron: num(i, "ron", 0.01), roff: 1e9 } }],
});

add({
  id: "pushbutton",
  name: "Taster (Schließer)",
  ref: "SW",
  category: "Elektromechanik/Schalter",
  tags: ["taster", "button", "push"],
  mount: "THT",
  interactive: "button",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30, 0, -14, 0), L(14, 0, 30, 0), CIR(-14, 0, 2, true), CIR(14, 0, 2, true)], // S5.26: T-Platte raus (lag doppelt zum Overlay-Hebel); Betätigungskappe malt das Overlay
  params: [
    { key: "closed", label: "Gedrückt", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
    { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "PUSHBUTTON", nodes: n, params: { closed: num(i, "closed", 0), ron: num(i, "ron", 0.01), roff: 1e9 } }],
});

add({
  id: "sevenseg",
  name: "7-Segment-Anzeige",
  ref: "DS",
  category: "Anzeigen & Aktoren/Optisch",
  tags: ["7-segment", "anzeige", "display"],
  mount: "THT",
  interactive: "sevenseg",
  pins: ["a", "b", "c", "d", "e", "f", "g", "COM"].map((pn, i) => ({ name: pn, x: i < 4 ? -50 : 50, y: (i % 4) * 20 - 30, electrical: pn === "COM" ? "power_in" : "input" })),
  symbol: [
    RECT(-40, -45, 80, 90, 4),
    // W3: Stubs exakt bis zu den Pin-Koordinaten (±50)
    ...[-30, -10, 10, 30].flatMap((y): SymbolPrim[] => [L(-50, y, -40, y), L(40, y, 50, y)]),
    L(-16, -30, 16, -30), L(20, -26, 20, -4), L(20, 4, 20, 26), L(-16, 30, 16, 30), L(-20, 4, -20, 26), L(-20, -26, -20, -4), L(-16, 0, 16, 0),
  ],
  params: [
    { key: "common", label: "Typ", type: "select", def: "cathode", options: [{ value: "cathode", label: "gemeinsame Kathode" }, { value: "anode", label: "gemeinsame Anode" }] },
    { key: "vf", label: "Segment-Flussspannung", unit: "V", type: "number", def: 2 },
  ],
  toDevices: (i, n) => {
    const out: Device[] = [];
    const vf = num(i, "vf", 2);
    const is = 0.02 / Math.exp(vf / (2.2 * 0.02585));
    for (let k = 0; k < 7; k++) {
      const anode = str(i, "common", "cathode") === "cathode" ? n[k] : n[7];
      const cathode = str(i, "common", "cathode") === "cathode" ? n[7] : n[k];
      out.push({ id: `${i.id}_seg${k}`, type: "LED", nodes: [anode, cathode], params: { is, n: 2.2, rs: 20, bv: 5, cjo: 1e-12 } });
    }
    return out;
  },
});

/**
 * S5.13: 14-Segment-Zeichensatz (Hex 0–F). Reihenfolge: a b c d e f g1 g2
 * h i j k l m (DP separat, Bit 4 des Steuerwerts). Wie sevenseg: Steuerwert
 * 0–15 aus engine.controls[Label] (Fallbacks im Renderer).
 */
export const FOURTEENSEG_FONT: number[][] = [
  [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], // 0
  [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0], // 2
  [1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0], // 3
  [0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0], // 4
  [1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0], // 5
  [1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // 6
  [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // 8
  [1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0], // 9
  [1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // A
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // b
  [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], // C
  [0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0], // d
  [1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // E
  [1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // F
];

/**
 * S5.13: ASCII-Zeichensatz (Code → 14 Bits). Abdeckung: Leerzeichen, `-`,
 * Ziffern, Großbuchstaben — Kleinbuchstaben mappt der Renderer auf Groß.
 */
export const FOURTEENSEG_ASCII: Record<number, number[]> = {
  32: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // space
  45: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0], // -
  48: FOURTEENSEG_FONT[0], // 0
  49: FOURTEENSEG_FONT[1], // 1
  50: FOURTEENSEG_FONT[2], // 2
  51: FOURTEENSEG_FONT[3], // 3
  52: FOURTEENSEG_FONT[4], // 4
  53: FOURTEENSEG_FONT[5], // 5
  54: FOURTEENSEG_FONT[6], // 6
  55: FOURTEENSEG_FONT[7], // 7
  56: FOURTEENSEG_FONT[8], // 8
  57: FOURTEENSEG_FONT[9], // 9
  65: FOURTEENSEG_FONT[10], // A
  66: [1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0], // B
  67: FOURTEENSEG_FONT[12], // C
  68: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], // D
  69: FOURTEENSEG_FONT[14], // E
  70: FOURTEENSEG_FONT[15], // F
  71: [1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0], // G
  72: [0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // H
  73: [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0], // I
  74: [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // J
  75: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 1], // K
  76: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], // L
  77: [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0], // M
  78: [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1], // N
  79: FOURTEENSEG_FONT[0], // O
  80: [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], // P
  81: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1], // Q
  82: [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1], // R
  83: FOURTEENSEG_FONT[5], // S
  84: [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0], // T
  85: [0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], // U
  86: [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0], // V
  87: [0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 1], // W
  88: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1], // X
  89: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0], // Y
  90: [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0], // Z
};

/** Segment-Endpunkte im Symbol (a b c d e f g1 g2 h i j k l m) für Renderer. */
export const FOURTEENSEG_SEGS: Array<[number, number, number, number]> = [
  [-14, -28, 14, -28], // a
  [16, -26, 16, -2], // b
  [16, 2, 16, 26], // c
  [-14, 28, 14, 28], // d
  [-16, 2, -16, 26], // e
  [-16, -26, -16, -2], // f
  [-14, 0, -1, 0], // g1
  [1, 0, 14, 0], // g2
  [-15, -3, -1, -25], // h
  [0, -25, 0, -3], // i
  [15, -3, 1, -25], // j
  [-15, 3, -1, 25], // k
  [0, 3, 0, 25], // l
  [15, 3, 1, 25], // m
];

add({
  id: "fourteenseg",
  name: "14-Segment-Anzeige",
  ref: "DS",
  category: "Anzeigen & Aktoren/Optisch",
  tags: ["14-segment", "anzeige", "display", "alphanumerisch"],
  mount: "THT",
  interactive: "fourteenseg",
  description: "14 Segmente + Dezimalpunkt, je eine LED gegen COM (Kathode/Anode wählbar). Anzeige: 0–15 Hex (+16 = DP an) oder ASCII-Code 32–90 (+128 = DP an, Klein→Groß).",
  pins: ["a", "b", "c", "d", "e", "f", "g1", "g2", "h", "i", "j", "k", "l", "m", "dp", "COM"].map((pn, i) => ({
    name: pn,
    x: i < 8 ? -50 : 50,
    y: (i % 8) * 20 - 70,
    electrical: pn === "COM" ? "power_in" : "input",
  })),
  symbol: [
    RECT(-40, -85, 80, 170, 4),
    ...[-70, -50, -30, -10, 10, 30, 50, 70].flatMap((y): SymbolPrim[] => [L(-50, y, -40, y), L(40, y, 50, y)]),
    ...FOURTEENSEG_SEGS.map(([x1, y1, x2, y2]): SymbolPrim => L(x1, y1, x2, y2)),
    TXT(-30, -76, "14-SEG", 7),
  ],
  params: [
    { key: "common", label: "Typ", type: "select", def: "cathode", options: [{ value: "cathode", label: "gemeinsame Kathode" }, { value: "anode", label: "gemeinsame Anode" }] },
    { key: "vf", label: "Segment-Flussspannung", unit: "V", type: "number", def: 2 },
  ],
  toDevices: (i, n) => {
    const out: Device[] = [];
    const vf = num(i, "vf", 2);
    const is = 0.02 / Math.exp(vf / (2.2 * 0.02585));
    const cathode = str(i, "common", "cathode") === "cathode";
    for (let k = 0; k < 15; k++) {
      out.push({
        id: `${i.id}_seg${k}`,
        type: "LED",
        nodes: cathode ? [n[k], n[15]] : [n[15], n[k]],
        params: { is, n: 2.2, rs: 20, bv: 5, cjo: 1e-12 },
      });
    }
    return out;
  },
});

/* ---------------- Measurement ---------------- */
add({
  id: "voltmeter",
  name: "Voltmeter",
  ref: "MV",
  category: "Messgeräte/Inline",
  tags: ["voltmeter", "spannung", "messen"],
  mount: "virtual",
  pins: [{ name: "+", x: -30, y: 0, electrical: "input" }, { name: "-", x: 30, y: 0, electrical: "input" }],
  symbol: [CIR(0, 0, 18), L(-30, 0, -18, 0), L(18, 0, 30, 0), TXT(0, 5, "V", 13)],
  params: [{ key: "rin", label: "Innenwiderstand", unit: "Ω", type: "number", def: 1e7 }],
  toDevices: (i, n) => [{ id: i.id, type: "VOLTMETER", nodes: n, params: { rin: num(i, "rin", 1e7) } }],
});

add({
  id: "ammeter",
  name: "Amperemeter",
  ref: "MA",
  category: "Messgeräte/Inline",
  tags: ["amperemeter", "strom", "messen"],
  mount: "virtual",
  pins: [{ name: "+", x: -30, y: 0 }, { name: "-", x: 30, y: 0 }],
  symbol: [CIR(0, 0, 18), L(-30, 0, -18, 0), L(18, 0, 30, 0), TXT(0, 5, "A", 13)],
  params: [],
  toDevices: (i, n) => [{ id: i.id, type: "AMMETER", nodes: n, params: {} }],
});

add({
  id: "probe",
  name: "Messsonde",
  ref: "PR",
  category: "Messgeräte/Inline",
  tags: ["sonde", "probe", "test"],
  mount: "virtual",
  pins: [{ name: "1", x: 0, y: 20, electrical: "input" }],
  symbol: [CIR(0, 0, 10), L(0, 10, 0, 20), TXT(0, 4, "P", 9)],
  params: [],
  toDevices: () => [],
});


/* ---------------- 4000 CMOS series – expanded ---------------- */
const cmosGates: Array<{ id: string; name: string; model: string; inputs: number; inv: boolean; units: number; desc: string }> = [
  { id: "cmos_4001", name: "CD4001 Quad NOR (2 Eingänge)", model: "nor2", inputs: 2, inv: true, units: 4, desc: "4001" },
  { id: "cmos_4011", name: "CD4011 Quad NAND (2 Eingänge)", model: "nand2", inputs: 2, inv: true, units: 4, desc: "4011" },
  { id: "cmos_4012", name: "CD4012 Dual NAND (4 Eingänge)", model: "nand4", inputs: 4, inv: true, units: 2, desc: "4012" },
  { id: "cmos_4023", name: "CD4023 Triple NAND (3 Eingänge)", model: "nand3", inputs: 3, inv: true, units: 3, desc: "4023" },
  { id: "cmos_4002", name: "CD4002 Dual NOR (4 Eingänge)", model: "nor4", inputs: 4, inv: true, units: 2, desc: "4002" },
  { id: "cmos_4025", name: "CD4025 Triple NOR (3 Eingänge)", model: "nor3", inputs: 3, inv: true, units: 3, desc: "4025" },
  { id: "cmos_4071", name: "CD4071 Quad OR (2 Eingänge)", model: "or2", inputs: 2, inv: false, units: 4, desc: "4071" },
  { id: "cmos_4072", name: "CD4072 Dual OR (4 Eingänge)", model: "or4", inputs: 4, inv: false, units: 2, desc: "4072" },
  { id: "cmos_4075", name: "CD4075 Triple OR (3 Eingänge)", model: "or3", inputs: 3, inv: false, units: 3, desc: "4075" },
  { id: "cmos_4081", name: "CD4081 Quad AND (2 Eingänge)", model: "and2", inputs: 2, inv: false, units: 4, desc: "4081" },
  { id: "cmos_4082", name: "CD4082 Dual AND (4 Eingänge)", model: "and4", inputs: 4, inv: false, units: 2, desc: "4082" },
  { id: "cmos_4073", name: "CD4073 Triple AND (3 Eingänge)", model: "and3", inputs: 3, inv: false, units: 3, desc: "4073" },
  { id: "cmos_4069", name: "CD4069 Hex Inverter", model: "not", inputs: 1, inv: true, units: 6, desc: "4069" },
  { id: "cmos_4049", name: "CD4049 Hex Inverter Buffer", model: "not", inputs: 1, inv: true, units: 6, desc: "4049" },
  { id: "cmos_4050", name: "CD4050 Hex Buffer", model: "buffer", inputs: 1, inv: false, units: 6, desc: "4050" },
  { id: "cmos_4070", name: "CD4070 Quad XOR", model: "xor2", inputs: 2, inv: false, units: 4, desc: "4070" },
  { id: "cmos_4077", name: "CD4077 Quad XNOR", model: "xnor2", inputs: 2, inv: true, units: 4, desc: "4077" },
  { id: "cmos_4030", name: "CD4030 Quad XOR (alt)", model: "xor2", inputs: 2, inv: false, units: 4, desc: "4030" },
];

for (const g of cmosGates) {
  const size = g.inputs + 1;
  const names: string[] = [];
  for (let u = 1; u <= g.units; u++) {
    for (let k = 0; k < g.inputs; k++) names.push(String.fromCharCode(65 + k) + u);
    names.push("Y" + u);
  }
  const rows = Math.max(g.units * g.inputs, g.units);
  const h = Math.max(80, rows * 14 + 30);
  const w = 110;
  const pins: PinDef[] = [];
  let yi = 0, yo = 0;
  for (const nm of names) {
    if (nm[0] === "Y") { pins.push({ name: nm, x: w / 2 + 5, y: -h / 2 + 22 + yo * 14 }); yo++; }
    else { pins.push({ name: nm, x: -w / 2 - 5, y: -h / 2 + 22 + yi * 14 }); yi++; }
  }
  add({
    id: g.id,
    name: g.name,
    ref: "U",
    category: "Digitale Logik/4000 CMOS",
    tags: ["cmos", "4000", g.desc.toLowerCase(), "logik", g.model],
    mount: "both",
    footprint: "DIP-14 / SOIC-14",
    pins,
    symbol: icSymbol(w, h, g.desc, pins),
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 },
      { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 },
    ],
    toDevices: (i, n) => {
      const devs: Device[] = [];
      for (let u = 0; u < g.units; u++)
        devs.push({ id: i.id, type: "GATE", nodes: n.slice(u * size, (u + 1) * size), model: g.model, params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } });
      return devs;
    },
  });
}

// 4000 series complex
const cmosComplex: Array<{ id: string; name: string; model: string; pins: string[]; desc: string; tags: string[]; analog?: number }> = [
  { id: "cmos_4017", name: "CD4017 Dekadenzähler", model: "counter10dec", pins: ["CLK", "RST", "INH", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "COUT"], desc: "4017", tags: ["zähler", "4017", "dekade"] },
  { id: "cmos_4020", name: "CD4020 14-Bit Binärzähler", model: "counter4020", pins: ["CLK", "RST", "Q0", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13"], desc: "4020", tags: ["zähler", "4020"] },
  { id: "cmos_4040", name: "CD4040 12-Bit Binärzähler", model: "counter12", pins: ["CLK", "RST", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11"], desc: "4040", tags: ["zähler", "4040"] },
  { id: "cmos_4060", name: "CD4060 14-Bit Zähler + Oszillator", model: "counter4060", pins: ["CLK", "RST", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q11", "Q12", "Q13"], desc: "4060", tags: ["zähler", "4060", "oszillator"] },
  { id: "cmos_4511", name: "CD4511 BCD → 7-Segment", model: "bcd7seglatch", pins: ["A", "B", "C", "D", "LE", "/BI", "/LT", "a", "b", "c", "d", "e", "f", "g"], desc: "4511", tags: ["4511", "bcd", "7seg"] },
  { id: "cmos_4028", name: "CD4028 BCD → Dezimal Decoder", model: "bcddec", pins: ["A", "B", "C", "D", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9"], desc: "4028", tags: ["4028", "decoder"] },
  { id: "cmos_4051", name: "CD4051 8-Kanal Analog-MUX", model: "mux8", pins: ["I0", "I1", "I2", "I3", "I4", "I5", "I6", "I7", "S0", "S1", "S2", "COM"], desc: "4051", tags: ["mux", "4051", "analog"], analog: 1 },
  { id: "cmos_4052", name: "CD4052 Dual 4-Kanal MUX", model: "mux4dual", pins: ["I0A", "I1A", "I2A", "I3A", "I0B", "I1B", "I2B", "I3B", "S0", "S1", "COMA", "COMB", "/EN"], desc: "4052", tags: ["mux", "4052"] },
  { id: "cmos_4053", name: "CD4053 Triple 2-Kanal MUX", model: "mux2triple", pins: ["I0A", "I1A", "I0B", "I1B", "I0C", "I1C", "S0", "S1", "S2", "COMA", "COMB", "COMC", "/EN"], desc: "4053", tags: ["mux", "4053"] },
  { id: "cmos_4066", name: "CD4066 Quad Analog-Schalter", model: "switch4", pins: ["I0", "O0", "C0", "I1", "O1", "C1", "I2", "O2", "C2", "I3", "O3", "C3"], desc: "4066", tags: ["4066", "schalter", "analog"] },
  { id: "cmos_4016", name: "CD4016 Quad Analog-Schalter", model: "switch4", pins: ["I0", "O0", "C0", "I1", "O1", "C1", "I2", "O2", "C2", "I3", "O3", "C3"], desc: "4016", tags: ["4016", "schalter"] },
];

for (const s of cmosComplex) {
  const inputs = s.pins.filter((p) => !/^(Q|COM|a|b|c|d|e|f|g|COUT)/.test(p) || /^(CLK|D|A|B|C|S|EN|LE|BI|LT|I)/.test(p)).slice(0, Math.ceil(s.pins.length/2));
  // simplify: split half inputs half outputs
  const half = Math.ceil(s.pins.length / 2);
  const ins = s.pins.slice(0, half);
  const outs = s.pins.slice(half);
  const rows = Math.max(ins.length, outs.length);
  const h = Math.max(80, rows * 16 + 30);
  const w = 110;
  const pins: PinDef[] = [];
  ins.forEach((pn, i2) => pins.push({ name: pn, x: -w / 2 - 5, y: -h / 2 + 22 + i2 * 16 }));
  outs.forEach((pn, i2) => pins.push({ name: pn, x: w / 2 + 5, y: -h / 2 + 22 + i2 * 16 }));
  add({
    id: s.id,
    name: s.name,
    ref: "U",
    category: "Digitale Logik/4000 CMOS",
    tags: ["cmos", "4000", ...s.tags],
    mount: "both",
    pins,
    symbol: icSymbol(w, h, s.desc, pins),
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 },
      { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "DIGITAL", nodes: n, model: s.model, params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), ...(s.analog ? { analog: 1 } : {}) } }],
  });
}

const pins_cmos_4013: PinDef[] = [{ name: "D1", x: -60, y: -35 }, { name: "CLK1", x: -60, y: -21 }, { name: "/RST1", x: -60, y: -7 }, { name: "/SET1", x: -60, y: 7 }, { name: "Q1", x: -60, y: 21 }, { name: "/Q1", x: -60, y: 35 }, { name: "D2", x: 60, y: -35 }, { name: "CLK2", x: 60, y: -21 }, { name: "/RST2", x: 60, y: -7 }, { name: "/SET2", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "/Q2", x: 60, y: 35 }];
add({
  id: "cmos_4013",
  name: "CD4013 Dual D-Flip-Flop",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos", "4000", "flipflop", "4013"],
  mount: "both",
  pins: pins_cmos_4013,
  symbol: icSymbol(110, 114, "4013", pins_cmos_4013),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "dffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "dffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});

// Additional opamps / comparators
const extraOpamps: Array<{ id: string; name: string; gain: number; gbw: number; slew: number; units: number; desc: string }> = [
  { id: "opamp_lm324", name: "LM324 Quad OPV", gain: 1e5, gbw: 1e6, slew: 0.5e6, units: 4, desc: "LM324" },
  { id: "opamp_tl072", name: "TL072 Dual JFET OPV", gain: 2e5, gbw: 3e6, slew: 13e6, units: 2, desc: "TL072" },
  { id: "opamp_op07", name: "OP07 Präzisions-OPV", gain: 5e5, gbw: 0.6e6, slew: 0.3e6, units: 1, desc: "OP07" },
  // S4.1: Komparatoren bleiben statisch (slew = 0 → kein Slew-Param in der UI).
  { id: "opamp_lm393_dual", name: "LM393 Dual Komparator", gain: 2e5, gbw: 1e6, slew: 0, units: 2, desc: "LM393" },
  { id: "opamp_lm339", name: "LM339 Quad Komparator", gain: 2e5, gbw: 1e6, slew: 0, units: 4, desc: "LM339" },
];

for (const o of extraOpamps) {
  const multi = o.units > 1;
  const isComp = o.id.includes("393") || o.id.includes("339");
  const names: string[] = [];
  if (multi) {
    for (let u = 1; u <= o.units; u++) names.push("IN" + u + "+", "IN" + u + "-", "OUT" + u);
    names.push("V+", "V-");
  }
  const mh = Math.max(80, Math.max(o.units * 2 + 2, o.units) * 14 + 30);
  const mpins: PinDef[] = [];
  if (multi) {
    let li = 0, ri = 0;
    for (const nm of names) {
      if (nm[0] === "O") { mpins.push({ name: nm, x: 60, y: -mh / 2 + 22 + ri * 14, electrical: "output" }); ri++; }
      else { mpins.push({ name: nm, x: -60, y: -mh / 2 + 22 + li * 14, electrical: nm[0] === "V" ? "power_in" : "input" }); li++; }
    }
  }
  add({
    id: o.id,
    name: o.name,
    ref: "U",
    category: isComp ? "Analoge ICs/Komparatoren" : "Analoge ICs/Operationsverstärker",
    tags: ["opv", "opamp", o.id],
    mount: "both",
    footprint: "DIP-14 / SOIC-14",
    pins: multi ? mpins : [
      { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
      { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
    ],
    symbol: multi ? icSymbol(110, mh, o.desc, mpins) : [
      { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] } as SymbolPrim,
      L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
      TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
    ],
    params: [
      { key: "gain", label: "Leerlaufverstärkung", type: "number", def: o.gain },
      { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: o.gbw },
      ...(o.slew > 0 ? [{ key: "slew", label: "Slew-Rate", unit: "V/s", type: "number" as const, def: o.slew }] : []),
      { key: "rin", label: "Eingangswiderstand", unit: "Ω", type: "number", def: 2e6 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 75 },
      { key: "vdrop", label: "Reserve", unit: "V", type: "number", def: 1.2 },
      { key: "vcc", label: "V+", unit: "V", type: "number", def: 15 },
      { key: "vee", label: "V-", unit: "V", type: "number", def: -15 },
    ],
    toDevices: (i, n): Device[] => {
      const prm = { gain: num(i, "gain", o.gain), gbw: num(i, "gbw", o.gbw), slew: num(i, "slew", o.slew), rin: num(i, "rin", 2e6), rout: num(i, "rout", 75), vdrop: num(i, "vdrop", 1.2), vcc: num(i, "vcc", 15), vee: num(i, "vee", -15) };
      const typ: "COMPARATOR" | "OPAMP" = isComp ? "COMPARATOR" : "OPAMP";
      if (!multi) return [{ id: i.id, type: typ, nodes: [n[0], n[1], n[2], conn(n[3]), conn(n[4])], params: prm }];
      const devs: Device[] = [];
      const sufx = ["A", "B", "C", "D"];
      for (let u = 0; u < o.units; u++)
        devs.push({ id: i.id + ":" + sufx[u], type: typ, nodes: [n[3 * u], n[3 * u + 1], n[3 * u + 2], conn(n[3 * o.units]), conn(n[3 * o.units + 1])], params: prm });
      return devs;
    },
  });
}

// Additional transistors – MOSFET small signal
const extraMos: Array<{ id: string; name: string; p: boolean; vto: number; kp: number }> = [
  { id: "nmos_2n7000", name: "2N7000 N-MOSFET", p: false, vto: 2.1, kp: 0.05 },
  { id: "pmos_bs250", name: "BS250 P-MOSFET", p: true, vto: 2.5, kp: 0.02 },
  { id: "nmos_bss138", name: "BSS138 N-MOSFET (Logic Level)", p: false, vto: 1.2, kp: 0.1 },
];

for (const m of extraMos) {
  add({
    id: m.id,
    name: m.name,
    ref: "M",
    category: "Halbleiter/Transistoren/MOSFET",
    tags: ["mosfet", m.p ? "p-kanal" : "n-kanal", m.id],
    mount: "both",
    footprint: "TO-92 / SOT-23",
    pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
    symbol: mosSymbol(m.p),
    params: [
      { key: "vto", label: "VTO", unit: "V", type: "number", def: m.vto },
      { key: "kp", label: "KP", unit: "A/V²", type: "number", def: m.kp },
      { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
      { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
      { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
      { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
      P.tol,
      { key: "w", label: "W", unit: "m", type: "number", def: 1e-3 },
      { key: "l", label: "L", unit: "m", type: "number", def: 1e-5 },
      { key: "lambda", label: "λ", type: "number", def: 0.02 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i, "vto", m.vto), kp: num(i, "kp", m.kp), w: num(i, "w", 1e-3), l: num(i, "l", 1e-5), lambda: num(i, "lambda", 0.02), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: m.p ? 1 : 0 } }],
  });
}

// Additional 74xx – expand with 74HC series
const extra74: Array<{ id: string; name: string; model: string; inputs: number; pins: string[] }> = [
  { id: "ic_74hc00", name: "74HC00 Quad NAND", model: "nand2", inputs: 2, pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
  { id: "ic_74hc04", name: "74HC04 Hex Inverter", model: "not", inputs: 1, pins: ["A1", "Y1", "A2", "Y2", "A3", "Y3", "A4", "Y4", "A5", "Y5", "A6", "Y6"] },
  { id: "ic_74hc08", name: "74HC08 Quad AND", model: "and2", inputs: 2, pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
  { id: "ic_74hc32", name: "74HC32 Quad OR", model: "or2", inputs: 2, pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
  { id: "ic_74hc86", name: "74HC86 Quad XOR", model: "xor2", inputs: 2, pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
];

for (const ic of extra74) {
  const rows = Math.ceil(ic.pins.length / 2);
  const h = Math.max(80, rows * 14 + 30);
  const w = 100;
  const half = Math.ceil(ic.pins.length / 2);
  const ins = ic.pins.slice(0, half);
  const outs = ic.pins.slice(half);
  const pins: PinDef[] = [];
  ins.forEach((pn, i2) => pins.push({ name: pn, x: -w / 2 - 10, y: -h / 2 + 22 + i2 * 14 }));
  outs.forEach((pn, i2) => pins.push({ name: pn, x: w / 2 + 10, y: -h / 2 + 22 + i2 * 14 }));
  add({
    id: ic.id,
    name: ic.name,
    ref: "U",
    category: "Digitale Logik/74xx",
    tags: ["74hc", "ttl", ic.model],
    mount: "both",
    pins,
    symbol: icSymbol(w, h, ic.id.toUpperCase(), pins),
    params: [
      { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
      { key: "vth", label: "VTH", unit: "V", type: "number", def: 2.5 },
      { key: "rout", label: "ROUT", unit: "Ω", type: "number", def: 50 },
    ],
    toDevices: (i, n) => {
      const devs: Device[] = [];
      const size = ic.inputs + 1;
      for (let u = 0; u < ic.pins.length / size; u++)
        devs.push({ id: i.id, type: "DIGITAL", nodes: n.slice(u * size, (u + 1) * size), model: ic.model, params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } });
      return devs;
    },
  });
}



/* ---------------- Complete Multisim Coverage – Auto Generated ---------------- */

add({
  id: "diode_1n4001",
  name: "1N4001 Gleichrichter 50V 1A",
  ref: "D",
  category: "Halbleiter/Dioden/Gleichrichter",
  tags: ["diode", "1n4001", "gleichrichter", "50v"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: diodeSymbol,
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 },
    { key: "n", label: "N", type: "number", def: 1.8 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 50 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 0.1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "D", nodes: n, params: { is: num(i, "is", 7e-9), n: num(i, "n", 1.8), bv: num(i, "bv", 50), rs: num(i, "rs", 0.1) } }],
});


add({
  id: "diode_1n4002",
  name: "1N4002 Gleichrichter 100V 1A",
  ref: "D",
  category: "Halbleiter/Dioden/Gleichrichter",
  tags: ["diode", "1n4002", "gleichrichter", "50v"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: diodeSymbol,
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 },
    { key: "n", label: "N", type: "number", def: 1.8 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 100 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 0.1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "D", nodes: n, params: { is: num(i, "is", 7e-9), n: num(i, "n", 1.8), bv: num(i, "bv", 100), rs: num(i, "rs", 0.1) } }],
});


add({
  id: "diode_1n4003",
  name: "1N4003 Gleichrichter 200V 1A",
  ref: "D",
  category: "Halbleiter/Dioden/Gleichrichter",
  tags: ["diode", "1n4003", "gleichrichter", "50v"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: diodeSymbol,
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 },
    { key: "n", label: "N", type: "number", def: 1.8 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 200 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 0.1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "D", nodes: n, params: { is: num(i, "is", 7e-9), n: num(i, "n", 1.8), bv: num(i, "bv", 200), rs: num(i, "rs", 0.1) } }],
});


add({
  id: "diode_1n4004",
  name: "1N4004 Gleichrichter 400V 1A",
  ref: "D",
  category: "Halbleiter/Dioden/Gleichrichter",
  tags: ["diode", "1n4004", "gleichrichter", "50v"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: diodeSymbol,
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 },
    { key: "n", label: "N", type: "number", def: 1.8 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 400 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 0.1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "D", nodes: n, params: { is: num(i, "is", 7e-9), n: num(i, "n", 1.8), bv: num(i, "bv", 400), rs: num(i, "rs", 0.1) } }],
});


add({
  id: "diode_1n4005",
  name: "1N4005 Gleichrichter 600V 1A",
  ref: "D",
  category: "Halbleiter/Dioden/Gleichrichter",
  tags: ["diode", "1n4005", "gleichrichter", "50v"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: diodeSymbol,
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 },
    { key: "n", label: "N", type: "number", def: 1.8 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 600 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 0.1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "D", nodes: n, params: { is: num(i, "is", 7e-9), n: num(i, "n", 1.8), bv: num(i, "bv", 600), rs: num(i, "rs", 0.1) } }],
});


add({
  id: "diode_1n4006",
  name: "1N4006 Gleichrichter 800V 1A",
  ref: "D",
  category: "Halbleiter/Dioden/Gleichrichter",
  tags: ["diode", "1n4006", "gleichrichter", "50v"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: diodeSymbol,
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 7e-9 },
    { key: "n", label: "N", type: "number", def: 1.8 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 800 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 0.1 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "D", nodes: n, params: { is: num(i, "is", 7e-9), n: num(i, "n", 1.8), bv: num(i, "bv", 800), rs: num(i, "rs", 0.1) } }],
});


add({
  id: "diode_1n5817",
  name: "1N5817 Schottky 20V",
  ref: "D",
  category: "Halbleiter/Dioden/Schottky",
  tags: ["schottky", "1n5817"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -10, 4, -6), L(10, 10, 16, 10, 16, 6)],
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 3e-6 },
    { key: "n", label: "N", type: "number", def: 1.05 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 20 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "SCHOTTKY", nodes: n, params: { is: num(i, "is", 3e-6), n: num(i, "n", 1.05), bv: num(i, "bv", 20) } }],
});


add({
  id: "diode_1n5818",
  name: "1N5818 Schottky 30V",
  ref: "D",
  category: "Halbleiter/Dioden/Schottky",
  tags: ["schottky", "1n5818"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -10, 4, -6), L(10, 10, 16, 10, 16, 6)],
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 3e-6 },
    { key: "n", label: "N", type: "number", def: 1.05 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 30 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "SCHOTTKY", nodes: n, params: { is: num(i, "is", 3e-6), n: num(i, "n", 1.05), bv: num(i, "bv", 30) } }],
});


add({
  id: "diode_1n5820",
  name: "1N5820 Schottky 20V",
  ref: "D",
  category: "Halbleiter/Dioden/Schottky",
  tags: ["schottky", "1n5820"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -10, 4, -6), L(10, 10, 16, 10, 16, 6)],
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 3e-6 },
    { key: "n", label: "N", type: "number", def: 1.05 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 20 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "SCHOTTKY", nodes: n, params: { is: num(i, "is", 3e-6), n: num(i, "n", 1.05), bv: num(i, "bv", 20) } }],
});


add({
  id: "diode_1n5822",
  name: "1N5822 Schottky 40V",
  ref: "D",
  category: "Halbleiter/Dioden/Schottky",
  tags: ["schottky", "1n5822"],
  mount: "THT",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -10, 4, -6), L(10, 10, 16, 10, 16, 6)],
  params: [
    { key: "is", label: "IS", unit: "A", type: "number", def: 3e-6 },
    { key: "n", label: "N", type: "number", def: 1.05 },
    { key: "bv", label: "BV", unit: "V", type: "number", def: 40 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "SCHOTTKY", nodes: n, params: { is: num(i, "is", 3e-6), n: num(i, "n", 1.05), bv: num(i, "bv", 40) } }],
});


add({
  id: "zener_2_7v",
  name: "Z-Diode 2.7V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "2.7v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 2.7 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 2.7), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_3_3v",
  name: "Z-Diode 3.3V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "3.3v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 3.3 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 3.3), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_3_6v",
  name: "Z-Diode 3.6V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "3.6v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 3.6 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 3.6), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_3_9v",
  name: "Z-Diode 3.9V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "3.9v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 3.9 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 3.9), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_4_7v",
  name: "Z-Diode 4.7V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "4.7v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 4.7 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 4.7), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_5_1v",
  name: "Z-Diode 5.1V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "5.1v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 5.1 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 5.1), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_5_6v",
  name: "Z-Diode 5.6V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "5.6v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 5.6 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 5.6), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_6_2v",
  name: "Z-Diode 6.2V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "6.2v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 6.2 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 6.2), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_6_8v",
  name: "Z-Diode 6.8V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "6.8v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 6.8 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 6.8), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_7_5v",
  name: "Z-Diode 7.5V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "7.5v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 7.5 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 7.5), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_8_2v",
  name: "Z-Diode 8.2V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "8.2v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 8.2 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 8.2), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_9_1v",
  name: "Z-Diode 9.1V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "9.1v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 9.1 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 9.1), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_10v",
  name: "Z-Diode 10V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "10v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 10 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 10), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_12v",
  name: "Z-Diode 12V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "12v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 12 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 12), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_15v",
  name: "Z-Diode 15V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "15v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 15 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 15), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_18v",
  name: "Z-Diode 18V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "18v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 18 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 18), rs: num(i, "rs", 5) } }],
});


add({
  id: "zener_24v",
  name: "Z-Diode 24V",
  ref: "D",
  category: "Halbleiter/Dioden/Z-Dioden",
  tags: ["zener", "z-diode", "24v"],
  mount: "both",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(10, -10, 4, -14), L(10, 10, 16, 14)],
  params: [
    { key: "bv", label: "Z-Spannung", unit: "V", type: "number", def: 24 },
    { key: "rs", label: "RS", unit: "Ω", type: "number", def: 5 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "ZENER", nodes: n, params: { is: 1e-14, n: 1, bv: num(i, "bv", 24), rs: num(i, "rs", 5) } }],
});


add({
  id: "led_red",
  name: "LED Rot",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "red"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 1.8 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 1.8);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_green",
  name: "LED Grün",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "green"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 2.1 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 2.1);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_blue",
  name: "LED Blau",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "blue"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 3.0 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 3.0);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_yellow",
  name: "LED Gelb",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "yellow"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 2.0 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 2.0);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_white",
  name: "LED Weiß",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "white"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 3.2 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 3.2);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_orange",
  name: "LED Orange",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "orange"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 2.0 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 2.0);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_ir",
  name: "LED Infrarot",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led", "ir"],
  mount: "both",
  interactive: "led",
  pins: [{ name: "A", x: -30, y: 0 }, { name: "K", x: 30, y: 0 }],
  symbol: [...diodeSymbol, L(12, -14, 20, -22), L(16, -22, 20, -22, 20, -18), L(18, -8, 26, -16), L(22, -16, 26, -16, 26, -12)],
  params: [
    { key: "vf", label: "VF", unit: "V", type: "number", def: 1.4 },
  ],
  toDevices: (i, n) => {
    const vf = num(i, "vf", 1.4);
    const is = 0.02 / Math.exp(vf / (2.2*0.02585));
    return [{ id: i.id, type: "LED", nodes: n, params: { is, n: 2.2, rs: 6, bv: 5 } }];
  },
});


add({
  id: "led_rgb",
  name: "RGB LED (gemeinsame Kathode)",
  ref: "D",
  category: "Anzeigen & Aktoren/Optisch/LED",
  tags: ["led","rgb"],
  mount: "THT",
  interactive: "led",
  pins: [{ name: "R", x: -30, y: -20 }, { name: "G", x: -30, y: 0 }, { name: "B", x: -30, y: 20 }, { name: "K", x: 30, y: 0 }],
  symbol: [CIR(0,0,14), L(-30,-20,-10,-10), L(-30,0,-10,0), L(-30,20,-10,10), L(10,0,30,0)],
  params: [{ key: "vf", label: "VF", unit: "V", type: "number", def: 2.2 }],
  toDevices: (i,n) => {
    const vf = num(i,"vf",2.2);
    const is = 0.02 / Math.exp(vf/(2.2*0.02585));
    return [
      { id: i.id+"_r", type: "LED", nodes: [n[0], n[3]], params: { is, n:2.2, rs:6 } },
      { id: i.id+"_g", type: "LED", nodes: [n[1], n[3]], params: { is, n:2.2, rs:6 } },
      { id: i.id+"_b", type: "LED", nodes: [n[2], n[3]], params: { is, n:2.2, rs:6 } },
    ];
  },
});


add({
  id: "npn_2n2222",
  name: "2N2222 NPN",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_2n2222"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 200 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-14 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",200), is: num(i,"is",1e-14), vaf: 100, pnp: 0 } }],
});


add({
  id: "npn_bc546",
  name: "BC546 NPN",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_bc546"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 400 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-15 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",400), is: num(i,"is",1e-15), vaf: 100, pnp: 0 } }],
});


add({
  id: "npn_bc548",
  name: "BC548 NPN",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_bc548"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 350 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1.5e-14 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",350), is: num(i,"is",1.5e-14), vaf: 100, pnp: 0 } }],
});


add({
  id: "npn_bc549",
  name: "BC549 NPN Low Noise",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_bc549"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 500 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-15 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",500), is: num(i,"is",1e-15), vaf: 100, pnp: 0 } }],
});


add({
  id: "npn_bc550",
  name: "BC550 NPN Low Noise",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_bc550"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 500 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-15 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",500), is: num(i,"is",1e-15), vaf: 100, pnp: 0 } }],
});


add({
  id: "pnp_bc556",
  name: "BC556 PNP",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_bc556"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 250 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-14 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",250), is: num(i,"is",1e-14), vaf: 100, pnp: 1 } }],
});


add({
  id: "pnp_bc558",
  name: "BC558 PNP",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_bc558"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 300 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-14 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",300), is: num(i,"is",1e-14), vaf: 100, pnp: 1 } }],
});


add({
  id: "pnp_bc559",
  name: "BC559 PNP Low Noise",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_bc559"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 400 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-14 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",400), is: num(i,"is",1e-14), vaf: 100, pnp: 1 } }],
});


add({
  id: "pnp_bc560",
  name: "BC560 PNP Low Noise",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_bc560"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 400 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-14 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",400), is: num(i,"is",1e-14), vaf: 100, pnp: 1 } }],
});


add({
  id: "npn_2n3055",
  name: "2N3055 NPN Leistung 15A",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_2n3055"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 50 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-12 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",50), is: num(i,"is",1e-12), vaf: 100, pnp: 0 } }],
});


add({
  id: "npn_tip31",
  name: "TIP31 NPN Leistung",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_tip31"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 50 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-12 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",50), is: num(i,"is",1e-12), vaf: 100, pnp: 0 } }],
});


add({
  id: "pnp_tip32",
  name: "TIP32 PNP Leistung",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_tip32"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 50 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-12 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",50), is: num(i,"is",1e-12), vaf: 100, pnp: 1 } }],
});


add({
  id: "npn_tip41",
  name: "TIP41 NPN Leistung",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_tip41"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 50 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-12 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",50), is: num(i,"is",1e-12), vaf: 100, pnp: 0 } }],
});


add({
  id: "pnp_tip42",
  name: "TIP42 PNP Leistung",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_tip42"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 50 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-12 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",50), is: num(i,"is",1e-12), vaf: 100, pnp: 1 } }],
});


add({
  id: "npn_tip120",
  name: "TIP120 NPN Darlington",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_tip120"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 1000 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-13 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",1000), is: num(i,"is",1e-13), vaf: 100, pnp: 0 } }],
});


add({
  id: "npn_tip122",
  name: "TIP122 NPN Darlington",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","npn_tip122"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(false),
  params: [
    { key: "bf", label: "BF", type: "number", def: 1000 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-13 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",1000), is: num(i,"is",1e-13), vaf: 100, pnp: 0 } }],
});


add({
  id: "pnp_tip125",
  name: "TIP125 PNP Darlington",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_tip125"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 1000 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-13 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",1000), is: num(i,"is",1e-13), vaf: 100, pnp: 1 } }],
});


add({
  id: "pnp_tip127",
  name: "TIP127 PNP Darlington",
  ref: "Q",
  category: "Halbleiter/Transistoren/Bipolar",
  tags: ["bjt","transistor","pnp_tip127"],
  mount: "both",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "B", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: bjtSymbol(true),
  params: [
    { key: "bf", label: "BF", type: "number", def: 1000 },
    { key: "is", label: "IS", unit: "A", type: "number", def: 1e-13 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i,"bf",1000), is: num(i,"is",1e-13), vaf: 100, pnp: 1 } }],
});


add({
  id: "nmos_2n7002",
  name: "2N7002 N-MOS SMD",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","nmos_2n7002"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(false),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 2.1 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.05 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",2.1), kp: num(i,"kp",0.05), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "nmos_bs170",
  name: "BS170 N-MOS",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","nmos_bs170"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(false),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 2.1 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.05 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",2.1), kp: num(i,"kp",0.05), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "pmos_bss84",
  name: "BSS84 P-MOS Logic",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","pmos_bss84"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(true),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 1.5 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.08 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",1.5), kp: num(i,"kp",0.08), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 1 } }],
});


add({
  id: "nmos_irf540n",
  name: "IRF540N N-MOS",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","nmos_irf540n"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(false),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 3.0 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.5 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",3.0), kp: num(i,"kp",0.5), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "nmos_irfz44",
  name: "IRFZ44 N-MOS",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","nmos_irfz44"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(false),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 3.5 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 1.0 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",3.5), kp: num(i,"kp",1.0), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "nmos_irlz44",
  name: "IRLZ44N Logic Level",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","nmos_irlz44"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(false),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 2.0 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 1.2 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",2.0), kp: num(i,"kp",1.2), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "nmos_fqp30n06",
  name: "FQP30N06 N-MOS",
  ref: "M",
  category: "Halbleiter/Transistoren/MOSFET",
  tags: ["mosfet","nmos_fqp30n06"],
  mount: "both",
  pins: [{ name: "D", x: 14, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 14, y: 30 }],
  symbol: mosSymbol(false),
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 3.0 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.8 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",3.0), kp: num(i,"kp",0.8), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "jfet_j201",
  name: "J201 N-JFET",
  ref: "J",
  category: "Halbleiter/Transistoren/JFET",
  tags: ["jfet","jfet_j201"],
  mount: "THT",
  pins: [{ name: "D", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 12, y: 30 }],
  symbol: [L(-30,0,-6,0), L(-6,-16,-6,16), L(-6,-12,12,-12,12,-30), L(-6,12,12,12,12,30), L(-18,-4,-12,0,-18,4,-18,-4), CIR(0,0,24)],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: -0.8 },
    { key: "beta", label: "BETA", unit: "A/V²", type: "number", def: 0.001 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-0.8), beta: num(i,"beta",0.001), tol: num(i, "tol", 10) } }]
});


add({
  id: "jfet_2n5457",
  name: "2N5457 N-JFET",
  ref: "J",
  category: "Halbleiter/Transistoren/JFET",
  tags: ["jfet","jfet_2n5457"],
  mount: "THT",
  pins: [{ name: "D", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 12, y: 30 }],
  symbol: [L(-30,0,-6,0), L(-6,-16,-6,16), L(-6,-12,12,-12,12,-30), L(-6,12,12,12,12,30), L(-18,-4,-12,0,-18,4,-18,-4), CIR(0,0,24)],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: -1.5 },
    { key: "beta", label: "BETA", unit: "A/V²", type: "number", def: 0.002 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-1.5), beta: num(i,"beta",0.002), tol: num(i, "tol", 10) } }]
});


add({
  id: "jfet_bf245a",
  name: "BF245A N-JFET",
  ref: "J",
  category: "Halbleiter/Transistoren/JFET",
  tags: ["jfet","jfet_bf245a"],
  mount: "THT",
  pins: [{ name: "D", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 12, y: 30 }],
  symbol: [L(-30,0,-6,0), L(-6,-16,-6,16), L(-6,-12,12,-12,12,-30), L(-6,12,12,12,12,30), L(-18,-4,-12,0,-18,4,-18,-4), CIR(0,0,24)],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: -1.0 },
    { key: "beta", label: "BETA", unit: "A/V²", type: "number", def: 0.003 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-1.0), beta: num(i,"beta",0.003), tol: num(i, "tol", 10) } }]
});


add({
  id: "jfet_bf245b",
  name: "BF245B N-JFET",
  ref: "J",
  category: "Halbleiter/Transistoren/JFET",
  tags: ["jfet","jfet_bf245b"],
  mount: "THT",
  pins: [{ name: "D", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 12, y: 30 }],
  symbol: [L(-30,0,-6,0), L(-6,-16,-6,16), L(-6,-12,12,-12,12,-30), L(-6,12,12,12,12,30), L(-18,-4,-12,0,-18,4,-18,-4), CIR(0,0,24)],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: -2.0 },
    { key: "beta", label: "BETA", unit: "A/V²", type: "number", def: 0.003 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-2.0), beta: num(i,"beta",0.003), tol: num(i, "tol", 10) } }]
});


add({
  id: "jfet_bf245c",
  name: "BF245C N-JFET",
  ref: "J",
  category: "Halbleiter/Transistoren/JFET",
  tags: ["jfet","jfet_bf245c"],
  mount: "THT",
  pins: [{ name: "D", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "S", x: 12, y: 30 }],
  symbol: [L(-30,0,-6,0), L(-6,-16,-6,16), L(-6,-12,12,-12,12,-30), L(-6,12,12,12,12,30), L(-18,-4,-12,0,-18,4,-18,-4), CIR(0,0,24)],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: -3.5 },
    { key: "beta", label: "BETA", unit: "A/V²", type: "number", def: 0.003 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-3.5), beta: num(i,"beta",0.003), tol: num(i, "tol", 10) } }]
});


add({
  id: "igbt_irg4pc50",
  name: "IRG4PC50 IGBT",
  ref: "Q",
  category: "Halbleiter/Transistoren/IGBT",
  tags: ["igbt","leistung"],
  mount: "THT",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: [
    L(-30, 0, -8, 0), L(-8, -16, -8, 16), L(-2, -16, -2, -6), L(-2, -5, -2, 5), L(-2, 6, -2, 16),
    L(-2, -11, 12, -11, 12, -30), L(-2, 11, 12, 11, 12, 30), L(-2, 0, 12, 0, 12, 11),
    L(4, -4, 10, 0, 4, 4, 4, -4), CIR(0, 0, 24), TXT(0, -28, "IGBT", 8),
  ],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 4 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.2 },
    { key: "tcv", label: "VTO-Temperaturkoeffizient", unit: "V/K", type: "number", def: 2.5e-3 },
    { key: "bex", label: "Beweglichkeits-Temperaturkoeffizient", type: "number", def: 1.5 },
    { key: "tnom", label: "Nenntemperatur TNOM", unit: "°C", type: "number", def: 27 },
    { key: "tox", label: "Oxiddicke TOX (Meyer, 0=aus)", unit: "m", type: "number", def: 0 },
    P.tol,
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",4), kp: num(i,"kp",0.2), tcv: num(i, "tcv", 2.5e-3), bex: num(i, "bex", 1.5), tnom: num(i, "tnom", 27), tox: num(i, "tox", 0), tol: num(i, "tol", 10), pmos: 0 } }],
});


add({
  id: "opamp_tl081",
  name: "TL081 JFET",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl081"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
    { key: "slew", label: "Slew-Rate", unit: "V/s", type: "number", def: 13000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_tl082",
  name: "TL082 Dual JFET",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl082"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
    { key: "slew", label: "Slew-Rate", unit: "V/s", type: "number", def: 13000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_tl071",
  name: "TL071 Low Noise JFET",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl071"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
    { key: "slew", label: "Slew-Rate", unit: "V/s", type: "number", def: 13000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


const pins_opamp_tl074: PinDef[] = [{ name: "IN1+", x: -60, y: -63 }, { name: "IN1-", x: -60, y: -49 }, { name: "OUT1", x: 60, y: -63 }, { name: "IN2+", x: -60, y: -35 }, { name: "IN2-", x: -60, y: -21 }, { name: "OUT2", x: 60, y: -49 }, { name: "IN3+", x: -60, y: -7 }, { name: "IN3-", x: -60, y: 7 }, { name: "OUT3", x: 60, y: -35 }, { name: "IN4+", x: -60, y: 21 }, { name: "IN4-", x: -60, y: 35 }, { name: "OUT4", x: 60, y: -21 }, { name: "V+", x: -60, y: 49 }, { name: "V-", x: -60, y: 63 }];
add({
  id: "opamp_tl074",
  name: "TL074 Quad Low Noise",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl074"],
  mount: "both",
  pins: pins_opamp_tl074,
  symbol: icSymbol(110, 170, "TL074", pins_opamp_tl074),
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
    { key: "slew", label: "Slew-Rate", unit: "V/s", type: "number", def: 13000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id + ":A", type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }, { id: i.id + ":B", type: "OPAMP", nodes: [n[3],n[4],n[5],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }, { id: i.id + ":C", type: "OPAMP", nodes: [n[6],n[7],n[8],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }, { id: i.id + ":D", type: "OPAMP", nodes: [n[9],n[10],n[11],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), slew: num(i,"slew",13000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_ne5534",
  name: "NE5534 Audio Single",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_ne5534"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 100000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 10000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",100000.0), gbw: num(i,"gbw",10000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_op27",
  name: "OP27 Low Noise",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_op27"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 1000000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 8000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",1000000.0), gbw: num(i,"gbw",8000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_lm386",
  name: "LM386 Audio Verstärker",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_lm386"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 50 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 1000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",50), gbw: num(i,"gbw",1000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_ca3140",
  name: "CA3140 BiMOS",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_ca3140"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "V-", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 100000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 4500000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",100000.0), gbw: num(i,"gbw",4500000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "comp_lm311",
  name: "LM311 Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator","comp_lm311"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "GND", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30), TXT(-14, 4, "CMP", 8),
  ],
  params: [{ key: "gain", label: "Gain", type: "number", def: 200000.0 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "COMPARATOR", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }],
});


add({
  id: "comp_lm393",
  name: "LM393 Dual Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator","comp_lm393"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "GND", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30), TXT(-14, 4, "CMP", 8),
  ],
  params: [{ key: "gain", label: "Gain", type: "number", def: 200000.0 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "COMPARATOR", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }],
});


const pins_comp_lm339: PinDef[] = [{ name: "IN1+", x: -60, y: -63 }, { name: "IN1-", x: -60, y: -49 }, { name: "OUT1", x: 60, y: -63 }, { name: "IN2+", x: -60, y: -35 }, { name: "IN2-", x: -60, y: -21 }, { name: "OUT2", x: 60, y: -49 }, { name: "IN3+", x: -60, y: -7 }, { name: "IN3-", x: -60, y: 7 }, { name: "OUT3", x: 60, y: -35 }, { name: "IN4+", x: -60, y: 21 }, { name: "IN4-", x: -60, y: 35 }, { name: "OUT4", x: 60, y: -21 }, { name: "V+", x: -60, y: 49 }, { name: "GND", x: -60, y: 63 }];
add({
  id: "comp_lm339",
  name: "LM339 Quad Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator","comp_lm339"],
  mount: "both",
  pins: pins_comp_lm339,
  symbol: icSymbol(110, 170, "LM339", pins_comp_lm339),
  params: [{ key: "gain", label: "Gain", type: "number", def: 200000.0 }],
  toDevices: (i,n): Device[] => [{ id: i.id + ":A", type: "COMPARATOR", nodes: [n[0],n[1],n[2],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }, { id: i.id + ":B", type: "COMPARATOR", nodes: [n[3],n[4],n[5],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }, { id: i.id + ":C", type: "COMPARATOR", nodes: [n[6],n[7],n[8],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }, { id: i.id + ":D", type: "COMPARATOR", nodes: [n[9],n[10],n[11],conn(n[12]),conn(n[13])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }],
});


add({
  id: "comp_lm393_n",
  name: "LM393 Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator","comp_lm393_n"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15, electrical: "input" }, { name: "IN-", x: -40, y: 15, electrical: "input" }, { name: "OUT", x: 40, y: 0, electrical: "output" },
    { name: "V+", x: 0, y: -30, electrical: "power_in" }, { name: "GND", x: 0, y: 30, electrical: "power_in" },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30), TXT(-14, 4, "CMP", 8),
  ],
  params: [{ key: "gain", label: "Gain", type: "number", def: 200000.0 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "COMPARATOR", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }],
});


add({
  id: "reg_7806",
  name: "7806 +6V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7806"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7806", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 6 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",6), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_7808",
  name: "7808 +8V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7808"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7808", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 8 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",8), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_7809",
  name: "7809 +9V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7809"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7809", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 9 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",9), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_7815",
  name: "7815 +15V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7815"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7815", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 15 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",15), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_7824",
  name: "7824 +24V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7824"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7824", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 24 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",24), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_7912",
  name: "7912 -12V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7912"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7912", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: -12 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",-12), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_7915",
  name: "7915 -15V",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_7915"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "7915", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: -15 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",-15), dropout: 2, rout: 0.05 } }],
});


add({
  id: "reg_78l05",
  name: "78L05 +5V 100mA",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_78l05"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "78L05", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",5), dropout: 1.5, rout: 0.05 } }],
});


add({
  id: "reg_79l05",
  name: "79L05 -5V 100mA",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_79l05"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "79L05", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: -5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",-5), dropout: 1.5, rout: 0.05 } }],
});


add({
  id: "reg_lm337",
  name: "LM337 einstellbar negativ",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_lm337"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "LM337", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: -1.25 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",-1.25), dropout: 3, rout: 0.05 } }],
});


add({
  id: "reg_tl431",
  name: "TL431 Referenz",
  ref: "U",
  category: "Stromversorgung/Spannungsregler",
  tags: ["regler","reg_tl431"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "TL431", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 2.5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",2.5), dropout: 1, rout: 0.05 } }],
});


add({
  id: "ic_747400",
  name: "7400 NAND 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7400",
  name: "7400 NAND 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7400",
  name: "7400 NAND 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7400",
  name: "7400 NAND 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747401",
  name: "7401 NAND 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7401",
  name: "7401 NAND 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7401",
  name: "7401 NAND 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7401",
  name: "7401 NAND 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747402",
  name: "7402 NOR 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7402",
  name: "7402 NOR 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7402",
  name: "7402 NOR 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7402",
  name: "7402 NOR 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747403",
  name: "7403 NAND 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7403",
  name: "7403 NAND 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7403",
  name: "7403 NAND 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7403",
  name: "7403 NAND 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747404: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747404",
  name: "7404 Inverter (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7404", "not"],
  mount: "both",
  pins: pins_ic_747404,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7404",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7404: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7404",
  name: "7404 Inverter (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7404", "not"],
  mount: "both",
  pins: pins_ic_74ls7404,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7404",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7404: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7404",
  name: "7404 Inverter (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7404", "not"],
  mount: "both",
  pins: pins_ic_74hc7404,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7404",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7404: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7404",
  name: "7404 Inverter (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7404", "not"],
  mount: "both",
  pins: pins_ic_74hct7404,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7404",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747405: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747405",
  name: "7405 Inverter (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7405", "not"],
  mount: "both",
  pins: pins_ic_747405,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7405",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7405: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7405",
  name: "7405 Inverter (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7405", "not"],
  mount: "both",
  pins: pins_ic_74ls7405,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7405",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7405: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7405",
  name: "7405 Inverter (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7405", "not"],
  mount: "both",
  pins: pins_ic_74hc7405,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7405",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7405: PinDef[] = [{ name: "A", x: -40, y: -7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7405",
  name: "7405 Inverter (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7405", "not"],
  mount: "both",
  pins: pins_ic_74hct7405,
  symbol: [RECT(-32,-24,64,48,3), TXT(0,5,"7405",10), L(-40,-7,-32,-7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747408",
  name: "7408 AND 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7408",
  name: "7408 AND 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7408",
  name: "7408 AND 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7408",
  name: "7408 AND 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747409",
  name: "7409 AND 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7409",
  name: "7409 AND 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7409",
  name: "7409 AND 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7409",
  name: "7409 AND 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747410: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747410",
  name: "7410 NAND 3 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7410", "nand3"],
  mount: "both",
  pins: pins_ic_747410,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7410",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7410: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7410",
  name: "7410 NAND 3 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7410", "nand3"],
  mount: "both",
  pins: pins_ic_74ls7410,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7410",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7410: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7410",
  name: "7410 NAND 3 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7410", "nand3"],
  mount: "both",
  pins: pins_ic_74hc7410,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7410",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7410: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7410",
  name: "7410 NAND 3 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7410", "nand3"],
  mount: "both",
  pins: pins_ic_74hct7410,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7410",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747411: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747411",
  name: "7411 AND 3 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7411", "and3"],
  mount: "both",
  pins: pins_ic_747411,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7411",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7411: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7411",
  name: "7411 AND 3 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7411", "and3"],
  mount: "both",
  pins: pins_ic_74ls7411,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7411",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7411: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7411",
  name: "7411 AND 3 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7411", "and3"],
  mount: "both",
  pins: pins_ic_74hc7411,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7411",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7411: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7411",
  name: "7411 AND 3 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7411", "and3"],
  mount: "both",
  pins: pins_ic_74hct7411,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7411",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747420: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747420",
  name: "7420 NAND 4 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7420", "nand4"],
  mount: "both",
  pins: pins_ic_747420,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7420",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7420: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7420",
  name: "7420 NAND 4 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7420", "nand4"],
  mount: "both",
  pins: pins_ic_74ls7420,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7420",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7420: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7420",
  name: "7420 NAND 4 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7420", "nand4"],
  mount: "both",
  pins: pins_ic_74hc7420,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7420",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7420: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7420",
  name: "7420 NAND 4 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7420", "nand4"],
  mount: "both",
  pins: pins_ic_74hct7420,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7420",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747421: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747421",
  name: "7421 AND 4 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7421", "and4"],
  mount: "both",
  pins: pins_ic_747421,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7421",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7421: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7421",
  name: "7421 AND 4 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7421", "and4"],
  mount: "both",
  pins: pins_ic_74ls7421,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7421",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7421: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7421",
  name: "7421 AND 4 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7421", "and4"],
  mount: "both",
  pins: pins_ic_74hc7421,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7421",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7421: PinDef[] = [{ name: "A", x: -40, y: -28 }, { name: "B", x: -40, y: -14 }, { name: "C", x: -40, y: 0 }, { name: "D", x: -40, y: 14 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7421",
  name: "7421 AND 4 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7421", "and4"],
  mount: "both",
  pins: pins_ic_74hct7421,
  symbol: [RECT(-32,-45,64,90,3), TXT(0,5,"7421",10), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(32,-7,40,-7)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "and4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747427: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747427",
  name: "7427 NOR 3 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7427", "nor3"],
  mount: "both",
  pins: pins_ic_747427,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7427",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7427: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7427",
  name: "7427 NOR 3 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7427", "nor3"],
  mount: "both",
  pins: pins_ic_74ls7427,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7427",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7427: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7427",
  name: "7427 NOR 3 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7427", "nor3"],
  mount: "both",
  pins: pins_ic_74hc7427,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7427",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7427: PinDef[] = [{ name: "A", x: -40, y: -21 }, { name: "B", x: -40, y: -7 }, { name: "C", x: -40, y: 7 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7427",
  name: "7427 NOR 3 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7427", "nor3"],
  mount: "both",
  pins: pins_ic_74hct7427,
  symbol: [RECT(-32,-38,64,76,3), TXT(0,5,"7427",10), L(-40,-21,-32,-21), L(-40,-7,-32,-7), L(-40,7,-32,7), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747430: PinDef[] = [{ name: "A", x: -40, y: -56 }, { name: "B", x: -40, y: -42 }, { name: "C", x: -40, y: -28 }, { name: "D", x: -40, y: -14 }, { name: "E", x: -40, y: 0 }, { name: "F", x: -40, y: 14 }, { name: "G", x: -40, y: 28 }, { name: "H", x: -40, y: 42 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_747430",
  name: "7430 NAND 8 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7430", "nand8"],
  mount: "both",
  pins: pins_ic_747430,
  symbol: [RECT(-32,-73,64,146,3), TXT(0,5,"7430",10), L(-40,-56,-32,-56), L(-40,-42,-32,-42), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(-40,28,-32,28), L(-40,42,-32,42), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74ls7430: PinDef[] = [{ name: "A", x: -40, y: -56 }, { name: "B", x: -40, y: -42 }, { name: "C", x: -40, y: -28 }, { name: "D", x: -40, y: -14 }, { name: "E", x: -40, y: 0 }, { name: "F", x: -40, y: 14 }, { name: "G", x: -40, y: 28 }, { name: "H", x: -40, y: 42 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74ls7430",
  name: "7430 NAND 8 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7430", "nand8"],
  mount: "both",
  pins: pins_ic_74ls7430,
  symbol: [RECT(-32,-73,64,146,3), TXT(0,5,"7430",10), L(-40,-56,-32,-56), L(-40,-42,-32,-42), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(-40,28,-32,28), L(-40,42,-32,42), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7430: PinDef[] = [{ name: "A", x: -40, y: -56 }, { name: "B", x: -40, y: -42 }, { name: "C", x: -40, y: -28 }, { name: "D", x: -40, y: -14 }, { name: "E", x: -40, y: 0 }, { name: "F", x: -40, y: 14 }, { name: "G", x: -40, y: 28 }, { name: "H", x: -40, y: 42 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hc7430",
  name: "7430 NAND 8 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7430", "nand8"],
  mount: "both",
  pins: pins_ic_74hc7430,
  symbol: [RECT(-32,-73,64,146,3), TXT(0,5,"7430",10), L(-40,-56,-32,-56), L(-40,-42,-32,-42), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(-40,28,-32,28), L(-40,42,-32,42), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_74hct7430: PinDef[] = [{ name: "A", x: -40, y: -56 }, { name: "B", x: -40, y: -42 }, { name: "C", x: -40, y: -28 }, { name: "D", x: -40, y: -14 }, { name: "E", x: -40, y: 0 }, { name: "F", x: -40, y: 14 }, { name: "G", x: -40, y: 28 }, { name: "H", x: -40, y: 42 }, { name: "Y", x: 40, y: -7 }];
add({
  id: "ic_74hct7430",
  name: "7430 NAND 8 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7430", "nand8"],
  mount: "both",
  pins: pins_ic_74hct7430,
  symbol: [RECT(-32,-73,64,146,3), TXT(0,5,"7430",10), L(-40,-56,-32,-56), L(-40,-42,-32,-42), L(-40,-28,-32,-28), L(-40,-14,-32,-14), L(-40,0,-32,0), L(-40,14,-32,14), L(-40,28,-32,28), L(-40,42,-32,42), L(32,-7,40,-7), CIR(35,-7,3)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747432",
  name: "7432 OR 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "or2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7432",
  name: "7432 OR 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "or2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7432",
  name: "7432 OR 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "or2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7432",
  name: "7432 OR 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "or2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_747486",
  name: "7486 XOR 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls7486",
  name: "7486 XOR 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc7486",
  name: "7486 XOR 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct7486",
  name: "7486 XOR 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_7474266",
  name: "74266 XNOR 2 Eingänge (74)",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xnor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74ls74266",
  name: "74266 XNOR 2 Eingänge (74LS)",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xnor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


add({
  id: "ic_74hc74266",
  name: "74266 XNOR 2 Eingänge (74HC)",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xnor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


add({
  id: "ic_74hct74266",
  name: "74266 XNOR 2 Eingänge (74HCT)",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "xnor2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 50) } }],
});


const pins_ic_747442: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "Y0", x: -60, y: 14 }, { name: "Y1", x: -60, y: 28 }, { name: "Y2", x: -60, y: 42 }, { name: "Y3", x: 60, y: -42 }, { name: "Y4", x: 60, y: -28 }, { name: "Y5", x: 60, y: -14 }, { name: "Y6", x: 60, y: 0 }, { name: "Y7", x: 60, y: 14 }, { name: "Y8", x: 60, y: 28 }, { name: "Y9", x: 60, y: 42 }];
add({
  id: "ic_747442",
  name: "7442 BCD zu Dezimal Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7442","bcddec"],
  mount: "both",
  pins: pins_ic_747442,
  symbol: icSymbol(110, 128, "7442", pins_ic_747442),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcddec", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100), low: 1 } }],
});


const pins_ic_74hc7442: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "Y0", x: -60, y: 14 }, { name: "Y1", x: -60, y: 28 }, { name: "Y2", x: -60, y: 42 }, { name: "Y3", x: 60, y: -42 }, { name: "Y4", x: 60, y: -28 }, { name: "Y5", x: 60, y: -14 }, { name: "Y6", x: 60, y: 0 }, { name: "Y7", x: 60, y: 14 }, { name: "Y8", x: 60, y: 28 }, { name: "Y9", x: 60, y: 42 }];
add({
  id: "ic_74hc7442",
  name: "7442 BCD zu Dezimal Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7442","bcddec"],
  mount: "both",
  pins: pins_ic_74hc7442,
  symbol: icSymbol(110, 128, "7442", pins_ic_74hc7442),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcddec", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50), low: 1 } }],
});


const pins_ic_747447: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "LT", x: -60, y: 14 }, { name: "RBI", x: -60, y: 28 }, { name: "BI", x: -60, y: 42 }, { name: "a", x: 60, y: -42 }, { name: "b", x: 60, y: -28 }, { name: "c", x: 60, y: -14 }, { name: "d", x: 60, y: 0 }, { name: "e", x: 60, y: 14 }, { name: "f", x: 60, y: 28 }, { name: "g", x: 60, y: 42 }];
add({
  id: "ic_747447",
  name: "7447 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7447","bcd7seglow"],
  mount: "both",
  pins: pins_ic_747447,
  symbol: icSymbol(110, 128, "7447", pins_ic_747447),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seglow", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7447: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "LT", x: -60, y: 14 }, { name: "RBI", x: -60, y: 28 }, { name: "BI", x: -60, y: 42 }, { name: "a", x: 60, y: -42 }, { name: "b", x: 60, y: -28 }, { name: "c", x: 60, y: -14 }, { name: "d", x: 60, y: 0 }, { name: "e", x: 60, y: 14 }, { name: "f", x: 60, y: 28 }, { name: "g", x: 60, y: 42 }];
add({
  id: "ic_74hc7447",
  name: "7447 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7447","bcd7seglow"],
  mount: "both",
  pins: pins_ic_74hc7447,
  symbol: icSymbol(110, 128, "7447", pins_ic_74hc7447),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seglow", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_747448: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "LT", x: -60, y: 14 }, { name: "RBI", x: -60, y: 28 }, { name: "BI", x: -60, y: 42 }, { name: "a", x: 60, y: -42 }, { name: "b", x: 60, y: -28 }, { name: "c", x: 60, y: -14 }, { name: "d", x: 60, y: 0 }, { name: "e", x: 60, y: 14 }, { name: "f", x: 60, y: 28 }, { name: "g", x: 60, y: 42 }];
add({
  id: "ic_747448",
  name: "7448 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7448","bcd7seglow"],
  mount: "both",
  pins: pins_ic_747448,
  symbol: icSymbol(110, 128, "7448", pins_ic_747448),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seglow", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7448: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "LT", x: -60, y: 14 }, { name: "RBI", x: -60, y: 28 }, { name: "BI", x: -60, y: 42 }, { name: "a", x: 60, y: -42 }, { name: "b", x: 60, y: -28 }, { name: "c", x: 60, y: -14 }, { name: "d", x: 60, y: 0 }, { name: "e", x: 60, y: 14 }, { name: "f", x: 60, y: 28 }, { name: "g", x: 60, y: 42 }];
add({
  id: "ic_74hc7448",
  name: "7448 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7448","bcd7seglow"],
  mount: "both",
  pins: pins_ic_74hc7448,
  symbol: icSymbol(110, 128, "7448", pins_ic_74hc7448),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seglow", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474138: PinDef[] = [{ name: "A0", x: -60, y: -35 }, { name: "A1", x: -60, y: -21 }, { name: "A2", x: -60, y: -7 }, { name: "Y0", x: -60, y: 7 }, { name: "Y1", x: -60, y: 21 }, { name: "Y2", x: 60, y: -35 }, { name: "Y3", x: 60, y: -21 }, { name: "Y4", x: 60, y: -7 }, { name: "Y5", x: 60, y: 7 }, { name: "Y6", x: 60, y: 21 }, { name: "Y7", x: 60, y: 35 }];
add({
  id: "ic_7474138",
  name: "74138 3-zu-8 Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74138","decoder38"],
  mount: "both",
  pins: pins_ic_7474138,
  symbol: icSymbol(110, 114, "74138", pins_ic_7474138),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder38", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74138: PinDef[] = [{ name: "A0", x: -60, y: -35 }, { name: "A1", x: -60, y: -21 }, { name: "A2", x: -60, y: -7 }, { name: "Y0", x: -60, y: 7 }, { name: "Y1", x: -60, y: 21 }, { name: "Y2", x: 60, y: -35 }, { name: "Y3", x: 60, y: -21 }, { name: "Y4", x: 60, y: -7 }, { name: "Y5", x: 60, y: 7 }, { name: "Y6", x: 60, y: 21 }, { name: "Y7", x: 60, y: 35 }];
add({
  id: "ic_74hc74138",
  name: "74138 3-zu-8 Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74138","decoder38"],
  mount: "both",
  pins: pins_ic_74hc74138,
  symbol: icSymbol(110, 114, "74138", pins_ic_74hc74138),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder38", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474139: PinDef[] = [{ name: "A0A", x: -60, y: -35 }, { name: "A1A", x: -60, y: -21 }, { name: "Y0A", x: -60, y: -7 }, { name: "Y1A", x: -60, y: 7 }, { name: "Y2A", x: -60, y: 21 }, { name: "Y3A", x: -60, y: 35 }, { name: "A0B", x: 60, y: -35 }, { name: "A1B", x: 60, y: -21 }, { name: "Y0B", x: 60, y: -7 }, { name: "Y1B", x: 60, y: 7 }, { name: "Y2B", x: 60, y: 21 }, { name: "Y3B", x: 60, y: 35 }];
add({
  id: "ic_7474139",
  name: "74139 Dual 2-zu-4 Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74139","decoder24"],
  mount: "both",
  pins: pins_ic_7474139,
  symbol: icSymbol(110, 114, "74139", pins_ic_7474139),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74139: PinDef[] = [{ name: "A0A", x: -60, y: -35 }, { name: "A1A", x: -60, y: -21 }, { name: "Y0A", x: -60, y: -7 }, { name: "Y1A", x: -60, y: 7 }, { name: "Y2A", x: -60, y: 21 }, { name: "Y3A", x: -60, y: 35 }, { name: "A0B", x: 60, y: -35 }, { name: "A1B", x: 60, y: -21 }, { name: "Y0B", x: 60, y: -7 }, { name: "Y1B", x: 60, y: 7 }, { name: "Y2B", x: 60, y: 21 }, { name: "Y3B", x: 60, y: 35 }];
add({
  id: "ic_74hc74139",
  name: "74139 Dual 2-zu-4 Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74139","decoder24"],
  mount: "both",
  pins: pins_ic_74hc74139,
  symbol: icSymbol(110, 114, "74139", pins_ic_74hc74139),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474154: PinDef[] = [{ name: "A0", x: -60, y: -63 }, { name: "A1", x: -60, y: -49 }, { name: "A2", x: -60, y: -35 }, { name: "A3", x: -60, y: -21 }, { name: "Y0", x: -60, y: -7 }, { name: "Y1", x: -60, y: 7 }, { name: "Y2", x: -60, y: 21 }, { name: "Y3", x: -60, y: 35 }, { name: "Y4", x: -60, y: 49 }, { name: "Y5", x: -60, y: 63 }, { name: "Y6", x: 60, y: -63 }, { name: "Y7", x: 60, y: -49 }, { name: "Y8", x: 60, y: -35 }, { name: "Y9", x: 60, y: -21 }, { name: "Y10", x: 60, y: -7 }, { name: "Y11", x: 60, y: 7 }, { name: "Y12", x: 60, y: 21 }, { name: "Y13", x: 60, y: 35 }, { name: "Y14", x: 60, y: 49 }, { name: "Y15", x: 60, y: 63 }];
add({
  id: "ic_7474154",
  name: "74154 4-zu-16 Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74154","decoder416"],
  mount: "both",
  pins: pins_ic_7474154,
  symbol: icSymbol(110, 170, "74154", pins_ic_7474154),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder416", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74154: PinDef[] = [{ name: "A0", x: -60, y: -63 }, { name: "A1", x: -60, y: -49 }, { name: "A2", x: -60, y: -35 }, { name: "A3", x: -60, y: -21 }, { name: "Y0", x: -60, y: -7 }, { name: "Y1", x: -60, y: 7 }, { name: "Y2", x: -60, y: 21 }, { name: "Y3", x: -60, y: 35 }, { name: "Y4", x: -60, y: 49 }, { name: "Y5", x: -60, y: 63 }, { name: "Y6", x: 60, y: -63 }, { name: "Y7", x: 60, y: -49 }, { name: "Y8", x: 60, y: -35 }, { name: "Y9", x: 60, y: -21 }, { name: "Y10", x: 60, y: -7 }, { name: "Y11", x: 60, y: 7 }, { name: "Y12", x: 60, y: 21 }, { name: "Y13", x: 60, y: 35 }, { name: "Y14", x: 60, y: 49 }, { name: "Y15", x: 60, y: 63 }];
add({
  id: "ic_74hc74154",
  name: "74154 4-zu-16 Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74154","decoder416"],
  mount: "both",
  pins: pins_ic_74hc74154,
  symbol: icSymbol(110, 170, "74154", pins_ic_74hc74154),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder416", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474151: PinDef[] = [{ name: "I0", x: -60, y: -35 }, { name: "I1", x: -60, y: -21 }, { name: "I2", x: -60, y: -7 }, { name: "I3", x: -60, y: 7 }, { name: "I4", x: -60, y: 21 }, { name: "I5", x: -60, y: 35 }, { name: "I6", x: 60, y: -35 }, { name: "I7", x: 60, y: -21 }, { name: "S0", x: 60, y: -7 }, { name: "S1", x: 60, y: 7 }, { name: "S2", x: 60, y: 21 }, { name: "Y", x: 60, y: 35 }];
add({
  id: "ic_7474151",
  name: "74151 8-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74151","mux8"],
  mount: "both",
  pins: pins_ic_7474151,
  symbol: icSymbol(110, 114, "74151", pins_ic_7474151),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74151: PinDef[] = [{ name: "I0", x: -60, y: -35 }, { name: "I1", x: -60, y: -21 }, { name: "I2", x: -60, y: -7 }, { name: "I3", x: -60, y: 7 }, { name: "I4", x: -60, y: 21 }, { name: "I5", x: -60, y: 35 }, { name: "I6", x: 60, y: -35 }, { name: "I7", x: 60, y: -21 }, { name: "S0", x: 60, y: -7 }, { name: "S1", x: 60, y: 7 }, { name: "S2", x: 60, y: 21 }, { name: "Y", x: 60, y: 35 }];
add({
  id: "ic_74hc74151",
  name: "74151 8-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74151","mux8"],
  mount: "both",
  pins: pins_ic_74hc74151,
  symbol: icSymbol(110, 114, "74151", pins_ic_74hc74151),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474153: PinDef[] = [{ name: "I0A", x: -60, y: -35 }, { name: "I1A", x: -60, y: -21 }, { name: "I2A", x: -60, y: -7 }, { name: "I3A", x: -60, y: 7 }, { name: "I0B", x: -60, y: 21 }, { name: "I1B", x: -60, y: 35 }, { name: "I2B", x: 60, y: -35 }, { name: "I3B", x: 60, y: -21 }, { name: "S0", x: 60, y: -7 }, { name: "S1", x: 60, y: 7 }, { name: "YA", x: 60, y: 21 }, { name: "YB", x: 60, y: 35 }];
add({
  id: "ic_7474153",
  name: "74153 Dual 4-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74153","mux4"],
  mount: "both",
  pins: pins_ic_7474153,
  symbol: icSymbol(110, 114, "74153", pins_ic_7474153),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[8], n[9], n[10]], model: "mux4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[6], n[7], n[8], n[9], n[11]], model: "mux4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74153: PinDef[] = [{ name: "I0A", x: -60, y: -35 }, { name: "I1A", x: -60, y: -21 }, { name: "I2A", x: -60, y: -7 }, { name: "I3A", x: -60, y: 7 }, { name: "I0B", x: -60, y: 21 }, { name: "I1B", x: -60, y: 35 }, { name: "I2B", x: 60, y: -35 }, { name: "I3B", x: 60, y: -21 }, { name: "S0", x: 60, y: -7 }, { name: "S1", x: 60, y: 7 }, { name: "YA", x: 60, y: 21 }, { name: "YB", x: 60, y: 35 }];
add({
  id: "ic_74hc74153",
  name: "74153 Dual 4-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74153","mux4"],
  mount: "both",
  pins: pins_ic_74hc74153,
  symbol: icSymbol(110, 114, "74153", pins_ic_74hc74153),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[8], n[9], n[10]], model: "mux4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[6], n[7], n[8], n[9], n[11]], model: "mux4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474157: PinDef[] = [{ name: "I0A", x: -60, y: -42 }, { name: "I1A", x: -60, y: -28 }, { name: "I0B", x: -60, y: -14 }, { name: "I1B", x: -60, y: 0 }, { name: "I0C", x: -60, y: 14 }, { name: "I1C", x: -60, y: 28 }, { name: "I0D", x: 60, y: -42 }, { name: "I1D", x: 60, y: -28 }, { name: "S", x: 60, y: -14 }, { name: "YA", x: 60, y: 0 }, { name: "YB", x: 60, y: 14 }, { name: "YC", x: 60, y: 28 }, { name: "YD", x: 60, y: 42 }];
add({
  id: "ic_7474157",
  name: "74157 Quad 2-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74157","mux2"],
  mount: "both",
  pins: pins_ic_7474157,
  symbol: icSymbol(110, 128, "74157", pins_ic_7474157),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[8], n[9]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3], n[8], n[10]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[8], n[11]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[12]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74157: PinDef[] = [{ name: "I0A", x: -60, y: -42 }, { name: "I1A", x: -60, y: -28 }, { name: "I0B", x: -60, y: -14 }, { name: "I1B", x: -60, y: 0 }, { name: "I0C", x: -60, y: 14 }, { name: "I1C", x: -60, y: 28 }, { name: "I0D", x: 60, y: -42 }, { name: "I1D", x: 60, y: -28 }, { name: "S", x: 60, y: -14 }, { name: "YA", x: 60, y: 0 }, { name: "YB", x: 60, y: 14 }, { name: "YC", x: 60, y: 28 }, { name: "YD", x: 60, y: 42 }];
add({
  id: "ic_74hc74157",
  name: "74157 Quad 2-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74157","mux2"],
  mount: "both",
  pins: pins_ic_74hc74157,
  symbol: icSymbol(110, 128, "74157", pins_ic_74hc74157),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[8], n[9]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3], n[8], n[10]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[8], n[11]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[12]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474160: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_7474160",
  name: "74160 Dekaden-Zähler",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74160","counter10"],
  mount: "both",
  pins: pins_ic_7474160,
  symbol: icSymbol(110, 86, "74160", pins_ic_7474160),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74160: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_74hc74160",
  name: "74160 Dekaden-Zähler",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74160","counter10"],
  mount: "both",
  pins: pins_ic_74hc74160,
  symbol: icSymbol(110, 86, "74160", pins_ic_74hc74160),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474161: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_7474161",
  name: "74161 4-Bit Binär-Zähler",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74161","counter4"],
  mount: "both",
  pins: pins_ic_7474161,
  symbol: icSymbol(110, 86, "74161", pins_ic_7474161),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74161: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_74hc74161",
  name: "74161 4-Bit Binär-Zähler",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74161","counter4"],
  mount: "both",
  pins: pins_ic_74hc74161,
  symbol: icSymbol(110, 86, "74161", pins_ic_74hc74161),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474162: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_7474162",
  name: "74162 Dekaden-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74162","counter10"],
  mount: "both",
  pins: pins_ic_7474162,
  symbol: icSymbol(110, 86, "74162", pins_ic_7474162),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74162: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_74hc74162",
  name: "74162 Dekaden-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74162","counter10"],
  mount: "both",
  pins: pins_ic_74hc74162,
  symbol: icSymbol(110, 86, "74162", pins_ic_74hc74162),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474163: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_7474163",
  name: "74163 4-Bit Binär-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74163","counter4"],
  mount: "both",
  pins: pins_ic_7474163,
  symbol: icSymbol(110, 86, "74163", pins_ic_7474163),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74163: PinDef[] = [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }];
add({
  id: "ic_74hc74163",
  name: "74163 4-Bit Binär-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74163","counter4"],
  mount: "both",
  pins: pins_ic_74hc74163,
  symbol: icSymbol(110, 86, "74163", pins_ic_74hc74163),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474164: PinDef[] = [{ name: "A", x: -60, y: -35 }, { name: "B", x: -60, y: -21 }, { name: "CLK", x: -60, y: -7 }, { name: "/CLR", x: -60, y: 7 }, { name: "Q0", x: -60, y: 21 }, { name: "Q1", x: -60, y: 35 }, { name: "Q2", x: 60, y: -35 }, { name: "Q3", x: 60, y: -21 }, { name: "Q4", x: 60, y: -7 }, { name: "Q5", x: 60, y: 7 }, { name: "Q6", x: 60, y: 21 }, { name: "Q7", x: 60, y: 35 }];
add({
  id: "ic_7474164",
  name: "74164 8-Bit Schieberegister",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74164","shift8dual"],
  mount: "both",
  pins: pins_ic_7474164,
  symbol: icSymbol(110, 114, "74164", pins_ic_7474164),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8dual", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74164: PinDef[] = [{ name: "A", x: -60, y: -35 }, { name: "B", x: -60, y: -21 }, { name: "CLK", x: -60, y: -7 }, { name: "/CLR", x: -60, y: 7 }, { name: "Q0", x: -60, y: 21 }, { name: "Q1", x: -60, y: 35 }, { name: "Q2", x: 60, y: -35 }, { name: "Q3", x: 60, y: -21 }, { name: "Q4", x: 60, y: -7 }, { name: "Q5", x: 60, y: 7 }, { name: "Q6", x: 60, y: 21 }, { name: "Q7", x: 60, y: 35 }];
add({
  id: "ic_74hc74164",
  name: "74164 8-Bit Schieberegister",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74164","shift8dual"],
  mount: "both",
  pins: pins_ic_74hc74164,
  symbol: icSymbol(110, 114, "74164", pins_ic_74hc74164),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8dual", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474165: PinDef[] = [{ name: "P0", x: -60, y: -42 }, { name: "P1", x: -60, y: -28 }, { name: "P2", x: -60, y: -14 }, { name: "P3", x: -60, y: 0 }, { name: "P4", x: -60, y: 14 }, { name: "P5", x: -60, y: 28 }, { name: "P6", x: 60, y: -42 }, { name: "P7", x: 60, y: -28 }, { name: "CLK", x: 60, y: -14 }, { name: "SHLD", x: 60, y: 0 }, { name: "SER", x: 60, y: 14 }, { name: "Q", x: 60, y: 28 }, { name: "/Q", x: 60, y: 42 }];
add({
  id: "ic_7474165",
  name: "74165 8-Bit PISO Shift",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74165","piso8"],
  mount: "both",
  pins: pins_ic_7474165,
  symbol: icSymbol(110, 128, "74165", pins_ic_7474165),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "piso8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74165: PinDef[] = [{ name: "P0", x: -60, y: -42 }, { name: "P1", x: -60, y: -28 }, { name: "P2", x: -60, y: -14 }, { name: "P3", x: -60, y: 0 }, { name: "P4", x: -60, y: 14 }, { name: "P5", x: -60, y: 28 }, { name: "P6", x: 60, y: -42 }, { name: "P7", x: 60, y: -28 }, { name: "CLK", x: 60, y: -14 }, { name: "SHLD", x: 60, y: 0 }, { name: "SER", x: 60, y: 14 }, { name: "Q", x: 60, y: 28 }, { name: "/Q", x: 60, y: 42 }];
add({
  id: "ic_74hc74165",
  name: "74165 8-Bit PISO Shift",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74165","piso8"],
  mount: "both",
  pins: pins_ic_74hc74165,
  symbol: icSymbol(110, 128, "74165", pins_ic_74hc74165),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "piso8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_747474: PinDef[] = [{ name: "D1", x: -60, y: -35 }, { name: "CLK1", x: -60, y: -21 }, { name: "/RST1", x: -60, y: -7 }, { name: "/SET1", x: -60, y: 7 }, { name: "Q1", x: -60, y: 21 }, { name: "/Q1", x: -60, y: 35 }, { name: "D2", x: 60, y: -35 }, { name: "CLK2", x: 60, y: -21 }, { name: "/RST2", x: 60, y: -7 }, { name: "/SET2", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "/Q2", x: 60, y: 35 }];
add({
  id: "ic_747474",
  name: "7474 Dual D-FF",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7474","dffn"],
  mount: "both",
  pins: pins_ic_747474,
  symbol: icSymbol(110, 114, "7474", pins_ic_747474),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "dffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "dffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7474: PinDef[] = [{ name: "D1", x: -60, y: -35 }, { name: "CLK1", x: -60, y: -21 }, { name: "/RST1", x: -60, y: -7 }, { name: "/SET1", x: -60, y: 7 }, { name: "Q1", x: -60, y: 21 }, { name: "/Q1", x: -60, y: 35 }, { name: "D2", x: 60, y: -35 }, { name: "CLK2", x: 60, y: -21 }, { name: "/RST2", x: 60, y: -7 }, { name: "/SET2", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "/Q2", x: 60, y: 35 }];
add({
  id: "ic_74hc7474",
  name: "7474 Dual D-FF",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7474","dffn"],
  mount: "both",
  pins: pins_ic_74hc7474,
  symbol: icSymbol(110, 114, "7474", pins_ic_74hc7474),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "dffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "dffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_747476: PinDef[] = [{ name: "J1", x: -60, y: -42 }, { name: "K1", x: -60, y: -28 }, { name: "CLK1", x: -60, y: -14 }, { name: "/RST1", x: -60, y: 0 }, { name: "/SET1", x: -60, y: 14 }, { name: "Q1", x: -60, y: 28 }, { name: "/Q1", x: -60, y: 42 }, { name: "J2", x: 60, y: -42 }, { name: "K2", x: 60, y: -28 }, { name: "CLK2", x: 60, y: -14 }, { name: "/RST2", x: 60, y: 0 }, { name: "/SET2", x: 60, y: 14 }, { name: "Q2", x: 60, y: 28 }, { name: "/Q2", x: 60, y: 42 }];
add({
  id: "ic_747476",
  name: "7476 Dual JK-FF",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7476","jkffn"],
  mount: "both",
  pins: pins_ic_747476,
  symbol: icSymbol(110, 128, "7476", pins_ic_747476),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5], n[6]], model: "jkffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }, { id: i.id, type: "DIGITAL", nodes: [n[7], n[8], n[9], n[10], n[11], n[12], n[13]], model: "jkffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7476: PinDef[] = [{ name: "J1", x: -60, y: -42 }, { name: "K1", x: -60, y: -28 }, { name: "CLK1", x: -60, y: -14 }, { name: "/RST1", x: -60, y: 0 }, { name: "/SET1", x: -60, y: 14 }, { name: "Q1", x: -60, y: 28 }, { name: "/Q1", x: -60, y: 42 }, { name: "J2", x: 60, y: -42 }, { name: "K2", x: 60, y: -28 }, { name: "CLK2", x: 60, y: -14 }, { name: "/RST2", x: 60, y: 0 }, { name: "/SET2", x: 60, y: 14 }, { name: "Q2", x: 60, y: 28 }, { name: "/Q2", x: 60, y: 42 }];
add({
  id: "ic_74hc7476",
  name: "7476 Dual JK-FF",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7476","jkffn"],
  mount: "both",
  pins: pins_ic_74hc7476,
  symbol: icSymbol(110, 128, "7476", pins_ic_74hc7476),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5], n[6]], model: "jkffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }, { id: i.id, type: "DIGITAL", nodes: [n[7], n[8], n[9], n[10], n[11], n[12], n[13]], model: "jkffn", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_747483: PinDef[] = [{ name: "A0", x: -60, y: -42 }, { name: "A1", x: -60, y: -28 }, { name: "A2", x: -60, y: -14 }, { name: "A3", x: -60, y: 0 }, { name: "B0", x: -60, y: 14 }, { name: "B1", x: -60, y: 28 }, { name: "B2", x: -60, y: 42 }, { name: "B3", x: 60, y: -42 }, { name: "CIN", x: 60, y: -28 }, { name: "S0", x: 60, y: -14 }, { name: "S1", x: 60, y: 0 }, { name: "S2", x: 60, y: 14 }, { name: "S3", x: 60, y: 28 }, { name: "COUT", x: 60, y: 42 }];
add({
  id: "ic_747483",
  name: "7483 4-Bit Addierer",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7483","add4"],
  mount: "both",
  pins: pins_ic_747483,
  symbol: icSymbol(110, 128, "7483", pins_ic_747483),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "add4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7483: PinDef[] = [{ name: "A0", x: -60, y: -42 }, { name: "A1", x: -60, y: -28 }, { name: "A2", x: -60, y: -14 }, { name: "A3", x: -60, y: 0 }, { name: "B0", x: -60, y: 14 }, { name: "B1", x: -60, y: 28 }, { name: "B2", x: -60, y: 42 }, { name: "B3", x: 60, y: -42 }, { name: "CIN", x: 60, y: -28 }, { name: "S0", x: 60, y: -14 }, { name: "S1", x: 60, y: 0 }, { name: "S2", x: 60, y: 14 }, { name: "S3", x: 60, y: 28 }, { name: "COUT", x: 60, y: 42 }];
add({
  id: "ic_74hc7483",
  name: "7483 4-Bit Addierer",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7483","add4"],
  mount: "both",
  pins: pins_ic_74hc7483,
  symbol: icSymbol(110, 128, "7483", pins_ic_74hc7483),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "add4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_747485: PinDef[] = [{ name: "A0", x: -60, y: -42 }, { name: "A1", x: -60, y: -28 }, { name: "A2", x: -60, y: -14 }, { name: "A3", x: -60, y: 0 }, { name: "B0", x: -60, y: 14 }, { name: "B1", x: -60, y: 28 }, { name: "B2", x: -60, y: 42 }, { name: "B3", x: 60, y: -42 }, { name: "IAGTB", x: 60, y: -28 }, { name: "IAEQB", x: 60, y: -14 }, { name: "IALTB", x: 60, y: 0 }, { name: "OAGTB", x: 60, y: 14 }, { name: "OAEQB", x: 60, y: 28 }, { name: "OALTB", x: 60, y: 42 }];
add({
  id: "ic_747485",
  name: "7485 4-Bit Komparator",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7485","magcomp4"],
  mount: "both",
  pins: pins_ic_747485,
  symbol: icSymbol(110, 128, "7485", pins_ic_747485),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "magcomp4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc7485: PinDef[] = [{ name: "A0", x: -60, y: -42 }, { name: "A1", x: -60, y: -28 }, { name: "A2", x: -60, y: -14 }, { name: "A3", x: -60, y: 0 }, { name: "B0", x: -60, y: 14 }, { name: "B1", x: -60, y: 28 }, { name: "B2", x: -60, y: 42 }, { name: "B3", x: 60, y: -42 }, { name: "IAGTB", x: 60, y: -28 }, { name: "IAEQB", x: 60, y: -14 }, { name: "IALTB", x: 60, y: 0 }, { name: "OAGTB", x: 60, y: 14 }, { name: "OAEQB", x: 60, y: 28 }, { name: "OALTB", x: 60, y: 42 }];
add({
  id: "ic_74hc7485",
  name: "7485 4-Bit Komparator",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7485","magcomp4"],
  mount: "both",
  pins: pins_ic_74hc7485,
  symbol: icSymbol(110, 128, "7485", pins_ic_74hc7485),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "magcomp4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474273: PinDef[] = [{ name: "D0", x: -60, y: -56 }, { name: "D1", x: -60, y: -42 }, { name: "D2", x: -60, y: -28 }, { name: "D3", x: -60, y: -14 }, { name: "D4", x: -60, y: 0 }, { name: "D5", x: -60, y: 14 }, { name: "D6", x: -60, y: 28 }, { name: "D7", x: -60, y: 42 }, { name: "CLK", x: -60, y: 56 }, { name: "/CLR", x: 60, y: -56 }, { name: "Q0", x: 60, y: -42 }, { name: "Q1", x: 60, y: -28 }, { name: "Q2", x: 60, y: -14 }, { name: "Q3", x: 60, y: 0 }, { name: "Q4", x: 60, y: 14 }, { name: "Q5", x: 60, y: 28 }, { name: "Q6", x: 60, y: 42 }, { name: "Q7", x: 60, y: 56 }];
add({
  id: "ic_7474273",
  name: "74273 Octal D-FF",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74273","ff8"],
  mount: "both",
  pins: pins_ic_7474273,
  symbol: icSymbol(110, 156, "74273", pins_ic_7474273),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "ff8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74273: PinDef[] = [{ name: "D0", x: -60, y: -56 }, { name: "D1", x: -60, y: -42 }, { name: "D2", x: -60, y: -28 }, { name: "D3", x: -60, y: -14 }, { name: "D4", x: -60, y: 0 }, { name: "D5", x: -60, y: 14 }, { name: "D6", x: -60, y: 28 }, { name: "D7", x: -60, y: 42 }, { name: "CLK", x: -60, y: 56 }, { name: "/CLR", x: 60, y: -56 }, { name: "Q0", x: 60, y: -42 }, { name: "Q1", x: 60, y: -28 }, { name: "Q2", x: 60, y: -14 }, { name: "Q3", x: 60, y: 0 }, { name: "Q4", x: 60, y: 14 }, { name: "Q5", x: 60, y: 28 }, { name: "Q6", x: 60, y: 42 }, { name: "Q7", x: 60, y: 56 }];
add({
  id: "ic_74hc74273",
  name: "74273 Octal D-FF",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74273","ff8"],
  mount: "both",
  pins: pins_ic_74hc74273,
  symbol: icSymbol(110, 156, "74273", pins_ic_74hc74273),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "ff8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474373: PinDef[] = [{ name: "D0", x: -60, y: -56 }, { name: "D1", x: -60, y: -42 }, { name: "D2", x: -60, y: -28 }, { name: "D3", x: -60, y: -14 }, { name: "D4", x: -60, y: 0 }, { name: "D5", x: -60, y: 14 }, { name: "D6", x: -60, y: 28 }, { name: "D7", x: -60, y: 42 }, { name: "LE", x: -60, y: 56 }, { name: "/OE", x: 60, y: -56 }, { name: "Q0", x: 60, y: -42 }, { name: "Q1", x: 60, y: -28 }, { name: "Q2", x: 60, y: -14 }, { name: "Q3", x: 60, y: 0 }, { name: "Q4", x: 60, y: 14 }, { name: "Q5", x: 60, y: 28 }, { name: "Q6", x: 60, y: 42 }, { name: "Q7", x: 60, y: 56 }];
add({
  id: "ic_7474373",
  name: "74373 Octal Latch",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74373","latch8"],
  mount: "both",
  pins: pins_ic_7474373,
  symbol: icSymbol(110, 156, "74373", pins_ic_7474373),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74373: PinDef[] = [{ name: "D0", x: -60, y: -56 }, { name: "D1", x: -60, y: -42 }, { name: "D2", x: -60, y: -28 }, { name: "D3", x: -60, y: -14 }, { name: "D4", x: -60, y: 0 }, { name: "D5", x: -60, y: 14 }, { name: "D6", x: -60, y: 28 }, { name: "D7", x: -60, y: 42 }, { name: "LE", x: -60, y: 56 }, { name: "/OE", x: 60, y: -56 }, { name: "Q0", x: 60, y: -42 }, { name: "Q1", x: 60, y: -28 }, { name: "Q2", x: 60, y: -14 }, { name: "Q3", x: 60, y: 0 }, { name: "Q4", x: 60, y: 14 }, { name: "Q5", x: 60, y: 28 }, { name: "Q6", x: 60, y: 42 }, { name: "Q7", x: 60, y: 56 }];
add({
  id: "ic_74hc74373",
  name: "74373 Octal Latch",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74373","latch8"],
  mount: "both",
  pins: pins_ic_74hc74373,
  symbol: icSymbol(110, 156, "74373", pins_ic_74hc74373),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474244: PinDef[] = [{ name: "I0", x: -60, y: -56 }, { name: "I1", x: -60, y: -42 }, { name: "I2", x: -60, y: -28 }, { name: "I3", x: -60, y: -14 }, { name: "I4", x: -60, y: 0 }, { name: "I5", x: -60, y: 14 }, { name: "I6", x: -60, y: 28 }, { name: "I7", x: -60, y: 42 }, { name: "/OE1", x: -60, y: 56 }, { name: "/OE2", x: 60, y: -56 }, { name: "Y0", x: 60, y: -42 }, { name: "Y1", x: 60, y: -28 }, { name: "Y2", x: 60, y: -14 }, { name: "Y3", x: 60, y: 0 }, { name: "Y4", x: 60, y: 14 }, { name: "Y5", x: 60, y: 28 }, { name: "Y6", x: 60, y: 42 }, { name: "Y7", x: 60, y: 56 }];
add({
  id: "ic_7474244",
  name: "74244 Octal Buffer",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74244","buf8"],
  mount: "both",
  pins: pins_ic_7474244,
  symbol: icSymbol(110, 156, "74244", pins_ic_7474244),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buf8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74244: PinDef[] = [{ name: "I0", x: -60, y: -56 }, { name: "I1", x: -60, y: -42 }, { name: "I2", x: -60, y: -28 }, { name: "I3", x: -60, y: -14 }, { name: "I4", x: -60, y: 0 }, { name: "I5", x: -60, y: 14 }, { name: "I6", x: -60, y: 28 }, { name: "I7", x: -60, y: 42 }, { name: "/OE1", x: -60, y: 56 }, { name: "/OE2", x: 60, y: -56 }, { name: "Y0", x: 60, y: -42 }, { name: "Y1", x: 60, y: -28 }, { name: "Y2", x: 60, y: -14 }, { name: "Y3", x: 60, y: 0 }, { name: "Y4", x: 60, y: 14 }, { name: "Y5", x: 60, y: 28 }, { name: "Y6", x: 60, y: 42 }, { name: "Y7", x: 60, y: 56 }];
add({
  id: "ic_74hc74244",
  name: "74244 Octal Buffer",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74244","buf8"],
  mount: "both",
  pins: pins_ic_74hc74244,
  symbol: icSymbol(110, 156, "74244", pins_ic_74hc74244),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buf8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_ic_7474245: PinDef[] = [{ name: "A0", x: -60, y: -56 }, { name: "A1", x: -60, y: -42 }, { name: "A2", x: -60, y: -28 }, { name: "A3", x: -60, y: -14 }, { name: "A4", x: -60, y: 0 }, { name: "A5", x: -60, y: 14 }, { name: "A6", x: -60, y: 28 }, { name: "A7", x: -60, y: 42 }, { name: "B0", x: -60, y: 56 }, { name: "B1", x: 60, y: -56 }, { name: "B2", x: 60, y: -42 }, { name: "B3", x: 60, y: -28 }, { name: "B4", x: 60, y: -14 }, { name: "B5", x: 60, y: 0 }, { name: "B6", x: 60, y: 14 }, { name: "B7", x: 60, y: 28 }, { name: "DIR", x: 60, y: 42 }, { name: "/OE", x: 60, y: 56 }];
add({
  id: "ic_7474245",
  name: "74245 Octal Bus Transceiver",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74245","transceiver8"],
  mount: "both",
  pins: pins_ic_7474245,
  symbol: icSymbol(110, 156, "74245", pins_ic_7474245),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 1.4 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "transceiver8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 1.4), rout: num(i, "rout", 100) } }],
});


const pins_ic_74hc74245: PinDef[] = [{ name: "A0", x: -60, y: -56 }, { name: "A1", x: -60, y: -42 }, { name: "A2", x: -60, y: -28 }, { name: "A3", x: -60, y: -14 }, { name: "A4", x: -60, y: 0 }, { name: "A5", x: -60, y: 14 }, { name: "A6", x: -60, y: 28 }, { name: "A7", x: -60, y: 42 }, { name: "B0", x: -60, y: 56 }, { name: "B1", x: 60, y: -56 }, { name: "B2", x: 60, y: -42 }, { name: "B3", x: 60, y: -28 }, { name: "B4", x: 60, y: -14 }, { name: "B5", x: 60, y: 0 }, { name: "B6", x: 60, y: 14 }, { name: "B7", x: 60, y: 28 }, { name: "DIR", x: 60, y: 42 }, { name: "/OE", x: 60, y: 56 }];
add({
  id: "ic_74hc74245",
  name: "74245 Octal Bus Transceiver",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74245","transceiver8"],
  mount: "both",
  pins: pins_ic_74hc74245,
  symbol: icSymbol(110, 156, "74245", pins_ic_74hc74245),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 50 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "transceiver8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
});


const pins_cmos_4000: PinDef[] = [{ name: "A1", x: -60, y: -28 }, { name: "B1", x: -60, y: -14 }, { name: "C1", x: -60, y: 0 }, { name: "Y1", x: -60, y: 14 }, { name: "A2", x: -60, y: 28 }, { name: "B2", x: 60, y: -28 }, { name: "C2", x: 60, y: -14 }, { name: "Y2", x: 60, y: 0 }, { name: "AI", x: 60, y: 14 }, { name: "YO", x: 60, y: 28 }];
add({
  id: "cmos_4000",
  name: "CD4000 Dual 3-In NOR + Inverter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4000","nor3"],
  mount: "both",
  pins: pins_cmos_4000,
  symbol: icSymbol(110, 100, "4000", pins_cmos_4000),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3]], model: "nor3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[6], n[7]], model: "nor3", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[8], n[9]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4006: PinDef[] = [{ name: "CLK", x: -60, y: -18 }, { name: "DATA", x: 60, y: -18 }, { name: "Q", x: 60, y: -4 }];
add({
  id: "cmos_4006",
  name: "CD4006 18-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4006","shift18"],
  mount: "both",
  pins: pins_cmos_4006,
  symbol: icSymbol(110, 80, "4006", pins_cmos_4006),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift18", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4007: PinDef[] = [{ name: "DP1", x: -60, y: -42 }, { name: "SP2", x: -60, y: -28 }, { name: "G2", x: -60, y: -14 }, { name: "SN2", x: -60, y: 0 }, { name: "DN5", x: -60, y: 14 }, { name: "G1", x: -60, y: 28 }, { name: "VSS", x: -60, y: 42 }, { name: "DN8", x: 60, y: -42 }, { name: "SN3", x: 60, y: -28 }, { name: "G3", x: 60, y: -14 }, { name: "SP3", x: 60, y: 0 }, { name: "D3", x: 60, y: 14 }, { name: "DP13", x: 60, y: 28 }, { name: "VDD", x: 60, y: 42 }];
add({
  id: "cmos_4007",
  name: "CD4007 3× Komplementärpaar",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4007","mosfet"],
  mount: "both",
  pins: pins_cmos_4007,
  symbol: icSymbol(110, 128, "4007", pins_cmos_4007),
  params: [],
  toDevices: (i,n): Device[] => [{ id: i.id + ":N1", type: "M", nodes: [n[4], n[5], n[6]], params: { vto: 1.5, kp: 0.5e-3, w: 1e-4, l: 1e-5, lambda: 0.02, pmos: 0 } }, { id: i.id + ":N2", type: "M", nodes: [n[4], n[2], n[3]], params: { vto: 1.5, kp: 0.5e-3, w: 1e-4, l: 1e-5, lambda: 0.02, pmos: 0 } }, { id: i.id + ":N3", type: "M", nodes: [n[11], n[9], n[8]], params: { vto: 1.5, kp: 0.5e-3, w: 1e-4, l: 1e-5, lambda: 0.02, pmos: 0 } }, { id: i.id + ":P1", type: "M", nodes: [n[0], n[5], n[13]], params: { vto: 1.5, kp: 0.2e-3, w: 1e-4, l: 1e-5, lambda: 0.02, pmos: 1 } }, { id: i.id + ":P2", type: "M", nodes: [n[0], n[2], n[1]], params: { vto: 1.5, kp: 0.2e-3, w: 1e-4, l: 1e-5, lambda: 0.02, pmos: 1 } }, { id: i.id + ":P3", type: "M", nodes: [n[11], n[9], n[10]], params: { vto: 1.5, kp: 0.2e-3, w: 1e-4, l: 1e-5, lambda: 0.02, pmos: 1 } }, { id: i.id + ":bDN", type: "R", nodes: [n[4], n[7]], params: { r: 1e-3 } }, { id: i.id + ":bDP", type: "R", nodes: [n[0], n[12]], params: { r: 1e-3 } }],
});


const pins_cmos_4008: PinDef[] = [{ name: "A0", x: -60, y: -42 }, { name: "A1", x: -60, y: -28 }, { name: "A2", x: -60, y: -14 }, { name: "A3", x: -60, y: 0 }, { name: "B0", x: -60, y: 14 }, { name: "B1", x: -60, y: 28 }, { name: "B2", x: -60, y: 42 }, { name: "B3", x: 60, y: -42 }, { name: "CIN", x: 60, y: -28 }, { name: "S0", x: 60, y: -14 }, { name: "S1", x: 60, y: 0 }, { name: "S2", x: 60, y: 14 }, { name: "S3", x: 60, y: 28 }, { name: "COUT", x: 60, y: 42 }];
add({
  id: "cmos_4008",
  name: "CD4008 4-Bit Volladdierer",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4008","add4"],
  mount: "both",
  pins: pins_cmos_4008,
  symbol: icSymbol(110, 128, "4008", pins_cmos_4008),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "add4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4009: PinDef[] = [{ name: "A1", x: -60, y: -35 }, { name: "Y1", x: -60, y: -21 }, { name: "A2", x: -60, y: -7 }, { name: "Y2", x: -60, y: 7 }, { name: "A3", x: -60, y: 21 }, { name: "Y3", x: -60, y: 35 }, { name: "A4", x: 60, y: -35 }, { name: "Y4", x: 60, y: -21 }, { name: "A5", x: 60, y: -7 }, { name: "Y5", x: 60, y: 7 }, { name: "A6", x: 60, y: 21 }, { name: "Y6", x: 60, y: 35 }];
add({
  id: "cmos_4009",
  name: "CD4009 Hex Buffer Inverting",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4009","not"],
  mount: "both",
  pins: pins_cmos_4009,
  symbol: icSymbol(110, 114, "4009", pins_cmos_4009),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[8], n[9]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[10], n[11]], model: "not", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4010: PinDef[] = [{ name: "A1", x: -60, y: -35 }, { name: "Y1", x: -60, y: -21 }, { name: "A2", x: -60, y: -7 }, { name: "Y2", x: -60, y: 7 }, { name: "A3", x: -60, y: 21 }, { name: "Y3", x: -60, y: 35 }, { name: "A4", x: 60, y: -35 }, { name: "Y4", x: 60, y: -21 }, { name: "A5", x: 60, y: -7 }, { name: "Y5", x: 60, y: 7 }, { name: "A6", x: 60, y: 21 }, { name: "Y6", x: 60, y: 35 }];
add({
  id: "cmos_4010",
  name: "CD4010 Hex Buffer Non-Inv",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4010","buffer"],
  mount: "both",
  pins: pins_cmos_4010,
  symbol: icSymbol(110, 114, "4010", pins_cmos_4010),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1]], model: "buffer", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3]], model: "buffer", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5]], model: "buffer", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7]], model: "buffer", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[8], n[9]], model: "buffer", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[10], n[11]], model: "buffer", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4014: PinDef[] = [{ name: "P0", x: -60, y: -42 }, { name: "P1", x: -60, y: -28 }, { name: "P2", x: -60, y: -14 }, { name: "P3", x: -60, y: 0 }, { name: "P4", x: -60, y: 14 }, { name: "P5", x: -60, y: 28 }, { name: "P6", x: -60, y: 42 }, { name: "P7", x: 60, y: -42 }, { name: "CLK", x: 60, y: -28 }, { name: "PS", x: 60, y: -14 }, { name: "SER", x: 60, y: 0 }, { name: "Q6", x: 60, y: 14 }, { name: "Q7", x: 60, y: 28 }, { name: "Q8", x: 60, y: 42 }];
add({
  id: "cmos_4014",
  name: "CD4014 8-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4014","piso4014"],
  mount: "both",
  pins: pins_cmos_4014,
  symbol: icSymbol(110, 128, "4014", pins_cmos_4014),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "piso4014", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4015: PinDef[] = [{ name: "CLKA", x: -60, y: -42 }, { name: "DATAA", x: -60, y: -28 }, { name: "RSTA", x: -60, y: -14 }, { name: "Q0A", x: -60, y: 0 }, { name: "Q1A", x: -60, y: 14 }, { name: "Q2A", x: -60, y: 28 }, { name: "Q3A", x: -60, y: 42 }, { name: "CLKB", x: 60, y: -42 }, { name: "DATAB", x: 60, y: -28 }, { name: "RSTB", x: 60, y: -14 }, { name: "Q0B", x: 60, y: 0 }, { name: "Q1B", x: 60, y: 14 }, { name: "Q2B", x: 60, y: 28 }, { name: "Q3B", x: 60, y: 42 }];
add({
  id: "cmos_4015",
  name: "CD4015 Dual 4-Bit Shift",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4015","shift4"],
  mount: "both",
  pins: pins_cmos_4015,
  symbol: icSymbol(110, 128, "4015", pins_cmos_4015),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5], n[6]], model: "shift4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[7], n[8], n[9], n[10], n[11], n[12], n[13]], model: "shift4", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4018: PinDef[] = [{ name: "CLK", x: -60, y: -42 }, { name: "RST", x: -60, y: -28 }, { name: "DATA", x: -60, y: -14 }, { name: "PE", x: -60, y: 0 }, { name: "J0", x: -60, y: 14 }, { name: "J1", x: -60, y: 28 }, { name: "J2", x: -60, y: 42 }, { name: "J3", x: 60, y: -42 }, { name: "J4", x: 60, y: -28 }, { name: "Q0", x: 60, y: -14 }, { name: "Q1", x: 60, y: 0 }, { name: "Q2", x: 60, y: 14 }, { name: "Q3", x: 60, y: 28 }, { name: "Q4", x: 60, y: 42 }];
add({
  id: "cmos_4018",
  name: "CD4018 Presettable Divide-by-N",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4018","johnson4018"],
  mount: "both",
  pins: pins_cmos_4018,
  symbol: icSymbol(110, 128, "4018", pins_cmos_4018),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "johnson4018", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4019: PinDef[] = [{ name: "A0", x: -60, y: -42 }, { name: "B0", x: -60, y: -28 }, { name: "A1", x: -60, y: -14 }, { name: "B1", x: -60, y: 0 }, { name: "A2", x: -60, y: 14 }, { name: "B2", x: -60, y: 28 }, { name: "A3", x: 60, y: -42 }, { name: "B3", x: 60, y: -28 }, { name: "S", x: 60, y: -14 }, { name: "Y0", x: 60, y: 0 }, { name: "Y1", x: 60, y: 14 }, { name: "Y2", x: 60, y: 28 }, { name: "Y3", x: 60, y: 42 }];
add({
  id: "cmos_4019",
  name: "CD4019 Quad AND-OR Select",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4019","mux2"],
  mount: "both",
  pins: pins_cmos_4019,
  symbol: icSymbol(110, 128, "4019", pins_cmos_4019),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[8], n[9]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3], n[8], n[10]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[8], n[11]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[12]], model: "mux2", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4021: PinDef[] = [{ name: "P0", x: -60, y: -42 }, { name: "P1", x: -60, y: -28 }, { name: "P2", x: -60, y: -14 }, { name: "P3", x: -60, y: 0 }, { name: "P4", x: -60, y: 14 }, { name: "P5", x: -60, y: 28 }, { name: "P6", x: -60, y: 42 }, { name: "P7", x: 60, y: -42 }, { name: "CLK", x: 60, y: -28 }, { name: "PS", x: 60, y: -14 }, { name: "SER", x: 60, y: 0 }, { name: "Q6", x: 60, y: 14 }, { name: "Q7", x: 60, y: 28 }, { name: "Q8", x: 60, y: 42 }];
add({
  id: "cmos_4021",
  name: "CD4021 8-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4021","piso4014"],
  mount: "both",
  pins: pins_cmos_4021,
  symbol: icSymbol(110, 128, "4021", pins_cmos_4021),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "piso4014", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4022: PinDef[] = [{ name: "CLK", x: -60, y: -35 }, { name: "RST", x: -60, y: -21 }, { name: "INH", x: -60, y: -7 }, { name: "Q0", x: -60, y: 7 }, { name: "Q1", x: -60, y: 21 }, { name: "Q2", x: -60, y: 35 }, { name: "Q3", x: 60, y: -35 }, { name: "Q4", x: 60, y: -21 }, { name: "Q5", x: 60, y: -7 }, { name: "Q6", x: 60, y: 7 }, { name: "Q7", x: 60, y: 21 }, { name: "COUT", x: 60, y: 35 }];
add({
  id: "cmos_4022",
  name: "CD4022 Octal Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4022","counter8dec"],
  mount: "both",
  pins: pins_cmos_4022,
  symbol: icSymbol(110, 114, "4022", pins_cmos_4022),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter8dec", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4024: PinDef[] = [{ name: "CLK", x: -60, y: -28 }, { name: "RST", x: -60, y: -14 }, { name: "Q0", x: -60, y: 0 }, { name: "Q1", x: -60, y: 14 }, { name: "Q2", x: 60, y: -28 }, { name: "Q3", x: 60, y: -14 }, { name: "Q4", x: 60, y: 0 }, { name: "Q5", x: 60, y: 14 }, { name: "Q6", x: 60, y: 28 }];
add({
  id: "cmos_4024",
  name: "CD4024 7-Bit Binary Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4024","counter7"],
  mount: "both",
  pins: pins_cmos_4024,
  symbol: icSymbol(110, 100, "4024", pins_cmos_4024),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter7", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4026: PinDef[] = [{ name: "CLK", x: -60, y: -35 }, { name: "RST", x: -60, y: -21 }, { name: "INH", x: -60, y: -7 }, { name: "DEI", x: -60, y: 7 }, { name: "COUT", x: -60, y: 21 }, { name: "a", x: -60, y: 35 }, { name: "b", x: 60, y: -35 }, { name: "c", x: 60, y: -21 }, { name: "d", x: 60, y: -7 }, { name: "e", x: 60, y: 7 }, { name: "f", x: 60, y: 21 }, { name: "g", x: 60, y: 35 }];
add({
  id: "cmos_4026",
  name: "CD4026 Decade Counter + 7Seg",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4026","dec4026"],
  mount: "both",
  pins: pins_cmos_4026,
  symbol: icSymbol(110, 114, "4026", pins_cmos_4026),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dec4026", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4029: PinDef[] = [{ name: "J0", x: -60, y: -35 }, { name: "J1", x: -60, y: -21 }, { name: "J2", x: -60, y: -7 }, { name: "J3", x: -60, y: 7 }, { name: "CLK", x: -60, y: 21 }, { name: "/PE", x: -60, y: 35 }, { name: "UD", x: 60, y: -35 }, { name: "BD", x: 60, y: -21 }, { name: "Q0", x: 60, y: -7 }, { name: "Q1", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "Q3", x: 60, y: 35 }];
add({
  id: "cmos_4029",
  name: "CD4029 Up/Down Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4029","ud4029"],
  mount: "both",
  pins: pins_cmos_4029,
  symbol: icSymbol(110, 114, "4029", pins_cmos_4029),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "ud4029", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4031: PinDef[] = [{ name: "CLK", x: -60, y: -18 }, { name: "DATA", x: 60, y: -18 }, { name: "Q", x: 60, y: -4 }];
add({
  id: "cmos_4031",
  name: "CD4031 64-Bit Shift",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4031","shift64"],
  mount: "both",
  pins: pins_cmos_4031,
  symbol: icSymbol(110, 80, "4031", pins_cmos_4031),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift64", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4034: PinDef[] = [{ name: "P0", x: -60, y: -63 }, { name: "P1", x: -60, y: -49 }, { name: "P2", x: -60, y: -35 }, { name: "P3", x: -60, y: -21 }, { name: "P4", x: -60, y: -7 }, { name: "P5", x: -60, y: 7 }, { name: "P6", x: -60, y: 21 }, { name: "P7", x: -60, y: 35 }, { name: "SER", x: -60, y: 49 }, { name: "CLK", x: 60, y: -63 }, { name: "PS", x: 60, y: -49 }, { name: "Q0", x: 60, y: -35 }, { name: "Q1", x: 60, y: -21 }, { name: "Q2", x: 60, y: -7 }, { name: "Q3", x: 60, y: 7 }, { name: "Q4", x: 60, y: 21 }, { name: "Q5", x: 60, y: 35 }, { name: "Q6", x: 60, y: 49 }, { name: "Q7", x: 60, y: 63 }];
add({
  id: "cmos_4034",
  name: "CD4034 8-Bit Bus Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4034","reg4034"],
  mount: "both",
  pins: pins_cmos_4034,
  symbol: icSymbol(110, 170, "4034", pins_cmos_4034),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "reg4034", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4035: PinDef[] = [{ name: "P0", x: -60, y: -35 }, { name: "P1", x: -60, y: -21 }, { name: "P2", x: -60, y: -7 }, { name: "P3", x: -60, y: 7 }, { name: "CLK", x: -60, y: 21 }, { name: "PS", x: -60, y: 35 }, { name: "J", x: 60, y: -35 }, { name: "K", x: 60, y: -21 }, { name: "Q0", x: 60, y: -7 }, { name: "Q1", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "Q3", x: 60, y: 35 }];
add({
  id: "cmos_4035",
  name: "CD4035 4-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4035","sr4035"],
  mount: "both",
  pins: pins_cmos_4035,
  symbol: icSymbol(110, 114, "4035", pins_cmos_4035),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "sr4035", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4042: PinDef[] = [{ name: "D0", x: -60, y: -28 }, { name: "D1", x: -60, y: -14 }, { name: "D2", x: -60, y: 0 }, { name: "D3", x: -60, y: 14 }, { name: "CLK", x: -60, y: 28 }, { name: "POL", x: 60, y: -28 }, { name: "Q0", x: 60, y: -14 }, { name: "Q1", x: 60, y: 0 }, { name: "Q2", x: 60, y: 14 }, { name: "Q3", x: 60, y: 28 }];
add({
  id: "cmos_4042",
  name: "CD4042 Quad D Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4042","latch4042"],
  mount: "both",
  pins: pins_cmos_4042,
  symbol: icSymbol(110, 100, "4042", pins_cmos_4042),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch4042", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4043: PinDef[] = [{ name: "S0", x: -60, y: -42 }, { name: "R0", x: -60, y: -28 }, { name: "S1", x: -60, y: -14 }, { name: "R1", x: -60, y: 0 }, { name: "S2", x: -60, y: 14 }, { name: "R2", x: -60, y: 28 }, { name: "S3", x: 60, y: -42 }, { name: "R3", x: 60, y: -28 }, { name: "OE", x: 60, y: -14 }, { name: "Q0", x: 60, y: 0 }, { name: "Q1", x: 60, y: 14 }, { name: "Q2", x: 60, y: 28 }, { name: "Q3", x: 60, y: 42 }];
add({
  id: "cmos_4043",
  name: "CD4043 Quad NOR RS Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4043","latch43"],
  mount: "both",
  pins: pins_cmos_4043,
  symbol: icSymbol(110, 128, "4043", pins_cmos_4043),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch43", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4044: PinDef[] = [{ name: "/S0", x: -60, y: -42 }, { name: "/R0", x: -60, y: -28 }, { name: "/S1", x: -60, y: -14 }, { name: "/R1", x: -60, y: 0 }, { name: "/S2", x: -60, y: 14 }, { name: "/R2", x: -60, y: 28 }, { name: "/S3", x: 60, y: -42 }, { name: "/R3", x: 60, y: -28 }, { name: "OE", x: 60, y: -14 }, { name: "Q0", x: 60, y: 0 }, { name: "Q1", x: 60, y: 14 }, { name: "Q2", x: 60, y: 28 }, { name: "Q3", x: 60, y: 42 }];
add({
  id: "cmos_4044",
  name: "CD4044 Quad NAND RS Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4044","latch43"],
  mount: "both",
  pins: pins_cmos_4044,
  symbol: icSymbol(110, 128, "4044", pins_cmos_4044),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch43", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), low: 1 } }],
});


const pins_cmos_4046: PinDef[] = [{ name: "SIG", x: -60, y: -21 }, { name: "COMP", x: -60, y: -7 }, { name: "PC1", x: -60, y: 7 }, { name: "PC2", x: 60, y: -21 }, { name: "VCOIN", x: 60, y: -7 }, { name: "VCOUT", x: 60, y: 7 }, { name: "INH", x: 60, y: 21 }];
add({
  id: "cmos_4046",
  name: "CD4046 Phase Locked Loop",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4046","pll4046"],
  mount: "both",
  pins: pins_cmos_4046,
  symbol: icSymbol(110, 86, "4046", pins_cmos_4046),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }, { key: "fmax", label: "VCO Maximalfrequenz", unit: "Hz", type: "number", def: 10000 }, { key: "fmin", label: "VCO Minimalfrequenz", unit: "Hz", type: "number", def: 0 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "pll4046", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), fmax: num(i, "fmax", 10000), fmin: num(i, "fmin", 0) } }],
});


const pins_cmos_4047: PinDef[] = [{ name: "TRIG", x: -60, y: -18 }, { name: "RST", x: -60, y: -4 }, { name: "Q", x: 60, y: -18 }, { name: "/Q", x: 60, y: -4 }];
add({
  id: "cmos_4047",
  name: "CD4047 Monostable/Astable",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4047","monostable"],
  mount: "both",
  pins: pins_cmos_4047,
  symbol: icSymbol(110, 80, "4047", pins_cmos_4047),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }, { key: "pw", label: "Impulsbreite", unit: "s", type: "number", def: 0.001 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "monostable", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), pw: num(i, "pw", 0.001) } }],
});


const pins_cmos_4068: PinDef[] = [{ name: "A", x: -60, y: -28 }, { name: "B", x: -60, y: -14 }, { name: "C", x: -60, y: 0 }, { name: "D", x: -60, y: 14 }, { name: "E", x: 60, y: -28 }, { name: "F", x: 60, y: -14 }, { name: "G", x: 60, y: 0 }, { name: "H", x: 60, y: 14 }, { name: "Y", x: 60, y: 28 }];
add({
  id: "cmos_4068",
  name: "CD4068 8-Input NAND",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4068","nand8"],
  mount: "both",
  pins: pins_cmos_4068,
  symbol: icSymbol(110, 100, "4068", pins_cmos_4068),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4076: PinDef[] = [{ name: "D0", x: -60, y: -28 }, { name: "D1", x: -60, y: -14 }, { name: "D2", x: -60, y: 0 }, { name: "D3", x: -60, y: 14 }, { name: "CLK", x: -60, y: 28 }, { name: "OE", x: 60, y: -28 }, { name: "Q0", x: 60, y: -14 }, { name: "Q1", x: 60, y: 0 }, { name: "Q2", x: 60, y: 14 }, { name: "Q3", x: 60, y: 28 }];
add({
  id: "cmos_4076",
  name: "CD4076 Quad D Latch Tri-State",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4076","reg4076"],
  mount: "both",
  pins: pins_cmos_4076,
  symbol: icSymbol(110, 100, "4076", pins_cmos_4076),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "reg4076", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4078: PinDef[] = [{ name: "A", x: -60, y: -28 }, { name: "B", x: -60, y: -14 }, { name: "C", x: -60, y: 0 }, { name: "D", x: -60, y: 14 }, { name: "E", x: 60, y: -28 }, { name: "F", x: 60, y: -14 }, { name: "G", x: 60, y: 0 }, { name: "H", x: 60, y: 14 }, { name: "Y", x: 60, y: 28 }];
add({
  id: "cmos_4078",
  name: "CD4078 8-Input NOR",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4078","nor8"],
  mount: "both",
  pins: pins_cmos_4078,
  symbol: icSymbol(110, 100, "4078", pins_cmos_4078),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4093: PinDef[] = [{ name: "A1", x: -60, y: -35 }, { name: "B1", x: -60, y: -21 }, { name: "Y1", x: -60, y: -7 }, { name: "A2", x: -60, y: 7 }, { name: "B2", x: -60, y: 21 }, { name: "Y2", x: -60, y: 35 }, { name: "A3", x: 60, y: -35 }, { name: "B3", x: 60, y: -21 }, { name: "Y3", x: 60, y: -7 }, { name: "A4", x: 60, y: 7 }, { name: "B4", x: 60, y: 21 }, { name: "Y4", x: 60, y: 35 }];
add({
  id: "cmos_4093",
  name: "CD4093 Quad NAND Schmitt",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4093","nand2s"],
  mount: "both",
  pins: pins_cmos_4093,
  symbol: icSymbol(110, 114, "4093", pins_cmos_4093),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2]], model: "nand2s", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[3], n[4], n[5]], model: "nand2s", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8]], model: "nand2s", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[9], n[10], n[11]], model: "nand2s", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4094: PinDef[] = [{ name: "SER", x: -60, y: -42 }, { name: "CLK", x: -60, y: -28 }, { name: "STR", x: -60, y: -14 }, { name: "OE", x: -60, y: 0 }, { name: "Q0", x: -60, y: 14 }, { name: "Q1", x: -60, y: 28 }, { name: "Q2", x: 60, y: -42 }, { name: "Q3", x: 60, y: -28 }, { name: "Q4", x: 60, y: -14 }, { name: "Q5", x: 60, y: 0 }, { name: "Q6", x: 60, y: 14 }, { name: "Q7", x: 60, y: 28 }, { name: "QS", x: 60, y: 42 }];
add({
  id: "cmos_4094",
  name: "CD4094 8-Bit Shift+Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4094","sr4094"],
  mount: "both",
  pins: pins_cmos_4094,
  symbol: icSymbol(110, 128, "4094", pins_cmos_4094),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "sr4094", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_40106: PinDef[] = [{ name: "A1", x: -60, y: -35 }, { name: "Y1", x: -60, y: -21 }, { name: "A2", x: -60, y: -7 }, { name: "Y2", x: -60, y: 7 }, { name: "A3", x: -60, y: 21 }, { name: "Y3", x: -60, y: 35 }, { name: "A4", x: 60, y: -35 }, { name: "Y4", x: 60, y: -21 }, { name: "A5", x: 60, y: -7 }, { name: "Y5", x: 60, y: 7 }, { name: "A6", x: 60, y: 21 }, { name: "Y6", x: 60, y: 35 }];
add({
  id: "cmos_40106",
  name: "CD40106 Hex Schmitt Inverter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40106","schmitt"],
  mount: "both",
  pins: pins_cmos_40106,
  symbol: icSymbol(110, 114, "40106", pins_cmos_40106),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[8], n[9]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[10], n[11]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_40193: PinDef[] = [{ name: "J0", x: -60, y: -35 }, { name: "J1", x: -60, y: -21 }, { name: "J2", x: -60, y: -7 }, { name: "J3", x: -60, y: 7 }, { name: "CPU", x: -60, y: 21 }, { name: "CPD", x: 60, y: -35 }, { name: "/PL", x: 60, y: -21 }, { name: "Q0", x: 60, y: -7 }, { name: "Q1", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "Q3", x: 60, y: 35 }];
add({
  id: "cmos_40193",
  name: "CD40193 4-Bit Up/Down Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40193","ud193"],
  mount: "both",
  pins: pins_cmos_40193,
  symbol: icSymbol(110, 114, "40193", pins_cmos_40193),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "ud193", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_40194: PinDef[] = [{ name: "P0", x: -60, y: -42 }, { name: "P1", x: -60, y: -28 }, { name: "P2", x: -60, y: -14 }, { name: "P3", x: -60, y: 0 }, { name: "S0", x: -60, y: 14 }, { name: "S1", x: -60, y: 28 }, { name: "CLK", x: -60, y: 42 }, { name: "/CLR", x: 60, y: -42 }, { name: "DSL", x: 60, y: -28 }, { name: "DSR", x: 60, y: -14 }, { name: "Q0", x: 60, y: 0 }, { name: "Q1", x: 60, y: 14 }, { name: "Q2", x: 60, y: 28 }, { name: "Q3", x: 60, y: 42 }];
add({
  id: "cmos_40194",
  name: "CD40194 4-Bit Universal Shift",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40194","bidir194"],
  mount: "both",
  pins: pins_cmos_40194,
  symbol: icSymbol(110, 128, "40194", pins_cmos_40194),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bidir194", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_40195: PinDef[] = [{ name: "P0", x: -60, y: -35 }, { name: "P1", x: -60, y: -21 }, { name: "P2", x: -60, y: -7 }, { name: "P3", x: -60, y: 7 }, { name: "CLK", x: -60, y: 21 }, { name: "PS", x: 60, y: -35 }, { name: "SER", x: 60, y: -21 }, { name: "Q0", x: 60, y: -7 }, { name: "Q1", x: 60, y: 7 }, { name: "Q2", x: 60, y: 21 }, { name: "Q3", x: 60, y: 35 }];
add({
  id: "cmos_40195",
  name: "CD40195 4-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40195","sr40195"],
  mount: "both",
  pins: pins_cmos_40195,
  symbol: icSymbol(110, 114, "40195", pins_cmos_40195),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "sr40195", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4512: PinDef[] = [{ name: "I0", x: -60, y: -42 }, { name: "I1", x: -60, y: -28 }, { name: "I2", x: -60, y: -14 }, { name: "I3", x: -60, y: 0 }, { name: "I4", x: -60, y: 14 }, { name: "I5", x: -60, y: 28 }, { name: "I6", x: -60, y: 42 }, { name: "I7", x: 60, y: -42 }, { name: "S0", x: 60, y: -28 }, { name: "S1", x: 60, y: -14 }, { name: "S2", x: 60, y: 0 }, { name: "STR", x: 60, y: 14 }, { name: "INH", x: 60, y: 28 }, { name: "Y", x: 60, y: 42 }];
add({
  id: "cmos_4512",
  name: "CD4512 8-Channel MUX",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4512","mux4512"],
  mount: "both",
  pins: pins_cmos_4512,
  symbol: icSymbol(110, 128, "4512", pins_cmos_4512),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux4512", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4514: PinDef[] = [{ name: "A0", x: -60, y: -70 }, { name: "A1", x: -60, y: -56 }, { name: "A2", x: -60, y: -42 }, { name: "A3", x: -60, y: -28 }, { name: "STR", x: -60, y: -14 }, { name: "INH", x: -60, y: 0 }, { name: "Y0", x: -60, y: 14 }, { name: "Y1", x: -60, y: 28 }, { name: "Y2", x: -60, y: 42 }, { name: "Y3", x: -60, y: 56 }, { name: "Y4", x: -60, y: 70 }, { name: "Y5", x: 60, y: -70 }, { name: "Y6", x: 60, y: -56 }, { name: "Y7", x: 60, y: -42 }, { name: "Y8", x: 60, y: -28 }, { name: "Y9", x: 60, y: -14 }, { name: "Y10", x: 60, y: 0 }, { name: "Y11", x: 60, y: 14 }, { name: "Y12", x: 60, y: 28 }, { name: "Y13", x: 60, y: 42 }, { name: "Y14", x: 60, y: 56 }, { name: "Y15", x: 60, y: 70 }];
add({
  id: "cmos_4514",
  name: "CD4514 4-to-16 Decoder",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4514","dec4514"],
  mount: "both",
  pins: pins_cmos_4514,
  symbol: icSymbol(110, 184, "4514", pins_cmos_4514),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dec4514", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4515: PinDef[] = [{ name: "A0", x: -60, y: -70 }, { name: "A1", x: -60, y: -56 }, { name: "A2", x: -60, y: -42 }, { name: "A3", x: -60, y: -28 }, { name: "STR", x: -60, y: -14 }, { name: "INH", x: -60, y: 0 }, { name: "Y0", x: -60, y: 14 }, { name: "Y1", x: -60, y: 28 }, { name: "Y2", x: -60, y: 42 }, { name: "Y3", x: -60, y: 56 }, { name: "Y4", x: -60, y: 70 }, { name: "Y5", x: 60, y: -70 }, { name: "Y6", x: 60, y: -56 }, { name: "Y7", x: 60, y: -42 }, { name: "Y8", x: 60, y: -28 }, { name: "Y9", x: 60, y: -14 }, { name: "Y10", x: 60, y: 0 }, { name: "Y11", x: 60, y: 14 }, { name: "Y12", x: 60, y: 28 }, { name: "Y13", x: 60, y: 42 }, { name: "Y14", x: 60, y: 56 }, { name: "Y15", x: 60, y: 70 }];
add({
  id: "cmos_4515",
  name: "CD4515 4-to-16 Decoder Inv",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4515","dec4514"],
  mount: "both",
  pins: pins_cmos_4515,
  symbol: icSymbol(110, 184, "4515", pins_cmos_4515),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dec4514", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), low: 1 } }],
});


const pins_cmos_4520: PinDef[] = [{ name: "CLKA", x: -60, y: -42 }, { name: "RSTA", x: -60, y: -28 }, { name: "ENA", x: -60, y: -14 }, { name: "Q0A", x: -60, y: 0 }, { name: "Q1A", x: -60, y: 14 }, { name: "Q2A", x: -60, y: 28 }, { name: "Q3A", x: -60, y: 42 }, { name: "CLKB", x: 60, y: -42 }, { name: "RSTB", x: 60, y: -28 }, { name: "ENB", x: 60, y: -14 }, { name: "Q0B", x: 60, y: 0 }, { name: "Q1B", x: 60, y: 14 }, { name: "Q2B", x: 60, y: 28 }, { name: "Q3B", x: 60, y: 42 }];
add({
  id: "cmos_4520",
  name: "CD4520 Dual 4-Bit Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4520","bcdcounter"],
  mount: "both",
  pins: pins_cmos_4520,
  symbol: icSymbol(110, 128, "4520", pins_cmos_4520),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5], n[6]], model: "bcdcounter", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[7], n[8], n[9], n[10], n[11], n[12], n[13]], model: "bcdcounter", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4528: PinDef[] = [{ name: "TRIGA", x: -60, y: -21 }, { name: "RSTA", x: -60, y: -7 }, { name: "QA", x: -60, y: 7 }, { name: "/QA", x: -60, y: 21 }, { name: "TRIGB", x: 60, y: -21 }, { name: "RSTB", x: 60, y: -7 }, { name: "QB", x: 60, y: 7 }, { name: "/QB", x: 60, y: 21 }];
add({
  id: "cmos_4528",
  name: "CD4528 Dual Monostable",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4528","monostable"],
  mount: "both",
  pins: pins_cmos_4528,
  symbol: icSymbol(110, 86, "4528", pins_cmos_4528),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }, { key: "pwA", label: "Impulsbreite A", unit: "s", type: "number", def: 0.001 }, { key: "pwB", label: "Impulsbreite B", unit: "s", type: "number", def: 0.001 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3]], model: "monostable", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), pw: num(i, "pwA", 0.001) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[6], n[7]], model: "monostable", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), pw: num(i, "pwB", 0.001) } }],
});


const pins_cmos_4538: PinDef[] = [{ name: "TRIGA", x: -60, y: -21 }, { name: "RSTA", x: -60, y: -7 }, { name: "QA", x: -60, y: 7 }, { name: "/QA", x: -60, y: 21 }, { name: "TRIGB", x: 60, y: -21 }, { name: "RSTB", x: 60, y: -7 }, { name: "QB", x: 60, y: 7 }, { name: "/QB", x: 60, y: 21 }];
add({
  id: "cmos_4538",
  name: "CD4538 Dual Monostable Prec",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4538","monostable"],
  mount: "both",
  pins: pins_cmos_4538,
  symbol: icSymbol(110, 86, "4538", pins_cmos_4538),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }, { key: "pwA", label: "Impulsbreite A", unit: "s", type: "number", def: 0.001 }, { key: "pwB", label: "Impulsbreite B", unit: "s", type: "number", def: 0.001 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3]], model: "monostable", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), pw: num(i, "pwA", 0.001) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5], n[6], n[7]], model: "monostable", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), pw: num(i, "pwB", 0.001) } }],
});


const pins_cmos_4543: PinDef[] = [{ name: "A", x: -60, y: -42 }, { name: "B", x: -60, y: -28 }, { name: "C", x: -60, y: -14 }, { name: "D", x: -60, y: 0 }, { name: "LD", x: -60, y: 14 }, { name: "PH", x: -60, y: 28 }, { name: "BI", x: -60, y: 42 }, { name: "a", x: 60, y: -42 }, { name: "b", x: 60, y: -28 }, { name: "c", x: 60, y: -14 }, { name: "d", x: 60, y: 0 }, { name: "e", x: 60, y: 14 }, { name: "f", x: 60, y: 28 }, { name: "g", x: 60, y: 42 }];
add({
  id: "cmos_4543",
  name: "CD4543 BCD to 7-Seg Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4543","bcd7seglcd"],
  mount: "both",
  pins: pins_cmos_4543,
  symbol: icSymbol(110, 128, "4543", pins_cmos_4543),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seglcd", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4555: PinDef[] = [{ name: "A0A", x: -60, y: -35 }, { name: "A1A", x: -60, y: -21 }, { name: "Y0A", x: -60, y: -7 }, { name: "Y1A", x: -60, y: 7 }, { name: "Y2A", x: -60, y: 21 }, { name: "Y3A", x: -60, y: 35 }, { name: "A0B", x: 60, y: -35 }, { name: "A1B", x: 60, y: -21 }, { name: "Y0B", x: 60, y: -7 }, { name: "Y1B", x: 60, y: 7 }, { name: "Y2B", x: 60, y: 21 }, { name: "Y3B", x: 60, y: 35 }];
add({
  id: "cmos_4555",
  name: "CD4555 Dual 1-to-4 Decoder",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4555","decoder24"],
  mount: "both",
  pins: pins_cmos_4555,
  symbol: icSymbol(110, 114, "4555", pins_cmos_4555),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_cmos_4556: PinDef[] = [{ name: "A0A", x: -60, y: -35 }, { name: "A1A", x: -60, y: -21 }, { name: "Y0A", x: -60, y: -7 }, { name: "Y1A", x: -60, y: 7 }, { name: "Y2A", x: -60, y: 21 }, { name: "Y3A", x: -60, y: 35 }, { name: "A0B", x: 60, y: -35 }, { name: "A1B", x: 60, y: -21 }, { name: "Y0B", x: 60, y: -7 }, { name: "Y1B", x: 60, y: 7 }, { name: "Y2B", x: 60, y: 21 }, { name: "Y3B", x: 60, y: 35 }];
add({
  id: "cmos_4556",
  name: "CD4556 Dual 1-to-4 Decoder Inv",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4556","decoder24"],
  mount: "both",
  pins: pins_cmos_4556,
  symbol: icSymbol(110, 114, "4556", pins_cmos_4556),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1], n[2], n[3], n[4], n[5]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), low: 1 } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7], n[8], n[9], n[10], n[11]], model: "decoder24", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400), low: 1 } }],
});


const pins_cmos_4584: PinDef[] = [{ name: "A1", x: -60, y: -35 }, { name: "Y1", x: -60, y: -21 }, { name: "A2", x: -60, y: -7 }, { name: "Y2", x: -60, y: 7 }, { name: "A3", x: -60, y: 21 }, { name: "Y3", x: -60, y: 35 }, { name: "A4", x: 60, y: -35 }, { name: "Y4", x: 60, y: -21 }, { name: "A5", x: 60, y: -7 }, { name: "Y5", x: 60, y: 7 }, { name: "A6", x: 60, y: 21 }, { name: "Y6", x: 60, y: 35 }];
add({
  id: "cmos_4584",
  name: "CD4584 Hex Schmitt Inverter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4584","schmitt"],
  mount: "both",
  pins: pins_cmos_4584,
  symbol: icSymbol(110, 114, "4584", pins_cmos_4584),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: [n[0], n[1]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[2], n[3]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[4], n[5]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[6], n[7]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[8], n[9]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }, { id: i.id, type: "DIGITAL", nodes: [n[10], n[11]], model: "schmitt", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 400) } }],
});


const pins_adc_0804: PinDef[] = [{ name: "VIN", x: -60, y: -28 }, { name: "D0", x: -60, y: -14 }, { name: "D1", x: -60, y: 0 }, { name: "D2", x: -60, y: 14 }, { name: "D3", x: 60, y: -28 }, { name: "D4", x: 60, y: -14 }, { name: "D5", x: 60, y: 0 }, { name: "D6", x: 60, y: 14 }, { name: "D7", x: 60, y: 28 }];
add({
  id: "adc_0804",
  name: "ADC0804 8-Bit ADC",
  ref: "U",
  category: "Gemischt/ADC-DAC",
  tags: ["adc","0804"],
  mount: "THT",
  pins: pins_adc_0804,
  symbol: icSymbol(110, 100, "ADC0804", pins_adc_0804),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }, { key: "vref", label: "Referenzspannung", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "adc8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 100), vref: num(i, "vref", 5) } }],
});


const pins_dac_0808: PinDef[] = [{ name: "D0", x: -60, y: -28 }, { name: "D1", x: -60, y: -14 }, { name: "D2", x: -60, y: 0 }, { name: "D3", x: -60, y: 14 }, { name: "D4", x: 60, y: -28 }, { name: "D5", x: 60, y: -14 }, { name: "D6", x: 60, y: 0 }, { name: "D7", x: 60, y: 14 }, { name: "VOUT", x: 60, y: 28 }];
add({
  id: "dac_0808",
  name: "DAC0808 8-Bit DAC",
  ref: "U",
  category: "Gemischt/ADC-DAC",
  tags: ["dac","0808"],
  mount: "THT",
  pins: pins_dac_0808,
  symbol: icSymbol(110, 100, "DAC0808", pins_dac_0808),
  params: [{ key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 5 }, { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 2.5 }, { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 100 }, { key: "vref", label: "Referenzspannung", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dac8", params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 100), vref: num(i, "vref", 5) } }],
});


/* S5.26: Echte Schalter-Modelle. Jede Schaltfunktion bekommt ihre physikalisch
   korrekten Pole, Geräte und IEC-Schaltzeichen (statt baugleicher SPST-Fakes
   mit doppeltem Hebel). Regel: Das Symbol enthält nur Statik (Anschlüsse,
   Lagerpunkte, Gehäuse); alle Hebel/Zeiger malt zustandsabhängig das
   Canvas-Overlay. Abgeleitete Geräte-IDs: `<instanz>_<suffix>`. */
add({
  id: "switch_spdt",
  name: "SPDT Schalter",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter", "wechsler", "spdt"],
  mount: "THT",
  interactive: "switch",
  pins: [
    { name: "COM", x: -30, y: 0 },
    { name: "NO", x: 30, y: -20 },
    { name: "NC", x: 30, y: 20 },
  ],
  symbol: [
    L(-30, 0, -14, 0), L(14, -20, 30, -20), L(14, 20, 30, 20),
    CIR(-14, 0, 2.2, true), CIR(14, -20, 2, true), CIR(14, 20, 2, true),
  ],
  params: [
    { key: "closed", label: "Auf NO umgelegt (statt NC)", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
    { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
  ],
  toDevices: (i, n): Device[] => [
    { id: i.id, type: "SWITCH", nodes: [n[0], n[1]], params: { closed: num(i, "closed", 0), ron: num(i, "ron", 0.01), roff: 1e9 } },
    { id: i.id + "_nc", type: "SWITCH", nodes: [n[0], n[2]], params: { closed: num(i, "closed", 0) ? 0 : 1, ron: num(i, "ron", 0.01), roff: 1e9 } },
  ],
});


add({
  id: "switch_dpst",
  name: "DPST Schalter",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter", "dpst"],
  mount: "THT",
  interactive: "switch",
  pins: [
    { name: "1A", x: -30, y: -20 },
    { name: "1B", x: 30, y: -20 },
    { name: "2A", x: -30, y: 20 },
    { name: "2B", x: 30, y: 20 },
  ],
  symbol: [
    L(-30, -20, -14, -20), L(14, -20, 30, -20),
    L(-30, 20, -14, 20), L(14, 20, 30, 20),
    CIR(-14, -20, 2, true), CIR(14, -20, 2, true),
    CIR(-14, 20, 2, true), CIR(14, 20, 2, true),
  ],
  params: [
    { key: "closed", label: "Geschlossen (beide Pole)", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
    { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
  ],
  toDevices: (i, n): Device[] => [
    { id: i.id, type: "SWITCH", nodes: [n[0], n[1]], params: { closed: num(i, "closed", 0), ron: num(i, "ron", 0.01), roff: 1e9 } },
    { id: i.id + "_p2", type: "SWITCH", nodes: [n[2], n[3]], params: { closed: num(i, "closed", 0), ron: num(i, "ron", 0.01), roff: 1e9 } },
  ],
});


add({
  id: "switch_dpdt",
  name: "DPDT Schalter",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter", "wechsler", "dpdt"],
  mount: "THT",
  interactive: "switch",
  pins: [
    { name: "COM1", x: -30, y: -20 },
    { name: "NO1", x: 30, y: -30 },
    { name: "NC1", x: 30, y: -10 },
    { name: "COM2", x: -30, y: 20 },
    { name: "NO2", x: 30, y: 30 },
    { name: "NC2", x: 30, y: 10 },
  ],
  symbol: [
    L(-30, -20, -14, -20), L(14, -30, 30, -30), L(14, -10, 30, -10),
    L(-30, 20, -14, 20), L(14, 30, 30, 30), L(14, 10, 30, 10),
    CIR(-14, -20, 2.2, true), CIR(14, -30, 2, true), CIR(14, -10, 2, true),
    CIR(-14, 20, 2.2, true), CIR(14, 30, 2, true), CIR(14, 10, 2, true),
  ],
  params: [
    { key: "closed", label: "Auf NO umgelegt (statt NC)", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
    { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
  ],
  toDevices: (i, n): Device[] => {
    const c = num(i, "closed", 0);
    const ron = num(i, "ron", 0.01);
    return [
      { id: i.id, type: "SWITCH", nodes: [n[0], n[1]], params: { closed: c, ron, roff: 1e9 } },
      { id: i.id + "_p1nc", type: "SWITCH", nodes: [n[0], n[2]], params: { closed: c ? 0 : 1, ron, roff: 1e9 } },
      { id: i.id + "_p2", type: "SWITCH", nodes: [n[3], n[4]], params: { closed: c, ron, roff: 1e9 } },
      { id: i.id + "_p2nc", type: "SWITCH", nodes: [n[3], n[5]], params: { closed: c ? 0 : 1, ron, roff: 1e9 } },
    ];
  },
});


for (const rotaryN of [3, 4, 6, 8]) {
  const rows: number[] =
    rotaryN === 3 ? [-20, 0, 20] :
    rotaryN === 4 ? [-30, -10, 10, 30] :
    rotaryN === 6 ? [-30, -20, -10, 10, 20, 30] :
    [-40, -30, -20, -10, 0, 10, 20, 30];
  add({
    id: `switch_rotary_${rotaryN}`,
    name: `Drehschalter ${rotaryN} Stellungen`,
    ref: "S",
    category: "Elektromechanik/Schalter",
    tags: ["schalter", "drehschalter", `rotary_${rotaryN}`],
    mount: "THT",
    interactive: "switch",
    pins: [
      { name: "COM", x: -30, y: 0 },
      ...rows.map((y, k) => ({ name: String(k + 1), x: 30, y })),
    ],
    symbol: [
      L(-30, 0, -14, 0), CIR(-14, 0, 2.4, true),
      ...rows.flatMap((y) => [L(30, y, 16, y), CIR(16, y, 2, true)]),
    ],
    params: [
      { key: "pos", label: "Stellung", type: "number", min: 1, max: rotaryN, step: 1, def: 1 },
      { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
      { key: "key", label: "Taste (bei laufender Simulation)", type: "text", def: "" },
    ],
    toDevices: (i, n): Device[] => {
      const pos = Math.round(num(i, "pos", 1));
      const ron = num(i, "ron", 0.01);
      return rows.map((_, k): Device => ({
        id: `${i.id}_t${k + 1}`,
        type: "SWITCH",
        nodes: [n[0], n[k + 1]],
        params: { closed: pos === k + 1 ? 1 : 0, ron, roff: 1e9 },
      }));
    },
  });
}


for (const dipN of [4, 8]) {
  // Echte DIP-Nummerierung: links oben→unten 1..N, rechts unten→oben N+1..2N.
  const rows: number[] = dipN === 4 ? [-20, -10, 10, 20] : [-40, -30, -20, -10, 10, 20, 30, 40];
  const top = rows[0] - 8;
  const h = rows[rows.length - 1] - rows[0] + 16;
  add({
    id: `switch_dip_${dipN}`,
    name: `DIP Schalter ${dipN}-fach`,
    ref: "S",
    category: "Elektromechanik/Schalter",
    tags: ["schalter", "dip", `dip_${dipN}`],
    mount: "THT",
    interactive: "switch",
    pins: rows.flatMap((y, k) => [
      { name: String(k + 1), x: -20, y },
      { name: String(2 * dipN - k), x: 20, y },
    ]),
    symbol: [
      RECT(-14, top, 28, h, 2),
      ...rows.flatMap((y) => [L(-20, y, -14, y), L(14, y, 20, y)]),
    ],
    params: [...rows.map((_, k) => ({ key: `closed${k + 1}`, label: `Schalter ${k + 1} geschlossen`, type: "bool" as const, def: false })),
      { key: "key", label: "Taste: alle Hebel (bei laufender Simulation)", type: "text", def: "" }],
    toDevices: (i, n): Device[] => {
      return rows.map((_, k): Device => ({
        id: `${i.id}_sw${k + 1}`,
        type: "SWITCH",
        nodes: [n[2 * k], n[2 * k + 1]],
        params: { closed: num(i, `closed${k + 1}`, 0), ron: 0.01, roff: 1e9 },
      }));
    },
  });
}

add({
  id: "relay_spst_5v",
  name: "Relais SPST 5V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spst_5v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(40,-20,26,-20), CIR(10,20,2.2,true), CIR(26,-20,2,true)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 120 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "relay_spst_12v",
  name: "Relais SPST 12V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spst_12v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(40,-20,26,-20), CIR(10,20,2.2,true), CIR(26,-20,2,true)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 288 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 12 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",288) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "relay_spdt_5v",
  name: "Relais SPDT 5V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spdt_5v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }, { name: "NC", x: 40, y: 0 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(40,-20,26,-20), L(40,0,26,0), CIR(10,20,2.2,true), CIR(26,-20,2,true), CIR(26,0,2,true)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 120 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id+"_nc", type: "VSWITCH", nodes: [n[2], n[4], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9, invert: 1 } },
  ],
});


add({
  id: "relay_spdt_12v",
  name: "Relais SPDT 12V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spdt_12v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }, { name: "NC", x: 40, y: 0 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(40,-20,26,-20), L(40,0,26,0), CIR(10,20,2.2,true), CIR(26,-20,2,true), CIR(26,0,2,true)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 288 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 12 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",288) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id+"_nc", type: "VSWITCH", nodes: [n[2], n[4], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9, invert: 1 } },
  ],
});


add({
  id: "relay_dpdt_5v",
  name: "Relais DPDT 5V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_dpdt_5v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM1", x: 40, y: -20 }, { name: "NO1", x: 40, y: -30 }, { name: "NC1", x: 40, y: -10 }, { name: "COM2", x: 40, y: 20 }, { name: "NO2", x: 40, y: 30 }, { name: "NC2", x: 40, y: 10 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,-20,40,-20), L(40,-30,26,-30), L(40,-10,26,-10), L(10,20,40,20), L(40,30,26,30), L(40,10,26,10), CIR(10,-20,2.2,true), CIR(26,-30,2,true), CIR(26,-10,2,true), CIR(10,20,2.2,true), CIR(26,30,2,true), CIR(26,10,2,true)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 120 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id+"_p1nc", type: "VSWITCH", nodes: [n[2], n[4], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9, invert: 1 } },
    { id: i.id+"_p2", type: "VSWITCH", nodes: [n[5], n[6], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id+"_p2nc", type: "VSWITCH", nodes: [n[5], n[7], n[0], n[1]], params: { von: num(i,"vpull",5), voff: num(i,"vpull",5)*0.5, ron: 0.05, roff: 1e9, invert: 1 } },
  ],
});


add({
  id: "relay_dpdt_12v",
  name: "Relais DPDT 12V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_dpdt_12v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM1", x: 40, y: -20 }, { name: "NO1", x: 40, y: -30 }, { name: "NC1", x: 40, y: -10 }, { name: "COM2", x: 40, y: 20 }, { name: "NO2", x: 40, y: 30 }, { name: "NC2", x: 40, y: 10 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,-20,40,-20), L(40,-30,26,-30), L(40,-10,26,-10), L(10,20,40,20), L(40,30,26,30), L(40,10,26,10), CIR(10,-20,2.2,true), CIR(26,-30,2,true), CIR(26,-10,2,true), CIR(10,20,2.2,true), CIR(26,30,2,true), CIR(26,10,2,true)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 288 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 12 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",288) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id+"_p1nc", type: "VSWITCH", nodes: [n[2], n[4], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9, invert: 1 } },
    { id: i.id+"_p2", type: "VSWITCH", nodes: [n[5], n[6], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9 } },
    { id: i.id+"_p2nc", type: "VSWITCH", nodes: [n[5], n[7], n[0], n[1]], params: { von: num(i,"vpull",12), voff: num(i,"vpull",12)*0.5, ron: 0.05, roff: 1e9, invert: 1 } },
  ],
});


const MCU_PIN_NAMES = ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"];
// W3: MCU-Box-Symbol – Stubs + Namen aus den Pin-Koordinaten (eine Quelle der Wahrheit)
function mcuBoxSymbol(label: string): SymbolPrim[] {
  return [
    RECT(-60, -100, 120, 200, 6),
    TXT(0, -80, label, 11),
    TXT(0, -62, "CO-SIM", 8),
    ...MCU_PIN_NAMES.map((_, i): SymbolPrim => { const y = (i < 11 ? i : i - 11) * 18 - 90; return i < 11 ? L(-70, y, -60, y) : L(60, y, 70, y); }),
    ...MCU_PIN_NAMES.map((pn, i): SymbolPrim => { const y = (i < 11 ? i : i - 11) * 18 - 90; return { t: "text", x: i < 11 ? -55 : 55, y: y + 3, s: pn, size: 7, align: i < 11 ? "left" : "right" }; }),
  ];
}

add({
  id: "bargraph_10",
  name: "Bargraph 10 LED",
  ref: "DS",
  category: "Anzeigen & Aktoren/Optisch",
  tags: ["bargraph","led"],
  mount: "THT",
  pins: Array.from({length:10}, (_,i)=>({ name: `LED${i}`, x: -40, y: -45+i*10 })).concat([{ name: "COM", x: 40, y: 0 }]),
  symbol: [RECT(-30,-50,60,100,4),
    ...Array.from({length:10}, (_,i)=>L(-40,-45+i*10,-30,-45+i*10) as SymbolPrim),
    L(30,0,40,0),
    ...Array.from({length:10}, (_,i)=>({ t: "rect", x: -20, y: -45+i*10, w: 20, h: 6, r:1 } as SymbolPrim))],
  params: [],
  toDevices: (i,n): Device[] => Array.from({length:10}, (_,k)=>({ id: `${i.id}_seg${k}`, type: "LED", nodes: [n[k], n[10]], params: { is: 1e-12, n:2.2, rs:20 } } as Device)),
});


add({
  id: "lcd_16x2",
  name: "LCD 16x2 Zeichen",
  ref: "DS",
  category: "Anzeigen & Aktoren/Optisch/Display",
  tags: ["lcd","display"],
  mount: "THT",
  pins: ["VSS","VDD","VO","RS","RW","E","D0","D1","D2","D3","D4","D5","D6","D7","A","K"].map((pn,i)=>({ name: pn, x: i<8?-60:60, y: (i%8)*12-42 })),
  symbol: [RECT(-50,-50,100,100,4), TXT(0,0,"LCD 16x2",10),
    ...Array.from({length:8}, (_,i)=>i*12-42).flatMap((y): SymbolPrim[] => [L(-60,y,-50,y), L(50,y,60,y)]),
    ...Array.from({length:8}, (_,i)=>i*12-42).flatMap((y): SymbolPrim[] => [
      { t: "text", x: -45, y: y+3, s: ["VSS","VDD","VO","RS","RW","E","D0","D1"][(y+42)/12], size: 7, align: "left" },
      { t: "text", x: 45, y: y+3, s: ["D2","D3","D4","D5","D6","D7","A","K"][(y+42)/12], size: 7, align: "right" },
    ]),
  ],
  params: [],
  toDevices: () => [],
});


add({
  id: "mcu_arduino_nano",
  name: "Arduino Nano",
  ref: "MCU",
  category: "Mikrocontroller",
  tags: ["mcu","arduino"],
  mount: "THT",
  interactive: "mcu",
  pins: ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"].map((pn,i)=>({ name: pn, x: i<11?-70:70, y: (i<11?i:i-11)*18-90 })),
  symbol: mcuBoxSymbol("Arduino"),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: 5, rout: 40 }, text: i.text }],
});


add({
  id: "mcu_arduino_mega",
  name: "Arduino Mega 2560",
  ref: "MCU",
  category: "Mikrocontroller",
  tags: ["mcu","arduino"],
  mount: "THT",
  interactive: "mcu",
  pins: ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"].map((pn,i)=>({ name: pn, x: i<11?-70:70, y: (i<11?i:i-11)*18-90 })),
  symbol: mcuBoxSymbol("Arduino"),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: 5, rout: 40 }, text: i.text }],
});


add({
  id: "mcu_esp32",
  name: "ESP32 DevKit",
  ref: "MCU",
  category: "Mikrocontroller",
  tags: ["mcu","esp32"],
  mount: "THT",
  interactive: "mcu",
  pins: ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"].map((pn,i)=>({ name: pn, x: i<11?-70:70, y: (i<11?i:i-11)*18-90 })),
  symbol: mcuBoxSymbol("ESP32"),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: 5, rout: 40 }, text: i.text }],
});


add({
  id: "mcu_stm32f103",
  name: "STM32F103 Blue Pill",
  ref: "MCU",
  category: "Mikrocontroller",
  tags: ["mcu","stm32"],
  mount: "THT",
  interactive: "mcu",
  pins: ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"].map((pn,i)=>({ name: pn, x: i<11?-70:70, y: (i<11?i:i-11)*18-90 })),
  symbol: mcuBoxSymbol("STM32F103"),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: 5, rout: 40 }, text: i.text }],
});


add({
  id: "mcu_attiny85",
  name: "ATtiny85",
  ref: "MCU",
  category: "Mikrocontroller",
  tags: ["mcu","avr"],
  mount: "THT",
  interactive: "mcu",
  pins: ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"].map((pn,i)=>({ name: pn, x: i<11?-70:70, y: (i<11?i:i-11)*18-90 })),
  symbol: mcuBoxSymbol("ATtiny85"),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: 5, rout: 40 }, text: i.text }],
});


add({
  id: "mcu_pic16f877",
  name: "PIC16F877A",
  ref: "MCU",
  category: "Mikrocontroller",
  tags: ["mcu","pic"],
  mount: "THT",
  interactive: "mcu",
  pins: ["D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","A0","A1","A2","A3","A4","A5","VCC","GND"].map((pn,i)=>({ name: pn, x: i<11?-70:70, y: (i<11?i:i-11)*18-90 })),
  symbol: mcuBoxSymbol("PIC16F877A"),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "MCU", nodes: n, params: { vdd: 5, rout: 40 }, text: i.text }],
});


add({
  id: "resistor_var",
  name: "Widerstand variabel",
  ref: "R",
  category: "Passive Bauteile/Widerstände",
  tags: ["var","pot"],
  mount: "THT",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [...resSymbol, L(0,-20,10,-10)],
  params: [{ key: "r", label: "R", unit: "Ω", type: "number", def: 1000 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "R", nodes: n, params: { r: num(i,"r",1000) } }],
});


add({
  id: "capacitor_var",
  name: "Kondensator variabel",
  ref: "C",
  category: "Passive Bauteile/Kondensatoren",
  tags: ["var","trimmer"],
  mount: "THT",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [...capSymbol, L(0,-20,10,-10)],
  params: [{ key: "c", label: "C", unit: "F", type: "number", def: 1e-9 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "C", nodes: n, params: { c: num(i,"c",1e-9) } }],
});


add({
  id: "onpage_connector",
  name: "Netzverbinder (On-Page)",
  ref: "J",
  category: "Verbinder",
  tags: ["verbinder", "on-page", "onpage", "netz", "virtuell", "netzname"],
  description: "Verbindet Netze ohne Leitung: Alle Verbinder mit gleichem Netznamen in diesem Entwurf sind elektrisch verbunden (z. B. VCC an mehreren Stellen). Keine Stücklisten-Position.",
  mount: "virtual",
  pins: [{ name: "1", x: -30, y: 0 }],
  symbol: [L(-30, 0, -12, 0), L(-12, -10, 16, -10, 26, 0, 16, 10, -12, 10, -12, -10)],
  params: [{ key: "name", label: "Netzname", type: "text", def: "NET_A" }],
  toDevices: () => [],
});

/* ---------------- S5.6c · Beschreibungsbox (Dokumentation, pinlos) ---------------- */
add({
  id: "descbox",
  name: "Beschreibungsbox",
  ref: "TB",
  category: "Dokumentation",
  tags: ["notiz", "text", "beschreibung", "dokumentation", "live", "messwert"],
  description: "Textkasten für die Doku: {V(NETZ)}, {I(BAUTEIL)} und {P(BAUTEIL)} werden im Betrieb durch echte Messwerte ersetzt. Keine Stücklisten-Position.",
  mount: "virtual",
  pins: [],
  symbol: [RECT(-90, -40, 180, 80, 6)],
  params: [
    { key: "text", label: "Text", type: "text", def: "Ausgang: {V(OUT)}" },
    { key: "size", label: "Schriftgröße", type: "number", def: 11 },
  ],
  toDevices: () => [],
});

/* ---------------- S3.1 · Bus-Tap & Bus-Splitter ----------------
 * Elektrisches Modell (ehrlich, s. DESIGN): Die Bus-Leitung ist ein rein
 * visuelles Bündel + Deklaration. Elektrisch wirken NUR Tap/Splitter per
 * Namensbindung (`BUS[bit]`, gleicher Mechanismus wie On-Page-Verbinder).
 * Geometrische Berührung mit einer Bus-Leitung verbindet NICHTS. */
/** S3.4: Elektrischer Pin-Typ (Default passiv) — gilt auch für dynamische Pins. */
export const pinElectrical = (part: PartDef, params: Record<string, number | string | boolean>, idx: number): PinElectrical =>
  partPins(part, params)[idx]?.electrical ?? "passive";

export const splitterWidth = (params: Record<string, number | string | boolean>): number => {
  const w = Number(params?.width ?? 8);
  return w === 2 || w === 4 || w === 8 || w === 16 ? w : 8;
};
const splitterPins = (w: number): PinDef[] => {
  const P = 20;
  const pins: PinDef[] = [{ name: "BUS", x: -40, y: 0 }];
  for (let i = 0; i < w; i++) pins.push({ name: String(i), x: 40, y: -(w * P) / 2 + P / 2 + i * P });
  return pins;
};
const splitterSymbol = (w: number): SymbolPrim[] => {
  const P = 20;
  const top = -(w * P) / 2 - 10;
  const prims: SymbolPrim[] = [RECT(-30, top, 60, w * P + 20, 3), L(-40, 0, -30, 0), TXT(-24, 4, "BUS", 9)];
  for (let i = 0; i < w; i++) {
    const y = -(w * P) / 2 + P / 2 + i * P;
    prims.push(L(30, y, 40, y), TXT(20, y + 3, String(i), 8));
  }
  return prims;
};

add({
  id: "bus_tap",
  name: "Bus-Abgriff (Tap)",
  ref: "T",
  category: "Verbinder/Bus",
  tags: ["bus", "tap", "abgriff", "bit", "virtuell"],
  description: "Bindet eine Leitung an ein Bus-Bit: Alle Taps mit gleichem Bus + Bit sind elektrisch verbunden (z. B. D[3] an mehreren Stellen). Der Bus selbst ist nur ein gezeichnetes Bündel. Keine Stücklisten-Position.",
  mount: "virtual",
  pins: [{ name: "1", x: -30, y: 0 }],
  symbol: [L(-30, 0, -12, 0), RECT(-12, -9, 26, 18, 3), L(14, -9, 22, 0), L(22, 0, 14, 9)],
  params: [
    { key: "bus", label: "Busname", type: "text", def: "D" },
    { key: "bit", label: "Bit", type: "number", def: 0, min: 0, max: 31 },
  ],
  toDevices: () => [],
});

add({
  id: "bus_splitter",
  name: "Bus-Splitter",
  ref: "T",
  category: "Verbinder/Bus",
  tags: ["bus", "splitter", "verteiler", "breite", "virtuell"],
  description: "Fächert einen Bus in Einzelleitungen auf (oder bündelt sie): Bit-Pin i ist mit BUS[i] verbunden. BUS-Pin ist ein rein visueller Anker (NC). Breite 2/4/8/16. Keine Stücklisten-Position.",
  mount: "virtual",
  pins: splitterPins(8),
  symbol: splitterSymbol(8),
  params: [
    { key: "bus", label: "Busname", type: "text", def: "D" },
    { key: "width", label: "Breite", type: "select", def: 8, options: [{ value: 2, label: "2 Bit" }, { value: 4, label: "4 Bit" }, { value: 8, label: "8 Bit" }, { value: 16, label: "16 Bit" }] },
  ],
  pinsFor: (p) => splitterPins(splitterWidth(p)),
  symbolFor: (p) => splitterSymbol(splitterWidth(p)),
  toDevices: () => [],
});

add({
  id: "connector_2",
  name: "Stiftleiste 2-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","2pol"],
  mount: "THT",
  pins: Array.from({length:2}, (_,i)=>({ name: `${i+1}`, x: 0, y: -10+i*10 })),
  symbol: [RECT(-10,-10-5,20,20+10,2), ...Array.from({length:2}, (_,i)=>L(-10,-10+i*10,10,-10+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_3",
  name: "Stiftleiste 3-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","3pol"],
  mount: "THT",
  pins: Array.from({length:3}, (_,i)=>({ name: `${i+1}`, x: 0, y: -15+i*10 })),
  symbol: [RECT(-10,-15-5,20,30+10,2), ...Array.from({length:3}, (_,i)=>L(-10,-15+i*10,10,-15+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_4",
  name: "Stiftleiste 4-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","4pol"],
  mount: "THT",
  pins: Array.from({length:4}, (_,i)=>({ name: `${i+1}`, x: 0, y: -20+i*10 })),
  symbol: [RECT(-10,-20-5,20,40+10,2), ...Array.from({length:4}, (_,i)=>L(-10,-20+i*10,10,-20+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_6",
  name: "Stiftleiste 6-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","6pol"],
  mount: "THT",
  pins: Array.from({length:6}, (_,i)=>({ name: `${i+1}`, x: 0, y: -30+i*10 })),
  symbol: [RECT(-10,-30-5,20,60+10,2), ...Array.from({length:6}, (_,i)=>L(-10,-30+i*10,10,-30+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_8",
  name: "Stiftleiste 8-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","8pol"],
  mount: "THT",
  pins: Array.from({length:8}, (_,i)=>({ name: `${i+1}`, x: 0, y: -40+i*10 })),
  symbol: [RECT(-10,-40-5,20,80+10,2), ...Array.from({length:8}, (_,i)=>L(-10,-40+i*10,10,-40+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_10",
  name: "Stiftleiste 10-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","10pol"],
  mount: "THT",
  pins: Array.from({length:10}, (_,i)=>({ name: `${i+1}`, x: 0, y: -50+i*10 })),
  symbol: [RECT(-10,-50-5,20,100+10,2), ...Array.from({length:10}, (_,i)=>L(-10,-50+i*10,10,-50+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_16",
  name: "Stiftleiste 16-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","16pol"],
  mount: "THT",
  pins: Array.from({length:16}, (_,i)=>({ name: `${i+1}`, x: 0, y: -80+i*10 })),
  symbol: [RECT(-10,-80-5,20,160+10,2), ...Array.from({length:16}, (_,i)=>L(-10,-80+i*10,10,-80+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_20",
  name: "Stiftleiste 20-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","20pol"],
  mount: "THT",
  pins: Array.from({length:20}, (_,i)=>({ name: `${i+1}`, x: 0, y: -100+i*10 })),
  symbol: [RECT(-10,-100-5,20,200+10,2), ...Array.from({length:20}, (_,i)=>L(-10,-100+i*10,10,-100+i*10))],
  params: [],
  toDevices: () => [],
});


add({
  id: "connector_40",
  name: "Stiftleiste 40-polig",
  ref: "J",
  category: "Verbinder",
  tags: ["connector","40pol"],
  mount: "THT",
  pins: Array.from({length:40}, (_,i)=>({ name: `${i+1}`, x: 0, y: -200+i*10 })),
  symbol: [RECT(-10,-200-5,20,400+10,2), ...Array.from({length:40}, (_,i)=>L(-10,-200+i*10,10,-200+i*10))],
  params: [],
  toDevices: () => [],
});


/* -------------------------- registry API -------------------------- */

/* ================= W25: Raster-Normalisierung =================
 * Jeder Anschlusspunkt muss exakt auf dem GRID(10) liegen, damit Drähte
 * ohne sichtbaren Versatz andocken. Pro Pin-Seite (gleicher x-Wert) werden
 * Off-Grid-Pins auf eine einheitliche 20er-Teilung zentriert; Einzelpins
 * runden nach außen aufs 10er-Raster. Bereits rasterige Gruppen bleiben
 * unangetastet. Symbol-Stub-Enden, Stub-Ansätze und Pin-Beschriftungen
 * wandern exakt mit, IC-Bodies wachsen bei Bedarf. Quelle der Wahrheit
 * bleibt der Pin (W3-Kongruenz bleibt gewahrt). */
{
  const r10 = (v: number) => Math.sign(v) * Math.round(Math.abs(v) / 10) * 10;
  const out10 = (v: number) => (v === 0 ? 0 : Math.sign(v) * Math.max(10, Math.ceil(Math.abs(v) / 10 - 1e-9) * 10));
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.51;
  for (const part of parts) {
    const pins = part.pins ?? [];
    if (!pins.length) continue;
    const moves: Array<{ ox: number; oy: number; nx: number; ny: number }> = [];
    const byX = new Map<number, PinDef[]>();
    for (const pin of pins) {
      const arr = byX.get(pin.x) ?? [];
      arr.push(pin);
      byX.set(pin.x, arr);
    }
    for (const group of byX.values()) {
      const nx = out10(group[0].x);
      if (group.length === 1) {
        const q = group[0];
        const ny = q.y % 10 === 0 ? q.y : out10(q.y);
        if (nx !== q.x || ny !== q.y) moves.push({ ox: q.x, oy: q.y, nx, ny });
      } else {
        const sorted = [...group].sort((a, b) => a.y - b.y);
        const gridOk = sorted.every((q) => q.y % 10 === 0);
        sorted.forEach((q, i) => {
          let ny = q.y;
          if (!gridOk) {
            const center = (sorted[0].y + sorted[sorted.length - 1].y) / 2;
            const off = r10(center);
            ny = off + (i - (sorted.length - 1) / 2) * 20;
          }
          if (nx !== q.x || ny !== q.y) moves.push({ ox: q.x, oy: q.y, nx, ny });
        });
      }
    }
    if (!moves.length) continue;
    for (const q of pins) {
      const m = moves.find((mv) => near(mv.ox, q.x) && near(mv.oy, q.y));
      if (m) { q.x = m.nx; q.y = m.ny; }
    }
    for (const prim of part.symbol) {
      if (prim.t === "line") {
        for (let i = 0; i + 1 < prim.pts.length; i += 2) {
          const ex = prim.pts[i], ey = prim.pts[i + 1];
          const exact = moves.find((mv) => near(mv.ox, ex) && near(mv.oy, ey));
          if (exact) { prim.pts[i] = exact.nx; prim.pts[i + 1] = exact.ny; continue; }
          // Stub-Ansatz an der Body-Kante: teilt das alte Pin-y, gleiche Seite
          // (bei Mittellinien-Pins x=0 zählen Endpunkte beider Seiten)
          const edge = moves.find(
            (mv) => near(mv.oy, ey) &&
              (mv.ox === 0
                ? Math.abs(ex) <= 25
                : Math.sign(ex) === Math.sign(mv.ox) &&
                  Math.abs(ex) <= Math.abs(mv.ox) && Math.abs(mv.ox) - Math.abs(ex) <= 25),
          );
          if (edge) prim.pts[i + 1] = ey + (edge.ny - edge.oy);
        }
      } else if (prim.t === "text") {
        // Pin-Beschriftungen sitzen auf (Kante ±6, pin.y + 3)
        if (Math.abs(prim.x) >= 12) {
          const m = moves.find(
            (mv) => near(mv.oy + 3, prim.y) && Math.sign(prim.x) === Math.sign(mv.ox) &&
              Math.abs(prim.x) <= Math.abs(mv.ox),
          );
          if (m) prim.y += m.ny - m.oy;
        }
      } else if (prim.t === "circle" || prim.t === "arc") {
        const m = moves.find((mv) => near(mv.ox, prim.x) && near(mv.oy, prim.y));
        if (m) { prim.x = m.nx; prim.y = m.ny; }
      }
    }
    // Body-Rechtecke wachsen, wenn Pins über Ober-/Unterkannte hinausragen
    for (const prim of part.symbol) {
      if (prim.t !== "rect" || prim.w < 16 || prim.h < 20) continue;
      const cy = prim.y + prim.h / 2;
      let need = 0;
      for (const q of pins) need = Math.max(need, Math.abs(q.y - cy) + 8);
      if (need > prim.h / 2) {
        prim.h = Math.ceil(need) * 2;
        prim.y = cy - prim.h / 2;
      }
    }
  }
}

export const PARTS: PartDef[] = parts;
export const PART_MAP: Record<string, PartDef> = Object.fromEntries(parts.map((p2) => [p2.id, p2]));

export function defaultParams(part: PartDef): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  for (const p2 of part.params) out[p2.key] = p2.def;
  return out;
}

export interface CategoryNode {
  name: string;
  path: string;
  children: CategoryNode[];
  parts: PartDef[];
}

export function buildCategoryTree(list: PartDef[] = PARTS): CategoryNode {
  const root: CategoryNode = { name: "Bibliothek", path: "", children: [], parts: [] };
  for (const part of list) {
    const segs = part.category.split("/");
    let node = root;
    let path = "";
    for (const seg of segs) {
      path = path ? `${path}/${seg}` : seg;
      let child = node.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, path, children: [], parts: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.parts.push(part);
  }
  return root;
}

export function searchParts(query: string, list: PartDef[] = PARTS): PartDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (p2) =>
      p2.name.toLowerCase().includes(q) ||
      p2.id.toLowerCase().includes(q) ||
      p2.category.toLowerCase().includes(q) ||
      p2.tags.some((t) => t.includes(q)),
  );
}
