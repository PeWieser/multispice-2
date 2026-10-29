



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine } from "../shared";
import { switchControlTargets } from "@/lib/interactive/switches";
import { controlKeyOf } from "@/lib/sim/controls";
export function createParamsSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setParam" | "setControlLive" | "setInstanceText" | "updateLabel" | "updateNote"> {
  return {
      setParam: (instanceId, key, value) => {
        // Okt-28: Altes Label merken — Umbenennen zieht den Steuer-Schlüssel um.
        const before = get().doc.instances.find((i) => i.id === instanceId);
        const oldBase = before ? controlKeyOf(before) : instanceId;
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (!inst) return;
          if (key === "__label") inst.label = String(value);
          else inst.params[key] = value;
        });
        // S5.14: editierter Param ist Wahrheit — stale Live-Control verwerfen
        // (sonst würde z. B. ein alter Schalter-Klick params.closed überschatten).
        // S5.26: Mehrgeräte-Bauteile (SPDT/DPST/DPDT/Dreh/DIP, Relais-Spule)
        // legen abgeleitete Geräte-IDs `<id>_<suffix>` an — die müssen mit weg,
        // sonst überschatten sie die frisch editierten Params beim nächsten Lauf.
        // Okt-28: Schlüssel sind Geräte-IDs (Label); Instanz-ID nur als Legacy.
        const dropKeys = (base: string) => {
          delete engine.controls[base];
          for (const k of Object.keys(engine.controls)) {
            if (k.startsWith(base + "_")) delete engine.controls[k];
          }
        };
        if (key === "__label") {
          // Umbenennen: alte Label-Schlüssel aufräumen (neue entstehen bei Bedarf).
          dropKeys(oldBase);
        } else {
          const after = get().doc.instances.find((i) => i.id === instanceId);
          if (after) dropKeys(controlKeyOf(after));
          dropKeys(instanceId);
        }
        if (get().sim.running) engine.rebuild(get().doc);
      },

      setControlLive: (instanceId, key, value) => {
        let partId = "";
        let base = instanceId;
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (inst) {
            inst.params[key] = value;
            partId = inst.partId;
            base = controlKeyOf(inst);
          }
        });
        // S5.26: Mehrgeräte-Bauteile fächern auf (SPDT→NO+NC, Dreh→alle Abgriffe,
        // DIP→Einzelhebel) — sonst liefe der Inspektor bei laufender Sim ins Leere.
        // Okt-28: Ziele sind Geräte-IDs (Label), wie der Solver sie liest.
        const targets = switchControlTargets(partId, base, key, Number(value));
        if (targets) for (const [id, v] of Object.entries(targets)) engine.setControl(id, v);
        else engine.setControl(base, Number(value));
      },

      setInstanceText: (instanceId, text) => {
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (inst) inst.text = text;
        });
        // Okt-28: MCU-State ist per Geräte-ID (Label) geschlüsselt (engine.ts).
        const inst = get().doc.instances.find((i) => i.id === instanceId);
        const base = inst ? controlKeyOf(inst) : instanceId;
        engine.sim?.mcuStates.delete(base);
        engine.sim?.mcuPrograms.delete(base);
        engine.sim?.mcuStates.delete(instanceId);
        engine.sim?.mcuPrograms.delete(instanceId);
        if (get().sim.running) engine.rebuild(get().doc);
      },

      updateLabel: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        get().commit((d) => {
          const lbl = d.labels.find((l) => l.id === id);
          if (lbl) lbl.name = trimmed;
        });
        if (get().sim.running) engine.rebuild(get().doc);
      },

      updateNote: (id, text, size) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        get().commit((d) => {
          const note = d.notes.find((n) => n.id === id);
          if (note) {
            note.text = trimmed;
            // S5.23: Schriftstufe reist mit dem Text (ein Undo-Schritt).
            if (size !== undefined) note.size = size;
          }
        });
      },
  };
}
