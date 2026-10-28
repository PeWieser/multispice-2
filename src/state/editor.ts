"use client";

/* S5.1-Barrel: Der Editor-Store lebt in ./editor/ (Types, Slices, Store).
   Bestehende Imports von "@/state/editor" funktionieren unverändert. */
export type {
  Tool, InstrumentKind, InstrumentWindow, ArmedLead, LogEntry, AnalysisState,
  ClipboardData, ThemePref, UiFontSize, EditorState, SheetEntry, WindowSpec, PinRef,
} from "./editor/types";
export { engine } from "./editor/shared";
export {
  sheets, inferWireAngleAt, wireJunctionCandidates, collectPins,
  reattachWiresToPins, hitTestInstance,
} from "./editor/docUtils";
export { WINDOW_SPECS } from "./editor/windows";
export { applyDoc, useEditor } from "./editor/store";
export { useHud } from "./editor/hud";
