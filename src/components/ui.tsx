"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { formatValue, parseValue } from "@/lib/library/catalog";

/* ------------------------------------------------------------------ */
/* Datei-Download (Exporte) — ein Ort für alle Download-Helfer          */
/* ------------------------------------------------------------------ */

export function downloadText(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\wäöüÄÖÜß.-]+/g, "-");
}

/* ------------------------------------------------------------------ */
/* Menü (Dropdown in der Menüleiste)                                    */
/* ------------------------------------------------------------------ */

export function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  return (
    <div className="relative" ref={ref}>
      <button className="btn" data-active={open} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="rise absolute left-0 top-[calc(100%+6px)] z-50 min-w-[248px] rounded-lg p-1"
          style={{ background: "var(--panel-solid)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
          onClick={() => setOpen(false)}
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  hint?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      role="menuitem"
      className="flex w-full items-center justify-between gap-8 rounded-md px-2.5 py-[7px] text-left text-[12.5px] text-dim hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-dim"
      style={danger ? { color: "var(--err)" } : undefined}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid w-4 shrink-0 place-items-center">{checked ? <Check size={13} /> : null}</span>
        <span className="flex min-w-0 items-center gap-2">{children}</span>
      </span>
      {hint && <span className="mono shrink-0 text-[10.5px] text-mute">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px" style={{ background: "var(--border)" }} />;
}

/* ------------------------------------------------------------------ */
/* Dialog (modal, ein Ausgang immer sichtbar)                           */
/* ------------------------------------------------------------------ */

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
  actions: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Fokus auf das erste Eingabefeld — Tastatur bleibt König.
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("input, select")?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
    };
  }, [onClose]);
  return (
    <div
      className="fade-in fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: "rgba(4,6,12,0.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise flex max-h-[86vh] w-full flex-col overflow-hidden rounded-xl"
        style={{ maxWidth: wide ? 560 : 440, background: "var(--panel-solid)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <div className="text-[14px] font-semibold tracking-tight">{title}</div>
          {subtitle && <div className="mt-0.5 text-[12px] text-mute">{subtitle}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">{children}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          {actions}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formularfelder                                                       */
/* ------------------------------------------------------------------ */

export function FieldLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline justify-between text-[12px]">
      <span className="text-dim">{children}</span>
      {aside && <span className="mono text-[10.5px] text-mute">{aside}</span>}
    </span>
  );
}

export function TextField({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block py-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input className={`input ${mono ? "mono" : ""}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
    </label>
  );
}

/** Zahlenfeld mit Einheiten-Parser (1k, 10u, 2.2M …). Schreibt erst bei Blur/Enter. */
export function NumberField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? formatValue(value, "");
  return (
    <label className="block py-1.5">
      <FieldLabel aside={unit}>{label}</FieldLabel>
      <input
        className="input mono"
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            const v = parseValue(text);
            if (Number.isFinite(v)) onChange(v);
            setText(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        spellCheck={false}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block py-1.5">
      <FieldLabel>{label}</FieldLabel>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Mehrfachauswahl aus Netzen (Checkbox-Liste) — für Graph-Ausgänge. */
export function NetsField({
  label,
  nets,
  selected,
  onChange,
}: {
  label: string;
  nets: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (n: string) =>
    onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n]);
  return (
    <div className="block py-1.5">
      <FieldLabel aside={`${selected.length} gewählt`}>{label}</FieldLabel>
      <div className="max-h-32 overflow-y-auto rounded-md p-1" style={{ border: "1px solid var(--border)", background: "color-mix(in srgb, var(--text) 3%, transparent)" }}>
        {nets.length === 0 && <div className="px-2 py-1.5 text-[12px] text-mute">Keine Netze — erst Bauteile verdrahten.</div>}
        {nets.map((n) => (
          <label key={n} className="tree-row flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--accent)]"
              checked={selected.includes(n)}
              onChange={() => toggle(n)}
            />
            <span className="mono">{n}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
