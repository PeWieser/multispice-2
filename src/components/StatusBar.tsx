"use client";

import { useState } from "react";
import { Gauge, Plus, X } from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { engine, sheets, useEditor } from "@/state/editor";
import { adaptShortcut, useIsApple } from "@/lib/platform";

export default function StatusBar({ isMobile = false }: { isMobile?: boolean }) {
  const apple = useIsApple();
  const docId = useEditor((s) => s.doc.id);
  const docName = useEditor((s) => s.doc.name);
  const newDocument = useEditor((s) => s.newDocument);
  const openSheet = useEditor((s) => s.openSheet);
  const renameSheet = useEditor((s) => s.renameSheet);
  const reorderSheets = useEditor((s) => s.reorderSheets);
  const log = useEditor((s) => s.log);

  const running = useEditor((s) => s.sim.running);
  const timeScale = useEditor((s) => s.sim.timeScale);
  const setSimOption = useEditor((s) => s.setSimOption);
  const errors = useEditor((s) => s.netResult.errors.length);
  const warnings = useEditor((s) => s.netResult.warnings.length);
  const bottomOpen = useEditor((s) => s.bottomOpen);
  const bottomTab = useEditor((s) => s.bottomTab);
  const setBottomTab = useEditor((s) => s.setBottomTab);
  const toggleBottom = useEditor((s) => s.toggleBottom);
  const tick = useEditor((s) => s.sim.tick);
  const leadArmed = useEditor((s) => s.leadArmed);
  void tick;
  const simTime = running ? engine.lastState.time : 0;

  const [dragSheetId, setDragSheetId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Geöffnete Entwürfe (der aktuelle Entwurf steht immer in der Liste)
  const current = sheets.find((s) => s.id === docId) ?? { id: docId, name: docName, doc: null as never };
  const list = sheets.some((s) => s.id === docId) ? sheets : [current, ...sheets];
  const benannt = (id: string, name: string) => (id === docId ? docName || name : name);

  const toggleErcPanel = () => {
    if (bottomOpen && bottomTab === "errors") {
      toggleBottom();
    } else {
      setBottomTab("errors");
    }
  };

  return (
    <footer
      className="flex h-[30px] shrink-0 items-center gap-2 px-2.5 text-2xs text-ink-3 bg-surface border-t border-hairline"
    >
      {/* Links: Entwurf-Reiter (+ legt einen neuen Entwurf an, Klick wechselt, Ziehen sortiert um, × schließt) */}
      <div
        className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="Geöffnete Entwürfe"
      >
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors bg-surface-2 border-hairline text-ink-2"
          title="Neuer Entwurf"
          aria-label="Neuer Entwurf"
          onClick={() => newDocument()}
        >
          <Plus size={13} />
        </button>

        <div className="mx-0.5 h-4 w-px shrink-0 bg-hairline" />

        {list.map((s) => {
          const active = s.id === docId;
          const isDragged = dragSheetId === s.id;
          const isDragOver = dragOverId === s.id && dragSheetId !== s.id;
          const name = benannt(s.id, s.name);
          return (
            <div
              key={s.id}
              data-sheet-id={s.id}
              draggable
              onDragStart={(e) => {
                setDragSheetId(s.id);
                e.dataTransfer.effectAllowed = "move";
                try {
                  e.dataTransfer.setData("text/plain", s.id);
                } catch {}
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragSheetId && dragSheetId !== s.id) {
                  setDragOverId(s.id);
                  reorderSheets(dragSheetId, s.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragSheetId || e.dataTransfer.getData("text/plain");
                if (from && from !== s.id) {
                  reorderSheets(from, s.id);
                }
                setDragSheetId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => {
                setDragSheetId(null);
                setDragOverId(null);
              }}
              onTouchStart={() => {
                setDragSheetId(s.id);
              }}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (!t) return;
                const el = document.elementFromPoint(t.clientX, t.clientY)?.closest("[data-sheet-id]");
                const targetId = el?.getAttribute("data-sheet-id");
                if (targetId && targetId !== s.id) {
                  setDragOverId(targetId);
                  reorderSheets(s.id, targetId);
                }
              }}
              onTouchEnd={() => {
                setDragSheetId(null);
                setDragOverId(null);
              }}
              className="group flex h-6 shrink-0 cursor-grab active:cursor-grabbing select-none items-center gap-1 rounded-md border px-2 text-2xs transition-colors"
              style={{
                background: active ? "var(--tool-active-bg)" : "var(--surface-2)",
                borderColor: isDragOver
                  ? "var(--wire-sel)"
                  : active
                    ? "var(--tool-active-border)"
                    : "var(--hairline)",
                color: active ? "var(--tool-active-text)" : "var(--ink-2)",
                opacity: isDragged ? 0.55 : 1,
              }}
              title={`${name} (zum Verschieben ziehen)`}
            >
              <button
                type="button"
                className="max-w-[140px] truncate font-medium cursor-grab active:cursor-grabbing"
                role="tab"
                aria-selected={active}
                onClick={() => openSheet(s.id)}
              >
                {name || "Unbenannt"}
              </button>
              <button
                type="button"
                className="grid h-4 w-4 place-items-center rounded opacity-60 hover:opacity-100"
                title="Entwurf schließen"
                aria-label={`Entwurf ${name} schließen`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (sheets.length <= 1) {
                    log("warn", "Der letzte Entwurf bleibt offen – lege erst einen neuen an (＋)");
                    return;
                  }
                  const idx = sheets.findIndex((s2) => s2.id === s.id);
                  if (idx < 0) return;
                  if (s.id === docId) renameSheet(s.id, name);
                  sheets.splice(idx, 1);
                  if (active) {
                    const next = sheets[Math.min(idx, sheets.length - 1)];
                    if (next) openSheet(next.id);
                  } else {
                    useEditor.getState().bumpTick(0);
                  }
                }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Mitte: Nur sichtbar, wenn gerade eine Messleitung vom Oszi/FG in der Hand ist */}
      <span className="min-w-0 flex-1 truncate px-1" style={leadArmed ? { color: "var(--wire-sel)" } : undefined}>
        {leadArmed
          ? adaptShortcut(
              `Messleitung ${leadArmed.name ?? ""} in der Hand – Leitung oder Pin anklicken (Esc legt sie zurück)`,
              apple,
            )
          : ""}
      </span>

      {/* Rechts (W96 / W98b: feste Breiten mit tabular-nums, damit bei laufender Simulation nichts wackelt!) */}
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          className="flex min-w-[100px] shrink-0 items-center justify-center gap-1 rounded-md px-2 py-0.5 tabular-nums transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]"
          style={
            bottomOpen
              ? {
                  background: "var(--tool-active-bg)",
                  color: "var(--tool-active-text)",
                }
              : undefined
          }
          onClick={toggleErcPanel}
          title={bottomOpen ? "Auswertungs-Panel schließen" : "Prüfung & Auswertungs-Panel öffnen"}
        >
          {errors ? (
            <span style={{ color: "var(--err)" }}>✕ {errors} Fehler</span>
          ) : warnings ? (
            <span style={{ color: "var(--warn)" }}>⚠ {warnings} Hinweise</span>
          ) : (
            <span style={{ color: "var(--ok)" }}>✓ Prüfung ok</span>
          )}
        </button>

        {!isMobile && (
          <span className="hidden shrink-0 items-center gap-1.5 md:flex" title="Zeitskalierung der Live-Simulation">
            <Gauge size={12} className="shrink-0" />
            <span className="relative inline-flex items-center">
              <input
                type="range"
                className="w-20"
                min={-4}
                max={1}
                step={0.05}
                value={Math.abs(Math.log10(timeScale)) < 0.09 ? 0 : Math.log10(timeScale)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSimOption("timeScale", Math.abs(v) < 0.09 ? 1 : Math.pow(10, v));
                }}
                title="Simulationsgeschwindigkeit – rastet bei 1× ein"
              />
            </span>
            <span className="mono w-[44px] shrink-0 text-right tabular-nums">
              {timeScale === 1 ? "1×" : timeScale > 1 ? `${timeScale.toFixed(1)}×` : `1/${Math.round(1 / timeScale)}×`}
            </span>
          </span>
        )}

        <span className="mono w-[96px] shrink-0 text-right tabular-nums" title="Simulationszeit">
          {running ? `t = ${formatValue(simTime, "s")}` : "bereit"}
        </span>
      </div>
    </footer>
  );
}
