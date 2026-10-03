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

const TOOL_CAPSULES: Array<{
  id: string;
  items: Array<{ tool: Tool; label: string; key?: string; Icon: typeof MousePointer2 }>;
}> = [
  {
    id: "pointer",
    items: [
      { tool: "select", label: "Auswahl-Werkzeug", key: "Esc", Icon: MousePointer2 },
    ],
  },
  {
    id: "wiring",
    items: [
      {
        tool: "wire",
        label: "Stift – Netz zeichnen: Pin anklicken, Ecken setzen, Pin/Leitung anklicken (Doppelklick beendet frei)",
        key: "W",
        Icon: Pencil,
      },
      {
        tool: "erase",
        label: "Radiergummi – Leitung, Bauteil, Probe oder Beschriftung anklicken zum Löschen",
        key: "E",
        Icon: Eraser,
      },
      {
        tool: "junction",
        label: "Knotenpunkt setzen/entfernen – auf eine Kreuzung zweier Leitungen klicken",
        key: "J",
        Icon: GitCommitHorizontal,
      },
    ],
  },
  {
    id: "annotation",
    items: [
      { tool: "label", label: "Netzname auf Leitung setzen", key: "L", Icon: Tag },
      { tool: "text", label: "Notiz in den Schaltplan schreiben", key: "T", Icon: StickyNote },
    ],
  },
];

export function DrawingTools() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const netDrawing = useHud((s) => s.netDrawing);
  const effectiveTool: Tool = netDrawing ? "wire" : tool;

  return (
    <div className="flex items-center gap-2.5" role="toolbar" aria-label="Zeichenwerkzeuge">
      {TOOL_CAPSULES.map((capsule) => (
        <div
          key={capsule.id}
          className="flex items-center rounded-lg border p-0.5"
          style={{
            background: "color-mix(in srgb, var(--bg) 70%, var(--panel))",
            borderColor: "var(--border-strong)",
          }}
        >
          {capsule.items.map(({ tool: t, label, key, Icon }, idx) => {
            const active = effectiveTool === t;
            return (
              <div key={t} className="flex items-center">
                {idx > 0 && (
                  <div
                    className="mx-0.5 h-4 w-px shrink-0"
                    style={{ background: "var(--border)" }}
                  />
                )}
                <button
                  type="button"
                  className="grid h-7 w-9 shrink-0 place-items-center rounded-md border transition-colors"
                  style={{
                    background: active ? "var(--tool-active-bg)" : "transparent",
                    color: active ? "var(--tool-active-text)" : "var(--text)",
                    borderColor: active ? "var(--tool-active-border)" : "transparent",
                    boxShadow: active
                      ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)"
                      : "none",
                  }}
                  title={key ? `${label} (${key})` : label}
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => {
                    useHud.getState().cancelNetDrawing();
                    setTool(t);
                  }}
                >
                  <Icon size={15} />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default DrawingTools;
