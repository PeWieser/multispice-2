"use client";

import type { ReactNode } from "react";
import { useEditor, useHud } from "@/state/editor";
import { PARTS, PartDef } from "@/lib/library/catalog";
import { ProbeKind } from "@/lib/schematic/model";
import { PartGlyph } from "@/components/PartGlyphs";
import { resolveSymbolStyle } from "@/lib/settings";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { Library as LibraryIcon } from "lucide-react";

/* W7 / W69 / W73: Ein Streifen.
   Bibliothek ganz links (eine Tür für alle 402 Teile), dann die wichtigsten
   Grundbauteile mit Schaltzeichen (IEC/ANSI-normgerecht), dann die
   Zeichenwerkzeuge und rechts die Probes. Warmer Bernstein-/Amber-Akzent für
   aktive Elemente statt konkurrierender Blautöne. */

const QUICK: Array<{ id: string; label: string }> = [
  { id: "resistor", label: "R" },
  { id: "capacitor", label: "C" },
  { id: "inductor", label: "L" },
  { id: "diode_1n4148", label: "Diode" },
  { id: "npn_2n3904", label: "NPN" },
  { id: "opamp_lm741", label: "OpAmp" },
  { id: "vdc", label: "VDC" },
  { id: "gnd", label: "GND" },
];

const PROBES: Array<{ k: ProbeKind; l: string; t: string; c: string }> = [
  { k: "voltage", l: "V", t: "Spannungs-Probe", c: "var(--warn)" },
  { k: "current", l: "A", t: "Strom-Probe", c: "var(--accent-2)" },
  { k: "voltage_current", l: "V·A", t: "Spannung + Strom", c: "var(--warn)" },
  { k: "power", l: "W", t: "Leistungs-Probe", c: "var(--accent-3)" },
  { k: "diff", l: "ΔV", t: "Differenz-Probe", c: "var(--err)" },
  { k: "ref", l: "REF", t: "Referenz-Probe", c: "var(--text-mute)" },
  { k: "digital", l: "D", t: "Digital-Probe", c: "var(--ok)" },
];

export function ComponentStrip({ tools }: { tools?: ReactNode }) {
  const apple = useIsApple();
  const placing = useEditor((s) => s.placingPartId);
  const placingProbe = useEditor((s) => s.placingProbeKind);
  const libraryOpen = useEditor((s) => s.libraryOpen);
  const symbolStylePref = useEditor((s) => s.symbolStyle);
  const setPlacing = useEditor((s) => s.setPlacing);
  const setPlacingProbe = useEditor((s) => s.setPlacingProbe);
  const toggleLibrary = useEditor((s) => s.toggleLibrary);

  const resolvedStyle = resolveSymbolStyle(symbolStylePref);
  const quickParts: PartDef[] = QUICK.map((q) => PARTS.find((p) => p.id === q.id)!).filter(Boolean);

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto no-scrollbar border-b px-2"
      style={{ borderColor: "var(--border)", background: "var(--panel)" }}
    >
      <button
        className="btn h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
        style={
          libraryOpen
            ? {
                background: "var(--tool-active-bg)",
                borderColor: "var(--tool-active-border)",
                color: "var(--tool-active-text)",
              }
            : undefined
        }
        onClick={toggleLibrary}
        title={adaptShortcut("Bibliothek (⌘K)", apple)}
      >
        <LibraryIcon size={13} />
        <span className="hidden md:inline">Bibliothek</span>
      </button>

      <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1 shrink-0">
        {quickParts.map((p) => {
          const active = placing === p.id;
          return (
            <button
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/multispice-part", p.id);
                e.dataTransfer.effectAllowed = "copy";
                useHud.setState({ dragPart: p.id });
              }}
              onDragEnd={() => useHud.setState({ dragPart: null })}
              className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border transition-colors"
              style={{
                background: active ? "var(--tool-active-bg)" : "var(--panel-2)",
                color: active ? "var(--tool-active-text)" : "var(--text)",
                borderColor: active ? "var(--tool-active-border)" : "var(--border)",
                boxShadow: active ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)" : "none",
              }}
              title={`${p.name} – platzieren (R = drehen, M = spiegeln)`}
              aria-label={p.name}
              aria-pressed={active}
              onClick={() => setPlacing(active ? null : p.id)}
            >
              <PartGlyph partId={p.id} category={p.category} size={20} symbolStyle={resolvedStyle} />
            </button>
          );
        })}
      </div>

      <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      {/* W68: Zeichenwerkzeuge (Auswahl, Stift, Knotenpunkt, Netzname, Notiz, Löschen) */}
      {tools ? <div className="flex shrink-0 items-center gap-1">{tools}</div> : null}
      {tools ? <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} /> : null}

      <div className="flex shrink-0 items-center gap-1">
        {PROBES.map((b) => {
          const active = placingProbe === b.k;
          return (
            <button
              key={b.k}
              aria-pressed={active}
              className="flex h-8 min-w-[34px] px-1.5 shrink-0 items-center justify-center gap-1 rounded-lg border text-[11px] font-bold leading-none transition-colors"
              style={{
                borderColor: active ? "var(--tool-active-border)" : "var(--border)",
                background: active ? "var(--tool-active-bg)" : "var(--panel-2)",
                color: active ? "var(--tool-active-text)" : "var(--text)",
                boxShadow: active ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)" : "none",
              }}
              title={b.t}
              onClick={() => setPlacingProbe(active ? null : b.k)}
            >
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: b.c }} />
              <span>{b.l}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ComponentStrip;
