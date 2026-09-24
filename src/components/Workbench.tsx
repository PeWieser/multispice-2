"use client";

import { useEffect } from "react";
import {
  Eraser, MousePointer2, Move, PenLine, Tag, Type, Zap,
} from "lucide-react";
import AppBar from "./AppBar";
import BottomPanel from "./BottomPanel";
import Canvas from "./Canvas";
import Inspector from "./Inspector";
import { InstrumentDock, InstrumentLayer } from "./Instruments";
import LeftSidebar from "./LeftSidebar";
import { Tool, useEditor } from "@/state/editor";

const TOOLS: Array<[Tool, string, React.ReactNode, string]> = [
  ["select", "Auswahl", <MousePointer2 key="s" size={15} />, "V"],
  ["wire", "Leitung zeichnen", <PenLine key="w" size={15} />, "W"],
  ["label", "Netzname", <Tag key="l" size={15} />, "L"],
  ["probe", "Messsonde", <Zap key="p" size={15} />, "P"],
  ["erase", "Löschen", <Eraser key="e" size={15} />, "E"],
  ["text", "Notiz", <Type key="t" size={15} />, "T"],
  ["pan", "Verschieben", <Move key="m" size={15} />, "Space"],
];

export default function Workbench() {
  const theme = useEditor((s) => s.theme);
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const toggleLeft = useEditor((s) => s.toggleLeft);
  const toggleRight = useEditor((s) => s.toggleRight);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Einmalig beim Start: gespeicherten Stand aus dem Browser wiederherstellen.
  // Still, wenn nichts da ist (Erststart → Beispielschaltung bleibt liegen).
  useEffect(() => {
    useEditor.getState().restoreLocalProject();
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <AppBar />
      <div className="relative flex min-h-0 flex-1">
        {leftOpen && <LeftSidebar />}

        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* tool rail */}
          <div className="glass flex h-10 shrink-0 items-center gap-1 px-2" style={{ borderWidth: "0 0 1px 0" }}>
            <button className="btn px-1.5" onClick={toggleLeft} title="Bibliothek ein/aus">
              ▚
            </button>
            <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
            {TOOLS.map(([id, title, icon, key]) => (
              <button key={id} className="btn" data-active={tool === id} onClick={() => setTool(id)} title={`${title} (${key})`}>
                {icon}
              </button>
            ))}
            <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
            <Breadcrumb />
            <div className="flex-1" />
            <HintBar />
            <button className="btn px-1.5" onClick={toggleRight} title="Inspector ein/aus">
              ▜
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <Canvas />
            <InstrumentLayer />
          </div>

          <BottomPanel />
        </div>

        {rightOpen && <Inspector />}
        <InstrumentDock />
      </div>
    </div>
  );
}

function Breadcrumb() {
  const doc = useEditor((s) => s.doc);
  const setDoc = useEditor((s) => s.setDoc);
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-mute">
      <span>Projekt</span>
      <span className="opacity-40">/</span>
      <input
        className="input w-44 py-0.5 text-[11.5px]"
        value={doc.name}
        onChange={(e) => setDoc({ ...doc, name: e.target.value }, false)}
      />
    </div>
  );
}

function HintBar() {
  const tool = useEditor((s) => s.tool);
  const placing = useEditor((s) => s.placingPartId);
  const running = useEditor((s) => s.sim.running);
  let hint = "Klick = auswählen · Ziehen = verschieben · Shift+Klick = Mehrfachauswahl";
  if (placing) hint = "Klick platziert das Bauteil · Shift für Serie · Esc bricht ab";
  else if (tool === "wire") hint = "Klick setzt Stützpunkte · A*-Routing weicht Bauteilen aus · Doppelklick beendet";
  else if (tool === "probe") hint = "Klick auf ein Netz setzt eine Live-Sonde";
  else if (running) hint = "Live: Schalter/Taster anklicken, Potis mit Klick (+) bzw. Shift+Klick (−) drehen";
  return <span className="mono hidden text-[10.5px] text-mute xl:inline">{hint}</span>;
}
