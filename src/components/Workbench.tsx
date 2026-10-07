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
import ScreenReaderStatus from "./ScreenReaderStatus";
import { engine, useEditor, ThemePref } from "@/state/editor";
import { useIsMobile, useIsTablet, useIsPortrait, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { Menu, X, Library, Settings, SlidersHorizontal, Play, Pause, Undo2, Redo2 } from "lucide-react";
import { Button, IconButton } from "./ui";

// R17: Schwere, selten geöffnete Oberflächen laden wir als eigene Chunks –
// der Erststart bezahlt nur noch Canvas, Menü und Statusleiste.
const AnalysisDialog = dynamic(() => import("./AnalysisDialog"), { ssr: false });
const SettingsDialog = dynamic(() => import("./SettingsDialog"), { ssr: false });
const ReferenceDialog = dynamic(() => import("./ReferenceDialog"), { ssr: false });
const WizardsDialog = dynamic(() => import("./WizardsDialog"), { ssr: false });
const ProjectsDialog = dynamic(() => import("./ProjectsDialog"), { ssr: false });
const PartEditorShell = dynamic(() => import("./partEditor/PartEditorShell"), { ssr: false });
const ExtractPartDialog = dynamic(() => import("./ExtractPartDialog"), { ssr: false });
const SpecConflictDialog = dynamic(() => import("./SpecConflictDialog"), { ssr: false });
const InstrumentLayer = dynamic(() => import("./Instruments").then((m) => m.InstrumentLayer), { ssr: false });
const DeviceBar = dynamic(() => import("./Instruments").then((m) => m.DeviceBar), { ssr: false });
const StandaloneInstrumentView = dynamic(() => import("./Instruments").then((m) => m.StandaloneInstrumentView), { ssr: false });
import { loadCustomParts } from "@/lib/library/customParts";
import { docToSvg, printSchematicSheet } from "@/lib/export/sheet";
import { loadTextContentInEditor, openProjectViaNativeDialogIfAvailable, requestOpenFileDialog } from "@/lib/schematic/openFile";
import { decodeSharePayload, parseShareHash } from "@/lib/share";
import DesktopTitleBar, { isDesktopApp, useDesktopMultiWindowSync } from "./DesktopTitleBar";
import type { InstrumentKind } from "@/state/editor";

/** R8 & W131: Echter Vektor-Entwurf für window.print() – Rahmen, Kopf, Stempel.
 *  Rendert das papierweiße Vektor-SVG aus docToSvg(doc, { frame: false }) direkt
 *  synchron im DOM, sodass sowohl „Drucken …" als auch Strg+P sofort ein
 *  gestochen scharfen Entwurf ohne dunklen Hintergrund drucken. */
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
    <div className="flex h-[48px] shrink-0 items-center gap-1.5 px-2.5 bg-surface border-b border-hairline">
      <button className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 border border-hairline" onClick={onMenu} aria-label="Menü">
        <Menu size={18} />
      </button>
      <span className="text-sm font-semibold">Multispice</span>
      <div className="flex-1" />
      <button
        className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40 bg-surface-2 border border-hairline"
        disabled={!canUndo}
        onClick={undo}
        title="Rückgängig"
        aria-label="Rückgängig"
      >
        <Undo2 size={15} />
      </button>
      <button
        className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40 bg-surface-2 border border-hairline"
        disabled={!canRedo}
        onClick={redo}
        title="Wiederholen"
        aria-label="Wiederholen"
      >
        <Redo2 size={15} />
      </button>
      <button className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 border border-hairline" onClick={onSettings} title="Einstellungen" aria-label="Einstellungen">
        <Settings size={16} />
      </button>
      <button className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 border border-hairline" onClick={toggleLibrary} title="Bibliothek" aria-label="Bibliothek">
        <Library size={16} />
      </button>
      <button className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 border border-hairline" onClick={toggleRight} title="Inspector" aria-label="Inspector">
        <SlidersHorizontal size={16} />
      </button>
      <button
        className="grid h-9 w-9 place-items-center rounded-lg text-white"
        style={{ background: simRunning ? "var(--warn)" : "var(--ok)" }}
        onClick={() => (simRunning ? pauseSim() : startSim())}
        aria-label={simRunning ? "Simulation pausieren" : "Simulation starten"}
        data-spot="start-sim"
      >
        {simRunning ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  );
}

function BottomSheet({ open, onClose, title, children, height = "70vh" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; height?: string }) {
  // S5.16: Esc schließt (wie ModalShell) — BottomSheet ist eigenes Chrom.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-modal flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        className="relative flex flex-col rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        style={{ height, background: "var(--surface)", borderTop: "1px solid var(--hairline-strong)", boxShadow: "var(--shadow-3)" }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between px-4 border-b border-hairline">
          <div className="h-1 w-8 rounded-full bg-hairline-strong mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
          <span className="text-xs font-medium mt-2">{title}</span>
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
  // S5.15: Hinweise schließen sich nach 5 s selbst (Undo-Spam klebt nicht).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useEditor.getState().clearToast(), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="rise fixed bottom-12 left-1/2 z-toast flex -translate-x-1/2 items-center gap-2 rounded-panel bg-overlay py-1.5 pl-4 pr-1.5 text-sm shadow-3 backdrop-blur-xl backdrop-saturate-150">
      <span className="text-ink">{toast.message}</span>
      {toast.action && toast.actionLabel && (
        <Button variant="ghost" size="sm" className="text-accent" onClick={() => toast.action?.()}>
          {toast.actionLabel}
        </Button>
      )}
      <IconButton size="sm" aria-label="Hinweis schließen" onClick={() => clear()}>
        <X />
      </IconButton>
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
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [wizardsOpen, setWizardsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const editorOpen = useEditor((s) => s.partEditor.open);
  const docName = useEditor((s) => s.doc.name);
  const titleSavePending = useEditor((s) => s.savePending);
  const titleSaveHealth = useEditor((s) => s.saveHealth);

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

  // S5.12: UI-Schriftgröße aus localStorage (Kompakt/Standard/Groß).
  useEffect(() => {
    try {
      const f = localStorage.getItem("multispice.uiFontSize");
      if (f === "compact" || f === "standard" || f === "large") {
        useEditor.getState().setUiFontSize(f);
      }
    } catch {}
  }, []);

  const resolved = resolveTheme(themePref, systemDark);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  // S5.12: UI-Schriftgröße — Root-px steuern alle rem-Maße der UI.
  const uiFontSize = useEditor((s) => s.uiFontSize);
  useEffect(() => {
    const px = uiFontSize === "compact" ? 14 : uiFontSize === "large" ? 18 : 16;
    document.documentElement.style.fontSize = `${px}px`;
  }, [uiFontSize]);

  // S5.11: Browser-Tab trägt Entwurfsname + Ungespeichert-Punkt (Desktop:
  // DesktopTitleBar besitzt den Titel; Kindfenster haben eigene Titel).
  useEffect(() => {
    if (isDesktopRuntime) return;
    if (typeof window === "undefined" || window.location.search.includes("desktopWindow=")) return;
    const dirty = titleSavePending || titleSaveHealth.local === "error" || titleSaveHealth.file === "stale";
    document.title = `${dirty ? "• " : ""}${docName || "Unbenannt"} – MultiSpice`;
  }, [isDesktopRuntime, docName, titleSavePending, titleSaveHealth]);

  useEffect(() => {
    loadCustomParts();
    // S5.5: Share-Link im Hash gewinnt gegen das lokale Auto-Save.
    const payload = typeof window !== "undefined" ? parseShareHash(window.location.hash) : null;
    if (payload) {
      try {
        loadTextContentInEditor(decodeSharePayload(payload), "link.msx.json");
      } catch (e) {
        useEditor.getState().log("error", `Share-Link ungültig: ${(e as Error).message}`);
        useEditor.getState().restoreLocalProject();
      }
    } else {
      useEditor.getState().restoreLocalProject();
    }
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
      // W130: Strg+O / ⌘O öffnet den Datei-Dialog (WDA-2: im Web per Event an die Menüleiste)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openProjectViaNativeDialogIfAvailable().then((handled) => {
          if (!handled) requestOpenFileDialog();
        });
      }
      // W131: Strg+P / ⌘P druckt den Entwurf
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
        className="flex h-screen w-screen flex-col overflow-hidden bg-surface border border-hairline-strong"
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
        className="flex h-screen w-screen flex-col overflow-hidden bg-surface border border-hairline-strong"
      >
        <DesktopTitleBar
          title={parsedDesktop.title ?? "Bauteile-Bibliothek"}
          subtitle="MultiSpice Katalog"
          compact
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <LibraryPalette standalone />
        </div>
        <ExtractPartDialog />
        <SpecConflictDialog />
      </div>
    );
  }

  // Mobile layout — W110: Nutzt exakt dieselbe ComponentStrip + DrawingTools wie Desktop/Tablet
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-app">
        <ScreenReaderStatus />
        <MobileTopBar onMenu={() => setMobileMenuOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <ComponentStrip tools={<DrawingTools />} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {!editorOpen && <Canvas />}
            <InstrumentLayer />
            {/* Library as bottom sheet on mobile */}
            <BottomSheet open={libraryOpen} onClose={() => useEditor.getState().toggleLibrary()} title="Bibliothek" height="80vh">
              <LibraryPalette fill onPartEditor={() => useEditor.getState().openPartEditor()} />
            </BottomSheet>
            <BottomSheet open={rightOpen} onClose={() => useEditor.getState().toggleRight()} title="Inspector" height="70vh">
              <Inspector />
            </BottomSheet>
            {/* Mobile menu drawer */}
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-50 flex">
                <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
                <div className="relative w-[280px] h-full overflow-auto p-4 bg-surface border-r border-hairline">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-semibold">Menü</span>
                    <button className="btn h-7 w-7 p-0" onClick={() => setMobileMenuOpen(false)}>
                      <X size={14} />
                    </button>
                  </div>
                  <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} onPartEditor={() => useEditor.getState().openPartEditor()} onReference={() => setReferenceOpen(true)} isMobile />
                </div>
              </div>
            )}
          </div>
          {bottomOpen && (
            <div className="h-[40vh] shrink-0 border-t overflow-hidden border-hairline bg-surface">
              <BottomPanel />
            </div>
          )}
        </div>
        <StatusBar isMobile />
        {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {referenceOpen && <ReferenceDialog onClose={() => setReferenceOpen(false)} />}
        {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
      {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        {editorOpen && <PartEditorShell />}
        <ExtractPartDialog />
        <SpecConflictDialog />
        <UndoToast />
      <PrintSheet />
      </div>
    );
  }

  // Tablet layout – similar to desktop but inspector as drawer, library as bottom sheet
  if (isTablet) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-app">
          <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} onPartEditor={() => useEditor.getState().openPartEditor()} onReference={() => setReferenceOpen(true)} />
        <ComponentStrip tools={<DrawingTools />} />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {!editorOpen && <Canvas />}
              <InstrumentLayer />
              <LibraryPalette onPartEditor={() => useEditor.getState().openPartEditor()} />
              <DeviceBar />
            </div>
            <BottomPanel />
          </div>
        </div>
        <StatusBar />
        {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {referenceOpen && <ReferenceDialog onClose={() => setReferenceOpen(false)} />}
        {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
      {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
        {editorOpen && <PartEditorShell />}
        <ExtractPartDialog />
        <SpecConflictDialog />
        <UndoToast />
      <PrintSheet />
      </div>
    );
  }

  // Desktop – original layout but with dvh and better flex
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-toast focus:rounded-field focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
      >
        Zum Schaltplan springen
      </a>
      <ScreenReaderStatus />
      {isDesktopRuntime && (
        <DesktopTitleBar title={docName ? `${docName} – MultiSpice` : "MultiSpice"} showSaveState />
      )}
      <header className="contents">
      <MenuBar onAnalysis={setDialogKind} onSettings={() => setSettingsOpen(true)} onWizards={() => setWizardsOpen(true)} onProjects={() => setProjectsOpen(true)} onPartEditor={() => useEditor.getState().openPartEditor()} onReference={() => setReferenceOpen(true)} />
      <ComponentStrip tools={<DrawingTools />} />
      </header>
      <main id="workspace" tabIndex={-1} className="relative flex min-h-0 flex-1 outline-none">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {!editorOpen && <Canvas />}
            <InstrumentLayer />
            <LibraryPalette onPartEditor={() => useEditor.getState().openPartEditor()} />
            <DeviceBar />
          </div>
          <BottomPanel />
        </div>
      </main>
      {/* W96: Eine einzige schlanke Fußleiste (links geöffnete Entwürfe, rechts Prüfung & Sim-Zeit). */}
      <StatusBar />
      {dialogKind && <AnalysisDialog kind={dialogKind} onClose={() => setDialogKind(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {referenceOpen && <ReferenceDialog onClose={() => setReferenceOpen(false)} />}
      {wizardsOpen && <WizardsDialog onClose={() => setWizardsOpen(false)} />}
      {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
      {editorOpen && <PartEditorShell />}
      <ExtractPartDialog />
      <SpecConflictDialog />
      <UndoToast />
      <PrintSheet />
    </div>
  );
}
