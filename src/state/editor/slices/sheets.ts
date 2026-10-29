



import { emptyDoc } from "@/lib/schematic/model";
import { PRESETS } from "@/lib/schematic/tools";
import { clearActiveSaveTarget } from "@/lib/storage";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine } from "../shared";
import { sheets } from "../docUtils";
import type { SheetEntry } from "../types";
import { applyDoc } from "../store";

export function createSheetsSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "loadPreset" | "newDocument" | "openSheet" | "renameSheet" | "reorderSheets" | "closeSheet" | "duplicateSheet"> {
  return {
      loadPreset: (id) => {
        if (get().partEditor.open) { get().log("warn", "Schließe erst den Bauteile-Editor."); return; }
        if (get().teacher.locked) { get().log("warn", "Lehrer-Modus: Plan ist gesperrt."); return; }
        const preset = PRESETS.find((p) => p.id === id);
        if (!preset) return;
        engine.running = false;
        clearActiveSaveTarget();
        const prevId = get().doc.id;
        const doc = preset.build();
        const sheetIdx = sheets.findIndex((s2) => s2.id === prevId);
        if (sheetIdx >= 0) {
          sheets[sheetIdx] = { id: doc.id, name: doc.name, doc, simRunning: false };
        }
        set((s) => ({ doc, past: [...s.past, s.doc], future: [], selection: [], sim: { ...s.sim, running: false } }));
        get().refreshNets();
        engine.reset(doc);
        get().log("ok", `Vorlage geladen: ${preset.name}`);
      },

      newDocument: () => {
        if (get().partEditor.open) { get().log("warn", "Schließe erst den Bauteile-Editor."); return; }
        if (get().teacher.locked) { get().log("warn", "Lehrer-Modus: Plan ist gesperrt."); return; }
        // W72: „+" legt einen neuen leeren Entwurf an und öffnet ihn als Reiter.
        engine.running = false;
        clearActiveSaveTarget();
        // Der offene Entwurf bleibt als Reiter erhalten (auch wenn er noch nicht in
        // der Liste steht) – „+" öffnet einen zusätzlichen Entwurf, keine Ersetzung.
        const aktuell = get().doc;
        // Okt-28: Lauf-Flag gehört dem alten Entwurf (Rückkehr setzt fort).
        const wasRunning = get().sim.running;
        const bestehend = sheets.find((s2) => s2.id === aktuell.id);
        if (bestehend) {
          // S3.2: sonst gingen Änderungen seit dem letzten Reiterwechsel verloren.
          bestehend.doc = aktuell;
          bestehend.name = aktuell.name || bestehend.name;
          bestehend.simRunning = wasRunning;
        } else {
          sheets.push({ id: aktuell.id, name: aktuell.name, doc: aktuell, simRunning: wasRunning });
        }
        const doc = emptyDoc();
        const entry: SheetEntry = { id: doc.id, name: doc.name, doc, simRunning: false };
        sheets.push(entry);
        applyDoc(doc, { pushHistory: true });
        set({ sim: { ...get().sim, running: false } });
        get().log("ok", `Neuer Entwurf „${doc.name}“ angelegt`);
      },

      openSheet: (id, opts) => {
        if (get().partEditor.open) { get().log("warn", "Schließe erst den Bauteile-Editor."); return; }
        const entry = sheets.find((s2) => s2.id === id);
        if (!entry) return;
        // Okt-28 (nur eine Simulation gleichzeitig): Lauf-Flag gehört der Datei.
        // Engine anhalten (Zustand bleibt für die Rückkehr erhalten), Ziel ggf. fortsetzen.
        const wasRunning = get().sim.running;
        engine.running = false;
        set((s) => ({ sim: { ...s.sim, running: false } }));
        // Der aktuelle Entwurf behält seinen Stand (inkl. Namen + Lauf-Flag) in der Liste.
        // closeSheet unterdrückt das Sichern (der Reiter ist bereits entfernt).
        if (opts?.stashCurrent !== false) {
          const cur = get().doc;
          const aktiv = sheets.find((s2) => s2.id === cur.id);
          if (aktiv) {
            aktiv.doc = cur;
            aktiv.name = cur.name || aktiv.name;
            aktiv.simRunning = wasRunning;
          } else {
            sheets.push({ id: cur.id, name: cur.name, doc: cur, simRunning: wasRunning });
          }
        }
        applyDoc(entry.doc, { pushHistory: false });
        // Undo gehört zum Entwurf: Verlauf nicht über Entwurfsgrenzen tragen.
        set({ past: [], future: [] });
        if (entry.simRunning) {
          // Angehaltener Eigen-Stand läuft ohne Rebuild weiter; fremder Stand
          // (Bauteile-Test, anderer Entwurf) wird neu aufgebaut.
          if (engine.builtDocId !== entry.doc.id) engine.rebuild(entry.doc);
          engine.running = true;
          set((s) => ({ sim: { ...s.sim, running: true } }));
        }
        get().log("info", `Entwurf „${entry.name}“ geöffnet`);
      },

      renameSheet: (id, name) => {
        const entry = sheets.find((s2) => s2.id === id);
        if (entry) entry.name = name;
      },

      reorderSheets: (fromId, toId) => {
        if (fromId === toId) return;
        const curDoc = get().doc;
        if (!sheets.some((s2) => s2.id === curDoc.id)) {
          sheets.unshift({ id: curDoc.id, name: curDoc.name, doc: curDoc, simRunning: get().sim.running });
        }
        const fromIdx = sheets.findIndex((s2) => s2.id === fromId);
        const toIdx = sheets.findIndex((s2) => s2.id === toId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const [moved] = sheets.splice(fromIdx, 1);
        sheets.splice(toIdx, 0, moved);
        set((s) => ({ sim: { ...s.sim, tick: s.sim.tick + 1 } }));
      },

      closeSheet: (id) => {
        if (get().partEditor.open) { get().log("warn", "Schließe erst den Bauteile-Editor."); return; }
        if (sheets.length <= 1) {
          get().log("warn", "Der letzte Entwurf bleibt offen – lege erst einen neuen an (＋)");
          return;
        }
        const idx = sheets.findIndex((s2) => s2.id === id);
        if (idx < 0) return;
        const closingActive = id === get().doc.id;
        if (closingActive) {
          // Aktuellen Stand (inkl. Namen) sichern, bevor der Reiter entfernt wird.
          sheets[idx].doc = get().doc;
          sheets[idx].name = get().doc.name || sheets[idx].name;
        }
        sheets.splice(idx, 1);
        if (closingActive) {
          const next = sheets[Math.min(idx, sheets.length - 1)];
          if (next) get().openSheet(next.id, { stashCurrent: false });
        } else {
          set((s) => ({ sim: { ...s.sim, tick: s.sim.tick + 1 } }));
        }
      },

      duplicateSheet: (id) => {
        if (get().partEditor.open) { get().log("warn", "Schließe erst den Bauteile-Editor."); return; }
        if (get().teacher.locked) { get().log("warn", "Lehrer-Modus: Plan ist gesperrt."); return; }
        const entry = sheets.find((s2) => s2.id === id);
        const src = entry && id !== get().doc.id ? entry.doc : get().doc;
        if (id === get().doc.id) {
          // Okt-28: Lauf-Flag gehört dem Original (openSheet sichert den Rest).
          const running = get().sim.running;
          if (entry) {
            entry.doc = get().doc;
            entry.name = get().doc.name || entry.name;
            entry.simRunning = running;
          } else {
            sheets.push({ id: get().doc.id, name: get().doc.name, doc: get().doc, simRunning: running });
          }
        }
        const doc = structuredClone(src);
        doc.id = "sch_" + Math.random().toString(36).slice(2, 9);
        doc.name = `${src.name || "Entwurf"} Kopie`;
        const at = entry ? sheets.indexOf(entry) + 1 : sheets.length;
        sheets.splice(at, 0, { id: doc.id, name: doc.name, doc, simRunning: false });
        engine.running = false;
        clearActiveSaveTarget();
        get().openSheet(doc.id);
      },
  };
}
