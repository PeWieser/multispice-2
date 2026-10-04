



import { GRID, reannotateLabels, straightenWirePoints } from "@/lib/schematic/model";
import { contactKeep, normalizeDocGeometry } from "@/lib/schematic/netdraw";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";export function createLayoutSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "alignSelection" | "distributeSelection" | "straightenSelection" | "reannotate" | "repairWires"> {
  return {
      alignSelection: (mode) => {
        const st0 = get();
        const sel = new Set(st0.selection);
        const insts = st0.doc.instances.filter((i) => sel.has(i.id));
        if (insts.length < 2) {
          get().log("warn", "Ausrichten braucht mindestens zwei ausgewählte Bauteile");
          return;
        }
        // W83: Auf dem Schaltplan-Raster (GRID = 10) nach Bauteil-Ursprüngen/Pins
        // ausrichten statt nach krummen Grafik-Bounding-Boxen, damit Pins aller
        // ausgerichteten Bauteile exakt auf derselben Rasterlinie liegen.
        const snapG = (v: number) => Math.round(v / GRID) * GRID;
        const xs = insts.map((i) => i.x);
        const ys = insts.map((i) => i.y);
        const left = snapG(Math.min(...xs));
        const right = snapG(Math.max(...xs));
        const top = snapG(Math.min(...ys));
        const bottom = snapG(Math.max(...ys));
        const midX = snapG((left + right) / 2);
        const midY = snapG((top + bottom) / 2);
        const prevSel = [...st0.selection];
        get().beginGesture();
        for (const i of insts) {
          const cur = get().doc.instances.find((k) => k.id === i.id);
          if (!cur) continue;
          const tx = mode === "left" ? left : mode === "right" ? right : mode === "centerH" ? midX : cur.x;
          const ty = mode === "top" ? top : mode === "bottom" ? bottom : mode === "centerV" ? midY : cur.y;
          const dx = snapG(tx - cur.x);
          const dy = snapG(ty - cur.y);
          if (dx !== 0 || dy !== 0) {
            set({ selection: [cur.id] });
            get().moveSelection(dx, dy);
          }
        }
        set({ selection: prevSel });
        get().endGesture();
        const label: Record<typeof mode, string> = {
          left: "links", right: "rechts", top: "oben", bottom: "unten",
          centerH: "waagerecht mittig", centerV: "senkrecht mittig",
        };
        get().log("ok", `${insts.length} Bauteile ${label[mode]} auf dem Raster ausgerichtet`);
      },

      distributeSelection: (axis) => {
        const st0 = get();
        const sel = new Set(st0.selection);
        const insts = st0.doc.instances.filter((i) => sel.has(i.id));
        if (insts.length < 3) {
          get().log("warn", "Verteilen braucht mindestens drei ausgewählte Bauteile");
          return;
        }
        const snapG = (v: number) => Math.round(v / GRID) * GRID;
        const sorted = [...insts].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
        const first = axis === "h" ? sorted[0].x : sorted[0].y;
        const last = axis === "h" ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y;
        const step = (last - first) / (sorted.length - 1);
        const prevSel = [...st0.selection];
        let n = 0;
        get().beginGesture();
        sorted.forEach((i, k) => {
          if (k === 0 || k === sorted.length - 1) return;
          const cur = get().doc.instances.find((x) => x.id === i.id);
          if (!cur) return;
          const target = snapG(first + step * k);
          const dx = axis === "h" ? target - cur.x : 0;
          const dy = axis === "v" ? target - cur.y : 0;
          if (dx !== 0 || dy !== 0) {
            set({ selection: [cur.id] });
            get().moveSelection(dx, dy);
            n++;
          }
        });
        set({ selection: prevSel });
        get().endGesture();
        get().log("ok", `${n} Bauteile gleichmäßig auf dem Raster verteilt (${axis === "h" ? "waagerecht" : "senkrecht"})`);
      },

      straightenSelection: () => {
        const st0 = get();
        const sel = new Set(st0.selection);
        const wires = st0.doc.wires.filter((w) => sel.has(w.id));
        if (!wires.length) {
          get().log("warn", "Keine Leitung ausgewählt – Leitungen zum Begradigen markieren");
          return;
        }
        let n = 0;
        get().commit((d) => {
          for (const w of d.wires) {
            if (!sel.has(w.id)) continue;
            // W70: Eckpunkte fallen weg, Kontaktpunkte (T-Stellen, Pins) bleiben.
            w.points = straightenWirePoints(w.points, GRID, contactKeep(d, w.id));
            n++;
          }
          // Enden wieder auf die Pins rasten (begradigen kann Pins minimal verfehlen);
          // W62: dabei auch die ausgewählten Bauteile aufs Raster holen.
          for (const inst of d.instances) {
            if (!sel.has(inst.id)) continue;
            inst.x = Math.round(inst.x / GRID) * GRID;
            inst.y = Math.round(inst.y / GRID) * GRID;
          }
          normalizeDocGeometry(d);
        });
        get().log("ok", `${n} Leitung${n > 1 ? "en" : ""} begradigt – Stützpunkte auf dem Raster, rechte Winkel`);
      },

      reannotate: () => {
        let stat = { renumbered: 0, kept: [] as string[] };
        get().commit((d) => {
          stat = reannotateLabels(d);
        });
        const keptMsg = stat.kept.length ? ` (${stat.kept.length} freie Namen behalten: ${stat.kept.slice(0, 5).join(", ")}${stat.kept.length > 5 ? "…" : ""})` : "";
        get().log("ok", stat.renumbered ? `${stat.renumbered} Referenzen neu nummeriert (Leserichtung, ab 1)${keptMsg}` : `Bereits lückenlos nummeriert${keptMsg}`);
      },

      repairWires: () => {
        // W62: „Leitungen prüfen & reparieren" bringt auch gewachsene Pläne in Form:
        // Bauteile aufs Raster, Enden auf Pins, Segmente rechtwinklig. Genau die
        // Fälle „leicht verschobenes Bauteil", „schräge Leiterbahn", „Pin am Anfang
        // nicht verbunden" verschwinden damit.
        let rep = { instances: 0, ends: 0, wires: 0 };
        get().commit((d) => {
          rep = normalizeDocGeometry(d);
        });
        get().log("ok", `Leitungen geprüft: ${rep.instances} Bauteil${rep.instances === 1 ? "" : "e"} aufs Raster gerückt, ${rep.ends} Ende${rep.ends === 1 ? "" : "n"} auf Pins gerastet, ${rep.wires} Leitung${rep.wires === 1 ? "" : "en"} begradigt`);
      },

      // Runde 17 (W32c): Messleitung auf eine Leitung/einen Pin legen. Die alte
      // Leitung des Kanals (am Pin endend) wird ersetzt („Umstecken"), die neue
      // folgt einer Z-Route: erst aus dem Symbol heraus, dann auf Höhe des Ziels.
      // Die Messung folgt automatisch – sie hängt an der Verdrahtung (nets[k]).
  };
}
