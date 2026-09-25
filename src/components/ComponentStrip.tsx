"use client";

import { useEditor } from "@/state/editor";
import { PARTS, PartDef } from "@/lib/library/catalog";
import { ProbeKind } from "@/lib/schematic/model";
import { CategoryIcon } from "@/lib/library/icons";
import { Tooltip } from "./ui";

const QUICK: Array<{ id: string; label: string; desc: string }> = [
  { id: "resistor", label: "R", desc: "Widerstand – begrenzt Strom, z.B. 10kΩ" },
  { id: "capacitor", label: "C", desc: "Kondensator – speichert Ladung, z.B. 100nF" },
  { id: "inductor", label: "L", desc: "Spule – speichert Energie im Magnetfeld" },
  { id: "diode_1n4148", label: "Diode", desc: "Diode 1N4148 – lässt Strom nur in eine Richtung" },
  { id: "npn_2n3904", label: "NPN", desc: "Transistor NPN 2N3904 – schaltet/verstärkt" },
  { id: "nmos", label: "MOS", desc: "MOSFET – spannungsgesteuerter Schalter" },
  { id: "opamp_ideal", label: "OpAmp", desc: "Operationsverstärker – ideal, verstärkt Differenz" },
  { id: "vdc", label: "VDC", desc: "Spannungsquelle Gleichspannung" },
  { id: "gnd", label: "GND", desc: "Masse – Bezugspotential 0V" },
  { id: "ne555", label: "555", desc: "NE555 Timer – astabil, monostabil" },
];

const PROBES: Array<{ k: ProbeKind; l: string; t: string; c: string; desc: string }> = [
  { k: "voltage", l: "V", t: "Voltage Probe", c: "#fbbf24", desc: "Misst Spannung gegen GND oder REF-Probe (Multisim-like). Leader Pfeil zeigt auf Leitung." },
  { k: "current", l: "A", t: "Current Probe", c: "#22d3ee", desc: "Misst Strom mit Richtungspfeil. Rechtsklick → Richtung umkehren." },
  { k: "voltage_current", l: "V·A", t: "V·A Probe", c: "#f59e0b", desc: "Kombiniert V und A in einer Box." },
  { k: "power", l: "W", t: "Power Probe", c: "#a78bfa", desc: "Leistung W = V·I gegen REF." },
  { k: "diff", l: "ΔV", t: "Diff Probe", c: "#f472b6", desc: "Differenz ΔV = V+ - Vref automatisch." },
  { k: "ref", l: "REF", t: "REF Probe", c: "#94a3b8", desc: "Referenz für andere Probes – gemeinsame Masse." },
  { k: "digital", l: "D", t: "Digital Probe", c: "#4ade80", desc: "Digital 1/0/X mit Schwellen 0.8V/2.0V." },
];

export default function ComponentStrip() {
  const placing = useEditor((s) => s.placingPartId);
  const placingProbe = useEditor((s) => s.placingProbeKind);
  const setPlacing = useEditor((s) => s.setPlacing);
  const setPlacingProbe = useEditor((s) => s.setPlacingProbe);
  const toggleLibrary = useEditor((s) => s.toggleLibrary);

  const quickParts: PartDef[] = QUICK.map((q) => PARTS.find((p) => p.id === q.id)!).filter(Boolean);

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-2" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
      <span className="mr-2 hidden shrink-0 text-[10px] font-medium uppercase tracking-widest text-mute md:block">Schnellzugriff</span>
      <div className="flex items-center gap-1">
        {quickParts.map((p) => {
          const active = placing === p.id;
          const qInfo = QUICK.find((q) => q.id === p.id);
          return (
            <Tooltip
              key={p.id}
              content={`${p.name}\n${qInfo?.desc ?? p.description ?? ""}\nKategorie: ${p.category}\nKlick: platzieren, nochmal: abbrechen\nTastatur: Doppelklick Inspector`}
              side="bottom"
            >
              <button
                className="flex h-8 min-w-[48px] items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? "var(--accent)" : "var(--panel-2)",
                  color: active ? "var(--accent-contrast)" : "var(--text)",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                }}
                onClick={() => setPlacing(active ? null : p.id)}
              >
                <CategoryIcon category={p.category} size={14} />
                <span className="mono text-[10px]">{qInfo?.label ?? p.ref}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="mx-2 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      <span className="mr-1 hidden text-[10px] text-mute md:inline">Probes</span>
      <div className="flex items-center gap-1">
        {PROBES.map((b) => {
          const active = placingProbe === b.k;
          return (
            <Tooltip key={b.k} content={`${b.t}\n${b.desc}\nFarbkodiert: V=gelb, A=blau, W=violett, REF=grau, D=grün\nKlick auf Leitung platzieren, Esc abbrechen`} side="bottom">
              <button
                className="grid h-8 min-w-[36px] place-items-center rounded-lg border text-[11px] font-bold leading-none transition-colors"
                style={{
                  borderColor: active ? b.c : "var(--border)",
                  background: active ? b.c : `color-mix(in srgb, ${b.c} 18%, var(--panel-2))`,
                  color: active ? "#0f172a" : b.c,
                }}
                onClick={() => setPlacingProbe(active ? null : b.k)}
              >
                {b.l}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="mx-2 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      <Tooltip content={`Bibliothek öffnen\nZeigt alle 402 Bauteile mit Symbol-Vorschau, Beschreibung, Datenblatt\nShortcut: ⌘K oder Strg+K\n"/" fokussiert Suche`} side="bottom">
        <button className="btn h-8 px-3 text-[11px]" onClick={toggleLibrary}>
          📚 Bibliothek… ⌘K
        </button>
      </Tooltip>

      <span className="ml-2 hidden text-[9px] text-mute md:inline">Hover für Info • Doppelklick Inspector • Rechtsklick Menü • Alt+Hover Messwerte im Run</span>
    </div>
  );
}
