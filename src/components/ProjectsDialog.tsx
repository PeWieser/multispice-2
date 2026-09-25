"use client";

import { useMemo, useState } from "react";
import { FolderOpen, Save, Pencil, Trash2, Clock } from "lucide-react";
import { Dialog } from "./ui";
import {
  deleteProjectSlot,
  listProjectSlots,
  renameProjectSlot,
  saveProjectSlot,
  type ProjectSlot,
} from "@/lib/storage";
import { useEditor } from "@/state/editor";

function stamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function sizeOf(slot: ProjectSlot): string {
  try {
    return `${(JSON.stringify(slot.doc).length / 1024).toFixed(1)} KB`;
  } catch {
    return "—";
  }
}

export default function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version ist bewusster Refresh-Takt nach Speicheraktionen
  const slots = useMemo(() => listProjectSlots(), [version]);
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState;

  const refresh = () => setVersion((v) => v + 1);

  const saveAs = () => {
    const name = newName.trim() || doc.name || "Unbenannt";
    const { ok } = saveProjectSlot(name, doc);
    st().log(ok ? "ok" : "error", ok ? `Projekt „${name}“ gespeichert` : "Speichern fehlgeschlagen (Speicher voll?)");
    setNewName("");
    refresh();
  };

  const open = (slot: ProjectSlot) => {
    st().setDoc(JSON.parse(JSON.stringify(slot.doc)) as typeof doc, false);
    st().log("ok", `Projekt „${slot.name}“ geöffnet (${stamp(slot.savedAt)})`);
    onClose();
  };

  return (
    <Dialog
      title="Projekte"
      subtitle="Benannte Snapshots im Browser – die Arbeitskopie speichert zusätzlich automatisch"
      onClose={onClose}
      wide
      actions={
        <button className="btn btn-primary" onClick={onClose}>
          Schließen
        </button>
      }
    >
      <div className="flex gap-2 mb-4">
        <input
          className="input h-8 flex-1 text-[12px]"
          placeholder={`Name für aktuellen Stand (z. B. ${doc.name || "Verstärker V2"})`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveAs()}
        />
        <button className="btn btn-primary h-8 px-3 text-[11.5px]" onClick={saveAs}>
          <Save size={12} /> Aktuellen Stand speichern
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-xl p-6 text-center text-[12px] text-mute" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
          <FolderOpen size={18} className="mx-auto mb-2 opacity-60" />
          Noch keine gespeicherten Projekte.
          <br />
          Der aktuelle Stand liegt trotzdem sicher in der Auto-Save-Arbeitskopie.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {slots.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
              <div className="min-w-0 flex-1">
                {editing === s.id ? (
                  <input
                    className="input h-7 w-full text-[12px]"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        renameProjectSlot(s.id, editName.trim() || s.name);
                        setEditing(null);
                        refresh();
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="truncate text-[12.5px] font-medium">{s.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-mute">
                      <Clock size={10} /> {stamp(s.savedAt)} · {s.doc.instances.length} Bauteile · {sizeOf(s)}
                    </div>
                  </>
                )}
              </div>
              <button className="btn h-7 px-2.5 text-[11px]" onClick={() => open(s)} title="Projekt öffnen (ersetzt aktuellen Plan, Undo möglich)">
                <FolderOpen size={12} /> Öffnen
              </button>
              <button
                className="btn h-7 w-7 p-0"
                title="Umbenennen"
                onClick={() => {
                  setEditing(s.id);
                  setEditName(s.name);
                }}
              >
                <Pencil size={12} />
              </button>
              {confirmDel === s.id ? (
                <button
                  className="btn h-7 px-2.5 text-[11px]"
                  style={{ background: "var(--err)", color: "white", borderColor: "var(--err)" }}
                  onClick={() => {
                    deleteProjectSlot(s.id);
                    setConfirmDel(null);
                    st().log("info", `Projekt „${s.name}“ gelöscht`);
                    refresh();
                  }}
                >
                  Wirklich?
                </button>
              ) : (
                <button className="btn h-7 w-7 p-0" title="Löschen" onClick={() => setConfirmDel(s.id)}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-[10.5px] leading-relaxed text-mute">
        Hinweis: „Öffnen“ ersetzt den aktuellen Plan – der vorherige Stand bleibt über Undo (⌘Z) und die
        Auto-Save-Arbeitskopie erreichbar, bis du weiterarbeitest.
      </div>
    </Dialog>
  );
}
