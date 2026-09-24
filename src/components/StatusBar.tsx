"use client";

import { Gauge } from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor, useHud } from "@/state/editor";

function hintFor(tool: string, placing: boolean, running: boolean): string {
  if (placing) return "Klick platziert das Bauteil · Shift für Serie · Esc bricht ab";
  switch (tool) {
    case "wire":
      return "Klick setzt Punkte · Doppelklick beendet · Esc bricht ab";
    case "label":
      return "Klick auf eine Leitung setzt den Netznamen";
    case "probe":
      return "Klick auf ein Netz setzt eine Live-Sonde";
    case "text":
      return "Klick setzt eine Notiz";
    case "erase":
      return "Klick löscht Bauteil oder Leitung";
    case "pan":
      return "Ziehen verschiebt die Ansicht · Rad zoomt";
    default:
      if (running) return "Live: Schalter klicken · Poti mit Klick / Shift+Klick stellen";
      return "Ziehen wählt aus · Rad zoomt · Leertaste startet die Simulation";
  }
}

export default function StatusBar() {
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placingPartId);
  const running = useEditor((s) => s.sim.running);
  const timeScale = useEditor((s) => s.sim.timeScale);
  const setSimOption = useEditor((s) => s.setSimOption);
  const zoom = useEditor((s) => s.view.zoom);
  const fitView = useEditor((s) => s.fitView);
  const errors = useEditor((s) => s.netResult.errors.length);
  const warnings = useEditor((s) => s.netResult.warnings.length);
  const setBottomTab = useEditor((s) => s.setBottomTab);
  const cursor = useHud((s) => s.cursor);
  const tick = useEditor((s) => s.sim.tick);
  void tick;
  const simTime = running ? engine.lastState.time : 0;

  return (
    <footer
      className="flex h-[26px] shrink-0 items-center gap-3 px-3 text-[11px] text-mute"
      style={{ background: "var(--panel)", borderTop: "1px solid var(--border)" }}
    >
      <span className="min-w-0 flex-1 truncate">{hintFor(tool, !!placing, running)}</span>

      <button
        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
        onClick={() => setBottomTab("errors")}
        title="Prüfung öffnen"
      >
        {errors ? (
          <span style={{ color: "var(--err)" }}>✕ {errors} Fehler</span>
        ) : warnings ? (
          <span style={{ color: "var(--warn)" }}>⚠ {warnings} Hinweise</span>
        ) : (
          <span style={{ color: "var(--ok)" }}>✓ Prüfung ok</span>
        )}
      </button>

      <span className="hidden shrink-0 items-center gap-1.5 md:flex" title="Zeitskalierung der Live-Simulation">
        <Gauge size={12} />
        <input
          type="range"
          className="w-20"
          min={-4}
          max={1}
          step={0.05}
          value={Math.log10(timeScale)}
          onChange={(e) => setSimOption("timeScale", Math.pow(10, Number(e.target.value)))}
        />
        <span className="mono w-12">{timeScale >= 1 ? `${timeScale.toFixed(1)}×` : `1/${Math.round(1 / timeScale)}×`}</span>
      </span>

      <span className="mono hidden shrink-0 sm:inline">x {Math.round(cursor.x)} · y {Math.round(cursor.y)}</span>
      <button className="mono shrink-0 rounded px-1.5 py-0.5 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" onClick={fitView} title="Einpassen (F)">
        {Math.round(zoom * 100)} %
      </button>
      <span className="mono hidden w-[92px] shrink-0 text-right lg:inline" title="Simulationszeit">
        {running ? `t = ${formatValue(simTime, "s")}` : "bereit"}
      </span>
    </footer>
  );
}
