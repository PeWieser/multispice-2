
import { SymbolStylePref } from "@/lib/settings";
import { Instance, NetLabel, NetlistBuildResult, Rotation, SchematicDoc, TextNote, Wire } from "@/lib/schematic/model";
import { AnalysisPayload } from "@/lib/sim/runner";
import { IntegrationMethod } from "@/lib/sim/engine";
import type { TeacherLockState } from "@/lib/teacher";

export type Tool = "select" | "wire" | "junction" | "place" | "pan" | "probe" | "probe_voltage" | "probe_current" | "probe_power" | "probe_diff" | "probe_digital" | "erase" | "text" | "label";

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
  /** S2.1: Fortschritt 0..1 während `running` (Worker; Fallback springt auf 1). */
  progress?: number;
  /** S2.2: Konvergenz-Diagnose des Kernels (nur bei Fehlschlag belegt). */
  convergence?: "singular" | "nonconvergent";
  /** S2.2: verdächtige Knoten/Zweige, schlimmster zuerst. */
  suspects?: string[];
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
export type UiFontSize = "compact" | "standard" | "large";

export interface EditorState {
  doc: SchematicDoc;
  selection: string[];
  hoverNet: string | null;
  tool: Tool;
  placingPartId: string | null;
  /** W75: Drehung & Spiegelung des Bauteils in der Hand vor dem Absetzen. */
  placingRot: Rotation;
  placingMirror: boolean;
  view: { x: number; y: number; zoom: number };
  theme: ThemePref;
  uiFontSize: UiFontSize;
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
  /** S5.11: Speicher-Gesundheit — lokal (Arbeitskopie) + gebundene Datei. */
  saveHealth: { local: "ok" | "error"; file: "none" | "ok" | "stale" };
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
  /** S5.6d: Lehrer-Modus (Werte/Faults versteckt + Plan gesperrt). */
  teacher: TeacherLockState;

  /* actions */
  setDoc: (doc: SchematicDoc, pushHistory?: boolean) => void;
  commit: (mutator: (doc: SchematicDoc) => void, label?: string) => void;
  /** W79: Fasst eine laufende Maus-Ziehgeste zu genau einem Undo-Schritt zusammen. */
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  setTool: (t: Tool) => void;
  setPlacing: (partId: string | null) => void;
  setPlacingProbe: (kind: import("@/lib/schematic/model").ProbeKind | null) => void;
  addInstance: (partId: string, x: number, y: number, opts?: { rot?: Rotation; mirror?: boolean; autoWire?: boolean }) => string | null;
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
  /** W81: Netzlabel umbenennen & Textnotiz bearbeiten. */
  updateLabel: (id: string, name: string) => void;
  updateNote: (id: string, text: string) => void;
  addWire: (w: Wire) => void;
  /** W54/W78: ein Segment einer Leitung senkrecht verschieben (ohne Pin-Abriss). */
  setWireSegmentOffset: (wireId: string, segIdx: number, orig: Array<{ x: number; y: number }>, dx: number, dy: number) => void;
  /** W78: einen Eck-/Endpunkt einer Leitung streng orthogonal verschieben. */
  setWireCornerPosition: (wireId: string, pointIdx: number, orig: Array<{ x: number; y: number }>, target: { x: number; y: number }) => void;
  /** W55: ausgewählte Bauteile ausrichten (links/rechts/oben/unten/mitte). */
  alignSelection: (mode: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") => void;
  /** W55: ausgewählte Bauteile mit gleichem Abstand verteilen. */
  distributeSelection: (axis: "h" | "v") => void;
  /** W55: ausgewählte Leitungen begradigen (Raster, rechte Winkel, Pins). */
  straightenSelection: () => void;
  /** S3.3: Referenzen pro Präfix in Leserichtung neu nummerieren (Undo-fähig). */
  reannotate: () => void;
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
  /** S2.2: pulsierender Problem-Marker (Welt-Koordinaten) oder null. */
  spotlight: { x: number; y: number; label: string } | null;
  /** S2.2: zentriert den Problemknoten eines Netzes + setzt den Marker. */
  spotlightNet: (net: string) => void;
  clearSpotlight: () => void;
  /** S3.2: Auswahl-Extraktion als Bauteil (Instanz-IDs) oder null. */
  extractIds: string[] | null;
  openExtractDialog: (ids: string[]) => void;
  closeExtractDialog: () => void;
  setTheme: (t: ThemePref) => void;
  setUiFontSize: (s: UiFontSize) => void;
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
  /** S5.6d: Lehrer-Code setzen (Format 4 Ziffern). Gibt false bei ungültigem Code. */
  setTeacherCode: (code: string) => boolean;
  setTeacherLocked: (locked: boolean) => void;
  /** Entsperren mit Code. Gibt false bei falschem Code. */
  unlockTeacher: (code: string) => boolean;
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
  /** W72: Entwurf aus der Dateileiste öffnen. */
  openSheet: (id: string) => void;
  /** W72: Entwurfsname in der Dateileiste nachführen (Umbenennen im Inspector). */
  renameSheet: (id: string, name: string) => void;
  /** W98c: Reihenfolge der Entwürfe in der Dateileiste per Drag & Drop ändern. */
  reorderSheets: (fromId: string, toId: string) => void;
  setAnalysis: (a: Partial<AnalysisState>) => void;
  runAnalysis: (kind: string, payload?: AnalysisPayload) => Promise<void>;
  /** S2.1: bricht die laufende Analyse ab (Worker-Terminierung; Fallback: wirkungslos nach Start). */
  cancelAnalysis: () => void;
  saveProject: (name?: string, opts?: { saveAs?: boolean }) => Promise<void>;
  restoreLocalProject: () => void;
  markFavorite: (partId: string) => void;
  refreshNets: () => void;
}

export interface SheetEntry {
  id: string;
  name: string;
  doc: SchematicDoc;
}

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

export interface PinRef {
  instId: string;
  pinIndex: number;
  x: number;
  y: number;
}

/** S5.1: Zustandsfelder ohne Aktionen (für initialState). */
export type EditorData = {
  [K in keyof EditorState as EditorState[K] extends (...args: never[]) => unknown ? never : K]: EditorState[K];
};
