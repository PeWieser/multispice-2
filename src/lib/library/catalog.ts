/**
 * Component library: schematic symbols, parameters, footprints and the mapping
 * to SPICE primitives. Families (logic gates, 74xx, 4000, sources...) are
 * generated to keep the catalog broad but maintainable.
 */

import { Device, SourceSpec } from "@/lib/sim/engine";

export type SymbolPrim =
  | { t: "line"; pts: number[]; w?: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: boolean }
  | { t: "circle"; x: number; y: number; r: number; fill?: boolean }
  | { t: "arc"; x: number; y: number; r: number; a0: number; a1: number }
  | { t: "text"; x: number; y: number; s: string; size?: number; align?: "center" | "left" | "right" };

export interface PinDef {
  name: string;
  x: number;
  y: number;
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
export function parseValue(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().replace(/[ΩΩ]/g, "").replace(/(F|H|V|A|Hz|ohm)$/i, "");
  const m = /^(-?\d*\.?\d*)\s*(meg|k|m|u|µ|n|p|f|g|t|r)?(\d*)$/i.exec(s);
  if (!m) return Number(s);
  const mult: Record<string, number> = {
    t: 1e12, g: 1e9, meg: 1e6, k: 1e3, "": 1, r: 1, m: 1e-3, u: 1e-6, "µ": 1e-6, n: 1e-9, p: 1e-12, f: 1e-15,
  };
  const suffix = (m[2] ?? "").toLowerCase();
  let base = parseFloat(m[1] || "0");
  if (m[3]) base = parseFloat(`${m[1]}.${m[3]}`);
  return base * (mult[suffix] ?? 1);
}

/** Formats a value with SI prefix. */
export function formatValue(v: number, unit = "", digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return `0 ${unit}`.trim();
  const prefixes: Array<[number, string]> = [
    [1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"],
  ];
  for (const [f, p] of prefixes) {
    if (a >= f) return `${(v / f).toPrecision(digits).replace(/\.?0+$/, "")} ${p}${unit}`.trim();
  }
  return `${v.toExponential(2)} ${unit}`.trim();
}

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

function bjtSymbol(pnp: boolean): SymbolPrim[] {
  return [
    L(-20, 0, -6, 0),
    L(-6, -16, -6, 16),
    L(-6, -8, 12, -18, 12, -28),
    L(-6, 8, 12, 18, 12, 28),
    pnp ? L(-2, -2, -6, -8, 4, -6, -2, -2) : L(6, 14, 12, 18, 4, 22, 6, 14),
    CIR(0, 0, 24),
  ];
}

function mosSymbol(p: boolean): SymbolPrim[] {
  return [
    L(-20, 0, -8, 0),
    L(-8, -16, -8, 16),
    L(-2, -16, -2, -6),
    L(-2, -5, -2, 5),
    L(-2, 6, -2, 16),
    L(-2, -11, 14, -11, 14, -28),
    L(-2, 11, 14, 11, 14, 28),
    L(-2, 0, 14, 0, 14, 11),
    p ? L(8, -4, 2, 0, 8, 4, 8, -4) : L(4, -4, 10, 0, 4, 4, 4, -4),
    CIR(0, 0, 24),
  ];
}

const gndSymbol: SymbolPrim[] = [L(0, -14, 0, 0), L(-14, 0, 14, 0), L(-9, 5, 9, 5), L(-4, 10, 4, 10)];

function icSymbol(w: number, h: number, label: string, pinsLeft: string[], pinsRight: string[]): SymbolPrim[] {
  // Steve Jobs: Pins must be exactly at wire tip, no gap – use 5px stub for clean look
  const prims: SymbolPrim[] = [RECT(-w / 2, -h / 2, w, h, 4), TXT(0, -h / 2 + 12, label, 10)];
  pinsLeft.forEach((p, i) => {
    const y = -h / 2 + 22 + i * 16;
    prims.push(L(-w / 2 - 5, y, -w / 2, y));
    prims.push({ t: "text", x: -w / 2 + 6, y: y + 3, s: p, size: 7, align: "left" });
  });
  pinsRight.forEach((p, i) => {
    const y = -h / 2 + 22 + i * 16;
    prims.push(L(w / 2, y, w / 2 + 5, y));
    prims.push({ t: "text", x: w / 2 - 6, y: y + 3, s: p, size: 7, align: "right" });
  });
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
  ],
  toDevices: (i, n) => [{ id: i.id, type: "TRANSFORMER", nodes: n, params: { ratio: num(i, "ratio", 10), lp: num(i, "lp", 10), k: num(i, "k", 0.995) } }],
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
  ],
  toDevices: (i, n) => [{ id: i.id, type: "FUSE", nodes: n, params: { r: num(i, "r", 0.05), irated: num(i, "irated", 1) } }],
});

/* ---------------- Sources ---------------- */
add({
  id: "gnd",
  name: "Masse (GND)",
  ref: "GND",
  category: "Quellen/Referenz",
  tags: ["masse", "gnd", "ground", "bezug"],
  mount: "virtual",
  pins: [{ name: "1", x: 0, y: -14 }],
  symbol: gndSymbol,
  params: [],
  toDevices: () => [],
});

add({
  id: "vcc",
  name: "Versorgungsschiene VCC",
  ref: "VCC",
  category: "Quellen/Referenz",
  tags: ["vcc", "rail", "versorgung"],
  mount: "virtual",
  pins: [{ name: "1", x: 0, y: 14 }],
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
  pins: [{ name: "+", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
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
  pins: [{ name: "+", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
  symbol: [CIR(0, 0, 20), L(0, -30, 0, -20), L(0, 20, 0, 30), { t: "arc", x: -5, y: 0, r: 5, a0: Math.PI, a1: 0 }, { t: "arc", x: 5, y: 0, r: 5, a0: 0, a1: Math.PI }],
  params: waveParams,
  toDevices: (i, n) => [{ id: i.id, type: "V", nodes: n, params: { rser: 0.001 }, source: sourceFromParams(i) }],
});

add({
  id: "funcgen",
  name: "Funktionsgenerator (XFG)",
  ref: "XFG",
  category: "Quellen/Instrumente",
  tags: ["funktionsgenerator", "xfg", "instrument"],
  mount: "virtual",
  interactive: "generator",
  pins: [{ name: "+", x: -30, y: 20 }, { name: "COM", x: 0, y: 30 }, { name: "-", x: 30, y: 20 }],
  symbol: [RECT(-34, -24, 68, 48, 6), TXT(0, -6, "XFG", 11), TXT(0, 10, "~", 14)],
  params: waveParams,
  toDevices: (i, n) => [
    { id: i.id, type: "V", nodes: [n[0], n[1]], params: { rser: 50 }, source: sourceFromParams(i) },
    { id: i.id + "_n", type: "V", nodes: [n[2], n[1]], params: { rser: 50 }, source: { ...sourceFromParams(i), amplitude: -num(i, "amplitude", 5) } },
  ],
});

add({
  id: "vpulse",
  name: "Pulsquelle",
  ref: "V",
  category: "Quellen/Unabhängig",
  tags: ["puls", "clock", "takt"],
  mount: "virtual",
  pins: [{ name: "+", x: 0, y: -30 }, { name: "-", x: 0, y: 30 }],
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
    ],
    spice: `.model ${dm.id.toUpperCase()} D(IS=${dm.is} N=${dm.n} BV=${dm.bv} RS=0.1 CJO=4p)`,
    toDevices: (i, n) => [{ id: i.id, type: dm.type, nodes: n, params: { is: num(i, "is", dm.is), n: num(i, "n", dm.n), bv: num(i, "bv", dm.bv), rs: num(i, "rs", 0.1), cjo: num(i, "cjo", 4e-12) } }],
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
      P.tol,
    ],
    spice: `.model ${b.id.toUpperCase()} ${b.pnp ? "PNP" : "NPN"}(IS=${b.is} BF=${b.bf} VAF=100 CJE=4.5p CJC=3.6p)`,
    toDevices: (i, n) => [{ id: i.id, type: "Q", nodes: n, params: { bf: num(i, "bf", b.bf), is: num(i, "is", b.is), vaf: num(i, "vaf", 100), br: num(i, "br", 4), cje: num(i, "cje", 4.5e-12), cjc: num(i, "cjc", 3.6e-12), pnp: b.pnp ? 1 : 0, tol: num(i, "tol", 10) } }],
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
      { key: "w", label: "Kanalweite W", unit: "m", type: "number", def: 1e-3 },
      { key: "l", label: "Kanallänge L", unit: "m", type: "number", def: 1e-5 },
      { key: "lambda", label: "Kanallängenmodulation λ", type: "number", def: 0.02 },
      { key: "cgs", label: "CGS", unit: "F", type: "number", def: 1e-11 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i, "vto", m.vto), kp: num(i, "kp", m.kp), w: num(i, "w", 1e-3), l: num(i, "l", 1e-5), lambda: num(i, "lambda", 0.02), cgs: num(i, "cgs", 1e-11), pmos: m.p ? 1 : 0 } }],
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
    { key: "lambda", label: "λ", type: "number", def: 0.01 },
  ],
  toDevices: (i, n) => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i, "vto", -3), beta: num(i, "beta", 1.3e-3), lambda: num(i, "lambda", 0.01) } }],
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
const opamps: Array<{ id: string; name: string; gain: number; gbw: number; slew: number }> = [
  { id: "opamp_ideal", name: "Idealer OPV", gain: 1e6, gbw: 1e8, slew: 1e9 },
  { id: "opamp_lm741", name: "LM741", gain: 2e5, gbw: 1e6, slew: 0.5e6 },
  { id: "opamp_tl084", name: "TL084 (JFET)", gain: 2e5, gbw: 3e6, slew: 13e6 },
  { id: "opamp_ne5532", name: "NE5532 (Audio)", gain: 5e4, gbw: 10e6, slew: 9e6 },
  { id: "opamp_lm358", name: "LM358 (Single Supply)", gain: 1e5, gbw: 1e6, slew: 0.6e6 },
];
for (const o of opamps) {
  add({
    id: o.id,
    name: o.name,
    ref: "U",
    category: "Analoge ICs/Operationsverstärker",
    tags: ["opv", "opamp", "verstärker", o.id],
    mount: "both",
    footprint: "DIP-8 / SOIC-8",
    pins: [
      { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
      { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
    ],
    symbol: [
      { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
      L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
      TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
    ],
    params: [
      { key: "gain", label: "Leerlaufverstärkung", type: "number", def: o.gain },
      { key: "gbw", label: "Verstärkungs-Bandbreite", unit: "Hz", type: "number", def: o.gbw },
      { key: "rin", label: "Eingangswiderstand", unit: "Ω", type: "number", def: 2e6 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 75 },
      { key: "vdrop", label: "Aussteuerungsreserve", unit: "V", type: "number", def: 1.2 },
      { key: "vcc", label: "V+ (falls unverbunden)", unit: "V", type: "number", def: 15 },
      { key: "vee", label: "V- (falls unverbunden)", unit: "V", type: "number", def: -15 },
    ],
    toDevices: (i, n) => [{
      id: i.id, type: "OPAMP", nodes: [n[0], n[1], n[2], conn(n[3]), conn(n[4])],
      params: { gain: num(i, "gain", o.gain), gbw: num(i, "gbw", o.gbw), rin: num(i, "rin", 2e6), rout: num(i, "rout", 75), vdrop: num(i, "vdrop", 1.2), vcc: num(i, "vcc", 15), vee: num(i, "vee", -15) },
    }],
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
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "GND", x: 0, y: 30 },
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

add({
  id: "ne555",
  name: "NE555 Timer",
  ref: "U",
  category: "Analoge ICs/Timer",
  tags: ["555", "timer", "ne555", "astabil"],
  mount: "both",
  footprint: "DIP-8",
  pins: [
    { name: "GND", x: -40, y: 36 }, { name: "TRIG", x: -40, y: 12 }, { name: "OUT", x: 40, y: -12 },
    { name: "RST", x: -40, y: -12 }, { name: "CTRL", x: 40, y: 36 }, { name: "THR", x: 40, y: 12 },
    { name: "DIS", x: -40, y: -36 }, { name: "VCC", x: 40, y: -36 },
  ],
  symbol: icSymbol(70, 96, "555", ["DIS", "RST", "TRG", "GND"], ["VCC", "OUT", "THR", "CTL"]),
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
    category: "Analoge ICs/Spannungsregler",
    tags: ["regler", "78xx", "lm317", "versorgung"],
    mount: "THT",
    footprint: "TO-220",
    pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND/ADJ", x: 0, y: 30 }],
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
  for (let k = 0; k < g.inputs; k++) pins.push({ name: String.fromCharCode(65 + k), x: -40, y: -((g.inputs - 1) * 10) + k * 20 });
  pins.push({ name: "Y", x: 40, y: 0 });
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
  inputs.forEach((pn, i2) => pins.push({ name: pn, x: -w / 2 - 5, y: -h / 2 + 22 + i2 * 16 }));
  outputs.forEach((pn, i2) => pins.push({ name: pn, x: w / 2 + 5, y: -h / 2 + 22 + i2 * 16 }));
  add({
    id: s.id,
    name: s.name,
    ref: "U",
    category: s.id.startsWith("counter") || s.id.startsWith("shift") ? "Digitale Logik/Zähler & Register" : s.id.includes("ff") || s.id.includes("latch") ? "Digitale Logik/Flip-Flops" : "Digitale Logik/Kombinatorik",
    tags: ["logik", "digital", ...s.tags],
    mount: "both",
    pins,
    symbol: icSymbol(w, h, s.name.split(" ")[0], inputs, outputs),
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
    { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 },
  ],
  symbol: [RECT(-30, -14, 24, 28, 2), L(-40, -20, -30, -20), L(-40, 20, -30, 20), L(-30, -20, -30, 20), L(10, 20, 40, 20), L(10, 20, 26, -14), L(40, -20, 26, -20), L(-2, -10, -2, 10)],
  params: [
    { key: "rcoil", label: "Spulenwiderstand", unit: "Ω", type: "number", def: 120 },
    { key: "vpull", label: "Anzugsspannung", unit: "V", type: "number", def: 4 },
  ],
  toDevices: (i, n): Device[] => [
    { id: i.id + "_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i, "rcoil", 120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i, "vpull", 4), voff: num(i, "vpull", 4) * 0.5, ron: 0.05, roff: 1e9 } },
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
  symbol: [L(-30, 0, -14, 0), CIR(-14, 0, 3), L(-12, -2, 14, -14), CIR(14, 0, 3), L(14, 0, 30, 0)],
  params: [
    { key: "closed", label: "Geschlossen", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
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
  symbol: [L(-30, 0, -14, 0), L(14, 0, 30, 0), L(-14, -6, 14, -6), L(0, -6, 0, -16), L(-10, -16, 10, -16)],
  params: [
    { key: "closed", label: "Gedrückt", type: "bool", def: false },
    { key: "ron", label: "Kontaktwiderstand", unit: "Ω", type: "number", def: 0.01 },
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
  pins: ["a", "b", "c", "d", "e", "f", "g", "COM"].map((pn, i) => ({ name: pn, x: i < 4 ? -50 : 50, y: (i % 4) * 20 - 30 })),
  symbol: [
    RECT(-40, -45, 80, 90, 4),
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

/* ---------------- Measurement ---------------- */
add({
  id: "voltmeter",
  name: "Voltmeter",
  ref: "MV",
  category: "Messgeräte/Inline",
  tags: ["voltmeter", "spannung", "messen"],
  mount: "virtual",
  pins: [{ name: "+", x: -30, y: 0 }, { name: "-", x: 30, y: 0 }],
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
  pins: [{ name: "1", x: 0, y: 20 }],
  symbol: [CIR(0, 0, 10), L(0, 10, 0, 20), TXT(0, 4, "P", 9)],
  params: [],
  toDevices: () => [],
});


/* ---------------- 4000 CMOS series – expanded ---------------- */
const cmosGates: Array<{ id: string; name: string; model: string; inputs: number; inv: boolean; desc: string }> = [
  { id: "cmos_4001", name: "CD4001 Quad NOR (2 Eingänge)", model: "nor2", inputs: 2, inv: true, desc: "4001" },
  { id: "cmos_4011", name: "CD4011 Quad NAND (2 Eingänge)", model: "nand2", inputs: 2, inv: true, desc: "4011" },
  { id: "cmos_4012", name: "CD4012 Dual NAND (4 Eingänge)", model: "nand4", inputs: 4, inv: true, desc: "4012" },
  { id: "cmos_4023", name: "CD4023 Triple NAND (3 Eingänge)", model: "nand3", inputs: 3, inv: true, desc: "4023" },
  { id: "cmos_4002", name: "CD4002 Dual NOR (4 Eingänge)", model: "nor4", inputs: 4, inv: true, desc: "4002" },
  { id: "cmos_4025", name: "CD4025 Triple NOR (3 Eingänge)", model: "nor3", inputs: 3, inv: true, desc: "4025" },
  { id: "cmos_4071", name: "CD4071 Quad OR (2 Eingänge)", model: "or2", inputs: 2, inv: false, desc: "4071" },
  { id: "cmos_4072", name: "CD4072 Dual OR (4 Eingänge)", model: "or4", inputs: 4, inv: false, desc: "4072" },
  { id: "cmos_4075", name: "CD4075 Triple OR (3 Eingänge)", model: "or3", inputs: 3, inv: false, desc: "4075" },
  { id: "cmos_4081", name: "CD4081 Quad AND (2 Eingänge)", model: "and2", inputs: 2, inv: false, desc: "4081" },
  { id: "cmos_4082", name: "CD4082 Dual AND (4 Eingänge)", model: "and4", inputs: 4, inv: false, desc: "4082" },
  { id: "cmos_4073", name: "CD4073 Triple AND (3 Eingänge)", model: "and3", inputs: 3, inv: false, desc: "4073" },
  { id: "cmos_4069", name: "CD4069 Hex Inverter", model: "not", inputs: 1, inv: true, desc: "4069" },
  { id: "cmos_4049", name: "CD4049 Hex Inverter Buffer", model: "not", inputs: 1, inv: true, desc: "4049" },
  { id: "cmos_4050", name: "CD4050 Hex Buffer", model: "buffer", inputs: 1, inv: false, desc: "4050" },
  { id: "cmos_4070", name: "CD4070 Quad XOR", model: "xor2", inputs: 2, inv: false, desc: "4070" },
  { id: "cmos_4077", name: "CD4077 Quad XNOR", model: "xnor2", inputs: 2, inv: true, desc: "4077" },
  { id: "cmos_4030", name: "CD4030 Quad XOR (alt)", model: "xor2", inputs: 2, inv: false, desc: "4030" },
];

for (const g of cmosGates) {
  const h = Math.max(40, g.inputs * 20 + 20);
  const pins: PinDef[] = [];
  for (let k = 0; k < g.inputs; k++) pins.push({ name: String.fromCharCode(65 + k), x: -40, y: -((g.inputs - 1) * 10) + k * 20 });
  pins.push({ name: "Y", x: 40, y: 0 });
  const sym: SymbolPrim[] = [RECT(-26, -h / 2, 52, h, 3), TXT(0, 5, g.desc, 10)];
  for (const pin of pins) {
    if (pin.x < 0) sym.push(L(-40, pin.y, -26, pin.y));
    else sym.push(L(g.inv ? 32 : 26, 0, 40, 0));
  }
  if (g.inv) sym.push(CIR(29, 0, 4));
  add({
    id: g.id,
    name: g.name,
    ref: "U",
    category: "Digitale Logik/4000 CMOS",
    tags: ["cmos", "4000", g.desc.toLowerCase(), "logik", g.model],
    mount: "both",
    footprint: "DIP-14 / SOIC-14",
    pins,
    symbol: sym,
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 10 },
      { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 5 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "GATE", nodes: n, model: g.model, params: { vdd: num(i, "vdd", 10), vth: num(i, "vth", 5), rout: num(i, "rout", 400) } }],
  });
}

// 4000 series complex
const cmosComplex: Array<{ id: string; name: string; model: string; pins: string[]; desc: string; tags: string[] }> = [
  { id: "cmos_4013", name: "CD4013 Dual D-Flip-Flop", model: "dff", pins: ["D1", "CLK1", "RST1", "SET1", "Q1", "/Q1", "D2", "CLK2", "RST2", "SET2", "Q2", "/Q2"], desc: "4013", tags: ["flipflop", "4013"] },
  { id: "cmos_4017", name: "CD4017 Dekadenzähler", model: "counter10", pins: ["CLK", "RST", "EN", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "COUT"], desc: "4017", tags: ["zähler", "4017", "dekade"] },
  { id: "cmos_4020", name: "CD4020 14-Bit Binärzähler", model: "counter14", pins: ["CLK", "RST", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13"], desc: "4020", tags: ["zähler", "4020"] },
  { id: "cmos_4040", name: "CD4040 12-Bit Binärzähler", model: "counter12", pins: ["CLK", "RST", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11"], desc: "4040", tags: ["zähler", "4040"] },
  { id: "cmos_4060", name: "CD4060 14-Bit Zähler + Oszillator", model: "counter14", pins: ["CLK", "RST", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13"], desc: "4060", tags: ["zähler", "4060", "oszillator"] },
  { id: "cmos_4511", name: "CD4511 BCD → 7-Segment", model: "bcd7seg", pins: ["A", "B", "C", "D", "LE", "/BI", "/LT", "a", "b", "c", "d", "e", "f", "g"], desc: "4511", tags: ["4511", "bcd", "7seg"] },
  { id: "cmos_4028", name: "CD4028 BCD → Dezimal Decoder", model: "decoder38", pins: ["A", "B", "C", "D", "Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9"], desc: "4028", tags: ["4028", "decoder"] },
  { id: "cmos_4051", name: "CD4051 8-Kanal Analog-MUX", model: "mux8", pins: ["I0", "I1", "I2", "I3", "I4", "I5", "I6", "I7", "S0", "S1", "S2", "COM", "/EN"], desc: "4051", tags: ["mux", "4051", "analog"] },
  { id: "cmos_4052", name: "CD4052 Dual 4-Kanal MUX", model: "mux4", pins: ["I0A", "I1A", "I2A", "I3A", "I0B", "I1B", "I2B", "I3B", "S0", "S1", "COMA", "COMB", "/EN"], desc: "4052", tags: ["mux", "4052"] },
  { id: "cmos_4053", name: "CD4053 Triple 2-Kanal MUX", model: "mux2", pins: ["I0A", "I1A", "I0B", "I1B", "I0C", "I1C", "S0", "S1", "S2", "COMA", "COMB", "COMC", "/EN"], desc: "4053", tags: ["mux", "4053"] },
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
    symbol: icSymbol(w, h, s.desc, ins, outs),
    params: [
      { key: "vdd", label: "Versorgung", unit: "V", type: "number", def: 10 },
      { key: "vth", label: "Schaltschwelle", unit: "V", type: "number", def: 5 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 400 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "DIGITAL", nodes: n, model: s.model, params: { vdd: num(i, "vdd", 10), vth: num(i, "vth", 5), rout: num(i, "rout", 400) } }],
  });
}

// Additional opamps / comparators
const extraOpamps: Array<{ id: string; name: string; gain: number; gbw: number }> = [
  { id: "opamp_lm324", name: "LM324 Quad OPV", gain: 1e5, gbw: 1e6 },
  { id: "opamp_tl072", name: "TL072 Dual JFET OPV", gain: 2e5, gbw: 3e6 },
  { id: "opamp_op07", name: "OP07 Präzisions-OPV", gain: 5e5, gbw: 0.6e6 },
  { id: "opamp_lm393_dual", name: "LM393 Dual Komparator", gain: 2e5, gbw: 1e6 },
  { id: "opamp_lm339", name: "LM339 Quad Komparator", gain: 2e5, gbw: 1e6 },
];

for (const o of extraOpamps) {
  add({
    id: o.id,
    name: o.name,
    ref: "U",
    category: o.id.includes("393") || o.id.includes("339") ? "Analoge ICs/Komparatoren" : "Analoge ICs/Operationsverstärker",
    tags: ["opv", "opamp", o.id],
    mount: "both",
    footprint: "DIP-14 / SOIC-14",
    pins: [
      { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
      { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
    ],
    symbol: [
      { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] } as SymbolPrim,
      L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
      TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
    ],
    params: [
      { key: "gain", label: "Leerlaufverstärkung", type: "number", def: o.gain },
      { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: o.gbw },
      { key: "rin", label: "Eingangswiderstand", unit: "Ω", type: "number", def: 2e6 },
      { key: "rout", label: "Ausgangswiderstand", unit: "Ω", type: "number", def: 75 },
      { key: "vdrop", label: "Reserve", unit: "V", type: "number", def: 1.2 },
      { key: "vcc", label: "V+", unit: "V", type: "number", def: 15 },
      { key: "vee", label: "V-", unit: "V", type: "number", def: -15 },
    ],
    toDevices: (i, n) => [{
      id: i.id, type: o.id.includes("393") || o.id.includes("339") ? "COMPARATOR" : "OPAMP", nodes: [n[0], n[1], n[2], conn(n[3]), conn(n[4])],
      params: { gain: num(i, "gain", o.gain), gbw: num(i, "gbw", o.gbw), rin: num(i, "rin", 2e6), rout: num(i, "rout", 75), vdrop: num(i, "vdrop", 1.2), vcc: num(i, "vcc", 15), vee: num(i, "vee", -15) },
    }],
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
      { key: "w", label: "W", unit: "m", type: "number", def: 1e-3 },
      { key: "l", label: "L", unit: "m", type: "number", def: 1e-5 },
      { key: "lambda", label: "λ", type: "number", def: 0.02 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i, "vto", m.vto), kp: num(i, "kp", m.kp), w: num(i, "w", 1e-3), l: num(i, "l", 1e-5), lambda: num(i, "lambda", 0.02), pmos: m.p ? 1 : 0 } }],
  });
}

// Additional 74xx – expand with 74HC series
const extra74: Array<{ id: string; name: string; model: string; pins: string[] }> = [
  { id: "ic_74hc00", name: "74HC00 Quad NAND", model: "nand2", pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
  { id: "ic_74hc04", name: "74HC04 Hex Inverter", model: "not", pins: ["A1", "Y1", "A2", "Y2", "A3", "Y3", "A4", "Y4", "A5", "Y5", "A6", "Y6"] },
  { id: "ic_74hc08", name: "74HC08 Quad AND", model: "and2", pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
  { id: "ic_74hc32", name: "74HC32 Quad OR", model: "or2", pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
  { id: "ic_74hc86", name: "74HC86 Quad XOR", model: "xor2", pins: ["A1", "B1", "Y1", "A2", "B2", "Y2", "A3", "B3", "Y3", "A4", "B4", "Y4"] },
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
    symbol: icSymbol(w, h, ic.id.toUpperCase(), ins, outs),
    params: [
      { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
      { key: "vth", label: "VTH", unit: "V", type: "number", def: 2.5 },
      { key: "rout", label: "ROUT", unit: "Ω", type: "number", def: 50 },
    ],
    toDevices: (i, n) => [{ id: i.id, type: "DIGITAL", nodes: n, model: ic.model, params: { vdd: num(i, "vdd", 5), vth: num(i, "vth", 2.5), rout: num(i, "rout", 50) } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",2.1), kp: num(i,"kp",0.05), pmos: 0 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",2.1), kp: num(i,"kp",0.05), pmos: 0 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",1.5), kp: num(i,"kp",0.08), pmos: 1 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",3.0), kp: num(i,"kp",0.5), pmos: 0 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",3.5), kp: num(i,"kp",1.0), pmos: 0 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",2.0), kp: num(i,"kp",1.2), pmos: 0 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",3.0), kp: num(i,"kp",0.8), pmos: 0 } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-0.8), beta: num(i,"beta",0.001) } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-1.5), beta: num(i,"beta",0.002) } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-1.0), beta: num(i,"beta",0.003) } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-2.0), beta: num(i,"beta",0.003) } }],
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
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "J", nodes: n, params: { vto: num(i,"vto",-3.5), beta: num(i,"beta",0.003) } }],
});


add({
  id: "igbt_irg4pc50",
  name: "IRG4PC50 IGBT",
  ref: "Q",
  category: "Halbleiter/Transistoren/IGBT",
  tags: ["igbt","leistung"],
  mount: "THT",
  pins: [{ name: "C", x: 12, y: -30 }, { name: "G", x: -30, y: 0 }, { name: "E", x: 12, y: 30 }],
  symbol: [...mosSymbol(false), TXT(0,-28,"IGBT",8)],
  params: [
    { key: "vto", label: "VTO", unit: "V", type: "number", def: 4 },
    { key: "kp", label: "KP", unit: "A/V²", type: "number", def: 0.2 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "M", nodes: n, params: { vto: num(i,"vto",4), kp: num(i,"kp",0.2), pmos: 0 } }],
});


add({
  id: "opamp_tl081",
  name: "TL081 JFET",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl081"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_tl082",
  name: "TL082 Dual JFET",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl082"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_tl071",
  name: "TL071 Low Noise JFET",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl071"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_tl074",
  name: "TL074 Quad Low Noise",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_tl074"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30),
    TXT(-20, -11, "+", 11), TXT(-20, 19, "−", 11),
  ],
  params: [
    { key: "gain", label: "Gain", type: "number", def: 200000.0 },
    { key: "gbw", label: "GBW", unit: "Hz", type: "number", def: 3000000.0 },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "OPAMP", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), gbw: num(i,"gbw",3000000.0), rin: 2e6, rout: 75, vdrop: 1.2, vcc: 15, vee: -15 } }],
});


add({
  id: "opamp_ne5534",
  name: "NE5534 Audio Single",
  ref: "U",
  category: "Analoge ICs/Operationsverstärker",
  tags: ["opamp","opamp_ne5534"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
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
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
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
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
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
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "V-", x: 0, y: 30 },
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
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "GND", x: 0, y: 30 },
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
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "GND", x: 0, y: 30 },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30), TXT(-14, 4, "CMP", 8),
  ],
  params: [{ key: "gain", label: "Gain", type: "number", def: 200000.0 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "COMPARATOR", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }],
});


add({
  id: "comp_lm339",
  name: "LM339 Quad Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator","comp_lm339"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "GND", x: 0, y: 30 },
  ],
  symbol: [
    { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
    L(-40, -15, -30, -15), L(-40, 15, -30, 15), L(30, 0, 40, 0), L(0, -18, 0, -30), L(0, 18, 0, 30), TXT(-14, 4, "CMP", 8),
  ],
  params: [{ key: "gain", label: "Gain", type: "number", def: 200000.0 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "COMPARATOR", nodes: [n[0],n[1],n[2],conn(n[3]),conn(n[4])], params: { gain: num(i,"gain",200000.0), rout: 100, vcc: 5, vee: 0 } }],
});


add({
  id: "comp_lm393_n",
  name: "LM393 Komparator",
  ref: "U",
  category: "Analoge ICs/Komparatoren",
  tags: ["komparator","comp_lm393_n"],
  mount: "both",
  pins: [
    { name: "IN+", x: -40, y: -15 }, { name: "IN-", x: -40, y: 15 }, { name: "OUT", x: 40, y: 0 },
    { name: "V+", x: 0, y: -30 }, { name: "GND", x: 0, y: 30 },
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
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
  category: "Analoge ICs/Spannungsregler",
  tags: ["regler","reg_tl431"],
  mount: "THT",
  pins: [{ name: "IN", x: -40, y: 0 }, { name: "OUT", x: 40, y: 0 }, { name: "GND", x: 0, y: 30 }],
  symbol: [RECT(-30, -20, 60, 40, 4), TXT(0, 4, "TL431", 10), L(-40, 0, -30, 0), L(30, 0, 40, 0), L(0, 20, 0, 30)],
  params: [{ key: "vout", label: "Vout", unit: "V", type: "number", def: 2.5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "VREG", nodes: n, params: { vout: num(i,"vout",2.5), dropout: 1, rout: 0.05 } }],
});


add({
  id: "ic_747400",
  name: "747400 Quad NAND 2-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7400",
  name: "74LS7400 Quad NAND 2-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7400",
  name: "74HC7400 Quad NAND 2-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7400",
  name: "74HCT7400 Quad NAND 2-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7400", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7400",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747401",
  name: "747401 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7401",
  name: "74LS7401 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7401",
  name: "74HC7401 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7401",
  name: "74HCT7401 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7401", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7401",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747402",
  name: "747402 Quad NOR 2-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7402",
  name: "74LS7402 Quad NOR 2-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7402",
  name: "74HC7402 Quad NOR 2-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7402",
  name: "74HCT7402 Quad NOR 2-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7402", "nor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7402",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747403",
  name: "747403 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7403",
  name: "74LS7403 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7403",
  name: "74HC7403 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7403",
  name: "74HCT7403 Quad NAND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7403", "nand2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7403",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747404",
  name: "747404 Hex Inverter",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7404", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7404",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7404",
  name: "74LS7404 Hex Inverter",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7404", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7404",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7404",
  name: "74HC7404 Hex Inverter",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7404", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7404",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7404",
  name: "74HCT7404 Hex Inverter",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7404", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7404",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747405",
  name: "747405 Hex Inverter OC",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7405", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7405",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7405",
  name: "74LS7405 Hex Inverter OC",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7405", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7405",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7405",
  name: "74HC7405 Hex Inverter OC",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7405", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7405",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7405",
  name: "74HCT7405 Hex Inverter OC",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7405", "not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7405",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "not", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747408",
  name: "747408 Quad AND 2-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7408",
  name: "74LS7408 Quad AND 2-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7408",
  name: "74HC7408 Quad AND 2-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7408",
  name: "74HCT7408 Quad AND 2-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7408", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7408",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747409",
  name: "747409 Quad AND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7409",
  name: "74LS7409 Quad AND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7409",
  name: "74HC7409 Quad AND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7409",
  name: "74HCT7409 Quad AND 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7409", "and2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7409",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747410",
  name: "747410 Triple NAND 3-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7410", "nand3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7410",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7410",
  name: "74LS7410 Triple NAND 3-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7410", "nand3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7410",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7410",
  name: "74HC7410 Triple NAND 3-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7410", "nand3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7410",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7410",
  name: "74HCT7410 Triple NAND 3-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7410", "nand3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7410",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747411",
  name: "747411 Triple AND 3-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7411", "and3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7411",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7411",
  name: "74LS7411 Triple AND 3-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7411", "and3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7411",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7411",
  name: "74HC7411 Triple AND 3-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7411", "and3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7411",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7411",
  name: "74HCT7411 Triple AND 3-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7411", "and3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7411",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747420",
  name: "747420 Dual NAND 4-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7420", "nand4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7420",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7420",
  name: "74LS7420 Dual NAND 4-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7420", "nand4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7420",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7420",
  name: "74HC7420 Dual NAND 4-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7420", "nand4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7420",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7420",
  name: "74HCT7420 Dual NAND 4-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7420", "nand4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7420",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747421",
  name: "747421 Dual AND 4-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7421", "and4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7421",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7421",
  name: "74LS7421 Dual AND 4-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7421", "and4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7421",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7421",
  name: "74HC7421 Dual AND 4-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7421", "and4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7421",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7421",
  name: "74HCT7421 Dual AND 4-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7421", "and4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7421",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "and4", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747427",
  name: "747427 Triple NOR 3-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7427", "nor3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7427",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7427",
  name: "74LS7427 Triple NOR 3-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7427", "nor3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7427",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7427",
  name: "74HC7427 Triple NOR 3-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7427", "nor3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7427",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7427",
  name: "74HCT7427 Triple NOR 3-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7427", "nor3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7427",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nor3", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747430",
  name: "747430 8-Input NAND",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7430", "nand8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7430",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand8", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7430",
  name: "74LS7430 8-Input NAND",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7430", "nand8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7430",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand8", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7430",
  name: "74HC7430 8-Input NAND",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7430", "nand8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7430",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand8", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7430",
  name: "74HCT7430 8-Input NAND",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7430", "nand8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7430",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "nand8", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747432",
  name: "747432 Quad OR 2-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "or2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7432",
  name: "74LS7432 Quad OR 2-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "or2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7432",
  name: "74HC7432 Quad OR 2-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "or2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7432",
  name: "74HCT7432 Quad OR 2-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7432", "or2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7432",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "or2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747486",
  name: "747486 Quad XOR 2-In",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls7486",
  name: "74LS7486 Quad XOR 2-In",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc7486",
  name: "74HC7486 Quad XOR 2-In",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct7486",
  name: "74HCT7486 Quad XOR 2-In",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "7486", "xor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"7486",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_7474266",
  name: "7474266 Quad XNOR 2-In OC",
  ref: "U",
  category: "Digitale Logik/74/Gatter",
  tags: ["74", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xnor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74ls74266",
  name: "74LS74266 Quad XNOR 2-In OC",
  ref: "U",
  category: "Digitale Logik/74LS/Gatter",
  tags: ["74ls", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74LS", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xnor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hc74266",
  name: "74HC74266 Quad XNOR 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HC/Gatter",
  tags: ["74hc", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HC", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xnor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_74hct74266",
  name: "74HCT74266 Quad XNOR 2-In OC",
  ref: "U",
  category: "Digitale Logik/74HCT/Gatter",
  tags: ["74hct", "74266", "xnor2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26, -20, 52, 40, 3), TXT(0,5,"74266",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0) ,CIR(29,0,4)],
  params: [
    { key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 },
    { key: "family", label: "Familie", type: "select", def: "74HCT", options: [{ value: "74HC", label: "74HC" }, { value: "74LS", label: "74LS" }] },
  ],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "GATE", nodes: n, model: "xnor2", params: { vdd: 5, vth: 2.5, rout: 50 } }],
});


add({
  id: "ic_747442",
  name: "7442 BCD zu Dezimal Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7442","decoder38"],
  mount: "both",
  pins: [{ name: "A", x: -60, y: -49 }, { name: "B", x: -60, y: -35 }, { name: "C", x: -60, y: -21 }, { name: "D", x: -60, y: -7 }, { name: "Q0", x: -60, y: 7 }, { name: "Q1", x: -60, y: 21 }, { name: "Q2", x: -60, y: 35 }, { name: "Q3", x: 60, y: -49 }, { name: "Q4", x: 60, y: -35 }, { name: "Q5", x: 60, y: -21 }, { name: "Q6", x: 60, y: -7 }, { name: "Q7", x: 60, y: 7 }, { name: "Q8", x: 60, y: 21 }, { name: "Q9", x: 60, y: 35 }],
  symbol: icSymbol(110, 142, "7442", ['A', 'B', 'C', 'D', 'Q0', 'Q1', 'Q2'], ['Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder38", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7442",
  name: "7442 BCD zu Dezimal Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7442","decoder38"],
  mount: "both",
  pins: [{ name: "A", x: -60, y: -49 }, { name: "B", x: -60, y: -35 }, { name: "C", x: -60, y: -21 }, { name: "D", x: -60, y: -7 }, { name: "Q0", x: -60, y: 7 }, { name: "Q1", x: -60, y: 21 }, { name: "Q2", x: -60, y: 35 }, { name: "Q3", x: 60, y: -49 }, { name: "Q4", x: 60, y: -35 }, { name: "Q5", x: 60, y: -21 }, { name: "Q6", x: 60, y: -7 }, { name: "Q7", x: 60, y: 7 }, { name: "Q8", x: 60, y: 21 }, { name: "Q9", x: 60, y: 35 }],
  symbol: icSymbol(110, 142, "7442", ['A', 'B', 'C', 'D', 'Q0', 'Q1', 'Q2'], ['Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder38", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_747447",
  name: "7447 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7447","bcd7seg"],
  mount: "both",
  pins: [{ name: "A", x: -60, y: -37 }, { name: "B", x: -60, y: -23 }, { name: "C", x: -60, y: -9 }, { name: "D", x: -60, y: 5 }, { name: "a", x: -60, y: 19 }, { name: "b", x: 60, y: -37 }, { name: "c", x: 60, y: -23 }, { name: "d", x: 60, y: -9 }, { name: "e", x: 60, y: 5 }, { name: "f", x: 60, y: 19 }, { name: "g", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "7447", ['A', 'B', 'C', 'D', 'a'], ['b', 'c', 'd', 'e', 'f', 'g']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seg", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7447",
  name: "7447 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7447","bcd7seg"],
  mount: "both",
  pins: [{ name: "A", x: -60, y: -37 }, { name: "B", x: -60, y: -23 }, { name: "C", x: -60, y: -9 }, { name: "D", x: -60, y: 5 }, { name: "a", x: -60, y: 19 }, { name: "b", x: 60, y: -37 }, { name: "c", x: 60, y: -23 }, { name: "d", x: 60, y: -9 }, { name: "e", x: 60, y: 5 }, { name: "f", x: 60, y: 19 }, { name: "g", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "7447", ['A', 'B', 'C', 'D', 'a'], ['b', 'c', 'd', 'e', 'f', 'g']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seg", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_747448",
  name: "7448 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7448","bcd7seg"],
  mount: "both",
  pins: [{ name: "A", x: -60, y: -37 }, { name: "B", x: -60, y: -23 }, { name: "C", x: -60, y: -9 }, { name: "D", x: -60, y: 5 }, { name: "a", x: -60, y: 19 }, { name: "b", x: 60, y: -37 }, { name: "c", x: 60, y: -23 }, { name: "d", x: 60, y: -9 }, { name: "e", x: 60, y: 5 }, { name: "f", x: 60, y: 19 }, { name: "g", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "7448", ['A', 'B', 'C', 'D', 'a'], ['b', 'c', 'd', 'e', 'f', 'g']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seg", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7448",
  name: "7448 BCD zu 7-Segment",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7448","bcd7seg"],
  mount: "both",
  pins: [{ name: "A", x: -60, y: -37 }, { name: "B", x: -60, y: -23 }, { name: "C", x: -60, y: -9 }, { name: "D", x: -60, y: 5 }, { name: "a", x: -60, y: 19 }, { name: "b", x: 60, y: -37 }, { name: "c", x: 60, y: -23 }, { name: "d", x: 60, y: -9 }, { name: "e", x: 60, y: 5 }, { name: "f", x: 60, y: 19 }, { name: "g", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "7448", ['A', 'B', 'C', 'D', 'a'], ['b', 'c', 'd', 'e', 'f', 'g']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seg", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474138",
  name: "74138 3-zu-8 Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74138","decoder38"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -37 }, { name: "A1", x: -60, y: -23 }, { name: "A2", x: -60, y: -9 }, { name: "Y0", x: -60, y: 5 }, { name: "Y1", x: -60, y: 19 }, { name: "Y2", x: 60, y: -37 }, { name: "Y3", x: 60, y: -23 }, { name: "Y4", x: 60, y: -9 }, { name: "Y5", x: 60, y: 5 }, { name: "Y6", x: 60, y: 19 }, { name: "Y7", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "74138", ['A0', 'A1', 'A2', 'Y0', 'Y1'], ['Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder38", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74138",
  name: "74138 3-zu-8 Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74138","decoder38"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -37 }, { name: "A1", x: -60, y: -23 }, { name: "A2", x: -60, y: -9 }, { name: "Y0", x: -60, y: 5 }, { name: "Y1", x: -60, y: 19 }, { name: "Y2", x: 60, y: -37 }, { name: "Y3", x: 60, y: -23 }, { name: "Y4", x: 60, y: -9 }, { name: "Y5", x: 60, y: 5 }, { name: "Y6", x: 60, y: 19 }, { name: "Y7", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "74138", ['A0', 'A1', 'A2', 'Y0', 'Y1'], ['Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder38", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474139",
  name: "74139 Dual 2-zu-4 Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74139","decoder24"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -18 }, { name: "A1", x: -60, y: -4 }, { name: "Y0", x: -60, y: 10 }, { name: "Y1", x: 60, y: -18 }, { name: "Y2", x: 60, y: -4 }, { name: "Y3", x: 60, y: 10 }],
  symbol: icSymbol(110, 80, "74139", ['A0', 'A1', 'Y0'], ['Y1', 'Y2', 'Y3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder24", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74139",
  name: "74139 Dual 2-zu-4 Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74139","decoder24"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -18 }, { name: "A1", x: -60, y: -4 }, { name: "Y0", x: -60, y: 10 }, { name: "Y1", x: 60, y: -18 }, { name: "Y2", x: 60, y: -4 }, { name: "Y3", x: 60, y: 10 }],
  symbol: icSymbol(110, 80, "74139", ['A0', 'A1', 'Y0'], ['Y1', 'Y2', 'Y3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder24", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474154",
  name: "74154 4-zu-16 Decoder",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74154","decoder416"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -73 }, { name: "A1", x: -60, y: -59 }, { name: "A2", x: -60, y: -45 }, { name: "A3", x: -60, y: -31 }, { name: "Y0", x: -60, y: -17 }, { name: "Y1", x: -60, y: -3 }, { name: "Y2", x: -60, y: 11 }, { name: "Y3", x: -60, y: 25 }, { name: "Y4", x: -60, y: 39 }, { name: "Y5", x: -60, y: 53 }, { name: "Y6", x: 60, y: -73 }, { name: "Y7", x: 60, y: -59 }, { name: "Y8", x: 60, y: -45 }, { name: "Y9", x: 60, y: -31 }, { name: "Y10", x: 60, y: -17 }, { name: "Y11", x: 60, y: -3 }, { name: "Y12", x: 60, y: 11 }, { name: "Y13", x: 60, y: 25 }, { name: "Y14", x: 60, y: 39 }, { name: "Y15", x: 60, y: 53 }],
  symbol: icSymbol(110, 190, "74154", ['A0', 'A1', 'A2', 'A3', 'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'], ['Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder416", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74154",
  name: "74154 4-zu-16 Decoder",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74154","decoder416"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -73 }, { name: "A1", x: -60, y: -59 }, { name: "A2", x: -60, y: -45 }, { name: "A3", x: -60, y: -31 }, { name: "Y0", x: -60, y: -17 }, { name: "Y1", x: -60, y: -3 }, { name: "Y2", x: -60, y: 11 }, { name: "Y3", x: -60, y: 25 }, { name: "Y4", x: -60, y: 39 }, { name: "Y5", x: -60, y: 53 }, { name: "Y6", x: 60, y: -73 }, { name: "Y7", x: 60, y: -59 }, { name: "Y8", x: 60, y: -45 }, { name: "Y9", x: 60, y: -31 }, { name: "Y10", x: 60, y: -17 }, { name: "Y11", x: 60, y: -3 }, { name: "Y12", x: 60, y: 11 }, { name: "Y13", x: 60, y: 25 }, { name: "Y14", x: 60, y: 39 }, { name: "Y15", x: 60, y: 53 }],
  symbol: icSymbol(110, 190, "74154", ['A0', 'A1', 'A2', 'A3', 'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'], ['Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13', 'Y14', 'Y15']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder416", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474151",
  name: "74151 8-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74151","mux8"],
  mount: "both",
  pins: [{ name: "I0", x: -60, y: -41 }, { name: "I1", x: -60, y: -27 }, { name: "I2", x: -60, y: -13 }, { name: "I3", x: -60, y: 1 }, { name: "I4", x: -60, y: 15 }, { name: "I5", x: -60, y: 29 }, { name: "I6", x: 60, y: -41 }, { name: "I7", x: 60, y: -27 }, { name: "S0", x: 60, y: -13 }, { name: "S1", x: 60, y: 1 }, { name: "S2", x: 60, y: 15 }, { name: "Y", x: 60, y: 29 }],
  symbol: icSymbol(110, 126, "74151", ['I0', 'I1', 'I2', 'I3', 'I4', 'I5'], ['I6', 'I7', 'S0', 'S1', 'S2', 'Y']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux8", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74151",
  name: "74151 8-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74151","mux8"],
  mount: "both",
  pins: [{ name: "I0", x: -60, y: -41 }, { name: "I1", x: -60, y: -27 }, { name: "I2", x: -60, y: -13 }, { name: "I3", x: -60, y: 1 }, { name: "I4", x: -60, y: 15 }, { name: "I5", x: -60, y: 29 }, { name: "I6", x: 60, y: -41 }, { name: "I7", x: 60, y: -27 }, { name: "S0", x: 60, y: -13 }, { name: "S1", x: 60, y: 1 }, { name: "S2", x: 60, y: 15 }, { name: "Y", x: 60, y: 29 }],
  symbol: icSymbol(110, 126, "74151", ['I0', 'I1', 'I2', 'I3', 'I4', 'I5'], ['I6', 'I7', 'S0', 'S1', 'S2', 'Y']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux8", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474153",
  name: "74153 Dual 4-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74153","mux4"],
  mount: "both",
  pins: [{ name: "I0", x: -60, y: -21 }, { name: "I1", x: -60, y: -7 }, { name: "I2", x: -60, y: 7 }, { name: "I3", x: 60, y: -21 }, { name: "S0", x: 60, y: -7 }, { name: "S1", x: 60, y: 7 }, { name: "Y", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74153", ['I0', 'I1', 'I2'], ['I3', 'S0', 'S1', 'Y']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74153",
  name: "74153 Dual 4-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74153","mux4"],
  mount: "both",
  pins: [{ name: "I0", x: -60, y: -21 }, { name: "I1", x: -60, y: -7 }, { name: "I2", x: -60, y: 7 }, { name: "I3", x: 60, y: -21 }, { name: "S0", x: 60, y: -7 }, { name: "S1", x: 60, y: 7 }, { name: "Y", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74153", ['I0', 'I1', 'I2'], ['I3', 'S0', 'S1', 'Y']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474157",
  name: "74157 Quad 2-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74157","mux2"],
  mount: "both",
  pins: [{ name: "I0", x: -60, y: -18 }, { name: "I1", x: -60, y: -4 }, { name: "S", x: 60, y: -18 }, { name: "Y", x: 60, y: -4 }],
  symbol: icSymbol(110, 80, "74157", ['I0', 'I1'], ['S', 'Y']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux2", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74157",
  name: "74157 Quad 2-zu-1 MUX",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74157","mux2"],
  mount: "both",
  pins: [{ name: "I0", x: -60, y: -18 }, { name: "I1", x: -60, y: -4 }, { name: "S", x: 60, y: -18 }, { name: "Y", x: 60, y: -4 }],
  symbol: icSymbol(110, 80, "74157", ['I0', 'I1'], ['S', 'Y']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux2", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474160",
  name: "74160 Dekaden-Zähler",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74160","counter10"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74160", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74160",
  name: "74160 Dekaden-Zähler",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74160","counter10"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74160", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474161",
  name: "74161 4-Bit Binär-Zähler",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74161","counter4"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74161", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74161",
  name: "74161 4-Bit Binär-Zähler",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74161","counter4"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74161", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474162",
  name: "74162 Dekaden-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74162","counter10"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74162", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74162",
  name: "74162 Dekaden-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74162","counter10"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74162", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter10", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474163",
  name: "74163 4-Bit Binär-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74163","counter4"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74163", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74163",
  name: "74163 4-Bit Binär-Zähler sync",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74163","counter4"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -21 }, { name: "RST", x: -60, y: -7 }, { name: "EN", x: -60, y: 7 }, { name: "Q0", x: 60, y: -21 }, { name: "Q1", x: 60, y: -7 }, { name: "Q2", x: 60, y: 7 }, { name: "Q3", x: 60, y: 21 }],
  symbol: icSymbol(110, 86, "74163", ['CLK', 'RST', 'EN'], ['Q0', 'Q1', 'Q2', 'Q3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474164",
  name: "74164 8-Bit Schieberegister",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74164","shift8"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -37 }, { name: "DATA", x: -60, y: -23 }, { name: "RST", x: -60, y: -9 }, { name: "Q0", x: -60, y: 5 }, { name: "Q1", x: -60, y: 19 }, { name: "Q2", x: 60, y: -37 }, { name: "Q3", x: 60, y: -23 }, { name: "Q4", x: 60, y: -9 }, { name: "Q5", x: 60, y: 5 }, { name: "Q6", x: 60, y: 19 }, { name: "Q7", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "74164", ['CLK', 'DATA', 'RST', 'Q0', 'Q1'], ['Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74164",
  name: "74164 8-Bit Schieberegister",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74164","shift8"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -37 }, { name: "DATA", x: -60, y: -23 }, { name: "RST", x: -60, y: -9 }, { name: "Q0", x: -60, y: 5 }, { name: "Q1", x: -60, y: 19 }, { name: "Q2", x: 60, y: -37 }, { name: "Q3", x: 60, y: -23 }, { name: "Q4", x: 60, y: -9 }, { name: "Q5", x: 60, y: 5 }, { name: "Q6", x: 60, y: 19 }, { name: "Q7", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "74164", ['CLK', 'DATA', 'RST', 'Q0', 'Q1'], ['Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474165",
  name: "74165 8-Bit PISO Shift",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74165","shift8"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -37 }, { name: "DATA", x: -60, y: -23 }, { name: "RST", x: -60, y: -9 }, { name: "Q0", x: -60, y: 5 }, { name: "Q1", x: -60, y: 19 }, { name: "Q2", x: 60, y: -37 }, { name: "Q3", x: 60, y: -23 }, { name: "Q4", x: 60, y: -9 }, { name: "Q5", x: 60, y: 5 }, { name: "Q6", x: 60, y: 19 }, { name: "Q7", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "74165", ['CLK', 'DATA', 'RST', 'Q0', 'Q1'], ['Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74165",
  name: "74165 8-Bit PISO Shift",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74165","shift8"],
  mount: "both",
  pins: [{ name: "CLK", x: -60, y: -37 }, { name: "DATA", x: -60, y: -23 }, { name: "RST", x: -60, y: -9 }, { name: "Q0", x: -60, y: 5 }, { name: "Q1", x: -60, y: 19 }, { name: "Q2", x: 60, y: -37 }, { name: "Q3", x: 60, y: -23 }, { name: "Q4", x: 60, y: -9 }, { name: "Q5", x: 60, y: 5 }, { name: "Q6", x: 60, y: 19 }, { name: "Q7", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "74165", ['CLK', 'DATA', 'RST', 'Q0', 'Q1'], ['Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_747474",
  name: "7474 Dual D-FF",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7474","dff"],
  mount: "both",
  pins: [{ name: "D1", x: -60, y: -41 }, { name: "CLK1", x: -60, y: -27 }, { name: "RST1", x: -60, y: -13 }, { name: "SET1", x: -60, y: 1 }, { name: "Q1", x: -60, y: 15 }, { name: "/Q1", x: -60, y: 29 }, { name: "D2", x: 60, y: -41 }, { name: "CLK2", x: 60, y: -27 }, { name: "RST2", x: 60, y: -13 }, { name: "SET2", x: 60, y: 1 }, { name: "Q2", x: 60, y: 15 }, { name: "/Q2", x: 60, y: 29 }],
  symbol: icSymbol(110, 126, "7474", ['D1', 'CLK1', 'RST1', 'SET1', 'Q1', '/Q1'], ['D2', 'CLK2', 'RST2', 'SET2', 'Q2', '/Q2']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dff", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7474",
  name: "7474 Dual D-FF",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7474","dff"],
  mount: "both",
  pins: [{ name: "D1", x: -60, y: -41 }, { name: "CLK1", x: -60, y: -27 }, { name: "RST1", x: -60, y: -13 }, { name: "SET1", x: -60, y: 1 }, { name: "Q1", x: -60, y: 15 }, { name: "/Q1", x: -60, y: 29 }, { name: "D2", x: 60, y: -41 }, { name: "CLK2", x: 60, y: -27 }, { name: "RST2", x: 60, y: -13 }, { name: "SET2", x: 60, y: 1 }, { name: "Q2", x: 60, y: 15 }, { name: "/Q2", x: 60, y: 29 }],
  symbol: icSymbol(110, 126, "7474", ['D1', 'CLK1', 'RST1', 'SET1', 'Q1', '/Q1'], ['D2', 'CLK2', 'RST2', 'SET2', 'Q2', '/Q2']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dff", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_747476",
  name: "7476 Dual JK-FF",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7476","jkff"],
  mount: "both",
  pins: [{ name: "J1", x: -60, y: -18 }, { name: "K1", x: -60, y: -4 }, { name: "CLK1", x: -60, y: 10 }, { name: "RST1", x: 60, y: -18 }, { name: "Q1", x: 60, y: -4 }, { name: "/Q1", x: 60, y: 10 }],
  symbol: icSymbol(110, 80, "7476", ['J1', 'K1', 'CLK1'], ['RST1', 'Q1', '/Q1']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "jkff", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7476",
  name: "7476 Dual JK-FF",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7476","jkff"],
  mount: "both",
  pins: [{ name: "J1", x: -60, y: -18 }, { name: "K1", x: -60, y: -4 }, { name: "CLK1", x: -60, y: 10 }, { name: "RST1", x: 60, y: -18 }, { name: "Q1", x: 60, y: -4 }, { name: "/Q1", x: 60, y: 10 }],
  symbol: icSymbol(110, 80, "7476", ['J1', 'K1', 'CLK1'], ['RST1', 'Q1', '/Q1']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "jkff", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_747483",
  name: "7483 4-Bit Addierer",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7483","alu4"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -45 }, { name: "A1", x: -60, y: -31 }, { name: "A2", x: -60, y: -17 }, { name: "A3", x: -60, y: -3 }, { name: "B0", x: -60, y: 11 }, { name: "B1", x: -60, y: 25 }, { name: "B2", x: 60, y: -45 }, { name: "B3", x: 60, y: -31 }, { name: "F0", x: 60, y: -17 }, { name: "F1", x: 60, y: -3 }, { name: "F2", x: 60, y: 11 }, { name: "F3", x: 60, y: 25 }, { name: "COUT", x: 60, y: 39 }],
  symbol: icSymbol(110, 134, "7483", ['A0', 'A1', 'A2', 'A3', 'B0', 'B1'], ['B2', 'B3', 'F0', 'F1', 'F2', 'F3', 'COUT']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "alu4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7483",
  name: "7483 4-Bit Addierer",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7483","alu4"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -45 }, { name: "A1", x: -60, y: -31 }, { name: "A2", x: -60, y: -17 }, { name: "A3", x: -60, y: -3 }, { name: "B0", x: -60, y: 11 }, { name: "B1", x: -60, y: 25 }, { name: "B2", x: 60, y: -45 }, { name: "B3", x: 60, y: -31 }, { name: "F0", x: 60, y: -17 }, { name: "F1", x: 60, y: -3 }, { name: "F2", x: 60, y: 11 }, { name: "F3", x: 60, y: 25 }, { name: "COUT", x: 60, y: 39 }],
  symbol: icSymbol(110, 134, "7483", ['A0', 'A1', 'A2', 'A3', 'B0', 'B1'], ['B2', 'B3', 'F0', 'F1', 'F2', 'F3', 'COUT']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "alu4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_747485",
  name: "7485 4-Bit Komparator",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","7485","alu4"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -37 }, { name: "A1", x: -60, y: -23 }, { name: "A2", x: -60, y: -9 }, { name: "A3", x: -60, y: 5 }, { name: "B0", x: -60, y: 19 }, { name: "B1", x: 60, y: -37 }, { name: "B2", x: 60, y: -23 }, { name: "B3", x: 60, y: -9 }, { name: "F0", x: 60, y: 5 }, { name: "F1", x: 60, y: 19 }, { name: "F2", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "7485", ['A0', 'A1', 'A2', 'A3', 'B0'], ['B1', 'B2', 'B3', 'F0', 'F1', 'F2']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "alu4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc7485",
  name: "7485 4-Bit Komparator",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","7485","alu4"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -37 }, { name: "A1", x: -60, y: -23 }, { name: "A2", x: -60, y: -9 }, { name: "A3", x: -60, y: 5 }, { name: "B0", x: -60, y: 19 }, { name: "B1", x: 60, y: -37 }, { name: "B2", x: 60, y: -23 }, { name: "B3", x: 60, y: -9 }, { name: "F0", x: 60, y: 5 }, { name: "F1", x: 60, y: 19 }, { name: "F2", x: 60, y: 33 }],
  symbol: icSymbol(110, 118, "7485", ['A0', 'A1', 'A2', 'A3', 'B0'], ['B1', 'B2', 'B3', 'F0', 'F1', 'F2']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "alu4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474273",
  name: "74273 Octal D-FF",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74273","dff"],
  mount: "both",
  pins: [{ name: "D0", x: -60, y: -65 }, { name: "D1", x: -60, y: -51 }, { name: "D2", x: -60, y: -37 }, { name: "D3", x: -60, y: -23 }, { name: "D4", x: -60, y: -9 }, { name: "D5", x: -60, y: 5 }, { name: "D6", x: -60, y: 19 }, { name: "D7", x: -60, y: 33 }, { name: "CLK", x: -60, y: 47 }, { name: "RST", x: 60, y: -65 }, { name: "Q0", x: 60, y: -51 }, { name: "Q1", x: 60, y: -37 }, { name: "Q2", x: 60, y: -23 }, { name: "Q3", x: 60, y: -9 }, { name: "Q4", x: 60, y: 5 }, { name: "Q5", x: 60, y: 19 }, { name: "Q6", x: 60, y: 33 }, { name: "Q7", x: 60, y: 47 }],
  symbol: icSymbol(110, 174, "74273", ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'CLK'], ['RST', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dff", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74273",
  name: "74273 Octal D-FF",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74273","dff"],
  mount: "both",
  pins: [{ name: "D0", x: -60, y: -65 }, { name: "D1", x: -60, y: -51 }, { name: "D2", x: -60, y: -37 }, { name: "D3", x: -60, y: -23 }, { name: "D4", x: -60, y: -9 }, { name: "D5", x: -60, y: 5 }, { name: "D6", x: -60, y: 19 }, { name: "D7", x: -60, y: 33 }, { name: "CLK", x: -60, y: 47 }, { name: "RST", x: 60, y: -65 }, { name: "Q0", x: 60, y: -51 }, { name: "Q1", x: 60, y: -37 }, { name: "Q2", x: 60, y: -23 }, { name: "Q3", x: 60, y: -9 }, { name: "Q4", x: 60, y: 5 }, { name: "Q5", x: 60, y: 19 }, { name: "Q6", x: 60, y: 33 }, { name: "Q7", x: 60, y: 47 }],
  symbol: icSymbol(110, 174, "74273", ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'CLK'], ['RST', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dff", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474373",
  name: "74373 Octal Latch",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74373","latch4"],
  mount: "both",
  pins: [{ name: "D0", x: -60, y: -61 }, { name: "D1", x: -60, y: -47 }, { name: "D2", x: -60, y: -33 }, { name: "D3", x: -60, y: -19 }, { name: "D4", x: -60, y: -5 }, { name: "D5", x: -60, y: 9 }, { name: "D6", x: -60, y: 23 }, { name: "D7", x: -60, y: 37 }, { name: "LE", x: 60, y: -61 }, { name: "Q0", x: 60, y: -47 }, { name: "Q1", x: 60, y: -33 }, { name: "Q2", x: 60, y: -19 }, { name: "Q3", x: 60, y: -5 }, { name: "Q4", x: 60, y: 9 }, { name: "Q5", x: 60, y: 23 }, { name: "Q6", x: 60, y: 37 }, { name: "Q7", x: 60, y: 51 }],
  symbol: icSymbol(110, 166, "74373", ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], ['LE', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74373",
  name: "74373 Octal Latch",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74373","latch4"],
  mount: "both",
  pins: [{ name: "D0", x: -60, y: -61 }, { name: "D1", x: -60, y: -47 }, { name: "D2", x: -60, y: -33 }, { name: "D3", x: -60, y: -19 }, { name: "D4", x: -60, y: -5 }, { name: "D5", x: -60, y: 9 }, { name: "D6", x: -60, y: 23 }, { name: "D7", x: -60, y: 37 }, { name: "LE", x: 60, y: -61 }, { name: "Q0", x: 60, y: -47 }, { name: "Q1", x: 60, y: -33 }, { name: "Q2", x: 60, y: -19 }, { name: "Q3", x: 60, y: -5 }, { name: "Q4", x: 60, y: 9 }, { name: "Q5", x: 60, y: 23 }, { name: "Q6", x: 60, y: 37 }, { name: "Q7", x: 60, y: 51 }],
  symbol: icSymbol(110, 166, "74373", ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], ['LE', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch4", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474244",
  name: "74244 Octal Buffer",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74244","buffer"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -25 }, { name: "A1", x: -60, y: -11 }, { name: "A2", x: -60, y: 3 }, { name: "A3", x: -60, y: 17 }, { name: "Y0", x: 60, y: -25 }, { name: "Y1", x: 60, y: -11 }, { name: "Y2", x: 60, y: 3 }, { name: "Y3", x: 60, y: 17 }],
  symbol: icSymbol(110, 94, "74244", ['A0', 'A1', 'A2', 'A3'], ['Y0', 'Y1', 'Y2', 'Y3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buffer", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74244",
  name: "74244 Octal Buffer",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74244","buffer"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -25 }, { name: "A1", x: -60, y: -11 }, { name: "A2", x: -60, y: 3 }, { name: "A3", x: -60, y: 17 }, { name: "Y0", x: 60, y: -25 }, { name: "Y1", x: 60, y: -11 }, { name: "Y2", x: 60, y: 3 }, { name: "Y3", x: 60, y: 17 }],
  symbol: icSymbol(110, 94, "74244", ['A0', 'A1', 'A2', 'A3'], ['Y0', 'Y1', 'Y2', 'Y3']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buffer", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_7474245",
  name: "74245 Octal Bus Transceiver",
  ref: "U",
  category: "Digitale Logik/74",
  tags: ["74","74245","buffer"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -18 }, { name: "A1", x: -60, y: -4 }, { name: "B0", x: -60, y: 10 }, { name: "B1", x: 60, y: -18 }, { name: "DIR", x: 60, y: -4 }, { name: "/EN", x: 60, y: 10 }],
  symbol: icSymbol(110, 80, "74245", ['A0', 'A1', 'B0'], ['B1', 'DIR', '/EN']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buffer", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "ic_74hc74245",
  name: "74245 Octal Bus Transceiver",
  ref: "U",
  category: "Digitale Logik/74HC",
  tags: ["74hc","74245","buffer"],
  mount: "both",
  pins: [{ name: "A0", x: -60, y: -18 }, { name: "A1", x: -60, y: -4 }, { name: "B0", x: -60, y: 10 }, { name: "B1", x: 60, y: -18 }, { name: "DIR", x: 60, y: -4 }, { name: "/EN", x: 60, y: 10 }],
  symbol: icSymbol(110, 80, "74245", ['A0', 'A1', 'B0'], ['B1', 'DIR', '/EN']),
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buffer", params: { vdd: 5, vth: 2.5 } }],
});


add({
  id: "cmos_4000",
  name: "CD4000 Dual 3-In NOR + Inverter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4000","nor3"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4000",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor3", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4006",
  name: "CD4006 18-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4006","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4006",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4007",
  name: "CD4007 Dual Complementary Pair",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4007","not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4007",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4008",
  name: "CD4008 4-Bit Volladdierer",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4008","alu4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4008",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "alu4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4009",
  name: "CD4009 Hex Buffer Inverting",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4009","not"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4009",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "not", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4010",
  name: "CD4010 Hex Buffer Non-Inv",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4010","buffer"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4010",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "buffer", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4014",
  name: "CD4014 8-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4014","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4014",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4015",
  name: "CD4015 Dual 4-Bit Shift",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4015","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4015",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4018",
  name: "CD4018 Presettable Divide-by-N",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4018","counter4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4018",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4019",
  name: "CD4019 Quad AND-OR Select",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4019","mux2"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4019",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux2", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4021",
  name: "CD4021 8-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4021","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4021",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4022",
  name: "CD4022 Octal Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4022","counter8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4022",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4024",
  name: "CD4024 7-Bit Binary Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4024","counter8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4024",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4026",
  name: "CD4026 Decade Counter + 7Seg",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4026","bcd7seg"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4026",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seg", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4029",
  name: "CD4029 Up/Down Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4029","counter4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4029",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4031",
  name: "CD4031 64-Bit Shift",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4031","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4031",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4034",
  name: "CD4034 8-Bit Bus Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4034","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4034",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4035",
  name: "CD4035 4-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4035","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4035",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4042",
  name: "CD4042 Quad D Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4042","latch4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4042",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4043",
  name: "CD4043 Quad NOR RS Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4043","srlatch"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4043",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "srlatch", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4044",
  name: "CD4044 Quad NAND RS Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4044","srlatch"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4044",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "srlatch", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4046",
  name: "CD4046 Phase Locked Loop",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4046","pll4046"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4046",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "pll4046", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4047",
  name: "CD4047 Monostable/Astable",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4047","monostable"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4047",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "monostable", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4068",
  name: "CD4068 8-Input NAND",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4068","nand4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4068",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nand4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4076",
  name: "CD4076 Quad D Latch Tri-State",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4076","latch4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4076",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "latch4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4078",
  name: "CD4078 8-Input NOR",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4078","nor4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4078",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "nor4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4093",
  name: "CD4093 Quad NAND Schmitt",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4093","schmitt"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4093",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "schmitt", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4094",
  name: "CD4094 8-Bit Shift+Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4094","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4094",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_40106",
  name: "CD40106 Hex Schmitt Inverter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40106","schmitt"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"40106",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "schmitt", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_40193",
  name: "CD40193 4-Bit Up/Down Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40193","counter4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"40193",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_40194",
  name: "CD40194 4-Bit Universal Shift",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40194","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"40194",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_40195",
  name: "CD40195 4-Bit Shift Register",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","40195","shift8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"40195",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "shift8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4512",
  name: "CD4512 8-Channel MUX",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4512","mux8"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4512",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "mux8", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4514",
  name: "CD4514 4-to-16 Decoder",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4514","decoder416"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4514",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder416", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4515",
  name: "CD4515 4-to-16 Decoder Inv",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4515","decoder416"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4515",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder416", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4520",
  name: "CD4520 Dual 4-Bit Counter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4520","counter4"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4520",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "counter4", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4528",
  name: "CD4528 Dual Monostable",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4528","monostable"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4528",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "monostable", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4538",
  name: "CD4538 Dual Monostable Prec",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4538","monostable"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4538",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "monostable", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4543",
  name: "CD4543 BCD to 7-Seg Latch",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4543","bcd7seg"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4543",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "bcd7seg", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4555",
  name: "CD4555 Dual 1-to-4 Decoder",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4555","decoder24"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4555",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder24", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4556",
  name: "CD4556 Dual 1-to-4 Decoder Inv",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4556","decoder24"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4556",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "decoder24", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "cmos_4584",
  name: "CD4584 Hex Schmitt Inverter",
  ref: "U",
  category: "Digitale Logik/4000 CMOS",
  tags: ["cmos","4584","schmitt"],
  mount: "both",
  pins: [{ name: "A", x: -40, y: -10 }, { name: "B", x: -40, y: 10 }, { name: "Y", x: 40, y: 0 }],
  symbol: [RECT(-26,-20,52,40,3), TXT(0,5,"4584",10), L(-40,-10,-26,-10), L(-40,10,-26,10), L(26,0,40,0)],
  params: [{ key: "vdd", label: "VDD", unit: "V", type: "number", def: 10 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "schmitt", params: { vdd: 10, vth: 5 } }],
});


add({
  id: "adc_0804",
  name: "ADC0804 8-Bit ADC",
  ref: "U",
  category: "Gemischt/ADC-DAC",
  tags: ["adc","0804"],
  mount: "THT",
  pins: [
    { name: "VIN+", x: -50, y: -30 }, { name: "VIN-", x: -50, y: -10 }, { name: "VREF", x: -50, y: 10 },
    { name: "D0", x: 50, y: -40 }, { name: "D1", x: 50, y: -30 }, { name: "D2", x: 50, y: -20 }, { name: "D3", x: 50, y: -10 },
    { name: "D4", x: 50, y: 0 }, { name: "D5", x: 50, y: 10 }, { name: "D6", x: 50, y: 20 }, { name: "D7", x: 50, y: 30 },
    { name: "CLK", x: -50, y: 30 }, { name: "VCC", x: 0, y: -50 }, { name: "GND", x: 0, y: 50 },
  ],
  symbol: icSymbol(100, 120, "0804", ["VIN+","VIN-","VREF","CLK","VCC","GND"], ["D0","D1","D2","D3","D4","D5","D6","D7"]),
  params: [{ key: "vref", label: "VREF", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "adc8", params: { vref: num(i,"vref",5), vdd: 5 } }],
});


add({
  id: "dac_0808",
  name: "DAC0808 8-Bit DAC",
  ref: "U",
  category: "Gemischt/ADC-DAC",
  tags: ["dac","0808"],
  mount: "THT",
  pins: [
    { name: "D0", x: -50, y: -40 }, { name: "D1", x: -50, y: -30 }, { name: "D2", x: -50, y: -20 }, { name: "D3", x: -50, y: -10 },
    { name: "D4", x: -50, y: 0 }, { name: "D5", x: -50, y: 10 }, { name: "D6", x: -50, y: 20 }, { name: "D7", x: -50, y: 30 },
    { name: "VREF", x: -50, y: 50 }, { name: "IOUT", x: 50, y: 0 }, { name: "VCC", x: 0, y: -50 }, { name: "VEE", x: 0, y: 50 },
  ],
  symbol: icSymbol(100, 120, "0808", ["D0","D1","D2","D3","D4","D5","D6","D7","VREF","VCC","VEE"], ["IOUT"]),
  params: [{ key: "vref", label: "VREF", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "DIGITAL", nodes: n, model: "dac8", params: { vref: num(i,"vref",5), vdd: 5 } }],
});


add({
  id: "switch_spdt",
  name: "SPDT Schalter",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","spdt"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_dpst",
  name: "DPST Schalter",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","dpst"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_dpdt",
  name: "DPDT Schalter",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","dpdt"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_rotary_3",
  name: "Drehschalter 3 Stellungen",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","rotary_3"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_rotary_4",
  name: "Drehschalter 4 Stellungen",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","rotary_4"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_rotary_6",
  name: "Drehschalter 6 Stellungen",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","rotary_6"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_rotary_8",
  name: "Drehschalter 8 Stellungen",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","rotary_8"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_dip_4",
  name: "DIP Schalter 4-fach",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","dip_4"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "switch_dip_8",
  name: "DIP Schalter 8-fach",
  ref: "S",
  category: "Elektromechanik/Schalter",
  tags: ["schalter","dip_8"],
  mount: "THT",
  interactive: "switch",
  pins: [{ name: "1", x: -30, y: 0 }, { name: "2", x: 30, y: 0 }],
  symbol: [L(-30,0,-14,0), CIR(-14,0,3), L(-12,-2,14,-14), CIR(14,0,3), L(14,0,30,0)],
  params: [{ key: "closed", label: "Geschlossen", type: "bool", def: false }],
  toDevices: (i,n): Device[] => [{ id: i.id, type: "SWITCH", nodes: n, params: { closed: num(i,"closed",0), ron: 0.01, roff: 1e9 } }],
});


add({
  id: "relay_spst_5v",
  name: "Relais SPST 5V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spst_5v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(10,20,26,-14), L(40,-20,26,-20)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 120 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",5), voff: 2.5, ron: 0.05, roff: 1e9 } },
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
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(10,20,26,-14), L(40,-20,26,-20)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 288 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 12 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",288) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",12), voff: 6.0, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "relay_spdt_5v",
  name: "Relais SPDT 5V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spdt_5v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(10,20,26,-14), L(40,-20,26,-20)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 120 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",5), voff: 2.5, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "relay_spdt_12v",
  name: "Relais SPDT 12V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_spdt_12v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(10,20,26,-14), L(40,-20,26,-20)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 288 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 12 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",288) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",12), voff: 6.0, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "relay_dpdt_5v",
  name: "Relais DPDT 5V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_dpdt_5v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(10,20,26,-14), L(40,-20,26,-20)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 120 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 5 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",120) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",5), voff: 2.5, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "relay_dpdt_12v",
  name: "Relais DPDT 12V",
  ref: "K",
  category: "Elektromechanik/Relais",
  tags: ["relais","relay_dpdt_12v"],
  mount: "THT",
  pins: [{ name: "COIL+", x: -40, y: -20 }, { name: "COIL-", x: -40, y: 20 }, { name: "COM", x: 40, y: 20 }, { name: "NO", x: 40, y: -20 }],
  symbol: [RECT(-30,-14,24,28,2), L(-40,-20,-30,-20), L(-40,20,-30,20), L(-30,-20,-30,20), L(10,20,40,20), L(10,20,26,-14), L(40,-20,26,-20)],
  params: [{ key: "rcoil", label: "R Spule", unit: "Ω", type: "number", def: 288 }, { key: "vpull", label: "Vpull", unit: "V", type: "number", def: 12 }],
  toDevices: (i,n): Device[] => [
    { id: i.id+"_coil", type: "R", nodes: [n[0], n[1]], params: { r: num(i,"rcoil",288) } },
    { id: i.id, type: "VSWITCH", nodes: [n[2], n[3], n[0], n[1]], params: { von: num(i,"vpull",12), voff: 6.0, ron: 0.05, roff: 1e9 } },
  ],
});


add({
  id: "bargraph_10",
  name: "Bargraph 10 LED",
  ref: "DS",
  category: "Anzeigen & Aktoren/Optisch",
  tags: ["bargraph","led"],
  mount: "THT",
  pins: Array.from({length:10}, (_,i)=>({ name: `LED${i}`, x: -40, y: -45+i*10 })).concat([{ name: "COM", x: 40, y: 0 }]),
  symbol: [RECT(-30,-50,60,100,4), ...Array.from({length:10}, (_,i)=>({ t: "rect", x: -20, y: -45+i*10, w: 20, h: 6, r:1 } as SymbolPrim))],
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
  symbol: [RECT(-50,-50,100,100,4), TXT(0,0,"LCD 16x2",10)],
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
  symbol: [RECT(-60,-100,120,200,6), TXT(0,-80,"Arduino",11), TXT(0,-62,"CO-SIM",8)],
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
  symbol: [RECT(-60,-100,120,200,6), TXT(0,-80,"Arduino",11), TXT(0,-62,"CO-SIM",8)],
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
  symbol: [RECT(-60,-100,120,200,6), TXT(0,-80,"ESP32",11), TXT(0,-62,"CO-SIM",8)],
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
  symbol: [RECT(-60,-100,120,200,6), TXT(0,-80,"STM32F103",11), TXT(0,-62,"CO-SIM",8)],
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
  symbol: [RECT(-60,-100,120,200,6), TXT(0,-80,"ATtiny85",11), TXT(0,-62,"CO-SIM",8)],
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
  symbol: [RECT(-60,-100,120,200,6), TXT(0,-80,"PIC16F877A",11), TXT(0,-62,"CO-SIM",8)],
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
