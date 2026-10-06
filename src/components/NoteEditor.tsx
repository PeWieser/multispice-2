"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import type { TextNote } from "@/lib/schematic/model";
import {
  NOTE_FONT_STACK,
  NOTE_FONT_STEPS,
  htmlToMarkup,
  markupToHtml,
  nearestFontStep,
  noteEditorPadSide,
  noteEditorPadTop,
  noteLineH,
} from "@/lib/notes/markup";
import { canvasColor } from "@/lib/canvas-theme";

/**
 * S5.22: Notiz-Direkteditor — man schreibt auf dem Zettel selbst (kein
 * separates Eingabefeld). S5.23: Zetteloptik wie auf dem Canvas (Einheitskarte,
 * innen scrollbar) + Schriftgröße in drei Stufen. S5.27: pixelgleich mit der
 * Ansicht (eine Metrik-Quelle), keine Alles-Auswahl beim Öffnen (Klickstelle,
 * sonst ans Ende), Unmount committed (kein Verlust beim Zettelwechsel).
 * Esc oder Cmd/Ctrl+Enter oder Klick daneben übernimmt.
 */
export default function NoteEditor({
  note,
  rect,
  fontStep,
  zoom,
  viewport,
  isNew,
  onCommit,
  selected,
  caret,
  scroll,
}: {
  note: TextNote;
  /** Kartenrechteck in Bildschirm-Pixeln (Einheitskarte, fest). */
  rect: { x: number; y: number; w: number; h: number };
  /** Schriftstufe in Welt-px (9/12/16). */
  fontStep: number;
  zoom: number;
  /** Sichtfläche in Bildschirm-Pixeln (für die Leistenposition). */
  viewport: { w: number; h: number };
  /** Neu angelegt: leerer Abbruch löscht die Notiz wieder. */
  isNew: boolean;
  onCommit: (markup: string | null, isNew: boolean, size: number) => void;
  /** S5.27: Zettel ist ausgewählt (Kontur wie in der Ansicht). */
  selected: boolean;
  /** S5.27: Klickposition in Viewport-px (Caret dorthin) oder null (ans Ende). */
  caret: { x: number; y: number } | null;
  /** S5.27: Scrollstand der Ansicht in Welt-px (wird übernommen). */
  scroll: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [fmt, setFmt] = useState({ b: false, i: false, u: false });
  const [size, setSize] = useState(() => nearestFontStep(fontStep));
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  });

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(htmlToMarkup(cardRef.current?.innerHTML ?? ""), isNew, sizeRef.current);
  };

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.innerHTML = markupToHtml(note.text);
    // S5.27: Scrollstand übernehmen — außer der Klick bestimmt die Position
    // (der Browser scrollt dann selbst zum Caret).
    if (!caret) el.scrollTop = scroll * zoom;
    el.focus({ preventScroll: true });
    // S5.27: Keine Alles-Auswahl mehr (ein Tastenschlag löschte sonst alles):
    // an die Klickstelle, sonst ans Ende.
    try {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      let placed = false;
      if (caret && typeof document.caretRangeFromPoint === "function") {
        const r = document.caretRangeFromPoint(caret.x, caret.y);
        if (r && el.contains(r.startContainer)) {
          r.collapse(true);
          sel?.addRange(r);
          placed = true;
        }
      } else if (caret) {
        const cp = (
          document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
          }
        ).caretPositionFromPoint?.(caret.x, caret.y);
        if (cp && el.contains(cp.offsetNode)) {
          const r = document.createRange();
          r.setStart(cp.offsetNode, cp.offset);
          r.collapse(true);
          sel?.addRange(r);
          placed = true;
        }
      }
      if (!placed) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel?.addRange(range);
      }
    } catch {}
    // S5.27: Zettelwechsel ohne Esc/Blur committed statt zu verwerfen
    // (kein StrictMode im Projekt — kein doppelter Mount im Dev).
    return () => {
      commit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // S5.25: Die Leiste sitzt oben — außer dort ist kein Platz, aber unten schon.
  // (Fällt beides aus, bleibt sie oben und überlappt die Karte: sichtbar geht vor.)
  // Waagrecht wird sie in die Sichtfläche geschoben.
  const TOOLBAR_H = 40;
  const TOOLBAR_W = 208;
  const M = 8;
  const vw = viewport.w > 0 ? viewport.w : 800;
  const vh = viewport.h > 0 ? viewport.h : 600;
  const aboveFits = rect.y >= TOOLBAR_H + M;
  const belowFits = rect.y + rect.h + TOOLBAR_H + M <= vh;
  const placeAbove = aboveFits || !belowFits;
  const barLeft = Math.max(M - rect.x, Math.min(0, vw - rect.x - TOOLBAR_W - M));
  const btn = (active: boolean) =>
    `grid h-7 w-7 place-items-center rounded-md transition-colors ${
      active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-3 hover:text-ink"
    }`;
  const stepLabel = (s: number) => (s <= NOTE_FONT_STEPS[0] ? "klein" : s >= NOTE_FONT_STEPS[2] ? "groß" : "mittel");

  // S5.27: Kontur exakt wie die Ansicht (1/1.8 Welt-px); der Text beginnt dank
  // Border-Box + Metrik-Padding auf demselben Pixel wie auf dem Canvas.
  const borderW = (selected ? 1.8 : 1) * zoom;
  const shadowXY = 2 / Math.max(zoom, 0.4);
  const shadowBlur = 7 / Math.max(zoom, 0.4);

  return (
    <div className="absolute z-floating" style={{ left: rect.x, top: rect.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="flex items-center gap-0.5 rounded-lg border border-hairline-strong bg-surface px-1 py-0.5 shadow-2"
        style={{ position: "absolute", left: barLeft, top: placeAbove ? -TOOLBAR_H : rect.h + 6 }}
        onMouseDown={(e) => e.preventDefault()}
        role="toolbar"
        aria-label="Textstil und Schriftgröße"
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
        <div className="mx-1 h-4 w-px bg-hairline-strong" aria-hidden />
        {NOTE_FONT_STEPS.map((s) => (
          <button
            key={s}
            type="button"
            className={btn(size === s)}
            aria-label={`Schrift ${stepLabel(s)}`}
            aria-pressed={size === s}
            title={`Schrift ${stepLabel(s)}`}
            onClick={() => {
              setSize(s);
              cardRef.current?.focus();
            }}
          >
            <span style={{ fontSize: 9 + (s - 9) * 0.9, fontWeight: 700, lineHeight: 1 }}>A</span>
          </button>
        ))}
      </div>
      <div className="relative" style={{ width: rect.w, height: rect.h }}>
        <div
          ref={cardRef}
          contentEditable
          role="textbox"
          aria-label="Notiz bearbeiten"
          spellCheck={false}
          className="h-full w-full overflow-y-auto outline-none"
          style={{
            boxSizing: "border-box",
            background: "linear-gradient(180deg, #FFFADE 0%, #FFF6C4 55%, #FFEFA8 100%)",
            border: `${borderW}px solid ${selected ? canvasColor("--wire-sel") : "rgba(133, 100, 4, 0.42)"}`,
            borderRadius: 3 * zoom,
            boxShadow: `inset 0 ${Math.max(1, zoom)}px 0 rgba(255, 255, 255, 0.75), 0 ${shadowXY}px ${shadowBlur}px rgba(60, 40, 0, 0.28)`,
            color: "#3B2F04",
            fontFamily: NOTE_FONT_STACK,
            fontWeight: 500,
            fontSize: size * zoom,
            lineHeight: `${noteLineH(size) * zoom}px`,
            padding: `${noteEditorPadTop(size, zoom, borderW)}px ${noteEditorPadSide(zoom, borderW)}px`,
            textUnderlineOffset: `${2 * zoom}px`,
            textDecorationThickness: `${Math.max(1, Math.max(1, size / 11) * zoom)}px`,
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
            if (e.relatedTarget && e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget as Node)) return;
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
    </div>
  );
}
