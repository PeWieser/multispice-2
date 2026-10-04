



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine } from "../shared";export function createParamsSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setParam" | "setInstanceText" | "updateLabel" | "updateNote"> {
  return {
      setParam: (instanceId, key, value) => {
        get().commit((d) => {
          const inst = d.instances.find((i) => i.id === instanceId);
          if (!inst) return;
          if (key === "__label") inst.label = String(value);
          else inst.params[key] = value;
        });
        if (get().sim.running) engine.rebuild(get().doc);
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

      updateNote: (id, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        get().commit((d) => {
          const note = d.notes.find((n) => n.id === id);
          if (note) note.text = trimmed;
        });
      },
  };
}
