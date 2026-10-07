

/** S2.1: laufende Analyse (Worker-Task) — Modul-Scope, kein Render-State. */
let activeTask: import("@/lib/sim/analysis_client").AnalysisTask | null = null;
let fallbackNoted = false;



import { AnalysisAbortedError, runAnalysisTask } from "@/lib/sim/analysis_client";
import type { EditorState } from "../types";
import type { StoreApi } from "zustand";export function createAnalysisSlice(set: StoreApi<EditorState>["setState"], get: StoreApi<EditorState>["getState"]): Pick<EditorState, "setAnalysis" | "runAnalysis" | "cancelAnalysis"> {
  return {
      setAnalysis: (a) => set((s) => ({ analysis: { ...s.analysis, ...a } })),

      runAnalysis: async (kind, payload = {}) => {
        if (get().partEditor.open) { get().log("warn", "Keine Analyse im Bauteile-Editor."); return; }
        // S2.1: Eine Analyse zur Zeit — die alte wird sauber abgebrochen,
        // damit kein verwaister Worker einen stale Report setzt.
        activeTask?.cancel();
        activeTask = null;
        const { doc } = get();
        set({ analysis: { kind, running: true, progress: 0, meta: { ...(payload as Record<string, unknown>) } } });
        get().log("info", `Analyse »${kind}« gestartet …`);
        const task = runAnalysisTask(doc, kind, payload, (frac) => {
          if (get().analysis.running) set((s) => ({ analysis: { ...s.analysis, progress: frac } }));
        });
        activeTask = task;
        if (!task.worker && !fallbackNoted) {
          fallbackNoted = true;
          get().log("warn", "Analyse-Worker nicht verfügbar — Analyse läuft auf dem Main-Thread (UI kann kurz stocken).");
        }
        try {
          const report = await task.promise;
          if (activeTask !== task) return; // abgebrochen und ersetzt
          activeTask = null;
          const res = report.result as { ok?: boolean; message?: string };
          if (res && res.ok === false) {
            // S2.2: Kernel-Fehlschlag → gestaltete Fehlerkarte statt leerer Diagramme.
            set((s) => ({
              analysis: {
                kind,
                running: false,
                error: res.message ?? "Analyse fehlgeschlagen",
                data: report.result,
                durationMs: report.durationMs,
                meta: s.analysis.meta,
                convergence: report.convergence,
                suspects: report.suspects,
              },
            }));
            get().log("error", `Analyse »${kind}«: ${res.message ?? "fehlgeschlagen"}`);
          } else {
            set((s) => ({ analysis: { kind, running: false, data: report.result, durationMs: report.durationMs, meta: s.analysis.meta } }));
            get().log("ok", `Analyse »${kind}« beendet in ${report.durationMs} ms`);
          }
          for (const w of report.warnings) get().log("warn", w);
          for (const e of report.errors) get().log("error", e);
        } catch (e) {
          if (activeTask !== task) return;
          activeTask = null;
          if (e instanceof AnalysisAbortedError) {
            set((s) => ({ analysis: { kind, running: false, meta: s.analysis.meta } }));
            get().log("warn", `Analyse »${kind}« abgebrochen`);
          } else {
            set({ analysis: { kind, running: false, error: (e as Error).message } });
            get().log("error", `Analyse »${kind}«: ${(e as Error).message}`);
          }
        }
      },

      cancelAnalysis: () => {
        activeTask?.cancel();
        activeTask = null;
      },
  };
}
