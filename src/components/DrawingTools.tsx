"use client";

/**
 * W68 (Runde 26) / W73 (Runde 27) / W88 & W90 (Runde 29) / W97 (Runde 30):
 * Zeichenwerkzeuge in der Kopfleiste – luftige Segmented-Control-Kapseln:
 *  1. Auswahl-Zeiger (`MousePointer2`, `Esc`)
 *  2. Leitungs-Kapsel: Stift (`W`), Radiergummi (`E`) und Knotenpunkt (`J`)
 *  3. Beschriftungs-Kapsel: Netzname (`L`) und Notiz (`T`)
 */
import { MousePointer2, Pencil, Eraser, GitCommitHorizontal, Tag, StickyNote } from "lucide-react";
import { useEditor, useHud, type Tool } from "@/state/editor";
import { TOOL_KEYS } from "@/lib/shortcuts";
import { ToolButton, ToolGroup } from "./ui";

const TOOL_CAPSULES: Array<{
  id: string;
  label: string;
  items: Array<{ tool: Tool; label: string; hint: string; key?: string; Icon: typeof MousePointer2 }>;
}> = [
  {
    id: "pointer",
    label: "Auswahl",
    items: [
      { tool: "select", label: "Auswahl", hint: "Bauteile wählen und verschieben", key: TOOL_KEYS.select, Icon: MousePointer2 },
    ],
  },
  {
    id: "wiring",
    label: "Verdrahtung",
    items: [
      {
        tool: "wire",
        label: "Stift",
        hint: "Netz zeichnen: Pin anklicken, Ecken setzen, Pin/Leitung anklicken (Doppelklick beendet frei)",
        key: TOOL_KEYS.wire,
        Icon: Pencil,
      },
      {
        tool: "erase",
        label: "Radiergummi",
        hint: "Leitung, Bauteil, Probe oder Beschriftung anklicken zum Löschen",
        key: TOOL_KEYS.erase,
        Icon: Eraser,
      },
      {
        tool: "junction",
        label: "Knotenpunkt",
        hint: "Auf eine Kreuzung zweier Leitungen klicken, um einen Knoten zu setzen oder zu entfernen",
        key: TOOL_KEYS.junction,
        Icon: GitCommitHorizontal,
      },
    ],
  },
  {
    id: "annotation",
    label: "Beschriftung",
    items: [
      { tool: "label", label: "Netzname", hint: "Netznamen auf eine Leitung setzen", key: TOOL_KEYS.label, Icon: Tag },
      { tool: "text", label: "Notiz", hint: "Notiz in den Schaltplan schreiben", key: TOOL_KEYS.text, Icon: StickyNote },
    ],
  },
];

export function DrawingTools() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const netDrawing = useHud((s) => s.netDrawing);
  const effectiveTool: Tool = netDrawing ? "wire" : tool;

  return (
    <div className="flex items-center gap-2" role="toolbar" aria-label="Zeichenwerkzeuge">
      {TOOL_CAPSULES.map((capsule) => (
        <ToolGroup key={capsule.id} label={capsule.label}>
          {capsule.items.map(({ tool: t, label, hint, key, Icon }) => (
            <ToolButton
              key={t}
              label={label}
              hint={hint}
              kbd={key}
              icon={<Icon />}
              active={effectiveTool === t}
              onClick={() => {
                useHud.getState().cancelNetDrawing();
                setTool(t);
              }}
            />
          ))}
        </ToolGroup>
      ))}
    </div>
  );
}

export default DrawingTools;
