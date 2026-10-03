"use client";

import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

/** Frostige Kapsel, die zusammengehörige Werkzeuge gruppiert. */
export function ToolGroup({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cx("capsule flex items-center gap-0.5 rounded-panel p-[3px]", className)}>
      {children}
    </div>
  );
}

/** Werkzeug in einer Kapsel: 16px-Icon, gefüllter Tint wenn aktiv, Kürzel im Tooltip. */
export function ToolButton({
  active,
  onClick,
  icon,
  label,
  hint,
  kbd,
  showLabel,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  kbd?: string;
  showLabel?: boolean;
}) {
  return (
    <Tooltip content={hint ? `${label}\n${hint}` : label} shortcut={kbd} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        aria-keyshortcuts={kbd}
        onClick={onClick}
        className={cx(
          "pressable ring-focus inline-flex h-7 min-w-8 select-none items-center justify-center gap-1.5 rounded-[8px] px-2 text-xs font-medium [&_svg]:size-4",
          active
            ? "bg-accent-soft text-accent shadow-[inset_0_0_0_0.5px_var(--accent-mid)]"
            : "text-ink-2 hover:bg-surface-3 hover:text-ink",
        )}
      >
        {icon}
        {showLabel && <span className="hidden sm:inline">{label}</span>}
      </button>
    </Tooltip>
  );
}
