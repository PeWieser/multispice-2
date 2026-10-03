import type { IconName } from "../ui/icons";

export type PartType = "resistor" | "capacitor" | "inductor" | "source" | "ground" | "diode" | "led" | "ic555" | "netlabel";
export type Rotation = 0 | 90 | 180 | 270;

export interface Part {
  id: string;
  type: PartType;
  ref: string; // R1, C1 …
  x: number;
  y: number;
  rot: Rotation;
  value?: number; // SI base value
  unit?: string; // Ω, F, H, V
  label?: string; // for net labels / diode names
  showRef?: boolean;
  showValue?: boolean;
  tolerance?: number;
  color?: string; // led colour
}

export interface Wire {
  id: string;
  points: [number, number][];
  net: string;
}

export interface Junction {
  x: number;
  y: number;
  net: string;
}

export interface Circuit {
  parts: Part[];
  wires: Wire[];
  junctions: Junction[];
}

export const GRID = 10;
export const snap = (v: number) => Math.round(v / GRID) * GRID;

/* ───────────── SI formatting ───────────── */
const PREFIXES: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
];

export function formatSI(v: number, unit = "", digits = 3): string {
  if (v === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(v);
  const hit = PREFIXES.find(([m]) => abs >= m) ?? PREFIXES[PREFIXES.length - 1];
  const n = v / hit[0];
  const str = Number(n.toPrecision(digits)).toString().replace(".", ",");
  return `${str} ${hit[1]}${unit}`.trim();
}

export function partIcon(t: PartType): IconName {
  switch (t) {
    case "resistor":
      return "resistor";
    case "capacitor":
      return "capacitor";
    case "inductor":
      return "inductor";
    case "source":
      return "source";
    case "ground":
      return "ground";
    case "diode":
      return "diode";
    case "led":
      return "led";
    case "ic555":
      return "ic";
    case "netlabel":
      return "tag";
  }
}

export const PART_NAMES: Record<PartType, string> = {
  resistor: "Widerstand",
  capacitor: "Kondensator",
  inductor: "Spule",
  source: "Spannungsquelle",
  ground: "Masse",
  diode: "Diode",
  led: "Leuchtdiode",
  ic555: "Timer NE555",
  netlabel: "Netzbezeichner",
};

/* ───────────── The 555 blinker ───────────── */
export const initialCircuit: Circuit = {
  parts: [
    { id: "v1", type: "source", ref: "V1", x: 300, y: 250, rot: 0, value: 9, unit: "V", showRef: true, showValue: true },
    { id: "r1", type: "resistor", ref: "R1", x: 440, y: 180, rot: 90, value: 10e3, unit: "Ω", showRef: true, showValue: true, tolerance: 1 },
    { id: "r2", type: "resistor", ref: "R2", x: 440, y: 280, rot: 90, value: 47e3, unit: "Ω", showRef: true, showValue: true, tolerance: 1 },
    { id: "c1", type: "capacitor", ref: "C1", x: 440, y: 370, rot: 90, value: 10e-6, unit: "F", showRef: true, showValue: true, tolerance: 10 },
    { id: "u1", type: "ic555", ref: "U1", x: 570, y: 250, rot: 0, label: "NE555", showRef: true, showValue: true },
    { id: "r3", type: "resistor", ref: "R3", x: 770, y: 230, rot: 0, value: 470, unit: "Ω", showRef: true, showValue: true, tolerance: 5 },
    { id: "d1", type: "led", ref: "D1", x: 890, y: 230, rot: 0, label: "Rot", color: "#ff453a", showRef: true, showValue: true },
    { id: "g1", type: "ground", ref: "GND", x: 300, y: 400, rot: 0 },
    { id: "g2", type: "ground", ref: "GND", x: 440, y: 420, rot: 0 },
    { id: "g3", type: "ground", ref: "GND", x: 480, y: 400, rot: 0 },
    { id: "g4", type: "ground", ref: "GND", x: 960, y: 330, rot: 0 },
    { id: "n1", type: "netlabel", ref: "CAP", x: 410, y: 330, rot: 180, label: "CAP" },
    { id: "n2", type: "netlabel", ref: "CAP", x: 670, y: 270, rot: 0, label: "CAP" },
    { id: "n3", type: "netlabel", ref: "OUT", x: 690, y: 230, rot: 0, label: "OUT" },
  ],
  wires: [
    // supply rail
    { id: "w1", net: "VCC", points: [[300, 226], [300, 100], [680, 100], [680, 190], [640, 190]] },
    { id: "w2", net: "VCC", points: [[440, 100], [440, 130]] },
    { id: "w3", net: "VCC", points: [[490, 100], [490, 190], [500, 190]] },
    // V1 to ground
    { id: "w4", net: "GND", points: [[300, 274], [300, 400]] },
    // R1 — R2 node (DIS)
    { id: "w5", net: "DIS", points: [[440, 230], [500, 230]] },
    // CAP node
    { id: "w6", net: "CAP", points: [[500, 270], [470, 270], [470, 330], [440, 330]] },
    { id: "w7", net: "CAP", points: [[440, 330], [410, 330]] },
    { id: "w8", net: "CAP", points: [[640, 270], [670, 270]] },
    { id: "w9", net: "GND", points: [[440, 390], [440, 420]] },
    // GND pin
    { id: "w10", net: "GND", points: [[500, 310], [480, 310], [480, 400]] },
    // OUT
    { id: "w11", net: "OUT", points: [[640, 230], [720, 230]] },
    { id: "w12", net: "OUT", points: [[820, 230], [860, 230]] },
    { id: "w13", net: "GND", points: [[920, 230], [960, 230], [960, 330]] },
  ],
  junctions: [
    { x: 440, y: 100, net: "VCC" },
    { x: 490, y: 100, net: "VCC" },
    { x: 440, y: 230, net: "DIS" },
    { x: 440, y: 330, net: "CAP" },
  ],
};

export function timing(c: Circuit) {
  const r1 = c.parts.find((p) => p.id === "r1")?.value ?? 10e3;
  const r2 = c.parts.find((p) => p.id === "r2")?.value ?? 47e3;
  const cap = c.parts.find((p) => p.id === "c1")?.value ?? 10e-6;
  const tHigh = 0.693 * (r1 + r2) * cap;
  const tLow = 0.693 * r2 * cap;
  const period = tHigh + tLow;
  return { tHigh, tLow, period, freq: 1 / period, duty: tHigh / period, vcc: c.parts.find((p) => p.id === "v1")?.value ?? 9 };
}

/** Output state and cap voltage at time t (seconds). */
export function sample(t: number, tm: ReturnType<typeof timing>) {
  const ph = ((t % tm.period) + tm.period) % tm.period;
  const high = ph < tm.tHigh;
  // capacitor charges 1/3→2/3 Vcc during high, discharges during low (exponential approximations)
  const v13 = tm.vcc / 3;
  const v23 = (2 * tm.vcc) / 3;
  let vc: number;
  if (high) {
    const k = ph / tm.tHigh;
    vc = v13 + (v23 - v13) * (1 - Math.exp(-k * 0.693 * 1.7)) / (1 - Math.exp(-0.693 * 1.7));
  } else {
    const k = (ph - tm.tHigh) / tm.tLow;
    vc = v23 - (v23 - v13) * (1 - Math.exp(-k * 0.693 * 1.7)) / (1 - Math.exp(-0.693 * 1.7));
  }
  return { high, vc, vout: high ? tm.vcc - 1.4 : 0.1 };
}
