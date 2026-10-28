



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine } from "../shared";
import { switchControlTargets } from "@/lib/interactive/switches";
export function createParamsSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setParam" | "setControlLive" | "setInstanceText" | "updateLabel" | "updateNote"> {
  return {
      setParam: (instanceId, key, value) => {
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
        if (key !== "__label") {
          delete engine.controls[instanceId];
          for (const k of Object.keys(engine.controls)) {
            if (k.startsWith(instanceId + "_")) delete engine.controls[k];
          }
        }
        if (get().sim.running) engine.rebuild(get().doc);
      },

      setControlLive: (instanceId, key, value) => {
        let partId = "";
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (inst) {
            inst.params[key] = value;
            partId = inst.partId;
          }
        });
        // S5.26: Mehrgeräte-Bauteile fächern auf (SPDT→NO+NC, Dreh→alle Abgriffe,
        // DIP→Einzelhebel) — sonst liefe der Inspektor bei laufender Sim ins Leere.
        const targets = switchControlTargets(partId, instanceId, key, Number(value));
        if (targets) for (const [id, v] of Object.entries(targets)) engine.setControl(id, v);
        else engine.setControl(instanceId, Number(value));
      },

      setInstanceText: (instanceId, text) => {
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (inst) inst.text = text;
        });
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
