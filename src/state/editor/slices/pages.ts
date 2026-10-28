import type { StoreApi } from "zustand";
import type { EditorState } from "../types";
import { ensurePages, newPageId } from "@/lib/schematic/model";
import { clone } from "../shared";

/** Blätter Stufe B: mehrere Seiten pro Entwurf. Die flachen Doc-Arrays sind
 * immer der aktuelle Inhalt der aktiven Seite (der Editor arbeitet unverändert
 * darauf); `doc.pages` trägt alle Seiten, `doc.activePageId` die aktive.
 * Seitenwechsel ist reine Ansicht: Simulation, Verlauf und Geräte laufen weiter. */
export function createPagesSlice(
  set: StoreApi<EditorState>["setState"],
  get: StoreApi<EditorState>["getState"],
): Pick<EditorState, "addPage" | "openPage" | "renamePage" | "deletePage"> {
  return {
    addPage: () => {
      if (get().partEditor.open) {
        get().log("warn", "Schließe erst den Bauteile-Editor.");
        return;
      }
      if (get().teacher.locked) {
        get().log("warn", "Lehrer-Modus: Plan ist gesperrt.");
        return;
      }
      const st = get();
      const next = clone(st.doc);
      const pages = ensurePages(next);
      const n = pages.length + 1;
      const pg = {
        id: newPageId(),
        name: `Seite ${n}`,
        instances: [],
        wires: [],
        labels: [],
        notes: [],
        probes: [],
        junctions: [],
      };
      pages.push(pg);
      next.activePageId = pg.id;
      next.instances = [];
      next.wires = [];
      next.labels = [];
      next.notes = [];
      next.probes = [];
      next.junctions = [];
      st.setDoc(next, true);
      st.log("ok", `Seite ${n} angelegt — Off-Page-Verbinder tragen Netze über Seitengrenzen`);
    },

    openPage: (id) => {
      if (get().partEditor.open) {
        get().log("warn", "Schließe erst den Bauteile-Editor.");
        return;
      }
      const d = get().doc;
      if (!d.pages || !d.pages.length) return;
      if (d.activePageId === id) return;
      const target = d.pages.find((p) => p.id === id);
      if (!target) return;
      // Aktuelle Seite zurücklegen (Referenzen — flach ist Quelle der Wahrheit).
      const cur = d.pages.find((p) => p.id === d.activePageId);
      if (cur) {
        cur.instances = d.instances;
        cur.wires = d.wires;
        cur.labels = d.labels;
        cur.notes = d.notes;
        cur.probes = d.probes;
        cur.junctions = d.junctions;
      }
      // Verlauf NICHT löschen: Einträge tragen ihre activePageId und verorten sich selbst.
      set({
        doc: {
          ...d,
          instances: target.instances,
          wires: target.wires,
          labels: target.labels,
          notes: target.notes,
          probes: target.probes ?? [],
          junctions: target.junctions,
          activePageId: target.id,
        },
        selection: [],
      });
      get().refreshNets();
      get().log("info", `Seite „${target.name}“ geöffnet`);
    },

    renamePage: (id, name) => {
      if (get().partEditor.open) {
        get().log("warn", "Schließe erst den Bauteile-Editor.");
        return;
      }
      if (get().teacher.locked) {
        get().log("warn", "Lehrer-Modus: Plan ist gesperrt.");
        return;
      }
      const v = name.trim();
      if (!v) return;
      get().commit((d) => {
        const pg = d.pages?.find((p) => p.id === id);
        if (pg) pg.name = v;
      });
    },

    deletePage: (id) => {
      if (get().partEditor.open) {
        get().log("warn", "Schließe erst den Bauteile-Editor.");
        return;
      }
      if (get().teacher.locked) {
        get().log("warn", "Lehrer-Modus: Plan ist gesperrt.");
        return;
      }
      const d = get().doc;
      const pages = d.pages ?? [];
      if (pages.length <= 1) {
        get().log("warn", "Die letzte Seite bleibt erhalten.");
        return;
      }
      const idx = pages.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const name = pages[idx].name;
      get().commit((nx) => {
        const ps = nx.pages!;
        ps.splice(idx, 1);
        if (nx.activePageId === id) {
          const nb = ps[Math.min(idx, ps.length - 1)];
          nx.activePageId = nb.id;
          nx.instances = nb.instances;
          nx.wires = nb.wires;
          nx.labels = nb.labels;
          nx.notes = nb.notes;
          nx.probes = nb.probes ?? [];
          nx.junctions = nb.junctions;
        }
      });
      get().log("info", `Seite „${name}“ gelöscht`);
    },
  };
}
