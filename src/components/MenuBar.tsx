"use client";

import { useRef, useState } from "react";
import { Pause, Play, Settings as SettingsIcon, Square, Undo2, Redo2 } from "lucide-react";
import { PRESETS } from "@/lib/schematic/tools";
import { ANALYSIS_DEFS } from "@/lib/sim/analysis_defs";
import { buildBom, toSpiceNetlist } from "@/lib/schematic/model";
import { InstrumentKind, ThemePref, useEditor } from "@/state/editor";
import { exportSvg, exportPng, exportPdf } from "@/lib/export/sheet";
import { Menu, MenuItem, MenuSeparator, downloadText, safeName, Tooltip } from "./ui";
import { openFileInEditor } from "@/lib/schematic/openFile";
import { adaptShortcut, useIsApple } from "@/lib/platform";

const MENU_IDS = ["datei", "bearbeiten", "ansicht", "vorlagen", "analysen", "geraete"] as const;

const INSTRUMENT_ITEMS: Array<[InstrumentKind, string]> = [
  ["dmm", "Digitalmultimeter"],
  ["scope", "Oszilloskop"],
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

export default function MenuBar({ onAnalysis, onSettings, onWizards, onProjects, isMobile = false }: { onAnalysis: (kind: string) => void; onSettings?: () => void; onWizards?: () => void; onProjects?: () => void; isMobile?: boolean }) {
  const apple = useIsApple();
  const docName = useEditor((s) => s.doc.name);
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  // W55: Anordnen-Befehle brauchen Bauteile (nicht nur Leitungen) in der Auswahl.
  const selInstances = useEditor((s) => s.selection.filter((id) => s.doc.instances.some((i) => i.id === id)).length);
  const hasWireSelection = useEditor((s) => s.selection.some((id) => s.doc.wires.some((w) => w.id === id)));
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const running = useEditor((s) => s.sim.running);
  const theme = useEditor((s) => s.theme);
  const showCurrentFlow = useEditor((s) => s.showCurrentFlow);
  const showVoltageColors = useEditor((s) => s.showVoltageColors);
  const showInlineValues = useEditor((s) => s.showInlineValues);
  const showRulers = useEditor((s) => s.showRulers);
  const showPageFrame = useEditor((s) => s.showPageFrame);
  const flowDir = useEditor((s) => s.currentFlowDirection);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = useEditor.getState;
  // W8: Ein gemeinsamer offener Menü-State – Hover wechselt, Klick wechselt in einem Klick.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navMenu = (dir: -1 | 1) =>
    setOpenMenu((m) => {
      if (!m) return m;
      const i = MENU_IDS.indexOf(m as (typeof MENU_IDS)[number]);
      return MENU_IDS[(i + dir + MENU_IDS.length) % MENU_IDS.length];
    });
  const menuProps = (id: string) => ({
    open: openMenu === id,
    onOpenChange: (o: boolean) => setOpenMenu(o ? id : null),
    onHoverOpen: () => setOpenMenu((m) => (m ? id : m)),
    onNavigate: navMenu,
  });

  const base = safeName(docName);

  const exportSpice = () => {
    downloadText(`${base}.cir`, toSpiceNetlist(doc, ".tran 10u 20m"));
    st().log("ok", "SPICE-Netzliste exportiert (.cir)");
  };
  // R8: Erst einpassen, dann zwei Frames warten (Neuzeichnen), dann das Blatt
  // synchron capturen und drucken. Strg+P direkt fängt der beforeprint-Hook ab.
  const printSheet = () => {
    st().fitView();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        (window as any).__msPrintCapture?.();
        setTimeout(() => window.print(), 60);
      }),
    );
  };

  const exportJson = () => {
    const envelope = {
      format: "multispice-project",
      version: 2,
      name: doc.name,
      savedAt: new Date().toISOString(),
      doc,
      instruments: st().instruments,
    };
    downloadText(`${base}.msx.json`, JSON.stringify(envelope, null, 2), "application/json");
    st().log("ok", "Projekt als JSON exportiert (inkl. Gerätefenster)");
  };
  const exportBom = () => {
    const rows = buildBom(doc);
    const csv = ["Referenz;Bauteil;Wert;Footprint;Montage;Menge", ...rows.map((r) => `${r.ref};${r.part};${r.value};${r.footprint};${r.mount};${r.qty}`)].join("\n");
    downloadText(`${base}_BOM.csv`, csv, "text/csv");
    st().log("ok", `Stückliste exportiert (${rows.length} Positionen)`);
  };
  // Runde 11 (W19): PNG kommt jetzt aus src/lib/export/sheet.ts (Dokument-Modell,
  // sauberes Blatt statt Screenshot mit Grid/Glow).

  const importFile = (file: File) => {
    void openFileInEditor(file);
  };

  const runDirect = (kind: string) => {
    st().setBottomTab("results");
    void st().runAnalysis(kind, {});
  };

  const setTheme = (t: ThemePref) => {
    st().setTheme(t);
    try { localStorage.setItem("multispice.theme", t); } catch {}
  };

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-mute px-2">Datei</div>
          <button className="btn w-full justify-start" onClick={() => st().newDocument()}>Neuer Schaltplan</button>
          <button className="btn w-full justify-start" onClick={() => st().saveProject()}>Lokal speichern</button>
          <button className="btn w-full justify-start" onClick={() => onProjects?.()}>Projekte …</button>
          <button className="btn w-full justify-start" onClick={() => fileRef.current?.click()}>Importieren</button>
          <button className="btn w-full justify-start" onClick={exportSpice}>Export SPICE</button>
          <button className="btn w-full justify-start" onClick={exportJson}>Export JSON</button>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-mute px-2">Bearbeiten</div>
          <button className="btn w-full justify-start" disabled={!canUndo} onClick={() => st().undo()}>Rückgängig</button>
          <button className="btn w-full justify-start" disabled={!canRedo} onClick={() => st().redo()}>Wiederholen</button>
          <button className="btn w-full justify-start" disabled={!hasSelection} onClick={() => st().copySelection()}>Kopieren</button>
          <button className="btn w-full justify-start" disabled={!hasClipboard} onClick={() => st().pasteClipboard()}>Einfügen</button>
          <button className="btn w-full justify-start" disabled={selInstances < 2} onClick={() => st().alignSelection("left")}>Ausrichten: links</button>
          <button className="btn w-full justify-start" disabled={selInstances < 3} onClick={() => st().distributeSelection("h")}>Verteilen</button>
          <button className="btn w-full justify-start" disabled={!hasWireSelection} onClick={() => st().straightenSelection()}>Leitungen begradigen</button>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-mute px-2">Ansicht</div>
          <label className="flex items-center gap-2 px-2 py-1 text-[12px]"><input type="checkbox" checked={showCurrentFlow} onChange={() => st().toggleCurrentFlow()} /> Stromfluss</label>
          <label className="flex items-center gap-2 px-2 py-1 text-[12px]"><input type="checkbox" checked={showVoltageColors} onChange={() => st().toggleVoltageColors()} /> Spannungsfarben</label>
          <button className="btn w-full justify-start" onClick={() => st().fitView()}>Einpassen</button>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-mute px-2">Analysen</div>
          {ANALYSIS_DEFS.map((a) => (
            <button key={a.kind} className="btn w-full justify-start text-[11px]" onClick={() => (a.direct ? runDirect(a.kind) : onAnalysis(a.kind))}>{a.title} ({a.spice})</button>
          ))}
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-mute px-2">Geräte</div>
          {INSTRUMENT_ITEMS.map(([kind, title]) => (
            <button key={kind} className="btn w-full justify-start text-[11px]" onClick={() => (kind === "scope" ? st().setPlacing("oscilloscope") : kind === "funcgen" ? st().setPlacing("funcgen") : st().openInstrument(kind))}>{title}</button>
          ))}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-mute px-2">Wizards</div>
            <button className="btn w-full justify-start" onClick={() => onWizards?.()}>Wizards</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".json,.cir,.net,.sp,.txt,.asc" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
      </div>
    );
  }

  return (
    <header className="flex h-9 shrink-0 items-center gap-0.5 px-2 text-[12px]"
      style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
      {/* Minimal – no logo */}
      <span className="mr-2 hidden max-w-[140px] truncate text-[11px] text-mute lg:inline">{docName}</span>

      <Menu label="Datei" {...menuProps("datei")}>
        <MenuItem onClick={() => st().newDocument()}>Neuer Schaltplan</MenuItem>
        <MenuItem hint="⌘S" onClick={() => st().saveProject()}>Lokal speichern</MenuItem>
        <MenuItem onClick={() => onProjects?.()}>Projekte …</MenuItem>
        <MenuItem onClick={() => fileRef.current?.click()}>Importieren (.json/.cir/.asc)</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={exportSpice}>Export SPICE (.cir)</MenuItem>
        <MenuItem onClick={() => { exportSvg(st().doc); st().log("ok", "Schaltblatt als SVG exportiert"); }}>Export SVG</MenuItem>
        <MenuItem onClick={() => { exportPng(st().doc); st().log("ok", "Schaltblatt als PNG exportiert"); }}>Export PNG</MenuItem>
        <MenuItem onClick={exportJson}>Export JSON</MenuItem>
        <MenuItem onClick={exportBom}>Export BOM (CSV)</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘P" onClick={printSheet}>Drucken</MenuItem>
        <MenuItem onClick={() => { if (exportPdf(st().doc)) st().log("ok", "Druckfenster geöffnet – dort „Als PDF speichern“ wählen"); else st().log("error", "Pop-up blockiert – Druckfenster konnte nicht geöffnet werden"); }}>Export PDF (Druckfenster)</MenuItem>
      </Menu>

      <Menu label="Bearbeiten" {...menuProps("bearbeiten")}>
        <MenuItem hint="⌘Z" disabled={!canUndo} onClick={() => st().undo()}>Rückgängig</MenuItem>
        <MenuItem hint="⇧⌘Z" disabled={!canRedo} onClick={() => st().redo()}>Wiederholen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="R" disabled={!hasSelection && st().tool !== "place"} onClick={() => st().rotateSelection(1)}>Drehen (+90°)</MenuItem>
        <MenuItem hint="⇧R" disabled={!hasSelection && st().tool !== "place"} onClick={() => st().rotateSelection(-1)}>Gegen Uhrzeigersinn drehen (−90°)</MenuItem>
        <MenuItem hint="M" disabled={!hasSelection && st().tool !== "place"} onClick={() => st().mirrorSelection()}>Spiegeln</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘C" disabled={!hasSelection} onClick={() => st().copySelection()}>Kopieren</MenuItem>
        <MenuItem hint="⌘V" disabled={!hasClipboard} onClick={() => st().pasteClipboard()}>Einfügen</MenuItem>
        <MenuItem hint="⌘D" disabled={!hasSelection} onClick={() => st().duplicateSelection()}>Duplizieren</MenuItem>
        <MenuItem hint="⌘A" onClick={() => st().selectAll()}>Alles auswählen</MenuItem>
        <MenuSeparator />
        <div className="px-2 py-0.5 text-[10px] uppercase tracking-wide text-mute">Anordnen (W55)</div>
        <MenuItem disabled={selInstances < 2} disabledReason="Mindestens zwei Bauteile auswählen" onClick={() => st().alignSelection("left")}>Ausrichten: links</MenuItem>
        <MenuItem disabled={selInstances < 2} disabledReason="Mindestens zwei Bauteile auswählen" onClick={() => st().alignSelection("centerH")}>Ausrichten: waagerecht mittig</MenuItem>
        <MenuItem disabled={selInstances < 2} disabledReason="Mindestens zwei Bauteile auswählen" onClick={() => st().alignSelection("right")}>Ausrichten: rechts</MenuItem>
        <MenuItem disabled={selInstances < 2} disabledReason="Mindestens zwei Bauteile auswählen" onClick={() => st().alignSelection("top")}>Ausrichten: oben</MenuItem>
        <MenuItem disabled={selInstances < 2} disabledReason="Mindestens zwei Bauteile auswählen" onClick={() => st().alignSelection("centerV")}>Ausrichten: senkrecht mittig</MenuItem>
        <MenuItem disabled={selInstances < 2} disabledReason="Mindestens zwei Bauteile auswählen" onClick={() => st().alignSelection("bottom")}>Ausrichten: unten</MenuItem>
        <MenuItem disabled={selInstances < 3} disabledReason="Mindestens drei Bauteile auswählen" onClick={() => st().distributeSelection("h")}>Verteilen: waagerecht</MenuItem>
        <MenuItem disabled={selInstances < 3} disabledReason="Mindestens drei Bauteile auswählen" onClick={() => st().distributeSelection("v")}>Verteilen: senkrecht</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⇧L" disabled={!hasWireSelection} disabledReason="Leitung(en) auswählen" onClick={() => st().straightenSelection()}>Leitungen begradigen</MenuItem>
        <MenuItem onClick={() => st().repairWires()}>Leitungen prüfen &amp; reparieren</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌫" danger disabled={!hasSelection} onClick={() => st().deleteSelection()}>Löschen</MenuItem>
      </Menu>

      <Menu label="Ansicht" {...menuProps("ansicht")}>
        <MenuItem checked={showCurrentFlow} onClick={() => st().toggleCurrentFlow()}>Stromfluss animieren</MenuItem>
        <MenuItem checked={showVoltageColors} onClick={() => st().toggleVoltageColors()}>Spannungsfarben</MenuItem>
        <MenuItem checked={showInlineValues} onClick={() => st().toggleInlineValues()}>Live-Werte im Plan</MenuItem>
        <MenuItem checked={showRulers} onClick={() => st().toggleRulers()}>Lineale</MenuItem>
        <MenuItem checked={showPageFrame} onClick={() => st().togglePageFrame()}>Blattrand mit Titelstempel</MenuItem>
        <MenuItem onClick={() => st().setCurrentFlowDirection(flowDir === "electron" ? "conventional" : "electron")}>
          {flowDir === "electron" ? "Stromrichtung: − nach + (Elektronen)" : "Stromrichtung: + nach − (konventionell)"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => st().fitView()}>Einpassen (F)</MenuItem>
        <MenuItem hint="⌘K" onClick={() => st().toggleLibrary()}>Bibliothek</MenuItem>
        <MenuItem hint="⌘I" onClick={() => st().toggleInspector()}>Inspector</MenuItem>
        <MenuSeparator />
        <MenuItem checked={theme === "system"} onClick={() => setTheme("system")}>System (Auto)</MenuItem>
        <MenuItem checked={theme === "dark"} onClick={() => setTheme("dark")}>Dunkel</MenuItem>
        <MenuItem checked={theme === "light"} onClick={() => setTheme("light")}>Hell</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => onSettings?.()}>Einstellungen …</MenuItem>
      </Menu>

      <Menu label="Vorlagen" {...menuProps("vorlagen")}>
        {PRESETS.map((p) => (
          <MenuItem key={p.id} onClick={() => st().loadPreset(p.id)}>{p.name}</MenuItem>
        ))}
        {onWizards && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => onWizards()}>Schaltungs-Assistenten (Filter, 555, OpAmp) …</MenuItem>
          </>
        )}
      </Menu>

      <Menu label="Analysen" {...menuProps("analysen")}>
        {ANALYSIS_DEFS.map((a) => (
          <MenuItem key={a.kind} hint={a.spice} onClick={() => (a.direct ? runDirect(a.kind) : onAnalysis(a.kind))}>
            {a.title}
          </MenuItem>
        ))}
      </Menu>

      <Menu label="Geräte" {...menuProps("geraete")}>
        {INSTRUMENT_ITEMS.map(([kind, title]) => (
          <MenuItem
            key={kind}
            hint={kind === "scope" || kind === "funcgen" ? "Bauteil" : undefined}
            onClick={() => (kind === "scope" ? st().setPlacing("oscilloscope") : kind === "funcgen" ? st().setPlacing("funcgen") : st().openInstrument(kind))}
          >
            {title}
          </MenuItem>
        ))}
      </Menu>

      <div className="mx-2 h-4 w-px" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-0.5">
        <Tooltip content="Rückgängig (⌘Z)" side="bottom">
          <button className="btn h-6 px-1.5" onClick={() => st().undo()} disabled={!canUndo}>
            <Undo2 size={13} />
          </button>
        </Tooltip>
        <Tooltip content="Wiederholen (⇧⌘Z)" side="bottom">
          <button className="btn h-6 px-1.5" onClick={() => st().redo()} disabled={!canRedo}>
            <Redo2 size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1">
        <Tooltip content={running ? "Pause (Leertaste)" : "Start (Leertaste)"} side="bottom">
          <button
            className={running ? "btn h-6 px-2" : "btn btn-primary h-6 px-2.5"}
            onClick={() => (running ? st().pauseSim() : st().startSim())}
          >
            {running ? <Pause size={12} /> : <Play size={12} />}
            <span className="ml-1 hidden sm:inline text-[11px]">{running ? "Pause" : "Start"}</span>
          </button>
        </Tooltip>
        <Tooltip content="Stoppen" side="bottom">
          <button className="btn h-6 px-1.5" onClick={() => st().stopSim()}>
            <Square size={11} />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-2 md:flex">
        <label className="flex items-center gap-1 text-[10px] text-mute cursor-pointer">
            <input type="checkbox" checked={showCurrentFlow} onChange={() => st().toggleCurrentFlow()} className="h-3 w-3" />
            Strom
          </label>
        <label className="flex items-center gap-1 text-[10px] text-mute cursor-pointer">
            <input type="checkbox" checked={showVoltageColors} onChange={() => st().toggleVoltageColors()} className="h-3 w-3" />
            Farben
          </label>
        <Tooltip content="Bibliothek (⌘K)" side="bottom">
          <button className="btn h-6 px-2 text-[10px]" onClick={() => st().toggleLibrary()}>
            {adaptShortcut("⌘K", apple)}
          </button>
        </Tooltip>
        <Tooltip content="Einstellungen" side="bottom">
          <button className="btn h-6 px-2" onClick={() => onSettings?.()} aria-label="Einstellungen">
            <SettingsIcon size={12} />
          </button>
        </Tooltip>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.cir,.net,.sp,.txt,.asc"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </header>
  );
}
