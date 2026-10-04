



import { emptyDoc } from "@/lib/schematic/model";
import { PRESETS } from "@/lib/schematic/tools";
import { clearActiveSaveTarget } from "@/lib/storage";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine } from "../shared";
import { sheets } from "../docUtils";
import type { SheetEntry } from "../types";
import { applyDoc } from "../store";export function createSheetsSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "loadPreset" | "newDocument" | "openSheet" | "renameSheet" | "reorderSheets"> {
  return {
      loadPreset: (id) => {
        const preset = PRESETS.find((p) => p.id === id);
        if (!preset) return;
        engine.running = false;
        clearActiveSaveTarget();
        const prevId = get().doc.id;
        const doc = preset.build();
        const sheetIdx = sheets.findIndex((s2) => s2.id === prevId);
        if (sheetIdx >= 0) {
          sheets[sheetIdx] = { id: doc.id, name: doc.name, doc };
        }
        set((s) => ({ doc, past: [...s.past, s.doc], future: [], selection: [], sim: { ...s.sim, running: false } }));
        get().refreshNets();
        engine.reset(doc);
        get().log("ok", `Vorlage geladen: ${preset.name}`);
      },

      newDocument: () => {
        // W72: „+" legt einen neuen leeren Entwurf an und öffnet ihn als Reiter.
        engine.running = false;
        clearActiveSaveTarget();
        // Der offene Entwurf bleibt als Reiter erhalten (auch wenn er noch nicht in
        // der Liste steht) – „+" öffnet einen zusätzlichen Entwurf, keine Ersetzung.
        const aktuell = get().doc;
        const bestehend = sheets.find((s2) => s2.id === aktuell.id);
        if (bestehend) {
          // S3.2: sonst gingen Änderungen seit dem letzten Reiterwechsel verloren.
          bestehend.doc = aktuell;
          bestehend.name = aktuell.name || bestehend.name;
        } else {
          sheets.push({ id: aktuell.id, name: aktuell.name, doc: aktuell });
        }
        const doc = emptyDoc();
        const entry: SheetEntry = { id: doc.id, name: doc.name, doc };
        sheets.push(entry);
        applyDoc(doc, { pushHistory: true });
        set({ sim: { ...get().sim, running: false } });
        get().log("ok", `Neuer Entwurf „${doc.name}“ angelegt`);
      },

      openSheet: (id) => {
        const entry = sheets.find((s2) => s2.id === id);
        if (!entry) return;
        // Der aktuelle Entwurf behält seinen Stand (inkl. Namen) in der Liste.
        const aktiv = sheets.find((s2) => s2.id === get().doc.id);
        if (aktiv) {
          aktiv.doc = get().doc;
          aktiv.name = get().doc.name || aktiv.name;
        }
        applyDoc(entry.doc, { pushHistory: false });
        // Undo gehört zum Entwurf: Verlauf nicht über Entwurfsgrenzen tragen.
        set({ past: [], future: [] });
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
          sheets.unshift({ id: curDoc.id, name: curDoc.name, doc: curDoc });
        }
        const fromIdx = sheets.findIndex((s2) => s2.id === fromId);
        const toIdx = sheets.findIndex((s2) => s2.id === toId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const [moved] = sheets.splice(fromIdx, 1);
        sheets.splice(toIdx, 0, moved);
        set((s) => ({ sim: { ...s.sim, tick: s.sim.tick + 1 } }));
      },
  };
}
