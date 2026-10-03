"use client";

import { forwardRef } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-1 hover:brightness-110",
  secondary: "bg-surface text-ink shadow-1 hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "text-err hover:bg-[color-mix(in_srgb,var(--err)_12%,transparent)]",
};
const SIZE: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-sm",
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "pressable ring-focus inline-flex select-none items-center justify-center whitespace-nowrap rounded-field font-medium disabled:pointer-events-none disabled:opacity-40",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon && <span className="inline-flex [&>svg]:size-[15px]">{icon}</span>}
      {children}
    </button>
  );
});

/** Icon-only: `aria-label` ist Pflicht. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  { "aria-label": string; active?: boolean; size?: Size } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function IconButton({ active, size = "md", className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cx(
        "pressable ring-focus inline-grid shrink-0 select-none place-items-center rounded-control [&>svg]:size-[15px] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-6" : "size-7",
        active ? "bg-accent-soft text-accent shadow-[inset_0_0_0_0.5px_var(--accent-mid)]" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
        className,
      )}
      {...rest}
    />
  );
});
