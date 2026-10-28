



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
        // Blätter Stufe B: Proben inaktiver Seiten namenbasiert nachführen
        // (Seitenwechsel ändert die Namensräume: S2:N003 ↔ N003).
        const names = new Set(result.nets.map((n) => n.name));
        const pages = nextDoc.pages;
        if (pages && pages.length > 1) {
          const ap = nextDoc.activePageId;
          let slotChanged = false;
          const nextPages = pages.map((pg, i) => {
            if (pg.id === ap) return pg;
            let touched = false;
            const probes = (pg.probes ?? []).map((pr) => {
              if (pr.net && names.has(pr.net)) return pr;
              const base = (pr.net ?? "").replace(/^S\d+:/, "");
              const hit = [`S${i + 1}:${base}`, base].find((c) => names.has(c));
              if (hit && hit !== pr.net) {
                touched = true;
                return { ...pr, net: hit };
              }
              return pr;
            });
            if (touched) {
              slotChanged = true;
              return { ...pg, probes };
            }
            return pg;
          });
          if (slotChanged) {
            changed = true;
            nextDoc.pages = nextPages;
          }
        }
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
