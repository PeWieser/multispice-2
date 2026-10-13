"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Pencil, Plus, X } from "lucide-react";
import { sheets, useEditor } from "@/state/editor";
import { adaptShortcut, useIsApple } from "@/lib/platform";

/**
 * Entwurfs-Reiterleiste über dem Canvas (Stufe A): sichtbare Tabs statt
 * Fußleisten-Versteck. Neu (+), wechseln (Klick), umbenennen (Doppelklick),
 * duplizieren/schließen (Kontextmenü/×), sortieren (Drag & Drop).
 */
export default function SheetTabs() {
  const apple = useIsApple();
  const docId = useEditor((s) => s.doc.id);
  const docName = useEditor((s) => s.doc.name);
  const newDocument = useEditor((s) => s.newDocument);
  const openSheet = useEditor((s) => s.openSheet);
  const renameSheet = useEditor((s) => s.renameSheet);
  const reorderSheets = useEditor((s) => s.reorderSheets);
  const closeSheet = useEditor((s) => s.closeSheet);
  const duplicateSheet = useEditor((s) => s.duplicateSheet);
  const log = useEditor((s) => s.log);
  const locked = useEditor((s) => s.teacher.locked);
  const editorOpen = useEditor((s) => s.partEditor.open);
  const tick = useEditor((s) => s.sim.tick);
  void tick;

  const [dragSheetId, setDragSheetId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  // Geöffnete Entwürfe (der aktuelle Entwurf steht immer in der Liste).
  const current = sheets.find((s) => s.id === docId) ?? { id: docId, name: docName, doc: null as never };
  const list = sheets.some((s) => s.id === docId) ? sheets : [current, ...sheets];
  const benannt = (id: string, name: string) => (id === docId ? docName || name : name);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);

  const commitRename = () => {
    if (!renamingId) return;
    const v = renameValue.trim();
    setRenamingId(null);
    if (!v) return;
    if (locked || editorOpen) {
      log("warn", locked ? "Lehrer-Modus: Plan ist gesperrt." : "Schließe erst den Bauteile-Editor.");
      return;
    }
    renameSheet(renamingId, v);
    if (renamingId === docId) {
      useEditor.setState((s) => ({ doc: { ...s.doc, name: v } }));
    }
  };

  const startRename = (id: string, name: string) => {
    setCtx(null);
    setRenamingId(id);
    setRenameValue(name);
  };

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline bg-surface px-2 no-scrollbar"
      role="tablist"
      aria-label="Entwürfe"
    >
      <button
        type="button"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-2.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
        title={adaptShortcut("Neuer Entwurf (⌘⌥N)", apple)}
        aria-label="Neuer Entwurf"
        onClick={() => newDocument()}
      >
        <Plus size={14} />
        <span>Neuer Entwurf</span>
      </button>

      <div className="mx-1 h-5 w-px shrink-0 bg-hairline" />

      {list.map((s) => {
        const active = s.id === docId;
        const isDragged = dragSheetId === s.id;
        const isDragOver = dragOverId === s.id && dragSheetId !== s.id;
        const name = benannt(s.id, s.name);
        const renaming = renamingId === s.id;
        return (
          <div
            key={s.id}
            data-sheet-id={s.id}
            draggable={!renaming}
            onDragStart={(e) => {
              setDragSheetId(s.id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", s.id);
              } catch {}
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragSheetId && dragSheetId !== s.id) {
                setDragOverId(s.id);
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
              setDragOverId(null);
            }}
            onDragEnd={() => {
              setDragSheetId(null);
              setDragOverId(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtx({ x: e.clientX, y: e.clientY, id: s.id });
            }}
            className="group flex h-7 shrink-0 select-none items-center gap-1 rounded-md border px-2 text-xs transition-colors"
            style={{
              background: active ? "var(--tool-active-bg)" : "transparent",
              borderColor: isDragOver
                ? "var(--wire-sel)"
                : active
                  ? "var(--tool-active-border)"
                  : "transparent",
              color: active ? "var(--tool-active-text)" : "var(--ink-2)",
              opacity: isDragged ? 0.55 : 1,
              cursor: renaming ? "text" : "grab",
            }}
            title={active ? `${name} (aktiv)` : `${name} (öffnen, zum Verschieben ziehen)`}
          >
            {renaming ? (
              <input
                ref={renameRef}
                className="h-6 w-[140px] rounded border border-hairline bg-surface px-1.5 text-xs text-ink outline-none"
                value={renameValue}
                aria-label="Entwurf umbenennen"
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") setRenamingId(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                type="button"
                className="max-w-[160px] truncate font-medium"
                role="tab"
                aria-selected={active}
                aria-label={active ? `${name} (aktiv)` : `${name} öffnen`}
                onClick={() => openSheet(s.id)}
                onDoubleClick={() => startRename(s.id, name)}
              >
                {name || "Unbenannt"}
              </button>
            )}
            <button
              type="button"
              className="-m-1 grid h-6 w-6 place-items-center rounded opacity-60 hover:opacity-100"
              title="Entwurf schließen"
              aria-label={`Entwurf ${name} schließen`}
              onClick={(e) => {
                e.stopPropagation();
                closeSheet(s.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {ctx && (
        <>
          <div className="fixed inset-0 z-modal" onClick={() => setCtx(null)} onContextMenu={(e) => e.preventDefault()} />
          <div
            className="fixed z-modal min-w-[180px] rounded-lg border border-hairline bg-surface p-1 shadow-xl"
            style={{ left: Math.min(ctx.x, window.innerWidth - 196), top: ctx.y + 4 }}
            role="menu"
            aria-label="Entwurf-Aktionen"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
              onClick={() => {
                const s = list.find((l) => l.id === ctx.id);
                if (s) startRename(s.id, benannt(s.id, s.name));
              }}
            >
              <Pencil size={13} /> Umbenennen
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
              onClick={() => {
                setCtx(null);
                duplicateSheet(ctx.id);
              }}
            >
              <Copy size={13} /> Duplizieren
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
              onClick={() => {
                setCtx(null);
                closeSheet(ctx.id);
              }}
            >
              <X size={13} /> Schließen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
