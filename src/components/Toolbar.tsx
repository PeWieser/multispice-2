"use client";

import {
  Eraser,
  Grid3x3,
  Magnet,
  MousePointer2,
  Move,
  PenLine,
  Route,
  Tag,
  Type,
  X,
  Zap,
} from "lucide-react";
import { PART_MAP } from "@/lib/library/catalog";
import { Tool, useEditor } from "@/state/editor";
import { Tooltip } from "./ui";

const TOOLS: Array<{ id: Tool; title: string; key: string; icon: React.ReactNode; desc: string }> = [
  { id: "select", title: "Auswählen", key: "V", icon: <MousePointer2 size={15} />, desc: "Bauteile und Leitungen auswählen, verschieben, marquee ziehen. Doppelklick öffnet Inspector." },
  { id: "wire", title: "Leitung zeichnen", key: "W", icon: <PenLine size={15} />, desc: "Klick setzt Punkte, Doppelklick beendet. Auto-Route mit A*. Snap zu Pins." },
  { id: "label", title: "Netzname setzen", key: "L", icon: <Tag size={15} />, desc: "Klick auf Leitung setzt Netznamen (z.B. VCC). Wichtig für Messungen." },
  { id: "probe", title: "Messsonde setzen", key: "P", icon: <Zap size={15} />, desc: "Klick auf Leitung platziert Probe mit Leader Pfeil. Rechtsklick für Typ/REF/Reverse." },
  { id: "text", title: "Notiz einfügen", key: "T", icon: <Type size={15} />, desc: "Klick setzt Textnotiz für Dokumentation." },
  { id: "erase", title: "Löschen", key: "E", icon: <Eraser size={15} />, desc: "Klick löscht Bauteil oder Leitung. Auch Entf Taste." },
  { id: "pan", title: "Ansicht verschieben", key: "H", icon: <Move size={15} />, desc: "Ziehen verschiebt Ansicht. Mittelklick oder Space+Drag auch. Rad zoomt." },
];

function Sep() {
  return <div className="mx-1 h-5 w-px shrink-0" style={{ background: "var(--border)" }} />;
}

export default function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const placing = useEditor((s) => s.placingPartId);
  const setPlacing = useEditor((s) => s.setPlacing);
  const showGrid = useEditor((s) => s.showGrid);
  const snap = useEditor((s) => s.snap);
  const autoRoute = useEditor((s) => s.autoRoute);

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 px-2" style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
      {TOOLS.map((t) => (
        <Tooltip key={t.id} content={`${t.title} (${t.key})\n${t.desc}`} side="bottom">
          <button
            className="btn px-2 h-8 min-w-[36px]"
            data-active={tool === t.id && !placing}
            onClick={() => setTool(t.id)}
            aria-pressed={tool === t.id && !placing}
          >
            {t.icon}
          </button>
        </Tooltip>
      ))}
      <Sep />
      <Tooltip content={`Raster anzeigen\nZeigt Hilfsraster im Hintergrund. Hilft beim Ausrichten.`} side="bottom">
        <button className="btn px-2 h-8 min-w-[36px]" data-active={showGrid} onClick={() => useEditor.setState({ showGrid: !showGrid })} aria-pressed={showGrid}>
          <Grid3x3 size={15} />
        </button>
      </Tooltip>
      <Tooltip content={`Am Raster fangen\nBauteile und Leitungen snappen zu 10px Grid. Für saubere Schaltpläne.`} side="bottom">
        <button className="btn px-2 h-8 min-w-[36px]" data-active={snap} onClick={() => useEditor.setState({ snap: !snap })} aria-pressed={snap}>
          <Magnet size={15} />
        </button>
      </Tooltip>
      <Tooltip content={`Auto-Route (A*)\nLeitungen werden automatisch orthogonal geroutet mit Hindernisvermeidung.`} side="bottom">
        <button className="btn px-2 h-8 min-w-[36px]" data-active={autoRoute} onClick={() => useEditor.setState({ autoRoute: !autoRoute })} aria-pressed={autoRoute}>
          <Route size={15} />
        </button>
      </Tooltip>
      <div className="flex-1" />
      {placing && PART_MAP[placing] && (
        <div
          className="flex items-center gap-2 rounded-md py-1 pl-2.5 pr-1 text-[12px]"
          role="status"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-mid)" }}
        >
          <span>
            Platziere <b>{PART_MAP[placing].name}</b>
            <span className="text-mute"> — Klick setzt, Shift für Serie, Esc bricht ab</span>
          </span>
          <Tooltip content="Abbrechen (Esc)" side="bottom">
            <button className="btn px-1.5 py-0.5 h-6" onClick={() => setPlacing(null)}>
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
