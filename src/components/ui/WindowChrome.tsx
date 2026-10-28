"use client";

import { X } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./Button";

/** S5.10: Einheitliches Fenster-Chrom — eine Quelle für Hülle + Titelleiste
 *  aller Fenster (Instrumente, Bibliothek, Dialoge). Kanon: h-9-Leiste,
 *  Icon-Kachel, Titel xs/medium, Aktionen + Close (sm) rechts. */

export const WINDOW_SHELL =
  "flex flex-col overflow-hidden rounded-window border border-hairline-strong bg-surface shadow-3";

export function WindowTitleBar({
  icon,
  title,
  hint,
  grab = false,
  onPointerDown,
  extra,
  actions,
  onClose,
  closeLabel = "Schließen",
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  grab?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  extra?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      className={cx(
        "flex h-9 shrink-0 select-none items-center gap-2 border-b border-hairline pl-3 pr-1.5",
        grab && "cursor-grab touch-none",
      )}
      title={hint}
      onPointerDown={onPointerDown}
    >
      {icon && (
        <span className="grid size-5 shrink-0 place-items-center rounded-control bg-accent/20 text-accent">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate text-xs font-medium text-ink">{title}</span>
      {extra}
      {(actions || onClose) && (
        <div
          className="flex shrink-0 items-center gap-1"
          onPointerDown={grab ? (e) => e.stopPropagation() : undefined}
        >
          {actions}
          {onClose && (
            <IconButton size="sm" aria-label={closeLabel} onClick={onClose}>
              <X size={14} />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
