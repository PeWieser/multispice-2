"use client";

import type { ReactNode } from "react";

/* ----------------------------- icons ------------------------------- */
const PATHS: Record<string, string> = {
  cursor: "M3 2 L3 14 L7 10 L9.5 15 L11.5 14 L9 9.5 L13 9.5 Z",
  wire: "M2 12 L2 6 L8 6 L8 12 L14 12",
  bus: "M2 11 L2 7 L14 7 M2 9 L14 9",
  resistor: "M1 8 L4 8 L6 4 L8 12 L10 4 L12 12 L14 8 L16 8",
  capacitor: "M1 8 L6 8 M6 4 L6 12 M10 4 L10 12 M10 8 L16 8",
  ground: "M8 2 L8 8 M3 8 L13 8 M5 11 L11 11 M7 14 L9 14",
  probe: "M8 2 L8 10 M4 10 L12 10 L8 15 Z",
  run: "M4 3 L13 8 L4 13 Z",
  stop: "M4 4 L12 4 L12 12 L4 12 Z",
  pause: "M5 4 L5 12 M11 4 L11 12",
  restart: "M13 8 A5 5 0 1 1 8 3 M8 3 L8 1 L11 3 L8 5",
  undo: "M3 6 L8 6 A4 4 0 1 1 8 14 L5 14 M3 6 L6 3 M3 6 L6 9",
  redo: "M13 6 L8 6 A4 4 0 1 0 8 14 L11 14 M13 6 L10 3 M13 6 L10 9",
  zoomin: "M7 2 L7 12 M2 7 L12 7 M12 12 L16 16",
  zoomout: "M2 7 L12 7 M12 12 L16 16",
  fit: "M2 5 L2 2 L5 2 M11 2 L14 2 L14 5 M14 11 L14 14 L11 14 M5 14 L2 14 L2 11",
  grid: "M2 2 L14 2 L14 14 L2 14 Z M2 6 L14 6 M2 10 L14 10 M6 2 L6 14 M10 2 L10 14",
  save: "M2 2 L11 2 L14 5 L14 14 L2 14 Z M5 2 L5 8 L11 8 L11 2 M5 14 L5 10 L11 10 L11 14",
  folder: "M2 4 L6 4 L8 6 L14 6 L14 13 L2 13 Z",
  file: "M4 2 L10 2 L13 5 L13 14 L4 14 Z M10 2 L10 5 L13 5",
  search: "M7 2 A5 5 0 1 1 7 12 A5 5 0 1 1 7 2 M11 11 L15 15",
  trash: "M3 4 L13 4 M6 4 L6 2 L10 2 L10 4 M4 4 L5 14 L11 14 L12 4",
  rotate: "M13 8 A5 5 0 1 1 8 3 M8 3 L8 1 L11 3 L8 5",
  mirror: "M8 2 L8 14 M6 4 L2 8 L6 12 Z M10 4 L14 8 L10 12 Z",
  copy: "M5 5 L12 5 L12 13 L5 13 Z M3 11 L3 2 L10 2",
  chart: "M2 13 L2 3 M2 13 L14 13 M4 11 L7 6 L10 9 L13 4",
  scope: "M2 3 L14 3 L14 13 L2 13 Z M4 8 L6 8 L7 5 L9 11 L11 8 L12 8",
  meter: "M3 3 L13 3 L13 13 L3 13 Z M5 10 A3 3 0 0 1 11 10 M8 10 L10 6",
  wave: "M1 8 Q4 2 7 8 T13 8 M13 8 L15 8",
  logic: "M2 2 L14 2 L14 14 L2 14 Z M5 6 L11 6 M5 10 L11 10",
  settings:
    "M8 5 A3 3 0 1 1 8 11 A3 3 0 1 1 8 5 M8 1 L8 3 M8 13 L8 15 M1 8 L3 8 M13 8 L15 8 M3 3 L5 5 M11 11 L13 13 M13 3 L11 5 M5 11 L3 13",
  warning: "M8 2 L15 14 L1 14 Z M8 6 L8 10 M8 12 L8 12.5",
  error: "M4 4 L12 12 M12 4 L4 12 M8 1 A7 7 0 1 1 8 15 A7 7 0 1 1 8 1",
  check: "M3 8 L7 12 L14 4",
  close: "M4 4 L12 12 M12 4 L4 12",
  chevron: "M6 4 L10 8 L6 12",
  down: "M4 6 L8 10 L12 6",
  up: "M4 10 L8 6 L12 10",
  plus: "M8 3 L8 13 M3 8 L13 8",
  minus: "M3 8 L13 8",
  panel: "M2 2 L14 2 L14 14 L2 14 Z M6 2 L6 14",
  net: "M2 8 L6 8 M6 4 L6 12 M6 8 L12 8 M12 5 L12 11",
  bulb: "M8 2 A4 4 0 1 1 8 10 A4 4 0 1 1 8 2 M6 12 L10 12 M7 14 L9 14",
  power: "M8 2 L8 8 M4 5 A5 5 0 1 0 12 5",
  doc: "M4 2 L11 2 L13 4 L13 14 L4 14 Z M6 6 L11 6 M6 9 L11 9 M6 12 L9 12",
  info: "M8 7 L8 12 M8 4.5 L8 5 M8 1 A7 7 0 1 1 8 15 A7 7 0 1 1 8 1",
};

export function Icon({
  name,
  size = 15,
  className = "",
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
}) {
  const d = PATHS[name] ?? PATHS.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/* ----------------------------- controls ---------------------------- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field px-3 py-[2px]" title={hint}>
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  mono = true,
  disabled,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onEnter?.();
      }}
      style={mono ? undefined : { fontFamily: "var(--font-ui)" }}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="field px-3 py-[2px] cursor-pointer">
      <span className="lbl" />
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 11.5 }}>{label}</span>
    </label>
  );
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <div className="sc">{children}</div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  width = 560,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
  footer?: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ width }}>
        <div className="panel-head" style={{ height: 34 }}>
          <div className="sc" style={{ color: "var(--ink)", letterSpacing: "0.08em" }}>
            {title}
          </div>
          <button
            className="tbtn ml-auto"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="scroll" style={{ padding: "10px 12px", flex: "1 1 auto", minHeight: 0 }}>
          {children}
        </div>
        {footer ? (
          <div
            className="rule-t"
            style={{ padding: "8px 12px", display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Badge({
  kind,
  children,
}: {
  kind: "ok" | "err" | "warn" | "info" | "mute";
  children: ReactNode;
}) {
  return <span className={`badge ${kind}`}>{children}</span>;
}
