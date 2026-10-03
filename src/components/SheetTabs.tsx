"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { sheets, useEditor } from "@/state/editor";

export default function SheetTabs() {
  const docId = useEditor((s) => s.doc.id);
  const docName = useEditor((s) => s.doc.name);
  const newDocument = useEditor((s) => s.newDocument);
  const openSheet = useEditor((s) => s.openSheet);
  const renameSheet = useEditor((s) => s.renameSheet);
  const reorderSheets = useEditor((s) => s.reorderSheets);
  const log = useEditor((s) => s.log);
  const tick = useEditor((s) => s.sim.tick);
  void tick;

  const [dragSheetId, setDragSheetId] = useState<string | null>(null);

  const current = sheets.find((s) => s.id === docId) ?? { id: docId, name: docName, doc: null as never };
  const list = sheets.some((s) => s.id === docId) ? sheets : [current, ...sheets];
  const benannt = (id: string, name: string) => (id === docId ? docName || name : name);

  return (
    <div
      className="flex h-[30px] shrink-0 items-center gap-1 overflow-x-auto px-2 bg-surface border-t border-hairline"
      role="tablist"
      aria-label="Geöffnete Schaltblätter"
    >
      <button
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border bg-surface-2 border-hairline text-ink-2"
        title="Neues Schaltblatt"
        aria-label="Neues Schaltblatt"
        onClick={() => newDocument()}
      >
        <Plus size={13} />
      </button>

      <div className="mx-1 h-4 w-px shrink-0 bg-hairline" />

      {list.map((s) => {
        const active = s.id === docId;
        const name = benannt(s.id, s.name);
        return (
          <div
            key={s.id}
            data-sheet-id={s.id}
            draggable
            onDragStart={(e) => {
              setDragSheetId(s.id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", s.id);
              } catch {}
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragSheetId && dragSheetId !== s.id) {
                reorderSheets(dragSheetId, s.id);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragSheetId || e.dataTransfer.getData("text/plain");
              if (from && from !== s.id) {
                reorderSheets(from, s.id);
              }
              setDragSheetId(null);
            }}
            onDragEnd={() => setDragSheetId(null)}
            onTouchStart={() => setDragSheetId(s.id)}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (!t) return;
              const el = document.elementFromPoint(t.clientX, t.clientY)?.closest("[data-sheet-id]");
              const targetId = el?.getAttribute("data-sheet-id");
              if (targetId && targetId !== s.id) {
                reorderSheets(s.id, targetId);
              }
            }}
            onTouchEnd={() => setDragSheetId(null)}
            className="group flex h-6 shrink-0 cursor-grab active:cursor-grabbing select-none items-center gap-1 rounded-md border px-2 text-2xs"
            style={{
              background: active ? "var(--tool-active-bg)" : "var(--surface-2)",
              borderColor: active ? "var(--tool-active-border)" : "var(--hairline)",
              color: active ? "var(--tool-active-text)" : "var(--ink-2)",
            }}
          >
            <button
              className="max-w-[160px] truncate font-medium cursor-grab active:cursor-grabbing"
              title={name}
              role="tab"
              aria-selected={active}
              onClick={() => openSheet(s.id)}
            >
              {name || "Unbenannt"}
            </button>
            <button
              className="grid h-4 w-4 place-items-center rounded opacity-60 hover:opacity-100"
              title="Blatt schließen"
              aria-label={`Blatt ${name} schließen`}
              onClick={() => {
                if (sheets.length <= 1) {
                  log("warn", "Das letzte Blatt bleibt offen – lege erst ein neues an (＋)");
                  return;
                }
                const idx = sheets.findIndex((s2) => s2.id === s.id);
                if (idx < 0) return;
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
