"use client";

import { useState } from "react";
import { formatValue, parseValue } from "@/lib/library/catalog";

export function FieldLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline justify-between text-xs">
      <span className="text-ink-2">{children}</span>
      {aside && <span className="mono text-2xs text-ink-3">{aside}</span>}
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
        inputMode="decimal"
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
  const toggle = (n: string) => onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n]);
  return (
    <fieldset className="block py-1.5">
      <legend className="w-full">
        <FieldLabel aside={`${selected.length} gewählt`}>{label}</FieldLabel>
      </legend>
      <div className="max-h-32 overflow-y-auto rounded-field border border-hairline bg-surface-2 p-1">
        {nets.length === 0 && <div className="px-2 py-1.5 text-xs text-ink-3">Keine Netze — erst Bauteile verdrahten.</div>}
        {nets.map((n) => (
          <label key={n} className="tree-row flex cursor-pointer items-center gap-2 rounded-control px-2 py-1 text-xs">
            <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={selected.includes(n)} onChange={() => toggle(n)} />
            <span className="mono">{n}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
