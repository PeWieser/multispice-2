"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import BottomPanel from "./BottomPanel";
import Canvas from "./Canvas";
import MenuBar from "./MenuBar";
import StatusBar from "./StatusBar";
import ComponentStrip from "./ComponentStrip";
import DrawingTools from "./DrawingTools";
import LibraryPalette from "./LibraryPalette";
import Inspector from "./Inspector";
import { engine, useEditor, ThemePref } from "@/state/editor";
import { useIsMobile, useIsTablet, useIsPortrait, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { Menu, X, Library, Settings, SlidersHorizontal, Play, Pause, Undo2, Redo2 } from "lucide-react";

// R17: Schwere, selten geöffnete Oberflächen laden wir als eigene Chunks –
// der Erststart bezahlt nur noch Canvas, Menü und Statusleiste.
const AnalysisDialog = dynamic(() => import("./AnalysisDialog"), { ssr: false });
const SettingsDialog = dynamic(() => import("./SettingsDialog"), { ssr: false });
const WizardsDialog = dynamic(() => import("./WizardsDialog"), { ssr: false });
const ProjectsDialog = dynamic(() => import("./ProjectsDialog"), { ssr: false });
const PartEditorDialog = dynamic(() => import("./PartEditorDialog"), { ssr: false });
const InstrumentLayer = dynamic(() => import("./Instruments").then((m) => m.InstrumentLayer), { ssr: false });
const DeviceBar = dynamic(() => import("./Instruments").then((m) => m.DeviceBar), { ssr: false });
const StandaloneInstrumentView = dynamic(() => import("./Instruments").then((m) => m.StandaloneInstrumentView), { ssr: false });
import { loadCustomParts } from "@/lib/library/customParts";
import { docToSvg, printSchematicSheet } from "@/lib/export/sheet";
import { openProjectViaNativeDialogIfAvailable } from "@/lib/schematic/openFile";
import DesktopTitleBar, { isDesktopApp, useDesktopMultiWindowSync } from "./DesktopTitleBar";
import type { InstrumentKind } from "@/state/editor";

/** R8 & W131: Echtes Vektor-Schaltblatt für window.print() – Rahmen, Kopf, Stempel.
 *  Rendert das papierweiße Vektor-SVG aus docToSvg(doc, { frame: false }) direkt
 *  synchron im DOM, sodass sowohl „Drucken …" als auch Strg+P sofort ein
 *  gestochen scharfes Schaltblatt ohne dunklen Hintergrund drucken. */
function PrintSheet() {
  const doc = useEditor((s) => s.doc);
  const nets = useEditor((s) => s.netResult.nets);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;
  const svgMarkup = docToSvg(doc, { frame: false, paperColor: "#ffffff" });
  return createPortal(
    <div className="print-sheet">
      <div className="sheet-frame">
        <div className="sheet-head">
          <span className="sheet-title">{doc.name || "Unbenanntes Projekt"}</span>
          <span className="sheet-meta">MultiSpice – Schaltplan</span>
        </div>
        <div
          className="sheet-img"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
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
            <span className="stamp-label">Datum</span>
            {new Date().toLocaleDateString("de-DE")}
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
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  return (
    <div className="flex h-[48px] shrink-0 items-center gap-1.5 px-2.5" style={{ background: "var(--panel-solid)", borderBottom: "1px solid var(--border)" }}>
      <button className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }} onClick={onMenu} aria-label="Menü">
        <Menu size={18} />
      </button>
      <span className="text-[13px] font-semibold">Multispice</span>
      <div className="flex-1" />
      <button
        className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
        disabled={!canUndo}
        onClick={undo}
        title="Rückgängig"
        aria-label="Rückgängig"
      >
        <Undo2 size={15} />
      </button>
      <button
        className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40"
        style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
        disabled={!canRedo}
        onClick={redo}
        title="Wiederholen"
        aria-label="Wiederholen"
      >
        <Redo2 size={15} />
      </button>
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
  const [partEditorOpen, setPartEditorOpen] = useState(false);
  const [partEditorInitialId, setPartEditorInitialId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onOpenStudio = (ev: Event) => {
      const detail = (ev as CustomEvent<{ partId?: string }>).detail;
      setPartEditorInitialId(detail?.partId);
      setPartEditorOpen(true);
    };
    window.addEventListener("multispice-open-part-studio", onOpenStudio);
    return () => window.removeEventListener("multispice-open-part-studio", onOpenStudio);
  }, []);

  const desktopParams = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return "";
      return window.location.search;
    },
    () => "",
  );
  const parsedDesktop = (() => {
    if (!desktopParams) return { role: "main" as const, winId: undefined, kind: undefined, title: undefined };
    const sp = new URLSearchParams(desktopParams);
    const dw = sp.get("desktopWindow");
    if (dw === "instrument") {
      return {
        role: "instrument" as const,
        winId: sp.get("winId") ?? "inst_1",
        kind: (sp.get("kind") ?? "scope") as InstrumentKind,
        title: sp.get("title") ?? "Messgerät",
      };
    }
    if (dw === "library") {
      return {
        role: "library" as const,
        winId: "library",
        kind: undefined,
        title: sp.get("title") ?? "Bauteile-Bibliothek",
      };
    }
    return { role: "main" as const, winId: undefined, kind: undefined, title: undefined };
  })();

  const isDesktopRuntime = useSyncExternalStore(
    () => () => {},
    () => isDesktopApp(),
    () => false,
  );

  useDesktopMultiWindowSync(parsedDesktop.role, parsedDesktop.winId);

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
    loadCustomParts();
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
      // W130: Strg+O / ⌘O öffnet den Datei-Dialog
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openProjectViaNativeDialogIfAvailable();
      }
      // W131: Strg+P / ⌘P druckt das Schaltblatt
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        if (window.multispiceDesktop?.printSvg) {
          e.preventDefault();
          void printSchematicSheet(useEditor.getState().doc);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // W118: Abgekoppelte, rahmenlose Windows-OS-Fenster für Messgeräte/Inspector & Bibliothek
  // mit eigener Fensterleiste im Stil von iTunes für Windows.
  if (parsedDesktop.role === "instrument" && parsedDesktop.kind) {
    return (
      <div
        className="flex h-screen w-screen flex-col overflow-hidden"
        style={{
          background: "var(--panel-solid)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <DesktopTitleBar
          title={parsedDesktop.title ?? "Messgerät"}
          subtitle="MultiSpice Messgerät"
          compact
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <StandaloneInstrumentView
            winId={parsedDesktop.winId ?? "inst_1"}
            fallbackKind={parsedDesktop.kind}
            fallbackTitle={parsedDesktop.title}
          />
        </div>
      </div>
    );
  }

  if (parsedDesktop.role === "library") {
    return (
      <div
        className="flex h-screen w-screen flex-col overflow-hidden"
        style={{
          background: "var(--panel-solid)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <DesktopTitleBar
          title={parsedDesktop.title ?? "Bauteile-Bibliothek"}
          subtitle="MultiSpice Katalog"
          compact
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <LibraryPalette standalone onPartEditor={() => setPartEditorOpen(true)} />
        </div>
        {partEditorOpen && <PartEditorDialog onClose={() => setPartEditorOpen(false)} />}
      </div>
    );
  }

  // Mobile layout — W110: Nutzt exakt dieselbe ComponentStrip + DrawingTools wie Desktop/Tablet
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
        <MobileTopBar onMenu={() => setMobileMenuOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <ComponentStrip tools={<DrawingTools />} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Canvas />
            <InstrumentLayer />
            {/* Library as bottom sheet on mobile */}
            <BottomSheet open={libraryOpen} onClose={() => useEditor.getState().toggleLibrary()} title="Bibliothek" height="80vh">
              <LibraryPalette onPartEditor={() => setPartEditorOpen(true)} />
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
                  <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} onPartEditor={() => setPartEditorOpen(true)} isMobile />
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
        <StatusBar isMobile />
        {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        {partEditorOpen && (
          <PartEditorDialog
            initialPartId={partEditorInitialId}
            onClose={() => {
              setPartEditorOpen(false);
              setPartEditorInitialId(undefined);
            }}
          />
        )}
        <UndoToast />
        <PrintSheet />
      </div>
    );
  }

  // Tablet layout – similar to desktop but inspector as drawer, library as bottom sheet
  if (isTablet) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
          <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} onPartEditor={() => { setPartEditorInitialId(undefined); setPartEditorOpen(true); }} />
        <ComponentStrip tools={<DrawingTools />} />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <Canvas />
              <InstrumentLayer />
              <LibraryPalette onPartEditor={() => { setPartEditorInitialId(undefined); setPartEditorOpen(true); }} />
              <DeviceBar />
            </div>
            <BottomPanel />
          </div>
        </div>
        <StatusBar />
        {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        {partEditorOpen && (
          <PartEditorDialog
            initialPartId={partEditorInitialId}
            onClose={() => {
              setPartEditorOpen(false);
              setPartEditorInitialId(undefined);
            }}
          />
        )}
        <UndoToast />
        <PrintSheet />
      </div>
    );
  }

  // Desktop – original layout but with dvh and better flex
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      {isDesktopRuntime && <DesktopTitleBar title="MultiSpice" />}
      <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} onPartEditor={() => { setPartEditorInitialId(undefined); setPartEditorOpen(true); }} />
      <ComponentStrip tools={<DrawingTools />} />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <Canvas />
            <InstrumentLayer />
            <LibraryPalette onPartEditor={() => { setPartEditorInitialId(undefined); setPartEditorOpen(true); }} />
            <DeviceBar />
          </div>
          <BottomPanel />
        </div>
      </div>
      {/* W96: Eine einzige schlanke Fußleiste (links geöffnete Blätter, rechts Prüfung & Sim-Zeit). */}
      <StatusBar />
      {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
        {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
      {partEditorOpen && (
        <PartEditorDialog
          initialPartId={partEditorInitialId}
          onClose={() => {
            setPartEditorOpen(false);
            setPartEditorInitialId(undefined);
          }}
        />
      )}
      <UndoToast />
        <PrintSheet />
    </div>
  );
}
