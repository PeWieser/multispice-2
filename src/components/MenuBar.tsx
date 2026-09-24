"use client";

import { useMemo, useRef } from "react";
import {
  CircuitBoard, Moon, PanelBottom, PanelLeft, PanelRight, Pause, Play, Redo2, Square, Sun, Undo2,
} from "lucide-react";
import { PRESETS } from "@/lib/schematic/tools";
import { ANALYSIS_DEFS } from "@/lib/sim/analysis_defs";
import { buildBom, toSpiceNetlist } from "@/lib/schematic/model";
import { InstrumentKind, useEditor } from "@/state/editor";
import { Menu, MenuItem, MenuSeparator, downloadText, safeName } from "./ui";

const INSTRUMENT_ITEMS: Array<[InstrumentKind, string]> = [
  ["dmm", "Digitalmultimeter"],
  ["scope", "Oszilloskop"],
  ["funcgen", "Funktionsgenerator"],
  ["counter", "Frequenzzähler"],
  ["bode", "Bode-Plotter"],
  ["logic", "Logikanalysator"],
  ["watt", "Wattmeter"],
  ["iv", "IV-Analyzer"],
  ["spectrum", "Spektrumanalysator"],
  ["pattern", "Mustergenerator"],
];

export default function MenuBar({ onAnalysis }: { onAnalysis: (kind: string) => void }) {
  const docName = useEditor((s) => s.doc.name);
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const hasClipboard = useEditor((s) => !!s.clipboard);
  const running = useEditor((s) => s.sim.running);
  const theme = useEditor((s) => s.theme);
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const bottomOpen = useEditor((s) => s.bottomOpen);
  const instruments = useEditor((s) => s.instruments);
  const openKinds = useMemo(() => instruments.map((i) => i.kind), [instruments]);
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
  const exportGerber = () => {
    const rows = buildBom(doc);
    const g = [
      "G04 CircuitLab Studio Gerber RS-274X (Platzhalter-Layer)*",
      "%FSLAX36Y36*%",
      "%MOMM*%",
      "%ADD10C,1.000*%",
      "D10*",
      ...rows.map((_, i) => `X${10000 + i * 2540}Y10000D03*`),
      "M02*",
    ].join("\n");
    downloadText(`${base}_top.gbr`, g);
    st().log("warn", "Gerber-Export: Platzhalter-Layer aus BOM erzeugt (Layout-Editor folgt)");
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

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 px-2" style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 py-1 pl-1 pr-2">
        <span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <CircuitBoard size={14} />
        </span>
        <span className="hidden text-[12.5px] font-semibold tracking-tight xl:inline">CircuitLab</span>
        <span className="hidden max-w-[180px] truncate text-[12px] text-mute lg:inline">/ {docName}</span>
      </div>

      <Menu label="Datei">
        <MenuItem hint="Strg+N" onClick={() => st().newDocument()}>Neuer Schaltplan</MenuItem>
        <MenuItem hint="Strg+S" onClick={() => st().saveProject()}>Lokal speichern</MenuItem>
        <MenuItem onClick={() => fileRef.current?.click()}>Importieren (.json/.cir)</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={exportSpice}>Export SPICE-Netzliste</MenuItem>
        <MenuItem onClick={exportJson}>Export Projekt (JSON)</MenuItem>
        <MenuItem onClick={exportBom}>Export Stückliste (CSV)</MenuItem>
        <MenuItem onClick={exportGerber}>Export Gerber (RS-274X)</MenuItem>
        <MenuItem hint="Strg+P" onClick={() => window.print()}>Drucken / PDF</MenuItem>
      </Menu>

      <Menu label="Bearbeiten">
        <MenuItem hint="Strg+Z" disabled={!canUndo} disabledReason="Nichts rückgängig zu machen" onClick={() => st().undo()}>Rückgängig</MenuItem>
        <MenuItem hint="Strg+Y" disabled={!canRedo} disabledReason="Nichts wiederherzustellen" onClick={() => st().redo()}>Wiederholen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="Strg+C" disabled={!hasSelection} disabledReason="Nichts ausgewählt" onClick={() => st().copySelection()}>Kopieren</MenuItem>
        <MenuItem hint="Strg+V" disabled={!hasClipboard} disabledReason="Zwischenablage ist leer" onClick={() => st().pasteClipboard()}>Einfügen</MenuItem>
        <MenuItem hint="Strg+D" disabled={!hasSelection} disabledReason="Nichts ausgewählt" onClick={() => st().duplicateSelection()}>Duplizieren</MenuItem>
        <MenuItem hint="Strg+A" onClick={() => st().selectAll()}>Alles auswählen</MenuItem>
        <MenuSeparator />
        <MenuItem hint="Entf" danger disabled={!hasSelection} disabledReason="Nichts ausgewählt" onClick={() => st().deleteSelection()}>Löschen</MenuItem>
      </Menu>

      <Menu label="Ansicht">
        <MenuItem checked={leftOpen} onClick={() => st().toggleLeft()}>Bibliothek</MenuItem>
        <MenuItem checked={rightOpen} onClick={() => st().toggleRight()}>Inspector</MenuItem>
        <MenuItem checked={bottomOpen} onClick={() => st().toggleBottom()}>Untere Leiste</MenuItem>
        <MenuSeparator />
        <MenuItem hint="F" onClick={() => st().fitView()}>Einpassen</MenuItem>
      </Menu>

      <Menu label="Vorlagen">
        {PRESETS.map((p) => (
          <MenuItem key={p.id} onClick={() => st().loadPreset(p.id)}>{p.name}</MenuItem>
        ))}
      </Menu>

      <Menu label="Analysen">
        {ANALYSIS_DEFS.map((a) => (
          <MenuItem key={a.kind} hint={a.spice} onClick={() => (a.direct ? runDirect(a.kind) : onAnalysis(a.kind))}>
            {a.title}
          </MenuItem>
        ))}
      </Menu>

      <Menu label="Geräte">
        {INSTRUMENT_ITEMS.map(([kind, title]) => (
          <MenuItem key={kind} checked={openKinds.includes(kind)} onClick={() => st().openInstrument(kind)}>
            {title}
          </MenuItem>
        ))}
      </Menu>

      <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

      <button className="btn px-2" onClick={() => st().undo()} disabled={!canUndo} title="Rückgängig (Strg+Z)">
        <Undo2 size={15} />
      </button>
      <button className="btn px-2" onClick={() => st().redo()} disabled={!canRedo} title="Wiederholen (Strg+Y)">
        <Redo2 size={15} />
      </button>

      <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

      <button
        className={running ? "btn px-2.5" : "btn btn-primary px-2.5"}
        onClick={() => (running ? st().pauseSim() : st().startSim())}
        title={running ? "Pause (Leertaste)" : "Simulation starten (Leertaste)"}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
        <span className="hidden sm:inline">{running ? "Pause" : "Simulieren"}</span>
      </button>
      <button className="btn px-2" onClick={() => st().stopSim()} title="Stopp und zurücksetzen">
        <Square size={13} />
      </button>

      <div className="flex-1" />

      <button className="btn px-2" onClick={() => st().toggleLeft()} data-active={leftOpen} title="Bibliothek ein-/ausblenden">
        <PanelLeft size={15} />
      </button>
      <button className="btn px-2" onClick={() => st().toggleBottom()} data-active={bottomOpen} title="Untere Leiste ein-/ausblenden">
        <PanelBottom size={15} />
      </button>
      <button className="btn px-2" onClick={() => st().toggleRight()} data-active={rightOpen} title="Inspector ein-/ausblenden">
        <PanelRight size={15} />
      </button>
      <button className="btn px-2" onClick={() => st().toggleTheme()} title="Farbschema wechseln">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

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
