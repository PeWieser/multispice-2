



import { PART_MAP, defaultParams } from "@/lib/library/catalog";
import { isEditorPlaceable } from "@/lib/library/customParts";
import { GRID, Instance } from "@/lib/schematic/model";
import { insertComponentIntoWires } from "@/lib/schematic/netdraw";
import { DEFAULT_MCU_SKETCH } from "@/lib/sim/digital";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { nextLabel } from "../docUtils";
import type { Tool } from "../types";
import { useHud } from "../hud";export function createPlacementSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setTool" | "setPlacing" | "setPlacingProbe" | "addInstance"> {
  return {
      setTool: (t) => {
        if (t !== "wire") useHud.getState().cancelNetDrawing();
        set({
          tool: t,
          placingPartId: t === "place" ? get().placingPartId : null,
          placingProbeKind: t.startsWith("probe") ? get().placingProbeKind : null,
        });
      },
      setPlacing: (partId, preset = null) => {
        // S6.2: strenger Editor-Filter (kein Selbsteinbau, keine Mess-/Deko-Teile).
        if (partId && get().partEditor.open && !isEditorPlaceable(partId, get().partEditor.editingId)) {
          get().log("warn", `„${PART_MAP[partId]?.name ?? partId}“ kann nicht in ein Bauteil eingesetzt werden.`);
          return;
        }
        useHud.getState().cancelNetDrawing();
        set((s) => ({
          placingPartId: partId,
          placingPreset: preset,
          placingRot: 0,
          placingMirror: false,
          tool: partId ? "place" : "select",
          placingProbeKind: null,
          libraryOpen: partId ? false : s.libraryOpen,
        }));
      },
      setPlacingProbe: (kind) => {
        if (kind && get().partEditor.open) return; // S6.2: keine Sonden im Bauteil.
        useHud.getState().cancelNetDrawing();
        set({
          placingProbeKind: kind,
          tool: kind ? (`probe_${kind}` as Tool) : "select",
          placingPartId: null,
        });
      },

      addInstance: (partId, x, y, opts) => {
        const part = PART_MAP[partId];
        if (!part) return null;
        if (get().partEditor.open && !isEditorPlaceable(partId, get().partEditor.editingId)) return null; // S6.2
        const id = "i_" + Math.random().toString(36).slice(2, 10);
        // W49/B5: auch programmatische Platzierung rastet aufs Raster – krumme
        // Koordinaten waren die Ursache für Leitungen, die neben dem Pin enden.
        const gx = Math.round(x / GRID) * GRID;
        const gy = Math.round(y / GRID) * GRID;
        const rot = opts?.rot ?? (get().placingPartId === partId ? get().placingRot : 0);
        const mirror = opts?.mirror ?? (get().placingPartId === partId ? get().placingMirror : false);
        const inst: Instance = {
          id,
          partId,
          x: gx,
          y: gy,
          rot,
          ...(mirror ? { mirror: true } : {}),
          label: nextLabel(get().doc, part),
          params: defaultParams(part),
          text: part.interactive === "mcu" ? DEFAULT_MCU_SKETCH : undefined,
        };
        // S5.17: Such-Vorbelegung („r 10k") gilt einmalig fürs passende Teil.
        const preset = get().placingPreset;
        if (preset && preset.partId === partId) {
          Object.assign(inst.params, preset.params);
          set({ placingPreset: null });
        }
        let wireStats = { split: 0, connected: 0 };
        get().commit((d) => {
          d.instances.push(inst);
          if (opts?.autoWire) {
            wireStats = insertComponentIntoWires(d, id);
          }
        });
        get().markFavorite(partId);
        if (wireStats.split > 0) {
          get().log("ok", `${part.name} (${inst.label}) in Leitung eingesetzt`);
        } else if (wireStats.connected > 0) {
          get().log("ok", `${part.name} (${inst.label}) platziert & ${wireStats.connected} Pin${wireStats.connected > 1 ? "s" : ""} verbunden`);
        } else {
          get().log("ok", `${part.name} als ${inst.label} platziert`);
        }
        set({ selection: [id] });
        return id;
      },
  };
}
