"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEditor, useHud } from "@/state/editor";
import { PARTS, PartDef } from "@/lib/library/catalog";
import { ProbeKind } from "@/lib/schematic/model";
import { PartGlyph } from "@/components/PartGlyphs";
import { resolveSymbolStyle } from "@/lib/settings";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { ChevronDown, Library as LibraryIcon } from "lucide-react";

/* W7 / W69 / W73 / W88 / W97: Luftige, klar gegliederte Werkzeugleiste:
   1. Bibliothek-Button links (Eingangstür zu allen 410 Bauteilen)
   2. 5 Grundbauteile (R, C, L, VDC, GND) mit großzügigem Abstand
   3. Zeichenwerkzeuge als Segmented-Control-Kapseln
   4. Messsonden rechts: V und A direkt + Dropdown für Spezial-Sonden (V·A, W, ΔV, REF, D) */

const QUICK: Array<{ id: string; label: string }> = [
  { id: "resistor", label: "R" },
  { id: "capacitor", label: "C" },
  { id: "inductor", label: "L" },
  { id: "vdc", label: "VDC" },
  { id: "gnd", label: "GND" },
];

interface ProbeItem {
  k: ProbeKind;
  l: string;
  t: string;
  c: string;
  key?: string;
}

const PRIMARY_PROBES: ProbeItem[] = [
  { k: "voltage", l: "V", t: "Spannungs-Probe", c: "var(--warn)", key: "V" },
  { k: "current", l: "A", t: "Strom-Probe", c: "var(--accent-2)", key: "A" },
];

const EXTRA_PROBES: ProbeItem[] = [
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

  const [probeMenuOpen, setProbeMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const resolvedStyle = resolveSymbolStyle(symbolStylePref);
  const quickParts: PartDef[] = QUICK.map((q) => PARTS.find((p) => p.id === q.id)!).filter(Boolean);
  const activeExtraProbe = EXTRA_PROBES.find((p) => p.k === placingProbe) ?? null;

  useEffect(() => {
    if (!probeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreBtnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setProbeMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProbeMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [probeMenuOpen]);

  const toggleProbeMenu = () => {
    if (!probeMenuOpen && moreBtnRef.current) {
      const r = moreBtnRef.current.getBoundingClientRect();
      const menuHeight = 220;
      const openUpwards = r.bottom + menuHeight > window.innerHeight;
      setMenuPos({
        left: Math.max(8, Math.min(window.innerWidth - 220, r.left)),
        top: openUpwards ? Math.max(8, r.top - menuHeight - 6) : r.bottom + 6,
      });
    }
    setProbeMenuOpen((v) => !v);
  };

  return (
    <div
      className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto no-scrollbar border-b px-3.5"
      style={{ borderColor: "var(--border)", background: "var(--panel)" }}
    >
      <button
        type="button"
        className="btn h-8 shrink-0 gap-2 px-3 text-[11.5px] font-semibold"
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
        title={adaptShortcut("Bauteil-Bibliothek öffnen (⌘K)", apple)}
      >
        <LibraryIcon size={14} />
        <span className="hidden sm:inline">Bibliothek</span>
      </button>

      <div className="h-5 w-px shrink-0" style={{ background: "var(--border-strong)" }} />

      {/* 1. Grundbauteile (R, C, L, VDC, GND) – großzügige Schaltzeichen-Kacheln */}
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Schnell-Bauteile">
        {quickParts.map((p) => {
          const active = placing === p.id;
          return (
            <button
              key={p.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/multispice-part", p.id);
                e.dataTransfer.effectAllowed = "copy";
                useHud.setState({ dragPart: p.id });
              }}
              onDragEnd={() => useHud.setState({ dragPart: null })}
              className="grid h-8 w-10 shrink-0 place-items-center rounded-md border transition-colors"
              style={{
                background: active ? "var(--tool-active-bg)" : "var(--panel-2)",
                color: active ? "var(--tool-active-text)" : "var(--text)",
                borderColor: active ? "var(--tool-active-border)" : "var(--border)",
                boxShadow: active
                  ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)"
                  : "none",
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

      <div className="h-5 w-px shrink-0" style={{ background: "var(--border-strong)" }} />

      {/* 2. Zeichenwerkzeuge (Auswahl, [Stift | Radiergummi | Knotenpunkt], [Netzname | Notiz]) */}
      {tools ? <div className="flex shrink-0 items-center">{tools}</div> : null}
      {tools ? <div className="h-5 w-px shrink-0" style={{ background: "var(--border-strong)" }} /> : null}

      {/* 3. Messsonden (Probes) – V & A direkt + Dropdown für Spezial-Sonden */}
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Messsonden">
        {PRIMARY_PROBES.map((b) => {
          const active = placingProbe === b.k;
          return (
            <button
              key={b.k}
              type="button"
              aria-pressed={active}
              className="flex h-8 shrink-0 items-center gap-2 rounded-full border pl-2 pr-3 text-[11.5px] font-semibold leading-none transition-colors"
              style={{
                borderColor: active
                  ? "var(--tool-active-border)"
                  : `color-mix(in srgb, ${b.c} 42%, var(--border))`,
                background: active
                  ? "var(--tool-active-bg)"
                  : `color-mix(in srgb, ${b.c} 10%, var(--panel-2))`,
                color: active ? "var(--tool-active-text)" : "var(--text)",
                boxShadow: active
                  ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)"
                  : "none",
              }}
              title={b.key ? `${b.t} (${b.key})` : b.t}
              onClick={() => setPlacingProbe(active ? null : b.k)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: b.c,
                  boxShadow: `0 0 0 1px color-mix(in srgb, ${b.c} 55%, #000)`,
                }}
              />
              <span className="mono">{b.l}</span>
            </button>
          );
        })}

        {/* Spezial-Sonden-Dropdown (V·A, W, ΔV, REF, D) */}
        <button
          ref={moreBtnRef}
          type="button"
          aria-expanded={probeMenuOpen}
          aria-haspopup="menu"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border pl-2.5 pr-2.5 text-[11.5px] font-semibold leading-none transition-colors"
          style={{
            borderColor: activeExtraProbe
              ? "var(--tool-active-border)"
              : probeMenuOpen
                ? "var(--border-strong)"
                : "var(--border)",
            background: activeExtraProbe ? "var(--tool-active-bg)" : "var(--panel-2)",
            color: activeExtraProbe ? "var(--tool-active-text)" : "var(--text-dim)",
            boxShadow: activeExtraProbe
              ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)"
              : "none",
          }}
          title="Weitere Messsonden (V·A, Leistung W, Differenz ΔV, Referenz REF, Digital D)"
          onClick={toggleProbeMenu}
        >
          {activeExtraProbe ? (
            <>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: activeExtraProbe.c }}
              />
              <span className="mono">{activeExtraProbe.l}</span>
            </>
          ) : (
            <span>Sonden</span>
          )}
          <ChevronDown size={13} />
        </button>

        {probeMenuOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Weitere Messsonden"
              className="fixed z-[120] min-w-[210px] rounded-xl border p-1.5 shadow-2xl"
              style={{
                left: menuPos.left,
                top: menuPos.top,
                background: "var(--panel-solid)",
                borderColor: "var(--border-strong)",
                boxShadow: "var(--shadow)",
              }}
            >
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-mute">
                Spezial-Messsonden
              </div>
              {EXTRA_PROBES.map((b) => {
                const active = placingProbe === b.k;
                return (
                  <button
                    key={b.k}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                    style={
                      active
                        ? {
                            background: "var(--tool-active-bg)",
                            color: "var(--tool-active-text)",
                          }
                        : { color: "var(--text)" }
                    }
                    onClick={() => {
                      setPlacingProbe(active ? null : b.k);
                      setProbeMenuOpen(false);
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: b.c }}
                    />
                    <span className="mono w-9 font-semibold">{b.l}</span>
                    <span className="flex-1 text-[11.5px] text-dim">{b.t}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

export default ComponentStrip;
