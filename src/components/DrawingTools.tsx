"use client";

/**
 * W68 (Runde 26): Zeichenwerkzeuge in der Kopfleiste.
 *
 * Neben den Bauteilen und Probes sitzen jetzt die Werkzeuge, mit denen man auf
 * der Fläche arbeitet: Auswahl, Stift (Netz zeichnen), Knotenpunkt, Netzname,
 * Notiz und Löschen. Der aktive Werkzeugknopf ist farbig hinterlegt, jedes
 * Symbol erklärt sich über den Tooltip.
 *
 * Der **Stift** entspricht dem bisherigen Leitungswerkzeug (`W`): damit darf
 * ein Netz auch auf freier Fläche beginnen. Der **Knotenpunkt** setzt bzw.
 * entfernt Verbindungspunkte (W61) – dort, wo sich zwei Leitungen treffen.
 */
import { Move, Pencil, Eraser, Network, Tag, StickyNote } from "lucide-react";
import { useEditor, type Tool } from "@/state/editor";

const GROUPS: Array<Array<{ tool: Tool; label: string; key?: string; Icon: typeof Move }>> = [
  [
    { tool: "select", label: "Auswahl", key: "Esc", Icon: Move },
    { tool: "wire", label: "Stift – Netz zeichnen: Pin anklicken, Ecken setzen, Pin/Leitung anklicken", key: "W", Icon: Pencil },
    { tool: "junction", label: "Knotenpunkt setzen/entfernen – auf eine Kreuzung zweier Leitungen klicken", Icon: Network },
  ],
  [
    { tool: "label", label: "Netzname setzen", key: "L", Icon: Tag },
    { tool: "text", label: "Notiz schreiben", key: "T", Icon: StickyNote },
    { tool: "erase", label: "Löschen", key: "E", Icon: Eraser },
  ],
];

export default function DrawingTools() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <>
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {gi > 0 && <div className="mx-1 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />}
          {group.map(({ tool: t, label, key, Icon }) => {
            const active = tool === t;
            return (
              <button
                key={t}
                className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border transition-colors"
                style={{
                  background: active ? "var(--accent)" : "var(--panel-2)",
                  color: active ? "var(--accent-contrast)" : "var(--text)",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                }}
                title={key ? `${label} (${key})` : label}
                aria-label={label}
                aria-pressed={active}
                onClick={() => setTool(t)}
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
