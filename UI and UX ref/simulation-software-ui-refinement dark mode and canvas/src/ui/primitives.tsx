import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../utils/cn";
import { Icon, type IconName } from "./icons";

/* ───────────────────────────── Hooks ───────────────────────────── */

export function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

/* ───────────────────────────── Kbd ───────────────────────────── */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-hairline-strong bg-surface px-1 font-sans text-[11px] font-medium text-ink-2 shadow-[0_1px_0_var(--hairline-strong)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Shortcut({ keys, className }: { keys: string; className?: string }) {
  // "⌘⇧Z" rendered as spaced glyphs, "Space" etc. as words
  const parts = keys.match(/⌘|⇧|⌥|⌃|⌫|⏎|⇥|↑|↓|←|→|Esc|Space|F\d+|[A-Z0-9+\-=.,]/g) ?? [keys];
  return (
    <span className={cn("inline-flex items-center gap-[2px] font-sans text-[12px] tracking-[0.04em] text-ink-3", className)}>
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </span>
  );
}

/* ───────────────────────────── Tooltip ───────────────────────────── */

type Side = "top" | "bottom" | "left" | "right";

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  delay = 450,
  children,
  disabled,
}: {
  label: ReactNode;
  shortcut?: string;
  side?: Side;
  delay?: number;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(t.current);
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(t.current), []);

  const pos: Record<Side, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className="relative inline-flex" onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide}>
      {children}
      {open && !disabled && (
        <span
          role="tooltip"
          className={cn(
            "anim-tooltip pointer-events-none absolute z-[200] flex items-center gap-2 whitespace-nowrap rounded-[7px] bg-[#2b2b2e] px-2.5 py-1.5 text-[12px] font-medium text-white shadow-2 dark:bg-[#3a3a3e]",
            pos[side],
          )}
        >
          {label}
          {shortcut && <Shortcut keys={shortcut} className="text-white/55" />}
        </span>
      )}
    </span>
  );
}

/* ───────────────────────────── Buttons ───────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "tinted";
type Size = "xs" | "sm" | "md" | "lg";

const sizeCls: Record<Size, string> = {
  xs: "h-6 px-2 text-[12px] rounded-[6px] gap-1",
  sm: "h-7 px-2.5 text-[12.5px] rounded-[7px] gap-1.5",
  md: "h-8 px-3.5 text-[13px] rounded-[8px] gap-1.5",
  lg: "h-10 px-5 text-[14px] rounded-[10px] gap-2",
};

const variantCls: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(180deg,#2b93ff_0%,#0a84ff_100%)] text-white shadow-[0_1px_2px_rgba(10,132,255,0.35),inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_0.5px_rgba(0,90,200,0.6)] hover:brightness-[1.04] active:brightness-95",
  secondary:
    "bg-surface text-ink shadow-1 hover:bg-surface-2 dark:bg-surface-3 dark:hover:bg-[#3a3a3f]",
  ghost: "text-ink hover:bg-ink/[0.06] active:bg-ink/[0.1]",
  destructive:
    "bg-[linear-gradient(180deg,#ff5f55_0%,#ff453a_100%)] text-white shadow-[0_1px_2px_rgba(255,69,58,0.35),inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_0.5px_rgba(200,40,30,0.6)] hover:brightness-[1.04]",
  tinted: "bg-accent-soft text-accent hover:bg-accent/20",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const iconSize = size === "xs" ? 13 : size === "sm" ? 14 : size === "md" ? 16 : 18;
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "press focus-ring relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em]",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        sizeCls[size],
        variantCls[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} strokeWidth={1.8} /> : null}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize - 2} strokeWidth={1.8} className="opacity-70" />}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  shortcut?: string;
  size?: Size;
  active?: boolean;
  variant?: "ghost" | "secondary";
  tooltipSide?: Side;
  iconSize?: number;
}

export function IconButton({
  icon,
  label,
  shortcut,
  size = "md",
  active,
  variant = "ghost",
  tooltipSide = "bottom",
  iconSize,
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  const dims = size === "xs" ? "h-6 w-6 rounded-[6px]" : size === "sm" ? "h-7 w-7 rounded-[7px]" : size === "md" ? "h-8 w-8 rounded-[8px]" : "h-10 w-10 rounded-[10px]";
  const isz = iconSize ?? (size === "xs" ? 14 : size === "sm" ? 16 : size === "md" ? 18 : 20);
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide} disabled={disabled}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className={cn(
          "press focus-ring inline-flex items-center justify-center text-ink-2",
          "hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:active:scale-100",
          variant === "ghost" && "hover:bg-ink/[0.06] active:bg-ink/[0.1]",
          variant === "secondary" && "bg-surface shadow-1 hover:bg-surface-2 dark:bg-surface-3",
          active && "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
          dims,
          className,
        )}
        {...rest}
      >
        <Icon name={icon} size={isz} strokeWidth={1.7} />
      </button>
    </Tooltip>
  );
}

/** A group of tool buttons in a shared capsule, like the macOS toolbar. */
export function ToolGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex h-[34px] items-center gap-[2px] rounded-[10px] border border-hairline bg-surface/70 p-[3px] shadow-[0_1px_1px_rgba(0,0,0,0.03)] dark:bg-surface-2/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  shortcut?: string;
  active?: boolean;
  tone?: "accent" | "orange";
  children?: ReactNode;
}

export function ToolButton({ icon, label, shortcut, active, tone = "accent", className, children, ...rest }: ToolButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "press focus-ring inline-flex h-[26px] min-w-[32px] items-center justify-center gap-1.5 rounded-[7px] px-1.5 text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
          active && tone === "accent" && "bg-accent text-white shadow-[0_1px_2px_rgba(10,132,255,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-accent hover:text-white",
          active && tone === "orange" && "bg-orange/15 text-orange hover:bg-orange/15 hover:text-orange",
          className,
        )}
        {...rest}
      >
        <Icon name={icon} size={17} strokeWidth={1.7} />
        {children}
      </button>
    </Tooltip>
  );
}

/* ───────────────────────────── Switch / Checkbox / Radio ───────────────────────────── */

export function Switch({
  checked,
  onChange,
  label,
  size = "md",
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const w = size === "sm" ? "h-[18px] w-[30px]" : "h-[22px] w-[38px]";
  const knob = size === "sm" ? "h-[14px] w-[14px]" : "h-[18px] w-[18px]";
  const travel = size === "sm" ? 12 : 16;
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink", disabled && "cursor-not-allowed opacity-45", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "focus-ring relative shrink-0 rounded-full p-[2px] transition-colors duration-200",
          w,
          checked ? "bg-green" : "bg-ink/[0.14] dark:bg-white/[0.18]",
        )}
      >
        <span
          className={cn("block rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.06)]", knob)}
          style={{
            transform: `translateX(${checked ? travel : 0}px)`,
            transition: "transform 260ms var(--ease-spring)",
          }}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  indeterminate?: boolean;
  disabled?: boolean;
}) {
  const on = checked || indeterminate;
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink", disabled && "cursor-not-allowed opacity-45")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? "mixed" : checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "press focus-ring flex h-4 w-4 items-center justify-center rounded-[4.5px] transition-all duration-150",
          on
            ? "bg-[linear-gradient(180deg,#2b93ff,#0a84ff)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_0_0.5px_rgba(0,90,200,0.6)]"
            : "bg-surface shadow-[inset_0_0_0_1px_var(--hairline-strong),0_1px_1px_rgba(0,0,0,0.04)] dark:bg-surface-3",
        )}
      >
        {indeterminate ? (
          <span className="h-[1.5px] w-2 rounded bg-white" />
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" className={cn("transition-all duration-150", checked ? "scale-100 opacity-100" : "scale-50 opacity-0")}>
            <path d="M1.8 5.2 4 7.4 8.4 2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  name?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label key={o.value} className="inline-flex cursor-pointer items-start gap-2 text-[13px] text-ink">
            <input type="radio" className="sr-only" name={name ?? id} checked={on} onChange={() => onChange(o.value)} />
            <span
              className={cn(
                "mt-[1px] flex h-4 w-4 items-center justify-center rounded-full transition-all duration-150",
                on
                  ? "bg-[linear-gradient(180deg,#2b93ff,#0a84ff)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_0_0.5px_rgba(0,90,200,0.6)]"
                  : "bg-surface shadow-[inset_0_0_0_1px_var(--hairline-strong)] dark:bg-surface-3",
              )}
            >
              <span className={cn("h-[6px] w-[6px] rounded-full bg-white transition-transform duration-150", on ? "scale-100" : "scale-0")} />
            </span>
            <span className="leading-4">
              {o.label}
              {o.hint && <span className="block text-[12px] text-ink-3">{o.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Segmented ───────────────────────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label?: ReactNode; icon?: IconName; title?: string }[];
  size?: "sm" | "md";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const idx = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const el = ref.current?.children[idx + 1] as HTMLElement | undefined; // +1: indicator first
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
  }, [idx, options.length]);

  return (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "relative inline-flex items-center rounded-[8px] bg-ink/[0.06] p-[2px] dark:bg-white/[0.08]",
        size === "sm" ? "h-[24px]" : "h-[28px]",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute top-[2px] bottom-[2px] rounded-[6.5px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:bg-[#5a5a60]"
        style={{
          left: ind?.x ?? 2,
          width: ind?.w ?? 0,
          opacity: ind ? 1 : 0,
          transition: "left 220ms var(--ease-out), width 220ms var(--ease-out)",
        }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "focus-ring relative z-10 inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-[6.5px] px-3 font-medium tracking-[-0.01em] transition-colors duration-150",
              size === "sm" ? "text-[12px]" : "text-[12.5px]",
              on ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.icon && <Icon name={o.icon} size={size === "sm" ? 14 : 15} strokeWidth={1.8} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Slider ───────────────────────────── */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  ticks,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ticks?: number[];
  className?: string;
  ariaLabel?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("relative h-5 w-full", className)}>
      <div className="pointer-events-none absolute top-1/2 right-[9px] left-[9px] h-[4px] -translate-y-1/2 rounded-full bg-ink/[0.12] dark:bg-white/[0.16]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {ticks?.map((t) => (
        <span
          key={t}
          className="pointer-events-none absolute top-1/2 h-[8px] w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded bg-ink/[0.18]"
          style={{ left: `calc(9px + (100% - 18px) * ${(t - min) / (max - min)})` }}
        />
      ))}
      <input
        type="range"
        aria-label={ariaLabel}
        className="slider-native focus-ring relative rounded-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ───────────────────────────── Fields ───────────────────────────── */

export function Field({ label, hint, children, inline }: { label: ReactNode; hint?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <div className={cn(inline ? "flex items-center justify-between gap-3" : "flex flex-col gap-1.5")}>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-ink-2">{label}</div>
        {hint && <div className="text-[11.5px] text-ink-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  icon?: IconName;
  suffix?: ReactNode;
  size?: "sm" | "md";
  mono?: boolean;
  onClear?: () => void;
}

export function TextField({ icon, suffix, size = "md", mono, className, onClear, value, ...rest }: TextFieldProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-[7px] bg-surface pr-1.5 pl-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--hairline-strong),0_1px_1px_rgba(0,0,0,0.03)] transition-shadow duration-150 focus-within:shadow-[0_0_0_3px_var(--accent-soft),0_0_0_1.5px_var(--accent)] dark:bg-surface-3",
        size === "sm" ? "h-7" : "h-8",
        className,
      )}
    >
      {icon && <Icon name={icon} size={14} className="shrink-0 text-ink-3" strokeWidth={1.8} />}
      <input
        value={value}
        className={cn("min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-3 selection:bg-accent/25", mono && "font-mono text-[12.5px]")}
        style={{ userSelect: "text", WebkitUserSelect: "text" }}
        {...rest}
      />
      {onClear && value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Löschen"
          className="flex h-4 w-4 items-center justify-center rounded-full bg-ink/[0.25] text-white hover:bg-ink/[0.4]"
        >
          <Icon name="close" size={9} strokeWidth={2.4} />
        </button>
      ) : null}
      {suffix && <span className="shrink-0 pr-1 text-[12px] text-ink-3">{suffix}</span>}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  format,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const parseSI = (s: string) => {
    const m = s.trim().replace(",", ".").match(/^(-?\d*\.?\d+)\s*([kKMmuµnpG]?)/);
    if (!m) return NaN;
    const mult: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, G: 1e9, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12 };
    return parseFloat(m[1]) * (mult[m[2]] ?? 1);
  };
  const commit = () => {
    if (draft !== null) {
      const n = parseSI(draft);
      if (!Number.isNaN(n)) onChange(clamp(n));
      setDraft(null);
    }
  };
  const display = draft ?? (format ? format(value) : String(value));
  return (
    <div
      className={cn(
        "inline-flex h-7 items-stretch overflow-hidden rounded-[7px] bg-surface text-[13px] shadow-[inset_0_0_0_1px_var(--hairline-strong),0_1px_1px_rgba(0,0,0,0.03)] focus-within:shadow-[0_0_0_3px_var(--accent-soft),0_0_0_1.5px_var(--accent)] dark:bg-surface-3",
        className,
      )}
    >
      <input
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onChange(clamp(value + step * (e.shiftKey ? 10 : 1)));
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            onChange(clamp(value - step * (e.shiftKey ? 10 : 1)));
          }
        }}
        className="tnum w-[64px] bg-transparent pl-2 text-right text-ink"
        style={{ userSelect: "text", WebkitUserSelect: "text" }}
      />
      {unit && <span className="flex items-center pr-1.5 pl-1 text-[12px] text-ink-3">{unit}</span>}
      <div className="my-[3px] ml-0.5 flex w-[18px] flex-col border-l border-hairline">
        <button
          type="button"
          aria-label="Erhöhen"
          onClick={() => onChange(clamp(value + step))}
          className="flex flex-1 items-center justify-center text-ink-2 hover:bg-ink/[0.06] active:bg-ink/[0.1]"
        >
          <Icon name="chevronDown" size={10} strokeWidth={2.2} className="rotate-180" />
        </button>
        <button
          type="button"
          aria-label="Verringern"
          onClick={() => onChange(clamp(value - step))}
          className="flex flex-1 items-center justify-center text-ink-2 hover:bg-ink/[0.06] active:bg-ink/[0.1]"
        >
          <Icon name="chevronDown" size={10} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Menu ───────────────────────────── */

export type MenuItem =
  | { type: "divider" }
  | { type: "header"; label: string }
  | {
      type?: "item";
      label: string;
      shortcut?: string;
      icon?: IconName;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      submenu?: MenuItem[];
      onSelect?: () => void;
      trailing?: ReactNode;
    };

export function MenuList({ items, onClose, className, style }: { items: MenuItem[]; onClose?: () => void; className?: string; style?: CSSProperties }) {
  const [sub, setSub] = useState<number | null>(null);
  const hasChecks = items.some((i) => "checked" in i && i.checked !== undefined);
  return (
    <div
      role="menu"
      className={cn(
        "anim-pop material-overlay min-w-[220px] rounded-[10px] p-[5px] shadow-menu",
        className,
      )}
      style={style}
    >
      {items.map((it, i) => {
        if (it.type === "divider") return <div key={i} className="my-[5px] h-px bg-hairline-strong/70" />;
        if (it.type === "header")
          return (
            <div key={i} className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.02em] text-ink-3 uppercase">
              {it.label}
            </div>
          );
        return (
          <div key={i} className="relative" onPointerEnter={() => setSub(it.submenu ? i : null)}>
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                if (it.submenu) return;
                it.onSelect?.();
                onClose?.();
              }}
              className={cn(
                "group flex h-[26px] w-full items-center gap-2 rounded-[6px] pr-2 text-left text-[13px] text-ink",
                hasChecks ? "pl-1.5" : "pl-2.5",
                "enabled:hover:bg-accent enabled:hover:text-white disabled:text-ink-3",
                it.danger && "text-red enabled:hover:bg-red",
                sub === i && it.submenu && "bg-accent text-white",
              )}
            >
              {hasChecks && (
                <span className="flex w-4 items-center justify-center">
                  {it.checked && <Icon name="check" size={13} strokeWidth={2.4} />}
                </span>
              )}
              {it.icon && <Icon name={it.icon} size={15} strokeWidth={1.7} className="opacity-70 group-hover:opacity-100" />}
              <span className="flex-1 truncate">{it.label}</span>
              {it.trailing}
              {it.shortcut && <Shortcut keys={it.shortcut} className="group-enabled:group-hover:text-white/70" />}
              {it.submenu && <Icon name="chevronRight" size={13} strokeWidth={2} className="opacity-60" />}
            </button>
            {it.submenu && sub === i && (
              <MenuList items={it.submenu} onClose={onClose} className="absolute top-[-5px] left-[calc(100%-2px)]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Popover / Dropdown ───────────────────────────── */

export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  side = "bottom",
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end" | "center";
  side?: "bottom" | "top";
  className?: string;
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const ref = useClickOutside<HTMLDivElement>(open, close);
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger}
      {open && (
        <div
          className={cn(
            "absolute z-[150]",
            side === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
            align === "start" && "left-0",
            align === "end" && "right-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  icon,
  label,
  menuSide = "bottom",
  align = "start",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: IconName; hint?: string }[];
  size?: "sm" | "md";
  className?: string;
  icon?: IconName;
  label?: string;
  menuSide?: "bottom" | "top";
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side={menuSide}
      align={align}
      trigger={
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "press focus-ring inline-flex items-center gap-1.5 rounded-[8px] bg-surface pr-1.5 pl-2.5 text-[13px] font-medium text-ink shadow-1 hover:bg-surface-2 dark:bg-surface-3",
            size === "sm" ? "h-7 text-[12.5px]" : "h-8",
            open && "bg-surface-2",
            className,
          )}
        >
          {icon && <Icon name={icon} size={15} className="text-ink-2" />}
          {label && <span className="text-ink-2">{label}</span>}
          <span>{cur?.label}</span>
          <span className="ml-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[linear-gradient(180deg,#2b93ff,#0a84ff)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
            <Icon name="chevronUpDown" size={11} strokeWidth={2.4} />
          </span>
        </button>
      }
    >
      <MenuList
        onClose={() => setOpen(false)}
        items={options.map((o) => ({
          label: o.label,
          icon: o.icon,
          checked: o.value === value,
          onSelect: () => onChange(o.value),
        }))}
      />
    </Popover>
  );
}

/* ───────────────────────────── Badges / Pills ───────────────────────────── */

export function Badge({
  children,
  tone = "neutral",
  dot,
  pulse,
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "orange" | "accent" | "purple";
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink/[0.06] text-ink-2",
    green: "bg-green/[0.14] text-green-deep dark:text-green",
    red: "bg-red/[0.12] text-red-deep dark:text-red",
    orange: "bg-orange/[0.14] text-[#b36b00] dark:text-orange",
    accent: "bg-accent-soft text-accent",
    purple: "bg-purple/[0.14] text-purple",
  } as const;
  const dots = { neutral: "bg-ink-3", green: "bg-green", red: "bg-red", orange: "bg-orange", accent: "bg-accent", purple: "bg-purple" } as const;
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", tones[tone], className)}>
      {dot && <span className={cn("h-[6px] w-[6px] rounded-full", dots[tone], pulse && "anim-pulse-dot")} />}
      {children}
    </span>
  );
}

export function Divider({ vertical, className }: { vertical?: boolean; className?: string }) {
  return <span aria-hidden className={cn(vertical ? "mx-1.5 h-5 w-px self-center bg-hairline-strong" : "my-2 h-px w-full bg-hairline", className)} />;
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("anim-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "green" }) {
  return (
    <div className={cn("h-[5px] w-full overflow-hidden rounded-full bg-ink/[0.08] dark:bg-white/[0.1]", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", tone === "accent" ? "bg-accent" : "bg-green")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ───────────────────────────── Disclosure ───────────────────────────── */

export function Disclosure({
  title,
  children,
  defaultOpen = true,
  trailing,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-hairline last:border-b-0">
      <div className="flex h-9 items-center gap-1 px-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring -ml-1 flex flex-1 items-center gap-1 rounded-[5px] py-1 pl-1 text-left text-[12px] font-semibold tracking-[0.01em] text-ink-2 uppercase hover:text-ink"
        >
          <Icon name="chevronRight" size={12} strokeWidth={2.2} className={cn("transition-transform duration-200", open && "rotate-90")} />
          {title}
        </button>
        {trailing}
      </div>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 px-3 pt-0.5 pb-3.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Document Tabs ───────────────────────────── */

export function DocumentTabs({
  tabs,
  active,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: { id: string; title: string; dirty?: boolean }[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex h-full items-center gap-1">
      <IconButton icon="plus" label="Neuer Schaltplan" shortcut="⌘N" size="sm" onClick={onAdd} tooltipSide="top" />
      <Divider vertical className="mx-0.5" />
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(t.id)}
            className={cn(
              "group focus-ring relative flex h-7 cursor-default items-center gap-1 rounded-[7px] pr-1 pl-2.5 text-[12.5px] transition-colors duration-150",
              on ? "bg-surface font-medium text-ink shadow-1 dark:bg-surface-3" : "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
            )}
          >
            <Icon name="doc" size={13} className={cn("mr-0.5", on ? "text-accent" : "text-ink-3")} />
            <span>{t.title}</span>
            {t.dirty && <span className="ml-0.5 h-[6px] w-[6px] rounded-full bg-ink-3" />}
            <button
              type="button"
              aria-label={`${t.title} schließen`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
              className={cn(
                "ml-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-ink-3 transition-all duration-150 hover:bg-ink/[0.08] hover:text-ink",
                on ? "opacity-70" : "opacity-0 group-hover:opacity-70",
              )}
            >
              <Icon name="close" size={11} strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Toast ───────────────────────────── */

export interface ToastData {
  id: number;
  title: string;
  message?: string;
  tone?: "neutral" | "green" | "red" | "accent";
  icon?: IconName;
}

const ToastCtx = createContext<{ push: (t: Omit<ToastData, "id">) => void } | null>(null);
export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = useCallback((t: Omit<ToastData, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 3200);
  }, []);
  const colors = { neutral: "text-ink-2", green: "text-green", red: "text-red", accent: "text-accent" } as const;
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed top-14 left-1/2 z-[300] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-slide-up material-overlay pointer-events-auto flex items-center gap-3 rounded-[12px] py-2.5 pr-4 pl-3 shadow-3"
          >
            {t.icon && <Icon name={t.icon} size={18} className={colors[t.tone ?? "neutral"]} strokeWidth={1.8} />}
            <div>
              <div className="text-[13px] font-medium text-ink">{t.title}</div>
              {t.message && <div className="text-[12px] text-ink-2">{t.message}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────────────────────────── Window chrome (floating instrument panel) ───────────────────────────── */

export function FloatingWindow({
  title,
  subtitle,
  onClose,
  children,
  style,
  className,
  toolbar,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  toolbar?: ReactNode;
}) {
  return (
    <div
      className={cn("anim-slide-up absolute z-[120] flex flex-col overflow-hidden rounded-[14px] bg-surface shadow-3 ring-1 ring-black/[0.06] dark:ring-white/[0.08]", className)}
      style={style}
    >
      <div className="material flex h-[38px] shrink-0 items-center gap-2 border-b border-hairline px-3">
        <div className="group flex items-center gap-[7px]">
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] text-black/60 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.15)]"
          >
            <Icon name="close" size={8} strokeWidth={2.6} className="opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.15)]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.15)]" />
        </div>
        <div className="flex flex-1 items-baseline justify-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
          {subtitle && <span className="text-[12px] text-ink-3">{subtitle}</span>}
        </div>
        <div className="flex w-[52px] justify-end">{toolbar}</div>
      </div>
      {children}
    </div>
  );
}
