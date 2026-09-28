// Component library: symbols, pins, property schemas, simulation model kinds.
export type Prim =
  | { t: "l"; p: number[] } // polyline x1,y1,x2,y2,...
  | { t: "c"; x: number; y: number; r: number; fill?: boolean }
  | { t: "p"; d: string; fill?: boolean }
  | { t: "r"; x: number; y: number; w: number; h: number }
  | { t: "tx"; x: number; y: number; s: string; size?: number };

export interface PinDef { name: string; num: number; x: number; y: number }
export interface PropDef { key: string; label: string; def: string; unit?: string; options?: string[]; group?: "general" | "sim" | "physical" }

export type Category = "Basic" | "Sources" | "Diodes" | "Transistors" | "Analog" | "Digital" | "Power" | "Connectors" | "Instruments" | "Virtual";
export type Domain = "analog" | "digital" | "power" | "source" | "instrument";

export interface PartDef {
  key: string;
  name: string;
  category: Category;
  domain: Domain;
  kind: "simulated" | "virtual" | "physical";
  prefix: string;
  desc: string;
  model: string; // engine model key, "" = no model
  valueKey?: string; // property shown as value
  pins: PinDef[] | ((p: Record<string, string>) => PinDef[]);
  props: PropDef[];
  symbol: Prim[] | ((p: Record<string, string>) => Prim[]);
  box: [number, number, number, number]; // local bbox x1,y1,x2,y2
  footprint?: string;
  instrument?: boolean;
}

const two = (a = "1", b = "2"): PinDef[] => [{ name: a, num: 1, x: -20, y: 0 }, { name: b, num: 2, x: 20, y: 0 }];
const twoV = (a = "+", b = "-"): PinDef[] => [{ name: a, num: 1, x: 0, y: -20 }, { name: b, num: 2, x: 0, y: 20 }];
const phys: PropDef[] = [
  { key: "footprint", label: "Footprint", def: "", group: "physical" },
  { key: "package", label: "Package", def: "", group: "physical" },
  { key: "manufacturer", label: "Manufacturer", def: "", group: "physical" },
  { key: "partNumber", label: "Part Number", def: "", group: "physical" },
];
const tol: PropDef[] = [
  { key: "tol", label: "Tolerance", def: "5", unit: "%", group: "sim" },
  { key: "tc1", label: "Temp. Coefficient", def: "0", unit: "ppm/°C", group: "sim" },
];

const srcCircle: Prim[] = [{ t: "c", x: 0, y: 0, r: 10 }, { t: "l", p: [0, -20, 0, -10] }, { t: "l", p: [0, 10, 0, 20] }];
const gateBody = (kind: string): Prim[] => {
  const out: Prim[] = [];
  if (kind === "and" || kind === "nand") out.push({ t: "p", d: "M-10,-12 L2,-12 A12,12 0 0 1 2,12 L-10,12 Z" });
  else if (kind === "or" || kind === "nor" || kind === "xor")
    out.push({ t: "p", d: "M-12,-12 Q4,-12 14,0 Q4,12 -12,12 Q-5,0 -12,-12 Z" });
  if (kind === "xor") out.push({ t: "p", d: "M-16,-12 Q-9,0 -16,12" });
  if (kind === "not" || kind === "buf") out.push({ t: "p", d: "M-10,-11 L10,0 L-10,11 Z" });
  const inv = kind === "nand" || kind === "nor" || kind === "not";
  if (inv) out.push({ t: "c", x: kind === "not" ? 12 : 16, y: 0, r: 2.5 });
  out.push({ t: "l", p: [inv ? (kind === "not" ? 14.5 : 18.5) : kind === "buf" ? 10 : 14, 0, 20, 0] });
  if (kind === "not" || kind === "buf") out.push({ t: "l", p: [-20, 0, -10, 0] });
  else out.push({ t: "l", p: [-20, -10, -11, -10] }, { t: "l", p: [-20, 10, -11, 10] });
  return out;
};
const gatePins = (n: number): PinDef[] =>
  n === 1
    ? [{ name: "A", num: 1, x: -20, y: 0 }, { name: "Y", num: 2, x: 20, y: 0 }]
    : [{ name: "A", num: 1, x: -20, y: -10 }, { name: "B", num: 2, x: -20, y: 10 }, { name: "Y", num: 3, x: 20, y: 0 }];
const logicProps: PropDef[] = [
  { key: "vdd", label: "Logic High", def: "5", unit: "V", group: "sim" },
  { key: "delay", label: "Prop. Delay", def: "0", unit: "s", group: "sim" },
];

function gate(key: string, name: string, n: number): PartDef {
  return {
    key, name, category: "Digital", domain: "digital", kind: "simulated", prefix: "U", desc: `${name} logic gate (behavioral, 5V CMOS-like)`,
    model: "GATE", pins: gatePins(n), props: [...logicProps, ...phys], symbol: gateBody(key.toLowerCase()), box: [-20, -14, 20, 14], footprint: "DIP-14",
  };
}

function instrBox(label: string, w: number, h: number): Prim[] {
  return [{ t: "r", x: -w / 2, y: -h / 2, w, h }, { t: "tx", x: 0, y: -h / 2 + 11, s: label, size: 8 }];
}

export const LIB: PartDef[] = [
  // ---------- Basic
  {
    key: "R", name: "Resistor", category: "Basic", domain: "analog", kind: "simulated", prefix: "R", desc: "Linear resistor", model: "R", valueKey: "value",
    pins: two(), props: [{ key: "value", label: "Resistance", def: "1k", unit: "Ω" }, ...tol, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -12, 0, -10, -5, -6, 5, -2, -5, 2, 5, 6, -5, 10, 5, 12, 0, 20, 0] }], box: [-20, -6, 20, 6], footprint: "R_0603",
  },
  {
    key: "C", name: "Capacitor", category: "Basic", domain: "analog", kind: "simulated", prefix: "C", desc: "Linear capacitor", model: "C", valueKey: "value",
    pins: two(), props: [{ key: "value", label: "Capacitance", def: "1u", unit: "F" }, { key: "ic", label: "Initial Condition", def: "", unit: "V", group: "sim" }, ...tol, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -3, 0] }, { t: "l", p: [3, 0, 20, 0] }, { t: "l", p: [-3, -9, -3, 9] }, { t: "l", p: [3, -9, 3, 9] }], box: [-20, -9, 20, 9], footprint: "C_0603",
  },
  {
    key: "L", name: "Inductor", category: "Basic", domain: "analog", kind: "simulated", prefix: "L", desc: "Linear inductor", model: "L", valueKey: "value",
    pins: two(), props: [{ key: "value", label: "Inductance", def: "1m", unit: "H" }, { key: "ic", label: "Initial Current", def: "", unit: "A", group: "sim" }, ...tol, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -12, 0] }, { t: "p", d: "M-12,0 A3,3 0 0 1 -6,0 A3,3 0 0 1 0,0 A3,3 0 0 1 6,0 A3,3 0 0 1 12,0" }, { t: "l", p: [12, 0, 20, 0] }], box: [-20, -5, 20, 3], footprint: "L_1210",
  },
  {
    key: "POT", name: "Potentiometer", category: "Basic", domain: "analog", kind: "simulated", prefix: "R", desc: "3-terminal potentiometer (wiper position 0..100%)", model: "POT", valueKey: "value",
    pins: [...two("1", "3"), { name: "W", num: 2, x: 0, y: -20 }], props: [{ key: "value", label: "Resistance", def: "10k", unit: "Ω" }, { key: "pos", label: "Wiper Position", def: "50", unit: "%" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -12, 0, -10, -5, -6, 5, -2, -5, 2, 5, 6, -5, 10, 5, 12, 0, 20, 0] }, { t: "l", p: [0, -20, 0, -7] }, { t: "p", d: "M-3,-11 L0,-6 L3,-11 Z", fill: true }], box: [-20, -20, 20, 6],
  },
  {
    key: "SW", name: "Switch (SPST)", category: "Basic", domain: "analog", kind: "simulated", prefix: "S", desc: "Ideal switch, toggle via property or Space in interactive mode", model: "SW", valueKey: "state",
    pins: two(), props: [{ key: "state", label: "State", def: "open", options: ["open", "closed"] }, { key: "ron", label: "R on", def: "1m", unit: "Ω", group: "sim" }, { key: "roff", label: "R off", def: "1G", unit: "Ω", group: "sim" }, ...phys],
    symbol: (p) => [{ t: "l", p: [-20, 0, -10, 0] }, { t: "c", x: -10, y: 0, r: 1.5, fill: true }, { t: "l", p: p.state === "closed" ? [-10, 0, 10, 0] : [-10, 0, 9, -9] }, { t: "c", x: 10, y: 0, r: 1.5, fill: true }, { t: "l", p: [10, 0, 20, 0] }], box: [-20, -10, 20, 3],
  },
  {
    key: "XFMR", name: "Transformer (ideal)", category: "Basic", domain: "analog", kind: "simulated", prefix: "T", desc: "Ideal transformer, ratio = Ns/Np", model: "XFMR", valueKey: "ratio",
    pins: [{ name: "P1", num: 1, x: -20, y: -20 }, { name: "P2", num: 2, x: -20, y: 20 }, { name: "S1", num: 3, x: 20, y: -20 }, { name: "S2", num: 4, x: 20, y: 20 }],
    props: [{ key: "ratio", label: "Turns Ratio Ns/Np", def: "1" }, ...phys],
    symbol: [{ t: "l", p: [-20, -20, -8, -20, -8, -12] }, { t: "p", d: "M-8,-12 A3,3 0 0 1 -8,-6 A3,3 0 0 1 -8,0 A3,3 0 0 1 -8,6 A3,3 0 0 1 -8,12" }, { t: "l", p: [-8, 12, -8, 20, -20, 20] }, { t: "l", p: [-2, -12, -2, 12] }, { t: "l", p: [2, -12, 2, 12] }, { t: "l", p: [20, -20, 8, -20, 8, -12] }, { t: "p", d: "M8,-12 A3,3 0 0 0 8,-6 A3,3 0 0 0 8,0 A3,3 0 0 0 8,6 A3,3 0 0 0 8,12" }, { t: "l", p: [8, 12, 8, 20, 20, 20] }],
    box: [-20, -20, 20, 20],
  },
  // ---------- Sources
  {
    key: "VDC", name: "Voltage Source (DC)", category: "Sources", domain: "source", kind: "simulated", prefix: "V", desc: "Independent DC voltage source", model: "V", valueKey: "dc",
    pins: twoV(), props: [{ key: "dc", label: "DC Voltage", def: "5", unit: "V" }, { key: "ac", label: "AC Magnitude", def: "0", unit: "V", group: "sim" }],
    symbol: [...srcCircle, { t: "tx", x: 0, y: -3, s: "+", size: 9 }, { t: "tx", x: 0, y: 7, s: "−", size: 9 }], box: [-10, -20, 10, 20],
  },
  {
    key: "IDC", name: "Current Source (DC)", category: "Sources", domain: "source", kind: "simulated", prefix: "I", desc: "Independent DC current source (flows + to − through external circuit from −)", model: "I", valueKey: "dc",
    pins: twoV(), props: [{ key: "dc", label: "DC Current", def: "1m", unit: "A" }, { key: "ac", label: "AC Magnitude", def: "0", unit: "A", group: "sim" }],
    symbol: [...srcCircle, { t: "l", p: [0, 6, 0, -6] }, { t: "p", d: "M-3,-3 L0,-7 L3,-3 Z", fill: true }], box: [-10, -20, 10, 20],
  },
  {
    key: "VSIN", name: "Sine Voltage Source", category: "Sources", domain: "source", kind: "simulated", prefix: "V", desc: "SIN(offset ampl freq delay damping phase)", model: "V", valueKey: "ampl",
    pins: twoV(), props: [{ key: "wave", label: "Waveform", def: "sine", options: ["sine"], group: "sim" }, { key: "ampl", label: "Amplitude (pk)", def: "1", unit: "V" }, { key: "freq", label: "Frequency", def: "1k", unit: "Hz" }, { key: "offset", label: "Offset", def: "0", unit: "V" }, { key: "phase", label: "Phase", def: "0", unit: "°" }, { key: "ac", label: "AC Magnitude", def: "1", unit: "V", group: "sim" }],
    symbol: [...srcCircle, { t: "p", d: "M-6,0 Q-3,-7 0,0 Q3,7 6,0" }], box: [-10, -20, 10, 20],
  },
  {
    key: "VPULSE", name: "Pulse Voltage Source", category: "Sources", domain: "source", kind: "simulated", prefix: "V", desc: "PULSE(v1 v2 delay rise fall width period)", model: "V", valueKey: "v2",
    pins: twoV(), props: [{ key: "wave", label: "Waveform", def: "pulse", options: ["pulse"], group: "sim" }, { key: "v1", label: "Initial Value", def: "0", unit: "V" }, { key: "v2", label: "Pulsed Value", def: "5", unit: "V" }, { key: "delay", label: "Delay", def: "0", unit: "s" }, { key: "rise", label: "Rise Time", def: "1u", unit: "s" }, { key: "fall", label: "Fall Time", def: "1u", unit: "s" }, { key: "width", label: "Pulse Width", def: "0.5m", unit: "s" }, { key: "period", label: "Period", def: "1m", unit: "s" }, { key: "ac", label: "AC Magnitude", def: "0", unit: "V", group: "sim" }],
    symbol: [...srcCircle, { t: "l", p: [-6, 3, -3, 3, -3, -3, 3, -3, 3, 3, 6, 3] }], box: [-10, -20, 10, 20],
  },
  {
    key: "VPWL", name: "PWL Voltage Source", category: "Sources", domain: "source", kind: "simulated", prefix: "V", desc: "Piecewise linear: pairs 't v, t v, ...'", model: "V", valueKey: "pwl",
    pins: twoV(), props: [{ key: "wave", label: "Waveform", def: "pwl", options: ["pwl"], group: "sim" }, { key: "pwl", label: "Points (t v, ...)", def: "0 0, 1m 5, 2m 5, 3m 0" }, { key: "ac", label: "AC Magnitude", def: "0", unit: "V", group: "sim" }],
    symbol: [...srcCircle, { t: "l", p: [-6, 4, -2, -4, 2, 0, 6, -4] }], box: [-10, -20, 10, 20],
  },
  // ---------- Diodes
  {
    key: "D", name: "Diode", category: "Diodes", domain: "analog", kind: "simulated", prefix: "D", desc: "Shockley diode model", model: "D", valueKey: "modelName",
    pins: two("A", "K"), props: [{ key: "modelName", label: "Model Name", def: "1N4148", group: "sim" }, { key: "is", label: "IS", def: "2.52n", unit: "A", group: "sim" }, { key: "n", label: "N", def: "1.752", group: "sim" }, { key: "rs", label: "RS", def: "0.568", unit: "Ω", group: "sim" }, { key: "bv", label: "BV", def: "100", unit: "V", group: "sim" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, 20, 0] }, { t: "p", d: "M-6,-7 L6,0 L-6,7 Z", fill: true }, { t: "l", p: [6, -7, 6, 7] }], box: [-20, -7, 20, 7], footprint: "SOD-123",
  },
  {
    key: "DZ", name: "Zener Diode", category: "Diodes", domain: "analog", kind: "simulated", prefix: "D", desc: "Zener diode with reverse breakdown BV", model: "D", valueKey: "bv",
    pins: two("A", "K"), props: [{ key: "modelName", label: "Model Name", def: "BZX5V1", group: "sim" }, { key: "is", label: "IS", def: "1n", unit: "A", group: "sim" }, { key: "n", label: "N", def: "1", group: "sim" }, { key: "rs", label: "RS", def: "1", unit: "Ω", group: "sim" }, { key: "bv", label: "Zener Voltage BV", def: "5.1", unit: "V" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, 20, 0] }, { t: "p", d: "M-6,-7 L6,0 L-6,7 Z", fill: true }, { t: "l", p: [3, -9, 6, -7, 6, 7, 9, 9] }], box: [-20, -9, 20, 9],
  },
  {
    key: "LED", name: "LED", category: "Diodes", domain: "analog", kind: "simulated", prefix: "D", desc: "Light emitting diode (red, Vf≈1.8V)", model: "D", valueKey: "modelName",
    pins: two("A", "K"), props: [{ key: "modelName", label: "Model Name", def: "LED_RED", group: "sim" }, { key: "is", label: "IS", def: "1e-19", unit: "A", group: "sim" }, { key: "n", label: "N", def: "1.8", group: "sim" }, { key: "rs", label: "RS", def: "2", unit: "Ω", group: "sim" }, { key: "bv", label: "BV", def: "5", unit: "V", group: "sim" }, { key: "ion", label: "Turn-on current", def: "1m", unit: "A", group: "sim" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, 20, 0] }, { t: "p", d: "M-6,-7 L6,0 L-6,7 Z", fill: true }, { t: "l", p: [6, -7, 6, 7] }, { t: "l", p: [0, -9, 5, -14] }, { t: "l", p: [4, -8, 9, -13] }], box: [-20, -14, 20, 7],
  },
  // ---------- Transistors
  {
    key: "NPN", name: "BJT NPN", category: "Transistors", domain: "analog", kind: "simulated", prefix: "Q", desc: "Ebers-Moll NPN transistor", model: "BJT", valueKey: "modelName",
    pins: [{ name: "B", num: 1, x: -20, y: 0 }, { name: "C", num: 2, x: 10, y: -20 }, { name: "E", num: 3, x: 10, y: 20 }],
    props: [{ key: "modelName", label: "Model Name", def: "2N3904", group: "sim" }, { key: "is", label: "IS", def: "6.7f", unit: "A", group: "sim" }, { key: "bf", label: "BF", def: "200", group: "sim" }, { key: "br", label: "BR", def: "1", group: "sim" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -4, 0] }, { t: "l", p: [-4, -10, -4, 10] }, { t: "l", p: [-4, -5, 10, -13, 10, -20] }, { t: "l", p: [-4, 5, 10, 13, 10, 20] }, { t: "p", d: "M10,13 L3,12.5 L6,8 Z", fill: true }], box: [-20, -20, 10, 20], footprint: "TO-92",
  },
  {
    key: "PNP", name: "BJT PNP", category: "Transistors", domain: "analog", kind: "simulated", prefix: "Q", desc: "Ebers-Moll PNP transistor", model: "BJT", valueKey: "modelName",
    pins: [{ name: "B", num: 1, x: -20, y: 0 }, { name: "C", num: 2, x: 10, y: 20 }, { name: "E", num: 3, x: 10, y: -20 }],
    props: [{ key: "modelName", label: "Model Name", def: "2N3906", group: "sim" }, { key: "is", label: "IS", def: "1.41f", unit: "A", group: "sim" }, { key: "bf", label: "BF", def: "180", group: "sim" }, { key: "br", label: "BR", def: "4", group: "sim" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -4, 0] }, { t: "l", p: [-4, -10, -4, 10] }, { t: "l", p: [-4, -5, 10, -13, 10, -20] }, { t: "l", p: [-4, 5, 10, 13, 10, 20] }, { t: "p", d: "M-4,-5 L3,-5 L1,-10 Z", fill: true }], box: [-20, -20, 10, 20], footprint: "TO-92",
  },
  {
    key: "NMOS", name: "NMOS", category: "Transistors", domain: "analog", kind: "simulated", prefix: "M", desc: "Level-1 square-law N-channel MOSFET (bulk tied to source)", model: "MOS", valueKey: "modelName",
    pins: [{ name: "G", num: 1, x: -20, y: 0 }, { name: "D", num: 2, x: 10, y: -20 }, { name: "S", num: 3, x: 10, y: 20 }],
    props: [{ key: "modelName", label: "Model Name", def: "NMOS1", group: "sim" }, { key: "vto", label: "VTO", def: "2", unit: "V", group: "sim" }, { key: "kp", label: "KP (W/L incl.)", def: "0.1", unit: "A/V²", group: "sim" }, { key: "lambda", label: "LAMBDA", def: "0.01", group: "sim" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -6, 0] }, { t: "l", p: [-6, -10, -6, 10] }, { t: "l", p: [-2, -12, -2, -5] }, { t: "l", p: [-2, -3, -2, 3] }, { t: "l", p: [-2, 5, -2, 12] }, { t: "l", p: [-2, -9, 10, -9, 10, -20] }, { t: "l", p: [-2, 9, 10, 9, 10, 20] }, { t: "l", p: [-2, 0, 10, 0, 10, 9] }, { t: "p", d: "M-1,0 L4,-3 L4,3 Z", fill: true }], box: [-20, -20, 10, 20], footprint: "SOT-23",
  },
  {
    key: "PMOS", name: "PMOS", category: "Transistors", domain: "analog", kind: "simulated", prefix: "M", desc: "Level-1 square-law P-channel MOSFET (bulk tied to source)", model: "MOS", valueKey: "modelName",
    pins: [{ name: "G", num: 1, x: -20, y: 0 }, { name: "D", num: 2, x: 10, y: 20 }, { name: "S", num: 3, x: 10, y: -20 }],
    props: [{ key: "modelName", label: "Model Name", def: "PMOS1", group: "sim" }, { key: "vto", label: "VTO", def: "-2", unit: "V", group: "sim" }, { key: "kp", label: "KP (W/L incl.)", def: "0.05", unit: "A/V²", group: "sim" }, { key: "lambda", label: "LAMBDA", def: "0.01", group: "sim" }, ...phys],
    symbol: [{ t: "l", p: [-20, 0, -6, 0] }, { t: "l", p: [-6, -10, -6, 10] }, { t: "l", p: [-2, -12, -2, -5] }, { t: "l", p: [-2, -3, -2, 3] }, { t: "l", p: [-2, 5, -2, 12] }, { t: "l", p: [-2, -9, 10, -9, 10, -20] }, { t: "l", p: [-2, 9, 10, 9, 10, 20] }, { t: "l", p: [-2, 0, 10, 0, 10, -9] }, { t: "p", d: "M9,0 L4,-3 L4,3 Z", fill: true }], box: [-20, -20, 10, 20], footprint: "SOT-23",
  },
  // ---------- Analog
  {
    key: "OPAMP", name: "Ideal Op Amp (3-pin)", category: "Analog", domain: "analog", kind: "virtual", prefix: "U", desc: "Ideal op amp, open-loop gain A, output saturates at ±Vsat", model: "OPAMP", valueKey: "gain",
    pins: [{ name: "IN-", num: 2, x: -30, y: -10 }, { name: "IN+", num: 3, x: -30, y: 10 }, { name: "OUT", num: 6, x: 30, y: 0 }],
    props: [{ key: "gain", label: "Open-loop Gain", def: "1e5", group: "sim" }, { key: "vsat", label: "Vsat (±)", def: "15", unit: "V", group: "sim" }],
    symbol: [{ t: "p", d: "M-20,-20 L20,0 L-20,20 Z" }, { t: "l", p: [-30, -10, -20, -10] }, { t: "l", p: [-30, 10, -20, 10] }, { t: "l", p: [20, 0, 30, 0] }, { t: "tx", x: -15, y: -7, s: "−", size: 9 }, { t: "tx", x: -15, y: 13, s: "+", size: 9 }], box: [-30, -20, 30, 20],
  },
  {
    key: "OPAMP5", name: "Op Amp (5-pin, rail supply)", category: "Analog", domain: "analog", kind: "simulated", prefix: "U", desc: "Op amp with supply pins; output clamps to V+ / V− rails", model: "OPAMP", valueKey: "gain",
    pins: [{ name: "IN-", num: 2, x: -30, y: -10 }, { name: "IN+", num: 3, x: -30, y: 10 }, { name: "OUT", num: 6, x: 30, y: 0 }, { name: "V+", num: 7, x: 0, y: -20 }, { name: "V-", num: 4, x: 0, y: 20 }],
    props: [{ key: "gain", label: "Open-loop Gain", def: "1e5", group: "sim" }, ...phys],
    symbol: [{ t: "p", d: "M-20,-20 L20,0 L-20,20 Z" }, { t: "l", p: [-30, -10, -20, -10] }, { t: "l", p: [-30, 10, -20, 10] }, { t: "l", p: [20, 0, 30, 0] }, { t: "l", p: [0, -20, 0, -10] }, { t: "l", p: [0, 20, 0, 10] }, { t: "tx", x: -15, y: -7, s: "−", size: 9 }, { t: "tx", x: -15, y: 13, s: "+", size: 9 }], box: [-30, -20, 30, 20], footprint: "SOIC-8",
  },
  {
    key: "COMP", name: "Comparator", category: "Analog", domain: "analog", kind: "simulated", prefix: "U", desc: "Comparator with output levels VOH/VOL", model: "COMP", valueKey: "voh",
    pins: [{ name: "IN-", num: 2, x: -30, y: -10 }, { name: "IN+", num: 3, x: -30, y: 10 }, { name: "OUT", num: 7, x: 30, y: 0 }],
    props: [{ key: "voh", label: "VOH", def: "5", unit: "V", group: "sim" }, { key: "vol", label: "VOL", def: "0", unit: "V", group: "sim" }, ...phys],
    symbol: [{ t: "p", d: "M-20,-20 L20,0 L-20,20 Z" }, { t: "l", p: [-30, -10, -20, -10] }, { t: "l", p: [-30, 10, -20, 10] }, { t: "l", p: [20, 0, 30, 0] }, { t: "tx", x: -15, y: -7, s: "−", size: 9 }, { t: "tx", x: -15, y: 13, s: "+", size: 9 }, { t: "l", p: [-6, 3, -2, 3, -2, -3, 3, -3] }], box: [-30, -20, 30, 20],
  },
  // ---------- Power
  {
    key: "GND", name: "Ground", category: "Power", domain: "power", kind: "virtual", prefix: "#GND", desc: "Reference node 0", model: "",
    pins: [{ name: "GND", num: 1, x: 0, y: 0 }], props: [],
    symbol: [{ t: "l", p: [0, 0, 0, 6] }, { t: "l", p: [-8, 6, 8, 6] }, { t: "l", p: [-5, 9, 5, 9] }, { t: "l", p: [-2, 12, 2, 12] }], box: [-8, 0, 8, 12],
  },
  {
    key: "VCC", name: "VCC", category: "Power", domain: "power", kind: "virtual", prefix: "#PWR", desc: "Global supply net with implicit DC source to ground", model: "PWR", valueKey: "voltage",
    pins: [{ name: "VCC", num: 1, x: 0, y: 0 }], props: [{ key: "net", label: "Net Name", def: "VCC" }, { key: "voltage", label: "Voltage", def: "5", unit: "V" }],
    symbol: [{ t: "l", p: [0, 0, 0, -8] }, { t: "l", p: [-7, -8, 7, -8] }], box: [-7, -16, 7, 0],
  },
  {
    key: "VDD", name: "VDD", category: "Power", domain: "power", kind: "virtual", prefix: "#PWR", desc: "Global supply net with implicit DC source to ground", model: "PWR", valueKey: "voltage",
    pins: [{ name: "VDD", num: 1, x: 0, y: 0 }], props: [{ key: "net", label: "Net Name", def: "VDD" }, { key: "voltage", label: "Voltage", def: "3.3", unit: "V" }],
    symbol: [{ t: "l", p: [0, 0, 0, -8] }, { t: "p", d: "M-6,-8 L6,-8 L0,-15 Z" }], box: [-7, -16, 7, 0],
  },
  {
    key: "VEE", name: "VEE", category: "Power", domain: "power", kind: "virtual", prefix: "#PWR", desc: "Negative supply net", model: "PWR", valueKey: "voltage",
    pins: [{ name: "VEE", num: 1, x: 0, y: 0 }], props: [{ key: "net", label: "Net Name", def: "VEE" }, { key: "voltage", label: "Voltage", def: "-15", unit: "V" }],
    symbol: [{ t: "l", p: [0, 0, 0, 8] }, { t: "l", p: [-7, 8, 7, 8] }], box: [-7, 0, 7, 16],
  },
  // ---------- Digital
  gate("NOT", "NOT", 1), gate("BUF", "Buffer", 1), gate("AND", "AND", 2), gate("OR", "OR", 2), gate("NAND", "NAND", 2), gate("NOR", "NOR", 2), gate("XOR", "XOR", 2),
  {
    key: "DFF", name: "D Flip-Flop", category: "Digital", domain: "digital", kind: "simulated", prefix: "U", desc: "Rising-edge D flip-flop", model: "DFF",
    pins: [{ name: "D", num: 1, x: -30, y: -10 }, { name: "CLK", num: 2, x: -30, y: 10 }, { name: "Q", num: 3, x: 30, y: -10 }, { name: "~Q", num: 4, x: 30, y: 10 }],
    props: logicProps, symbol: [{ t: "r", x: -20, y: -20, w: 40, h: 40 }, { t: "l", p: [-30, -10, -20, -10] }, { t: "l", p: [-30, 10, -20, 10] }, { t: "l", p: [20, -10, 30, -10] }, { t: "l", p: [20, 10, 30, 10] }, { t: "l", p: [-20, 6, -15, 10, -20, 14] }, { t: "tx", x: -13, y: -7, s: "D", size: 7 }, { t: "tx", x: 13, y: -7, s: "Q", size: 7 }, { t: "tx", x: 12, y: 13, s: "Q̅", size: 7 }], box: [-30, -20, 30, 20],
  },
  {
    key: "CNT4", name: "4-bit Counter", category: "Digital", domain: "digital", kind: "simulated", prefix: "U", desc: "Rising-edge 4-bit binary up counter", model: "CNT4",
    pins: [{ name: "CLK", num: 1, x: -30, y: 0 }, { name: "Q0", num: 2, x: 30, y: -15 }, { name: "Q1", num: 3, x: 30, y: -5 }, { name: "Q2", num: 4, x: 30, y: 5 }, { name: "Q3", num: 5, x: 30, y: 15 }],
    props: logicProps, symbol: [{ t: "r", x: -20, y: -25, w: 40, h: 50 }, { t: "l", p: [-30, 0, -20, 0] }, { t: "l", p: [20, -15, 30, -15] }, { t: "l", p: [20, -5, 30, -5] }, { t: "l", p: [20, 5, 30, 5] }, { t: "l", p: [20, 15, 30, 15] }, { t: "l", p: [-20, -4, -15, 0, -20, 4] }, { t: "tx", x: 0, y: -15, s: "CTR4", size: 7 }], box: [-30, -25, 30, 25],
  },
  {
    key: "LOGIC_IN", name: "Logic Input", category: "Digital", domain: "digital", kind: "virtual", prefix: "IN", desc: "Constant logic level (toggle via property)", model: "LOGIC_IN", valueKey: "level",
    pins: [{ name: "Y", num: 1, x: 20, y: 0 }], props: [{ key: "level", label: "Level", def: "1", options: ["0", "1"] }, { key: "vdd", label: "Logic High", def: "5", unit: "V", group: "sim" }],
    symbol: (p) => [{ t: "r", x: -10, y: -8, w: 16, h: 16 }, { t: "tx", x: -2, y: 3, s: p.level === "1" ? "1" : "0", size: 9 }, { t: "l", p: [6, 0, 20, 0] }], box: [-10, -8, 20, 8],
  },
  {
    key: "CLOCK", name: "Logic Clock", category: "Digital", domain: "digital", kind: "virtual", prefix: "CLK", desc: "Square wave digital clock source", model: "V", valueKey: "freq",
    pins: [{ name: "Y", num: 1, x: 20, y: 0 }], props: [{ key: "wave", label: "Waveform", def: "clock", options: ["clock"], group: "sim" }, { key: "freq", label: "Frequency", def: "1k", unit: "Hz" }, { key: "duty", label: "Duty Cycle", def: "50", unit: "%" }, { key: "vdd", label: "Logic High", def: "5", unit: "V", group: "sim" }],
    symbol: [{ t: "r", x: -12, y: -8, w: 20, h: 16 }, { t: "l", p: [-9, 4, -5, 4, -5, -4, 0, -4, 0, 4, 4, 4, 4, -4] }, { t: "l", p: [8, 0, 20, 0] }], box: [-12, -8, 20, 8],
  },
  {
    key: "LOGIC_PROBE", name: "Logic Probe", category: "Digital", domain: "digital", kind: "virtual", prefix: "X", desc: "Indicator lamp: lit if input > threshold", model: "HIZ",
    pins: [{ name: "IN", num: 1, x: -20, y: 0 }], props: [{ key: "threshold", label: "Threshold", def: "2.5", unit: "V" }],
    symbol: [{ t: "l", p: [-20, 0, -8, 0] }, { t: "c", x: 0, y: 0, r: 8 }], box: [-20, -8, 8, 8],
  },
  {
    key: "LED_IND", name: "LED Indicator", category: "Digital", domain: "digital", kind: "virtual", prefix: "X", desc: "Virtual LED indicator (high impedance)", model: "HIZ",
    pins: [{ name: "IN", num: 1, x: -20, y: 0 }], props: [{ key: "threshold", label: "Threshold", def: "2.5", unit: "V" }, { key: "color", label: "Color", def: "#e0342f" }],
    symbol: [{ t: "l", p: [-20, 0, -6, 0] }, { t: "p", d: "M-6,-6 L6,0 L-6,6 Z" }, { t: "l", p: [6, -6, 6, 6] }], box: [-20, -8, 8, 8],
  },
  // ---------- Connectors
  {
    key: "CONN2", name: "Connector 2-pin", category: "Connectors", domain: "analog", kind: "physical", prefix: "J", desc: "Physical 2-pin header (no simulation model)", model: "",
    pins: [{ name: "1", num: 1, x: -20, y: -5 }, { name: "2", num: 2, x: -20, y: 5 }], props: [...phys],
    symbol: [{ t: "r", x: -8, y: -10, w: 12, h: 20 }, { t: "l", p: [-20, -5, -8, -5] }, { t: "l", p: [-20, 5, -8, 5] }], box: [-20, -10, 4, 10], footprint: "PinHeader_1x02",
  },
  // ---------- Instruments
  {
    key: "SCOPE", name: "Oscilloscope", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XSC", desc: "4-channel oscilloscope (A-D vs. ground)", model: "INSTR", instrument: true,
    pins: [{ name: "A", num: 1, x: -30, y: 30 }, { name: "B", num: 2, x: -10, y: 30 }, { name: "C", num: 3, x: 10, y: 30 }, { name: "D", num: 4, x: 30, y: 30 }], props: [],
    symbol: [...instrBox("SCOPE", 80, 50), { t: "r", x: -32, y: -8, w: 64, h: 24 }, { t: "p", d: "M-28,4 Q-20,-8 -12,4 Q-4,16 4,4 Q12,-8 20,4" }, { t: "l", p: [-30, 25, -30, 30] }, { t: "l", p: [-10, 25, -10, 30] }, { t: "l", p: [10, 25, 10, 30] }, { t: "l", p: [30, 25, 30, 30] }, { t: "tx", x: -30, y: 22, s: "A", size: 6 }, { t: "tx", x: -10, y: 22, s: "B", size: 6 }, { t: "tx", x: 10, y: 22, s: "C", size: 6 }, { t: "tx", x: 30, y: 22, s: "D", size: 6 }],
    box: [-40, -25, 40, 30],
  },
  {
    key: "FGEN", name: "Function Generator", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XFG", desc: "Waveform generator: + / COM / − outputs", model: "FGEN", instrument: true,
    pins: [{ name: "+", num: 1, x: -20, y: 30 }, { name: "COM", num: 2, x: 0, y: 30 }, { name: "-", num: 3, x: 20, y: 30 }],
    props: [{ key: "wave", label: "Waveform", def: "sine", options: ["sine", "square", "triangle", "sawtooth", "noise", "dc", "pwl"] }, { key: "freq", label: "Frequency", def: "1k", unit: "Hz" }, { key: "ampl", label: "Amplitude (pk)", def: "1", unit: "V" }, { key: "offset", label: "Offset", def: "0", unit: "V" }, { key: "phase", label: "Phase", def: "0", unit: "°" }, { key: "duty", label: "Duty Cycle", def: "50", unit: "%" }, { key: "rout", label: "Output Impedance", def: "50", unit: "Ω" }, { key: "pwl", label: "PWL Points", def: "0 0, 1m 1, 2m 0" }, { key: "ac", label: "AC Magnitude", def: "1", unit: "V", group: "sim" }],
    symbol: [...instrBox("FGEN", 60, 50), { t: "p", d: "M-18,4 Q-12,-8 -6,4 Q0,16 6,4 Q12,-8 18,4" }, { t: "l", p: [-20, 25, -20, 30] }, { t: "l", p: [0, 25, 0, 30] }, { t: "l", p: [20, 25, 20, 30] }, { t: "tx", x: -20, y: 22, s: "+", size: 7 }, { t: "tx", x: 0, y: 22, s: "C", size: 6 }, { t: "tx", x: 20, y: 22, s: "−", size: 7 }],
    box: [-30, -25, 30, 30],
  },
  {
    key: "DMM", name: "Digital Multimeter", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XMM", desc: "V / A / Ω / dB multimeter", model: "DMM", instrument: true,
    pins: [{ name: "+", num: 1, x: -10, y: 30 }, { name: "-", num: 2, x: 10, y: 30 }], props: [{ key: "mode", label: "Mode", def: "V", options: ["V", "A", "Ohm", "Diode", "Continuity"] }, { key: "acdc", label: "AC/DC", def: "DC", options: ["DC", "AC"] }],
    symbol: [...instrBox("DMM", 40, 50), { t: "r", x: -14, y: -6, w: 28, h: 12 }, { t: "l", p: [-10, 25, -10, 30] }, { t: "l", p: [10, 25, 10, 30] }, { t: "tx", x: -10, y: 22, s: "+", size: 7 }, { t: "tx", x: 10, y: 22, s: "−", size: 7 }],
    box: [-20, -25, 20, 30],
  },
  {
    key: "BODE", name: "Bode Plotter", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XBP", desc: "AC transfer function OUT/IN", model: "INSTR", instrument: true,
    pins: [{ name: "IN+", num: 1, x: -30, y: 30 }, { name: "IN-", num: 2, x: -10, y: 30 }, { name: "OUT+", num: 3, x: 10, y: 30 }, { name: "OUT-", num: 4, x: 30, y: 30 }], props: [],
    symbol: [...instrBox("BODE", 80, 50), { t: "l", p: [-28, -4, -4, -4, 20, 14] }, { t: "l", p: [-30, 25, -30, 30] }, { t: "l", p: [-10, 25, -10, 30] }, { t: "l", p: [10, 25, 10, 30] }, { t: "l", p: [30, 25, 30, 30] }, { t: "tx", x: -20, y: 22, s: "IN", size: 6 }, { t: "tx", x: 20, y: 22, s: "OUT", size: 6 }],
    box: [-40, -25, 40, 30],
  },
  {
    key: "LA", name: "Logic Analyzer", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XLA", desc: "8/16/32 channel logic analyzer", model: "INSTR", instrument: true,
    pins: (p) => Array.from({ length: Number(p.channels || 8) }, (_, i) => ({ name: `D${i}`, num: i + 1, x: -30, y: -((Number(p.channels || 8) - 1) * 10) / 2 + i * 10 })),
    props: [{ key: "channels", label: "Channels", def: "8", options: ["8", "16", "32"] }],
    symbol: (p) => {
      const n = Number(p.channels || 8), h = n * 10 + 10;
      return [{ t: "r", x: -20, y: -h / 2, w: 40, h }, { t: "tx", x: 0, y: -h / 2 + 10, s: "LA", size: 8 }, ...Array.from({ length: n }, (_, i) => ({ t: "l" as const, p: [-30, -((n - 1) * 10) / 2 + i * 10, -20, -((n - 1) * 10) / 2 + i * 10] }))];
    },
    box: [-30, -45, 20, 45],
  },
  {
    key: "WATT", name: "Wattmeter", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XWM", desc: "Voltage across V+/V−, current through I+→I−", model: "WATT", instrument: true,
    pins: [{ name: "V+", num: 1, x: -30, y: 30 }, { name: "V-", num: 2, x: -10, y: 30 }, { name: "I+", num: 3, x: 10, y: 30 }, { name: "I-", num: 4, x: 30, y: 30 }], props: [],
    symbol: [...instrBox("WATT", 80, 50), { t: "l", p: [-30, 25, -30, 30] }, { t: "l", p: [-10, 25, -10, 30] }, { t: "l", p: [10, 25, 10, 30] }, { t: "l", p: [30, 25, 30, 30] }, { t: "tx", x: -20, y: 22, s: "V", size: 6 }, { t: "tx", x: 20, y: 22, s: "I", size: 6 }],
    box: [-40, -25, 40, 30],
  },
  {
    key: "FCNT", name: "Frequency Counter", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XFC", desc: "Measures frequency of input signal (transient)", model: "INSTR", instrument: true,
    pins: [{ name: "IN", num: 1, x: 0, y: 30 }], props: [],
    symbol: [...instrBox("FREQ", 50, 50), { t: "l", p: [0, 25, 0, 30] }], box: [-25, -25, 25, 30],
  },
  {
    key: "SPEC", name: "Spectrum Analyzer", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XSA", desc: "FFT spectrum of input (transient)", model: "INSTR", instrument: true,
    pins: [{ name: "IN", num: 1, x: 0, y: 30 }], props: [],
    symbol: [...instrBox("SPECTRUM", 60, 50), { t: "l", p: [-18, 14, -18, 0] }, { t: "l", p: [-8, 14, -8, -6] }, { t: "l", p: [2, 14, 2, 6] }, { t: "l", p: [12, 14, 12, 9] }, { t: "l", p: [0, 25, 0, 30] }], box: [-30, -25, 30, 30],
  },
  {
    key: "WGEN", name: "Word Generator", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XWG", desc: "8-bit digital pattern generator (hex words)", model: "WGEN", instrument: true,
    pins: Array.from({ length: 8 }, (_, i) => ({ name: `B${i}`, num: i + 1, x: 30, y: -35 + i * 10 })),
    props: [{ key: "words", label: "Words (hex)", def: "01 02 04 08 10 20 40 80" }, { key: "freq", label: "Word Rate", def: "1k", unit: "Hz" }, { key: "vdd", label: "Logic High", def: "5", unit: "V" }],
    symbol: [{ t: "r", x: -20, y: -45, w: 40, h: 90 }, { t: "tx", x: 0, y: -48, s: "WORD", size: 7 }, ...Array.from({ length: 8 }, (_, i) => ({ t: "l" as const, p: [20, -35 + i * 10, 30, -35 + i * 10] }))], box: [-20, -45, 30, 45],
  },
  {
    key: "IV", name: "IV Analyzer", category: "Instruments", domain: "instrument", kind: "virtual", prefix: "XIV", desc: "Sweeps voltage on + vs − and records current (DUT 2-terminal)", model: "IV", instrument: true,
    pins: [{ name: "+", num: 1, x: -10, y: 30 }, { name: "-", num: 2, x: 10, y: 30 }], props: [{ key: "vstart", label: "V start", def: "-1", unit: "V" }, { key: "vstop", label: "V stop", def: "1", unit: "V" }, { key: "points", label: "Points", def: "101" }],
    symbol: [...instrBox("IV", 40, 50), { t: "p", d: "M-12,10 L0,10 Q8,10 10,-8" }, { t: "l", p: [-10, 25, -10, 30] }, { t: "l", p: [10, 25, 10, 30] }], box: [-20, -25, 20, 30],
  },
];

export const LIBMAP: Record<string, PartDef> = Object.fromEntries(LIB.map((p) => [p.key, p]));
export const CATEGORIES: Category[] = ["Basic", "Sources", "Diodes", "Transistors", "Analog", "Digital", "Power", "Connectors", "Instruments", "Virtual"];

export function defaultProps(def: PartDef): Record<string, string> {
  return Object.fromEntries(def.props.map((p) => [p.key, p.def]));
}
export function pinsOf(def: PartDef, props: Record<string, string>): PinDef[] {
  return typeof def.pins === "function" ? def.pins(props) : def.pins;
}
export function symbolOf(def: PartDef, props: Record<string, string>): Prim[] {
  return typeof def.symbol === "function" ? def.symbol(props) : def.symbol;
}
export function boxOf(def: PartDef, props: Record<string, string>): [number, number, number, number] {
  if (def.key === "LA") {
    const n = Number(props.channels || 8);
    return [-30, -(n * 10 + 10) / 2, 20, (n * 10 + 10) / 2];
  }
  return def.box;
}
