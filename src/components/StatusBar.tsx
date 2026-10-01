"use client";

import { Gauge } from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor, useHud } from "@/state/editor";
import { adaptShortcut, useIsApple } from "@/lib/platform";

export default function StatusBar({ isMobile = false }: { isMobile?: boolean }) {
  const apple = useIsApple();
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
  const lastSavedAt = useEditor((s) => s.lastSavedAt);
  const savePending = useEditor((s) => s.savePending);
  const tick = useEditor((s) => s.sim.tick);
  const leadArmed = useEditor((s) => s.leadArmed);
  void tick;
  const simTime = running ? engine.lastState.time : 0;

  if (isMobile) {
    return (
      <footer
        className="flex h-[32px] shrink-0 items-center gap-2 px-3 text-[11px] text-mute"
        style={{ background: "var(--panel-solid)", borderTop: "1px solid var(--border)" }}
      >
        <span className="mono">{Math.round(zoom * 100)} %</span>
        {/* W72: Der Hinweistext ist der Dateileiste gewichen (SheetTabs).
            Nur noch Hinweise, die vor einem Fehler warnen, bleiben stehen. */}
        {leadArmed && (
          <span className="min-w-0 flex-1 truncate text-[10px]" style={{ color: "var(--accent)" }}>
            Messleitung {leadArmed.name ?? ""} in der Hand – Leitung oder Pin antippen (Esc legt sie zurück)
          </span>
        )}
        <span className="mono text-[10px]">{running ? formatValue(simTime, "s") : "bereit"}</span>
        <span title={savePending ? "Auto-Save schreibt in ≤ 2 s" : "Gespeichert (Auto-Save)"} style={{ color: savePending ? "var(--warn)" : lastSavedAt ? "var(--ok)" : "var(--text-mute)" }}>
          {savePending ? "●" : lastSavedAt ? "✓" : "○"}
        </span>
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
          {adaptShortcut(`${selection.length} ausgewählt`, apple)}
        </span>
      )}
      {/* W72: Die untere Leiste trug den langen Bedienhinweis („Tooltips") – der
          ist der Dateileiste gewichen. Was bleibt, sind die Elemente rechts
          (Prüfung, Zeitskalierung, Koordinaten, Zoom, Zeit, Auto-Save) und der
          dringende Hinweis zur Messleitung. */}
      <span className="min-w-0 flex-1 truncate" style={leadArmed ? { color: "var(--accent)" } : undefined}>
        {leadArmed
          ? adaptShortcut(`Messleitung ${leadArmed.name ?? ""} in der Hand – klicke im Schaltplan auf eine Leitung oder einen Pin · Esc legt sie zurück`, apple)
          : ""}
      </span>

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
        <span className="relative inline-flex items-center">
          <input
            type="range"
            className="w-20"
            min={-4}
            max={1}
            step={0.05}
            value={Math.abs(Math.log10(timeScale)) < 0.09 ? 0 : Math.log10(timeScale)}
            onChange={(e) => {
              // W9: Rastpunkt bei 1× – Normalgeschwindigkeit muss spürbar einrasten.
              const v = Number(e.target.value);
              // W28: breiterer Rastpunkt – 1× muss spürbar einrasten
              setSimOption("timeScale", Math.abs(v) < 0.09 ? 1 : Math.pow(10, v));
            }}
            title="Simulationsgeschwindigkeit – rastet bei 1× ein"
          />
        </span>
        <span className="mono w-12">{timeScale === 1 ? "1×" : timeScale > 1 ? `${timeScale.toFixed(1)}×` : `1/${Math.round(1 / timeScale)}×`}</span>
      </span>

      <span className="mono hidden shrink-0 sm:inline">x {Math.round(cursor.x)} · y {Math.round(cursor.y)}</span>
      <button className="mono shrink-0 rounded px-1.5 py-0.5 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" onClick={fitView} title="Einpassen (F)">
        {Math.round(zoom * 100)} %
      </button>
      <span className="mono hidden w-[92px] shrink-0 text-right lg:inline" title="Simulationszeit">
        {running ? `t = ${formatValue(simTime, "s")}` : "bereit"}
      </span>
      <span
        className="mono hidden shrink-0 items-center gap-1 sm:flex"
        title={
          savePending
            ? "Änderung ausstehend – Auto-Save schreibt in ≤ 2 s"
            : lastSavedAt
              ? `Zuletzt gespeichert um ${new Date(lastSavedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} (Auto-Save oder ${adaptShortcut("⌘S", apple)})`
              : "Auto-Save aktiv – schreibt 2 s nach jeder Änderung"
        }
      >
        {savePending ? (
          <span style={{ color: "var(--warn)" }}>●</span>
        ) : lastSavedAt ? (
          <span style={{ color: "var(--ok)" }}>✓</span>
        ) : (
          <span className="text-mute">○</span>
        )}
        <span className="text-mute">
          {savePending
            ? "speichert …"
            : lastSavedAt
              ? new Date(lastSavedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
              : "Auto-Save"}
        </span>
      </span>
    </footer>
  );
}
