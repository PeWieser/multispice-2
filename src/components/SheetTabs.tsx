"use client";

/**
 * W72 (Runde 26): Dateileiste unten.
 *
 * Die geöffneten Schaltblätter stehen als Reiter in der unteren Leiste:
 * Klick wechselt das Blatt, `+` legt ein neues an, `×` schließt es.
 * Der Reiter des aktuellen Blattes trägt dessen Namen (auch nach dem
 * Umbenennen im Inspector).
 *
 * Noch offen (bewusst): Blätter liegen im Arbeitsspeicher, das Auto-Save
 * schreibt weiterhin das aktive Blatt; Reiter überleben den Neustart deshalb
 * nicht. Der Weg dorthin ist mit dieser Struktur vorbereitet.
 */
import { Plus, X } from "lucide-react";
import { sheets, useEditor } from "@/state/editor";

export default function SheetTabs() {
  const docId = useEditor((s) => s.doc.id);
  const docName = useEditor((s) => s.doc.name);
  const newDocument = useEditor((s) => s.newDocument);
  const openSheet = useEditor((s) => s.openSheet);
  const renameSheet = useEditor((s) => s.renameSheet);
  const log = useEditor((s) => s.log);

  // Das aktuelle Blatt steht immer in der Liste (auch vor dem ersten Anlegen).
  const current = sheets.find((s) => s.id === docId) ?? { id: docId, name: docName, doc: null as never };
  const list = sheets.some((s) => s.id === docId) ? sheets : [current, ...sheets];
  const benannt = (id: string, name: string) => (id === docId ? docName || name : name);

  return (
    <div
      className="flex h-[30px] shrink-0 items-center gap-1 overflow-x-auto px-2"
      style={{ background: "var(--panel)", borderTop: "1px solid var(--border)" }}
      role="tablist"
      aria-label="Geöffnete Schaltblätter"
    >
      <button
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border"
        style={{ background: "var(--panel-2)", borderColor: "var(--border)", color: "var(--text-dim)" }}
        title="Neues Schaltblatt"
        aria-label="Neues Schaltblatt"
        onClick={() => newDocument()}
      >
        <Plus size={13} />
      </button>

      <div className="mx-1 h-4 w-px shrink-0" style={{ background: "var(--border)" }} />

      {list.map((s) => {
        const active = s.id === docId;
        const name = benannt(s.id, s.name);
        return (
          <div
            key={s.id}
            className="group flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px]"
            style={{
              background: active ? "var(--accent-soft)" : "var(--panel-2)",
              borderColor: active ? "var(--accent-mid)" : "var(--border)",
              color: active ? "var(--accent)" : "var(--text-dim)",
            }}
          >
            <button
              className="max-w-[160px] truncate font-medium"
              title={name}
              role="tab"
              aria-selected={active}
              onClick={() => openSheet(s.id)}
            >
              {name || "Unbenannt"}
            </button>
            <button
              className="grid h-4 w-4 place-items-center rounded opacity-60 hover:opacity-100"
              title="Blatt schließen (bleibt im Auto-Save erhalten)"
              aria-label={`Blatt ${name} schließen`}
              onClick={() => {
                if (sheets.length <= 1) {
                  log("warn", "Das letzte Blatt bleibt offen – lege erst ein neues an (＋)");
                  return;
                }
                const idx = sheets.findIndex((s2) => s2.id === s.id);
                if (idx < 0) return;
                // Namen des offenen Blattes sichern, dann Reiter entfernen.
                if (s.id === docId) renameSheet(s.id, name);
                sheets.splice(idx, 1);
                if (active) {
                  const next = sheets[Math.min(idx, sheets.length - 1)];
                  if (next) openSheet(next.id);
                }
              }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
