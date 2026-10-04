



import type { EditorState } from "../types";
import type { StoreApi } from "zustand";
import { engine } from "../shared";export function createSimSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "startSim" | "pauseSim" | "stopSim" | "setSimOption" | "bumpTick"> {
  return {
      startSim: () => {
        const { doc, sim } = get();
        engine.options.sampleRate = sim.sampleRate;
        engine.options.timeScale = sim.timeScale;
        engine.options.method = sim.method;
        engine.options.temperature = sim.temperature;
        engine.rebuild(doc);
        engine.running = true;
        set((s) => ({ sim: { ...s.sim, running: true } }));
        const st = engine.lastState;
        if (!st.ok) {
          get().log("error", `Arbeitspunkt: ${st.message ?? "keine Konvergenz"}`);
          // S2.2: schlimmsten Verdächtigen direkt markieren (nur Netz-Verdacht ist zeigbar).
          const netSuspect = (st.suspects ?? []).find((s) => !s.startsWith("I("));
          if (netSuspect) get().spotlightNet(netSuspect);
          else if (st.suspects?.length) get().log("warn", `Verdächtig: ${st.suspects.join(", ")}`);
        } else get().log("ok", `Simulation gestartet — ${engine.netlist.devices.length} Bauteile, ${engine.netNames().length} Knoten`);
        for (const w of engine.warnings) get().log("warn", w);
        for (const e of engine.errors) get().log("error", e);
      },

      pauseSim: () => {
        engine.running = false;
        set((s) => ({ sim: { ...s.sim, running: false } }));
        get().log("info", "Simulation pausiert");
      },

      stopSim: () => {
        engine.running = false;
        engine.reset(get().doc);
        engine.running = false;
        set((s) => ({ sim: { ...s.sim, running: false, tick: s.sim.tick + 1 } }));
        get().log("info", "Simulation gestoppt und zurückgesetzt");
      },

      setSimOption: (k, v) => {
        set((s) => ({ sim: { ...s.sim, [k]: v } }));
        const sim = get().sim;
        engine.options.sampleRate = sim.sampleRate;
        engine.options.timeScale = sim.timeScale;
        engine.options.method = sim.method;
        engine.options.temperature = sim.temperature;
        if ((k === "method" || k === "temperature" || k === "sampleRate") && sim.running) engine.rebuild(get().doc);
      },

      bumpTick: (fps) => set((s) => ({ sim: { ...s.sim, tick: s.sim.tick + 1, fps } })),
  };
}
