"use client";

/**
 * W68 (Runde 26) / W73 (Runde 27): Zeichenwerkzeuge in der Kopfleiste.
 *
 * Neben den Bauteilen und Probes sitzen die sechs Zeichenwerkzeuge: Auswahl,
 * Stift (Netz zeichnen), Knotenpunkt, Netzname, Notiz und Löschen. Der aktive
 * Werkzeugknopf wird im warmen Bernstein-/Amber-Akzent (`--wire-sel`)
 * hervorgehoben; während aktiv ein Netz gezeichnet wird (`netDrawing`),
 * leuchtet immer der Stift – und ein Klick auf „Auswahl" bricht das laufende
 * Netz sofort ab.
 */
import { Move, Pencil, Eraser, Network, Tag, StickyNote } from "lucide-react";
import { useEditor, useHud, type Tool } from "@/state/editor";

const GROUPS: Array<Array<{ tool: Tool; label: string; key?: string; Icon: typeof Move }>> = [
  [
    { tool: "select", label: "Auswahl", key: "V / Esc", Icon: Move },
    { tool: "wire", label: "Stift – Netz zeichnen: Pin anklicken, Ecken setzen, Pin/Leitung anklicken (Doppelklick beendet frei)", key: "W", Icon: Pencil },
    { tool: "junction", label: "Knotenpunkt setzen/entfernen – auf eine Kreuzung zweier Leitungen klicken", key: "J", Icon: Network },
  ],
  [
    { tool: "label", label: "Netzname setzen", key: "L", Icon: Tag },
    { tool: "text", label: "Notiz schreiben", key: "T", Icon: StickyNote },
    { tool: "erase", label: "Löschen", key: "E", Icon: Eraser },
  ],
];

export function DrawingTools() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const netDrawing = useHud((s) => s.netDrawing);
  const effectiveTool: Tool = netDrawing ? "wire" : tool;

  return (
    <>
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {gi > 0 && <div className="mx-1 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />}
          {group.map(({ tool: t, label, key, Icon }) => {
            const active = effectiveTool === t;
            return (
              <button
                key={t}
                className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border transition-colors"
                style={{
                  background: active ? "var(--tool-active-bg)" : "var(--panel-2)",
                  color: active ? "var(--tool-active-text)" : "var(--text)",
                  borderColor: active ? "var(--tool-active-border)" : "var(--border)",
                  boxShadow: active ? "inset 0 0 0 1px color-mix(in srgb, var(--wire-sel) 35%, transparent)" : "none",
                }}
                title={key ? `${label} (${key})` : label}
                aria-label={label}
                aria-pressed={active}
                onClick={() => {
                  useHud.getState().cancelNetDrawing();
                  setTool(t);
                }}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default DrawingTools;
