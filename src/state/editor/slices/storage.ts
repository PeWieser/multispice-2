



import { SchematicDoc, buildNets, straightenWirePoints } from "@/lib/schematic/model";
import { PRESETS } from "@/lib/schematic/tools";
import { normalizeDocGeometry } from "@/lib/schematic/netdraw";
import { getActiveSaveTargetLabel, hasActiveSaveTarget, loadLibraryLocal, loadProjectLocal, saveLibraryLocal, saveProjectLocal, saveProjectToFile } from "@/lib/storage";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { now } from "../shared";
import { sheets } from "../docUtils";
import { scopeDefaultSize } from "../windows";
import type { InstrumentWindow } from "../types";export function createStorageSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "saveProject" | "restoreLocalProject" | "markFavorite"> {
  return {
      saveProject: async (name, opts) => {
        const { doc } = get();
        const next = name && name !== doc.name ? { ...doc, name } : doc;
        if (next !== doc) get().setDoc(next, false);
        const { ok, bytes } = saveProjectLocal(next, get().instruments);
        if (ok) {
          set({ lastSavedAt: Date.now(), savePending: false });
        }
        const wasBound = hasActiveSaveTarget();
        const fileRes = await saveProjectToFile(next, get().instruments, { saveAs: opts?.saveAs });
        if (fileRes.ok) {
          const label = fileRes.targetName ?? getActiveSaveTargetLabel() ?? `${next.name}.msx.json`;
          if (!wasBound || opts?.saveAs) {
            get().log("ok", `Datei „${label}“ gespeichert — zukünftige Änderungen werden automatisch gespeichert`);
          } else {
            get().log("ok", `Datei „${label}“ aktualisiert (${(bytes / 1024).toFixed(1)} KB, Auto-Save aktiv)`);
          }
          return;
        }
        if (fileRes.canceled) {
          if (ok) {
            get().log("info", `Arbeitskopie lokal gesichert (${(bytes / 1024).toFixed(1)} KB)`);
          }
          return;
        }
        if (ok) {
          get().log("ok", `Projekt lokal gespeichert (${(bytes / 1024).toFixed(1)} KB)`);
        } else {
          get().log("error", "Speichern fehlgeschlagen — bitte Projekt per Export JSON sichern.");
        }
      },

      restoreLocalProject: () => {
        // W72: Der beim Start geladene Entwurf ist der erste Reiter.
        const first = get().doc;
        if (!sheets.length) sheets.push({ id: first.id, name: first.name, doc: first });
        const stored = loadProjectLocal();
        if (stored) {
          const doc = stored.doc as any;
          if (!Array.isArray(doc.probes)) doc.probes = [];
          // W72: Der wiederhergestellte Stand ist der erste Entwurf in der Dateileiste.
          const restored = stored.doc as SchematicDoc;
          normalizeDocGeometry(restored);
          // W98d: Falls im localStorage noch ein durch das frühere straightenWirePoints
          // kurzgeschlossenes Standard-Beispiel (z. B. "555 Blinker") liegt, wird es
          // automatisch auf die intakte Vorlage aktualisiert (Probes bleiben erhalten).
          const builtRestored = buildNets(restored);
          const hasShortedPart = builtRestored.netlist.devices.some(
            (dev) =>
              (dev.type === "R" || dev.type === "C" || dev.type === "V" || dev.type === "LED") &&
              dev.nodes.length >= 2 &&
              dev.nodes[0] === dev.nodes[1],
          );
          if (hasShortedPart) {
            const matchingPreset = PRESETS.find((p) => {
              const pd = p.build();
              return pd.name === restored.name && pd.instances.length === restored.instances.length;
            });
            if (matchingPreset) {
              const fresh = matchingPreset.build();
              fresh.probes = restored.probes ?? [];
              Object.assign(restored, fresh);
            }
          }
          if (sheets.length) sheets[0] = { id: restored.id, name: restored.name, doc: restored };
          else sheets.push({ id: restored.id, name: restored.name, doc: restored });
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
  };
}
