// CircuitBench domain model — project file format (schemaVersion 2)
export type Pt = [number, number];

export interface Component {
  id: string;
  type: string; // library key
  ref: string;
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3; // *90deg
  mirror: boolean; // horizontal mirror (applied before rotation)
  sheet: string;
  props: Record<string, string>;
  showRef?: boolean;
  showValue?: boolean;
  color?: string;
  description?: string;
  comment?: string;
  enabled?: boolean;
}

export interface Wire {
  id: string;
  a: Pt;
  b: Pt;
  sheet: string;
  bus?: boolean;
  color?: string;
  netClass?: string;
}

export interface Label {
  id: string;
  x: number;
  y: number;
  name: string;
  kind: "local" | "global" | "port";
  sheet: string;
}

export interface TextItem {
  id: string;
  x: number;
  y: number;
  text: string;
  sheet: string;
  shape?: "text" | "rect";
  w?: number;
  h?: number;
}

export type ProbeKind = "voltage" | "current" | "diff" | "power";
export interface Probe {
  id: string;
  kind: ProbeKind;
  name: string;
  color: string;
  sheet: string;
  x: number;
  y: number; // attach point (voltage / diff +)
  x2?: number;
  y2?: number; // diff reference point
  compId?: string; // current/power probe target
  visible: boolean;
  description?: string;
}

export interface Sheet {
  id: string;
  name: string;
}

export interface TranSettings {
  tstart: number;
  tstop: number;
  tmax: number;
  tstep: number;
  uic: boolean;
}
export interface AcSettings {
  fstart: number;
  fstop: number;
  scale: "dec" | "oct" | "lin";
  points: number;
  source: string;
}
export interface DcSettings {
  source: string;
  start: number;
  stop: number;
  step: number;
  source2?: string;
  start2?: number;
  stop2?: number;
  step2?: number;
}
export interface SweepDim {
  target: string; // "R1.value" or "var:NAME"
  mode: "lin" | "log" | "list";
  start: number;
  stop: number;
  points: number;
  list: string;
}
export interface ParamSweepSettings {
  dims: SweepDim[];
  analysis: "tran" | "ac" | "dc" | "op";
}

export interface SimSettings {
  analysis: "op" | "tran" | "ac" | "dc";
  tran: TranSettings;
  ac: AcSettings;
  dc: DcSettings;
  param: ParamSweepSettings;
  temp: number;
  tempList: string;
  gmin: number;
  reltol: number;
}

export interface SavedRun {
  id: string;
  label: string;
  analysis: string;
  param?: Record<string, number>;
  timestamp: number;
  status: string;
  xLabel: string;
  x: number[];
  signals: Record<string, number[]>;
}

export interface Layout {
  left: boolean;
  right: boolean;
  bottom: boolean;
  leftW: number;
  rightW: number;
  bottomH: number;
  dark: boolean;
  grid: boolean;
  snap: number;
  rulers: boolean;
  pageBorder: boolean;
  markers: boolean;
  showRefs: boolean;
  showValues: boolean;
  showPinNames: boolean;
  showLabels: boolean;
  showProbes: boolean;
  showInstruments: boolean;
  windows: Record<string, { x: number; y: number; w: number; h: number; open: boolean }>;
}

export interface Project {
  schemaVersion: number;
  meta: { name: string; author: string; created: number; modified: number; description: string };
  sheets: Sheet[];
  components: Component[];
  wires: Wire[];
  labels: Label[];
  texts: TextItem[];
  probes: Probe[];
  variables: Record<string, string>;
  sim: SimSettings;
  presets: { name: string; sim: SimSettings }[];
  runs: SavedRun[];
  layout: Layout;
  instrumentState: Record<string, Record<string, unknown>>;
}

export const SCHEMA_VERSION = 2;

export function uid(p = "o") {
  return p + Math.random().toString(36).slice(2, 9);
}

export function defaultSim(): SimSettings {
  return {
    analysis: "tran",
    tran: { tstart: 0, tstop: 0.005, tmax: 0, tstep: 0, uic: false },
    ac: { fstart: 1, fstop: 1e6, scale: "dec", points: 20, source: "" },
    dc: { source: "", start: 0, stop: 5, step: 0.05 },
    param: { dims: [{ target: "", mode: "lin", start: 1000, stop: 10000, points: 5, list: "" }], analysis: "tran" },
    temp: 27,
    tempList: "-40, 27, 85",
    gmin: 1e-12,
    reltol: 1e-3,
  };
}

export function defaultLayout(): Layout {
  return {
    left: true, right: true, bottom: true, leftW: 270, rightW: 320, bottomH: 240,
    dark: false, grid: true, snap: 10, rulers: true, pageBorder: true, markers: true,
    showRefs: true, showValues: true, showPinNames: false, showLabels: true, showProbes: true, showInstruments: true,
    windows: {},
  };
}

export function emptyProject(name = "Untitled"): Project {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name, author: "", created: now, modified: now, description: "" },
    sheets: [{ id: "s1", name: "Sheet 1" }],
    components: [], wires: [], labels: [], texts: [], probes: [],
    variables: {}, sim: defaultSim(), presets: [], runs: [], layout: defaultLayout(), instrumentState: {},
  };
}

// ---- migrations ----
type Mig = (p: Record<string, unknown>) => Record<string, unknown>;
const migrations: Record<number, Mig> = {
  // v1 -> v2: added texts, instrumentState, presets
  1: (p) => ({ ...p, texts: p.texts ?? [], instrumentState: p.instrumentState ?? {}, presets: p.presets ?? [], schemaVersion: 2 }),
};

export function migrateProject(raw: unknown): Project {
  let p = (raw ?? {}) as Record<string, unknown>;
  let v = Number(p.schemaVersion ?? 1);
  while (v < SCHEMA_VERSION) {
    const m = migrations[v];
    if (!m) break;
    p = m(p);
    v = Number(p.schemaVersion);
  }
  const base = emptyProject();
  const out = { ...base, ...p } as Project;
  out.sim = { ...base.sim, ...(out.sim ?? {}) };
  out.layout = { ...base.layout, ...(out.layout ?? {}) };
  out.meta = { ...base.meta, ...(out.meta ?? {}) };
  return out;
}
