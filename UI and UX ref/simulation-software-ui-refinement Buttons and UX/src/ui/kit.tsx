import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, Minus } from "lucide-react";

/* ============================== helpers ============================== */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-sans text-[10.5px] font-medium leading-none",
        className
      )}
      style={{ background: "var(--kbd-bg)", color: "var(--ink-2)", boxShadow: "inset 0 0 0 0.5px var(--hair-strong)" }}
    >
      {children}
    </kbd>
  );
}

/* ============================== Tooltip ============================== */

export function Tip({
  label,
  shortcut,
  side = "bottom",
  children,
  delay = 450,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  delay?: number;
}) {
  const pos =
    side === "bottom"
      ? "left-1/2 top-[calc(100%+8px)] -translate-x-1/2"
      : side === "top"
      ? "left-1/2 bottom-[calc(100%+8px)] -translate-x-1/2"
      : side === "left"
      ? "right-[calc(100%+8px)] top-1/2 -translate-y-1/2"
      : "left-[calc(100%+8px)] top-1/2 -translate-y-1/2";
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        className={cx(
          "pointer-events-none absolute z-[90] flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 py-[5px] text-[11.5px] font-medium opacity-0 shadow-lg transition-all duration-150 group-hover/tip:opacity-100",
          pos
        )}
        style={{ transitionDelay: `0ms, 0ms, ${delay}ms`, background: "rgba(28,28,32,0.92)", color: "#f5f5f7", backdropFilter: "blur(8px)" }}
      >
        {label}
        {shortcut && (
          <span className="text-[10.5px] font-normal text-white/60">{shortcut}</span>
        )}
      </span>
    </span>
  );
}

/* ============================== Buttons ============================== */

type BtnVariant = "primary" | "secondary" | "tertiary" | "ghost" | "destructive" | "destructive-secondary";
type BtnSize = "sm" | "md" | "lg";

export function Btn({
  variant = "secondary",
  size = "md",
  icon,
  trailing,
  children,
  className,
  disabled,
  loading,
  ...rest
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "loading">) {
  const sizes: Record<BtnSize, string> = {
    sm: "h-[26px] gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium",
    md: "h-[30px] gap-1.5 rounded-[8px] px-3 text-[12.5px] font-medium",
    lg: "h-[36px] gap-2 rounded-[10px] px-4 text-[13.5px] font-semibold",
  };
  const sizeCls = sizes[size];

  const styles: Record<BtnVariant, string> = {
    primary: "btn-primary text-white",
    secondary: "btn-secondary",
    tertiary: "hover:bg-black/[0.05] dark:hover:bg-white/[0.08]",
    ghost: "hover:bg-black/[0.05] dark:hover:bg-white/[0.08]",
    destructive: "text-white",
    "destructive-secondary": "btn-secondary",
  };

  return (
    <button
      disabled={disabled || loading}
      className={cx(
        "pressable ring-focus inline-flex select-none items-center justify-center whitespace-nowrap",
        sizeCls,
        styles[variant],
        variant === "secondary" && "text-[var(--ink-1)]",
        variant === "tertiary" && "text-[var(--accent-ink)]",
        variant === "ghost" && "text-[var(--ink-2)]",
        variant === "destructive-secondary" && "text-[var(--danger)]",
        (disabled || loading) && "cursor-not-allowed opacity-45 saturate-50",
        className
      )}
      style={
        variant === "destructive"
          ? {
              background: "linear-gradient(180deg,#ff5147 0%,#e60012 100%)",
              boxShadow:
                "inset 0 0.5px 0 rgba(255,255,255,.35), inset 0 -.5px 0 rgba(0,0,0,.12), 0 1px 2px rgba(230,0,18,.4)",
              textShadow: "0 .5px 1px rgba(0,0,0,.2)",
            }
          : undefined
      }
      {...rest}
    >
      {loading ? (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        icon && <span className="inline-flex [&>svg]:h-[15px] [&>svg]:w-[15px]">{icon}</span>
      )}
      {children}
      {trailing && <span className="inline-flex opacity-70 [&>svg]:h-3.5 [&>svg]:w-3.5">{trailing}</span>}
    </button>
  );
}

/* Toolbar / icon button with refined states */
export function IconBtn({
  active,
  accent,
  size = 30,
  className,
  style,
  ...rest
}: {
  active?: boolean;
  accent?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: number }) {
  return (
    <button
      className={cx(
        "pressable ring-focus relative inline-flex select-none items-center justify-center rounded-[8px]",
        !active && "hover:bg-black/[0.055] dark:hover:bg-white/[0.09]",
        className
      )}
      style={{
        width: size,
        height: size,
        color: active ? (accent ? "#fff" : "var(--accent-ink)") : "var(--ink-2)",
        background: active
          ? accent
            ? "linear-gradient(180deg,#ffa41c,#f08a00)"
            : "color-mix(in srgb, var(--accent) 13%, transparent)"
          : undefined,
        boxShadow: active
          ? accent
            ? "inset 0 0 0 .5px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.35), 0 1px 3px rgba(240,138,0,.4)"
            : "inset 0 0 0 .5px color-mix(in srgb, var(--accent) 30%, transparent)"
          : undefined,
        ...style,
      }}
      {...rest}
    />
  );
}

/* ============================== Segmented control ============================== */

export function Seg<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: Array<{ value: T; label?: React.ReactNode; icon?: React.ReactNode; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  useLayoutEffect(() => {
    const el = refs.current[idx];
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
  }, [idx, options.length]);

  useEffect(() => {
    const onR = () => {
      const el = refs.current[idx];
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [idx]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        "relative inline-flex select-none items-center rounded-[9px] p-[2.5px]",
        size === "sm" ? "h-[26px]" : "h-[30px]",
        className
      )}
      style={{ background: "rgba(120,120,128,0.18)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}
    >
      <span
        className="seg-thumb absolute top-[2.5px] h-[calc(100%-5px)] rounded-[7px]"
        style={{
          transform: `translateX(${thumb.x}px)`,
          width: thumb.w,
          background: "var(--panel)",
          boxShadow: "0 0 0 .5px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.14), 0 1px 2px rgba(0,0,0,.1)",
        }}
      />
      {options.map((o, i) => {
        const sel = o.value === value;
        const content = (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(o.value)}
            className={cx(
              "pressable ring-focus relative z-10 flex h-full items-center justify-center gap-1.5 rounded-[7px] font-medium",
              size === "sm" ? "px-2.5 text-[11.5px]" : "px-3 text-[12.5px]"
            )}
            style={{ color: sel ? "var(--ink-1)" : "var(--ink-3)", minWidth: size === "sm" ? 0 : 44 }}
          >
            {o.icon && <span className="[&>svg]:h-[14px] [&>svg]:w-[14px]">{o.icon}</span>}
            {o.label}
          </button>
        );
        return o.title ? (
          <Tip key={o.value} label={o.title}>
            {content}
          </Tip>
        ) : (
          <React.Fragment key={o.value}>{content}</React.Fragment>
        );
      })}
    </div>
  );
}

/* ============================== Toggle / Checkbox / Radio ============================== */

export function Toggle({
  checked,
  onChange,
  size = "md",
  color,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  size?: "sm" | "md";
  color?: string;
  disabled?: boolean;
  label?: string;
}) {
  const dims = size === "sm" ? { w: 36, h: 21, k: 17 } : { w: 46, h: 27, k: 22 };
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "pressable ring-focus relative shrink-0 rounded-full",
        disabled && "cursor-not-allowed opacity-40"
      )}
      style={{
        width: dims.w,
        height: dims.h,
        background: checked ? color ?? "#34c759" : "rgba(120,120,128,0.32)",
        boxShadow: checked
          ? "inset 0 0 0 .5px rgba(0,0,0,.08), 0 1px 4px rgba(52,199,89,.4)"
          : "inset 0 1px 3px rgba(0,0,0,.16), inset 0 0 0 .5px rgba(0,0,0,.06)",
        transition: "background-color .22s",
      }}
    >
      <span
        className="toggle-knob absolute top-1/2 block rounded-full"
        style={{
          width: dims.k,
          height: dims.k,
          left: 2.5,
          marginTop: -dims.k / 2,
          transform: `translateX(${checked ? dims.w - dims.k - 5 : 0}px)`,
          background: "radial-gradient(circle at 50% 28%, #fff 0%, #f5f5f7 60%, #e8e8ec 100%)",
          boxShadow: "0 0 0 .5px rgba(0,0,0,.12), 0 2px 5px rgba(0,0,0,.25), 0 1px 1px rgba(0,0,0,.15)",
        }}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  label,
}: {
  checked?: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const on = !!checked || !!indeterminate;
  return (
    <button
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("pressable ring-focus inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px]", disabled && "cursor-not-allowed opacity-40")}
      style={{
        background: on ? "linear-gradient(180deg,#1f86ff,#0063d1)" : "var(--panel)",
        boxShadow: on
          ? "inset 0 0 0 .5px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(0,113,227,.4)"
          : "inset 0 0 0 1px rgba(120,120,128,.45), 0 .5px 1px rgba(0,0,0,.08)",
      }}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3 text-white" strokeWidth={3.2} />
      ) : (
        checked && <Check className="draw-check h-3 w-3 text-white" strokeWidth={3.4} />
      )}
    </button>
  );
}

export function Radio({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cx("pressable ring-focus inline-flex h-[18px] w-[18px] items-center justify-center rounded-full", disabled && "cursor-not-allowed opacity-40")}
      style={{
        background: checked ? "linear-gradient(180deg,#1f86ff,#0063d1)" : "var(--panel)",
        boxShadow: checked
          ? "inset 0 0 0 .5px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.3), 0 1px 2px rgba(0,113,227,.4)"
          : "inset 0 0 0 1px rgba(120,120,128,.45), 0 .5px 1px rgba(0,0,0,.08)",
      }}
    >
      <span
        className="block rounded-full bg-white"
        style={{
          width: checked ? 6 : 0,
          height: checked ? 6 : 0,
          transition: "width .18s cubic-bezier(.3,1.5,.5,1), height .18s cubic-bezier(.3,1.5,.5,1)",
          boxShadow: "0 .5px 1px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}

/* ============================== Slider / Stepper / Progress ============================== */

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="select-none">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>{label}</span>
        <span className="tabular rounded-[6px] px-1.5 py-0.5 font-mono text-[11.5px] font-medium" style={{ background: "var(--inset)", color: "var(--ink-1)" }}>
          {format ? format(value) : `${value}${unit ?? ""}`}
        </span>
      </div>
      <input
        type="range"
        className="slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ["--fill" as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min,
  max,
  format,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  size?: "sm" | "md";
}) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const btn = size === "sm" ? "h-[22px] w-[26px]" : "h-[26px] w-[30px]";
  return (
    <div
      className="inline-flex select-none items-stretch overflow-hidden rounded-[8px]"
      style={{ background: "var(--panel)", boxShadow: "inset 0 0 0 .5px var(--hair-strong), 0 .5px 1px rgba(0,0,0,.05)" }}
    >
      <button
        aria-label="Verringern"
        className="pressable ring-focus flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        style={{ color: "var(--ink-1)" }}
        onClick={() => onChange(clamp(Number((value - step).toFixed(4))))}
      >
        <span className={cx("flex items-center justify-center text-[15px] font-medium leading-none", btn)}>−</span>
      </button>
      <span
        className={cx("tabular flex items-center justify-center font-mono font-medium", size === "sm" ? "min-w-[52px] px-1 text-[11.5px]" : "min-w-[64px] px-2 text-[12.5px]")}
        style={{ color: "var(--ink-1)", borderLeft: "1px solid var(--hair)", borderRight: "1px solid var(--hair)" }}
      >
        {format ? format(value) : value}
      </span>
      <button
        aria-label="Erhöhen"
        className="pressable ring-focus flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        style={{ color: "var(--ink-1)" }}
        onClick={() => onChange(clamp(Number((value + step).toFixed(4))))}
      >
        <span className={cx("flex items-center justify-center text-[15px] font-medium leading-none", btn)}>+</span>
      </button>
    </div>
  );
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "green" | "orange" }) {
  const bg = tone === "green" ? "#30d158" : tone === "orange" ? "#ff9f0a" : "var(--accent)";
  return (
    <div className={cx("h-[5px] w-full overflow-hidden rounded-full", className)} style={{ background: "rgba(120,120,128,.22)" }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: bg, transition: "width .3s cubic-bezier(.2,.8,.3,1)" }}
      />
    </div>
  );
}

export function Ring({ value, size = 40, stroke = 4.5, tone = "accent", children }: { value: number; size?: number; stroke?: number; tone?: "accent" | "green" | "orange"; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const bg = tone === "green" ? "#30d158" : tone === "orange" ? "#ff9f0a" : "var(--accent)";
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,120,128,.22)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={bg}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, value))) / 100}
          style={{ transition: "stroke-dashoffset .35s cubic-bezier(.2,.8,.3,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

/* ============================== Fields ============================== */

export function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  suffix,
  error,
  mono,
  className,
}: {
  label?: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  suffix?: React.ReactNode;
  error?: string;
  mono?: boolean;
  className?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <label className={cx("block select-none", className)}>
      {label && (
        <span className="mb-1 block text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>{label}</span>
      )}
      <span
        className="flex h-[30px] items-center gap-1.5 rounded-[8px] px-2.5"
        style={{
          background: "var(--panel)",
          boxShadow: error
            ? "inset 0 0 0 1.5px var(--danger)"
            : focus
            ? "inset 0 0 0 2px var(--accent), 0 0 0 3.5px color-mix(in srgb, var(--accent) 22%, transparent)"
            : "inset 0 0 0 .5px var(--hair-strong), 0 .5px 1px rgba(0,0,0,.05)",
          transition: "box-shadow .16s",
        }}
      >
        {icon && <span className="inline-flex shrink-0" style={{ color: "var(--ink-3)" }}>{icon}</span>}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          className={cx("w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--ink-4)]", mono && "font-mono")}
          style={{ color: "var(--ink-1)" }}
        />
        {suffix && <span className="shrink-0 text-[11.5px]" style={{ color: "var(--ink-3)" }}>{suffix}</span>}
      </span>
      {error && <span className="mt-1 block text-[11.5px] font-medium" style={{ color: "var(--danger)" }}>{error}</span>}
    </label>
  );
}

/* ============================== Menu ============================== */

export type MenuItem =
  | { divider: true }
  | { header: string }
  | {
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      checked?: boolean | "mixed";
      danger?: boolean;
      disabled?: boolean;
      submenu?: boolean;
      badge?: string;
      onSelect?: () => void;
    };

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose?: () => void }) {
  return (
    <div className="scroll-thin max-h-[60vh] overflow-y-auto p-[5px]" role="menu">
      {items.map((it, i) => {
        if ("divider" in it) return <div key={i} className="mx-2 my-[5px]" style={{ borderTop: "1px solid var(--hair)" }} />;
        if ("header" in it)
          return (
            <div key={i} className="px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-3)" }}>
              {it.header}
            </div>
          );
        return (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => { it.onSelect?.(); onClose?.(); }}
            className={cx(
              "group flex w-full items-center gap-2 rounded-[6px] px-2 py-[5px] text-left text-[12.5px]",
              it.disabled ? "cursor-not-allowed opacity-40" : "hover:text-white"
            )}
            style={{ color: it.danger ? "var(--danger)" : "var(--ink-1)" }}
            onMouseEnter={(e) => {
              if (it.disabled) return;
              (e.currentTarget as HTMLButtonElement).style.background = it.danger ? "var(--danger)" : "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = it.danger ? "var(--danger)" : "var(--ink-1)";
            }}
          >
            <span className="flex w-[18px] shrink-0 items-center justify-center">
              {it.checked === true ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
              ) : it.checked === "mixed" ? (
                <Minus className="h-3.5 w-3.5" strokeWidth={2.6} />
              ) : (
                it.icon && <span className="inline-flex opacity-75 [&>svg]:h-[15px] [&>svg]:w-[15px]">{it.icon}</span>
              )}
            </span>
            <span className="flex-1 truncate font-medium">{it.label}</span>
            {it.badge && (
              <span className="rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "rgba(120,120,128,.2)" }}>
                {it.badge}
              </span>
            )}
            {it.shortcut && <span className="text-[12px] opacity-60">{it.shortcut}</span>}
            {it.submenu && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
          </button>
        );
      })}
    </div>
  );
}

export function Popover({
  open,
  onClose,
  children,
  width = 248,
  align = "left",
  drop = "down",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right" | "center";
  drop?: "down" | "up";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={cx(
        "glass-menu animate-menu-in absolute z-[80] rounded-[12px] shadow-pop",
        drop === "down" ? "top-[calc(100%+6px)] origin-top" : "bottom-[calc(100%+6px)] origin-bottom",
        className
      )}
      style={{
        width,
        left: align === "left" ? 0 : undefined,
        right: align === "right" ? 0 : undefined,
        ...(align === "center" ? { left: "50%", transform: "translateX(-50%)" } : {}),
      }}
    >
      {children}
    </div>
  );
}

/* ============================== Badges / Tags / Dots ============================== */

export function Badge({
  tone = "gray",
  children,
  className,
  pulse,
}: {
  tone?: "gray" | "green" | "blue" | "orange" | "red" | "purple";
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
}) {
  const map: Record<string, { bg: string; fg: string }> = {
    gray: { bg: "rgba(120,120,128,.18)", fg: "var(--ink-2)" },
    green: { bg: "var(--success-bg)", fg: "var(--success)" },
    blue: { bg: "color-mix(in srgb, var(--accent) 12%, transparent)", fg: "var(--accent-ink)" },
    orange: { bg: "var(--warning-bg)", fg: "var(--warning)" },
    red: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    purple: { bg: "rgba(175,82,222,.14)", fg: "#a259d9" },
  };
  const t = map[tone];
  return (
    <span
      className={cx("inline-flex h-[20px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold", className)}
      style={{ background: t.bg, color: t.fg }}
    >
      {pulse && <span className="live-dot h-[6px] w-[6px] rounded-full" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}

export function Dot({ color, size = 8, glow }: { color: string; size?: number; glow?: boolean }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: glow ? `0 0 8px 1px ${color}` : "inset 0 -.5px 1px rgba(0,0,0,.2)" }}
    />
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("w-px self-stretch", className)} style={{ background: "var(--hair)" }} />;
}

/* ============================== Library scaffolding ============================== */

export function Section({
  id,
  eyebrow,
  title,
  desc,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.09em]" style={{ color: "var(--accent-ink)" }}>
          {eyebrow}
        </div>
        <h2 className="text-[21px] font-semibold tracking-[-0.02em]" style={{ color: "var(--ink-1)" }}>{title}</h2>
        {desc && <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{desc}</p>}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export function Specimen({
  title,
  desc,
  children,
  wide,
  dark,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  wide?: boolean;
  dark?: boolean;
}) {
  return (
    <div
      className="overflow-hidden rounded-[14px]"
      style={{ background: "var(--panel)", boxShadow: "inset 0 0 0 .5px var(--hair), 0 1px 3px rgba(0,0,0,.05)" }}
    >
      <div className="flex items-center justify-between px-4 pb-0 pt-3">
        <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-1)" }}>{title}</div>
        <Badge tone="gray">Live</Badge>
      </div>
      {desc && <div className="px-4 pt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>{desc}</div>}
      <div
        className={cx("m-3 mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[10px] p-5", wide && "flex-col items-stretch gap-3")}
        style={{ background: dark ? "#101014" : "var(--panel-2)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px]">
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium" style={{ color: "var(--ink-1)" }}>{label}</div>
        {hint && <div className="truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]"
        style={{ background: "var(--panel-2)", boxShadow: "inset 0 0 0 .5px var(--hair)", color: "var(--ink-3)" }}
      >
        {icon}
      </div>
      <div className="text-[13px] font-semibold" style={{ color: "var(--ink-1)" }}>{title}</div>
      <div className="mt-1 max-w-[260px] text-[12px] leading-relaxed" style={{ color: "var(--ink-3)" }}>{desc}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
