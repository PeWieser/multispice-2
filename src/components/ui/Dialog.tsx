"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Fokus bleibt im Container, Esc schließt, beim Schließen kehrt der Fokus zurück. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, onClose: () => void, initial = "input, select") {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>(initial) ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [ref, initial]);
}

/** Gemeinsame Hülle für alle Modals: Scrim, Radius, Schatten, Fokusfalle. */
export function ModalShell({
  label,
  onClose,
  children,
  className,
  maxWidth = 440,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, onClose);
  return (
    <div
      className="fade-in fixed inset-0 z-modal grid place-items-center bg-scrim p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cx("rise flex max-h-[86vh] w-full flex-col overflow-hidden rounded-window bg-surface shadow-3 outline-none", className)}
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-hairline pl-4 pr-2">
      <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
      <div className="flex items-center gap-1">
        {children}
        <IconButton aria-label="Schließen (Esc)" onClick={onClose}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}

export function Dialog({
  title,
  subtitle,
  onClose,
  actions,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <ModalShell label={title} onClose={onClose} maxWidth={wide ? 560 : 440}>
      <DialogHeader title={title} onClose={onClose} />
      {subtitle && <p className="shrink-0 px-4 pt-3 text-xs text-ink-3">{subtitle}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">{children}</div>
      {actions && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">{actions}</div>}
    </ModalShell>
  );
}
