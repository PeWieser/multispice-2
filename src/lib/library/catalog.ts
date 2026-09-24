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
const resSymbol: SymbolPrim[] = [
  L(-30, 0, -20, 0),
  L(-20, -7, 20, -7, 20, 7, -20, 7, -20, -7),
  L(20, 0, 30, 0),
];
const capSymbol: SymbolPrim[] = [L(-30, 0, -5, 0), L(-5, -12, -5, 12), L(5, -12, 5, 12), L(5, 0, 30, 0)];
const indSymbol: SymbolPrim[] = [
  L(-30, 0, -20, 0),
  { t: "arc", x: -15, y: 0, r: 5, a0: Math.PI, a1: 0 },
  { t: "arc", x: -5, y: 0, r: 5, a0: Math.PI, a1: 0 },
  { t: "arc", x: 5, y: 0, r: 5, a0: Math.PI, a1: 0 },
  { t: "arc", x: 15, y: 0, r: 5, a0: Math.PI, a1: 0 },
  L(20, 0, 30, 0),
];
const diodeSymbol: SymbolPrim[] = [L(-30, 0, -10, 0), L(-10, -10, -10, 10, 10, 0, -10, -10), L(10, -10, 10, 10), L(10, 0, 30, 0)];

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
  const prims: SymbolPrim[] = [RECT(-w / 2, -h / 2, w, h, 4), TXT(0, -h / 2 + 12, label, 10)];
  pinsLeft.forEach((p, i) => {
    const y = -h / 2 + 22 + i * 16;
    prims.push(L(-w / 2 - 10, y, -w / 2, y));
    prims.push({ t: "text", x: -w / 2 + 6, y: y + 3, s: p, size: 7, align: "left" });
  });
  pinsRight.forEach((p, i) => {
    const y = -h / 2 + 22 + i * 16;
    prims.push(L(w / 2, y, w / 2 + 10, y));
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
  inputs.forEach((pn, i2) => pins.push({ name: pn, x: -w / 2 - 10, y: -h / 2 + 22 + i2 * 16 }));
  outputs.forEach((pn, i2) => pins.push({ name: pn, x: w / 2 + 10, y: -h / 2 + 22 + i2 * 16 }));
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
