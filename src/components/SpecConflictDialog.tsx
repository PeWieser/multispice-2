"use client";

import { Dialog, Button } from "./ui";
import { useEditor } from "@/state/editor";

/**
 * S6.4 (Phase 4): Dasselbe eigene Bauteil existiert in zwei Fassungen
 * (Projekt/Import vs. Bibliothek) — der Nutzer entscheidet pro Konflikt.
 * Schließen ohne Entscheidung behält überall die Bibliotheks-Fassung.
 */
export default function SpecConflictDialog() {
  const conflicts = useEditor((s) => s.partEditor.specConflicts);
  if (conflicts.length === 0) return null;
  const st = useEditor.getState();
  const incomingLabel = (source: "project" | "import") => (source === "project" ? "Projekt-Fassung" : "Import-Fassung");

  return (
    <Dialog
      title="Bauteil-Fassungen unterscheiden sich"
      subtitle="Diese Bauteile gibt es in deiner Bibliothek anders als im Projekt bzw. in der Datei. Welche Fassung soll gelten?"
      onClose={() => st.dismissSpecConflicts()}
      actions={
        <Button size="sm" variant="ghost" onClick={() => st.dismissSpecConflicts()}>
          Schließen (Bibliothek behalten)
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {conflicts.map((c) => (
          <div key={c.id} className="rounded-lg border border-hairline bg-surface-2 p-3">
            <div className="truncate text-xs font-medium">{c.name}</div>
            <div className="mono mt-0.5 truncate text-2xs text-ink-3">{c.id}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => st.resolveSpecConflict(c.id, "incoming")}>
                {incomingLabel(c.source)} übernehmen
              </Button>
              <Button size="sm" variant="secondary" onClick={() => st.resolveSpecConflict(c.id, "library")}>
                Bibliotheks-Fassung behalten
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
