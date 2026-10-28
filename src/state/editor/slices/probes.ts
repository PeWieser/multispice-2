



import { GRID, instanceBounds, pinPosition } from "@/lib/schematic/model";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine, newId } from "../shared";
import { resolveNearestNetPoint, inferWireAngleAt } from "../docUtils";export function createProbesSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "connectProbeWire" | "setLeadArmed" | "addMeasurementProbe" | "updateMeasurementProbe" | "removeMeasurementProbe"> {
  return {
      connectProbeWire: (instanceId, pinIndex, target) => {
        const leadName = get().leadArmed?.instanceId === instanceId && get().leadArmed?.pinIndex === pinIndex ? get().leadArmed?.name : undefined;
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (!inst) return;
          const pinPt = pinPosition(inst, pinIndex);
          if (Math.abs(target.x - pinPt.x) < 1 && Math.abs(target.y - pinPt.y) < 1) return; // sich selbst
          const atPin = (p: { x: number; y: number }) => Math.abs(p.x - pinPt.x) < 0.6 && Math.abs(p.y - pinPt.y) < 0.6;
          d.wires = d.wires.filter((w) => !w.points.length || (!atPin(w.points[0]) && !atPin(w.points[w.points.length - 1])));
          const dx = Math.sign(pinPt.x - inst.x);
          const dy = Math.sign(pinPt.y - inst.y);
          const dir =
            Math.abs(pinPt.x - inst.x) >= Math.abs(pinPt.y - inst.y)
              ? { x: dx || -1, y: 0 }
              : { x: 0, y: dy || 1 };
          const out = { x: pinPt.x + dir.x * 20, y: pinPt.y + dir.y * 20 };
          // Runde 19 (W36): Die Leitung darf das Gerätesymbol nicht überqueren –
          // wenn der direkte Weg durch das Symbol liefe, führt sie außen herum.
          const box = instanceBounds(inst);
          const crossesBody = (a: { x: number; y: number }, c: { x: number; y: number }) => {
            const x1 = Math.min(a.x, c.x);
            const x2 = Math.max(a.x, c.x);
            const y1 = Math.min(a.y, c.y);
            const y2 = Math.max(a.y, c.y);
            return x2 > box.x && x1 < box.x + box.w && y2 > box.y && y1 < box.y + box.h;
          };
          const mid = dir.x !== 0 ? { x: out.x, y: target.y } : { x: target.x, y: out.y };
          const detour =
            crossesBody(out, mid) || crossesBody(mid, target)
              ? dir.x !== 0
                ? [
                    { x: out.x, y: out.y <= box.y + box.h / 2 ? box.y - 20 : box.y + box.h + 20 },
                    { x: target.x, y: out.y <= box.y + box.h / 2 ? box.y - 20 : box.y + box.h + 20 },
                  ]
                : [
                    { x: out.x <= box.x + box.w / 2 ? box.x - 20 : box.x + box.w + 20, y: out.y },
                    { x: out.x <= box.x + box.w / 2 ? box.x - 20 : box.x + box.w + 20, y: target.y },
                  ]
              : [mid];
          const pts: Array<{ x: number; y: number }> = [];
          for (const p of [pinPt, out, ...detour, target]) {
            const last = pts[pts.length - 1];
            if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) pts.push(p);
          }
          if (pts.length >= 2) d.wires.push({ id: newId("w"), points: pts });
        });
        if (get().sim.running) engine.rebuild(get().doc);
        get().log("info", `Messleitung ${leadName ?? `CH${pinIndex + 1}`} verbunden`);
      },

      setLeadArmed: (a) => set({ leadArmed: a }),

      addMeasurementProbe: (kind, x, y) => {
        if (get().partEditor.open) return null; // S6.2: keine Sonden im Bauteil.
        const id = newId("pr");
        const defaults: Record<string, any> = {
          voltage: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
          current: { show: { idc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
          voltage_current: { show: { vdc: true, idc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
          power: { show: { power: true, vdc: true, idc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
          diff: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
          ref: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, name: "" },
          digital: { show: { vdc: true }, periodic: false, direction: 0, rotation: 0, thresholds: { low: 0.8, high: 2.0 }, name: "" },
        };
        const def = defaults[kind] ?? defaults.voltage;
        // W81/W85: auto-assign net from current netResult (inkl. Leitungssegment-Fußpunkt!)
        const snapG = (v: number) => Math.round(v / GRID) * GRID;
        let autoNet: string | undefined;
        let anchorX = snapG(x);
        let anchorY = snapG(y);
        try {
          const hit = resolveNearestNetPoint(get().doc, get().netResult, x, y, 30);
          if (hit) {
            autoNet = hit.net;
            anchorX = snapG(hit.x);
            anchorY = snapG(hit.y);
          }
        } catch {}
        // W85/W93: Anzeigekästchen-Offset exakt auf dem GRID=10-Raster (+40, -40)
        const offsetX = 40;
        const offsetY = -40;
        const autoRot = inferWireAngleAt(get().doc, anchorX, anchorY);
        const probe = {
          id,
          kind,
          x: anchorX + offsetX,
          y: anchorY + offsetY,
          anchorX,
          anchorY,
          offsetX,
          offsetY,
          leader: "arrow" as const,
          net: autoNet,
          ref: "0",
          ...def,
          rotation: autoRot,
        } as import("@/lib/schematic/model").MeasurementProbe;
        if (!probe.name) probe.name = `${kind.charAt(0).toUpperCase()}${get().doc.probes.filter(p=>p.kind===kind).length+1}`;
        get().commit((d) => {
          d.probes.push(probe);
        });
        // auto-add to legacy probes for grapher
        if (autoNet && autoNet!=="0" && !get().probes.includes(autoNet)) {
          set((s)=> ({ probes: [...s.probes, autoNet].slice(-12) }));
        }
        set({ selection: [id], bottomTab: "probes" as any });
        get().log("ok", `Messpunkt ${probe.name} @ ${autoNet ?? "auto"}`);
        return id;
      },

      updateMeasurementProbe: (id, patch) => {
        get().commit((d) => {
          const pr = d.probes.find((p) => p.id === id);
          if (!pr) return;
          Object.assign(pr, patch);
          // W81/W87: Wenn der Anker verschoben wurde, automatisch auf das neue Netz
          // (oder undefined, falls kein Netz in Reichweite ist) aktualisieren.
          if ((patch.anchorX !== undefined || patch.anchorY !== undefined) && !("net" in patch)) {
            const ax = pr.anchorX ?? pr.x;
            const ay = pr.anchorY ?? pr.y;
            const hit = resolveNearestNetPoint(d, get().netResult, ax, ay, 24);
            pr.net = hit ? hit.net : undefined;
            if (!("rotation" in patch)) {
              pr.rotation = inferWireAngleAt(d, ax, ay);
            }
          }
        });
        // Auto-add to legacy probes for grapher (Transient/AC)
        const pr = get().doc.probes.find((p) => p.id === id);
        if (pr && (pr as any).net) {
          const net = (pr as any).net as string;
          if (net && net!=="0" && !get().probes.includes(net)) {
            set((s) => ({ probes: [...s.probes, net].slice(-12) }));
          }
        }
        if (patch.kind) {
          get().log("info", `Probe ${id.slice(0,6)} Typ → ${patch.kind}`);
        }
      },

      removeMeasurementProbe: (id) => {
        const target = get().doc.probes.find((p) => p.id === id);
        const removedNet = target?.net;
        get().commit((d) => {
          d.probes = d.probes.filter((p) => p.id !== id);
        });
        const stillUsed = removedNet
          ? get().doc.probes.some((p) => p.net === removedNet)
          : false;
        set((s) => ({
          selection: s.selection.filter((sid) => sid !== id),
          probes: removedNet && !stillUsed ? s.probes.filter((n) => n !== removedNet) : s.probes,
        }));
      },
  };
}
