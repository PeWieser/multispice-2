import type { CompDef, PinDef, PropDef, Shape } from "./types";

/* ------------------------------------------------------------------ *
 *  CircuitBench component & symbol library
 *  Every symbol is hand-drawn SVG geometry on a 10-unit technical grid.
 * ------------------------------------------------------------------ */

const pin = (
  id: string,
  name: string,
  x: number,
  y: number,
  type: PinDef["type"] = "passive",
): PinDef => ({ id, name, x, y, type });

const P = {
  num: (key: string, label: string, def: string, spiceKey?: string, unit?: string): PropDef => ({
    key,
    label,
    group: "Simulation",
    type: "number",
    def,
    spiceKey,
    unit,
  }),
  text: (key: string, label: string, def: string, group: PropDef["group"] = "Simulation"): PropDef => ({
    key,
    label,
    group,
    type: "text",
    def,
  }),
  enum: (
    key: string,
    label: string,
    def: string,
    options: string[],
    group: PropDef["group"] = "Simulation",
  ): PropDef => ({ key, label, group, type: "enum", def, options }),
  bool: (key: string, label: string, def: string, group: PropDef["group"] = "Simulation"): PropDef => ({
    key,
    label,
    group,
    type: "bool",
    def,
    options: ["true", "false"],
  }),
};

const physical = (pkg = "0805"): PropDef[] => [
  P.text("footprint", "Footprint", "R_0805", "Physical"),
  P.text("package", "Package", pkg, "Physical"),
  P.text("manufacturer", "Manufacturer", "", "Physical"),
  P.text("partNumber", "Part Number", "", "Physical"),
  P.text("netClass", "Net Class", "Default", "Advanced"),
  P.text("comment", "Comment", "", "General"),
];

const lead = (x1: number, y1: number, x2: number, y2: number): Shape => ({
  t: "line",
  x1,
  y1,
  x2,
  y2,
  w: 1.4,
});

const body = (...s: Shape[]): Shape[] => s;

const zigzag = "M -20 0 L -15 -9 L -10 9 L -5 -9 L 0 9 L 5 -9 L 10 9 L 15 -9 L 20 0";
const coil =
  "M -20 0 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0";

export const COMPONENTS: CompDef[] = [
  /* ------------------------------ Basic ---------------------------- */
  {
    id: "resistor",
    name: "Resistor",
    category: "Basic",
    prefix: "R",
    desc: "Linear two-terminal resistor",
    kind: "analog",
    model: "simulated",
    valueProp: "resistance",
    searchTerms: "widerstand r ohm passive",
    pins: [pin("1", "1", -30, 0), pin("2", "2", 30, 0)],
    shapes: [...body(lead(-30, 0, -20, 0), lead(20, 0, 30, 0)), { t: "path", d: zigzag, w: 1.6 }],
    props: [
      P.num("resistance", "Resistance", "1k", "value", "Ω"),
      P.num("tolerance", "Tolerance", "5", undefined, "%"),
      P.num("tempco", "Temp. Coefficient", "0", undefined, "ppm/K"),
      P.num("temp", "Operating Temp.", "27", undefined, "°C"),
      ...physical(),
    ],
  },
  {
    id: "capacitor",
    name: "Capacitor",
    category: "Basic",
    prefix: "C",
    desc: "Linear two-terminal capacitor",
    kind: "analog",
    model: "simulated",
    valueProp: "capacitance",
    searchTerms: "kondensator c farad passive",
    pins: [pin("1", "1", -30, 0), pin("2", "2", 30, 0)],
    shapes: [
      lead(-30, 0, -5, 0),
      lead(5, 0, 30, 0),
      lead(-5, -13, -5, 13),
      lead(5, -13, 5, 13),
    ],
    props: [
      P.num("capacitance", "Capacitance", "100n", "value", "F"),
      P.num("ic", "Initial Condition", "0", "ic", "V"),
      P.num("tolerance", "Tolerance", "10", undefined, "%"),
      ...physical("0603"),
    ],
  },
  {
    id: "inductor",
    name: "Inductor",
    category: "Basic",
    prefix: "L",
    desc: "Linear two-terminal inductor",
    kind: "analog",
    model: "simulated",
    valueProp: "inductance",
    searchTerms: "spule l henry coil passive",
    pins: [pin("1", "1", -30, 0), pin("2", "2", 30, 0)],
    shapes: [lead(-30, 0, -20, 0), lead(20, 0, 30, 0), { t: "path", d: coil, w: 1.6 }],
    props: [
      P.num("inductance", "Inductance", "1m", "value", "H"),
      P.num("ic", "Initial Condition", "0", "ic", "A"),
      P.num("seriesResistance", "Series Resistance", "0", "rs", "Ω"),
      ...physical("1210"),
    ],
  },
  {
    id: "potentiometer",
    name: "Potentiometer",
    category: "Basic",
    prefix: "RV",
    desc: "Three-terminal adjustable resistor (wiper)",
    kind: "analog",
    model: "simulated",
    valueProp: "resistance",
    searchTerms: "poti trimmer wiper",
    pins: [pin("1", "1", -30, 0), pin("2", "2", 30, 0), pin("3", "W", 0, -30)],
    shapes: [
      lead(-30, 0, -20, 0),
      lead(20, 0, 30, 0),
      lead(0, -30, 0, -18),
      { t: "path", d: zigzag, w: 1.6 },
      { t: "path", d: "M -10 18 L 10 -12", w: 1.4 },
      { t: "path", d: "M 10 -12 L 4 -12 M 10 -12 L 10 -6", w: 1.4 },
    ],
    props: [
      P.num("resistance", "Total Resistance", "10k", "value", "Ω"),
      P.num("position", "Wiper Position", "0.5", "pos", "0..1"),
      ...physical(),
    ],
  },
  {
    id: "switch",
    name: "Switch (SPST)",
    category: "Basic",
    prefix: "SW",
    desc: "Voltage controlled / manual single pole switch",
    kind: "analog",
    model: "simulated",
    searchTerms: "schalter relay",
    pins: [pin("1", "1", -30, 0), pin("2", "2", 30, 0)],
    shapes: [
      lead(-30, 0, -12, 0),
      lead(12, 0, 30, 0),
      { t: "circle", cx: -12, cy: 0, r: 3, fill: "currentColor" },
      { t: "circle", cx: 12, cy: 0, r: 3, fill: "currentColor" },
      { t: "path", d: "M -12 0 L 10 -16", w: 1.6 },
    ],
    props: [
      P.enum("state", "Contact State", "open", ["open", "closed"]),
      P.num("ron", "On Resistance", "0.01", "ron", "Ω"),
      P.num("roff", "Off Resistance", "1e12", "roff", "Ω"),
      ...physical("THT"),
    ],
  },
  {
    id: "transformer",
    name: "Transformer",
    category: "Basic",
    prefix: "T",
    desc: "Two-winding coupled inductor (ideal, coupling k)",
    kind: "analog",
    model: "simulated",
    searchTerms: "trafo übertrager coil",
    pins: [
      pin("1", "P1", -30, -20),
      pin("2", "P2", -30, 20),
      pin("3", "S1", 30, -20),
      pin("4", "S2", 30, 20),
    ],
    shapes: [
      lead(-30, -20, -18, -20),
      lead(-30, 20, -18, 20),
      lead(30, -20, 18, -20),
      lead(30, 20, 18, 20),
      { t: "path", d: "M -18 -26 A 6 6 0 0 1 -18 -14 A 6 6 0 0 1 -18 -2 A 6 6 0 0 1 -18 10 A 6 6 0 0 1 -18 26", w: 1.5 },
      { t: "path", d: "M 18 -26 A 6 6 0 0 1 18 -14 A 6 6 0 0 1 18 -2 A 6 6 0 0 1 18 10 A 6 6 0 0 1 18 26", w: 1.5 },
      lead(-4, -28, -4, 28),
      lead(4, -28, 4, 28),
    ],
    props: [
      P.num("inductance", "Primary Inductance", "10m", "lp", "H"),
      P.num("ratio", "Turns Ratio Np:Ns", "1", "n", ""),
      P.num("coupling", "Coupling k", "0.999", "k", ""),
      ...physical("THT"),
    ],
  },

  /* ----------------------------- Sources --------------------------- */
  {
    id: "vsource",
    name: "Voltage Source (DC)",
    category: "Sources",
    prefix: "V",
    desc: "Independent DC voltage source",
    kind: "source",
    model: "simulated",
    valueProp: "voltage",
    searchTerms: "spannungsquelle batterie supply dc",
    pins: [pin("1", "+", 0, -30, "power"), pin("2", "−", 0, 30, "power")],
    shapes: [
      lead(0, -30, 0, -18),
      lead(0, 30, 0, 18),
      { t: "circle", cx: 0, cy: 0, r: 18, w: 1.6 },
      { t: "text", x: 0, y: -4, s: "+", size: 14, anchor: "middle" },
      { t: "text", x: 0, y: 13, s: "−", size: 15, anchor: "middle" },
    ],
    props: [
      P.num("voltage", "DC Voltage", "5", "dc", "V"),
      P.num("acMagnitude", "AC Magnitude", "1", "ac", "V"),
      P.num("acPhase", "AC Phase", "0", "acphase", "°"),
      P.num("seriesResistance", "Series Resistance", "0", "rs", "Ω"),
      P.num("temp", "Operating Temp.", "27", undefined, "°C"),
      ...physical("THT"),
    ],
  },
  {
    id: "isource",
    name: "Current Source (DC)",
    category: "Sources",
    prefix: "I",
    desc: "Independent DC current source",
    kind: "source",
    model: "simulated",
    valueProp: "current",
    searchTerms: "stromquelle current dc",
    pins: [pin("1", "+", 0, -30, "power"), pin("2", "−", 0, 30, "power")],
    shapes: [
      lead(0, -30, 0, -18),
      lead(0, 30, 0, 18),
      { t: "circle", cx: 0, cy: 0, r: 18, w: 1.6 },
      { t: "path", d: "M 0 -10 L 0 10", w: 1.6 },
      { t: "path", d: "M -5 4 L 0 11 L 5 4", w: 1.6 },
    ],
    props: [
      P.num("current", "DC Current", "1m", "dc", "A"),
      P.num("acMagnitude", "AC Magnitude", "1", "ac", "A"),
      ...physical("THT"),
    ],
  },
  {
    id: "vsine",
    name: "Sine Source",
    category: "Sources",
    prefix: "V",
    desc: "Independent sinusoidal voltage source",
    kind: "source",
    model: "simulated",
    valueProp: "amplitude",
    searchTerms: "sinus generator ac wechselspannung",
    pins: [pin("1", "+", 0, -30, "power"), pin("2", "−", 0, 30, "power")],
    shapes: [
      lead(0, -30, 0, -18),
      lead(0, 30, 0, 18),
      { t: "circle", cx: 0, cy: 0, r: 18, w: 1.6 },
      {
        t: "path",
        d: "M -11 2 Q -5.5 -12 0 0 Q 5.5 12 11 -2",
        w: 1.6,
      },
    ],
    props: [
      P.num("amplitude", "Amplitude", "5", "ampl", "V"),
      P.num("frequency", "Frequency", "1k", "freq", "Hz"),
      P.num("offset", "DC Offset", "0", "offset", "V"),
      P.num("delay", "Delay", "0", "td", "s"),
      P.num("damping", "Damping", "0", "theta", "1/s"),
      P.num("phase", "Phase", "0", "phase", "°"),
      ...physical("THT"),
    ],
  },
  {
    id: "vpulse",
    name: "Pulse Source",
    category: "Sources",
    prefix: "V",
    desc: "Independent pulse / square voltage source",
    kind: "source",
    model: "simulated",
    valueProp: "amplitude",
    searchTerms: "pulse square rechteck takt clock",
    pins: [pin("1", "+", 0, -30, "power"), pin("2", "−", 0, 30, "power")],
    shapes: [
      lead(0, -30, 0, -18),
      lead(0, 30, 0, 18),
      { t: "circle", cx: 0, cy: 0, r: 18, w: 1.6 },
      { t: "path", d: "M -11 6 L -11 -6 L -2 -6 L -2 6 L 7 6 L 7 -6 L 11 -6", w: 1.5 },
    ],
    props: [
      P.num("initial", "Initial Value", "0", "v1", "V"),
      P.num("pulse", "Pulse Value", "5", "v2", "V"),
      P.num("delay", "Delay Time", "0", "td", "s"),
      P.num("rise", "Rise Time", "1n", "tr", "s"),
      P.num("fall", "Fall Time", "1n", "tf", "s"),
      P.num("pulseWidth", "Pulse Width", "0.5m", "pw", "s"),
      P.num("period", "Period", "1m", "per", "s"),
      ...physical("THT"),
    ],
  },
  {
    id: "vpwl",
    name: "PWL Source",
    category: "Sources",
    prefix: "V",
    desc: "Piecewise-linear voltage source",
    kind: "source",
    model: "simulated",
    valueProp: "points",
    searchTerms: "pwl arbitrary waveform beliebig",
    pins: [pin("1", "+", 0, -30, "power"), pin("2", "−", 0, 30, "power")],
    shapes: [
      lead(0, -30, 0, -18),
      lead(0, 30, 0, 18),
      { t: "circle", cx: 0, cy: 0, r: 18, w: 1.6 },
      { t: "path", d: "M -12 8 L -6 8 L -2 -8 L 4 -8 L 8 2 L 12 2", w: 1.5 },
    ],
    props: [
      P.text("points", "PWL Points (t,V)", "0 0 1m 0 1.1m 5 5m 5 5.1m 0"),
      ...physical("THT"),
    ],
  },

  /* ----------------------------- Diodes ---------------------------- */
  {
    id: "diode",
    name: "Diode",
    category: "Diodes",
    prefix: "D",
    desc: "Silicon PN junction diode (Shockley model)",
    kind: "analog",
    model: "simulated",
    valueProp: "model",
    searchTerms: "diode gleichrichter rectifier 1n4148",
    pins: [pin("A", "A", -30, 0), pin("K", "K", 30, 0)],
    shapes: [
      lead(-30, 0, -10, 0),
      lead(10, 0, 30, 0),
      { t: "poly", pts: "-10,-11 -10,11 10,0", fill: "currentColor" },
      lead(10, -11, 10, 11),
    ],
    props: [
      P.text("model", "Model Name", "D1N4148"),
      P.num("is", "Saturation Current", "2.52n", "is", "A"),
      P.num("n", "Emission Coefficient", "1.0", "n", ""),
      P.num("bv", "Breakdown Voltage", "100", "bv", "V"),
      P.num("rs", "Series Resistance", "0.56", "rs", "Ω"),
      P.num("cj0", "Junction Capacitance", "4p", "cj0", "F"),
      ...physical("SOD-123"),
    ],
  },
  {
    id: "zener",
    name: "Zener Diode",
    category: "Diodes",
    prefix: "D",
    desc: "Zener / breakdown diode",
    kind: "analog",
    model: "simulated",
    valueProp: "breakdown",
    searchTerms: "zener bremsdiode stabistor",
    pins: [pin("A", "A", -30, 0), pin("K", "K", 30, 0)],
    shapes: [
      lead(-30, 0, -10, 0),
      lead(10, 0, 30, 0),
      { t: "poly", pts: "-10,-11 -10,11 10,0", fill: "currentColor" },
      { t: "path", d: "M 10 -11 L 10 11 M 10 -11 L 16 -11 M 10 11 L 4 11", w: 1.5 },
    ],
    props: [
      P.text("model", "Model Name", "DZ5V1"),
      P.num("breakdown", "Zener Voltage", "5.1", "bv", "V"),
      P.num("is", "Saturation Current", "1e-9", "is", "A"),
      P.num("rs", "Series Resistance", "1", "rs", "Ω"),
      ...physical("SOD-123"),
    ],
  },
  {
    id: "led",
    name: "LED",
    category: "Diodes",
    prefix: "D",
    desc: "Light emitting diode with emission arrows",
    kind: "analog",
    model: "simulated",
    valueProp: "model",
    searchTerms: "led leuchtdiode light",
    pins: [pin("A", "A", -30, 0), pin("K", "K", 30, 0)],
    shapes: [
      lead(-30, 0, -10, 0),
      lead(10, 0, 30, 0),
      { t: "poly", pts: "-10,-11 -10,11 10,0", fill: "currentColor" },
      lead(10, -11, 10, 11),
      { t: "path", d: "M 2 -14 L 12 -24 M 12 -24 L 6 -23 M 12 -24 L 11 -18", w: 1.3 },
      { t: "path", d: "M 8 -14 L 18 -24 M 18 -24 L 12 -23 M 18 -24 L 17 -18", w: 1.3 },
    ],
    props: [
      P.text("model", "Model Name", "DLED_RED"),
      P.num("is", "Saturation Current", "1e-20", "is", "A"),
      P.num("n", "Emission Coefficient", "1.8", "n", ""),
      P.num("drop", "Forward Drop (typ.)", "2.0", undefined, "V"),
      ...physical("THT 3mm"),
    ],
  },

  /* --------------------------- Transistors ------------------------- */
  {
    id: "npn",
    name: "BJT NPN",
    category: "Transistors",
    prefix: "Q",
    desc: "NPN bipolar junction transistor (Gummel-Poon)",
    kind: "analog",
    model: "simulated",
    valueProp: "model",
    searchTerms: "transistor npn bjt bc547",
    pins: [pin("B", "B", -30, 0, "input"), pin("C", "C", 20, -30), pin("E", "E", 20, 30)],
    shapes: [
      lead(-30, 0, -6, 0),
      lead(20, -30, 20, -10),
      lead(20, 30, 20, 10),
      { t: "circle", cx: 8, cy: 0, r: 22, w: 1.4 },
      lead(-6, -14, -6, 14),
      lead(-6, -8, 20, -18),
      lead(-6, 8, 20, 18),
      { t: "path", d: "M 8 8 L 18 13 L 12 17 Z", fill: "currentColor" },
    ],
    props: [
      P.text("model", "Model Name", "Q2N3904"),
      P.num("bf", "Forward Beta", "200", "bf", ""),
      P.num("is", "Saturation Current", "6.734f", "is", "A"),
      P.num("vaf", "Early Voltage", "74", "vaf", "V"),
      ...physical("TO-92"),
    ],
  },
  {
    id: "pnp",
    name: "BJT PNP",
    category: "Transistors",
    prefix: "Q",
    desc: "PNP bipolar junction transistor (Gummel-Poon)",
    kind: "analog",
    model: "simulated",
    valueProp: "model",
    searchTerms: "transistor pnp bjt bc557",
    pins: [pin("B", "B", -30, 0, "input"), pin("C", "C", 20, -30), pin("E", "E", 20, 30)],
    shapes: [
      lead(-30, 0, -6, 0),
      lead(20, -30, 20, -10),
      lead(20, 30, 20, 10),
      { t: "circle", cx: 8, cy: 0, r: 22, w: 1.4 },
      lead(-6, -14, -6, 14),
      lead(-6, -8, 20, -18),
      lead(-6, 8, 20, 18),
      { t: "path", d: "M -2 -2 L 8 -7 L 2 -11 Z", fill: "currentColor" },
    ],
    props: [
      P.text("model", "Model Name", "Q2N3906"),
      P.num("bf", "Forward Beta", "180", "bf", ""),
      P.num("is", "Saturation Current", "1.41f", "is", "A"),
      ...physical("TO-92"),
    ],
  },
  {
    id: "nmos",
    name: "MOSFET N-Channel",
    category: "Transistors",
    prefix: "M",
    desc: "N-channel enhancement MOSFET (Level 1)",
    kind: "analog",
    model: "simulated",
    valueProp: "model",
    searchTerms: "mosfet nmos transistor irfz44",
    pins: [
      pin("G", "G", -30, 0, "input"),
      pin("D", "D", 20, -30),
      pin("S", "S", 20, 30),
    ],
    shapes: [
      lead(-30, 0, -12, 0),
      lead(20, -30, 20, -12),
      lead(20, 30, 20, 12),
      lead(-8, -16, -8, 16),
      lead(-2, -18, -2, -6),
      lead(-2, -2, -2, 2),
      lead(-2, 6, -2, 18),
      lead(-2, -12, 20, -12),
      lead(-2, 12, 20, 12),
      lead(20, -12, 20, 12),
      { t: "path", d: "M -2 12 L 8 7 L 2 3 Z", fill: "currentColor" },
    ],
    props: [
      P.text("model", "Model Name", "M2N7000"),
      P.num("vt0", "Threshold Voltage", "1.8", "vto", "V"),
      P.num("kp", "Transconductance", "20m", "kp", "A/V²"),
      P.num("w", "Channel Width", "100u", "w", "m"),
      P.num("l", "Channel Length", "2u", "l", "m"),
      ...physical("SOT-23"),
    ],
  },
  {
    id: "pmos",
    name: "MOSFET P-Channel",
    category: "Transistors",
    prefix: "M",
    desc: "P-channel enhancement MOSFET (Level 1)",
    kind: "analog",
    model: "simulated",
    valueProp: "model",
    searchTerms: "mosfet pmos transistor",
    pins: [
      pin("G", "G", -30, 0, "input"),
      pin("D", "D", 20, -30),
      pin("S", "S", 20, 30),
    ],
    shapes: [
      lead(-30, 0, -12, 0),
      lead(20, -30, 20, -12),
      lead(20, 30, 20, 12),
      lead(-8, -16, -8, 16),
      lead(-2, -18, -2, -6),
      lead(-2, -2, -2, 2),
      lead(-2, 6, -2, 18),
      lead(-2, -12, 20, -12),
      lead(-2, 12, 20, 12),
      lead(20, -12, 20, 12),
      { t: "path", d: "M -2 -12 L 8 -7 L 2 -3 Z", fill: "currentColor" },
    ],
    props: [
      P.text("model", "Model Name", "M2SJ177"),
      P.num("vt0", "Threshold Voltage", "-1.2", "vto", "V"),
      P.num("kp", "Transconductance", "12m", "kp", "A/V²"),
      ...physical("SOT-23"),
    ],
  },

  /* ------------------------------ Analog --------------------------- */
  {
    id: "opamp",
    name: "Ideal Op Amp",
    category: "Analog",
    prefix: "U",
    desc: "Ideal operational amplifier (nullor: infinite gain, zero input current)",
    kind: "analog",
    model: "simulated",
    searchTerms: "operationsverstärker opamp op-amp verstärker",
    pins: [
      pin("in+", "IN+", -30, -10, "input"),
      pin("in-", "IN−", -30, 10, "input"),
      pin("out", "OUT", 30, 0, "output"),
    ],
    shapes: [
      lead(-30, -10, -18, -10),
      lead(-30, 10, -18, 10),
      lead(18, 0, 30, 0),
      { t: "poly", pts: "-18,-22 -18,22 18,0", w: 1.6 },
      { t: "text", x: -13, y: -5, s: "+", size: 13 },
      { t: "text", x: -13, y: 15, s: "−", size: 14 },
    ],
    props: [
      P.num("gain", "Open Loop Gain", "1e6", "av", ""),
      P.num("gainBandwidth", "Gain Bandwidth", "10Meg", "gbw", "Hz"),
      P.num("slewRate", "Slew Rate", "10e6", "sr", "V/s"),
      P.num("supply", "Supply Voltage", "±15", undefined, "V"),
      ...physical("SOIC-8"),
    ],
  },
  {
    id: "comparator",
    name: "Comparator",
    category: "Analog",
    prefix: "U",
    desc: "Open collector style comparator with hysteresis symbol",
    kind: "analog",
    model: "simulated",
    searchTerms: "komparator schmitt trigger",
    pins: [
      pin("in+", "IN+", -30, -10, "input"),
      pin("in-", "IN−", -30, 10, "input"),
      pin("out", "OUT", 30, 0, "output"),
    ],
    shapes: [
      lead(-30, -10, -18, -10),
      lead(-30, 10, -18, 10),
      lead(18, 0, 30, 0),
      { t: "poly", pts: "-18,-22 -18,22 18,0", w: 1.6 },
      { t: "text", x: -13, y: -5, s: "+", size: 13 },
      { t: "text", x: -13, y: 15, s: "−", size: 14 },
      { t: "path", d: "M -8 -2 L -2 -2 L -2 -8 M -2 8 L -2 2 L -8 2", w: 1.2 },
    ],
    props: [
      P.num("gain", "Gain", "1e5", "av", ""),
      P.num("hysteresis", "Hysteresis", "0", "hyst", "V"),
      P.num("outHigh", "Output High", "5", "voh", "V"),
      P.num("outLow", "Output Low", "0", "vol", "V"),
      ...physical("SOIC-8"),
    ],
  },

  /* ------------------------------ Power ---------------------------- */
  {
    id: "gnd",
    name: "Ground",
    category: "Power",
    prefix: "GND",
    desc: "Global ground reference (node 0)",
    kind: "power",
    model: "virtual",
    fixedValue: "GND",
    searchTerms: "ground masse gnd erde 0V",
    pins: [pin("1", "GND", 0, -20, "ground")],
    shapes: [
      lead(0, -20, 0, 0),
      lead(-14, 0, 14, 0),
      lead(-9, 5, 9, 5),
      lead(-4, 10, 4, 10),
    ],
    props: [],
  },
  {
    id: "vcc",
    name: "VCC",
    category: "Power",
    prefix: "VCC",
    desc: "Global positive power rail",
    kind: "power",
    model: "virtual",
    fixedValue: "VCC",
    searchTerms: "vcc supply power versorgung",
    pins: [pin("1", "VCC", 0, 20, "power")],
    shapes: [
      lead(0, 20, 0, 0),
      { t: "path", d: "M -10 2 L 0 -12 L 10 2", w: 1.6 },
      { t: "text", x: 0, y: -18, s: "VCC", size: 11, anchor: "middle" },
    ],
    props: [P.num("voltage", "Rail Voltage", "5", "dc", "V")],
  },
  {
    id: "vdd",
    name: "VDD",
    category: "Power",
    prefix: "VDD",
    desc: "Global logic supply rail",
    kind: "power",
    model: "virtual",
    fixedValue: "VDD",
    searchTerms: "vdd supply logic power",
    pins: [pin("1", "VDD", 0, 20, "power")],
    shapes: [
      lead(0, 20, 0, 0),
      { t: "path", d: "M -10 2 L 0 -12 L 10 2", w: 1.6 },
      { t: "text", x: 0, y: -18, s: "VDD", size: 11, anchor: "middle" },
    ],
    props: [P.num("voltage", "Rail Voltage", "5", "dc", "V")],
  },

  /* ------------------------------ Digital -------------------------- */
  ...gate("not", "NOT", "U", "Inverter", ["in"], ["out"], "M -16 -16 L 16 0 L -16 16 Z", "M 20 0 A 4 4 0 0 1 20 0.01", 1),
  ...gate("buffer", "Buffer", "U", "Non-inverting buffer", ["in"], ["out"], "M -16 -16 L 16 0 L -16 16 Z", "", 1),
  ...gate("and", "AND", "U", "2-input AND gate", ["A", "B"], ["Y"], "M -18 -16 L -2 -16 A 16 16 0 0 1 -2 16 L -18 16 Z", "", 2),
  ...gate("or", "OR", "U", "2-input OR gate", ["A", "B"], ["Y"], "M -18 -16 Q -4 -16 6 -16 Q 20 -6 20 0 Q 20 6 6 16 Q -4 16 -18 16 Q -8 0 -18 -16 Z", "", 2),
  ...gate("nand", "NAND", "U", "2-input NAND gate", ["A", "B"], ["Y"], "M -18 -16 L -2 -16 A 16 16 0 0 1 -2 16 L -18 16 Z", "", 2),
  ...gate("nor", "NOR", "U", "2-input NOR gate", ["A", "B"], ["Y"], "M -18 -16 Q -4 -16 6 -16 Q 20 -6 20 0 Q 20 6 6 16 Q -4 16 -18 16 Q -8 0 -18 -16 Z", "", 2),
  ...gate("xor", "XOR", "U", "2-input XOR gate", ["A", "B"], ["Y"], "M -12 -16 Q 2 -16 12 -16 Q 26 -6 26 0 Q 26 6 12 16 Q 2 16 -12 16 Q -2 0 -12 -16 Z", "", 2),
  {
    id: "logic_in",
    name: "Logic Input",
    category: "Digital",
    prefix: "S",
    desc: "Interactive logic level source (click to toggle)",
    kind: "digital",
    model: "virtual",
    valueProp: "state",
    searchTerms: "logic input schalter level",
    pins: [pin("out", "Q", 30, 0, "output")],
    shapes: [
      lead(18, 0, 30, 0),
      { t: "rect", x: -22, y: -16, w: 40, h: 32, r: 3 },
      { t: "text", x: -2, y: 6, s: "0", size: 17, anchor: "middle" },
    ],
    props: [
      P.enum("state", "Logic State", "0", ["0", "1"]),
      P.num("voltage", "High Level", "5", undefined, "V"),
    ],
  },
  {
    id: "logic_clk",
    name: "Logic Clock",
    category: "Digital",
    prefix: "XG",
    desc: "Digital clock source for logic simulation",
    kind: "digital",
    model: "virtual",
    valueProp: "frequency",
    searchTerms: "clock takt generator oscillator",
    pins: [pin("out", "Q", 30, 0, "output")],
    shapes: [
      lead(18, 0, 30, 0),
      { t: "rect", x: -22, y: -16, w: 40, h: 32, r: 3 },
      { t: "path", d: "M -16 8 L -16 -8 L -6 -8 L -6 8 L 4 8 L 4 -8 L 14 -8", w: 1.5 },
    ],
    props: [
      P.num("frequency", "Frequency", "1k", "freq", "Hz"),
      P.num("duty", "Duty Cycle", "50", "duty", "%"),
      P.enum("state", "Initial State", "0", ["0", "1"]),
    ],
  },
  {
    id: "logic_probe",
    name: "Logic Probe",
    category: "Digital",
    prefix: "TP",
    desc: "Logic state indicator on a net",
    kind: "digital",
    model: "virtual",
    searchTerms: "probe testpunkt indicator",
    pins: [pin("in", "IN", -30, 0, "input")],
    shapes: [
      lead(-30, 0, -14, 0),
      { t: "poly", pts: "-14,-14 -14,14 16,0", w: 1.5 },
      { t: "text", x: -2, y: 5, s: "?", size: 13, anchor: "middle" },
    ],
    props: [P.text("name", "Label", "TP1", "General")],
  },
  {
    id: "led_ind",
    name: "LED Indicator",
    category: "Digital",
    prefix: "D",
    desc: "Logic level indicator lamp",
    kind: "digital",
    model: "simulated",
    searchTerms: "led lampe indicator anzeige",
    pins: [pin("A", "A", -30, 0), pin("K", "K", 30, 0)],
    shapes: [
      lead(-30, 0, -12, 0),
      lead(12, 0, 30, 0),
      { t: "circle", cx: 0, cy: 0, r: 12, w: 1.5 },
      { t: "path", d: "M -6 -6 L 6 6 M -6 6 L 6 -6", w: 1.2 },
    ],
    props: [
      P.num("drop", "Forward Drop", "2.0", undefined, "V"),
      P.num("seriesResistance", "Series Resistance", "330", "rs", "Ω"),
    ],
  },
  {
    id: "dff",
    name: "D Flip-Flop",
    category: "Digital",
    prefix: "U",
    desc: "Positive edge triggered D flip-flop with Q and Q̄",
    kind: "digital",
    model: "virtual",
    searchTerms: "flipflop d-ff register latch",
    pins: [
      pin("D", "D", -40, -10, "input"),
      pin("CLK", "CLK", -40, 10, "input"),
      pin("Q", "Q", 40, -10, "output"),
      pin("QN", "Q̄", 40, 10, "output"),
    ],
    shapes: [
      lead(-40, -10, -24, -10),
      lead(-40, 10, -24, 10),
      lead(24, -10, 40, -10),
      lead(24, 10, 40, 10),
      { t: "rect", x: -24, y: -24, w: 48, h: 48, r: 2 },
      { t: "text", x: -16, y: -5, s: "D", size: 11 },
      { t: "text", x: -16, y: 16, s: "CLK", size: 9 },
      { t: "text", x: 8, y: -5, s: "Q", size: 11 },
      { t: "text", x: 6, y: 16, s: "Q̄", size: 11 },
      { t: "path", d: "M -22 2 L -16 8 L -22 14", w: 1.2 },
    ],
    props: [
      P.num("tsetup", "Setup Time", "5u", "tsu", "s"),
      P.num("thold", "Hold Time", "2u", "th", "s"),
      P.num("tclkq", "Clk→Q Delay", "10u", "tco", "s"),
    ],
  },
  {
    id: "counter",
    name: "4-Bit Counter",
    category: "Digital",
    prefix: "U",
    desc: "4-bit asynchronous binary counter, positive edge clocked",
    kind: "digital",
    model: "virtual",
    searchTerms: "counter zähler 7493 binary",
    pins: [
      pin("CLK", "CLK", -40, -10, "input"),
      pin("RST", "RST", -40, 10, "input"),
      pin("Q0", "Q0", 40, -20, "output"),
      pin("Q1", "Q1", 40, -7, "output"),
      pin("Q2", "Q2", 40, 6, "output"),
      pin("Q3", "Q3", 40, 19, "output"),
    ],
    shapes: [
      lead(-40, -10, -28, -10),
      lead(-40, 10, -28, 10),
      lead(28, -20, 40, -20),
      lead(28, -7, 40, -7),
      lead(28, 6, 40, 6),
      lead(28, 19, 40, 19),
      { t: "rect", x: -28, y: -30, w: 56, h: 60, r: 2 },
      { t: "text", x: -20, y: -4, s: "CLK", size: 9 },
      { t: "text", x: -20, y: 16, s: "RST", size: 9 },
      { t: "text", x: 12, y: -17, s: "Q0", size: 9 },
      { t: "text", x: 12, y: -4, s: "Q1", size: 9 },
      { t: "text", x: 12, y: 9, s: "Q2", size: 9 },
      { t: "text", x: 12, y: 22, s: "Q3", size: 9 },
    ],
    props: [P.num("bits", "Bit Width", "4", undefined, "")],
  },

  /* --------------------------- Connectors -------------------------- */
  {
    id: "testpoint",
    name: "Test Point",
    category: "Connectors",
    prefix: "TP",
    desc: "Single terminal test point",
    kind: "analog",
    model: "virtual",
    searchTerms: "testpoint messpunkt connector",
    pins: [pin("1", "1", 0, 20)],
    shapes: [lead(0, 20, 0, 0), { t: "circle", cx: 0, cy: -4, r: 5, w: 1.5 }],
    props: [P.text("name", "Label", "TP1", "General")],
  },
  {
    id: "port",
    name: "Hierarchical Port",
    category: "Connectors",
    prefix: "P",
    desc: "Off-sheet / hierarchical connection port",
    kind: "virtual",
    model: "virtual",
    searchTerms: "port hierarchisch off-sheet bus",
    pins: [pin("1", "1", -20, 0)],
    shapes: [
      lead(-20, 0, -6, 0),
      { t: "path", d: "M -6 -12 L 14 -12 Q 22 0 14 12 L -6 12 Z", w: 1.5 },
    ],
    props: [P.text("netName", "Port Net", "PORT1", "General")],
  },

  /* --------------------------- Instruments ------------------------- */
  ...instrumentDef("osc", "Oscilloscope", "XSC", "4-channel bench oscilloscope", ["CH1", "CH2", "CH3", "CH4"], "oscilloscope"),
  ...instrumentDef("fgen", "Function Generator", "XFG", "Arbitrary waveform generator output", ["OUT", "COM"], "fgen"),
  ...instrumentDef("dmm", "Digital Multimeter", "XDM", "True-RMS bench multimeter", ["V+", "V−", "A"], "dmm"),
  ...instrumentDef("bode", "Bode Plotter", "XBP", "Frequency response analyser", ["IN", "OUT"], "bode"),
  ...instrumentDef("logic_analyzer", "Logic Analyzer", "XLA", "Multi-channel logic analyser", ["D0", "D1", "D2", "D3"], "logic"),
  ...instrumentDef("wattmeter", "Wattmeter", "XWM", "Four quadrant power meter", ["V+", "V−", "A"], "wattmeter"),
];

function gate(
  id: string,
  name: string,
  prefix: string,
  desc: string,
  ins: string[],
  outs: string[],
  bodyPath: string,
  extraPath: string,
  _v: number,
): CompDef[] {
  const pins: PinDef[] = [];
  const shapes: Shape[] = [];
  const n = ins.length;
  ins.forEach((nm, i) => {
    const y = n === 1 ? 0 : (i - (n - 1) / 2) * 20;
    pins.push(pin(nm, nm, -30, y, "input"));
    shapes.push(lead(-30, y, id === "xor" ? -12 : -18, y));
  });
  outs.forEach((nm) => {
    pins.push(pin(nm, nm, 30, 0, "output"));
    shapes.push(lead(id === "not" || id === "buffer" ? 16 : id === "nand" || id === "nor" ? 20 : 20, 0, 30, 0));
  });
  shapes.push({ t: "path", d: bodyPath, w: 1.6, fill: "none" });
  if (id === "xor") shapes.push({ t: "path", d: "M -22 -16 Q -12 0 -22 16", w: 1.5 });
  if (id === "nand" || id === "nor") shapes.push({ t: "circle", cx: 24, cy: 0, r: 4, w: 1.5 });
  if (extraPath) shapes.push({ t: "path", d: extraPath, w: 1.5 });
  if (id === "not" || id === "buffer") shapes.push({ t: "text", x: -8, y: 6, s: "1", size: 11, anchor: "middle" });
  return [
    {
      id,
      name,
      category: "Digital",
      prefix,
      desc,
      kind: "digital",
      model: "virtual",
      searchTerms: `${name.toLowerCase()} gate logik`,
      pins,
      shapes,
      props: [
        P.num("vHigh", "Output High", "5", "voh", "V"),
        P.num("vLow", "Output Low", "0", "vol", "V"),
        P.num("threshold", "Input Threshold", "2.5", "vth", "V"),
        P.num("tDelay", "Propagation Delay", "10u", "td", "s"),
      ],
    },
  ];
}

function instrumentDef(
  id: string,
  name: string,
  prefix: string,
  desc: string,
  channels: string[],
  kind: string,
): CompDef[] {
  const pins: PinDef[] = channels.map((c, i) =>
    pin(c, c, -40, (i - (channels.length - 1) / 2) * 20, "passive"),
  );
  const shapes: Shape[] = [
    { t: "rect", x: -30, y: -30, w: 70, h: 60, r: 4 },
    { t: "rect", x: -24, y: -24, w: 58, h: 30, r: 2, fill: "none" },
    { t: "path", d: "M -22 -12 Q -12 -22 -2 -12 T 18 -12", w: 1.3 },
  ];
  channels.forEach((c, i) => {
    shapes.push(lead(-40, (i - (channels.length - 1) / 2) * 20, -30, (i - (channels.length - 1) / 2) * 20));
    shapes.push({ t: "circle", cx: -20 + i * 14, cy: 18, r: 4, w: 1.2 });
  });
  const defs: CompDef[] = [
    {
      id,
      name,
      category: "Instruments",
      prefix,
      desc,
      kind: "instrument",
      model: "virtual",
      searchTerms: `${name.toLowerCase()} instrument messgerät`,
      pins,
      shapes,
      props: [
        P.text("channelMap", "Channel Mapping", channels.map((c) => c).join(","), "Advanced"),
        P.text("window", "Window", "floating", "Advanced"),
      ],
      valueProp: undefined,
    },
  ];
  return defs.map((d) => ({ ...d, fixedValue: kind }));
}

export const CATEGORIES = [
  "Basic",
  "Sources",
  "Diodes",
  "Transistors",
  "Analog",
  "Digital",
  "Power",
  "Connectors",
  "Instruments",
  "Virtual Components",
];

export function getDef(id: string): CompDef | undefined {
  return COMPONENTS.find((c) => c.id === id);
}

export function defaultProps(def: CompDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of def.props) out[p.key] = p.def;
  return out;
}

export function componentValue(def: CompDef, props: Record<string, string>): string {
  if (def.fixedValue) return def.fixedValue;
  if (!def.valueProp) return "";
  return props[def.valueProp] ?? "";
}
