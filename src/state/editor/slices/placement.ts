



import { PART_MAP, defaultParams } from "@/lib/library/catalog";
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
      setPlacing: (partId) => {
        useHud.getState().cancelNetDrawing();
        set((s) => ({
          placingPartId: partId,
          placingRot: 0,
          placingMirror: false,
          tool: partId ? "place" : "select",
          placingProbeKind: null,
          libraryOpen: partId ? false : s.libraryOpen,
        }));
      },
      setPlacingProbe: (kind) => {
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
