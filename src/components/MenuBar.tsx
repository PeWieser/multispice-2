"use client";

import { useRef } from "react";
import { Pause, Play, Square, Undo2, Redo2 } from "lucide-react";
import { PRESETS } from "@/lib/schematic/tools";
import { ANALYSIS_DEFS } from "@/lib/sim/analysis_defs";
import { buildBom, toSpiceNetlist } from "@/lib/schematic/model";
import { InstrumentKind, ThemePref, useEditor } from "@/state/editor";
import { Menu, MenuItem, MenuSeparator, downloadText, safeName, Tooltip } from "./ui";

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

export default function MenuBar({ onAnalysis, onSettings, onWizards, isMobile = false }: { onAnalysis: (kind: string) => void; onSettings?: () => void; onWizards?: () => void; isMobile?: boolean }) {
  const docName = useEditor((s) => s.doc.name);
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const running = useEditor((s) => s.sim.running);
  const theme = useEditor((s) => s.theme);
  const showCurrentFlow = useEditor((s) => s.showCurrentFlow);
  const showVoltageColors = useEditor((s) => s.showVoltageColors);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = useEditor.getState;

  const base = safeName(docName);

  const exportSpice = () => {
    downloadText(`${base}.cir`, toSpiceNetlist(doc, ".tran 10u 20m"));
    st().log("ok", "SPICE-Netzliste exportiert (.cir)");
  };
  const exportJson = () => {
    downloadText(`${base}.msx.json`, JSON.stringify(doc, null, 2), "application/json");
    st().log("ok", "Projekt als JSON exportiert");
  };
  const exportBom = () => {
    const rows = buildBom(doc);
    const csv = ["Referenz;Bauteil;Wert;Footprint;Montage;Menge", ...rows.map((r) => `${r.ref};${r.part};${r.value};${r.footprint};${r.mount};${r.qty}`)].join("\n");
    downloadText(`${base}_BOM.csv`, csv, "text/csv");
    st().log("ok", `Stückliste exportiert (${rows.length} Positionen)`);
  };
  const exportPng = () => {
    try {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) { st().log("error", "Kein Canvas gefunden"); return; }
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.png`;
        a.click();
        URL.revokeObjectURL(url);
        st().log("ok", "Schaltplan als PNG exportiert");
      }, "image/png");
    } catch (e) {
      st().log("error", `PNG Export fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        if (file.name.endsWith(".json")) {
          st().setDoc(JSON.parse(text));
          st().log("ok", `${file.name} importiert`);
        } else {
          import("@/lib/schematic/model").then((m) => {
            st().setDoc(m.fromSpiceNetlist(text));
            st().log("ok", `SPICE-Datei ${file.name} importiert`);
          });
        }
      } catch (e) {
        st().log("error", `Import fehlgeschlagen: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
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
            <button key={kind} className="btn w-full justify-start text-[11px]" onClick={() => st().openInstrument(kind)}>{title}</button>
          ))}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-mute px-2">Wizards</div>
            <button className="btn w-full justify-start" onClick={() => onWizards?.()}>Wizards ✨</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".json,.cir,.net,.sp,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
      </div>
    );
  }

  return (
    <header className="flex h-9 shrink-0 items-center gap-0.5 px-2 text-[12px]"
      style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
      {/* Minimal – no logo */}
      <span className="mr-2 hidden max-w-[140px] truncate text-[11px] text-mute lg:inline">{docName}</span>

      <Menu label="Datei" tooltip="Datei – neues Projekt, Speichern, Import/Export, Druck">
        <MenuItem hint="⌘N" onClick={() => st().newDocument()} tooltip="Neuer Schaltplan – löscht aktuellen Plan (Undo möglich)\nTipp: Vorher speichern">Neuer Schaltplan</MenuItem>
        <MenuItem hint="⌘S" onClick={() => st().saveProject()} tooltip="Lokal speichern – speichert im Browser localStorage\nAuto-Save alle 2s, bleibt nach Reload erhalten">Lokal speichern</MenuItem>
        <MenuItem onClick={() => fileRef.current?.click()} tooltip="Importieren – lädt .json oder .cir/.sp SPICE-Netzlisten">Importieren (.json/.cir)</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={exportSpice} tooltip="Export SPICE (.cir) – erzeugt SPICE-Netzliste für LTspice/NGSpice\nEnthält alle Bauteile und Verbindungen">Export SPICE (.cir)</MenuItem>
        <MenuItem onClick={exportJson} tooltip="Export JSON – komplettes Projekt mit Canvas-Zustand\nZum Teilen oder Backup">Export JSON</MenuItem>
        <MenuItem onClick={exportBom} tooltip="Export BOM (CSV) – Stückliste mit Ref, Bauteil, Wert, Footprint\nFür Bestellung bei Mouser/DigiKey">Export BOM (CSV)</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘P" onClick={() => window.print()} tooltip="Drucken – druckt Schaltplan via Browser Print">Drucken</MenuItem>
      </Menu>

      <Menu label="Bearbeiten" tooltip="Bearbeiten – Undo/Redo, Kopieren, Einfügen, Duplizieren, Löschen">
        <MenuItem hint="⌘Z" disabled={!canUndo} onClick={() => st().undo()} tooltip="Rückgängig – macht letzte Aktion rückgängig (History 50)">Rückgängig</MenuItem>
        <MenuItem hint="⇧⌘Z" disabled={!canRedo} onClick={() => st().redo()} tooltip="Wiederholen – stellt rückgängig gemachte Aktion wieder her">Wiederholen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌘C" disabled={!hasSelection} onClick={() => st().copySelection()} tooltip="Kopieren – kopiert ausgewählte Bauteile + Leitungen">Kopieren</MenuItem>
        <MenuItem hint="⌘V" disabled={!hasClipboard} onClick={() => st().pasteClipboard()} tooltip="Einfügen – fügt aus Zwischenablage ein (versetzt)">Einfügen</MenuItem>
        <MenuItem hint="⌘D" disabled={!hasSelection} onClick={() => st().duplicateSelection()} tooltip="Duplizieren – kopiert und fügt sofort ein (Shortcut ⌘D)">Duplizieren</MenuItem>
        <MenuItem hint="⌘A" onClick={() => st().selectAll()} tooltip="Alles auswählen – selektiert alle Bauteile und Leitungen">Alles auswählen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="⌫" danger disabled={!hasSelection} onClick={() => st().deleteSelection()} tooltip="Löschen – löscht Auswahl unwiderruflich (aber Undo)">Löschen</MenuItem>
      </Menu>

      <Menu label="Ansicht" tooltip="Ansicht – Darstellungsoptionen, Theme, Library, Einstellungen">
        <MenuItem checked={showCurrentFlow} onClick={() => st().toggleCurrentFlow()} tooltip="Stromfluss animieren – animierte Punkte auf Leitungen\nWie Multisim Live, zeigt Flussrichtung, abschaltbar">Stromfluss animieren</MenuItem>
        <MenuItem checked={showVoltageColors} onClick={() => st().toggleVoltageColors()} tooltip="Spannungsfarben – färbt Leitungen nach Spannung\nBlau=positiv, Rot=negativ, Grau=0V">Spannungsfarben</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => st().fitView()} tooltip="Einpassen (F) – zoomt so dass ganzer Schaltplan sichtbar\nShortcut: F">Einpassen (F)</MenuItem>
        <MenuItem onClick={() => st().toggleLibrary()} tooltip="Bibliothek (⌘K) – öffnet/schließt Bauteil-Bibliothek\n402 Bauteile, Symbol-Vorschau, Datasheet Links">Bibliothek (⌘K)</MenuItem>
        <MenuSeparator />
        <MenuItem checked={theme === "system"} onClick={() => setTheme("system")} tooltip="System (Auto) – folgt OS Dark/Light, Default">System (Auto)</MenuItem>
        <MenuItem checked={theme === "dark"} onClick={() => setTheme("dark")} tooltip="Dunkel – dunkles Theme, ideal für Oszilloskop">Dunkel</MenuItem>
        <MenuItem checked={theme === "light"} onClick={() => setTheme("light")} tooltip="Hell – helles Theme für Tageslicht">Hell</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => onSettings?.()} tooltip="Einstellungen – Probes Hover Config, Canvas, Library, Theme\nHier stellst du ein was Alt+Hover zeigt">⚙️ Einstellungen (Probes, Library, Canvas)</MenuItem>
      </Menu>

      <Menu label="Vorlagen" tooltip="Vorlagen – fertige Beispiel-Schaltungen zum Lernen und Starten">
        {PRESETS.map((p) => (
          <MenuItem key={p.id} onClick={() => st().loadPreset(p.id)} tooltip={`Vorlage laden: ${p.name}\nÜberschreibt aktuellen Plan (Undo möglich)`}>{p.name}</MenuItem>
        ))}
      </Menu>

      <Menu label="Analysen" tooltip="Analysen – SPICE Analysen: OP, DC Sweep, AC, Transient, Monte Carlo etc">
        {ANALYSIS_DEFS.map((a) => (
          <MenuItem key={a.kind} hint={a.spice} onClick={() => (a.direct ? runDirect(a.kind) : onAnalysis(a.kind))} tooltip={`${a.title} – ${a.spice} Analyse\n${a.direct ? "Direkt ausführbar" : "Öffnet Dialog mit Parametern"}`}>
            {a.title}
          </MenuItem>
        ))}
      </Menu>

      <Menu label="Geräte" tooltip="Geräte – Messinstrumente wie Oszilloskop (4 Kanäle), DMM, Bode, Spektrum">
        {INSTRUMENT_ITEMS.map(([kind, title]) => (
          <MenuItem key={kind} onClick={() => st().openInstrument(kind)} tooltip={`${title} öffnen – Messgerät als schwebendes Fenster\nVerschiebbar, andockbar unten`}>{title}</MenuItem>
        ))}
      </Menu>

      <div className="mx-2 h-4 w-px" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-0.5">
        <Tooltip content="Rückgängig – macht letzte Aktion rückgängig (50 Schritte History)\nShortcut: ⌘Z / Strg+Z" side="bottom">
          <button className="btn h-6 px-1.5" onClick={() => st().undo()} disabled={!canUndo}>
            <Undo2 size={13} />
          </button>
        </Tooltip>
        <Tooltip content="Wiederholen – stellt rückgängig gemachte Aktion wieder her\nShortcut: ⇧⌘Z / Strg+Y" side="bottom">
          <button className="btn h-6 px-1.5" onClick={() => st().redo()} disabled={!canRedo}>
            <Redo2 size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />

      <div className="flex items-center gap-1">
        <Tooltip content={running ? "Pause – hält Simulation an, behält Zustand\nShortcut: Leertaste" : "Start – startet Echtzeit Simulation (MNA/Newton-Raphson)\nShortcut: Leertaste\nTipp: Mindestens 1 Probe empfohlen"} side="bottom">
          <button
            className={running ? "btn h-6 px-2" : "btn btn-primary h-6 px-2.5"}
            onClick={() => (running ? st().pauseSim() : st().startSim())}
          >
            {running ? <Pause size={12} /> : <Play size={12} />}
            <span className="ml-1 hidden sm:inline text-[11px]">{running ? "Pause" : "Start"}</span>
          </button>
        </Tooltip>
        <Tooltip content="Stop – stoppt und setzt Simulation zurück auf Anfang" side="bottom">
          <button className="btn h-6 px-1.5" onClick={() => st().stopSim()}>
            <Square size={11} />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-2 md:flex">
        <Tooltip content="Stromfluss animieren – zeigt animierte Punkte/Pfeile auf Leitungen wenn Strom fließt\nWie in Multisim Live, ein/ausschaltbar" side="bottom">
          <label className="flex items-center gap-1 text-[10px] text-mute cursor-pointer">
            <input type="checkbox" checked={showCurrentFlow} onChange={() => st().toggleCurrentFlow()} className="h-3 w-3" />
            Strom
          </label>
        </Tooltip>
        <Tooltip content="Spannungsfarben – färbt Leitungen nach Spannung (positiv blau, negativ rot, 0 grau)\nHilft beim schnellen Erkennen" side="bottom">
          <label className="flex items-center gap-1 text-[10px] text-mute cursor-pointer">
            <input type="checkbox" checked={showVoltageColors} onChange={() => st().toggleVoltageColors()} className="h-3 w-3" />
            Farben
          </label>
        </Tooltip>
        <Tooltip content="Bibliothek öffnen – zeigt alle 402 Bauteile mit Symbol-Vorschau und Datenblatt\nShortcut: ⌘K" side="bottom">
          <button className="btn h-6 px-2 text-[10px]" onClick={() => st().toggleLibrary()}>
            ⌘K
          </button>
        </Tooltip>
        <Tooltip content="Einstellungen – Probes, Library, Canvas, Theme, Accessibility\nHier konfigurierbar was Alt+Hover anzeigt" side="bottom">
          <button className="btn h-6 px-2 text-[10px]" onClick={() => onSettings?.()}>
            ⚙️
          </button>
        </Tooltip>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.cir,.net,.sp,.txt"
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
