"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeneratorCore, type StorageLike } from "@/lib/fg/core";
import type { GenState } from "@/lib/fg/types";
import { useEditor, type InstrumentWindow } from "@/state/editor";
import { click } from "./oszi2/sound";
import { uiPlug, uiUnplug } from "./fg2/audio";
import { DeviceFit, useReportNatural } from "./DeviceFit";
import { BENCH_PAD } from "@/lib/windows/geometry";
import { LeadBanner } from "./LeadBanner";
import { setDocParamSynced, setLeadArmedSynced } from "@/lib/desktopSync";
import FunctionGenerator, { type JackState } from "./fg2/FunctionGenerator";

/* W18: Multispice-Adapter für den FG-2500 (aufgebaut wie OsziScope).
 * - GeneratorCore pro Fenster (Speicherplätze M1–M4 im localStorage)
 * - GenState wird debounced nach params.fgstate gespiegelt (Projekt-Persistenz
 *   + Signal für die Simulation via toDevices → SourceKind "fg")
 * - Fenster-Auto-Size am Gerät (Bühne 1160×545 + Chrome); das Panel skaliert nur
 *   herunter (1:1-Regel wie am Oszi)
 * - Runde 19 (W35/W36): Fenster misst sich über DeviceFit exakt am Gerät, und die
 *   Ausgangsbuchsen OUT1/OUT2 nehmen per Klick eine Messleitung auf – genau wie
 *   die Kanäle am Oszi (Kabel in der Hand → Klick auf Leitung/Pin im Schaltplan). */

/** Runde 20 (W38): Bühnenmaße des FG-2500 als Startwert für den Fenster-Fit. */
const FG_STAGE_SIZE = { w: 1160, h: 545 };

/** Pin-Indizes des FG-Symbols: OUT1, OUT2, COM, SYNC (catalog.ts). */
const JACK_PIN: Record<"out1" | "out2", number> = { out1: 0, out2: 1 };
const JACK_COLOR: Record<"out1" | "out2", string> = { out1: "#e35b64", out2: "#4b90da" };

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

  // ---- Runde 19/20 (W35/W38/W40): Fenster klebt beim Öffnen exakt am Gerät ----
  const reportNatural = useReportNatural();

  // ---- Runde 19 (W36): Messleitung an OUT1/OUT2 (wie Oszi CH1–CH4) ----
  const instId = win.instanceId;
  const netResult = useEditor((s) => s.netResult);
  const lead = useEditor((s) => s.leadArmed);
  const jackNets = useMemo(() => {
    const netOf = (pin: number) => {
      if (!instId) return "";
      const n = netResult.pinNets[`${instId}:${pin}`] ?? "";
      return n === `${instId}_nc${pin}` ? "" : n;
    };
    return { out1: netOf(JACK_PIN.out1), out2: netOf(JACK_PIN.out2) };
  }, [instId, netResult.pinNets]);
  const heldJack: "out1" | "out2" | null =
    lead && lead.instanceId === instId && (lead.pinIndex === 0 || lead.pinIndex === 1)
      ? lead.pinIndex === 0
        ? "out1"
        : "out2"
      : null;

  const jackNetsRef = useRef(jackNets);
  useEffect(() => {
    jackNetsRef.current = jackNets;
  }, [jackNets]);

  const onPickJack = useCallback(
    (jack: "out1" | "out2") => {
      const st = useEditor.getState();
      if (!win.instanceId) return;
      const cur = st.leadArmed;
      const beep = core.getState().sys.beep;
      const plugged = (jackNetsRef.current[jack] ?? "") !== "";
      if (cur && cur.instanceId === win.instanceId && cur.pinIndex === JACK_PIN[jack]) {
        setLeadArmedSynced(null); // Kabel zurück auf die Buchse
        if (beep) click("plug");
        return;
      }
      // W48: Original-Steckgeräusche des FG-2500 – abziehen (Buchse belegt)
      // bzw. aufstecken (Buchse frei).
      if (beep) {
        if (plugged) uiUnplug();
        else uiPlug();
      }
      setLeadArmedSynced({
        instanceId: win.instanceId,
        pinIndex: JACK_PIN[jack],
        name: jack.toUpperCase(),
        color: JACK_COLOR[jack],
      });
    },
    [core, win.instanceId],
  );

  const jacks: JackState = useMemo(
    () => ({ held: heldJack, nets: jackNets, onPick: onPickJack }),
    [heldJack, jackNets, onPickJack],
  );

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
      setDocParamSynced(win.instanceId, "fgstate", json);
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

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      // Runde 21 (W44): eigener Labor-Untergrund wie vor Runde 20 – sichtbar nur
      // dort, wo neben dem heruntergerechneten Gerät Platz bleibt (die FG-Bühne
      // hat konstruktiv ~30 px Gummischutz-Rand).
      style={{ background: "linear-gradient(180deg, #3a3f46 0%, #24282d 60%, #181b1f 100%)" }}
    >
      {heldJack && (
        <LeadBanner
          color={JACK_COLOR[heldJack]}
          title={`Kabel an ${heldJack.toUpperCase()} in der Hand –`}
          hint="klicke im Schaltplan auf eine Leitung oder einen Pin (die Messleitung wird hingelegt) oder zurück auf die Buchse."
          onCancel={() => setLeadArmedSynced(null)}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: BENCH_PAD }}>
        <DeviceFit natural={FG_STAGE_SIZE} onMeasure={reportNatural} allowUpscale>
          <div>
            <FunctionGenerator core={core} jacks={jacks} autoScale={false} />
          </div>
        </DeviceFit>
      </div>
    </div>
  );
}
