"use client";

import { useRef, useState } from "react";
import { Pause, Play, Settings as SettingsIcon, Square, Undo2, Redo2 } from "lucide-react";
import { PRESETS } from "@/lib/schematic/tools";
import { ANALYSIS_DEFS } from "@/lib/sim/analysis_defs";
import { toSpiceNetlist } from "@/lib/schematic/model";
import { InstrumentKind, useEditor } from "@/state/editor";
import { exportSvg, exportPng, exportPdf, printSchematicSheet } from "@/lib/export/sheet";
import { Menu, MenuItem, MenuSeparator, downloadText, safeName, Tooltip } from "./ui";
import { openFileInEditor, openProjectViaNativeDialogIfAvailable } from "@/lib/schematic/openFile";

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

export default function MenuBar({
  onAnalysis,
  onSettings,
  onWizards,
  onProjects,
  onPartEditor,
  isMobile = false,
}: {
  onAnalysis: (kind: string) => void;
  onSettings?: () => void;
  onWizards?: () => void;
  onProjects?: () => void;
  onPartEditor?: () => void;
  isMobile?: boolean;
}) {
  const docName = useEditor((s) => s.doc.name);
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const hasWireSelection = useEditor((s) => s.selection.some((id) => s.doc.wires.some((w) => w.id === id)));
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const running = useEditor((s) => s.sim.running);
  const showCurrentFlow = useEditor((s) => s.showCurrentFlow);
  const showVoltageColors = useEditor((s) => s.showVoltageColors);
  const bottomOpen = useEditor((s) => s.bottomOpen);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = useEditor.getState;

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

  const printSheet = () => {
    void printSchematicSheet(st().doc).then((ok) => {
      if (ok) st().log("ok", "Druckansicht geöffnet");
    });
  };

  const triggerOpenFile = () => {
    void openProjectViaNativeDialogIfAvailable().then((handled) => {
      if (!handled) fileRef.current?.click();
    });
  };

  const exportJson = () => {
    void st().saveProject(undefined, { saveAs: true });
  };

  const importFile = (file: File) => {
    void openFileInEditor(file);
  };

  const runDirect = (kind: string) => {
    st().setBottomTab("results");
    void st().runAnalysis(kind, {});
  };

  if (isMobile) {
    return (
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <div className="px-2 text-[10px] uppercase tracking-wide text-mute">Datei</div>
          <button className="btn w-full justify-start" onClick={() => st().newDocument()}>Neuer Schaltplan</button>
          <button className="btn w-full justify-start" onClick={triggerOpenFile}>Öffnen / Importieren …</button>
          <button className="btn w-full justify-start" onClick={() => void st().saveProject()}>Speichern</button>
          <button className="btn w-full justify-start" onClick={() => void st().saveProject(undefined, { saveAs: true })}>Speichern unter …</button>
          <button className="btn w-full justify-start" onClick={() => onProjects?.()}>Projekte …</button>
          {onPartEditor && (
            <button className="btn w-full justify-start" onClick={() => onPartEditor()}>Bauteile-Editor …</button>
          )}
          <button className="btn w-full justify-start" onClick={exportSpice}>Export SPICE (.cir)</button>
          <button className="btn w-full justify-start" onClick={exportJson}>Export JSON</button>
          <button className="btn w-full justify-start" onClick={printSheet}>Drucken / PDF …</button>
        </div>
        <div className="space-y-1">
          <div className="px-2 text-[10px] uppercase tracking-wide text-mute">Bearbeiten</div>
          <button className="btn w-full justify-start" disabled={!hasSelection} onClick={() => st().copySelection()}>Kopieren</button>
          <button className="btn w-full justify-start" disabled={!hasClipboard} onClick={() => st().pasteClipboard()}>Einfügen</button>
          <button className="btn w-full justify-start" disabled={!hasSelection} onClick={() => st().duplicateSelection()}>Duplizieren</button>
          <button className="btn w-full justify-start" disabled={!hasWireSelection} onClick={() => st().straightenSelection()}>Leitungen begradigen</button>
        </div>
        <div className="space-y-1">
          <div className="px-2 text-[10px] uppercase tracking-wide text-mute">Ansicht</div>
          <button className="btn w-full justify-start" onClick={() => st().fitView()}>Schaltplan einpassen</button>
          <button className="btn w-full justify-start" onClick={() => st().toggleBottom()}>Auswertung &amp; Konsole</button>
          <button className="btn w-full justify-start" onClick={() => onSettings?.()}>Einstellungen …</button>
        </div>
        <div className="space-y-1">
          <div className="px-2 text-[10px] uppercase tracking-wide text-mute">Vorlagen</div>
          {PRESETS.map((p) => (
            <button key={p.id} className="btn w-full justify-start text-[11px]" onClick={() => st().loadPreset(p.id)}>
              {p.name}
            </button>
          ))}
          {onWizards && (
            <button className="btn w-full justify-start text-[11px]" onClick={() => onWizards()}>
              Schaltungs-Assistenten …
            </button>
          )}
        </div>
        <div className="space-y-1">
          <div className="px-2 text-[10px] uppercase tracking-wide text-mute">Analysen</div>
          {ANALYSIS_DEFS.map((a) => (
            <button key={a.kind} className="btn w-full justify-start text-[11px]" onClick={() => (a.direct ? runDirect(a.kind) : onAnalysis(a.kind))}>
              {a.title} ({a.spice})
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <div className="px-2 text-[10px] uppercase tracking-wide text-mute">Geräte</div>
          {INSTRUMENT_ITEMS.map(([kind, title]) => (
            <button
              key={kind}
              className="btn w-full justify-start text-[11px]"
              onClick={() =>
                kind === "scope"
                  ? st().setPlacing("oscilloscope")
                  : kind === "funcgen"
                    ? st().setPlacing("funcgen")
                    : st().openInstrument(kind)
              }
            >
              {title}
            </button>
          ))}
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
      </div>
    );
  }

  return (
    <header
      className="flex h-9 shrink-0 items-center gap-0.5 px-2.5 text-[12px]"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}
    >
      <Menu label="Datei" {...menuProps("datei")}>
        <MenuItem onClick={() => st().newDocument()}>Neuer Schaltplan</MenuItem>
        <MenuItem hint="⌘O" onClick={triggerOpenFile}>Öffnen / Importieren …</MenuItem>
        <MenuItem hint="⌘S" onClick={() => void st().saveProject()}>Speichern</MenuItem>
        <MenuItem hint="⇧⌘S" onClick={() => void st().saveProject(undefined, { saveAs: true })}>Speichern unter …</MenuItem>
        <MenuItem onClick={() => onProjects?.()}>Projekte …</MenuItem>
        {onPartEditor && (
          <>
            <MenuSeparator />
            <MenuItem onClick={() => onPartEditor()}>Bauteile-Editor …</MenuItem>
          </>
        )}
        <MenuSeparator />
        <MenuItem onClick={exportSpice}>Export SPICE (.cir)</MenuItem>
        <MenuItem onClick={exportJson}>Export JSON</MenuItem>
        <MenuItem onClick={() => { void exportSvg(st().doc).then((ok) => { if (ok) st().log("ok", "Schaltblatt als SVG exportiert"); }); }}>Export SVG</MenuItem>
        <MenuItem onClick={() => { exportPng(st().doc); st().log("ok", "Schaltblatt als PNG exportiert"); }}>Export PNG</MenuItem>
        <MenuItem
          onClick={() => {
            void exportPdf(st().doc).then((ok) => {
              if (ok) st().log("ok", "PDF-Export / Druckvorschau geöffnet");
            });
          }}
        >
          Export PDF
        </MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘P" onClick={printSheet}>Drucken …</MenuItem>
      </Menu>

      {/* W108: Aufgeräumtes Bearbeiten-Menü ohne die 8 Ausrichtungs-Einzelzeilen */}
      <Menu label="Bearbeiten" {...menuProps("bearbeiten")}>
        <MenuItem hint="⌘Z" disabled={!canUndo} onClick={() => st().undo()}>Rückgängig</MenuItem>
        <MenuItem hint="⇧⌘Z" disabled={!canRedo} onClick={() => st().redo()}>Wiederholen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘C" disabled={!hasSelection} onClick={() => st().copySelection()}>Kopieren</MenuItem>
        <MenuItem hint="⌘V" disabled={!hasClipboard} onClick={() => st().pasteClipboard()}>Einfügen</MenuItem>
        <MenuItem hint="⌘D" disabled={!hasSelection} onClick={() => st().duplicateSelection()}>Duplizieren</MenuItem>
        <MenuItem hint="⌘A" onClick={() => st().selectAll()}>Alles auswählen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="R" disabled={!hasSelection && st().tool !== "place"} onClick={() => st().rotateSelection(1)}>Drehen (+90°)</MenuItem>
        <MenuItem hint="⇧R" disabled={!hasSelection && st().tool !== "place"} onClick={() => st().rotateSelection(-1)}>Drehen (−90°)</MenuItem>
        <MenuItem hint="M" disabled={!hasSelection && st().tool !== "place"} onClick={() => st().mirrorSelection()}>Spiegeln</MenuItem>
        <MenuItem hint="⇧L" disabled={!hasWireSelection} disabledReason="Leitung(en) auswählen" onClick={() => st().straightenSelection()}>Leitungen begradigen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌫" danger disabled={!hasSelection} onClick={() => st().deleteSelection()}>Löschen</MenuItem>
      </Menu>

      {/* W108: Schlankes Ansicht-Menü; Grundeinstellungen (Stromrichtung, Theme, Symbole, Lineale) liegen in Einstellungen */}
      <Menu label="Ansicht" {...menuProps("ansicht")}>
        <MenuItem hint="F" onClick={() => st().fitView()}>Schaltplan einpassen</MenuItem>
        <MenuSeparator />
        <MenuItem checked={showCurrentFlow} onClick={() => st().toggleCurrentFlow()}>Stromfluss animieren</MenuItem>
        <MenuItem checked={showVoltageColors} onClick={() => st().toggleVoltageColors()}>Spannungsfarben</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘K" onClick={() => st().toggleLibrary()}>Bibliothek</MenuItem>
        <MenuItem hint="⌘I" onClick={() => st().toggleInspector()}>Inspector</MenuItem>
        <MenuItem checked={bottomOpen} onClick={() => st().toggleBottom()}>Auswertung &amp; Konsole</MenuItem>
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
            <MenuItem onClick={() => onWizards()}>Schaltungs-Assistenten …</MenuItem>
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
            onClick={() =>
              kind === "scope"
                ? st().setPlacing("oscilloscope")
                : kind === "funcgen"
                  ? st().setPlacing("funcgen")
                  : st().openInstrument(kind)
            }
          >
            {title}
          </MenuItem>
        ))}
      </Menu>

      <div className="mx-2 h-4 w-px" style={{ background: "var(--hairline)" }} />

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

      <div className="mx-1 h-4 w-px" style={{ background: "var(--hairline)" }} />

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

      <Tooltip content="Einstellungen" side="bottom">
        <button className="btn h-6 px-2" onClick={() => onSettings?.()} aria-label="Einstellungen">
          <SettingsIcon size={13} />
        </button>
      </Tooltip>

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
