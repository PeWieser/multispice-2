"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import type { TextNote } from "@/lib/schematic/model";
import { htmlToMarkup, markupToHtml } from "@/lib/notes/markup";

/**
 * S5.22: Notiz-Direkteditor — man schreibt auf dem Zettel selbst (kein
 * separates Eingabefeld). Die B/I/U-Leiste existiert nur während des
 * Editierens. Esc oder Cmd/Ctrl+Enter oder Klick daneben übernimmt.
 */
export default function NoteEditor({
  note,
  rect,
  fontPx,
  isNew,
  onCommit,
}: {
  note: TextNote;
  /** Kartenrechteck in Bildschirm-Pixeln. */
  rect: { x: number; y: number; w: number; h: number };
  fontPx: number;
  /** Neu angelegt: leerer Abbruch löscht die Notiz wieder. */
  isNew: boolean;
  onCommit: (markup: string | null, isNew: boolean) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [fmt, setFmt] = useState({ b: false, i: false, u: false });

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.innerHTML = markupToHtml(note.text);
    el.focus();
    // Alles wählen: Tippen ersetzt, Klick positioniert.
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(htmlToMarkup(cardRef.current?.innerHTML ?? ""), isNew);
  };

  const refreshFmt = () => {
    try {
      setFmt({
        b: document.queryCommandState("bold"),
        i: document.queryCommandState("italic"),
        u: document.queryCommandState("underline"),
      });
    } catch {}
  };

  const run = (cmd: "bold" | "italic" | "underline") => {
    cardRef.current?.focus();
    document.execCommand(cmd, false);
    refreshFmt();
  };

  const above = rect.y >= 64;
  const btn = (active: boolean) =>
    `grid h-7 w-7 place-items-center rounded-md transition-colors ${
      active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-3 hover:text-ink"
    }`;

  return (
    <div className="absolute z-floating" style={{ left: rect.x, top: rect.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center gap-0.5 rounded-lg border border-hairline-strong bg-surface px-1 py-0.5 shadow-2"
        style={{ position: "absolute", left: 0, top: above ? -36 : rect.h + 6 }}
        onMouseDown={(e) => e.preventDefault()}
        role="toolbar"
        aria-label="Textstil"
      >
        <button type="button" className={btn(fmt.b)} aria-label="Fett" title="Fett" onClick={() => run("bold")}>
          <Bold size={14} />
        </button>
        <button type="button" className={btn(fmt.i)} aria-label="Kursiv" title="Kursiv" onClick={() => run("italic")}>
          <Italic size={14} />
        </button>
        <button type="button" className={btn(fmt.u)} aria-label="Unterstrichen" title="Unterstrichen" onClick={() => run("underline")}>
          <Underline size={14} />
        </button>
      </div>
      <div
        ref={cardRef}
        contentEditable
        role="textbox"
        aria-label="Notiz bearbeiten"
        spellCheck={false}
        className="overflow-auto rounded-md border-[1.5px] border-selection bg-surface text-ink shadow-3 outline-none"
        style={{
          width: Math.max(rect.w, 120),
          height: Math.max(rect.h, 64),
          maxHeight: 240,
          fontSize: fontPx,
          lineHeight: 1.45,
          padding: "8px 10px 8px 14px",
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            commit();
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
          }
        }}
        onKeyUp={refreshFmt}
        onMouseUp={refreshFmt}
        onBlur={(e) => {
          if (e.relatedTarget && e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) return;
          commit();
        }}
        onPaste={(e) => {
          // Nur Text übernehmen (kein Word-HTML in den Zettel).
          e.preventDefault();
          const text = e.clipboardData?.getData("text/plain") ?? "";
          document.execCommand("insertText", false, text);
        }}
      />
    </div>
  );
}
