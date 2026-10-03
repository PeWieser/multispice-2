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
import { ToolGroup, cx } from "./ui";

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
  { k: "current", l: "A", t: "Strom-Probe", c: "var(--teal)", key: "A" },
];

const EXTRA_PROBES: ProbeItem[] = [
  { k: "voltage_current", l: "V·A", t: "Spannung + Strom", c: "var(--warn)" },
  { k: "power", l: "W", t: "Leistungs-Probe", c: "var(--violet)" },
  { k: "diff", l: "ΔV", t: "Differenz-Probe", c: "var(--err)" },
  { k: "ref", l: "REF", t: "Referenz-Probe", c: "var(--ink-3)" },
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
      className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto no-scrollbar border-b px-3.5 border-hairline bg-surface"
    >
      <button
        type="button"
        aria-pressed={libraryOpen}
        className={cx(
          "pressable ring-focus inline-flex h-8 shrink-0 items-center gap-2 rounded-field px-3 text-xs font-semibold",
          libraryOpen ? "bg-accent-soft text-accent shadow-[inset_0_0_0_0.5px_var(--accent-mid)]" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
        )}
        onClick={toggleLibrary}
        title={adaptShortcut("Bauteil-Bibliothek öffnen (⌘K)", apple)}
      >
        <LibraryIcon size={14} />
        <span className="hidden sm:inline">Bibliothek</span>
      </button>

      <div className="h-5 w-px shrink-0 bg-hairline" />

      {/* 1. Grundbauteile (R, C, L, VDC, GND) – großzügige Schaltzeichen-Kacheln */}
      <ToolGroup label="Schnell-Bauteile">
        {quickParts.map((p) => {
          const active = placing === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const sx = e.clientX;
                const sy = e.clientY;
                let started = false;
                const onMove = (ev: PointerEvent) => {
                  if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
                    started = true;
                    setPlacing(p.id);
                    useHud.setState({ dragPart: p.id });
                  }
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
              onDragStart={(e) => e.preventDefault()}
              className={cx(
                "pressable ring-focus grid h-7 w-9 shrink-0 place-items-center rounded-[8px]",
                active ? "bg-accent-soft text-accent shadow-[inset_0_0_0_0.5px_var(--accent-mid)]" : "text-ink hover:bg-surface-3",
              )}
              title={`${p.name} – platzieren (R = drehen, M = spiegeln)`}
              aria-label={p.name}
              aria-pressed={active}
              onClick={() => setPlacing(active ? null : p.id)}
            >
              <PartGlyph partId={p.id} category={p.category} size={20} symbolStyle={resolvedStyle} />
            </button>
          );
        })}
      </ToolGroup>

      <div className="h-5 w-px shrink-0 bg-hairline" />

      {/* 2. Zeichenwerkzeuge (Auswahl, [Stift | Radiergummi | Knotenpunkt], [Netzname | Notiz]) */}
      {tools ? <div className="flex shrink-0 items-center">{tools}</div> : null}
      {tools ? <div className="h-5 w-px shrink-0 bg-hairline" /> : null}

      {/* 3. Messsonden (Probes) – V & A direkt + Dropdown für Spezial-Sonden */}
      <ToolGroup label="Messsonden">
        {PRIMARY_PROBES.map((b) => {
          const active = placingProbe === b.k;
          return (
            <button
              key={b.k}
              type="button"
              aria-pressed={active}
              className={cx(
                "pressable ring-focus flex h-7 shrink-0 items-center gap-2 rounded-full pl-2 pr-3 text-xs font-semibold leading-none",
                active ? "bg-accent-soft text-accent shadow-[inset_0_0_0_0.5px_var(--accent-mid)]" : "text-ink hover:bg-surface-3",
              )}
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
          className={cx(
            "pressable ring-focus flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold leading-none",
            activeExtraProbe
              ? "bg-accent-soft text-accent shadow-[inset_0_0_0_0.5px_var(--accent-mid)]"
              : probeMenuOpen
                ? "bg-surface-3 text-ink"
                : "text-ink-2 hover:bg-surface-3 hover:text-ink",
          )}
          title="Weitere Messsonden (V·A, Leistung W, Differenz ΔV, Referenz REF, Digital D)" aria-label="Weitere Messsonden (V·A, Leistung W, Differenz ΔV, Referenz REF, Digital D)"
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
              className="rise fixed z-popover min-w-[232px] rounded-panel bg-overlay p-1 shadow-3 backdrop-blur-xl backdrop-saturate-150"
              style={{
                left: menuPos.left,
                top: menuPos.top,
              }}
            >
              <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-3">
                Spezial-Messsonden
              </div>
              {EXTRA_PROBES.map((b) => {
                const active = placingProbe === b.k;
                return (
                  <button
                    key={b.k}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]"
                    style={
                      active
                        ? {
                            background: "var(--tool-active-bg)",
                            color: "var(--tool-active-text)",
                          }
                        : { color: "var(--ink)" }
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
                    <span className="flex-1 text-2xs text-ink-2">{b.t}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
      </ToolGroup>
    </div>
  );
}

export default ComponentStrip;
