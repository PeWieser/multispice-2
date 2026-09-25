"use client";

import { create } from "zustand";
import { PART_MAP, PartDef, defaultParams } from "@/lib/library/catalog";
import { SymbolStylePref } from "@/lib/settings";
import {
  Instance,
  NetLabel,
  NetlistBuildResult,
  Rotation,
  SchematicDoc,
  TextNote,
  Wire,
  buildNets,
  emptyDoc,
  instanceBounds,
} from "@/lib/schematic/model";
import { PRESETS } from "@/lib/schematic/tools";
import { RealtimeEngine } from "@/lib/sim/realtime";
import { AnalysisPayload, runAnalysisLocal } from "@/lib/sim/runner";
import { loadLibraryLocal, loadProjectLocal, saveLibraryLocal, saveProjectLocal } from "@/lib/storage";
import { IntegrationMethod } from "@/lib/sim/engine";
import { DEFAULT_MCU_SKETCH } from "@/lib/sim/digital";

/* Auto-Save: 2 s nach der letzten Schaltplan-Änderung in den localStorage.
   Still bei Erfolg, ehrlich bei Fehler (Quota, Privatmodus) – das Produkt
   hält sein Versprechen aus dem Menü, statt es nur zu behaupten. */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  if (typeof window === "undefined") return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const { doc, log } = useEditor.getState();
    const { ok } = saveProjectLocal(doc);
    if (!ok) log("warn", "Auto-Save fehlgeschlagen (Speicher voll?) — Projekt bitte per Export JSON sichern.");
  }, 2000);
}

export const engine = new RealtimeEngine();

export type Tool = "select" | "wire" | "place" | "pan" | "probe" | "probe_voltage" | "probe_current" | "probe_power" | "probe_diff" | "probe_digital" | "erase" | "text" | "label";

export type InstrumentKind =
  | "dmm"
  | "scope"
  | "funcgen"
  | "bode"
  | "logic"
  | "watt"
  | "iv"
  | "pattern"
  | "spectrum"
  | "counter"
  | "logicconv"
  | "distortion"
  | "network";

export interface InstrumentWindow {
  id: string;
  kind: InstrumentKind;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  config: Record<string, unknown>;
}

export interface LogEntry {
  id: number;
  level: "info" | "warn" | "error" | "ok";
  time: string;
  message: string;
}

export interface AnalysisState {
  kind: string;
  running: boolean;
  error?: string;
  data?: unknown;
  durationMs?: number;
  /** Die Parameter der letzten Analyse (Quellen, Knoten …) — für Achsenbeschriftung im Grapher. */
  meta?: Record<string, unknown>;
}

export interface ClipboardData {
  instances: Instance[];
  wires: Wire[];
  labels: NetLabel[];
  notes: TextNote[];
  probes: import("@/lib/schematic/model").MeasurementProbe[];
}

export type ThemePref = "system" | "dark" | "light";

export interface EditorState {
  doc: SchematicDoc;
  selection: string[];
  hoverNet: string | null;
  tool: Tool;
  placingPartId: string | null;
  view: { x: number; y: number; zoom: number };
  theme: ThemePref;
  symbolStyle: SymbolStylePref;
  showGrid: boolean;
  snap: boolean;
  autoRoute: boolean;
  showCurrentFlow: boolean;
  showVoltageColors: boolean;
  showInlineValues: boolean;
  showErcMarkers: boolean;
  showRated: boolean;
  netResult: NetlistBuildResult;
  past: SchematicDoc[];
  future: SchematicDoc[];
  logs: LogEntry[];
  bottomTab: "console" | "netlist" | "errors" | "probes" | "bom" | "results";
  bottomOpen: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  libraryOpen: boolean;
  libraryPos: { x: number; y: number };
  librarySize: { w: number; h: number };
  instruments: InstrumentWindow[];
  probes: string[];
  analysis: AnalysisState;
  sim: {
    running: boolean;
    timeScale: number;
    sampleRate: number;
    method: IntegrationMethod;
    temperature: number;
    tick: number;
    fps: number;
  };
  favorites: string[];
  recent: string[];
  clipboard: ClipboardData | null;
  toast: { message: string; actionLabel?: string; action?: () => void } | null;
  placingProbeKind: import("@/lib/schematic/model").ProbeKind | null;

  /* actions */
  setDoc: (doc: SchematicDoc, pushHistory?: boolean) => void;
  commit: (mutator: (doc: SchematicDoc) => void, label?: string) => void;
  undo: () => void;
  redo: () => void;
  setTool: (t: Tool) => void;
  setPlacing: (partId: string | null) => void;
  setPlacingProbe: (kind: import("@/lib/schematic/model").ProbeKind | null) => void;
  addInstance: (partId: string, x: number, y: number) => string | null;
  deleteSelection: () => void;
  rotateSelection: (dir?: 1 | -1) => void;
  mirrorSelection: () => void;
  moveSelection: (dx: number, dy: number) => void;
  setSelection: (ids: string[]) => void;
  selectAll: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
  setParam: (instanceId: string, key: string, value: number | string | boolean) => void;
  setInstanceText: (instanceId: string, text: string) => void;
  addWire: (w: Wire) => void;
  addMeasurementProbe: (kind: import("@/lib/schematic/model").ProbeKind, x: number, y: number) => string | null;
  updateMeasurementProbe: (id: string, patch: Partial<import("@/lib/schematic/model").MeasurementProbe>) => void;
  removeMeasurementProbe: (id: string) => void;
  setView: (v: Partial<{ x: number; y: number; zoom: number }>) => void;
  fitView: () => void;
  setTheme: (t: ThemePref) => void;
  setSymbolStyle: (s: SymbolStylePref) => void;
  toggleTheme: () => void;
  log: (level: LogEntry["level"], message: string) => void;
  clearLogs: () => void;
  setBottomTab: (t: EditorState["bottomTab"]) => void;
  toggleBottom: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleLibrary: () => void;
  setLibraryPos: (pos: { x: number; y: number }) => void;
  setLibrarySize: (size: { w: number; h: number }) => void;
  setToast: (t: { message: string; actionLabel?: string; action?: () => void } | null) => void;
  clearToast: () => void;
  openInstrument: (kind: InstrumentKind) => void;
  closeInstrument: (id: string) => void;
  updateInstrument: (id: string, patch: Partial<InstrumentWindow>) => void;
  focusInstrument: (id: string) => void;
  toggleProbe: (net: string) => void;
  toggleCurrentFlow: () => void;
  toggleVoltageColors: () => void;
  toggleInlineValues: () => void;
  toggleErcMarkers: () => void;
  toggleRated: () => void;
  startSim: () => void;
  pauseSim: () => void;
  stopSim: () => void;
  setSimOption: <K extends keyof EditorState["sim"]>(k: K, v: EditorState["sim"][K]) => void;
  bumpTick: (fps: number) => void;
  loadPreset: (id: string) => void;
  newDocument: () => void;
  setAnalysis: (a: Partial<AnalysisState>) => void;
  runAnalysis: (kind: string, payload?: AnalysisPayload) => Promise<void>;
  saveProject: (name?: string) => void;
  restoreLocalProject: () => void;
  markFavorite: (partId: string) => void;
  refreshNets: () => void;
}

let logId = 1;
const now = () => new Date().toLocaleTimeString("de-DE", { hour12: false });

function nextLabel(doc: SchematicDoc, part: PartDef): string {
  let n = 1;
  const used = new Set(doc.instances.map((i) => i.label));
  while (used.has(`${part.ref}${n}`)) n++;
  return `${part.ref}${n}`;
}

const clone = (doc: SchematicDoc): SchematicDoc => JSON.parse(JSON.stringify(doc)) as SchematicDoc;

const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const newId = (prefix: string) => `${prefix}_` + Math.random().toString(36).slice(2, 10);

export const useEditor = create<EditorState>((set, get) => ({
  doc: PRESETS[2].build(),
  selection: [],
  hoverNet: null,
  tool: "select",
  placingPartId: null,
  view: { x: 60, y: 20, zoom: 1 },
  theme: "system",
  symbolStyle: "auto",
  showGrid: true,
  snap: true,
  autoRoute: true,
  showCurrentFlow: false,
  showVoltageColors: false,
  showInlineValues: true,
  showErcMarkers: true,
  showRated: true,
  netResult: { netlist: { devices: [] }, nets: [], pinNets: {}, pointNets: {}, errors: [], warnings: [] },
  past: [],
  future: [],
  logs: [
    { id: logId++, level: "ok", time: now(), message: "Multispice bereit — MNA/Newton-Raphson-Kernel initialisiert." },
    { id: logId++, level: "info", time: now(), message: "Beispielschaltung »555 Blinker« geladen. Drücke ▶ für die Echtzeitsimulation." },
  ],
  bottomTab: "console",
  bottomOpen: false,
  leftOpen: false,
  rightOpen: false,
  libraryOpen: false,
  libraryPos: { x: 24, y: 80 },
  librarySize: { w: 360, h: 520 },
  instruments: [],
  probes: [],
  analysis: { kind: "", running: false },
  sim: { running: false, timeScale: 1, sampleRate: 200000, method: "trap", temperature: 27, tick: 0, fps: 0 },
  favorites: ["resistor", "capacitor", "led", "npn_2n3904", "opamp_lm741", "ne555"],
  recent: [],
  clipboard: null,
  toast: null,
  placingProbeKind: null,

  setDoc: (doc, pushHistory = true) => {
    const prev = get().doc;
    set((s) => ({
      doc,
      past: pushHistory ? [...s.past.slice(-49), clone(prev)] : s.past,
      future: pushHistory ? [] : s.future,
    }));
    get().refreshNets();
  },

  commit: (mutator) => {
    const prev = get().doc;
    const next = clone(prev);
    mutator(next);
    set((s) => ({ doc: next, past: [...s.past.slice(-49), prev], future: [] }));
    get().refreshNets();
  },

  undo: () => {
    const { past, doc, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, 50) });
    get().refreshNets();
    get().log("info", "Rückgängig");
  },

  redo: () => {
    const { future, doc, past } = get();
    if (!future.length) return;
    const next = future[0];
    set({ doc: next, future: future.slice(1), past: [...past, doc] });
    get().refreshNets();
    get().log("info", "Wiederholen");
  },

  setTool: (t) => set({ tool: t, placingPartId: t === "place" ? get().placingPartId : null, placingProbeKind: t.startsWith("probe") ? get().placingProbeKind : null }),
  setPlacing: (partId) => set({ placingPartId: partId, tool: partId ? "place" : "select", placingProbeKind: null }),
  setPlacingProbe: (kind) => set({ placingProbeKind: kind, tool: kind ? (`probe_${kind}` as Tool) : "select", placingPartId: null }),

  addInstance: (partId, x, y) => {
    const part = PART_MAP[partId];
    if (!part) return null;
    const id = "i_" + Math.random().toString(36).slice(2, 10);
    const inst: Instance = {
      id,
      partId,
      x,
      y,
      rot: 0,
      label: nextLabel(get().doc, part),
      params: defaultParams(part),
      text: part.interactive === "mcu" ? DEFAULT_MCU_SKETCH : undefined,
    };
    get().commit((d) => {
      d.instances.push(inst);
    });
    get().markFavorite(partId);
    get().log("ok", `${part.name} als ${inst.label} platziert`);
    set({ selection: [id] });
    return id;
  },

  deleteSelection: () => {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    get().commit((d) => {
      d.instances = d.instances.filter((i) => !sel.has(i.id));
      d.wires = d.wires.filter((w) => !sel.has(w.id));
      d.labels = d.labels.filter((l) => !sel.has(l.id));
      d.notes = d.notes.filter((n) => !sel.has(n.id));
      d.probes = d.probes.filter((pr) => !sel.has(pr.id));
    });
    set({ selection: [] });
  },

  rotateSelection: (dir = 1) => {
    const sel = new Set(get().selection);
    get().commit((d) => {
      for (const i of d.instances) {
        if (sel.has(i.id)) i.rot = (((i.rot + dir * 90) % 360) + 360) % 360 as Rotation;
      }
    });
  },

  mirrorSelection: () => {
    const sel = new Set(get().selection);
    get().commit((d) => {
      for (const i of d.instances) if (sel.has(i.id)) i.mirror = !i.mirror;
    });
  },

  moveSelection: (dx, dy) => {
    const sel = new Set(get().selection);
    get().commit((d) => {
      for (const i of d.instances) if (sel.has(i.id)) {
        i.x += dx;
        i.y += dy;
      }
      for (const w of d.wires) if (sel.has(w.id)) w.points = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      for (const l of d.labels) if (sel.has(l.id)) {
        l.x += dx;
        l.y += dy;
      }
      for (const n of d.notes) if (sel.has(n.id)) {
        n.x += dx;
        n.y += dy;
      }
      for (const pr of d.probes) if (sel.has(pr.id)) {
        pr.x += dx;
        pr.y += dy;
      }
    });
  },

  setSelection: (ids) => set({ selection: ids }),

  selectAll: () => {
    const { doc } = get();
    set({
      selection: [
        ...doc.instances.map((i) => i.id),
        ...doc.wires.map((w) => w.id),
        ...doc.labels.map((l) => l.id),
        ...doc.notes.map((n) => n.id),
        ...doc.probes.map((pr) => pr.id),
      ],
    });
  },

  copySelection: () => {
    const { doc, selection } = get();
    const sel = new Set(selection);
    set({
      clipboard: {
        instances: doc.instances.filter((i) => sel.has(i.id)).map(cloneJson),
        wires: doc.wires.filter((w) => sel.has(w.id)).map(cloneJson),
        labels: doc.labels.filter((l) => sel.has(l.id)).map(cloneJson),
        notes: doc.notes.filter((n) => sel.has(n.id)).map(cloneJson),
        probes: doc.probes.filter((pr) => sel.has(pr.id)).map(cloneJson),
      },
    });
    if (sel.size) get().log("info", `${sel.size} Element${sel.size > 1 ? "e" : ""} kopiert`);
  },

  pasteClipboard: () => {
    const cb = get().clipboard;
    if (!cb) return;
    const total = cb.instances.length + cb.wires.length + cb.labels.length + cb.notes.length + cb.probes.length;
    if (!total) return;
    const DX = 20;
    const DY = 20;
    const used = new Set(get().doc.instances.map((i) => i.label));
    const freshInstances: Instance[] = cb.instances.map((src) => {
      const part = PART_MAP[src.partId];
      let label = src.label;
      if (part) {
        let n = 1;
        while (used.has(`${part.ref}${n}`)) n++;
        label = `${part.ref}${n}`;
      }
      used.add(label);
      return { ...cloneJson(src), id: newId("i"), label, x: src.x + DX, y: src.y + DY };
    });
    const freshWires: Wire[] = cb.wires.map((src) => ({
      ...cloneJson(src),
      id: newId("w"),
      points: src.points.map((p) => ({ x: p.x + DX, y: p.y + DY })),
    }));
    const freshLabels: NetLabel[] = cb.labels.map((src) => ({ ...cloneJson(src), id: newId("l"), x: src.x + DX, y: src.y + DY }));
    const freshNotes: TextNote[] = cb.notes.map((src) => ({ ...cloneJson(src), id: newId("n"), x: src.x + DX, y: src.y + DY }));
    const freshProbes = cb.probes.map((src) => ({ ...cloneJson(src), id: newId("pr"), x: src.x + DX, y: src.y + DY }));
    get().commit((d) => {
      d.instances.push(...freshInstances);
      d.wires.push(...freshWires);
      d.labels.push(...freshLabels);
      d.notes.push(...freshNotes);
      d.probes.push(...freshProbes);
    });
    set({ selection: [...freshInstances.map((i) => i.id), ...freshWires.map((w) => w.id), ...freshProbes.map((pr) => pr.id)] });
    get().log("ok", `${total} Element${total > 1 ? "e" : ""} eingefügt`);
  },

  duplicateSelection: () => {
    if (!get().selection.length) return;
    get().copySelection();
    get().pasteClipboard();
  },

  setParam: (instanceId, key, value) => {
    get().commit((d) => {
      const inst = d.instances.find((i) => i.id === instanceId);
      if (!inst) return;
      if (key === "__label") inst.label = String(value);
      else inst.params[key] = value;
    });
    if (get().sim.running) engine.rebuild(get().doc);
  },

  setInstanceText: (instanceId, text) => {
    get().commit((d) => {
      const inst = d.instances.find((i) => i.id === instanceId);
      if (inst) inst.text = text;
    });
    engine.sim?.mcuStates.delete(instanceId);
    engine.sim?.mcuPrograms.delete(instanceId);
    if (get().sim.running) engine.rebuild(get().doc);
  },

  addWire: (w) => {
    get().commit((d) => {
      d.wires.push(w);
    });
  },

  addMeasurementProbe: (kind, x, y) => {
    const id = newId("pr");
    const defaults: Record<string, any> = {
      voltage: { color: "#fbbf24", show: { vdc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
      current: { color: "#22d3ee", show: { idc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
      voltage_current: { color: "#f59e0b", show: { vdc: true, idc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
      power: { color: "#a78bfa", show: { power: true, vdc: true, idc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
      diff: { color: "#f472b6", show: { vdc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
      ref: { color: "#94a3b8", show: { vdc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
      digital: { color: "#4ade80", show: { vdc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
    };
    const def = defaults[kind] ?? defaults.voltage;
    // auto-assign net from current netResult if possible
    let autoNet: string | undefined;
    let anchorX = x, anchorY = y;
    try {
      const nr = get().netResult;
      // find nearest net point
      let best: string | undefined, bestD = 30*30;
      let bestPt: {x:number,y:number} | null = null;
      for (const net of nr.nets) for (const pt of net.points) {
        const d = (pt.x - x)**2 + (pt.y - y)**2;
        if (d < bestD) { bestD = d; best = net.name; bestPt = pt; }
      }
      autoNet = best;
      if (bestPt) { anchorX = bestPt.x; anchorY = bestPt.y; }
    } catch {}
    // V2: body offset from anchor (like Multisim magnifier)
    const offsetX = 32, offsetY = -28;
    const probe = { id, kind, x: anchorX+offsetX, y: anchorY+offsetY, anchorX, anchorY, offsetX, offsetY, leader: "arrow" as const, net: autoNet, ref: "0", ...def } as import("@/lib/schematic/model").MeasurementProbe;
    if (!probe.name) probe.name = `${kind.charAt(0).toUpperCase()}${get().doc.probes.filter(p=>p.kind===kind).length+1}`;
    get().commit((d) => {
      d.probes.push(probe);
    });
    // auto-add to legacy probes for grapher
    if (autoNet && autoNet!=="0" && !get().probes.includes(autoNet)) {
      set((s)=> ({ probes: [...s.probes, autoNet].slice(-12) }));
    }
    set({ selection: [id], rightOpen: true, bottomTab: "probes" as any });
    get().log("ok", `Messpunkt ${kind} ${probe.name} @ ${autoNet ?? "auto"} – Multisim-like: V vs GND/REF, I mit Richtung, Rechtsklick Reverse, Doppelklick Inspector`);
    return id;
  },

  updateMeasurementProbe: (id, patch) => {
    get().commit((d) => {
      const pr = d.probes.find((p) => p.id === id);
      if (pr) Object.assign(pr, patch);
    });
    // Auto-add to legacy probes for grapher (Transient/AC)
    const pr = get().doc.probes.find((p) => p.id === id);
    if (pr && (pr as any).net) {
      const net = (pr as any).net as string;
      if (net && net!=="0" && !get().probes.includes(net)) {
        set((s) => ({ probes: [...s.probes, net].slice(-12) }));
      }
    }
    // If probe is REF, propagate its net to dependent probes? No-op, resolved at render
    if (patch.kind) {
      get().log("info", `Probe ${id.slice(0,6)} Typ → ${patch.kind}`);
    }
  },

  removeMeasurementProbe: (id) => {
    get().commit((d) => {
      d.probes = d.probes.filter((p) => p.id !== id);
    });
    set((s) => ({ selection: s.selection.filter((sid) => sid !== id) }));
  },

  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),

  fitView: () => {
    const st = get();
    const { w: cw, h: ch } = useHud.getState().viewport;
    if (!st.doc.instances.length || cw < 10 || ch < 10) {
      st.setView({ zoom: 1, x: 0, y: 0 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const inst of st.doc.instances) {
      const b = instanceBounds(inst);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const pad = 80;
    const zoom = Math.min((cw - pad * 2) / Math.max(maxX - minX, 1), (ch - pad * 2) / Math.max(maxY - minY, 1), 2.5);
    st.setView({ zoom, x: (minX + maxX) / 2 - cw / zoom / 2, y: (minY + maxY) / 2 - ch / zoom / 2 });
  },

  setTheme: (t) => set({ theme: t }),
  setSymbolStyle: (s) => set({ symbolStyle: s }),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : s.theme === "light" ? "system" : "dark" })),
  toggleCurrentFlow: () => set((s) => ({ showCurrentFlow: !s.showCurrentFlow })),
  toggleVoltageColors: () => set((s) => ({ showVoltageColors: !s.showVoltageColors })),
  toggleInlineValues: () => set((s) => ({ showInlineValues: !s.showInlineValues })),
  toggleErcMarkers: () => set((s) => ({ showErcMarkers: !s.showErcMarkers })),
  toggleRated: () => set((s) => ({ showRated: !s.showRated })),

  log: (level, message) =>
    set((s) => ({ logs: [...s.logs.slice(-300), { id: logId++, level, time: now(), message }] })),
  clearLogs: () => set({ logs: [] }),

  setBottomTab: (t) => set({ bottomTab: t, bottomOpen: true }),
  toggleBottom: () => set((s) => ({ bottomOpen: !s.bottomOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  toggleLibrary: () => set((s) => ({ libraryOpen: !s.libraryOpen })),
  setLibraryPos: (pos) => set({ libraryPos: pos }),
  setLibrarySize: (size) => set({ librarySize: size }),
  setToast: (t) => set({ toast: t }),
  clearToast: () => set({ toast: null }),

  openInstrument: (kind) => {
    const titles: Record<InstrumentKind, string> = {
      dmm: "Digitalmultimeter",
      scope: "4-Kanal Oszilloskop",
      funcgen: "Funktionsgenerator",
      bode: "Bode-Plotter",
      logic: "Logikanalysator",
      logicconv: "Logic Converter",
      watt: "Wattmeter",
      iv: "IV-Analyzer",
      pattern: "Mustergenerator",
      spectrum: "Spektrumanalysator",
      counter: "Frequenzzähler",
      distortion: "Distortion Analyzer",
      network: "Network Analyzer",
    };
    const existing = get().instruments.find((i) => i.kind === kind);
    if (existing) {
      get().focusInstrument(existing.id);
      set((s) => ({ instruments: s.instruments.map((i) => (i.id === existing.id ? { ...i, minimized: false } : i)) }));
      return;
    }
    const sizes: Partial<Record<InstrumentKind, { w: number; h: number }>> = {
      scope: { w: 640, h: 460 },
      bode: { w: 600, h: 430 },
      logic: { w: 640, h: 420 },
      logicconv: { w: 480, h: 500 },
      iv: { w: 580, h: 420 },
      spectrum: { w: 600, h: 400 },
      dmm: { w: 330, h: 300 },
      funcgen: { w: 360, h: 430 },
      watt: { w: 360, h: 300 },
      pattern: { w: 420, h: 340 },
      distortion: { w: 360, h: 260 },
      network: { w: 600, h: 400 },
      counter: { w: 300, h: 250 },
    };
    const size = sizes[kind] ?? { w: 420, h: 340 };
    const count = get().instruments.length;
    const id = "w_" + Math.random().toString(36).slice(2, 8);
    set((s) => ({
      instruments: [
        ...s.instruments,
        {
          id,
          kind,
          title: titles[kind],
          x: 180 + count * 34,
          y: 110 + count * 28,
          ...size,
          z: 10 + count,
          minimized: false,
          config: {},
        },
      ],
    }));
  },

  closeInstrument: (id) => set((s) => ({ instruments: s.instruments.filter((i) => i.id !== id) })),
  updateInstrument: (id, patch) =>
    set((s) => ({ instruments: s.instruments.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  focusInstrument: (id) =>
    set((s) => {
      const maxZ = Math.max(10, ...s.instruments.map((i) => i.z));
      return { instruments: s.instruments.map((i) => (i.id === id ? { ...i, z: maxZ + 1 } : i)) };
    }),

  toggleProbe: (net) =>
    set((s) => ({ probes: s.probes.includes(net) ? s.probes.filter((n) => n !== net) : [...s.probes, net].slice(-8) })),

  startSim: () => {
    const { doc, sim } = get();
    engine.options.sampleRate = sim.sampleRate;
    engine.options.timeScale = sim.timeScale;
    engine.options.method = sim.method;
    engine.options.temperature = sim.temperature;
    engine.rebuild(doc);
    engine.running = true;
    set((s) => ({ sim: { ...s.sim, running: true } }));
    const st = engine.lastState;
    if (!st.ok) get().log("error", `Arbeitspunkt: ${st.message ?? "keine Konvergenz"}`);
    else get().log("ok", `Simulation gestartet — ${engine.netlist.devices.length} Bauteile, ${engine.netNames().length} Knoten`);
    for (const w of engine.warnings) get().log("warn", w);
    for (const e of engine.errors) get().log("error", e);
  },

  pauseSim: () => {
    engine.running = false;
    set((s) => ({ sim: { ...s.sim, running: false } }));
    get().log("info", "Simulation pausiert");
  },

  stopSim: () => {
    engine.running = false;
    engine.reset(get().doc);
    engine.running = false;
    set((s) => ({ sim: { ...s.sim, running: false, tick: s.sim.tick + 1 } }));
    get().log("info", "Simulation gestoppt und zurückgesetzt");
  },

  setSimOption: (k, v) => {
    set((s) => ({ sim: { ...s.sim, [k]: v } }));
    const sim = get().sim;
    engine.options.sampleRate = sim.sampleRate;
    engine.options.timeScale = sim.timeScale;
    engine.options.method = sim.method;
    engine.options.temperature = sim.temperature;
    if ((k === "method" || k === "temperature" || k === "sampleRate") && sim.running) engine.rebuild(get().doc);
  },

  bumpTick: (fps) => set((s) => ({ sim: { ...s.sim, tick: s.sim.tick + 1, fps } })),

  loadPreset: (id) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    engine.running = false;
    const doc = preset.build();
    set((s) => ({ doc, past: [...s.past, s.doc], future: [], selection: [], sim: { ...s.sim, running: false } }));
    get().refreshNets();
    get().log("ok", `Vorlage geladen: ${preset.name}`);
  },

  newDocument: () => {
    engine.running = false;
    set((s) => ({ doc: emptyDoc(), past: [...s.past, s.doc], future: [], selection: [], sim: { ...s.sim, running: false } }));
    get().refreshNets();
  },

  setAnalysis: (a) => set((s) => ({ analysis: { ...s.analysis, ...a } })),

  runAnalysis: async (kind, payload = {}) => {
    const { doc } = get();
    set({ analysis: { kind, running: true, meta: { ...(payload as Record<string, unknown>) } } });
    get().log("info", `Analyse »${kind}« gestartet …`);
    // Den `running`-Zustand erst rendern lassen, bevor der Kernel den
    // Main-Thread belegt — ehrliche Zwischenstufe statt eingefrorenem UI.
    await new Promise((r) => setTimeout(r, 0));
    try {
      const report = runAnalysisLocal(doc, kind, payload);
      set((s) => ({ analysis: { kind, running: false, data: report.result, durationMs: report.durationMs, meta: s.analysis.meta } }));
      get().log("ok", `Analyse »${kind}« beendet in ${report.durationMs} ms`);
      for (const w of report.warnings) get().log("warn", w);
      for (const e of report.errors) get().log("error", e);
    } catch (e) {
      set({ analysis: { kind, running: false, error: (e as Error).message } });
      get().log("error", `Analyse »${kind}«: ${(e as Error).message}`);
    }
  },

  saveProject: (name) => {
    const { doc } = get();
    const next = name && name !== doc.name ? { ...doc, name } : doc;
    if (next !== doc) get().setDoc(next, false);
    const { ok, bytes } = saveProjectLocal(next);
    if (ok) {
      get().log("ok", `Projekt lokal gespeichert (${(bytes / 1024).toFixed(1)} KB)`);
    } else {
      get().log("error", "Lokal speichern fehlgeschlagen (Speicher voll?) — sichere dein Projekt per Export (JSON).");
    }
  },

  restoreLocalProject: () => {
    const stored = loadProjectLocal();
    if (stored) {
      const doc = stored.doc as any;
      if (!Array.isArray(doc.probes)) doc.probes = [];
      set({ doc: stored.doc, selection: [], past: [], future: [] });
      get().refreshNets();
      const when = new Date(stored.savedAt);
      const stamp = Number.isNaN(when.getTime()) ? "" : ` (${when.toLocaleString("de-DE")})`;
      get().log("ok", `Zuletzt gespeicherter Stand wiederhergestellt${stamp}`);
    }
    const lib = loadLibraryLocal();
    if (lib) set({ favorites: lib.favorites.length ? lib.favorites : get().favorites, recent: lib.recent });
    // Theme aus localStorage lesen (falls vorhanden)
    try {
      const t = typeof window !== "undefined" ? window.localStorage.getItem("multispice.theme") : null;
      if (t === "dark" || t === "light" || t === "system") set({ theme: t as any });
      try { const sy = localStorage.getItem("multispice.symbolStyle") as any; if (sy) set({ symbolStyle: sy }); } catch {}
    } catch {}
  },

  markFavorite: (partId) => {
    const recent = [partId, ...get().recent.filter((p) => p !== partId)].slice(0, 12);
    set({ recent });
    saveLibraryLocal(get().favorites, recent);
  },

  refreshNets: () => {
    const result = buildNets(get().doc);
    set({ netResult: result });
    // Auto-assign net for probes that have no explicit net or net is stale
    const st = get();
    let changed = false;
    const nextDoc = { ...st.doc, probes: st.doc.probes.map(pr=>{
      if (pr.net && result.nets.some(n=>n.name===pr.net)) return pr;
      // find nearest net point
      let best: string | undefined, bestD = 28*28;
      for (const net of result.nets) for (const pt of net.points) {
        const d = (pt.x - pr.x)**2 + (pt.y - pr.y)**2;
        if (d < bestD) { bestD = d; best = net.name; }
      }
      if (best && best!==pr.net) { changed = true; return { ...pr, net: best }; }
      return pr;
    }) };
    if (changed) {
      // silent update without history push
      set({ doc: nextDoc });
    }
    // Jede Netz-Aktualisierung folgt auf eine Doc-Änderung → ein einziger
    // Hook-Punkt für den debounceten Auto-Save.
    scheduleAutosave();
  },
}));

/**
 * HUD-State (Cursor …) als eigener Store: wird bei jeder Mausbewegung
 * geschrieben, aber nur die Statusleiste hört zu — der Editor-Store
 * (und damit alle Panels) rendert dadurch nicht neu.
 */
export const useHud = create<{ cursor: { x: number; y: number }; viewport: { w: number; h: number }; dragPart: string | null }>(() => ({
  cursor: { x: 0, y: 0 },
  viewport: { w: 0, h: 0 },
  dragPart: null,
}));

/** Utility used by canvas hit tests. */
export function hitTestInstance(doc: SchematicDoc, x: number, y: number): Instance | null {
  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i];
    const b = instanceBounds(inst);
    if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return inst;
  }
  return null;
}
