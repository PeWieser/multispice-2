"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { cx } from "./cx";

export function Menu({
  label,
  open,
  instant,
  onOpenChange,
  onHoverOpen,
  onNavigate,
  children,
}: {
  label: string;
  open: boolean;
  /** Kein Einblenden beim Wechsel zwischen offenen Menüs (gegen Flackern). */
  instant?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Menüleiste-Modus: wenn IRGENDEIN Menü offen ist, öffnet Hover dieses sofort (nativ). */
  onHoverOpen?: () => void;
  /** Pfeiltasten wandern zwischen Menü-Headers. */
  onNavigate?: (dir: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={cx(
          "pressable ring-focus h-7 min-w-10 rounded-control px-2.5 text-sm font-medium text-ink",
          open ? "bg-surface-3" : "hover:bg-surface-3",
        )}
        onClick={() => onOpenChange(!open)}
        onMouseEnter={() => onHoverOpen?.()}
        onKeyDown={(e) => {
          if (onNavigate && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            onNavigate(e.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cx(
            "absolute left-0 top-[calc(100%+6px)] z-popover w-max min-w-[232px] rounded-panel bg-overlay p-1 shadow-3 backdrop-blur-xl backdrop-saturate-150",
            !instant && "rise",
          )}
          onClick={() => onOpenChange(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  hint,
  checked,
  danger,
  disabled,
  disabledReason,
  tooltip,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  hint?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  tooltip?: string;
}) {
  const apple = useIsApple();
  const hintText = hint ? adaptShortcut(hint, apple) : undefined;
  const tooltipText = tooltip ? adaptShortcut(tooltip, apple) : undefined;
  const childrenText = typeof children === "string" ? adaptShortcut(children, apple) : children;
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      className={cx(
        "group/item relative flex h-7 w-full items-center justify-between gap-6 whitespace-nowrap rounded-control px-2 text-left text-sm outline-none",
        "hover:bg-accent hover:text-accent-ink focus-visible:bg-accent focus-visible:text-accent-ink",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        danger ? "text-err" : "text-ink disabled:hover:text-ink",
      )}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid w-4 shrink-0 place-items-center">{checked ? <Check size={13} /> : null}</span>
        <span>{childrenText}</span>
      </span>
      {hintText && <span className="mono shrink-0 text-2xs text-ink-3 group-hover/item:text-current group-hover/item:opacity-75">{hintText}</span>}
      {tooltipText && (
        <span className="pointer-events-none absolute left-full top-1/2 z-popover ml-2 hidden max-w-[300px] -translate-y-1/2 whitespace-pre-wrap rounded-[7px] bg-ink px-2.5 py-1.5 text-xs leading-snug text-surface shadow-2 group-hover/item:block">
          {tooltipText}
        </span>
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-2 my-1 h-px bg-hairline" />;
}
