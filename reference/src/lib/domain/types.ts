/** CircuitBench domain model — shared types for every layer. */

export const GRID = 10; // world units per 10 mil grid step
export const SNAP_DEFAULT = GRID;

export interface Vec {
  x: number;
  y: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export type PinType = "passive" | "input" | "output" | "power" | "ground" | "nc";

export interface PinDef {
  id: string;
  name: string;
  /** local coordinates, world units */
  x: number;
  y: number;
  type: PinType;
  hidden?: boolean;
}

export type Shape =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; w?: number; dash?: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; r?: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; w?: number }
  | { t: "path"; d: string; fill?: string; w?: number }
  | { t: "poly"; pts: string; fill?: string; w?: number }
  | { t: "text"; x: number; y: number; s: string; size?: number; anchor?: "start" | "middle" | "end" };

export type PropType = "number" | "text" | "enum" | "bool" | "list";

export interface PropDef {
  key: string;
  label: string;
  group: "General" | "Simulation" | "Appearance" | "Physical" | "Advanced";
  type: PropType;
  def: string;
  unit?: string;
  options?: string[];
  /** SPICE parameter name written into the netlist model card */
  spiceKey?: string;
  hint?: string;
}

export type CompKind =
  | "analog"
  | "digital"
  | "power"
  | "source"
  | "instrument"
  | "virtual";

export interface CompDef {
  id: string;
  name: string;
  category: string;
  prefix: string;
  desc: string;
  kind: CompKind;
  model: "simulated" | "physical" | "virtual";
  pins: PinDef[];
  shapes: Shape[];
  props: PropDef[];
  /** property shown as the primary value on the sheet */
  valueProp?: string;
  /** fixed value text (power symbols, gates) */
  fixedValue?: string;
  searchTerms?: string;
}

export interface Component {
  id: string;
  defId: string;
  ref: string;
  x: number;
  y: number;
  rot: Rotation;
  mirror: boolean;
  props: Record<string, string>;
  showRef: boolean;
  showValue: boolean;
  showPins: boolean;
  color?: string;
  locked?: boolean;
}

export interface Wire {
  id: string;
  points: Vec[];
  bus?: boolean;
  netName?: string;
  netClass?: string;
  signalType?: "analog" | "digital" | "power" | "mixed" | "unknown";
  color?: string;
  showLabel?: boolean;
}

export interface Label {
  id: string;
  kind: "net" | "global" | "text";
  text: string;
  x: number;
  y: number;
  rot: Rotation;
  color?: string;
}

export type ProbeType = "voltage" | "current" | "differential" | "power";

export interface Probe {
  id: string;
  type: ProbeType;
  name: string;
  color: string;
  x: number;
  y: number;
  /** attachment: net id for voltage probes */
  netId?: string;
  refNetId?: string;
  /** component id for current / power probes */
  componentId?: string;
  pinId?: string;
  plotVisible: boolean;
  description?: string;
}

export type InstrumentKind =
  | "oscilloscope"
  | "fgen"
  | "dmm"
  | "bode"
  | "logic"
  | "freqcounter"
  | "wordgen"
  | "spectrum"
  | "wattmeter"
  | "iv";

export interface InstrumentWindow {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  docked: boolean;
  z: number;
}

export interface Instrument {
  id: string;
  kind: InstrumentKind;
  ref: string;
  /** schematic anchor */
  x: number;
  y: number;
  netId?: string;
  netId2?: string;
  componentId?: string;
  name: string;
  cfg: Record<string, string | number | boolean>;
  window: InstrumentWindow;
}

export type AnalysisKind =
  | "op"
  | "tran"
  | "ac"
  | "dc"
  | "param"
  | "temp"
  | "fourier";

export interface AnalysisConfig {
  id: string;
  kind: AnalysisKind;
  name: string;
  enabled: boolean;
  params: Record<string, string>;
}

export interface DesignVariable {
  name: string;
  value: string;
  description?: string;
}

export interface Sheet {
  id: string;
  name: string;
  width: number;
  height: number;
  components: Component[];
  wires: Wire[];
  labels: Label[];
  probes: Probe[];
  instruments: Instrument[];
}

export interface UiState {
  theme: "light" | "dark";
  grid: boolean;
  snap: boolean;
  rulers: boolean;
  pageBounds: boolean;
  markers: boolean;
  gridSize: 10 | 25 | 50;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  showLeft: boolean;
  showRight: boolean;
  showBottom: boolean;
  leftTab: string;
  bottomTab: string;
  visibility: Record<string, boolean>;
}

export interface SavedRun {
  id: string;
  label: string;
  analysis: AnalysisKind;
  sweepParam?: string;
  sweepValue?: string;
  createdAt: number;
  status: "completed" | "error";
  seriesCount: number;
  notes?: string;
}

export interface ProjectDoc {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  sheets: Sheet[];
  activeSheetId: string;
  designVariables: DesignVariable[];
  analyses: AnalysisConfig[];
  simSettings: {
    engine: "internal-mna" | "ngspice";
    temperature: number;
    gmin: number;
    reltol: number;
    abstol: number;
    vntol: number;
    maxNewton: number;
    integration: "be" | "trap";
  };
  runs: SavedRun[];
  ui: UiState;
}

export interface NetNode {
  id: string;
  name: string;
  kind: "signal" | "power" | "ground" | "bus" | "unnamed";
  isGround: boolean;
  pins: { componentId: string; ref: string; pinId: string; pinName: string; x: number; y: number }[];
  wireIds: string[];
  probeIds: string[];
  /** derived signal type */
  signalType: "analog" | "digital" | "power" | "mixed" | "unknown";
}

export interface NetGraph {
  nets: NetNode[];
  /** key `${componentId}:${pinId}` -> net id */
  pinToNet: Record<string, string>;
  netById: Record<string, NetNode>;
  junctions: Vec[];
  floatingNodes: string[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
  stats: { components: number; wires: number; nets: number; pins: number };
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  hint?: string;
  ref?: string;
  x?: number;
  y?: number;
}

/* ------------------------------- units -------------------------------- */

const ENG_MULT: Record<string, number> = {
  t: 1e12,
  g: 1e9,
  meg: 1e6,
  k: 1e3,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};

/** Parse an engineering value such as "4k7", "10uF", "2.2M", "1e3". */
export function parseEng(input: string | number | undefined, fallback = 0): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : fallback;
  if (!input) return fallback;
  let s = String(input).trim().toLowerCase().replace(/[\s_]/g, "");
  s = s.replace(/(ohm|ω|farad|henry|h|f|v|a|w|hz|s)$/i, "");
  // euro-style 4k7
  const euro = s.match(/^([+-]?\d*\.?\d+)([tgmkunpf])(\d+)$/);
  if (euro) {
    const m = ENG_MULT[euro[2]] ?? 1;
    return parseFloat(`${euro[1]}.${euro[3]}`) * m;
  }
  const m2 = s.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)(meg|[tgkmunpf])?/);
  if (!m2) return fallback;
  const base = parseFloat(m2[1]);
  if (!Number.isFinite(base)) return fallback;
  const mult = m2[2] ? (ENG_MULT[m2[2]] ?? 1) : 1;
  return base * mult;
}

/** Format a number as a compact engineering value. */
export function formatEng(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "Meg"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
    [1e-15, "f"],
  ];
  for (const [scale, suffix] of units) {
    if (a >= scale) {
      const scaled = a / scale;
      const text =
        scaled >= 100
          ? scaled.toFixed(0)
          : scaled >= 10
            ? scaled.toFixed(1)
            : scaled.toFixed(Math.max(1, digits - 2));
      return `${sign}${text.replace(/\.0+$/, "")}${suffix}`;
    }
  }
  return sign + a.toExponential(2);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Transform a local symbol coordinate into world space. */
export function pinWorld(
  comp: { x: number; y: number; rot: Rotation; mirror: boolean },
  pin: { x: number; y: number },
): Vec {
  let x = comp.mirror ? -pin.x : pin.x;
  let y = pin.y;
  switch (comp.rot) {
    case 90:
      [x, y] = [-y, x];
      break;
    case 180:
      [x, y] = [-x, -y];
      break;
    case 270:
      [x, y] = [y, -x];
      break;
  }
  return { x: comp.x + x, y: comp.y + y };
}

export function compTransform(c: { x: number; y: number; rot: Rotation; mirror: boolean }): string {
  return `translate(${c.x} ${c.y}) rotate(${c.rot}) scale(${c.mirror ? -1 : 1} 1)`;
}
