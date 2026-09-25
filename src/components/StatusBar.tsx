"use client";

import { Gauge } from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor, useHud } from "@/state/editor";

function hintFor(tool: string, placing: boolean, running: boolean): string {
  if (placing) return "Klick platziert das Bauteil · Shift für Serie · Esc bricht ab";
  if (tool.startsWith("probe")) {
    const kind = tool.split("_")[1] || "probe";
    return `Messpunkt ${kind} – Klick auf Leitung platzieren · Rechtsklick für Menü · Esc bricht ab`;
  }
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
      if (running) return "Live: Schalter klicken · Poti mit Klick / Shift+Klick · Rechtsklick für Messpunkt";
      return "Ziehen wählt aus · Rad zoomt · Leertaste startet Simulation · Rechtsklick Messpunkt · ⌘K Bibliothek";
  }
}

export default function StatusBar({ isMobile = false }: { isMobile?: boolean }) {
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placingPartId);
  const running = useEditor((s) => s.sim.running);
  const selection = useEditor((s) => s.selection);
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

  if (isMobile) {
    return (
      <footer
        className="flex h-[32px] shrink-0 items-center gap-2 px-3 text-[11px] text-mute"
        style={{ background: "var(--panel-solid)", borderTop: "1px solid var(--border)" }}
      >
        <span className="mono">{Math.round(zoom * 100)} %</span>
        <span className="flex-1 truncate text-[10px]">{hintFor(tool, !!placing, running)}</span>
        <span className="mono text-[10px]">{running ? formatValue(simTime, "s") : "bereit"}</span>
      </footer>
    );
  }

  return (
    <footer
      className="flex h-[26px] shrink-0 items-center gap-3 px-3 text-[11px] text-mute"
      style={{ background: "var(--panel)", borderTop: "1px solid var(--border)" }}
    >
      {selection.length > 0 && (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-mid)" }}>
          {selection.length} ausgewählt • R drehen • Entf löschen • ⌘D duplizieren
        </span>
      )}
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
