"use client";

import { useRef, useState } from "react";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { cx } from "./cx";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  const apple = useIsApple();
  const text = typeof children === "string" ? adaptShortcut(children, apple) : children;
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-surface-3 px-1 font-sans text-2xs font-medium leading-none text-ink-2 shadow-[inset_0_0_0_0.5px_var(--hairline-strong)]",
        className,
      )}
    >
      {text}
    </kbd>
  );
}

const SIDE = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
} as const;

/** Verzögerter Tooltip mit optionalem Tastenkürzel. Ersetzt `title` als einzige Beschriftung. */
export function Tooltip({
  content,
  shortcut,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  shortcut?: string;
  children: React.ReactNode;
  side?: keyof typeof SIDE;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const apple = useIsApple();
  const text = typeof content === "string" ? adaptShortcut(content, apple) : content;
  const schedule = (v: boolean, ms: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(v), ms);
  };
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => schedule(true, 400)}
      onMouseLeave={() => schedule(false, 80)}
      onFocus={() => schedule(true, 400)}
      onBlur={() => schedule(false, 0)}
      onMouseDown={() => schedule(false, 0)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cx(
            "fade-in pointer-events-none absolute z-toast flex max-w-[280px] items-center gap-2 whitespace-pre-wrap rounded-[7px] bg-ink px-2 py-[5px] text-xs font-medium leading-snug text-surface shadow-2",
            SIDE[side],
          )}
        >
          <span>{text}</span>
          {shortcut && <span className="shrink-0 font-normal opacity-60">{adaptShortcut(shortcut, apple)}</span>}
        </span>
      )}
    </span>
  );
}
