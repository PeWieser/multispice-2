"use client";

import { useEffect, useState } from "react";
import { Activity, Crosshair, Grid3X3, Settings, SlidersHorizontal, X } from "lucide-react";
import { ThemePref, useEditor } from "@/state/editor";
import {
  loadHoverConfig,
  saveHoverConfig,
  ProbeHoverConfig,
  SymbolStylePref,
  saveSymbolStyle,
  detectLocaleSymbol,
} from "@/lib/settings";

type SettingsSection = "general" | "canvas" | "simulation" | "probes";

function MacSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150"
      style={{
        background: checked ? "var(--wire-sel, #f59e0b)" : "rgba(120, 128, 140, 0.34)",
      }}
    >
      <span
        className="inline-block h-[16px] w-[16px] rounded-full bg-white shadow transition-transform duration-150"
        style={{
          transform: checked ? "translateX(18px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

function MacSegmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-[7px] p-0.5 text-[11px]"
      style={{
        background: "var(--app)",
        border: "1px solid var(--hairline)",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="rounded-[5px] px-2.5 py-1 font-medium transition-all"
            style={{
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-3)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.22)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      {title && (
        <div className="mb-1.5 px-1 text-[11px] font-semibold tracking-tight text-dim">
          {title}
        </div>
      )}
      <div
        className="divide-y overflow-hidden rounded-[10px]"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderColor: "var(--hairline)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-3.5 py-2.5"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-[var(--ink)]">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[11px] leading-snug text-mute">{subtitle}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsDialog({
  open = true,
  onClose,
}: {
  open?: boolean;
  onClose: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [hoverCfg, setHoverCfg] = useState<ProbeHoverConfig>(() => loadHoverConfig());

  const theme = useEditor((s) => s.theme);
  const symbolStyle = useEditor((s) => s.symbolStyle);
  const showGrid = useEditor((s) => s.showGrid);
  const snap = useEditor((s) => s.snap);
  const autoRoute = useEditor((s) => s.autoRoute);
  const showRulers = useEditor((s) => s.showRulers);
  const showPageFrame = useEditor((s) => s.showPageFrame);
  const showCurrentFlow = useEditor((s) => s.showCurrentFlow);
  const currentFlowDirection = useEditor((s) => s.currentFlowDirection);
  const showVoltageColors = useEditor((s) => s.showVoltageColors);
  const showInlineValues = useEditor((s) => s.showInlineValues);
  const showErcMarkers = useEditor((s) => s.showErcMarkers);
  const showRated = useEditor((s) => s.showRated);
  const st = useEditor.getState;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const updateHover = (patch: Partial<ProbeHoverConfig>) => {
    const next = { ...hoverCfg, ...patch };
    setHoverCfg(next);
    saveHoverConfig(next);
    window.dispatchEvent(new Event("multispice-settings"));
  };

  const applyTheme = (t: ThemePref) => {
    st().setTheme(t);
    try {
      localStorage.setItem("multispice.theme", t);
    } catch {}
  };

  const applySymbolStyle = (s: SymbolStylePref) => {
    st().setSymbolStyle(s);
    saveSymbolStyle(s);
  };

  const navItems: Array<{
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "general", label: "Allgemein", icon: <SlidersHorizontal size={14} /> },
    { id: "canvas", label: "Arbeitsfläche", icon: <Grid3X3 size={14} /> },
    { id: "simulation", label: "Simulation", icon: <Activity size={14} /> },
    { id: "probes", label: "Messsonden", icon: <Crosshair size={14} /> },
  ];

  const activeStd: "iec" | "ansi" =
    symbolStyle === "auto" ? detectLocaleSymbol() : symbolStyle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        className="flex h-[460px] max-h-[88vh] w-[660px] max-w-[96vw] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--hairline-strong)",
          boxShadow: "var(--shadow-3)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* W111: Einheitliche obere Fensterleiste wie alle anderen App-Fenster */}
        <div
          className="flex h-9 shrink-0 items-center justify-between gap-2 px-3"
          style={{
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink)]">
            <Settings size={13} className="text-mute" />
            <span>Einstellungen</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            title="Schließen (Esc)"
            aria-label="Schließen"
            className="btn h-6 px-1 py-0.5"
          >
            <X size={13} />
          </button>
        </div>

        {/* macOS Split View: Sidebar + Content */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Sidebar */}
          <aside
            className="flex shrink-0 gap-1 overflow-x-auto p-2 sm:w-[176px] sm:flex-col sm:overflow-visible sm:p-2.5"
            style={{
              background: "var(--app)",
              borderRight: "1px solid var(--hairline)",
            }}
          >
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-left text-[12px] font-medium whitespace-nowrap transition-colors"
                  style={{
                    background: active
                      ? "rgba(245, 158, 11, 0.16)"
                      : "transparent",
                    color: active ? "var(--wire-sel, #f59e0b)" : "var(--ink)",
                  }}
                >
                  <span className="shrink-0 opacity-85">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-5">
            {section === "general" && (
              <>
                <SettingsGroup title="Darstellung">
                  <SettingsRow
                    title="Erscheinungsbild"
                    subtitle="Farbschema der Benutzeroberfläche und des Schaltplans"
                  >
                    <MacSegmented<ThemePref>
                      value={theme}
                      options={[
                        { value: "system", label: "System" },
                        { value: "dark", label: "Dunkel" },
                        { value: "light", label: "Hell" },
                      ]}
                      onChange={applyTheme}
                    />
                  </SettingsRow>
                </SettingsGroup>

                <SettingsGroup title="Schaltplan-Norm">
                  <SettingsRow
                    title="Bauteil-Symbole"
                    subtitle="Darstellung von Widerständen, Kondensatoren und Logikgattern"
                  >
                    <MacSegmented<SymbolStylePref>
                      value={symbolStyle}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "iec", label: "IEC (EU)" },
                        { value: "ansi", label: "ANSI (US)" },
                      ]}
                      onChange={applySymbolStyle}
                    />
                  </SettingsRow>
                  <div className="grid grid-cols-3 gap-2.5 p-3">
                    <SymbolPreviewCard label="Widerstand" std={activeStd} kind="R" />
                    <SymbolPreviewCard label="Kondensator" std={activeStd} kind="C" />
                    <SymbolPreviewCard label="Operationsverstärker" std={activeStd} kind="OP" />
                  </div>
                </SettingsGroup>
              </>
            )}

            {section === "canvas" && (
              <>
                <SettingsGroup title="Raster & Leitungsführung">
                  <SettingsRow
                    title="Raster einblenden"
                    subtitle="Punktraster im Schaltplan-Hintergrund darstellen"
                  >
                    <MacSwitch
                      checked={showGrid}
                      onChange={() => useEditor.setState({ showGrid: !showGrid })}
                      label="Raster einblenden"
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Am Raster ausrichten"
                    subtitle="Bauteile und Knoten auf das 10-px-Raster fangen"
                  >
                    <MacSwitch
                      checked={snap}
                      onChange={() => useEditor.setState({ snap: !snap })}
                      label="Am Raster ausrichten"
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Orthogonale Leitungsführung"
                    subtitle="Leitungen automatisch im 90°-Winkel um Hindernisse führen"
                  >
                    <MacSwitch
                      checked={autoRoute}
                      onChange={() => useEditor.setState({ autoRoute: !autoRoute })}
                      label="Orthogonale Leitungsführung"
                    />
                  </SettingsRow>
                </SettingsGroup>

                <SettingsGroup title="Blatt & Hilfslinien">
                  <SettingsRow
                    title="Lineale anzeigen"
                    subtitle="Koordinaten-Lineale am oberen und linken Rand"
                  >
                    <MacSwitch
                      checked={showRulers}
                      onChange={() => st().toggleRulers()}
                      label="Lineale anzeigen"
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Blattrand & Schriftfeld"
                    subtitle="Zeichnungsrahmen mit Titelstempel einblenden"
                  >
                    <MacSwitch
                      checked={showPageFrame}
                      onChange={() => st().togglePageFrame()}
                      label="Blattrand & Schriftfeld"
                    />
                  </SettingsRow>
                </SettingsGroup>
              </>
            )}

            {section === "simulation" && (
              <>
                <SettingsGroup title="Stromfluss & Potentiale">
                  <SettingsRow
                    title="Stromfluss animieren"
                    subtitle="Bewegte Ladungsträger während der laufenden Simulation zeigen"
                  >
                    <MacSwitch
                      checked={showCurrentFlow}
                      onChange={() => st().toggleCurrentFlow()}
                      label="Stromfluss animieren"
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Stromrichtung"
                    subtitle="Physikalischer Elektronenfluss (− → +) oder technische Richtung (+ → −)"
                  >
                    <MacSegmented<"electron" | "conventional">
                      value={currentFlowDirection}
                      options={[
                        { value: "electron", label: "Elektronen (− → +)" },
                        { value: "conventional", label: "Technisch (+ → −)" },
                      ]}
                      onChange={(dir) => st().setCurrentFlowDirection(dir)}
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Spannungsfarben auf Leitungen"
                    subtitle="Leitungen entsprechend ihrem Knotenpotential einfärben"
                  >
                    <MacSwitch
                      checked={showVoltageColors}
                      onChange={() => st().toggleVoltageColors()}
                      label="Spannungsfarben auf Leitungen"
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Live-Messwerte an Knoten"
                    subtitle="Spannungswerte direkt im Schaltplan einblenden"
                  >
                    <MacSwitch
                      checked={showInlineValues}
                      onChange={() => st().toggleInlineValues()}
                      label="Live-Messwerte an Knoten"
                    />
                  </SettingsRow>
                </SettingsGroup>

                <SettingsGroup title="Prüfung & Grenzwerte">
                  <SettingsRow
                    title="ERC-Fehlermarker"
                    subtitle="Offene Pins und Kurzschlüsse im Schaltplan markieren"
                  >
                    <MacSwitch
                      checked={showErcMarkers}
                      onChange={() => st().toggleErcMarkers()}
                      label="ERC-Fehlermarker"
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="Bauteil-Überlastung anzeigen"
                    subtitle="Überschrittene Verlustleistungs- und Maximalwerte hervorheben"
                  >
                    <MacSwitch
                      checked={showRated}
                      onChange={() => st().toggleRated()}
                      label="Bauteil-Überlastung anzeigen"
                    />
                  </SettingsRow>
                </SettingsGroup>
              </>
            )}

            {section === "probes" && (
              <SettingsGroup title="Angezeigte Messgrößen (Alt + Hover)">
                <SettingsRow title="Netzname">
                  <MacSwitch
                    checked={hoverCfg.showNetName}
                    onChange={() => updateHover({ showNetName: !hoverCfg.showNetName })}
                    label="Netzname"
                  />
                </SettingsRow>
                <SettingsRow title="Spannung (V)">
                  <MacSwitch
                    checked={hoverCfg.showV}
                    onChange={() => updateHover({ showV: !hoverCfg.showV })}
                    label="Spannung (V)"
                  />
                </SettingsRow>
                <SettingsRow title="Stromstärke (I)">
                  <MacSwitch
                    checked={hoverCfg.showI}
                    onChange={() => updateHover({ showI: !hoverCfg.showI })}
                    label="Stromstärke (I)"
                  />
                </SettingsRow>
                <SettingsRow title="Leistung (P)">
                  <MacSwitch
                    checked={hoverCfg.showP}
                    onChange={() => updateHover({ showP: !hoverCfg.showP })}
                    label="Leistung (P)"
                  />
                </SettingsRow>
                <SettingsRow title="Frequenz (f)">
                  <MacSwitch
                    checked={hoverCfg.showFreq}
                    onChange={() => updateHover({ showFreq: !hoverCfg.showFreq })}
                    label="Frequenz (f)"
                  />
                </SettingsRow>
              </SettingsGroup>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function SymbolPreviewCard({
  label,
  std,
  kind,
}: {
  label: string;
  std: "iec" | "ansi";
  kind: "R" | "C" | "OP";
}) {
  return (
    <div
      className="flex flex-col items-center rounded-[8px] p-2"
      style={{
        background: "var(--app)",
        border: "1px solid var(--hairline)",
      }}
    >
      <svg width="88" height="36" viewBox="-44 -18 88 36">
        {kind === "R" &&
          (std === "iec" ? (
            <g stroke="var(--symbol)" strokeWidth="1.6" fill="none">
              <line x1="-34" y1="0" x2="-16" y2="0" />
              <rect x="-16" y="-6" width="32" height="12" />
              <line x1="16" y1="0" x2="34" y2="0" />
            </g>
          ) : (
            <g stroke="var(--symbol)" strokeWidth="1.6" fill="none">
              <polyline points="-34,0 -18,0 -14,-6 -8,6 -2,-6 4,6 10,-6 14,6 18,0 34,0" />
            </g>
          ))}
        {kind === "C" &&
          (std === "iec" ? (
            <g stroke="var(--symbol)" strokeWidth="1.6" fill="none">
              <line x1="-30" y1="0" x2="-4" y2="0" />
              <rect x="-7" y="-9" width="3" height="18" fill="var(--symbol)" />
              <rect x="4" y="-9" width="3" height="18" />
              <line x1="7" y1="0" x2="30" y2="0" />
            </g>
          ) : (
            <g stroke="var(--symbol)" strokeWidth="1.6" fill="none">
              <line x1="-30" y1="0" x2="-4" y2="0" />
              <line x1="-4" y1="-9" x2="-4" y2="9" />
              <path d="M 5,-9 Q 0,0 5,9" />
              <line x1="3" y1="0" x2="30" y2="0" />
            </g>
          ))}
        {kind === "OP" && (
          <g stroke="var(--symbol)" strokeWidth="1.4" fill="none">
            <polygon points="-14,-11 -14,11 16,0" />
            <line x1="-26" y1="-5" x2="-14" y2="-5" />
            <line x1="-26" y1="5" x2="-14" y2="5" />
            <line x1="16" y1="0" x2="28" y2="0" />
          </g>
        )}
      </svg>
      <div className="mt-1 text-[10px] text-mute">{label}</div>
    </div>
  );
}
