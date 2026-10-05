"use client";

import type { RefObject } from "react";
import { formatValue, parseValue } from "@/lib/format";
import { loadESeries } from "@/lib/settings";
import { stepEValue, stepPercent } from "@/lib/values/series";

export type InlineEdit = {
  kind: "label" | "value"; // S5.22: Notizen haben einen eigenen Direkteditor
  x: number;
  y: number;
  sx: number;
  sy: number;
  instId?: string;
  itemId?: string;
  initial?: string;
};

const PLACEHOLDER = { label: "z. B. IN, VCC", value: "z. B. 10k, 4,7k" } as const;

/** Schwebendes Eingabefeld für Netznamen, Bauteilwerte und Notizen direkt auf dem Canvas. */
export default function InlineEditor({
  editing,
  caption,
  unit,
  viewport,
  inputRef,
  openedAt,
  onCommit,
  placeholder,
  wheelMode,
}: {
  editing: InlineEdit;
  caption: string;
  unit: string;
  viewport: { w: number; h: number };
  inputRef: RefObject<HTMLInputElement | null>;
  openedAt: RefObject<number>;
  onCommit: (text: string | null) => void;
  placeholder?: string;
  /** S5.24: Rad-Schritte im Wertefeld (E-Reihe nur beim Widerstand). */
  wheelMode?: "e-series" | "percent";
}) {
  // S5.22: Ein Rahmen (statt Panel + Chip + Box), Breite folgt dem Inhalt —
  // kein 5-cm-Feld für vier Ziffern. Einheit dezent, ohne Chip.
  const ph = placeholder ?? PLACEHOLDER[editing.kind];
  const len = Math.max(editing.initial?.length ?? 0, editing.initial ? 0 : ph.length);
  const ch = Math.max(8, Math.min(26, len + 2)) + (unit ? 3 : 0);
  const vw = viewport.w > 0 ? viewport.w : 800;
  const vh = viewport.h > 0 ? viewport.h : 600;
  const left = Math.max(8, Math.min(vw - 120, editing.sx - 20));
  const top = Math.max(8, Math.min(vh - 60, editing.sy - 16));

  return (
    <div
      role="dialog"
      aria-label={caption}
      className="absolute z-floating rounded-field border-[1.5px] border-selection bg-surface px-2.5 py-1.5 shadow-3"
      style={{ left, top, width: `${ch}ch`, minWidth: 96, maxWidth: 320 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          aria-label={caption}
          className="mono min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none"
          defaultValue={editing.initial}
          placeholder={ph}
          onWheel={
            wheelMode
              ? (e) => {
                  const input = e.target as HTMLInputElement;
                  const base = parseValue(input.value);
                  if (!Number.isFinite(base)) return;
                  const dir = e.deltaY < 0 ? 1 : -1;
                  const next =
                    wheelMode === "e-series"
                      ? stepEValue(base, loadESeries(), dir)
                      : stepPercent(base, dir, e.shiftKey ? 0.01 : 0.05);
                  input.value = formatValue(next, "");
                }
              : undefined
          }
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value);
            else if (e.key === "Escape") onCommit(null);
          }}
          onBlur={(e) => {
            // W91: Schutz gegen sofortiges onBlur durch das Loslassen der Maustaste
            // unmittelbar nach dem Öffnen des Eingabefelds.
            if (performance.now() - openedAt.current < 280) {
              e.target.focus();
              return;
            }
            onCommit(e.target.value);
          }}
        />
        {unit && (
          <span
            className="mono shrink-0 text-2xs text-ink-3"
            title={`Einheit: ${unit} (Präfixe k, m, u/µ, n, p, M erlaubt)`}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
