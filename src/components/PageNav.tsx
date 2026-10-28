"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, X } from "lucide-react";
import { offpageGroups } from "@/lib/schematic/model";
import { useEditor } from "@/state/editor";

/**
 * Seiten-Navigator (Blätter Stufe B) am rechten Rand der Entwurfs-Tabs:
 * eine Seite → dezentes „+ Seite"; mehrere → Dropdown mit Wechsel,
 * Umbenennen, Löschen und Off-Page-Sprungmarken (Chip → Gegenstelle).
 */
export default function PageNav() {
  const doc = useEditor((s) => s.doc);
  const addPage = useEditor((s) => s.addPage);
  const openPage = useEditor((s) => s.openPage);
  const renamePage = useEditor((s) => s.renamePage);
  const deletePage = useEditor((s) => s.deletePage);

  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ right: number; top: number }>({ right: 8, top: 40 });

  const pages = doc.pages && doc.pages.length ? doc.pages : null;
  const multi = !!pages && pages.length > 1;
  const activeIdx = pages ? Math.max(0, pages.findIndex((p) => p.id === doc.activePageId)) : 0;
  const groups = multi ? offpageGroups(doc) : [];
  const netsOf = (pageId: string) => groups.filter((g) => g.hits.some((h) => h.pageId === pageId));

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setRenamingId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 4 });
    setRenamingId(null);
    setOpen(true);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const v = renameValue.trim();
    setRenamingId(null);
    if (v) renamePage(renamingId, v);
  };

  // Eine Seite: nur dezenter Zuwachs (der Rest erklärt sich bei Bedarf selbst).
  if (!multi) {
    return (
      <button
        type="button"
        className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-ink-3 transition-colors hover:text-ink"
        title="Neue Seite anlegen (Seitenverbinder tragen Netze über Seitengrenzen)"
        aria-label="Neue Seite"
        onClick={() => addPage()}
      >
        <Plus size={13} />
        <span>Seite</span>
      </button>
    );
  }

  const pg = pages!;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-hairline bg-surface-2 px-2.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
        title="Seite wechseln (Seiten verwalten)"
        aria-label="Seite wechseln"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>
          Seite {activeIdx + 1}/{pg.length}
        </span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-modal" onClick={() => setOpen(false)} />
          <div
            className="fixed z-modal w-[300px] rounded-lg border border-hairline bg-surface p-1 shadow-xl"
            style={{ right: menuPos.right, top: menuPos.top }}
            role="menu"
            aria-label="Seiten"
          >
            {pg.map((p, i) => {
              const active = p.id === doc.activePageId;
              const nets = netsOf(p.id);
              const renaming = renamingId === p.id;
              return (
                <div
                  key={p.id}
                  className="rounded-md px-1.5 py-1 tree-row"
                  style={active ? { background: "var(--tool-active-bg)" } : undefined}
                >
                  <div className="flex items-center gap-1">
                    {renaming ? (
                      <input
                        ref={renameRef}
                        className="h-6 min-w-0 flex-1 rounded border border-hairline bg-surface px-1.5 text-xs text-ink outline-none"
                        value={renameValue}
                        aria-label="Seite umbenennen"
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
                        role="menuitemradio"
                        aria-checked={active}
                        aria-label={`Seite ${p.name} öffnen`}
                        className="min-w-0 flex-1 truncate text-left text-xs font-medium text-ink"
                        onClick={() => {
                          setOpen(false);
                          openPage(p.id);
                        }}
                        onDoubleClick={() => {
                          setRenamingId(p.id);
                          setRenameValue(p.name);
                        }}
                        title={active ? `${p.name} (aktiv) — Doppelklick benennt um` : `${p.name} öffnen (Seite ${i + 1})`}
                      >
                        {i + 1} · {p.name}
                        {active ? " ✓" : ""}
                      </button>
                    )}
                    <button
                      type="button"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 hover:text-ink"
                      title="Seite umbenennen"
                      aria-label={`Seite ${p.name} umbenennen`}
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 hover:text-err"
                      title="Seite löschen"
                      aria-label={`Seite ${p.name} löschen`}
                      onClick={() => {
                        deletePage(p.id);
                        if (pg.length <= 2) setOpen(false);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {nets.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 pb-0.5 pl-1">
                      {nets.map((g) => {
                        const partners = g.hits.filter((h) => h.pageId !== p.id);
                        const target = partners[0];
                        return (
                          <button
                            key={g.upper}
                            type="button"
                            disabled={!target}
                            className="rounded border border-hairline px-1.5 py-px font-mono text-2xs text-ink-2 hover:text-ink disabled:opacity-50"
                            title={
                              target
                                ? `${g.display}: Gegenstelle auf ${target.pageName} anspringen`
                                : `${g.display}: kein Gegenstück auf anderer Seite`
                            }
                            aria-label={
                              target
                                ? `${g.display}: zu ${target.pageName} springen`
                                : `${g.display}: ohne Gegenstück`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (target) {
                                setOpen(false);
                                openPage(target.pageId);
                              }
                            }}
                          >
                            ⤴ {g.display}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mt-1 border-t border-hairline pt-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
                aria-label="Neue Seite"
                onClick={() => {
                  setOpen(false);
                  addPage();
                }}
              >
                <Plus size={13} /> Neue Seite
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
