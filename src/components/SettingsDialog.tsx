"use client";

import { useState } from "react";
import { Settings, X, Zap, Search, Monitor, Palette, Gauge, Component, Globe } from "lucide-react";
import { Dialog } from "./ui";
import { ProbeHoverConfig, DEFAULT_HOVER, loadHoverConfig, saveHoverConfig, SymbolStylePref, loadSymbolStyle, saveSymbolStyle, resolveSymbolStyle, detectLocaleSymbol } from "@/lib/settings";
import { useEditor } from "@/state/editor";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"probe" | "library" | "canvas" | "general" | "symbols">("probe");
  const [symbolStyle, setSymbolStyleState] = useState<SymbolStylePref>(() => loadSymbolStyle());
  const [hoverCfg, setHoverCfg] = useState<ProbeHoverConfig>(() => loadHoverConfig());
  const showGrid = useEditor((s) => s.showGrid);
  const snap = useEditor((s) => s.snap);
  const autoRoute = useEditor((s) => s.autoRoute);
  const showCurrentFlow = useEditor((s) => s.showCurrentFlow);
  const showVoltageColors = useEditor((s) => s.showVoltageColors);
  const showInlineValues = useEditor((s) => s.showInlineValues);
  const showErcMarkers = useEditor((s) => s.showErcMarkers);
  const showRated = useEditor((s) => s.showRated);
  const theme = useEditor((s) => s.theme);
  const symbolStyleStore = useEditor((s) => s.symbolStyle);

  const saveHover = (patch: Partial<ProbeHoverConfig>) => {
    const next = { ...hoverCfg, ...patch };
    setHoverCfg(next);
    saveHoverConfig(next);
  };

  return (
    <Dialog
      title="Einstellungen"
      subtitle="Human Design: alles konfigurierbar, aber mit sinnvollen Defaults"
      onClose={onClose}
      wide
      actions={
        <button className="btn btn-primary" onClick={onClose}>
          Schließen
        </button>
      }
    >
      <div className="flex gap-2 mb-3">
        {[
          { id: "probe", label: "Probes", icon: <Zap size={12} /> },
          { id: "library", label: "Bibliothek", icon: <Search size={12} /> },
          { id: "canvas", label: "Canvas", icon: <Monitor size={12} /> },
          { id: "symbols", label: "Symbole", icon: <Component size={12} /> },
          { id: "general", label: "Allgemein", icon: <Settings size={12} /> },
        ].map((t) => (
          <button key={t.id} className="tab flex items-center gap-1.5" data-active={tab === t.id} onClick={() => setTab(t.id as any)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "probe" && (
        <div className="space-y-4">
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
              <Zap size={12} /> Alt+Hover Messwerte (Run Modus)
            </div>
            <div className="text-[11px] text-mute mb-3 leading-snug">
              Im Run Modus bei gehaltener Alt Taste und Maus über Leiterbahnen werden Messwerte angezeigt. Hier konfigurierbar was angezeigt wird. Wie in LTSpice/Multisim.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "showNetName", label: "Netz Name anzeigen" },
                { key: "showV", label: "Spannung V" },
                { key: "showI", label: "Strom I (geschätzt)" },
                { key: "showP", label: "Leistung P ≈ V·I" },
                { key: "showFreq", label: "Frequenz f (via FFT)" },
              ].map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-[12px] py-1">
                  <input
                    type="checkbox"
                    checked={(hoverCfg as any)[f.key]}
                    onChange={(e) => saveHover({ [f.key]: e.target.checked } as any)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  <span className="text-dim">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2">Probe Darstellung</div>
            <div className="text-[11px] text-mute mb-2">Leader Stil: Pfeil von Body zu Wire wie Multisim Lupe. Body Offset 32/-28, konstante Screen Größe 10px.</div>
            <div className="grid grid-cols-2 gap-2 text-[11px] mono">
              <div className="rounded px-2 py-1" style={{ background: "var(--panel)" }}>
                V Probe: #fbbf24 amber
              </div>
              <div className="rounded px-2 py-1" style={{ background: "var(--panel)" }}>
                A Probe: #22d3ee cyan
              </div>
              <div className="rounded px-2 py-1" style={{ background: "var(--panel)" }}>
                W Probe: #a78bfa violett
              </div>
              <div className="rounded px-2 py-1" style={{ background: "var(--panel)" }}>
                REF: #94a3b8 grau
              </div>
            </div>
          </div>

          <div className="rounded-lg p-3 text-[11px] text-mute leading-snug" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
            <div className="font-medium mb-1">💡 Tipp</div>
            • Voltage misst gegen GND oder REF-Probe (Dropdown in Inspector).<br />
            • Current Pfeil reversierbar via Rechtsklick → Richtung umkehren.<br />
            • Differential ΔV = V+ - Vref automatisch mit gestrichelter Linie.<br />
            • Probe Table im BottomPanel zeigt alle Werte permanent + CSV Export.
          </div>
        </div>
      )}

      {tab === "library" && (
        <div className="space-y-3">
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2">Bibliothek Anzeige</div>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-[12px]">
                <span>Grid vs List Default</span>
                <select className="input w-32 py-0.5 text-[11px]">
                  <option>Liste (kompakt)</option>
                  <option>Grid (visuell)</option>
                </select>
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Symbol Vorschau Größe</span>
                <select className="input w-32 py-0.5 text-[11px]">
                  <option>40px (kompakt)</option>
                  <option>64px (groß)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" defaultChecked className="h-3.5 w-3.5" /> Datenblatt Links anzeigen
              </label>
            </div>
          </div>
          <div className="text-[11px] text-mute">Suche: Text mit Command Palette, Autocomplete Live, "/" Fokus, "r 10k" für Widerstand 10k. Handcrafted Icons farbcodiert für schnelles Scannen.</div>
        </div>
      )}

      {tab === "canvas" && (
        <div className="space-y-3">
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2">Canvas Darstellung – wie Multisim</div>
            <div className="space-y-2">
              <label className="flex items-center justify-between text-[12px]">
                <span>Raster anzeigen</span>
                <input type="checkbox" checked={showGrid} onChange={() => useEditor.setState({ showGrid: !showGrid })} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Am Raster fangen (10px)</span>
                <input type="checkbox" checked={snap} onChange={() => useEditor.setState({ snap: !snap })} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Auto-Route A* (Manhattan)</span>
                <input type="checkbox" checked={autoRoute} onChange={() => useEditor.setState({ autoRoute: !autoRoute })} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Stromfluss animieren (Pfeile)</span>
                <input type="checkbox" checked={showCurrentFlow} onChange={() => useEditor.getState().toggleCurrentFlow()} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Spannungsfarben (Live)</span>
                <input type="checkbox" checked={showVoltageColors} onChange={() => useEditor.getState().toggleVoltageColors()} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Pin-Namen beim Hover</span>
                <input type="checkbox" defaultChecked={true} className="h-3.5 w-3.5" title="Immer an – zeigt Pin-Name und Netz beim Hovern" disabled />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Netz-Highlight beim Hover</span>
                <input type="checkbox" defaultChecked={true} className="h-3.5 w-3.5" title="Ganzes Netz leuchtet bei Hover – wie Multisim" disabled />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Alignment Guides (Figma-like)</span>
                <input type="checkbox" defaultChecked={true} className="h-3.5 w-3.5" title="Zeigt Hilfslinien beim Ausrichten" disabled />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Live Werte auf Schaltplan (V auf Leitung, A auf Bauteil)</span>
                <input type="checkbox" checked={showInlineValues} onChange={() => useEditor.getState().toggleInlineValues()} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>ERC Marker visuell (rote Fehler direkt am Bauteil)</span>
                <input type="checkbox" checked={showErcMarkers} onChange={() => useEditor.getState().toggleErcMarkers()} className="h-3.5 w-3.5" />
              </label>
              <label className="flex items-center justify-between text-[12px]">
                <span>Rated Blow-up (Rauch wenn überlastet)</span>
                <input type="checkbox" checked={showRated} onChange={() => useEditor.getState().toggleRated()} className="h-3.5 w-3.5" />
              </label>
            </div>
          </div>
          <div className="rounded-lg p-3 text-[11px] leading-snug" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
            <div className="font-medium mb-1">✨ Wow-Details</div>
            • Wire Handles: 44px Hit-Area, 9px Kreis Enden grün, 7px Raute Mitte, 6→10px Plus Insert, Hover +4px weiß, Glow, Index-Label<br/>
            • Double-click: Handle löscht Punkt (wenn &gt;2), Segment fügt Punkt hinzu<br/>
            • Tooltip: Koordinaten, Δ, Länge, Winkel, Magnet-Snap<br/>
            • Pin-Hover: 10px Kreis rgba(91,140,255,0.25) + innerer Dot, Tooltip mit Pin-Name/Netz<br/>
            • Net-Highlight: Hover über Leitung → ganzes Netz accent-2<br/>
            • Ghost: Schatten 12px/6px, Snap-Indikator, 65% Opacity<br/>
            • Marquee: gestrichelt 6/4, Count Badge mit Größe<br/>
            • Empty State: Onboarding mit ⌘K, +R, Probe<br/>
            • Shortcuts Overlay: ? Taste<br/>
            • Library: Arrow Keys + Enter, will-change-transform drag 60fps<br/>
            • Instruments: rAF + direct DOM, will-change-transform, commit on up
          </div>
        </div>
      )}

      {tab === "symbols" && (
        <div className="space-y-3">
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
              <Component size={12} /> Bauteil-Symbole – ISO (IEC) vs ANSI (US)
            </div>
            <div className="text-[11px] text-mute mb-3 leading-snug">
              Multisim erlaubt ISO (europäisch, Rechteck-Widerstand) und ANSI (amerikanisch, Zickzack). Standardmäßig nach Browser-Sprache: DE/FR → IEC, US → ANSI. Wie in professionellen EDA Tools.
            </div>
            <div className="flex gap-1.5 mb-3">
              {(["auto", "iec", "ansi"] as const).map((s) => (
                <button
                  key={s}
                  className="tab flex-1 flex flex-col items-center gap-1 py-2"
                  data-active={symbolStyle === s}
                  onClick={() => {
                    setSymbolStyleState(s);
                    saveSymbolStyle(s);
                    useEditor.getState().setSymbolStyle(s);
                  }}
                >
                  <span className="text-[12px] font-medium">{s === "auto" ? "Auto" : s === "iec" ? "IEC / ISO" : "ANSI / US"}</span>
                  <span className="text-[9px] text-mute">{s === "auto" ? `Erkannt: ${detectLocaleSymbol().toUpperCase()} (${navigator.language})` : s === "iec" ? "Rechteck EU" : "Zickzack US"}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg p-2.5 border" style={{ background: "var(--panel)", borderColor: symbolStyle === "iec" || (symbolStyle === "auto" && detectLocaleSymbol() === "iec") ? "var(--accent)" : "var(--border)" }}>
                <div className="font-medium mb-1">IEC / ISO (EU) – Standard DE</div>
                <div className="mono text-[10px] text-mute leading-tight">
                  ▭ Widerstand Rechteck<br/>
                  ▭▭ Poti Rechteck mit Pfeil<br/>
                  ∿∿ Induktor Bögen<br/>
                  Wie in KiCad, EasyEDA EU
                </div>
                <div className="mt-2 flex justify-center">
                  <svg width={80} height={24} viewBox="-30 -10 60 20"><path d="M-30 0 H-20 M-20 -7 H20 V7 H-20 Z M20 0 H30" stroke="currentColor" fill="none" strokeWidth={1.5} /></svg>
                </div>
              </div>
              <div className="rounded-lg p-2.5 border" style={{ background: "var(--panel)", borderColor: symbolStyle === "ansi" || (symbolStyle === "auto" && detectLocaleSymbol() === "ansi") ? "var(--accent)" : "var(--border)" }}>
                <div className="font-medium mb-1">ANSI / US – Standard US</div>
                <div className="mono text-[10px] text-mute leading-tight">
                  〰 Widerstand Zickzack<br/>
                  〰 Poti Zickzack mit Pfeil<br/>
                  ⌇ Induktor geschweift<br/>
                  Wie in Multisim US, LTspice
                </div>
                <div className="mt-2 flex justify-center">
                  <svg width={80} height={24} viewBox="-30 -10 60 20"><path d="M-30 0 H-20 L-16 -8 L-12 8 L-8 -8 L-4 8 L0 -8 L4 8 L8 -8 L12 8 L16 -8 L20 0 H30" stroke="currentColor" fill="none" strokeWidth={1.5} /></svg>
                </div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-mute flex items-center gap-1.5">
              <Globe size={10} /> Browser: {typeof navigator !== "undefined" ? navigator.language : "–"} → {resolveSymbolStyle(symbolStyle).toUpperCase()} aktiv • Speichert in localStorage
            </div>
          </div>
          <div className="rounded-lg p-3 text-[11px] text-mute leading-snug" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
            <div className="font-medium mb-1">💡 Tipp</div>
            In DE/FR wird IEC (Rechteck) erwartet, in US ANSI (Zickzack). Auto erkennt via <code>navigator.language</code>. Umschalten sofort sichtbar auf Canvas + Library Vorschau.
          </div>
        </div>
      )}

      {tab === "general" && (
        <div className="space-y-3">
          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
              <Palette size={12} /> Theme
            </div>
            <div className="flex gap-1.5">
              {(["system", "dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  className="tab flex-1"
                  data-active={theme === t}
                  onClick={() => {
                    useEditor.getState().setTheme(t);
                    try {
                      localStorage.setItem("multispice.theme", t);
                    } catch {}
                  }}
                >
                  {t === "system" ? "System Auto" : t === "dark" ? "Dunkel" : "Hell"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
            <div className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
              <Gauge size={12} /> Performance
            </div>
            <div className="text-[11px] text-mute">Abtastrate, Temperatur etc im Inspector → Solver Tab. Hier nur Anzeige.</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] mono">
              <div className="rounded px-2 py-1" style={{ background: "var(--panel)" }}>
                Bauteile: {useEditor.getState().netResult.netlist.devices.length}
              </div>
              <div className="rounded px-2 py-1" style={{ background: "var(--panel)" }}>
                Knoten: {useEditor.getState().netResult.nets.length}
              </div>
            </div>
          </div>

          <div className="rounded-lg p-3 text-[11px] text-mute leading-snug" style={{ background: "color-mix(in srgb, var(--ok) 8%, transparent)" }}>
            <div className="font-medium mb-1">♿ Accessibility</div>
            • Alle Buttons haben aria-label, Tooltips, Keyboard Shortcuts<br />
            • Hit Targets min 44x44px auf Mobile<br />
            • Kontrast AA, tabular-nums für Zahlen<br />
            • Screenreader: role=log für Konsole, aria-pressed für Toggles<br />
            • Motion ≤250ms, prefers-reduced-motion Support
          </div>
        </div>
      )}
    </Dialog>
  );
}
