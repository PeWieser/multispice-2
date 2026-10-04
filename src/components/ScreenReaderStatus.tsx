"use client";

import { useEffect, useRef } from "react";
import { engine, useEditor } from "@/state/editor";
import { completionNote, simLiveText } from "@/lib/a11y";

/**
 * S5.4: Unsichtbare Live-Region für den Sim-Status (läuft/fertig/fehler).
 * Die Schaltungs-Zusammenfassung hängt als aria-label an der Zeichenfläche
 * (Canvas.tsx) — sie wird beim Fokussieren vorgelesen, nicht bei jeder Änderung.
 */
export default function ScreenReaderStatus() {
  const running = useEditor((s) => s.sim.running);
  // Re-Rendern bei Sim-Übergängen (stopSim bumpt tick), damit engine.lastState
  // zum richtigen Zeitpunkt gelesen wird.
  useEditor((s) => s.sim.tick);
  const analysis = useEditor((s) => s.analysis);
  const prevAnalysisRunning = useRef(analysis.running);

  const live = engine.lastState;
  let text = simLiveText({
    running,
    liveOk: live.ok,
    liveMessage: live.message,
    analysisKind: analysis.kind,
    analysisRunning: analysis.running,
    analysisError: analysis.error,
  });
  const note = completionNote(prevAnalysisRunning.current, analysis.running, analysis.error, analysis.kind);
  if (note) text = `${note}. ${text}`;
  useEffect(() => {
    prevAnalysisRunning.current = analysis.running;
  });

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}
