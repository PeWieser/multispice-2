



import { buildNets } from "@/lib/schematic/model";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { scheduleAutosave } from "../store";
import { resolveNearestNetPoint } from "../docUtils";export function createMiscSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "refreshNets"> {
  return {
      refreshNets: () => {
        const result = buildNets(get().doc);
        set({ netResult: result });
        // Auto-assign net for probes that have no explicit net or net is stale
        const st = get();
        let changed = false;
        const nextDoc = { ...st.doc, probes: st.doc.probes.map(pr=>{
          if (pr.net && result.nets.some(n=>n.name===pr.net)) return pr;
          const ax = pr.anchorX ?? pr.x;
          const ay = pr.anchorY ?? pr.y;
          const hit = resolveNearestNetPoint(st.doc, result, ax, ay, 28);
          if (hit && hit.net !== pr.net) { changed = true; return { ...pr, net: hit.net }; }
          return pr;
        }) };
        if (changed) {
          // silent update without history push
          set({ doc: nextDoc });
        }
        // Jede Netz-Aktualisierung folgt auf eine Doc-Änderung → ein einziger
        // Hook-Punkt für den debounceten Auto-Save.
        // S6.2: Das Editor-Doc gehört dem Bauteil, nicht dem Projekt.
        if (!get().partEditor.open) scheduleAutosave();
      },
  };
}
