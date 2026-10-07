"use client";

import { create } from "zustand";
import type { EditorState } from "./types";
import type { SchematicDoc } from "@/lib/schematic/model";
import { initialState } from "./initial";
import { engine } from "./shared";
import { autoSaveToBoundFile, hasActiveSaveTarget, saveProjectLocal } from "@/lib/storage";
import { collectUsedCustomSpecs } from "@/lib/library/customParts";
import { createHistorySlice } from "./slices/history";
import { createPlacementSlice } from "./slices/placement";
import { createEditSlice } from "./slices/edit";
import { createClipboardSlice } from "./slices/clipboard";
import { createParamsSlice } from "./slices/params";
import { createWiresSlice } from "./slices/wires";
import { createLayoutSlice } from "./slices/layout";
import { createProbesSlice } from "./slices/probes";
import { createViewSlice } from "./slices/view";
import { createUiSlice } from "./slices/ui";
import { createInstrumentsSlice } from "./slices/instruments";
import { createSimSlice } from "./slices/sim";
import { createSheetsSlice } from "./slices/sheets";
import { createAnalysisSlice } from "./slices/analysis";
import { createStorageSlice } from "./slices/storage";
import { createMiscSlice } from "./slices/misc";
import { createPartEditorSlice } from "./slices/partEditor";

/* Auto-Save: 1.5 s nach der letzten Schaltplan-Änderung in den localStorage /
   Windows-AppData UND – sobald der Nutzer die Datei das erste Mal gespeichert
   oder geöffnet hat (W130) – automatisch direkt in die gebundene Datei! */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutosave() {
  if (typeof window === "undefined") return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (!useEditor.getState().savePending) useEditor.setState({ savePending: true });
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    // S6.2: Editor-Doc gehört dem Bauteil, nicht dem Projekt — still verwerfen.
    if (useEditor.getState().partEditor.open) {
      useEditor.setState({ savePending: false });
      return;
    }
    const { doc, instruments, log } = useEditor.getState();
    const usedSpecs = collectUsedCustomSpecs(doc);
    const { ok } = saveProjectLocal(doc, instruments, usedSpecs);
    const prevHealth = useEditor.getState().saveHealth;
    useEditor.setState({
      savePending: false,
      saveHealth: { local: ok ? "ok" : "error", file: prevHealth.file },
      ...(ok ? { lastSavedAt: Date.now() } : {}),
    });
    if (!ok) log("warn", "Auto-Save fehlgeschlagen (Speicher voll?) — Projekt bitte per Export JSON sichern.");
    // S5.11: Das Datei-Ergebnis wurde bisher still verworfen (void) — die
    // gebundene Datei konnte unbemerkt veralten. Jetzt: Status pflegen, nur
    // bei ZustandsWECHSEL loggen (kein Warn-Spam pro Tastenschlag).
    void (async () => {
      if (!hasActiveSaveTarget()) {
        const cur = useEditor.getState().saveHealth;
        if (cur.file !== "none") useEditor.setState({ saveHealth: { ...cur, file: "none" } });
        return;
      }
      const fileOk = await autoSaveToBoundFile(doc, instruments, usedSpecs);
      const cur = useEditor.getState().saveHealth;
      const next = fileOk ? "ok" : "stale";
      if (cur.file === next) return;
      useEditor.setState({ saveHealth: { ...cur, file: next } });
      if (fileOk) {
        if (cur.file === "stale") log("ok", "Datei-Auto-Save schreibt wieder — gebundene Datei ist aktuell.");
      } else {
        log(
          "warn",
          "Datei-Auto-Save fehlgeschlagen — Arbeitskopie ist nur lokal gesichert. Klick auf den Speicher-Status versucht es erneut.",
        );
      }
    })();
  }, 1500);
}

/** W72: einen Entwurf in den Bearbeitungszustand bringen (inkl. Netzprüfung, Simulation, Geräte). */
export function applyDoc(doc: SchematicDoc, opts: { pushHistory?: boolean } = {}): void {
  const st = useEditor.getState();
  const wasRunning = st.sim.running;
  st.setDoc(doc, opts.pushHistory ?? true);
  engine.running = wasRunning;
  if (wasRunning) engine.rebuild(doc);
  useEditor.setState({ instruments: [] });
  useEditor.getState().refreshNets();
}

/* S5.1: Der Store komponiert sich aus Slices — Verhalten unverändert. */
export const useEditor = create<EditorState>((set, get) => ({
  ...initialState,
  ...createHistorySlice(set, get),
  ...createPlacementSlice(set, get),
  ...createEditSlice(set, get),
  ...createClipboardSlice(set, get),
  ...createParamsSlice(set, get),
  ...createWiresSlice(set, get),
  ...createLayoutSlice(set, get),
  ...createProbesSlice(set, get),
  ...createViewSlice(set, get),
  ...createUiSlice(set, get),
  ...createInstrumentsSlice(set, get),
  ...createSimSlice(set, get),
  ...createSheetsSlice(set, get),
  ...createAnalysisSlice(set, get),
  ...createStorageSlice(set, get),
  ...createMiscSlice(set, get),
  ...createPartEditorSlice(set, get),
}));
