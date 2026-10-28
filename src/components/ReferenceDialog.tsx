"use client";

import { useState } from "react";
import { DialogHeader, ModalShell } from "./ui";
import { formatValue } from "@/lib/format";
import { E_SERIES_VALUES, type ESeries } from "@/lib/values/series";
import {
  RESISTOR_COLORS,
  VALUE_SUFFIX_NOTES,
  VALUE_SUFFIX_ROWS,
  decodeCapacitorCode,
  decodeSmdResistor,
} from "@/lib/reference/tables";

type RefTab = "farbcode" | "ereihen" | "kondensatoren" | "smd" | "suffixe";

const TABS: Array<{ id: RefTab; label: string }> = [
  { id: "farbcode", label: "Farbcode" },
  { id: "ereihen", label: "E-Reihen" },
  { id: "kondensatoren", label: "Kondensatoren" },
  { id: "smd", label: "SMD" },
  { id: "suffixe", label: "Suffixe" },
];

const th = "px-2 py-1.5 text-left font-medium text-ink-3";
const td = "px-2 py-1";

function fmtFactor(f: number): string {
  if (f === 1) return "×1";
  const exp = Math.round(Math.log10(f));
  const digits = "0123456789".split("");
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹".split("");
  const body = String(Math.abs(exp))
    .split("")
    .map((d) => sup[digits.indexOf(d)])
    .join("");
  return `×10${exp < 0 ? "⁻" : ""}${body}`;
}

function ColorCodeTable() {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-2">
        4 Ringe: Ziffer–Ziffer–Multiplikator–Toleranz · 5 Ringe: drei Ziffern · 6. Ring: Temperaturkoeffizient (ppm/K).
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-hairline text-2xs uppercase tracking-wide">
            <th className={th}>Farbe</th>
            <th className={th}>Ziffer</th>
            <th className={th}>×</th>
            <th className={th}>Toleranz</th>
            <th className={th}>TK</th>
          </tr>
        </thead>
        <tbody className="mono">
          {RESISTOR_COLORS.map((r) => (
            <tr key={r.name} className="border-b border-hairline/60 last:border-0">
              <td className={td}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-6 shrink-0 rounded-sm border border-hairline-strong"
                    style={{ background: r.hex }}
                  />
                  <span className="font-sans">{r.name}</span>
                </span>
              </td>
              <td className={td}>{r.digit ?? "—"}</td>
              <td className={td}>{r.mult}</td>
              <td className={td}>{r.tol}</td>
              <td className={td}>{r.tc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ESeriesTable() {
  const series: ESeries[] = ["E6", "E12", "E24"];
  return (
    <div>
      <p className="mb-2 text-xs text-ink-2">
        Normwerte einer Dekade — gilt mit ×1, ×10, ×100 … (gewählte Reihe: Einstellungen → Bauteilwerte).
      </p>
      <div className="grid grid-cols-3 gap-3">
        {series.map((s) => (
          <div key={s} className="rounded-lg border border-hairline bg-surface-2 p-2">
            <div className="mb-1 text-center text-xs font-semibold">{s}</div>
            <div className="mono grid grid-cols-2 gap-x-2 text-center text-xs text-ink-2">
              {E_SERIES_VALUES[s].map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CAP_EXAMPLES = ["22", "100", "220", "471", "102", "103", "223", "104", "474", "105", "106"];

function CapacitorTable() {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-2">
        Letzte Ziffer = Anzahl Nullen, Rest = Ziffern, Ergebnis in Pikofarad. Beispiele (live gerechnet):
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-hairline text-2xs uppercase tracking-wide">
            <th className={th}>Aufdruck</th>
            <th className={th}>Wert</th>
          </tr>
        </thead>
        <tbody className="mono">
          {CAP_EXAMPLES.map((c) => (
            <tr key={c} className="border-b border-hairline/60 last:border-0">
              <td className={td}>{c}</td>
              <td className={td}>{formatValue(decodeCapacitorCode(c) ?? NaN, "F")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SMD_EXAMPLES = ["0", "4R7", "10R", "100", "221", "472", "103", "1001", "4992"];

function SmdTable() {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-2">
        3 Stellen: zwei Ziffern + Nullen · 4 Stellen: drei Ziffern + Nullen · R = Komma · 0 = Drahtbrücke. EIA-96
        („01C“) steht nicht hier — eigene Tabelle, folgt bei Bedarf.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-hairline text-2xs uppercase tracking-wide">
            <th className={th}>Aufdruck</th>
            <th className={th}>Wert</th>
          </tr>
        </thead>
        <tbody className="mono">
          {SMD_EXAMPLES.map((c) => (
            <tr key={c} className="border-b border-hairline/60 last:border-0">
              <td className={td}>{c}</td>
              <td className={td}>{formatValue(decodeSmdResistor(c) ?? NaN, "Ω")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuffixTable() {
  return (
    <div>
      <p className="mb-2 text-xs text-ink-2">So versteht die Eingabe überall Zahlen (Wertefeld, Inspector, Dialoge):</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-hairline text-2xs uppercase tracking-wide">
            <th className={th}>Suffix</th>
            <th className={th}>Faktor</th>
            <th className={th}>Name</th>
          </tr>
        </thead>
        <tbody className="mono">
          {VALUE_SUFFIX_ROWS.map((r) => (
            <tr key={r.suffix} className="border-b border-hairline/60 last:border-0">
              <td className={td}>{r.suffix}</td>
              <td className={td}>{fmtFactor(r.factor)}</td>
              <td className={td}>{r.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
        {VALUE_SUFFIX_NOTES.map((n) => (
          <li key={n}>· {n}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * S5.24: Referenz-Fenster über Hilfe → Referenz. Farbcode, E-Reihen,
 * Kondensator- und SMD-Codes, Eingabe-Suffixe — Werte kommen aus
 * `lib/reference` bzw. werden live gerechnet (nichts abgeschrieben).
 */
export default function ReferenceDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<RefTab>("farbcode");
  return (
    <ModalShell label="Referenz" onClose={onClose} maxWidth={560} className="max-h-[88vh]">
      <DialogHeader title="Referenz" onClose={onClose} />
      <div className="flex flex-wrap gap-1 border-b border-hairline px-3 pb-2">
        {TABS.map((t) => (
          <button key={t.id} className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "farbcode" && <ColorCodeTable />}
        {tab === "ereihen" && <ESeriesTable />}
        {tab === "kondensatoren" && <CapacitorTable />}
        {tab === "smd" && <SmdTable />}
        {tab === "suffixe" && <SuffixTable />}
      </div>
    </ModalShell>
  );
}
