"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import BottomPanel from "./BottomPanel";
import Canvas from "./Canvas";
import MenuBar from "./MenuBar";
import StatusBar from "./StatusBar";
import ComponentStrip from "./ComponentStrip";
import DrawingTools from "./DrawingTools";
import SheetTabs from "./SheetTabs";
import LibraryPalette from "./LibraryPalette";
import Inspector from "./Inspector";
import { engine, useEditor, ThemePref } from "@/state/editor";
import { useIsMobile, useIsTablet, useIsPortrait, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { Menu, X, Library, Settings, SlidersHorizontal, Play, Pause } from "lucide-react";

// R17: Schwere, selten geöffnete Oberflächen laden wir als eigene Chunks –
// der Erststart bezahlt nur noch Canvas, Menü und Statusleiste.
const AnalysisDialog = dynamic(() => import("./AnalysisDialog"), { ssr: false });
const SettingsDialog = dynamic(() => import("./SettingsDialog"), { ssr: false });
const WizardsDialog = dynamic(() => import("./WizardsDialog"), { ssr: false });
const ProjectsDialog = dynamic(() => import("./ProjectsDialog"), { ssr: false });
const InstrumentLayer = dynamic(() => import("./Instruments").then((m) => m.InstrumentLayer), { ssr: false });
const DeviceBar = dynamic(() => import("./Instruments").then((m) => m.DeviceBar), { ssr: false });

/** R8: Ein echtes Schaltblatt für window.print() – Rahmen, Kopf, Stempel.
 *  Der Capture läuft synchron im beforeprint-Event (direkt am <img>-Element),
 *  damit auch Strg+P aus dem Browser das aktuelle Bild bekommt. */
function PrintSheet() {
  const doc = useEditor((s) => s.doc);
  const nets = useEditor((s) => s.netResult.nets);
  // Client-only Mount ohne setState-im-Effect: useSyncExternalStore liefert
  // serverseitig false und im Browser sofort true.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [takenAt, setTakenAt] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const capture = () => {
      const c = document.getElementById("schematic-canvas") as HTMLCanvasElement | null;
      if (!c || !c.width) return;
      try {
        const url = c.toDataURL("image/png");
        if (imgRef.current) imgRef.current.src = url; // synchron – wichtig für Strg+P
        setTakenAt(Date.now());
      } catch {}
    };
    (window as any).__msPrintCapture = capture;
    window.addEventListener("beforeprint", capture);
    return () => {
      window.removeEventListener("beforeprint", capture);
      delete (window as any).__msPrintCapture;
    };
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="print-sheet">
      <div className="sheet-frame">
        <div className="sheet-head">
          <span className="sheet-title">{doc.name || "Unbenanntes Projekt"}</span>
          <span className="sheet-meta">Multispice – Schaltplan</span>
        </div>
        <div className="sheet-img">
          {/* eslint-disable-next-line @next/next/no-img-element -- Druck-Snapshot ist eine data:URL, next/image optimiert hier nichts */}
          <img ref={imgRef} alt="Schaltplan" />
        </div>
        <div className="sheet-stamp">
          <div>
            <span className="stamp-label">Bauteile</span>
            {doc.instances.length}
          </div>
          <div>
            <span className="stamp-label">Leitungen</span>
            {doc.wires.length}
          </div>
          <div>
            <span className="stamp-label">Netze</span>
            {nets.length}
          </div>
          <div>
            <span className="stamp-label">Blatt</span>
            1 / 1
          </div>
          <div>
            <span className="stamp-label">Gedruckt</span>
            {takenAt ? new Date(takenAt).toLocaleString("de-DE") : "–"}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function resolveTheme(pref: ThemePref, systemDark: boolean): "dark" | "light" {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

function MobileTopBar({ onMenu, onSettings }: { onMenu: () => void; onSettings: () => void }) {
  const simRunning = useEditor((s) => s.sim.running);
  const startSim = useEditor((s) => s.startSim);
  const pauseSim = useEditor((s) => s.pauseSim);
  const toggleLibrary = useEditor((s) => s.toggleLibrary);
  const toggleRight = useEditor((s) => s.toggleRight);
  return (
    <div className="flex h-[48px] shrink-0 items-center gap-2 px-3" style={{ background: "var(--panel-solid)", borderBottom: "1px solid var(--border)" }}>
      <button className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }} onClick={onMenu}>
        <Menu size={18} />
      </button>
      <span className="text-[13px] font-semibold">Multispice</span>
      <div className="flex-1" />
      <button className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }} onClick={onSettings} title="Einstellungen">
        <Settings size={16} />
      </button>
      <button className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }} onClick={toggleLibrary} title="Bibliothek">
        <Library size={16} />
      </button>
      <button className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }} onClick={toggleRight} title="Inspector">
        <SlidersHorizontal size={16} />
      </button>
      <button
        className="grid h-9 w-9 place-items-center rounded-lg text-white"
        style={{ background: simRunning ? "var(--warn)" : "var(--ok)" }}
        onClick={() => (simRunning ? pauseSim() : startSim())}
      >
        {simRunning ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  );
}

function MobileBottomToolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const setPlacingProbe = useEditor((s) => s.setPlacingProbe);
  const placingProbe = useEditor((s) => s.placingProbeKind);

  const tools = [
    { id: "select", label: "Auswahl", icon: "↖" },
    { id: "wire", label: "Stift – Netz zeichnen (W)", icon: "✎" },
    { id: "junction", label: "Knotenpunkt setzen/entfernen", icon: "◉" },
    { id: "probe_voltage", label: "Spannungs-Probe", icon: "V" },
    { id: "probe_current", label: "Strom-Probe", icon: "A" },
    { id: "erase", label: "Löschen", icon: "⌫" },
  ] as const;

  // Einmalig beim Start: gespeicherten Stand aus dem Browser wiederherstellen.
  useEffect(() => {
    useEditor.getState().restoreLocalProject();
  }, []);

  return (
    <div className="flex h-[56px] shrink-0 items-center gap-1 overflow-x-auto px-2" style={{ background: "var(--panel-solid)", borderTop: "1px solid var(--border)" }}>
      {tools.map((t) => {
        const active = tool === (t.id as any) || (t.id.startsWith("probe") && placingProbe);
        return (
          <button
            key={t.id}
            className="grid h-[44px] min-w-[56px] place-items-center rounded-xl text-[12px] font-bold border"
            aria-label={t.label}
            title={t.label}
            style={
              active
                ? { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" }
                : { background: "var(--panel-2)", color: "var(--text-dim)", borderColor: "var(--border)" }
            }
            onClick={() => {
              if (t.id.startsWith("probe")) {
                const kind = t.id === "probe_voltage" ? "voltage" : "current";
                setPlacingProbe(placingProbe === kind ? null : (kind as any));
              } else {
                setTool(t.id as any);
              }
            }}
          >
            {t.icon}
          </button>
        );
      })}
      <div className="flex-1" />
      <button className="btn h-[44px] px-3 text-[11px]" onClick={() => useEditor.getState().fitView()}>
        Einpassen
      </button>
    </div>
  );
}

function BottomSheet({ open, onClose, title, children, height = "70vh" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; height?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative flex flex-col rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{ height, background: "var(--panel-solid)", borderTop: "1px solid var(--border-strong)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="h-1 w-8 rounded-full bg-[var(--border-strong)] mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <span className="text-[12px] font-medium mt-2">{title}</span>
          <button className="btn h-7 w-7 p-0 mt-2" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
      <StatusBar />
    </div>
  );
}

function UndoToast() {
  const toast = useEditor((s) => s.toast);
  const clear = useEditor((s) => s.clearToast);
  if (!toast) return null;
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-xl px-4 py-2.5 text-[12px] shadow-2xl backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--panel-solid) 92%, transparent)", border: "1px solid var(--border-strong)", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
      <span className="text-dim">{toast.message}</span>
      {toast.action && toast.actionLabel && (
        <button className="btn btn-primary h-7 px-3 text-[11px]" onClick={() => toast.action?.()}>
          {toast.actionLabel}
        </button>
      )}
      <button className="btn h-7 w-7 p-0" onClick={() => clear()}><X size={12} /></button>
    </div>
  );
}

export default function Workbench() {
  const themePref = useEditor((s) => s.theme);
  const rightOpen = useEditor((s) => s.rightOpen);
  const bottomOpen = useEditor((s) => s.bottomOpen);
  const libraryOpen = useEditor((s) => s.libraryOpen);
  const [dialogKind, setDialogKind] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardsOpen, setWizardsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  // R17: Messen statt raten – Zeit bis Interaktivität in der Konsole sichtbar.
  useEffect(() => {
    performance.mark("ms-ready");
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    console.info(
      `[multispice] bereit nach ${Math.round(performance.now())} ms JS-Laufzeit${nav ? ` · DOM komplett nach ${Math.round(nav.domComplete)} ms` : ""}`,
    );
  }, []);

  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isPortrait = useIsPortrait();

  // System-Theme folgt live dem Betriebssystem (useSyncExternalStore, kein Effect-SetState).
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");

  useEffect(() => {
    try {
      const t = localStorage.getItem("multispice.theme") as ThemePref | null;
      if (t === "dark" || t === "light" || t === "system") {
        useEditor.getState().setTheme(t);
      }
    } catch {}
  }, []);

  const resolved = resolveTheme(themePref, systemDark);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  useEffect(() => {
    useEditor.getState().restoreLocalProject();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useEditor.getState().toggleLibrary();
      }
      // W10: Strg+I / ⌘I toggelt das Inspector-Fenster
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        useEditor.getState().toggleInspector();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
        <MobileTopBar onMenu={() => setMobileMenuOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Canvas />
            <InstrumentLayer />
            {/* Library as bottom sheet on mobile */}
            <BottomSheet open={libraryOpen} onClose={() => useEditor.getState().toggleLibrary()} title="Bibliothek" height="80vh">
              <LibraryPalette />
            </BottomSheet>
            <BottomSheet open={rightOpen} onClose={() => useEditor.getState().toggleRight()} title="Inspector" height="70vh">
              <Inspector />
            </BottomSheet>
            {/* Mobile menu drawer */}
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-50 flex">
                <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
                <div className="relative w-[280px] h-full overflow-auto p-4" style={{ background: "var(--panel-solid)", borderRight: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-semibold">Menü</span>
                    <button className="btn h-7 w-7 p-0" onClick={() => setMobileMenuOpen(false)}>
                      <X size={14} />
                    </button>
                  </div>
                  <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} isMobile />
                </div>
              </div>
            )}
          </div>
          {bottomOpen && (
            <div className="h-[40vh] shrink-0 border-t overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--panel)" }}>
              <BottomPanel />
            </div>
          )}
        </div>
        <MobileBottomToolbar />
        <SheetTabs />
        <StatusBar isMobile />
        {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        <UndoToast />
        <PrintSheet />
      </div>
    );
  }

  // Tablet layout – similar to desktop but inspector as drawer, library as bottom sheet
  if (isTablet) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
          <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} />
        <ComponentStrip tools={<DrawingTools />} />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <Canvas />
              <InstrumentLayer />
              <LibraryPalette />
              <DeviceBar />
            </div>
            <BottomPanel />
          </div>
        </div>
        <SheetTabs />
        <StatusBar />
        {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        <UndoToast />
        <PrintSheet />
      </div>
    );
  }

  // Desktop – original layout but with dvh and better flex
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} />
      <ComponentStrip tools={<DrawingTools />} />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Canvas />
            <InstrumentLayer />
            <LibraryPalette />
            <DeviceBar />
          </div>
          <BottomPanel />
        </div>
      </div>
      {/* W72: Dateileiste unten – Reiter der geöffneten Blätter, + legt eines an. */}
      <SheetTabs />
      <StatusBar />
      {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
      <UndoToast />
        <PrintSheet />
    </div>
  );
}
