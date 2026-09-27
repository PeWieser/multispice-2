"use client";

import { useEditor } from "@/state/editor";
import { PARTS, PartDef } from "@/lib/library/catalog";
import { ProbeKind } from "@/lib/schematic/model";
import { CategoryIcon } from "@/lib/library/icons";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { Library as LibraryIcon } from "lucide-react";

/* W7: Ein Streifen. Keine Scrollbar, keine Erklärtexte, keine Emoji.
   Bibliothek ganz links (eine Tür für alle 402 Teile), dann sechs Kuratierte,
   dann die Probes. Alles Weitere lebt in der Bibliothek. */

const QUICK: Array<{ id: string; label: string }> = [
  { id: "resistor", label: "R" },
  { id: "capacitor", label: "C" },
  { id: "inductor", label: "L" },
  { id: "diode_1n4148", label: "Diode" },
  { id: "vdc", label: "VDC" },
  { id: "gnd", label: "GND" },
];

const PROBES: Array<{ k: ProbeKind; l: string; t: string; c: string }> = [
  { k: "voltage", l: "V", t: "Spannungs-Probe", c: "#fbbf24" },
  { k: "current", l: "A", t: "Strom-Probe", c: "#22d3ee" },
  { k: "voltage_current", l: "V·A", t: "Spannung + Strom", c: "#f59e0b" },
  { k: "power", l: "W", t: "Leistungs-Probe", c: "#a78bfa" },
  { k: "diff", l: "ΔV", t: "Differenz-Probe", c: "#f472b6" },
  { k: "ref", l: "REF", t: "Referenz-Probe", c: "#94a3b8" },
  { k: "digital", l: "D", t: "Digital-Probe", c: "#4ade80" },
];

export default function ComponentStrip() {
  const apple = useIsApple();
  const placing = useEditor((s) => s.placingPartId);
  const placingProbe = useEditor((s) => s.placingProbeKind);
  const setPlacing = useEditor((s) => s.setPlacing);
  const setPlacingProbe = useEditor((s) => s.setPlacingProbe);
  const toggleLibrary = useEditor((s) => s.toggleLibrary);

  const quickParts: PartDef[] = QUICK.map((q) => PARTS.find((p) => p.id === q.id)!).filter(Boolean);

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-1 overflow-hidden border-b px-2"
      style={{ borderColor: "var(--border)", background: "var(--panel)" }}
    >
      <button
        className="btn h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
        onClick={toggleLibrary}
        title={adaptShortcut("Bibliothek (⌘K)", apple)}
      >
        <LibraryIcon size={13} />
        <span className="hidden md:inline">Bibliothek</span>
      </button>

      <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1">
        {quickParts.map((p) => {
          const active = placing === p.id;
          const q = QUICK.find((x) => x.id === p.id);
          return (
            <button
              key={p.id}
              className="flex h-8 min-w-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--panel-2)",
                color: active ? "var(--accent-contrast)" : "var(--text)",
                borderColor: active ? "var(--accent)" : "var(--border)",
              }}
              title={p.name}
              onClick={() => setPlacing(active ? null : p.id)}
            >
              <CategoryIcon category={p.category} size={14} />
              <span className="mono text-[10px]">{q?.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1">
        {PROBES.map((b) => {
          const active = placingProbe === b.k;
          return (
            <button
              key={b.k}
              className="grid h-8 min-w-[34px] shrink-0 place-items-center rounded-lg border text-[11px] font-bold leading-none transition-colors"
              style={{
                borderColor: active ? b.c : "var(--border)",
                background: active ? b.c : `color-mix(in srgb, ${b.c} 18%, var(--panel-2))`,
                color: active ? "#0f172a" : b.c,
              }}
              title={b.t}
              onClick={() => setPlacingProbe(active ? null : b.k)}
            >
              {b.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
