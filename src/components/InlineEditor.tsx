"use client";

import type { RefObject } from "react";

export type InlineEdit = {
  kind: "label" | "text" | "value";
  x: number;
  y: number;
  sx: number;
  sy: number;
  instId?: string;
  itemId?: string;
  initial?: string;
};

const PLACEHOLDER = { label: "z. B. IN, VCC", value: "z. B. 10k, 4,7k", text: "Notiztext …" } as const;

/** Schwebendes Eingabefeld für Netznamen, Bauteilwerte und Notizen direkt auf dem Canvas. */
export default function InlineEditor({
  editing,
  badge,
  caption,
  unit,
  viewport,
  inputRef,
  openedAt,
  onCommit,
  placeholder,
}: {
  editing: InlineEdit;
  badge: string;
  caption: string;
  unit: string;
  viewport: { w: number; h: number };
  inputRef: RefObject<HTMLInputElement | null>;
  openedAt: RefObject<number>;
  onCommit: (text: string | null) => void;
  placeholder?: string;
}) {
  const width = editing.kind === "text" ? 248 : 196;
  const vw = viewport.w > 0 ? viewport.w : 800;
  const vh = viewport.h > 0 ? viewport.h : 600;
  const left = Math.max(8, Math.min(vw - width - 12, editing.sx - 20));
  const top = Math.max(8, Math.min(vh - 70, editing.sy - 16));

  return (
    <div
      role="dialog"
      aria-label={caption}
      className="absolute z-floating flex flex-col rounded-panel border-[1.5px] border-selection bg-surface p-2 shadow-3"
      style={{ left, top, width }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5 px-0.5">
        <span className="mono rounded-control bg-selection/15 px-1.5 py-0.5 text-2xs font-bold tracking-wider text-selection uppercase">
          {badge}
        </span>
        <span className="text-2xs text-ink-3">{caption}</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-field border border-hairline-strong bg-app px-2.5 py-1">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          aria-label={caption}
          className="mono min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none"
          defaultValue={editing.initial}
          placeholder={placeholder ?? PLACEHOLDER[editing.kind]}
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
            className="mono shrink-0 rounded-control border border-hairline bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-ink-2"
            title={`Einheit: ${unit} (Präfixe k, m, u/µ, n, p, M erlaubt)`}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
