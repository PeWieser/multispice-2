"use client";

import { create } from "zustand";
import {
  type AnalysisConfig,
  type Component,
  type Diagnostic,
  type Instrument,
  type InstrumentKind,
  type Label,
  type Probe,
  type ProbeType,
  type ProjectDoc,
  type Rotation,
  type Sheet,
  type UiState,
  type Vec,
  type Wire,
  parseEng,
  uid,
} from "@/lib/domain/types";
import { defaultProps, getDef } from "@/lib/domain/library";
import { resolveNetlist, routeOrthogonal } from "@/lib/domain/connectivity";
import type { NetGraph } from "@/lib/domain/types";
import {
  buildCircuit,
  runAcSweep,
  runAnalysisOnCircuit,
  runDcSweep,
  runOperatingPoint,
  runParameterSweep,
  runTransient,
  type SimResult,
  type SweepSpec,
} from "@/lib/sim/engine";
import { runDigital, type DigitalResult } from "@/lib/sim/digital";
import { exampleProject, type ExampleKey } from "@/lib/domain/examples";
import { clearAutosave, readAutosave, storage, writeAutosave } from "@/lib/persistence/storage";

export type SimState =
  | "Ready"
  | "Preparing"
  | "Running"
  | "Paused"
  | "Completed"
  | "Stopped"
  | "Error";

export type Tool =
  | "select"
  | "wire"
  | "bus"
  | "place"
  | "label"
  | "power"
  | "probe"
  | "instrument"
  | "text"
  | "pan";

export interface RunRecord {
  id: string;
  label: string;
  analysis: string;
  sweepParam?: string;
  sweepValue?: string;
  createdAt: number;
  status: "completed" | "error";
  seriesCount: number;
  result: SimResult;
}

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error" | "ok";
  text: string;
}

const defaultUi: UiState = {
  theme: "light",
  grid: true,
  snap: true,
  rulers: false,
  pageBounds: true,
  markers: true,
  gridSize: 10,
  leftWidth: 270,
  rightWidth: 320,
  bottomHeight: 240,
  showLeft: true,
  showRight: true,
  showBottom: true,
  leftTab: "Hierarchy",
  bottomTab: "Problems",
  visibility: {
    References: true,
    Values: true,
    "Pin Names": false,
    "Net Labels": true,
    Probes: true,
    Instruments: true,
    Grid: true,
    Rulers: false,
    "Simulation Markers": true,
  },
};

function emptySheet(): Sheet {
  return {
    id: uid("sheet"),
    name: "Sheet 1",
    width: 1600,
    height: 1100,
    components: [],
    wires: [],
    labels: [],
    probes: [],
    instruments: [],
  };
}

export function defaultAnalyses(): AnalysisConfig[] {
  return [
    {
      id: uid("an"),
      kind: "op",
      name: "Operating Point",
      enabled: false,
      params: {},
    },
    {
      id: uid("an"),
      kind: "tran",
      name: "Transient Analysis",
      enabled: true,
      params: {
        tstart: "0",
        tstop: "5m",
        tstep: "10u",
        tmax: "50u",
        useOp: "true",
        uic: "false",
      },
    },
    {
      id: uid("an"),
      kind: "ac",
      name: "AC Analysis",
      enabled: false,
      params: {
        fstart: "1",
        fstop: "1Meg",
        sweepType: "dec",
        points: "10",
        source: "",
      },
    },
    {
      id: uid("an"),
      kind: "dc",
      name: "DC Sweep",
      enabled: false,
      params: { source: "", start: "0", stop: "5", step: "0.1" },
    },
    {
      id: uid("an"),
      kind: "param",
      name: "Parameter Sweep",
      enabled: false,
      params: { target: "", mode: "log", start: "1k", stop: "100k", points: "10", values: "" },
    },
  ];
}

export function createProject(name = "Untitled Project"): ProjectDoc {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: uid("proj"),
    name,
    description: "",
    createdAt: now,
    updatedAt: now,
    sheets: [emptySheet()],
    activeSheetId: "",
    designVariables: [
      { name: "VCC_VAL", value: "5", description: "Logic supply rail" },
      { name: "RLOAD", value: "1k", description: "Default load resistor" },
    ],
    analyses: defaultAnalyses(),
    simSettings: {
      engine: "internal-mna",
      temperature: 27,
      gmin: 1e-12,
      reltol: 1e-3,
      abstol: 1e-12,
      vntol: 1e-6,
      maxNewton: 80,
      integration: "be",
    },
    runs: [],
    ui: { ...defaultUi },
  };
}

function withActiveSheet(p: ProjectDoc): Sheet {
  const id = p.activeSheetId || p.sheets[0]?.id;
  return p.sheets.find((s) => s.id === id) ?? p.sheets[0];
}

/** Versioned project format migration. */
export function migrateProject(raw: unknown): ProjectDoc {
  const doc = raw as ProjectDoc;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.sheets)) return createProject();
  const version = doc.schemaVersion ?? 1;
  const out: ProjectDoc = {
    ...createProject(),
    ...doc,
    schemaVersion: 1,
    ui: { ...defaultUi, ...(doc.ui ?? {}), visibility: { ...defaultUi.visibility, ...(doc.ui?.visibility ?? {}) } },
    simSettings: { ...createProject().simSettings, ...(doc.simSettings ?? {}) },
  };
  if (version < 1) out.schemaVersion = 1;
  if (!out.activeSheetId) out.activeSheetId = out.sheets[0].id;
  return out;
}

export interface AppState {
  project: ProjectDoc;
  graph: NetGraph;
  selection: string[];
  tool: Tool;
  placeDefId: string | null;
  placeLabelKind: Label["kind"] | null;
  probeType: ProbeType;
  instrumentKind: InstrumentKind;
  results: RunRecord[];
  activeRunId: string | null;
  simState: SimState;
  digital: DigitalResult | null;
  log: LogEntry[];
  history: ProjectDoc[];
  historyIndex: number;
  modal: string | null;
  modalPayload: unknown;
  dirty: boolean;
  projectId: string | null;
  saving: boolean;
  toast: string | null;
  showComponentBrowser: boolean;
  clip: { components: Component[]; wires: Wire[]; labels: Label[] } | null;
  wireDraft: Vec[] | null;
  netHighlight: string | null;

  recompute: () => void;
  setProject: (p: ProjectDoc, keepHistory?: boolean) => void;
  commit: (fn: (s: ProjectDoc) => void, label?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[]) => void;
  setTool: (t: Tool) => void;
  openModal: (name: string | null, payload?: unknown) => void;
  toastMsg: (m: string | null) => void;
  addLog: (level: LogEntry["level"], text: string) => void;

  placeComponent: (defId: string, x: number, y: number) => void;
  addWire: (points: Vec[]) => void;
  addLabel: (kind: Label["kind"], text: string, x: number, y: number) => void;
  addProbeAt: (x: number, y: number) => void;
  addInstrumentAt: (kind: InstrumentKind, x: number, y: number) => void;
  moveSelection: (dx: number, dy: number) => void;
  rotateSelection: () => void;
  mirrorSelection: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  setComponentProp: (id: string, key: string, value: string, label?: string) => void;
  updateObject: (id: string, patch: Record<string, unknown>, label?: string) => void;
  toggleLogicInput: (id: string) => void;
  annotate: () => void;

  run: (analysisKind?: AnalysisConfig["kind"]) => void;
  runSweep: (spec: SweepSpec) => void;
  stopSim: () => void;
  clearResults: () => void;
  setActiveRun: (id: string | null) => void;

  setUi: (patch: Partial<UiState>) => void;
  loadProject: (id: string) => Promise<void>;
  saveProject: (snapshot?: boolean) => Promise<void>;
  saveProjectAs: (name: string) => Promise<void>;
  importProjectJson: (text: string) => void;
  loadExample: (key: ExampleKey) => void;
}

function clone<T>(v: T): T {
  return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

const emptyGraph: NetGraph = {
  nets: [],
  pinToNet: {},
  netById: {},
  junctions: [],
  floatingNodes: [],
  errors: [],
  warnings: [],
  stats: { components: 0, wires: 0, nets: 0, pins: 0 },
};

export const useApp = create<AppState>((set, get) => {
  const rebuild = (project: ProjectDoc): NetGraph => {
    try {
      return resolveNetlist(withActiveSheet(project));
    } catch {
      return emptyGraph;
    }
  };

  const initial = createProject("RC Low-Pass Demo");
  Object.assign(initial, exampleProject("rc", "RC Low-Pass Demo"));
  initial.activeSheetId = initial.sheets[0].id;

  return {
    project: initial,
    graph: rebuild(initial),
    selection: [],
    tool: "select",
    placeDefId: null,
    placeLabelKind: null,
    probeType: "voltage",
    instrumentKind: "oscilloscope",
    results: [],
    activeRunId: null,
    simState: "Ready",
    digital: null,
    log: [],
    history: [clone(initial)],
    historyIndex: 0,
    modal: null,
    modalPayload: null,
    dirty: false,
    projectId: null,
    saving: false,
    toast: null,
    showComponentBrowser: false,
    clip: null,
    wireDraft: null,
    netHighlight: null,

    recompute: () => set({ graph: rebuild(get().project) }),

    setProject: (p, keepHistory = false) => {
      const project = { ...p, updatedAt: Date.now() };
      set({
        project,
        graph: rebuild(project),
        dirty: true,
        selection: [],
        ...(keepHistory ? {} : { history: [clone(project)], historyIndex: 0 }),
      });
    },

    commit: (fn, label) => {
      const state = get();
      const next = clone(state.project);
      fn(next);
      next.updatedAt = Date.now();
      const history = state.history.slice(0, state.historyIndex + 1);
      history.push(clone(next));
      const trimmed = history.length > 120 ? history.slice(history.length - 120) : history;
      set({
        project: next,
        graph: rebuild(next),
        history: trimmed,
        historyIndex: trimmed.length - 1,
        dirty: true,
      });
      if (label) get().addLog("info", label);
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const idx = historyIndex - 1;
      const project = clone(history[idx]);
      set({
        project,
        graph: rebuild(project),
        historyIndex: idx,
        dirty: true,
        selection: [],
      });
      get().addLog("info", "Undo");
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const idx = historyIndex + 1;
      const project = clone(history[idx]);
      set({
        project,
        graph: rebuild(project),
        historyIndex: idx,
        dirty: true,
        selection: [],
      });
      get().addLog("info", "Redo");
    },

    select: (ids) => set({ selection: ids }),
    setTool: (t) => set({ tool: t, placeDefId: null, placeLabelKind: null, wireDraft: null }),
    openModal: (name, payload = null) => set({ modal: name, modalPayload: payload }),
    toastMsg: (m) => set({ toast: m }),

    addLog: (level, text) =>
      set((s) => ({
        log: [
          ...s.log.slice(-400),
          {
            id: uid("log"),
            time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
            level,
            text,
          },
        ],
      })),

    placeComponent: (defId, x, y) => {
      const def = getDef(defId);
      if (!def) return;
      const state = get();
      const sheet = withActiveSheet(state.project);
      const prefix = def.prefix;
      const existing = sheet.components.filter((c) => c.ref.startsWith(prefix)).length + 1;
      const comp: Component = {
        id: uid("c"),
        defId,
        ref: def.fixedValue && def.kind === "power" ? def.fixedValue : `${prefix}${existing}`,
        x,
        y,
        rot: 0,
        mirror: false,
        props: defaultProps(def),
        showRef: true,
        showValue: true,
        showPins: false,
      };
      get().commit((p) => {
        withActiveSheet(p).components.push(comp);
      }, `Placed ${def.name} ${comp.ref}`);
      set({ selection: [comp.id] });
    },

    addWire: (points) => {
      if (points.length < 2) return;
      const wire: Wire = { id: uid("w"), points, bus: get().tool === "bus" };
      get().commit((p) => {
        withActiveSheet(p).wires.push(wire);
      }, "Added wire");
    },

    addLabel: (kind, text, x, y) => {
      const label: Label = { id: uid("lb"), kind, text, x, y, rot: 0 };
      get().commit((p) => {
        withActiveSheet(p).labels.push(label);
      }, `Added ${kind} label "${text}"`);
    },

    addProbeAt: (x, y) => {
      const type = get().probeType;
      const colors = ["#1f5fd0", "#c77a16", "#2e7a4f", "#b3372c", "#7a4fa3", "#2c7a7b"];
      const count = withActiveSheet(get().project).probes.length;
      const probe: Probe = {
        id: uid("pr"),
        type,
        name: `${type === "voltage" ? "V" : type === "current" ? "I" : type === "power" ? "P" : "ΔV"}${count + 1}`,
        color: colors[count % colors.length],
        x,
        y,
        plotVisible: true,
      };
      if (type === "current" || type === "power") {
        const sheet = withActiveSheet(get().project);
        let best: Component | undefined;
        let bestD = 1e9;
        for (const c of sheet.components) {
          const d = Math.hypot(c.x - x, c.y - y);
          if (d < bestD && d < 60) {
            bestD = d;
            best = c;
          }
        }
        if (best) {
          probe.componentId = best.id;
          probe.x = best.x;
          probe.y = best.y;
        }
      }
      get().commit((p) => {
        withActiveSheet(p).probes.push(probe);
      }, `Placed ${type} probe ${probe.name}`);
      set({ selection: [probe.id] });
    },

    addInstrumentAt: (kind, x, y) => {
      const defId =
        kind === "oscilloscope"
          ? "osc"
          : kind === "fgen"
            ? "fgen"
            : kind === "dmm"
              ? "dmm"
              : kind === "bode"
                ? "bode"
                : kind === "logic"
                  ? "logic_analyzer"
                  : "wattmeter";
      const def = getDef(defId)!;
      const sheet = withActiveSheet(get().project);
      const count = sheet.instruments.length + 1;
      const comp: Component = {
        id: uid("c"),
        defId,
        ref: `${def.prefix}${count}`,
        x,
        y,
        rot: 0,
        mirror: false,
        props: defaultProps(def),
        showRef: true,
        showValue: true,
        showPins: true,
      };
      const inst: Instrument = {
        id: uid("ins"),
        kind,
        ref: comp.ref,
        x,
        y,
        componentId: comp.id,
        name: `${def.name} ${count}`,
        cfg: {},
        window: {
          x: 120 + (count - 1) * 36,
          y: 120 + (count - 1) * 28,
          w: kind === "logic" ? 560 : 480,
          h: kind === "logic" ? 320 : 330,
          open: true,
          docked: false,
          z: count,
        },
      };
      get().commit((p) => {
        const s = withActiveSheet(p);
        s.components.push(comp);
        s.instruments.push(inst);
      }, `Placed ${def.name} ${comp.ref}`);
      set({ selection: [comp.id] });
    },

    moveSelection: (dx, dy) => {
      const sel = new Set(get().selection);
      get().commit((p) => {
        const s = withActiveSheet(p);
        for (const c of s.components) if (sel.has(c.id)) (c.x += dx), (c.y += dy);
        for (const w of s.wires)
          if (sel.has(w.id)) w.points = w.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
        for (const l of s.labels) if (sel.has(l.id)) (l.x += dx), (l.y += dy);
        for (const pr of s.probes) if (sel.has(pr.id)) (pr.x += dx), (pr.y += dy);
        for (const i of s.instruments) if (sel.has(i.id)) (i.x += dx), (i.y += dy);
      });
    },

    rotateSelection: () => {
      const sel = new Set(get().selection);
      get().commit((p) => {
        for (const c of withActiveSheet(p).components) {
          if (!sel.has(c.id)) continue;
          c.rot = (((c.rot + 90) % 360) as Rotation);
        }
        for (const l of withActiveSheet(p).labels) {
          if (!sel.has(l.id)) continue;
          l.rot = (((l.rot + 90) % 360) as Rotation);
        }
      }, "Rotated selection");
    },

    mirrorSelection: () => {
      const sel = new Set(get().selection);
      get().commit((p) => {
        for (const c of withActiveSheet(p).components) {
          if (!sel.has(c.id)) continue;
          c.mirror = !c.mirror;
        }
      }, "Mirrored selection");
    },

    deleteSelection: () => {
      const sel = new Set(get().selection);
      if (!sel.size) return;
      get().commit((p) => {
        const s = withActiveSheet(p);
        s.components = s.components.filter((c) => !sel.has(c.id));
        s.wires = s.wires.filter((w) => !sel.has(w.id));
        s.labels = s.labels.filter((l) => !sel.has(l.id));
        s.probes = s.probes.filter((pr) => !sel.has(pr.id));
        s.instruments = s.instruments.filter((i) => !sel.has(i.id));
      }, `Deleted ${sel.size} object(s)`);
      set({ selection: [] });
    },

    duplicateSelection: () => {
      const sel = new Set(get().selection);
      const sheet = withActiveSheet(get().project);
      const copies: Component[] = [];
      for (const c of sheet.components) {
        if (!sel.has(c.id)) continue;
        copies.push({ ...clone(c), id: uid("c"), x: c.x + 20, y: c.y + 20, ref: `${c.ref}_copy` });
      }
      get().commit((p) => {
        withActiveSheet(p).components.push(...copies);
      }, `Duplicated ${copies.length} component(s)`);
      set({ selection: copies.map((c) => c.id) });
    },

    copySelection: () => {
      const sel = new Set(get().selection);
      const sheet = withActiveSheet(get().project);
      set({
        clip: {
          components: sheet.components.filter((c) => sel.has(c.id)).map(clone),
          wires: sheet.wires.filter((w) => sel.has(w.id)).map(clone),
          labels: sheet.labels.filter((l) => sel.has(l.id)).map(clone),
        },
      });
      get().addLog("info", `Copied ${sel.size} object(s)`);
    },

    pasteClipboard: () => {
      const clip = get().clip;
      if (!clip) return;
      const comps = clip.components.map((c) => ({
        ...clone(c),
        id: uid("c"),
        x: c.x + 30,
        y: c.y + 30,
        ref: `${c.ref}_p`,
      }));
      const wires = clip.wires.map((w) => ({
        ...clone(w),
        id: uid("w"),
        points: w.points.map((pt) => ({ x: pt.x + 30, y: pt.y + 30 })),
      }));
      const labels = clip.labels.map((l) => ({ ...clone(l), id: uid("lb"), x: l.x + 30, y: l.y + 30 }));
      get().commit((p) => {
        const s = withActiveSheet(p);
        s.components.push(...comps);
        s.wires.push(...wires);
        s.labels.push(...labels);
      }, "Pasted selection");
      set({ selection: comps.map((c) => c.id) });
    },

    setComponentProp: (id, key, value, label) => {
      get().commit((p) => {
        const c = withActiveSheet(p).components.find((x) => x.id === id);
        if (c) c.props[key] = value;
      }, label ?? `Set ${key} = ${value}`);
    },

    updateObject: (id, patch, label) => {
      get().commit((p) => {
        const s = withActiveSheet(p);
        const c = s.components.find((x) => x.id === id);
        if (c) Object.assign(c, patch);
        const w = s.wires.find((x) => x.id === id);
        if (w) Object.assign(w, patch);
        const l = s.labels.find((x) => x.id === id);
        if (l) Object.assign(l, patch);
        const pr = s.probes.find((x) => x.id === id);
        if (pr) Object.assign(pr, patch);
        const ins = s.instruments.find((x) => x.id === id);
        if (ins) Object.assign(ins, patch);
      }, label);
    },

    toggleLogicInput: (id) => {
      get().commit((p) => {
        const c = withActiveSheet(p).components.find((x) => x.id === id);
        if (c && c.defId === "logic_in") c.props.state = c.props.state === "1" ? "0" : "1";
      }, "Toggled logic input");
    },

    annotate: () => {
      get().commit((p) => {
        const s = withActiveSheet(p);
        const counters: Record<string, number> = {};
        for (const c of s.components) {
          const def = getDef(c.defId);
          if (!def) continue;
          if (def.kind === "power" && def.fixedValue) continue;
          const prefix = def.prefix;
          counters[prefix] = (counters[prefix] ?? 0) + 1;
          c.ref = `${prefix}${counters[prefix]}`;
        }
      }, "Annotated designators");
    },

    run: (analysisKind) => {
      const state = get();
      const project = state.project;
      const sheet = withActiveSheet(project);
      const graph = state.graph;
      const kind = analysisKind ?? project.analyses.find((a) => a.enabled)?.kind ?? "tran";
      const analysis = project.analyses.find((a) => a.kind === kind) ?? project.analyses[0];

      if (graph.errors.length > 0 && kind !== "op") {
        get().addLog("warn", `${graph.errors.length} schematic error(s) must be fixed before simulation.`);
      }

      set({ simState: "Preparing" });
      get().addLog("info", `Starting ${analysis.name}…`);

      const vars: Record<string, string> = {};
      for (const v of project.designVariables) vars[v.name] = v.value;

      window.setTimeout(() => {
        try {
          set({ simState: "Running" });
          const circuit = buildCircuit(sheet, graph, vars, project.simSettings);
          if (!circuit.ok) {
            set({ simState: "Error" });
            get().addLog("error", `Simulation aborted: ${circuit.problems.join(" / ") || "no simulatable circuit"}`);
            return;
          }
          const result = runAnalysisOnCircuit(circuit, project.simSettings, analysis, vars);
          const record: RunRecord = {
            id: uid("run"),
            label: analysis.name,
            analysis: analysis.kind,
            createdAt: Date.now(),
            status: result.converged ? "completed" : "error",
            seriesCount: result.traces.length,
            result,
          };
          set((s) => ({
            results: [...s.results, record],
            activeRunId: record.id,
            simState: result.converged ? "Completed" : "Error",
          }));
          get().addLog(
            result.converged ? "ok" : "error",
            `${analysis.name} finished in ${result.solveMs.toFixed(1)} ms — ${result.traces.length} traces, ${result.x.length} points`,
          );
          for (const line of result.log.slice(-6)) get().addLog("info", line);

          // digital side
          const dig = runDigital(sheet, graph, {
            tstop: Math.max(0.001, result.x[result.x.length - 1] ?? 0.01),
            points: 1200,
          });
          set({ digital: dig });
          if (dig.signals.length) get().addLog("info", `Digital engine: ${dig.signals.length} nets evaluated`);
        } catch (err) {
          set({ simState: "Error" });
          get().addLog("error", `Simulation failed: ${(err as Error).message}`);
        }
      }, 30);
    },

    runSweep: (spec) => {
      const state = get();
      const project = state.project;
      const sheet = withActiveSheet(project);
      const graph = state.graph;
      const analysis = project.analyses.find((a) => a.kind === spec.baseKind) ?? project.analyses[1];
      const vars: Record<string, string> = {};
      for (const v of project.designVariables) vars[v.name] = v.value;
      set({ simState: "Running" });
      get().addLog("info", `Parameter sweep ${spec.componentRef}.${spec.property} — ${spec.points} steps`);
      window.setTimeout(() => {
        try {
          const circuit = buildCircuit(sheet, graph, vars, project.simSettings);
          void circuit;
          const result = runParameterSweep(
            sheet,
            graph,
            project.simSettings,
            analysis,
            vars,
            spec,
          );
          const record: RunRecord = {
            id: uid("run"),
            label: `Sweep ${spec.componentRef}.${spec.property}`,
            analysis: "param",
            sweepParam: `${spec.componentRef}.${spec.property}`,
            createdAt: Date.now(),
            status: result.converged ? "completed" : "error",
            seriesCount: result.traces.length,
            result,
          };
          set((s) => ({
            results: [...s.results, record],
            activeRunId: record.id,
            simState: "Completed",
          }));
          get().addLog("ok", `Sweep complete — ${(result.children ?? []).length} runs, ${result.solveMs.toFixed(0)} ms total`);
        } catch (err) {
          set({ simState: "Error" });
          get().addLog("error", `Sweep failed: ${(err as Error).message}`);
        }
      }, 30);
    },

    stopSim: () => {
      set({ simState: "Stopped" });
      get().addLog("warn", "Simulation stopped by user");
    },

    clearResults: () => {
      set({ results: [], activeRunId: null, digital: null, simState: "Ready" });
      get().addLog("info", "Results cleared");
    },

    setActiveRun: (id) => set({ activeRunId: id }),

    setUi: (patch) =>
      set((s) => ({ project: { ...s.project, ui: { ...s.project.ui, ...patch } }, dirty: true })),

    loadProject: async (id) => {
      try {
        const rec = await storage.get(id);
        if (!rec) throw new Error("project not found");
        const project = migrateProject(rec.data);
        project.name = rec.name;
        project.id = rec.id;
        set({
          project,
          graph: rebuild(project),
          history: [clone(project)],
          historyIndex: 0,
          projectId: rec.id,
          dirty: false,
          selection: [],
          results: [],
          activeRunId: null,
          modal: null,
        });
        get().addLog(
          "ok",
          `Opened "${project.name}" from ${storage.kind === "local" ? "browser storage" : "project store"}`,
        );
      } catch (err) {
        get().addLog("error", `Open failed: ${(err as Error).message}`);
      }
    },

    saveProject: async (snapshot = false) => {
      const state = get();
      set({ saving: true });
      try {
        const rec = await storage.save(
          {
            id: state.projectId ?? state.project.id,
            name: state.project.name,
            description: state.project.description,
            data: { ...state.project },
          },
          snapshot ? "Manual snapshot" : "Save",
        );
        clearAutosave();
        set({ projectId: rec.id, dirty: false });
        get().addLog(
          "ok",
          `Saved "${rec.name}" (${storage.kind === "local" ? "browser IndexedDB" : "project store"})${snapshot ? " — snapshot created" : ""}`,
        );
      } catch (err) {
        // last-resort: keep the document in localStorage so nothing is lost
        writeAutosave(state.project);
        get().addLog("error", `Save failed: ${(err as Error).message} — document kept as autosave copy`);
      } finally {
        set({ saving: false });
      }
    },

    saveProjectAs: async (name) => {
      const project = { ...get().project, name, id: uid("proj") };
      set({ project, projectId: project.id });
      await get().saveProject(true);
    },

    loadExample: (key) => {
      const name =
        key === "rc" ? "RC Low-Pass Demo" : key === "diode" ? "Diode Rectifier" : "Digital Counter";
      const project = createProject(name);
      Object.assign(project, exampleProject(key, name));
      project.activeSheetId = project.sheets[0].id;
      set({
        project,
        graph: rebuild(project),
        history: [clone(project)],
        historyIndex: 0,
        projectId: null,
        dirty: true,
        selection: [],
        results: [],
        activeRunId: null,
        modal: null,
        digital: null,
      });
      get().addLog("ok", `Loaded example "${name}"`);
    },

    importProjectJson: (text) => {
      try {
        const raw = JSON.parse(text);
        const project = migrateProject(raw);
        set({
          project,
          graph: rebuild(project),
          history: [clone(project)],
          historyIndex: 0,
          projectId: null,
          dirty: true,
          selection: [],
          modal: null,
        });
        get().addLog("ok", `Imported "${project.name}"`);
      } catch (err) {
        get().addLog("error", `Import failed: ${(err as Error).message}`);
      }
    },
  };
});

export function snap(v: number, grid: number, enabled: boolean): number {
  return enabled ? Math.round(v / grid) * grid : v;
}

export function routeWire(a: Vec, b: Vec): Vec[] {
  return routeOrthogonal(a, b);
}

export function valueOf(comp: Component, key: string, fallback = 0): number {
  return parseEng(comp.props[key], fallback);
}

export type { SweepSpec };
