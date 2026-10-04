"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { spectrum } from "@/lib/sim/fft";
import { InstrumentKind, InstrumentWindow, WINDOW_SPECS, useEditor, useHud } from "@/state/editor";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { DeviceFit } from "./DeviceFit";
import { FgScopeLazy, OsziScopeLazy, grid , InspectorBody } from "./Instruments/shared";
import { FrequencyCounter, Multimeter, Wattmeter } from "./Instruments/meters";
import { BodePlotter, DistortionAnalyzer, IvAnalyzer, LogicAnalyzer, NetworkAnalyzer, SpectrumAnalyzer } from "./Instruments/analyzers";
import { LogicConverter, PatternGenerator } from "./Instruments/sources";
import { Window, iconFor } from "./Instruments/Window";


/** W10: Schmale Geräte-Bar am rechten Rand – ein Klick öffnet/fokussiert das
 *  Gerät als Fenster; offene Geräte sind markiert. Unten: Inspector-Toggle. */
export function DeviceBar() {
  const apple = useIsApple();
  const open = useEditor((s) => s.openInstrument);
  const toggleInspector = useEditor((s) => s.toggleInspector);
  const instruments = useEditor((s) => s.instruments);
  // W29: Das Oszi öffnet nicht mehr als freies Fenster – der Bar-Klick
  // platziert das Oszi-Schaltzeichen auf dem Plan.
  const setPlacing = useEditor((s) => s.setPlacing);
  const placing = useEditor((s) => s.placingPartId);
  const items: Array<[InstrumentKind, string]> = [
    ["scope", "Oszilloskop"],
    ["dmm", "Multimeter"],
    ["funcgen", "Funktionsgenerator"],
    ["counter", "Frequenzzähler"],
    ["bode", "Bode-Plotter"],
    ["logic", "Logikanalysator"],
    ["logicconv", "Logic Converter"],
    ["watt", "Wattmeter"],
    ["iv", "IV-Analyzer"],
    ["spectrum", "Spektrumanalysator"],
    ["pattern", "Mustergenerator"],
    ["distortion", "Distortion Analyzer"],
    ["network", "Network Analyzer"],
  ];
  const isOpen = (k: InstrumentKind) => instruments.some((w) => w.kind === k);
  return (
    <div
      className="pointer-events-auto absolute bottom-0 right-0 top-0 z-20 flex w-11 flex-col items-center gap-0.5 overflow-y-auto py-2"
      style={{ background: "var(--surface)", borderLeft: "1px solid var(--hairline)", scrollbarWidth: "none" }}
    >
      {items.map(([k, label]) => {
        // W29/W18: Oszi und FG-2500 starten die Symbol-Platzierung statt ein
        // freies Fenster zu öffnen; „aktiv“ = Platzierung läuft oder Fenster offen.
        const partId = k === "scope" ? "oscilloscope" : k === "funcgen" ? "funcgen" : null;
        const active = partId ? placing === partId || isOpen(k) : isOpen(k);
        return (
          <button
            key={k}
            onPointerDown={(e) => {
              if (!partId || e.button !== 0) return;
              const sx = e.clientX;
              const sy = e.clientY;
              let started = false;
              const onMove = (ev: PointerEvent) => {
                if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) {
                  started = true;
                  setPlacing(partId);
                  useHud.setState({ dragPart: partId });
                }
              };
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
            onClick={() => (partId ? setPlacing(placing === partId ? null : partId) : open(k))}
            title={partId ? `${label} – Schaltzeichen auf dem Plan platzieren (Klick oder Ziehen)` : label}
            aria-label={label}
            aria-pressed={active}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors"
            style={
              active
                ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
                : { color: "var(--ink-2)" }
            }
          >
            {iconFor(k, 15)}
          </button>
        );
      })}
      <div className="h-2 shrink-0" />
      <div className="w-6 shrink-0 border-t border-hairline" />
      <button
        onClick={toggleInspector}
        title={adaptShortcut("Inspector (⌘I)", apple)}
        aria-label="Inspector"
        aria-pressed={isOpen("inspector")}
        className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors"
        style={
          isOpen("inspector")
            ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
            : { color: "var(--ink-2)" }
        }
      >
        {iconFor("inspector", 15)}
      </button>
    </div>
  );
}

/** Runde 19 (W33/W34): Die Gerätefenster liegen in einer eigenen Ebene über der
 *  ganzen App (Portal auf <body>) – sie dürfen Menüband und Leisten überdecken
 *  und werden nicht mehr am Canvas abgeschnitten. Menü-Dropdowns, Dialoge und
 *  Toasts (z-50/z-100) bleiben darüber. */
export function InstrumentLayer() {
  const instruments = useEditor((s) => s.instruments);

  // S5.3: Der W36-Esc-Listener (Messleitung zurücklegen) ist in die definierte
  // Esc-Kette in Canvas.tsx gewandert (Ebene „Messleitung", lib/keyboard.ts).

  if (typeof document === "undefined") return null;
  // W118: In der Windows-Desktop-App öffnen sich alle Messgeräte & der Inspector
  // als echte eigenständige, rahmenlose Windows-OS-Fenster.
  if (typeof window !== "undefined" && window.multispiceDesktop?.isDesktop) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col">
      <div className="relative min-h-0 flex-1">
        {instruments.map((w) => (
          <Window key={w.id} win={w} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

/**
 * W118: Rendert ein einzelnes Messgerät oder den Inspector flächendeckend in einem
 * abgekoppelten, rahmenlosen Windows-OS-Fenster (mit eigener iTunes-for-Windows-Leiste).
 */
export function StandaloneInstrumentView({
  winId,
  fallbackKind,
  fallbackTitle,
}: {
  winId: string;
  fallbackKind: InstrumentKind;
  fallbackTitle?: string;
}) {
  const instruments = useEditor((s) => s.instruments);
  const win: InstrumentWindow = useMemo(() => {
    const found = instruments.find((w) => w.id === winId) ?? instruments.find((w) => w.kind === fallbackKind);
    if (found) return found;
    const spec = WINDOW_SPECS[fallbackKind] ?? { w: 520, h: 360, minW: 320, minH: 240 };
    return {
      id: winId,
      kind: fallbackKind,
      title: fallbackTitle ?? fallbackKind.toUpperCase(),
      x: 0,
      y: 0,
      w: spec.w,
      h: spec.h,
      z: 1,
      minimized: false,
      docked: false,
      config: {},
    };
  }, [instruments, winId, fallbackKind, fallbackTitle]);

  const spec = WINDOW_SPECS[win.kind] ?? { w: 520, h: 360, minW: 320, minH: 240 };
  const isSelfFit = win.kind === "scope" || win.kind === "funcgen" || win.kind === "inspector";

  const renderContent = () => (
    <>
      {win.kind === "scope" && <OsziScopeLazy win={win} />}
      {win.kind === "dmm" && <Multimeter win={win} />}
      {win.kind === "funcgen" && <FgScopeLazy win={win} />}
      {win.kind === "bode" && <BodePlotter win={win} />}
      {win.kind === "logic" && <LogicAnalyzer win={win} />}
      {win.kind === "logicconv" && <LogicConverter win={win} />}
      {win.kind === "watt" && <Wattmeter win={win} />}
      {win.kind === "iv" && <IvAnalyzer />}
      {win.kind === "spectrum" && <SpectrumAnalyzer win={win} />}
      {win.kind === "pattern" && <PatternGenerator />}
      {win.kind === "counter" && <FrequencyCounter win={win} />}
      {win.kind === "distortion" && <DistortionAnalyzer win={win} />}
      {win.kind === "network" && <NetworkAnalyzer win={win} />}
      {win.kind === "inspector" && <InspectorBody />}
    </>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface">
      {isSelfFit ? (
        renderContent()
      ) : (
        <DeviceFit natural={{ w: spec.w, h: spec.h }} allowUpscale>
          <div style={{ width: spec.w, height: spec.h }} className="flex flex-col overflow-hidden">
            {renderContent()}
          </div>
        </DeviceFit>
      )}
    </div>
  );
}

