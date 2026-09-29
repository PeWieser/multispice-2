"use client";

import { useEffect, useRef, useState } from "react";
import { GeneratorCore, type StorageLike } from "@/lib/fg/core";
import type { GenState } from "@/lib/fg/types";
import { useEditor, type InstrumentWindow } from "@/state/editor";
import FunctionGenerator from "./fg2/FunctionGenerator";

/* W18: Multispice-Adapter für den FG-2500 (aufgebaut wie OsziScope).
 * - GeneratorCore pro Fenster (Speicherplätze M1–M4 im localStorage)
 * - GenState wird debounced nach params.fgstate gespiegelt (Projekt-Persistenz
 *   + Signal für die Simulation via toDevices → SourceKind "fg")
 * - Fenster-Auto-Size am Gerät (1160×545 + Chrome); das Panel skaliert nur
 *   herunter (1:1-Regel wie am Oszi) */

function parseFgState(raw: unknown): GenState | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(raw) as GenState;
    if (v && Array.isArray(v.ch) && v.ch.length === 2 && v.sys && v.ui) return v;
    return null;
  } catch {
    return null;
  }
}

export default function FgScope({ win }: { win: InstrumentWindow }) {
  // ---- Kern: einer pro Fenster, gestartet aus dem Projektzustand ----
  const [core] = useState(() => {
    const st = useEditor.getState();
    const inst = win.instanceId ? st.doc.instances.find((i) => i.id === win.instanceId) : null;
    const saved = parseFgState(inst?.params.fgstate);
    let storage: StorageLike | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* kein Storage */
    }
    const c = new GeneratorCore(storage);
    if (saved) {
      // Seed: Kern bleibt 1:1 aus der Demo, der Startzustand wird einmalig
      // ersetzt (Clone, damit nichts mit dem Dokument geteilt wird).
      (c as unknown as { state: GenState }).state = structuredClone(saved);
    }
    return c;
  });

  // ---- Persistenz: GenState → params.fgstate (debounced, undo-fähig) ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const flush = () => {
      saveTimer.current = null;
      const st = useEditor.getState();
      if (!win.instanceId) return;
      const json = JSON.stringify(core.getState());
      const inst = st.doc.instances.find((i) => i.id === win.instanceId);
      if (!inst || inst.params.fgstate === json) return;
      st.setParam(win.instanceId, "fgstate", json);
    };
    const unsub = core.subscribe(() => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 300);
    });
    return () => {
      unsub();
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [core, win.instanceId]);

  // ---- Auto-Size (W32b-Muster): Fenster klebt beim Öffnen am Gerät ----
  useEffect(() => {
    const st = useEditor.getState();
    const w = st.instruments.find((x) => x.id === win.id);
    if (!w || win.minimized) return;
    if (w.config.fgSized) return;
    const availW = typeof window !== "undefined" ? window.innerWidth : 1600;
    const availH = typeof window !== "undefined" ? window.innerHeight : 1000;
    st.updateInstrument(win.id, {
      w: Math.min(1160 + 30, availW - 40),
      h: Math.min(545 + 48, availH - 110),
      config: { ...w.config, fgSized: true },
    });
  }, [win.id, win.minimized]);

  return (
    <div
      className="flex h-full w-full items-start justify-center overflow-auto"
      style={{ background: "linear-gradient(180deg, #3a3f46 0%, #24282d 60%, #181b1f 100%)" }}
    >
      <div style={{ width: "100%", maxWidth: 1160 }}>
        <FunctionGenerator core={core} />
      </div>
    </div>
  );
}
