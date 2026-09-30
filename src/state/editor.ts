"use client";

import { create } from "zustand";
import { PART_MAP, PartDef, defaultParams } from "@/lib/library/catalog";
import { SymbolStylePref } from "@/lib/settings";
import {
  GRID,
  Instance,
  NetLabel,
  NetlistBuildResult,
  Rotation,
  SchematicDoc,
  TextNote,
  Wire,
  attachWireEnd,
  buildNets,
  cleanWirePoints,
  emptyDoc,
  instanceBounds,
  pinPosition,
  pointOnSegment,
  straightenWirePoints,
} from "@/lib/schematic/model";
import { PRESETS } from "@/lib/schematic/tools";
import { normalizeDocGeometry } from "@/lib/schematic/netdraw";
import { orthoFollow } from "@/lib/schematic/ortho";
import { RealtimeEngine } from "@/lib/sim/realtime";
import { AnalysisPayload, runAnalysisLocal } from "@/lib/sim/runner";
import { loadLibraryLocal, loadProjectLocal, saveLibraryLocal, saveProjectLocal } from "@/lib/storage";
import { IntegrationMethod } from "@/lib/sim/engine";
import { BENCH_PAD } from "@/lib/windows/geometry";
import { DEFAULT_MCU_SKETCH } from "@/lib/sim/digital";

/* Auto-Save: 2 s nach der letzten Schaltplan-Änderung in den localStorage.
   Still bei Erfolg, ehrlich bei Fehler (Quota, Privatmodus) – das Produkt
   hält sein Versprechen aus dem Menü, statt es nur zu behaupten. */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  if (typeof window === "undefined") return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (!useEditor.getState().savePending) useEditor.setState({ savePending: true });
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    const { doc, instruments, log } = useEditor.getState();
    const { ok } = saveProjectLocal(doc, instruments);
    useEditor.setState({ savePending: false, ...(ok ? { lastSavedAt: Date.now() } : {}) });
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
  | "network"
  | "inspector";

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
  /** W29: gebundene Geräte (Oszi) hängen an einer Instanz auf dem Plan. */
  instanceId?: string;
  /** true = Fenster sitzt im Dock am unteren Rand (Layout statt x/y). */
  docked?: boolean;
  config: Record<string, unknown>;
}

/** Runde 17 (W32c): eine herausgenommene Messleitung (BNC-Klick).
 *  Runde 19 (W36): generisch für alle Geräte – das Oszi nimmt damit einen
 *  Tastkopf auf (CH1–CH4), der FG-2500 ein Kabel (OUT1/OUT2). */
export interface ArmedLead {
  instanceId: string;
  pinIndex: number;
  /** Anzeigename des Anschlusses („CH3“, „OUT1“) – Banner + Log. */
  name?: string;
  /** Farbe des Anschlusses (Oszi-Kanalfarbe; FG = Buchsenfarbe). */
  color?: string;
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
  /** W61: Verbindungspunkte mitkopieren, damit Kreuzungsverbindungen erhalten bleiben. */
  junctions?: import("@/lib/schematic/model").Junction[];
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
  /** W1: Richtung der Stromfluss-Punkte. Default "electron" (− → +), Alternative "conventional" (+ → − außen). */
  currentFlowDirection: "electron" | "conventional";
  showInlineValues: boolean;
  /** Runde 11: Lineale am Canvas-Rand (Ref-2-Chrome). */
  showRulers: boolean;
  /** Runde 11: Blattrand + Titelstempel um den Inhalt (Zeichenblatt). */
  showPageFrame: boolean;
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
  /** Sichtbarer Auto-Save-Beweis: letzter erfolgreicher Schreibzeitpunkt. */
  lastSavedAt: number | null;
  /** true = Änderung wartet auf den debounceten Auto-Save. */
  savePending: boolean;
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
  /** W54: ein Segment einer Leitung senkrecht verschieben (Basis = Ursprungsform). */
  setWireSegmentOffset: (wireId: string, segIdx: number, orig: Array<{ x: number; y: number }>, dx: number, dy: number) => void;
  /** W55: ausgewählte Bauteile ausrichten (links/rechts/oben/unten/mitte). */
  alignSelection: (mode: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") => void;
  /** W55: ausgewählte Bauteile mit gleichem Abstand verteilen. */
  distributeSelection: (axis: "h" | "v") => void;
  /** W55: ausgewählte Leitungen begradigen (Raster, rechte Winkel, Pins). */
  straightenSelection: () => void;
  /** W55: alle Leitungen prüfen und reparieren (Importe, alte Pläne). */
  repairWires: () => void;
  /** W61: Verbindungspunkt setzen/entfernen (Multisim-Kreuzung). */
  toggleJunction: (x: number, y: number) => void;
  /** W32c: Messleitung an Leitung/Pin legen – ersetzt die Leitung des Kanals. */
  connectProbeWire: (instanceId: string, pinIndex: number, target: { x: number; y: number }) => void;
  /** W32c: Welcher Kanal hält gerade eine Messleitung in der Hand? */
  leadArmed: ArmedLead | null;
  setLeadArmed: (a: ArmedLead | null) => void;
  /** W32a/Sicherheitsnetz: Geräte-Konfiguration überlebt Schließen/Wiederöffnen. */
  configArchive: Record<string, Record<string, unknown>>;
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
  openInstrument: (kind: InstrumentKind, opts?: { instanceId?: string; title?: string }) => void;
  /** W10: Inspector-Fenster öffnen/schließen (Geräte-Bar, Strg+I, Kontextmenü). */
  toggleInspector: () => void;
  closeInstrument: (id: string) => void;
  updateInstrument: (id: string, patch: Partial<InstrumentWindow>) => void;
  focusInstrument: (id: string) => void;
  toggleProbe: (net: string) => void;
  toggleCurrentFlow: () => void;
  toggleVoltageColors: () => void;
  setCurrentFlowDirection: (d: "electron" | "conventional") => void;
  toggleInlineValues: () => void;
  toggleRulers: () => void;
  togglePageFrame: () => void;
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

/** W55: Zähler für die Einfüge-Kaskade (mehrfaches Einfügen staffelt sich). */
let pasteCascade = 0;

const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Runde 17 (W32a): Rückholhilfe – zieht ein Fenster wieder in den sichtbaren
 *  Bereich, wenn es (fast) vollständig außerhalb liegt. Fenster-Koordinaten sind
 *  Layer-relativ (Canvas-Ebene ≈ Viewport minus Menü-/Werkzeugleisten). */
/* Runde 19 (W33): Die Gerätefenster liegen jetzt in einer Ebene über der ganzen
 * App (Portal) – Positionen sind damit Viewport-Koordinaten, nicht mehr relativ
 * zum Canvas. */
function recallPos(w: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
  const grab = Math.min(220, Math.max(80, w.w));
  const visX = Math.min(w.x + w.w, vw) - Math.max(w.x, 0);
  const visY = Math.min(w.y + w.h, vh) - Math.max(w.y, 0);
  if (visX >= 120 && visY >= 80) return { x: w.x, y: w.y }; // noch griffig
  return {
    x: Math.max(grab - w.w, Math.min(w.x, vw - grab)),
    y: Math.max(0, Math.min(w.y, vh - 40)),
  };
}

/* Runde 20 (W38): Fenster-Chrome = 2 px Rahmen (1 px je Seite) + 36 px
 * Titelzeile. Nur noch der Startwert fürs erste Bild – danach misst
 * `useWindowFit` das echte Chrome und setzt die Größe exakt auf Gerät + Chrome
 * (kein Leerraum, kein brauner Rand). */
const CHROME_W = 2;
const CHROME_H = 38;
const SCOPE_CHASSIS = { w: 1420, h: 688 };
const FG_STAGE = { w: 1160, h: 545 };

/** W18/R19: FG-2500 – Bühne 1160×545 + Chrome, viewport-geclampt. */
function fgDefaultSize(): { w: number; h: number } {
  const vw = (typeof window !== "undefined" ? window.innerWidth : 1600) - 8;
  const vh = (typeof window !== "undefined" ? window.innerHeight : 1000) - 8;
  // Runde 21 (W44): + Werkbank-Rahmen (2× BENCH_PAD), wie im Fenster-Fit.
  return {
    w: Math.max(320, Math.min(FG_STAGE.w + 2 * BENCH_PAD + CHROME_W, vw)),
    h: Math.max(240, Math.min(FG_STAGE.h + 2 * BENCH_PAD + CHROME_H, vh)),
  };
}

/** Runde 21 (W43): Untergrenzen des Fenster-Griffs. Runde 20 hatte 640×480 –
 *  auf knappen Bildschirmen war das bereits die Startgröße, sodass sich Geräte
 *  überhaupt nicht mehr verkleinern ließen („bleiben riesig"). Jetzt darf ein
 *  Gerät maßstäblich bis 320×240 herunter (Skalierung bis ≈ 0,23), Panels bis
 *  240×180 – die Obergrenze bleibt jeweils die Startgröße am Inhalt. */
const DEVICE_MIN = { w: 320, h: 240 };
const PANEL_MIN = { w: 240, h: 180 };

/** Runde 20 (W40): Ein Fenstermanager für alle Instrumente. Je Art stehen hier
 *  die Entwurfsbreite (Panel-Layout) und die Mindesthöhe bzw. das natürliche
 *  Maß der Geräte-Fenster – der Fenster-Fit misst beim Öffnen nach und setzt
 *  die Größe exakt (`useWindowFit`, `DeviceFit`/`PanelProbe`). */
export interface WindowSpec {
  /** Entwurfsbreite des Inhalts (Layout-Bezug für die Messung). */
  w: number;
  /** Natürliche Höhe (Geräte) bzw. Höhen-Untergrenze (Panels). */
  h: number;
}

export const WINDOW_SPECS: Record<InstrumentKind, WindowSpec> = {
  scope: SCOPE_CHASSIS,
  funcgen: FG_STAGE,
  bode: { w: 560, h: 320 },
  logic: { w: 600, h: 300 },
  logicconv: { w: 460, h: 420 },
  iv: { w: 560, h: 320 },
  spectrum: { w: 560, h: 300 },
  dmm: { w: 320, h: 280 },
  watt: { w: 360, h: 300 },
  pattern: { w: 400, h: 260 },
  distortion: { w: 360, h: 250 },
  network: { w: 560, h: 300 },
  counter: { w: 300, h: 250 },
  inspector: { w: 320, h: 480 },
};

const newId = (prefix: string) => `${prefix}_` + Math.random().toString(36).slice(2, 10);

/** Runde 16/19/21 (W31a/W35/W44): Startgröße des Oszi-Fensters – Chassis
 *  (1420×688) + Werkbank-Rahmen + Chrome, nie größer als der Viewport; bei
 *  Platzmangel skaliert DeviceFit das Gerät herunter und der Fenster-Fit zieht
 *  die Breite nach. */
function scopeDefaultSize(): { w: number; h: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
  return {
    w: Math.max(320, Math.min(SCOPE_CHASSIS.w + 2 * BENCH_PAD + CHROME_W, vw - 8)),
    h: Math.max(240, Math.min(SCOPE_CHASSIS.h + 2 * BENCH_PAD + CHROME_H, vh - 8)),
  };
}


/* --------------------------------------------------------------------------
 * W52 (Runde 23): Drehen/Spiegeln darf keine Verdrahtung abreißen.
 * Vor der Transformation werden die Pin-Positionen der betroffenen Bauteile
 * festgehalten; Leitungsenden, die auf einem dieser Pins saßen, wandern exakt
 * auf die neue Pin-Position (orthogonal nachgezogen, wie beim Verschieben).
 * ------------------------------------------------------------------------ */
export interface PinRef {
  instId: string;
  pinIndex: number;
  x: number;
  y: number;
}

/**
 * W61: Punkte, an denen zwei verschiedene Leitungen sich treffen – echte
 * Kreuzungen (nicht nur ein Knick der eigenen Leitung) und T-Kontakte. Nur an
 * solchen Stellen ist ein Verbindungspunkt sinnvoll; der Editor bietet ihn dort
 * an und setzt ihn automatisch, wenn eine Leitung auf einer anderen endet.
 */
export function wireJunctionCandidates(doc: SchematicDoc): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const j of doc.junctions ?? []) out.push({ x: j.x, y: j.y });
  const segs: Array<[number, number, number, number, string]> = [];
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const seen = new Set<string>();
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) segs.push([a.x, a.y, b.x, b.y, w.id]);
    }
  }
  for (let i = 0; i < segs.length; i++) {
    for (let k = i + 1; k < segs.length; k++) {
      const [ax, ay, bx, by, wa] = segs[i];
      const [cx, cy, dx, dy, wb] = segs[k];
      if (wa === wb) continue;
      const r = segmentHit(ax, ay, bx, by, cx, cy, dx, dy);
      if (!r) continue;
      const kk = key(r.x, r.y);
      if (seen.has(kk)) continue;
      seen.add(kk);
      out.push(r);
    }
  }
  return out;
}

/** Schnittpunkt zweier Strecken (auch Endpunkt-Treffer); null bei parallel/verfehlt. */
function segmentHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): { x: number; y: number } | null {
  const r1 = bx - ax;
  const r2 = by - ay;
  const s1 = dx - cx;
  const s2 = dy - cy;
  const den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null; // parallel oder kollinear
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: ax + t * r1, y: ay + t * r2 };
}

export function collectPins(doc: SchematicDoc, ids: Set<string>): PinRef[] {
  const out: PinRef[] = [];
  for (const inst of doc.instances) {
    if (!ids.has(inst.id)) continue;
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < part.pins.length; idx++) {
      const p = pinPosition(inst, idx);
      out.push({ instId: inst.id, pinIndex: idx, x: p.x, y: p.y });
    }
  }
  return out;
}

/** Leitungsenden auf die neuen Pin-Positionen setzen; liefert die Anzahl. */
export function reattachWiresToPins(doc: SchematicDoc, before: PinRef[], skipWires: Set<string>): number {
  if (!before.length) return 0;
  const find = (p: { x: number; y: number }) =>
    before.find((b) => Math.abs(b.x - p.x) <= 2 && Math.abs(b.y - p.y) <= 2);
  let moved = 0;
  for (const w of doc.wires) {
    if (skipWires.has(w.id) || w.points.length < 2) continue;
    let touched = false;
    const attach = (idx: number) => {
      const b = find(w.points[idx]);
      if (!b) return;
      const inst = doc.instances.find((i) => i.id === b.instId);
      if (!inst) return;
      const np = pinPosition(inst, b.pinIndex);
      if (Math.abs(np.x - w.points[idx].x) < 0.01 && Math.abs(np.y - w.points[idx].y) < 0.01) return;
      attachWireEnd(w.points, idx, np);
      moved++;
      touched = true;
    };
    attach(0);
    attach(w.points.length - 1);
    if (touched) w.points = cleanWirePoints(w.points);
  }
  return moved;
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: PRESETS[2].build(),
  selection: [],
  hoverNet: null,
  tool: "select",
  placingPartId: null,
  view: { x: 60, y: 20, zoom: 1 },
  theme: "light",
  symbolStyle: "auto",
  showGrid: true,
  snap: true,
  autoRoute: true,
  showCurrentFlow: false,
  showVoltageColors: false,
  currentFlowDirection: "electron",
  showInlineValues: false,
  showRulers: false,
  showPageFrame: false,
  showErcMarkers: true,
  showRated: true,
  netResult: { netlist: { devices: [] }, nets: [], pinNets: {}, pointNets: {}, errors: [], warnings: [], openEnds: [], junctions: [] },
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
  librarySize: { w: 860, h: 560 },
  instruments: [],
  lastSavedAt: null,
  savePending: false,
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
    // W49/B5: auch programmatische Platzierung rastet aufs Raster – krumme
    // Koordinaten waren die Ursache für Leitungen, die neben dem Pin enden.
    const gx = Math.round(x / GRID) * GRID;
    const gy = Math.round(y / GRID) * GRID;
    const inst: Instance = {
      id,
      partId,
      x: gx,
      y: gy,
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
    // W29: an gelöschte Instanzen gebundene Gerätefenster (Oszi/FG) schließen.
    set((s) => ({
      selection: [],
      instruments: s.instruments.filter((w) => !(w.instanceId && sel.has(w.instanceId))),
      // Runde 19: hängt eine Messleitung an der gelöschten Instanz, fällt sie mit weg.
      leadArmed: s.leadArmed && sel.has(s.leadArmed.instanceId) ? null : s.leadArmed,
    }));
  },

  rotateSelection: (dir = 1) => {
    const st0 = get();
    const sel = new Set(st0.selection);
    if (!sel.size) return;
    // W52: Pin-Positionen vor dem Drehen festhalten (siehe reattachWiresToPins).
    const before = collectPins(st0.doc, sel);
    const skipWires = new Set(st0.doc.wires.filter((w) => sel.has(w.id)).map((w) => w.id));
    let moved = 0;
    get().commit((d) => {
      for (const i of d.instances) {
        if (sel.has(i.id)) i.rot = (((i.rot + dir * 90) % 360) + 360) % 360 as Rotation;
      }
      moved = reattachWiresToPins(d, before, skipWires);
    });
    if (moved) get().log("info", `${moved} Leitungsende${moved > 1 ? "n" : ""} beim Drehen mitgeführt`);
  },

  mirrorSelection: () => {
    const st0 = get();
    const sel = new Set(st0.selection);
    if (!sel.size) return;
    const before = collectPins(st0.doc, sel);
    const skipWires = new Set(st0.doc.wires.filter((w) => sel.has(w.id)).map((w) => w.id));
    let moved = 0;
    get().commit((d) => {
      for (const i of d.instances) if (sel.has(i.id)) i.mirror = !i.mirror;
      moved = reattachWiresToPins(d, before, skipWires);
    });
    if (moved) get().log("info", `${moved} Leitungsende${moved > 1 ? "n" : ""} beim Spiegeln mitgeführt`);
  },

  moveSelection: (dx, dy) => {
    if (dx === 0 && dy === 0) return;
    const st0 = get();
    const sel = new Set(st0.selection);
    // W2: Gummiband – Leitungsendpunkte (und Probes/Labels), die auf einem Pin der
    // bewegten Bauteile sitzen, wandern mit. Netze bleiben verbunden.
    const movedPins: Array<{ x: number; y: number }> = [];
    for (const inst of st0.doc.instances) {
      if (!sel.has(inst.id)) continue;
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      for (let idx = 0; idx < part.pins.length; idx++) {
        const p = pinPosition(inst, idx);
        movedPins.push({ x: p.x, y: p.y });
      }
    }
    const onMovedPin = (p: { x: number; y: number }) =>
      movedPins.some((mp) => Math.abs(mp.x - p.x) <= 2 && Math.abs(mp.y - p.y) <= 2);
    // W26: BBoxen nicht bewegter Bauteile (mit Luft) = Hindernisse für die Knickwahl
    const obstacles: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const inst of st0.doc.instances) {
      if (sel.has(inst.id)) continue;
      const b = instanceBounds(inst);
      obstacles.push({ x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 });
    }
    get().commit((d) => {
      for (const i of d.instances) if (sel.has(i.id)) {
        i.x += dx;
        i.y += dy;
      }
      for (const w of d.wires) {
        if (sel.has(w.id)) {
          w.points = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          continue;
        }
        if (!movedPins.length || w.points.length < 2) continue;
        const first = w.points[0];
        const last = w.points[w.points.length - 1];
        const fHit = onMovedPin(first);
        const lHit = onMovedPin(last);
        if (fHit && lHit) {
          // Beide Enden an bewegten Bauteilen → ganze Leitung wandert.
          w.points = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        } else if (fHit || lHit) {
          const pts = w.points.map((p) => ({ x: p.x, y: p.y }));
          const idx = fHit ? 0 : pts.length - 1;
          pts[idx] = { x: pts[idx].x + dx, y: pts[idx].y + dy };
          // W26: rechtwinklig nachziehen – Knicke neu positionieren statt
          // aufzustapeln, L-Variante ohne Schnitt mit fremden Bauteilen.
          orthoFollow(pts, idx, obstacles);
          w.points = pts;
        }
      }
      for (const l of d.labels) {
        if (sel.has(l.id) || onMovedPin(l)) {
          l.x += dx;
          l.y += dy;
        }
      }
      for (const n of d.notes) if (sel.has(n.id)) {
        n.x += dx;
        n.y += dy;
      }
      for (const pr of d.probes) {
        if (sel.has(pr.id) || onMovedPin(pr)) {
          pr.x += dx;
          pr.y += dy;
        }
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
    pasteCascade = 0;
    const sel = new Set(selection);
    set({
      clipboard: {
        instances: doc.instances.filter((i) => sel.has(i.id)).map(cloneJson),
        wires: doc.wires.filter((w) => sel.has(w.id)).map(cloneJson),
        labels: doc.labels.filter((l) => sel.has(l.id)).map(cloneJson),
        notes: doc.notes.filter((n) => sel.has(n.id)).map(cloneJson),
        probes: doc.probes.filter((pr) => sel.has(pr.id)).map(cloneJson),
        // W61: Verbindungspunkte, die auf einer mitkopierten Leitung sitzen
        junctions: (doc.junctions ?? []).filter((j) =>
          doc.wires.some((w) => {
            if (!sel.has(w.id)) return false;
            for (let i = 0; i + 1 < w.points.length; i++) {
              const a = w.points[i];
              const b = w.points[i + 1];
              if (pointOnSegment(j.x, j.y, a.x, a.y, b.x, b.y)) return true;
            }
            return false;
          }),
        ).map(cloneJson),
      },
    });
    if (sel.size) get().log("info", `${sel.size} Element${sel.size > 1 ? "e" : ""} kopiert`);
  },

  pasteClipboard: () => {
    const cb = get().clipboard;
    if (!cb) return;
    const total = cb.instances.length + cb.wires.length + cb.labels.length + cb.notes.length + cb.probes.length;
    if (!total) return;
    // W55: Einfüge-Kaskade – jede weitere Einfügung rückt weiter, und wenn die
    // Kopie auf einem fremden Bauteil landen würde, wird weiter gerückt.
    pasteCascade++;
    const base = 20 * pasteCascade;
    const others = get().doc.instances.filter((i) => !cb.instances.some((c) => c.id === i.id)).map((i) => instanceBounds(i));
    const hits = (ox: number, oy: number) =>
      cb.instances.some((src) => {
        const b = instanceBounds({ ...src, x: src.x + ox, y: src.y + oy });
        return others.some((o) => b.x < o.x + o.w + 4 && b.x + b.w > o.x - 4 && b.y < o.y + o.h + 4 && b.y + b.h > o.y - 4);
      });
    let DX = base;
    let DY = base;
    for (let k = 0; k < 12 && hits(DX, DY); k++) {
      DX += 20;
      DY += 20;
    }
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
    const freshJunctions = (cb.junctions ?? []).map((src) => ({ ...cloneJson(src), id: newId("jnc"), x: src.x + DX, y: src.y + DY }));
    get().commit((d) => {
      d.instances.push(...freshInstances);
      d.wires.push(...freshWires);
      d.labels.push(...freshLabels);
      d.notes.push(...freshNotes);
      d.probes.push(...freshProbes);
      if (freshJunctions.length) {
        if (!Array.isArray(d.junctions)) d.junctions = [];
        d.junctions.push(...freshJunctions);
      }
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
      // W61: Multisim-Regel. Ein Leitungsende, das auf einer anderen Leitung
      // landet, ist eine echte Verbindung und bekommt einen Punkt. Kreuzen sich
      // zwei Leitungen nur, entsteht kein Punkt – und damit auch keine
      // Verbindung (buildNets verbindet nur noch an Anschlussstellen/Markern).
      if (!Array.isArray(d.junctions)) d.junctions = [];
      const segs: Array<[number, number, number, number]> = [];
      for (const other of d.wires) {
        if (other.id === w.id) continue;
        for (let i = 0; i + 1 < other.points.length; i++) {
          const a = other.points[i];
          const b = other.points[i + 1];
          if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) segs.push([a.x, a.y, b.x, b.y]);
        }
      }
      const add = (x: number, y: number) => {
        if (d.junctions!.some((j) => Math.hypot(j.x - x, j.y - y) < 0.5)) return;
        d.junctions!.push({ id: "jnc_" + Math.random().toString(36).slice(2, 9), x, y });
      };
      for (const e of [w.points[0], w.points[w.points.length - 1]]) {
        for (const [ax, ay, bx, by] of segs) if (pointOnSegment(e.x, e.y, ax, ay, bx, by)) { add(e.x, e.y); break; }
      }
      for (const other of d.wires) {
        if (other.id === w.id) continue;
        for (const e of [other.points[0], other.points[other.points.length - 1]]) {
          for (let i = 0; i + 1 < w.points.length; i++) {
            const a = w.points[i];
            const b = w.points[i + 1];
            if (pointOnSegment(e.x, e.y, a.x, a.y, b.x, b.y)) { add(e.x, e.y); break; }
          }
        }
      }
    });
  },

  toggleJunction: (x, y) => {
    const doc = get().doc;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const c of wireJunctionCandidates(doc)) {
      const dd = Math.hypot(c.x - x, c.y - y);
      if (dd < bestD) { bestD = dd; best = c; }
    }
    if (!best || bestD > 14) {
      get().log("warn", "Kein Treffpunkt zweier Leitungen in der Nähe – Leitungen übereinander legen oder auf die Kreuzung klicken");
      return;
    }
    const point = best;
    const hatte = (doc.junctions ?? []).some((j) => Math.hypot(j.x - point.x, j.y - point.y) < 0.5);
    get().commit((d) => {
      if (!Array.isArray(d.junctions)) d.junctions = [];
      if (hatte) d.junctions = d.junctions.filter((j) => Math.hypot(j.x - point.x, j.y - point.y) >= 0.5);
      else d.junctions.push({ id: "jnc_" + Math.random().toString(36).slice(2, 9), x: point.x, y: point.y });
    });
    get().log("info", hatte ? "Verbindungspunkt entfernt – die Leitungen sind jetzt getrennt" : "Verbindungspunkt gesetzt – die Leitungen sind jetzt verbunden");
  },

  setWireSegmentOffset: (wireId, segIdx, orig, dx, dy) => {
    if (dx === 0 && dy === 0) return;
    get().commit((d) => {
      const w = d.wires.find((x) => x.id === wireId);
      if (!w || segIdx < 0 || segIdx + 1 >= orig.length) return;
      const pts = orig.map((p, i) => (i === segIdx || i === segIdx + 1 ? { x: p.x + dx, y: p.y + dy } : { x: p.x, y: p.y }));
      w.points = cleanWirePoints(pts);
    });
  },

  alignSelection: (mode) => {
    const st0 = get();
    const sel = new Set(st0.selection);
    const insts = st0.doc.instances.filter((i) => sel.has(i.id));
    if (insts.length < 2) {
      get().log("warn", "Ausrichten braucht mindestens zwei ausgewählte Bauteile");
      return;
    }
    const boxes = insts.map((i) => ({ i, b: instanceBounds(i) }));
    const left = Math.min(...boxes.map((x) => x.b.x));
    const right = Math.max(...boxes.map((x) => x.b.x + x.b.w));
    const top = Math.min(...boxes.map((x) => x.b.y));
    const bottom = Math.max(...boxes.map((x) => x.b.y + x.b.h));
    const move = (x: (inst: Instance, b: { x: number; y: number; w: number; h: number }) => number,
                  y: (inst: Instance, b: { x: number; y: number; w: number; h: number }) => number) => {
      get().commit((d) => {
        for (const { i, b } of boxes) {
          const inst = d.instances.find((k) => k.id === i.id);
          if (!inst) continue;
          inst.x += x(inst, b);
          inst.y += y(inst, b);
        }
      });
    };
    const label: Record<typeof mode, string> = {
      left: "links", right: "rechts", top: "oben", bottom: "unten",
      centerH: "waagerecht mittig", centerV: "senkrecht mittig",
    };
    move(
      (inst, b) => (mode === "left" ? left - b.x : mode === "right" ? right - (b.x + b.w) : mode === "centerH" ? (left + right) / 2 - (b.x + b.w / 2) : 0),
      (inst, b) => (mode === "top" ? top - b.y : mode === "bottom" ? bottom - (b.y + b.h) : mode === "centerV" ? (top + bottom) / 2 - (b.y + b.h / 2) : 0),
    );
    get().log("ok", `${insts.length} Bauteile ${label[mode]} ausgerichtet`);
  },

  distributeSelection: (axis) => {
    const st0 = get();
    const sel = new Set(st0.selection);
    const insts = st0.doc.instances.filter((i) => sel.has(i.id));
    if (insts.length < 3) {
      get().log("warn", "Verteilen braucht mindestens drei ausgewählte Bauteile");
      return;
    }
    const boxes = insts.map((i) => ({ i, b: instanceBounds(i), c: axis === "h" ? instanceBounds(i).x + instanceBounds(i).w / 2 : instanceBounds(i).y + instanceBounds(i).h / 2 }));
    boxes.sort((a, b) => a.c - b.c);
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const step = (last.c - first.c) / (boxes.length - 1);
    let n = 0;
    get().commit((d) => {
      boxes.forEach(({ i }, k) => {
        if (k === 0 || k === boxes.length - 1) return;
        const inst = d.instances.find((x) => x.id === i.id);
        if (!inst) return;
        const target = first.c + step * k;
        if (axis === "h") inst.x += target - (instanceBounds(inst).x + instanceBounds(inst).w / 2);
        else inst.y += target - (instanceBounds(inst).y + instanceBounds(inst).h / 2);
        n++;
      });
    });
    get().log("ok", `${n} Bauteile gleichmäßig verteilt (${axis === "h" ? "waagerecht" : "senkrecht"})`);
  },

  straightenSelection: () => {
    const st0 = get();
    const sel = new Set(st0.selection);
    const wires = st0.doc.wires.filter((w) => sel.has(w.id));
    if (!wires.length) {
      get().log("warn", "Keine Leitung ausgewählt – Leitungen zum Begradigen markieren");
      return;
    }
    let n = 0;
    get().commit((d) => {
      for (const w of d.wires) {
        if (!sel.has(w.id)) continue;
        w.points = straightenWirePoints(w.points);
        n++;
      }
      // Enden wieder auf die Pins rasten (begradigen kann Pins minimal verfehlen);
      // W62: dabei auch die ausgewählten Bauteile aufs Raster holen.
      for (const inst of d.instances) {
        if (!sel.has(inst.id)) continue;
        inst.x = Math.round(inst.x / GRID) * GRID;
        inst.y = Math.round(inst.y / GRID) * GRID;
      }
      normalizeDocGeometry(d);
    });
    get().log("ok", `${n} Leitung${n > 1 ? "en" : ""} begradigt – Stützpunkte auf dem Raster, rechte Winkel`);
  },

  repairWires: () => {
    // W62: „Leitungen prüfen & reparieren" bringt auch gewachsene Pläne in Form:
    // Bauteile aufs Raster, Enden auf Pins, Segmente rechtwinklig. Genau die
    // Fälle „leicht verschobenes Bauteil", „schräge Leiterbahn", „Pin am Anfang
    // nicht verbunden" verschwinden damit.
    let rep = { instances: 0, ends: 0, wires: 0 };
    get().commit((d) => {
      rep = normalizeDocGeometry(d);
    });
    get().log("ok", `Leitungen geprüft: ${rep.instances} Bauteil${rep.instances === 1 ? "" : "e"} aufs Raster gerückt, ${rep.ends} Ende${rep.ends === 1 ? "" : "n"} auf Pins gerastet, ${rep.wires} Leitung${rep.wires === 1 ? "" : "en"} begradigt`);
  },

  // Runde 17 (W32c): Messleitung auf eine Leitung/einen Pin legen. Die alte
  // Leitung des Kanals (am Pin endend) wird ersetzt („Umstecken"), die neue
  // folgt einer Z-Route: erst aus dem Symbol heraus, dann auf Höhe des Ziels.
  // Die Messung folgt automatisch – sie hängt an der Verdrahtung (nets[k]).
  connectProbeWire: (instanceId, pinIndex, target) => {
    const leadName = get().leadArmed?.instanceId === instanceId && get().leadArmed?.pinIndex === pinIndex ? get().leadArmed?.name : undefined;
    get().commit((d) => {
      const inst = d.instances.find((i) => i.id === instanceId);
      if (!inst) return;
      const pinPt = pinPosition(inst, pinIndex);
      if (Math.abs(target.x - pinPt.x) < 1 && Math.abs(target.y - pinPt.y) < 1) return; // sich selbst
      const atPin = (p: { x: number; y: number }) => Math.abs(p.x - pinPt.x) < 0.6 && Math.abs(p.y - pinPt.y) < 0.6;
      d.wires = d.wires.filter((w) => !w.points.length || (!atPin(w.points[0]) && !atPin(w.points[w.points.length - 1])));
      const dx = Math.sign(pinPt.x - inst.x);
      const dy = Math.sign(pinPt.y - inst.y);
      const dir =
        Math.abs(pinPt.x - inst.x) >= Math.abs(pinPt.y - inst.y)
          ? { x: dx || -1, y: 0 }
          : { x: 0, y: dy || 1 };
      const out = { x: pinPt.x + dir.x * 20, y: pinPt.y + dir.y * 20 };
      // Runde 19 (W36): Die Leitung darf das Gerätesymbol nicht überqueren –
      // wenn der direkte Weg durch das Symbol liefe, führt sie außen herum.
      const box = instanceBounds(inst);
      const crossesBody = (a: { x: number; y: number }, c: { x: number; y: number }) => {
        const x1 = Math.min(a.x, c.x);
        const x2 = Math.max(a.x, c.x);
        const y1 = Math.min(a.y, c.y);
        const y2 = Math.max(a.y, c.y);
        return x2 > box.x && x1 < box.x + box.w && y2 > box.y && y1 < box.y + box.h;
      };
      const mid = dir.x !== 0 ? { x: out.x, y: target.y } : { x: target.x, y: out.y };
      const detour =
        crossesBody(out, mid) || crossesBody(mid, target)
          ? dir.x !== 0
            ? [
                { x: out.x, y: out.y <= box.y + box.h / 2 ? box.y - 20 : box.y + box.h + 20 },
                { x: target.x, y: out.y <= box.y + box.h / 2 ? box.y - 20 : box.y + box.h + 20 },
              ]
            : [
                { x: out.x <= box.x + box.w / 2 ? box.x - 20 : box.x + box.w + 20, y: out.y },
                { x: out.x <= box.x + box.w / 2 ? box.x - 20 : box.x + box.w + 20, y: target.y },
              ]
          : [mid];
      const pts: Array<{ x: number; y: number }> = [];
      for (const p of [pinPt, out, ...detour, target]) {
        const last = pts[pts.length - 1];
        if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) pts.push(p);
      }
      if (pts.length >= 2) d.wires.push({ id: newId("w"), points: pts });
    });
    if (get().sim.running) engine.rebuild(get().doc);
    get().log("info", `Messleitung ${leadName ?? `CH${pinIndex + 1}`} verbunden`);
  },

  leadArmed: null,
  setLeadArmed: (a) => set({ leadArmed: a }),
  configArchive: {},

  addMeasurementProbe: (kind, x, y) => {
    const id = newId("pr");
    const defaults: Record<string, any> = {
      voltage: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
      current: { show: { idc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
      voltage_current: { show: { vdc: true, idc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
      power: { show: { power: true, vdc: true, idc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
      diff: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
      ref: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
      digital: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
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
    set({ selection: [id], bottomTab: "probes" as any });
    get().log("ok", `Messpunkt ${probe.name} @ ${autoNet ?? "auto"}`);
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
  setCurrentFlowDirection: (d) => set({ currentFlowDirection: d }),
  toggleInlineValues: () => set((s) => ({ showInlineValues: !s.showInlineValues })),
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  togglePageFrame: () => set((s) => ({ showPageFrame: !s.showPageFrame })),
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

  openInstrument: (kind, opts) => {
    // W29: Instrument-Fenster sind an ein Schaltsymbol auf dem Plan gebunden
    // (Doppelklick). Pro Instanz genau ein Fenster; entkoppelte Oszi-/FG-Fenster
    // gibt es nicht mehr. W18: gleiche Mechanik für den FG-2500.
    if ((kind === "scope" || kind === "funcgen") && opts?.instanceId) {
      const bound = get().instruments.find((i) => i.kind === kind && i.instanceId === opts.instanceId);
      if (bound) {
        get().focusInstrument(bound.id);
        // Runde 17 (W32a): Rückholhilfe – liegt das Fenster (fast) außerhalb
        // des Screens, zieht ein Doppelklick aufs Symbol es wieder hinein.
        set((s) => ({
          instruments: s.instruments.map((w) =>
            w.id === bound.id
              ? { ...w, minimized: false, title: opts.title ?? w.title, ...recallPos(w) }
              : w,
          ),
        }));
        return;
      }
      const count = get().instruments.length;
      // W31a: Fenster klebt am Gerät (nie größer als der Viewport);
      // W18: FG-2500 hat eine feste Bühne (1160×545) + Chrome-Rest.
      const { w: defW, h: defH } =
        kind === "funcgen" ? fgDefaultSize() : scopeDefaultSize();
      set((s) => ({
        instruments: [
          ...s.instruments,
          {
            id: "w_" + opts.instanceId,
            kind,
            title: opts.title ?? (kind === "funcgen" ? "Funktionsgenerator" : "Oszilloskop"),
            x: 180 + count * 34,
            y: 110 + count * 28,
            w: defW,
            h: defH,
            z: 10 + count,
            minimized: false,
            // Runde 19/20 (W35/W38): Jedes Öffnen klebt wieder exakt am Gerät
            // (deviceFit: 0 = noch anpassen; der Adapter setzt danach 1).
            // W39: Skalieren bis 640×480 herunter (Gerät wird maßstäblich
            // kleiner, nie kleiner als bedienbar); Obergrenze bleibt das Bild.
            config: {
              ...(s.configArchive["w_" + opts.instanceId] ?? {}),
              deviceFit: 0,
              minW: DEVICE_MIN.w,
              minH: DEVICE_MIN.h,
            },
            instanceId: opts.instanceId,
          },
        ],
      }));
      return;
    }
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
      inspector: "Inspector",
    };
    const existing = get().instruments.find((i) => i.kind === kind);
    if (existing) {
      get().focusInstrument(existing.id);
      // Runde 17 (W32a): Rückholhilfe auch für die übrigen Geräte-Fenster.
      set((s) => ({
        instruments: s.instruments.map((i) =>
          i.id === existing.id ? { ...i, minimized: false, ...recallPos(i) } : i,
        ),
      }));
      return;
    }
    // Runde 20 (W40): Alle Fenster laufen durch denselben Manager. Startgröße
    // kommt aus WINDOW_SPECS (Entwurfsbreite, Untergrenze der Höhe); der
    // Fenster-Fit misst direkt nach dem ersten Bild den echten Inhalt und setzt
    // die Größe exakt (config.deviceFit = 0 erzwingt die Messung).
    const spec = WINDOW_SPECS[kind];
    const count = get().instruments.length;
    const id = "w_" + Math.random().toString(36).slice(2, 8);
    const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
    set((s) => ({
      instruments: [
        ...s.instruments,
        {
          id,
          kind,
          title: titles[kind],
          x: 180 + count * 34,
          y: 110 + count * 28,
          w: Math.max(320, Math.min(spec.w + CHROME_W, vw - 8)),
          h: Math.max(220, Math.min(spec.h + CHROME_H, vh - 8)),
          z: 10 + count,
          minimized: false,
          // Panels: Mindestmaß 320×220 (Layout bricht sonst um); die
          // Inhaltsmessung setzt die Startgröße darüber.
          config: { ...(s.configArchive[id] ?? {}), deviceFit: 0, minW: PANEL_MIN.w, minH: PANEL_MIN.h },
        },
      ],
    }));
  },

  toggleInspector: () => {
    const ex = get().instruments.find((w) => w.kind === "inspector");
    if (ex) get().closeInstrument(ex.id);
    else get().openInstrument("inspector");
  },

  closeInstrument: (id) =>
    set((s) => {
      const w = s.instruments.find((i) => i.id === id);
      return {
        instruments: s.instruments.filter((i) => i.id !== id),
        // Runde 19: eine im Gerät aufgenommene Messleitung fällt mit dem Fenster weg.
        leadArmed: w?.instanceId && s.leadArmed?.instanceId === w.instanceId ? null : s.leadArmed,
        // Runde 17: Konfiguration merken – Wiederöffnen bringt die Einstellungen
        // des Geräts zurück (Sicherheitsnetz, „kein Fenster geht verloren").
        configArchive: w ? { ...s.configArchive, [id]: w.config } : s.configArchive,
      };
    }),
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
    const { ok, bytes } = saveProjectLocal(next, get().instruments);
    if (ok) {
      set({ lastSavedAt: Date.now(), savePending: false });
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
      set({
        doc: stored.doc,
        selection: [],
        past: [],
        future: [],
        // Geräte gehören zum Projekt: Oszi & Co. überleben den Reload.
        // W29: entkoppelte Oszi-Fenster alter Projekte verwerfen – das Oszi
        // gibt es nur noch als gebundenes Schaltsymbol (Doppelklick).
        instruments: Array.isArray(stored.instruments)
          ? (stored.instruments as InstrumentWindow[])
              .filter((w) => !(w.kind === "scope" && !w.instanceId))
              .map((w) => {
                // Runde 21 (W42): Geräte-Fenster nach dem Laden neu am Gerät
                // ausrichten (deviceFit: 0) – die Fenstergröße hängt am
                // sichtbaren Gerät inkl. Werkbank-Rahmen, alte Werte passen nicht.
                const device = w.kind === "scope" || w.kind === "funcgen";
                const stretched =
                  w.kind === "scope" && w.instanceId && w.w === 920 && w.h === 640
                    ? scopeDefaultSize()
                    : null;
                if (!device && !stretched) return w;
                return {
                  ...w,
                  ...(stretched ?? {}),
                  config: device ? { ...w.config, deviceFit: 0 } : w.config,
                };
              })
          : [],
        lastSavedAt: stored.savedAt ? new Date(stored.savedAt).getTime() : null,
      });
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
