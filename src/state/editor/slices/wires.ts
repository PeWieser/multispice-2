



import { buildNets, pointOnSegment } from "@/lib/schematic/model";
import { dragWireCornerOrtho, dragWireSegmentOrtho, isPinnedWireEnd } from "@/lib/schematic/netdraw";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { wireJunctionCandidates } from "../docUtils";export function createWiresSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "addWire" | "toggleJunction" | "setWireSegmentOffset" | "setWireCornerPosition"> {
  return {
      addWire: (w) => {
        get().commit((d) => {
          d.wires.push(w);
          // W61: Multisim-Regel. Ein Leitungsende, das auf einer anderen Leitung
          // landet, ist eine echte Verbindung und bekommt einen Punkt. Kreuzen sich
          // zwei Leitungen nur, entsteht kein Punkt – und damit auch keine
          // Verbindung (buildNets verbindet nur noch an Anschlussstellen/Markern).
          if (!Array.isArray(d.junctions)) d.junctions = [];
          const segs: Array<[number, number, number, number]> = [];
          for (const other of d.wires) {
            if (other.id === w.id) continue;
            for (let i = 0; i + 1 < other.points.length; i++) {
              const a = other.points[i];
              const b = other.points[i + 1];
              if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) segs.push([a.x, a.y, b.x, b.y]);
            }
          }
          const add = (x: number, y: number) => {
            if (d.junctions!.some((j) => Math.hypot(j.x - x, j.y - y) < 0.5)) return;
            d.junctions!.push({ id: "jnc_" + Math.random().toString(36).slice(2, 9), x, y });
          };
          for (const e of [w.points[0], w.points[w.points.length - 1]]) {
            for (const [ax, ay, bx, by] of segs) if (pointOnSegment(e.x, e.y, ax, ay, bx, by)) { add(e.x, e.y); break; }
          }
          for (const other of d.wires) {
            if (other.id === w.id) continue;
            for (const e of [other.points[0], other.points[other.points.length - 1]]) {
              for (let i = 0; i + 1 < w.points.length; i++) {
                const a = w.points[i];
                const b = w.points[i + 1];
                if (pointOnSegment(e.x, e.y, a.x, a.y, b.x, b.y)) { add(e.x, e.y); break; }
              }
            }
          }
        });
      },

      toggleJunction: (x, y) => {
        const doc = get().doc;
        let best: { x: number; y: number } | null = null;
        let bestD = Infinity;
        for (const c of wireJunctionCandidates(doc)) {
          const dd = Math.hypot(c.x - x, c.y - y);
          if (dd < bestD) { bestD = dd; best = c; }
        }
        if (!best || bestD > 14) {
          get().log("warn", "Kein Treffpunkt zweier Leitungen in der Nähe – Leitungen übereinander legen oder auf die Kreuzung klicken");
          return;
        }
        const point = best;
        const hatte = (doc.junctions ?? []).some((j) => Math.hypot(j.x - point.x, j.y - point.y) < 0.5);
        get().commit((d) => {
          if (!Array.isArray(d.junctions)) d.junctions = [];
          if (hatte) d.junctions = d.junctions.filter((j) => Math.hypot(j.x - point.x, j.y - point.y) >= 0.5);
          else d.junctions.push({ id: "jnc_" + Math.random().toString(36).slice(2, 9), x: point.x, y: point.y });
        });
        get().log("info", hatte ? "Verbindungspunkt entfernt – die Leitungen sind jetzt getrennt" : "Verbindungspunkt gesetzt – die Leitungen sind jetzt verbunden");
      },

      setWireSegmentOffset: (wireId, segIdx, orig, dx, dy) => {
        get().commit((d) => {
          const w = d.wires.find((x) => x.id === wireId);
          if (!w || segIdx < 0 || segIdx + 1 >= orig.length) return;
          w.points = dragWireSegmentOrtho(orig, segIdx, dx, dy, isPinnedWireEnd(d, wireId));
        });
      },

      setWireCornerPosition: (wireId, pointIdx, orig, target) => {
        get().commit((d) => {
          const w = d.wires.find((x) => x.id === wireId);
          if (!w || pointIdx < 0 || pointIdx >= orig.length) return;
          w.points = dragWireCornerOrtho(orig, pointIdx, target, isPinnedWireEnd(d, wireId));
        });
      },
  };
}
