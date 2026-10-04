

/** W55: Zähler für die Einfüge-Kaskade (mehrfaches Einfügen staffelt sich). */
let pasteCascade = 0;



import { PART_MAP } from "@/lib/library/catalog";
import { Instance, NetLabel, TextNote, Wire, instanceBounds, pointOnSegment } from "@/lib/schematic/model";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { cloneJson, newId } from "../shared";export function createClipboardSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setSelection" | "selectAll" | "copySelection" | "pasteClipboard" | "duplicateSelection"> {
  return {
      setSelection: (ids) => set({ selection: ids }),

      selectAll: () => {
        const { doc } = get();
        set({
          selection: [
            ...doc.instances.map((i) => i.id),
            ...doc.wires.map((w) => w.id),
            ...doc.labels.map((l) => l.id),
            ...doc.notes.map((n) => n.id),
            ...doc.probes.map((pr) => pr.id),
          ],
        });
      },

      copySelection: () => {
        const { doc, selection } = get();
        pasteCascade = 0;
        const sel = new Set(selection);
        set({
          clipboard: {
            instances: doc.instances.filter((i) => sel.has(i.id)).map(cloneJson),
            wires: doc.wires.filter((w) => sel.has(w.id)).map(cloneJson),
            labels: doc.labels.filter((l) => sel.has(l.id)).map(cloneJson),
            notes: doc.notes.filter((n) => sel.has(n.id)).map(cloneJson),
            probes: doc.probes.filter((pr) => sel.has(pr.id)).map(cloneJson),
            // W61: Verbindungspunkte, die auf einer mitkopierten Leitung sitzen
            junctions: (doc.junctions ?? []).filter((j) =>
              doc.wires.some((w) => {
                if (!sel.has(w.id)) return false;
                for (let i = 0; i + 1 < w.points.length; i++) {
                  const a = w.points[i];
                  const b = w.points[i + 1];
                  if (pointOnSegment(j.x, j.y, a.x, a.y, b.x, b.y)) return true;
                }
                return false;
              }),
            ).map(cloneJson),
          },
        });
        if (sel.size) get().log("info", `${sel.size} Element${sel.size > 1 ? "e" : ""} kopiert`);
      },

      pasteClipboard: () => {
        const cb = get().clipboard;
        if (!cb) return;
        const total = cb.instances.length + cb.wires.length + cb.labels.length + cb.notes.length + cb.probes.length;
        if (!total) return;
        // W55: Einfüge-Kaskade – jede weitere Einfügung rückt weiter, und wenn die
        // Kopie auf einem fremden Bauteil landen würde, wird weiter gerückt.
        pasteCascade++;
        const base = 20 * pasteCascade;
        const others = get().doc.instances.filter((i) => !cb.instances.some((c) => c.id === i.id)).map((i) => instanceBounds(i));
        const hits = (ox: number, oy: number) =>
          cb.instances.some((src) => {
            const b = instanceBounds({ ...src, x: src.x + ox, y: src.y + oy });
            return others.some((o) => b.x < o.x + o.w + 4 && b.x + b.w > o.x - 4 && b.y < o.y + o.h + 4 && b.y + b.h > o.y - 4);
          });
        let DX = base;
        let DY = base;
        for (let k = 0; k < 12 && hits(DX, DY); k++) {
          DX += 20;
          DY += 20;
        }
        const used = new Set(get().doc.instances.map((i) => i.label));
        const freshInstances: Instance[] = cb.instances.map((src) => {
          const part = PART_MAP[src.partId];
          let label = src.label;
          if (part) {
            let n = 1;
            while (used.has(`${part.ref}${n}`)) n++;
            label = `${part.ref}${n}`;
          }
          used.add(label);
          return { ...cloneJson(src), id: newId("i"), label, x: src.x + DX, y: src.y + DY };
        });
        const freshWires: Wire[] = cb.wires.map((src) => ({
          ...cloneJson(src),
          id: newId("w"),
          points: src.points.map((p) => ({ x: p.x + DX, y: p.y + DY })),
        }));
        const freshLabels: NetLabel[] = cb.labels.map((src) => ({ ...cloneJson(src), id: newId("l"), x: src.x + DX, y: src.y + DY }));
        const freshNotes: TextNote[] = cb.notes.map((src) => ({ ...cloneJson(src), id: newId("n"), x: src.x + DX, y: src.y + DY }));
        const freshProbes = cb.probes.map((src) => ({
          ...cloneJson(src),
          id: newId("pr"),
          x: src.x + DX,
          y: src.y + DY,
          anchorX: typeof src.anchorX === "number" ? src.anchorX + DX : undefined,
          anchorY: typeof src.anchorY === "number" ? src.anchorY + DY : undefined,
        }));
        const freshJunctions = (cb.junctions ?? []).map((src) => ({ ...cloneJson(src), id: newId("jnc"), x: src.x + DX, y: src.y + DY }));
        get().commit((d) => {
          d.instances.push(...freshInstances);
          d.wires.push(...freshWires);
          d.labels.push(...freshLabels);
          d.notes.push(...freshNotes);
          d.probes.push(...freshProbes);
          if (freshJunctions.length) {
            if (!Array.isArray(d.junctions)) d.junctions = [];
            d.junctions.push(...freshJunctions);
          }
        });
        set({ selection: [...freshInstances.map((i) => i.id), ...freshWires.map((w) => w.id), ...freshProbes.map((pr) => pr.id)] });
        get().log("ok", `${total} Element${total > 1 ? "e" : ""} eingefügt`);
      },

      duplicateSelection: () => {
        if (!get().selection.length) return;
        get().copySelection();
        get().pasteClipboard();
      },
  };
}
