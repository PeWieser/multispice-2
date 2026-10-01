"use client";

import { useEditor } from "@/state/editor";
import { PARTS, PartDef } from "@/lib/library/catalog";
import { ProbeKind } from "@/lib/schematic/model";
import { PartGlyph } from "@/components/PartGlyphs";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { Library as LibraryIcon } from "lucide-react";

/* W7: Ein Streifen. Keine Scrollbar, keine Erklärtexte, keine Emoji.
   Bibliothek ganz links (eine Tür für alle 402 Teile), dann sechs Kuratierte,
   dann die Probes. Alles Weitere lebt in der Bibliothek.
   W69: Die Kuratierten zeigen jetzt das Schaltzeichen (Zickzack-Widerstand,
   Kondensator, Spule, Diode, Quelle, Masse) – ohne Textkürzel; der Name steht
   im Tooltip. */

const QUICK: Array<{ id: string; label: string }> = [
  { id: "resistor", label: "R" },
  { id: "capacitor", label: "C" },
  { id: "inductor", label: "L" },
  { id: "diode_1n4148", label: "Diode" },
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

export default function ComponentStrip({ tools }: { tools?: React.ReactNode }) {
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
          return (
            <button
              key={p.id}
              className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--panel-2)",
                color: active ? "var(--accent-contrast)" : "var(--text)",
                borderColor: active ? "var(--accent)" : "var(--border)",
              }}
              title={`${p.name} – platzieren`}
              aria-label={p.name}
              onClick={() => setPlacing(active ? null : p.id)}
            >
              <PartGlyph partId={p.id} category={p.category} size={20} />
            </button>
          );
        })}
      </div>

      <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      {/* W68: Zeichenwerkzeuge (Auswahl, Stift, Knotenpunkt, Netzname, Notiz, Löschen) */}
      {tools ? <div className="flex shrink-0 items-center gap-1">{tools}</div> : null}
      {tools ? <div className="mx-1.5 h-4 w-px shrink-0" style={{ background: "var(--border)" }} /> : null}

      <div className="hidden min-w-0 items-center gap-1 overflow-hidden lg:flex">
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
