

/** S2.2: Auto-Clear des Problem-Markers. */
let spotlightTimer: ReturnType<typeof setTimeout> | null = null;



import { instanceBounds } from "@/lib/schematic/model";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { useEditor } from "../store";
import { useHud } from "../hud";export function createViewSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setView" | "spotlightNet" | "clearSpotlight" | "openExtractDialog" | "closeExtractDialog" | "fitView"> {
  return {
      setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),

      spotlightNet: (net) => {
        const st = get();
        const info = st.netResult.nets.find((n) => n.name === net);
        if (!info || !info.points.length) {
          st.log("warn", `Netz ${net} nicht gefunden — nichts zu zeigen`);
          return;
        }
        const cx = info.points.reduce((a, p) => a + p.x, 0) / info.points.length;
        const cy = info.points.reduce((a, p) => a + p.y, 0) / info.points.length;
        // Sicht zentrieren (Canvas-Maße sind geräteabhängig — Zoom 1.2, grob mittig).
        st.setView({ zoom: 1.2, x: cx - 400, y: cy - 300 });
        set({ spotlight: { x: cx, y: cy, label: net } });
        if (spotlightTimer) clearTimeout(spotlightTimer);
        spotlightTimer = setTimeout(() => {
          useEditor.getState().clearSpotlight();
        }, 6000);
      },
      clearSpotlight: () => {
        if (spotlightTimer) clearTimeout(spotlightTimer);
        spotlightTimer = null;
        set({ spotlight: null });
      },
      openExtractDialog: (ids) => set({ extractIds: [...ids] }),
      closeExtractDialog: () => set({ extractIds: null }),

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
  };
}
