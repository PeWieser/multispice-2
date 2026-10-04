



import { PART_MAP } from "@/lib/library/catalog";
import { Rotation, instanceBounds, pinPosition, pointOnSegment } from "@/lib/schematic/model";
import { cleanOrphanJunctions } from "@/lib/schematic/netdraw";
import { orthoFollow } from "@/lib/schematic/ortho";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { collectPins, reattachWiresToPins } from "../docUtils";export function createEditSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "deleteSelection" | "rotateSelection" | "mirrorSelection" | "moveSelection"> {
  return {
      deleteSelection: () => {
        const sel = new Set(get().selection);
        if (!sel.size) return;
        const removedProbeNets = new Set(
          get().doc.probes.filter((pr) => sel.has(pr.id) && pr.net).map((pr) => pr.net as string),
        );
        get().commit((d) => {
          d.instances = d.instances.filter((i) => !sel.has(i.id));
          d.wires = d.wires.filter((w) => !sel.has(w.id));
          d.labels = d.labels.filter((l) => !sel.has(l.id));
          d.notes = d.notes.filter((n) => !sel.has(n.id));
          d.probes = d.probes.filter((pr) => !sel.has(pr.id));
          cleanOrphanJunctions(d);
        });
        const remainingProbeNets = new Set(
          get().doc.probes.map((pr) => pr.net).filter(Boolean) as string[],
        );
        // W29: an gelöschte Instanzen gebundene Gerätefenster (Oszi/FG) schließen.
        set((s) => ({
          selection: [],
          probes: s.probes.filter((n) => !removedProbeNets.has(n) || remainingProbeNets.has(n)),
          instruments: s.instruments.filter((w) => !(w.instanceId && sel.has(w.instanceId))),
          // Runde 19: hängt eine Messleitung an der gelöschten Instanz, fällt sie mit weg.
          leadArmed: s.leadArmed && sel.has(s.leadArmed.instanceId) ? null : s.leadArmed,
        }));
      },

      rotateSelection: (dir = 1) => {
        const st0 = get();
        // W75: Wenn ein Bauteil zur Platzierung an der Maus hängt, dreht R die Vorschau!
        if (st0.tool === "place" && st0.placingPartId) {
          set({ placingRot: ((((st0.placingRot + dir * 90) % 360) + 360) % 360) as Rotation });
          return;
        }
        const sel = new Set(st0.selection);
        if (!sel.size) return;
        // W52: Pin-Positionen vor dem Drehen festhalten (siehe reattachWiresToPins).
        const before = collectPins(st0.doc, sel);
        const skipWires = new Set(st0.doc.wires.filter((w) => sel.has(w.id)).map((w) => w.id));
        let moved = 0;
        get().commit((d) => {
          for (const i of d.instances) {
            if (sel.has(i.id)) i.rot = (((i.rot + dir * 90) % 360) + 360) % 360 as Rotation;
          }
          moved = reattachWiresToPins(d, before, skipWires);
        });
        if (moved) get().log("info", `${moved} Leitungsende${moved > 1 ? "n" : ""} beim Drehen mitgeführt`);
      },

      mirrorSelection: () => {
        const st0 = get();
        // W75: Wenn ein Bauteil zur Platzierung an der Maus hängt, spiegelt M die Vorschau!
        if (st0.tool === "place" && st0.placingPartId) {
          set({ placingMirror: !st0.placingMirror });
          return;
        }
        const sel = new Set(st0.selection);
        if (!sel.size) return;
        const before = collectPins(st0.doc, sel);
        const skipWires = new Set(st0.doc.wires.filter((w) => sel.has(w.id)).map((w) => w.id));
        let moved = 0;
        get().commit((d) => {
          for (const i of d.instances) if (sel.has(i.id)) i.mirror = !i.mirror;
          moved = reattachWiresToPins(d, before, skipWires);
        });
        if (moved) get().log("info", `${moved} Leitungsende${moved > 1 ? "n" : ""} beim Spiegeln mitgeführt`);
      },

      moveSelection: (dx, dy) => {
        if (dx === 0 && dy === 0) return;
        const st0 = get();
        const sel = new Set(st0.selection);
        // W2: Gummiband – Leitungsendpunkte (und Probes/Labels), die auf einem Pin der
        // bewegten Bauteile sitzen, wandern mit. Netze bleiben verbunden.
        const movedPins: Array<{ x: number; y: number }> = [];
        for (const inst of st0.doc.instances) {
          if (!sel.has(inst.id)) continue;
          const part = PART_MAP[inst.partId];
          if (!part) continue;
          for (let idx = 0; idx < part.pins.length; idx++) {
            const p = pinPosition(inst, idx);
            movedPins.push({ x: p.x, y: p.y });
          }
        }
        const onMovedPin = (p: { x: number; y: number }) =>
          movedPins.some((mp) => Math.abs(mp.x - p.x) <= 2 && Math.abs(mp.y - p.y) <= 2);
        // W26: BBoxen nicht bewegter Bauteile (mit Luft) = Hindernisse für die Knickwahl
        const obstacles: Array<{ x: number; y: number; w: number; h: number }> = [];
        for (const inst of st0.doc.instances) {
          if (sel.has(inst.id)) continue;
          const b = instanceBounds(inst);
          obstacles.push({ x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 });
        }
        get().commit((d) => {
          for (const i of d.instances) if (sel.has(i.id)) {
            i.x += dx;
            i.y += dy;
          }

          // W80: Alte Segmente komplett verschobener Leitungen merken, damit T-Abzweige
          // (und deren Verbindungspunkte) auf diesen Leitungen mitwandern.
          const wholeMovedWireIds = new Set<string>();
          const wholeMovedSegs: Array<[number, number, number, number]> = [];
          for (const w of d.wires) {
            if (w.points.length < 2) continue;
            const first = w.points[0];
            const last = w.points[w.points.length - 1];
            if (sel.has(w.id) || (movedPins.length > 0 && onMovedPin(first) && onMovedPin(last))) {
              wholeMovedWireIds.add(w.id);
              for (let k = 0; k + 1 < w.points.length; k++) {
                wholeMovedSegs.push([w.points[k].x, w.points[k].y, w.points[k + 1].x, w.points[k + 1].y]);
              }
            }
          }
          const onMovedWireSeg = (p: { x: number; y: number }) =>
            wholeMovedSegs.some(([ax, ay, bx, by]) => pointOnSegment(p.x, p.y, ax, ay, bx, by));

          for (const w of d.wires) {
            if (wholeMovedWireIds.has(w.id)) {
              w.points = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
              continue;
            }
            if (w.points.length < 2) continue;
            const first = w.points[0];
            const last = w.points[w.points.length - 1];
            const fHit = onMovedPin(first) || onMovedWireSeg(first);
            const lHit = onMovedPin(last) || onMovedWireSeg(last);
            if (fHit && lHit) {
              w.points = w.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            } else if (fHit || lHit) {
              const pts = w.points.map((p) => ({ x: p.x, y: p.y }));
              const idx = fHit ? 0 : pts.length - 1;
              pts[idx] = { x: pts[idx].x + dx, y: pts[idx].y + dy };
              orthoFollow(pts, idx, obstacles);
              w.points = pts;
            }
          }
          if (d.junctions?.length && wholeMovedSegs.length) {
            for (const j of d.junctions) {
              if (onMovedWireSeg(j)) {
                j.x += dx;
                j.y += dy;
              }
            }
          }
          for (const l of d.labels) {
            if (sel.has(l.id) || onMovedPin(l) || onMovedWireSeg(l)) {
              l.x += dx;
              l.y += dy;
            }
          }
          for (const n of d.notes) if (sel.has(n.id)) {
            n.x += dx;
            n.y += dy;
          }
          for (const pr of d.probes) {
            const ax = typeof pr.anchorX === "number" ? pr.anchorX : pr.x;
            const ay = typeof pr.anchorY === "number" ? pr.anchorY : pr.y;
            const anchorOnMoved = onMovedPin({ x: ax, y: ay }) || onMovedWireSeg({ x: ax, y: ay });
            if (anchorOnMoved) {
              // W87: Wandert das Bauteil oder die Leitung unter der Messspitze mit,
              // folgt die gesamte Probe (Spitze + Anzeigekästchen).
              pr.x += dx;
              pr.y += dy;
              if (typeof pr.anchorX === "number") pr.anchorX += dx;
              if (typeof pr.anchorY === "number") pr.anchorY += dy;
            } else if (sel.has(pr.id)) {
              // W87: Zieht der Nutzer das Anzeigekästchen der Probe selbst, bleibt
              // die Messspitze (anchorX/anchorY) wie in NI Multisim fest auf ihrer
              // Leitung verankert und nur das Kästchen (x/y) wandert!
              pr.x += dx;
              pr.y += dy;
              if (typeof pr.anchorX === "number") pr.offsetX = pr.x - pr.anchorX;
              if (typeof pr.anchorY === "number") pr.offsetY = pr.y - pr.anchorY;
            }
          }
        });
      },
  };
}
